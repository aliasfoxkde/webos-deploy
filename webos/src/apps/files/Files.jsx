import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { filePut, fileGet, fileDel, fileDelTree, fileList, dirPut } from '../../os/db.js';
import './files.css';

/* Files — a small virtual disk over IndexedDB plus a live "this device"
   browser (File System Access API, session-only). Everything under /Home
   persists across reloads; device files are read on demand until imported. */

const ROOT = '/Home';
const join = (dir, name) => `${dir === ROOT ? ROOT : dir}/${name}`.replace(/\/+/g, '/');
const base = (path) => path.slice(path.lastIndexOf('/') + 1);

const TEXT_EXT = /\.(txt|md|markdown|json|js|jsx|ts|tsx|css|html|htm|xml|svg|csv|log|toml|yaml|yml|ini|rs|py|sh)$/i;
const TEXT_CAP = 2_000_000; // don't slurp huge files as text

const fmtBytes = (n) => {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 / 1024).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
};

function kindOf(rec) {
  const type = rec.type || '';
  if (rec.dir) return 'dir';
  if (type.startsWith('image/')) return 'img';
  if (type.startsWith('video/')) return 'vid';
  if (type.startsWith('audio/')) return 'aud';
  if (type === 'application/pdf') return 'pdf';
  if (type.startsWith('text/') || TEXT_EXT.test(rec.name || base(rec.path))) return 'text';
  return 'bin';
}

/* Small stroke glyphs in the shell's icon family (currentColor). */
function Glyph({ kind }) {
  const common = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const art = {
    dir: <path d="M4 8.5c0-1.1.9-2 2-2h4l2 2.3h6c1.1 0 2 .9 2 2v6.7c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2z" {...common} />,
    img: (
      <>
        <rect x="4" y="5" width="16" height="14" rx="2" {...common} />
        <circle cx="9" cy="10" r="1.4" {...common} />
        <path d="M5.5 17l4.5-4.5 3.5 3.5 2.5-2.5 2.5 2.5" {...common} />
      </>
    ),
    vid: (
      <>
        <rect x="4" y="6" width="16" height="12" rx="2" {...common} />
        <path d="M10.5 9.5l4.5 2.5-4.5 2.5z" {...common} />
      </>
    ),
    aud: (
      <>
        <path d="M9 15.5V6.8l8-1.6v8.6" {...common} />
        <circle cx="7" cy="15.8" r="2" {...common} />
        <circle cx="15" cy="14" r="2" {...common} />
      </>
    ),
    pdf: (
      <>
        <path d="M6.5 4h7l4 4v12h-11z" {...common} />
        <path d="M13.5 4v4h4" {...common} />
      </>
    ),
    text: (
      <>
        <path d="M6.5 4h7l4 4v12h-11z" {...common} />
        <path d="M9 12h6M9 15h6M9 9h3" {...common} />
      </>
    ),
    bin: (
      <>
        <path d="M6.5 4h7l4 4v12h-11z" {...common} />
        <path d="M13.5 4v4h4" {...common} />
      </>
    ),
  };
  return (
    <svg viewBox="0 0 24 24" width="40" height="40" aria-hidden="true">{art[kind] || art.bin}</svg>
  );
}

export default function FilesApp() {
  const [cwd, setCwd] = useState(ROOT);
  const [tab, setTab] = useState('disk'); // 'disk' | 'device'
  const [all, setAll] = useState([]);
  const [usage, setUsage] = useState(null);
  const [preview, setPreview] = useState(null); // { rec, url? , text? }
  const [newDir, setNewDir] = useState(null); // '' while typing a folder name
  const [confirmDel, setConfirmDel] = useState(null); // folder path awaiting 2nd click
  const [dragOver, setDragOver] = useState(false);
  const [device, setDevice] = useState(null); // { root, name, path: [names], entries }
  const fileInput = useRef(null);
  const alive = useRef(true);
  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback(async () => {
    const list = (await fileList()).map(({ blob, ...meta }) => meta);
    if (!alive.current) return;
    setAll(list);
    navigator.storage?.estimate?.().then((u) => { if (alive.current) setUsage(u); }).catch(() => {});
  }, []);
  useEffect(() => { refresh(); }, [refresh]);

  /* Direct children of cwd: explicit dir markers plus any path prefix. */
  const kids = useMemo(() => {
    const prefix = cwd.endsWith('/') ? cwd : `${cwd}/`;
    const dirs = new Map();
    const files = [];
    for (const rec of all) {
      if (!rec.path.startsWith(prefix)) continue;
      const rel = rec.path.slice(prefix.length);
      if (!rel) continue;
      const slash = rel.indexOf('/');
      if (rec.dir) { if (slash < 0) dirs.set(rel, true); continue; }
      if (slash >= 0) dirs.set(rel.slice(0, slash), true);
      else files.push(rec);
    }
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { dirs: [...dirs.keys()].sort(), files };
  }, [all, cwd]);

  const openBlob = (rec, blob) => {
    const kind = kindOf(rec);
    if (kind === 'text' && blob.size <= TEXT_CAP) {
      blob.slice(0, TEXT_CAP).text().then((text) => setPreview({ rec, text }));
    } else {
      const url = URL.createObjectURL(blob);
      setPreview({ rec, url, kind, raw: blob });
    }
  };

  const openFile = async (rec) => {
    const full = await fileGet(rec.path);
    if (full) openBlob({ ...rec, name: rec.name || base(rec.path) }, full.blob);
  };

  const upload = async (files) => {
    for (const f of files) await filePut(join(cwd, f.name), f);
    await refresh();
  };

  const download = async (rec) => {
    const full = await fileGet(rec.path);
    if (!full) return;
    const url = URL.createObjectURL(full.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = rec.name || base(rec.path);
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  };

  const remove = async (rec) => {
    if (rec.dir) {
      // Folders delete recursively — first click arms a short confirm window.
      if (confirmDel !== rec.path) {
        setConfirmDel(rec.path);
        setTimeout(() => setConfirmDel((c) => (c === rec.path ? null : c)), 3000);
        return;
      }
      setConfirmDel(null);
      await fileDelTree(rec.path);
    } else {
      await fileDel(rec.path);
      setPreview((p) => (p?.rec.path === rec.path ? null : p));
    }
    await refresh();
  };

  /* ---- This device (File System Access API — session-only) ---- */
  const hasFsApi = typeof window.showDirectoryPicker === 'function';
  const readDir = async (handle) => {
    const out = [];
    for await (const [name, h] of handle.entries()) {
      if (h.kind === 'file') {
        const f = await h.getFile();
        out.push({ name, kind: 'file', size: f.size, type: f.type, handle: h });
      } else {
        out.push({ name, kind: 'directory', handle: h });
      }
    }
    out.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'directory' ? -1 : 1));
    return out;
  };
  const pickDevice = async () => {
    try {
      const root = await window.showDirectoryPicker();
      setDevice({ root, name: root.name, path: [], entries: await readDir(root) });
    } catch { /* cancelled */ }
  };
  const devWalk = async (path) => {
    let h = device.root;
    for (const seg of path) h = await h.getDirectoryHandle(seg);
    return h;
  };
  const devOpen = async (entry) => {
    if (entry.kind === 'directory') {
      const path = [...device.path, entry.name];
      setDevice({ ...device, path, entries: await readDir(entry.handle) });
      return;
    }
    const f = await entry.handle.getFile();
    openBlob({ name: entry.name, type: f.type, size: f.size, device: true }, f);
  };
  const devUp = async () => {
    const path = device.path.slice(0, -1);
    setDevice({ ...device, path, entries: await readDir(await devWalk(path)) });
  };
  const devImport = async (entry) => {
    const f = await entry.handle.getFile();
    await filePut(join(cwd, f.name), f);
    await refresh();
    setTab('disk');
  };

  const crumbs = cwd === ROOT ? [] : cwd.slice(ROOT.length + 1).split('/');
  const createDir = () => {
    const name = newDir.trim();
    if (name) dirPut(join(cwd, name)).then(refresh);
    setNewDir(null);
  };
  const devHasFs = device && hasFsApi;

  return (
    <div
      className={`files ${dragOver ? 'drop' : ''}`}
      onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => { e.preventDefault(); setDragOver(false); if (e.dataTransfer?.files?.length) upload([...e.dataTransfer.files]); }}
    >
      <header className="f-bar">
        <div className="f-tabs" role="tablist">
          <button className={tab === 'disk' ? 'on' : ''} onClick={() => setTab('disk')}>WebOS disk</button>
          <button className={tab === 'device' ? 'on' : ''} onClick={() => setTab('device')}>This device</button>
        </div>
        <span className="f-spring" />
        {tab === 'disk' && (
          <>
            <button className="f-btn" disabled={cwd === ROOT} onClick={() => setCwd(cwd.slice(0, cwd.lastIndexOf('/')) || ROOT)} title="Up one folder">↑</button>
            <button className="f-btn" onClick={() => setNewDir('')}>New folder</button>
            <button className="f-btn primary" onClick={() => fileInput.current?.click()}>Upload</button>
            <input ref={fileInput} type="file" multiple hidden onChange={(e) => { if (e.target.files?.length) upload([...e.target.files]); e.target.value = ''; }} />
          </>
        )}
      </header>

      {tab === 'disk' && (
        <>
          <nav className="f-crumbs" aria-label="Location">
            <button className={cwd === ROOT ? 'on' : ''} onClick={() => setCwd(ROOT)}>Home</button>
            {crumbs.map((seg, i) => (
              <button key={seg + i} className={i === crumbs.length - 1 ? 'on' : ''} onClick={() => setCwd(`${ROOT}/${crumbs.slice(0, i + 1).join('/')}`)}>/ {seg}</button>
            ))}
          </nav>
          <div className="f-scroll">
            <div className="f-grid">
              {newDir !== null && (
                <form className="f-tile f-newdir" onSubmit={(e) => { e.preventDefault(); createDir(); }}>
                  <Glyph kind="dir" />
                  <input
                    autoFocus
                    value={newDir}
                    placeholder="folder name"
                    aria-label="New folder name"
                    onChange={(e) => setNewDir(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); createDir(); } }}
                    onBlur={() => setNewDir(null)}
                  />
                </form>
              )}
              {kids.dirs.map((name) => {
                const rec = { dir: true, path: join(cwd, name), name };
                return (
                  <button key={`d:${name}`} className="f-tile" onClick={() => setCwd(rec.path)} title={`${name} — folder`}>
                    <Glyph kind="dir" />
                    <span className="f-name">{name}</span>
                    <span className="f-meta">folder</span>
                    <span className="f-actions">
                      <button
                        className={confirmDel === rec.path ? 'armed' : ''}
                        onClick={(e) => { e.stopPropagation(); remove(rec); }}
                        title="Delete folder (and contents)"
                      >{confirmDel === rec.path ? 'sure?' : '✕'}</button>
                    </span>
                  </button>
                );
              })}
              {kids.files.map((rec) => (
                <button key={rec.path} className="f-tile" onClick={() => openFile(rec)} title={`${base(rec.path)} — ${fmtBytes(rec.size)}`}>
                  <Glyph kind={kindOf(rec)} />
                  <span className="f-name">{base(rec.path)}</span>
                  <span className="f-meta">{fmtBytes(rec.size)}</span>
                  <span className="f-actions">
                    <button onClick={(e) => { e.stopPropagation(); download(rec); }} title="Download">↓</button>
                    <button onClick={(e) => { e.stopPropagation(); remove(rec); }} title="Delete">✕</button>
                  </span>
                </button>
              ))}
              {!kids.dirs.length && !kids.files.length && newDir === null && (
                <div className="f-empty">Empty — drop files anywhere in this window,<br />or use Upload. Everything here persists in this browser.</div>
              )}
            </div>
          </div>
        </>
      )}

      {tab === 'device' && (
        <div className="f-scroll">
          {!hasFsApi && (
            <div className="f-empty">
              This browser doesn&apos;t expose the File System Access API.<br />
              Use Upload (or drag &amp; drop) on the WebOS disk tab instead.
            </div>
          )}
          {hasFsApi && !devHasFs && (
            <div className="f-empty">
              <p>Browse folders on your real disk — read-only, this session only.</p>
              <p>Files open straight from disk for preview; <b>Import</b> copies one<br />into {cwd} on the persistent WebOS disk.</p>
              <button className="f-btn primary" onClick={pickDevice}>Choose a folder…</button>
            </div>
          )}
          {devHasFs && (
            <>
              <nav className="f-crumbs" aria-label="Device location">
                <button className="f-btn" disabled={!device.path.length} onClick={devUp} title="Up one folder">↑</button>
                <button className="on">{device.name}</button>
                {device.path.map((seg, i) => <button key={seg + i} className={i === device.path.length - 1 ? 'on' : ''}>/ {seg}</button>)}
              </nav>
              <div className="f-grid">
                {device.entries.map((entry) => (
                  <button key={entry.name} className="f-tile" onClick={() => devOpen(entry)} title={entry.kind === 'file' ? `${entry.name} — ${fmtBytes(entry.size)} (on your disk)` : entry.name}>
                    <Glyph kind={entry.kind === 'directory' ? 'dir' : kindOf({ name: entry.name, type: entry.type })} />
                    <span className="f-name">{entry.name}</span>
                    <span className="f-meta">{entry.kind === 'directory' ? 'folder' : fmtBytes(entry.size)}</span>
                    <span className="f-actions">
                      {entry.kind === 'file' && (
                        <button onClick={(e) => { e.stopPropagation(); devImport(entry); }} title={`Import into ${cwd}`}>↓</button>
                      )}
                    </span>
                  </button>
                ))}
                {!device.entries.length && <div className="f-empty">This folder is empty.</div>}
              </div>
            </>
          )}
        </div>
      )}

      <footer className="f-status">
        {tab === 'disk' && (
          <>
            <span>{kids.dirs.length} folders · {kids.files.length} files{cwd !== ROOT ? ` in ${cwd}` : ''}</span>
            <span className="f-spring" />
            <span>{usage ? `${fmtBytes(usage.usage || 0)} of ${fmtBytes(usage.quota || 0)} browser storage used` : 'stored in this browser (IndexedDB)'}</span>
          </>
        )}
        {tab === 'device' && <span>Session-only view — nothing from your disk is uploaded anywhere; Import copies into the WebOS disk.</span>}
      </footer>

      {preview && (
        <div className="f-preview" role="dialog" aria-label={preview.rec.name}>
          <header>
            <span className="f-pv-name">{preview.rec.name}</span>
            <span className="f-spring" />
            {preview.rec.device ? (
              <button className="f-btn primary" onClick={async () => {
                const f = preview.rec.raw;
                if (f) { await filePut(join(cwd, f.name), f); await refresh(); setTab('disk'); }
                setPreview(null);
              }} title={`Import into ${cwd}`}>Import</button>
            ) : (
              <button className="f-btn" onClick={() => download(preview.rec)}>Download</button>
            )}
            <button className="f-btn" onClick={() => setPreview(null)}>Close</button>
          </header>
          <div className="f-pv-body">
            {preview.text !== undefined ? <pre>{preview.text}</pre>
              : preview.kind === 'img' ? <img src={preview.url} alt={preview.rec.name} />
                : preview.kind === 'vid' ? <video src={preview.url} controls autoPlay />
                  : preview.kind === 'aud' ? <audio src={preview.url} controls autoPlay />
                    : preview.kind === 'pdf' ? <iframe src={preview.url} title={preview.rec.name} />
                      : <div className="f-empty">No preview for this type — use Download.</div>}
          </div>
        </div>
      )}
    </div>
  );
}
