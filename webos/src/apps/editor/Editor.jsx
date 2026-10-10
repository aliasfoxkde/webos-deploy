// Editor — bundled code editor plugin (CodeMirror 6).
// Buffers persist in localStorage; Open/Save use the File System Access API
// where available, with a download fallback elsewhere. Buffers opened from
// the Files disk (args.path) save straight back to the store.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import { EditorView } from 'codemirror';
import { loadState, persist, reducer } from './buffers.js';
import { detectLanguage, editorExtensions, languageLabel } from './language.js';
import MarkdownView from './MarkdownView.jsx';
import { fileGet, filePut } from '../../os/db.js';
import './editor.css';

const base = (p) => p.slice(p.lastIndexOf('/') + 1);
const isMarkdownName = (name) => /\.(md|mdx|markdown)$/i.test(name || '');

export default function Editor({ args } = {}) {
  const [state, dispatch] = useState(loadState);
  const [wrap, setWrap] = useState(true);
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState('');
  const [renaming, setRenaming] = useState(null);
  const host = useRef(null);
  const view = useRef(null);
  const saveRef = useRef(() => {});
  const persistTimer = useRef(null);
  const openedRef = useRef(false);
  const renameInput = useRef(null);

  // Latest state without re-creating the CM view on every keystroke.
  const stateRef = useRef(state);
  stateRef.current = state;
  const active = state.buffers.find((b) => b.id === state.activeId);

  const applyState = useCallback((next) => {
    dispatch(next);
    clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => persist(stateRef.current), 400);
  }, []);

  // (Re)configure the CodeMirror view whenever the active buffer or wrap flips.
  const extensions = useMemo(
    () => editorExtensions(
      (text) => applyState(reducer(stateRef.current, { type: 'edit', text })),
      { key: 'Mod-s', run: () => { saveRef.current(); return true; }, preventDefault: true },
      wrap,
    ),
    [wrap, applyState],
  );

  useEffect(() => {
    if (!host.current) return undefined;
    const cm = new EditorView({
      state: EditorState.create({ doc: active.text, extensions: [...extensions, detectLanguage(active.name)] }),
      parent: host.current,
    });
    view.current = cm;
    return () => { cm.destroy(); view.current = null; };
    // active.text intentionally excluded: the doc is owned by CodeMirror; the
    // update listener keeps state in sync instead of resetting the view.
    // showPreview is a dep: the host div unmounts while previewing, so the
    // view must be rebuilt on return.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.activeId, extensions, showPreview]);

  useEffect(() => () => clearTimeout(persistTimer.current), []);

  // Focus the inline tab-rename field when it mounts (a ref-focus, not
  // autoFocus — the field appears from an explicit double-click).
  useEffect(() => {
    if (renaming !== null) renameInput.current?.focus();
  }, [renaming]);

  // Launched from Files (args.path): open the store file once per mount and
  // keep a live preview only when the buffer is markdown.
  useEffect(() => {
    if (openedRef.current || !args?.path) return;
    openedRef.current = true;
    fileGet(args.path).then((rec) => {
      if (!rec?.blob) { setStatus(`not found: ${args.path}`); return; }
      return rec.blob.text().then((text) => {
        applyState(reducer(stateRef.current, { type: 'new', name: base(args.path), text, storePath: args.path }));
        if (isMarkdownName(args.path)) setPreview(true);
      });
    }).catch((e) => setStatus(`open failed: ${e.message ?? e}`));
  }, [args, applyState]);

  // Preview only applies to markdown buffers — derived, so switching to a
  // non-markdown tab while previewing drops back to the editor by itself.
  const showPreview = preview && isMarkdownName(active.name);

  // ---- file IO ------------------------------------------------------------
  const readFile = () => new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.js,.jsx,.ts,.tsx,.mjs,.json,.html,.htm,.css,.md,.py,.rs,.txt,.toml,.yaml,.yml,.xml,.svg,.sh';
    input.onchange = async () => {
      const file = input.files?.[0];
      resolve(file ? { name: file.name, text: await file.text(), handle: null } : null);
    };
    input.click();
  });

  const openFile = async () => {
    let picked = null;
    if (window.showOpenFilePicker) {
      try {
        const [handle] = await window.showOpenFilePicker();
        const file = await handle.getFile();
        picked = { name: file.name, text: await file.text(), handle };
      } catch { return; } // user cancelled
    } else {
      picked = await readFile();
    }
    if (picked) applyState(reducer(stateRef.current, { type: 'new', ...picked }));
  };

  const writeFile = async (buffer, handle) => {
    if (handle) {
      const writable = await handle.createWritable();
      await writable.write(buffer.text);
      await writable.close();
      return handle;
    }
    if (window.showSaveFilePicker) {
      const h = await window.showSaveFilePicker({ suggestedName: buffer.name });
      const writable = await h.createWritable();
      await writable.write(buffer.text);
      await writable.close();
      return h;
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([buffer.text], { type: 'text/plain' }));
    a.download = buffer.name;
    a.click();
    URL.revokeObjectURL(a.href);
    return null;
  };

  const save = async () => {
    const buffer = stateRef.current.buffers.find((b) => b.id === stateRef.current.activeId);
    try {
      if (buffer.storePath) {
        // Opened from the Files disk — write straight back to the store.
        await filePut(buffer.storePath, new Blob([buffer.text], { type: 'text/plain' }));
        applyState(reducer(stateRef.current, { type: 'saved', id: buffer.id }));
        setStatus(`saved ${buffer.name} → Files`);
        return;
      }
      const handle = await writeFile(buffer, buffer.handle);
      applyState(reducer(stateRef.current, { type: 'saved', id: buffer.id, handle, name: handle ? undefined : buffer.name }));
      setStatus(handle ? `saved ${buffer.name}` : `exported ${buffer.name}`);
    } catch (e) {
      if (e?.name !== 'AbortError') setStatus(`save failed: ${e.message ?? e}`);
    }
  };
  saveRef.current = save;

  const close = (id) => {
    const b = state.buffers.find((x) => x.id === id);
    if (b?.dirty && !window.confirm(`${b.name} has unsaved changes. Close anyway?`)) return;
    applyState(reducer(state, { type: 'close', id }));
  };

  const cursor = view.current?.state.selection.main.head ?? 0;
  const line = view.current ? view.current.state.doc.lineAt(cursor) : { number: 1, from: 0 };
  const col = cursor - line.from;

  return (
    <div className="editor">
      <div className="ed-toolbar">
        <button type="button" className="tb-btn" onClick={() => applyState(reducer(state, { type: 'new' }))}>+ New</button>
        <button type="button" className="tb-btn" onClick={openFile}>Open</button>
        <button type="button" className="tb-btn" onClick={save}>Save</button>
        <span className="ed-flex" />
        {isMarkdownName(active.name) && (
          <span className="ed-mode" role="group" aria-label="Editor mode">
            <button type="button" className={!showPreview ? 'toggled' : ''} onClick={() => setPreview(false)}>Edit</button>
            <button type="button" className={showPreview ? 'toggled' : ''} onClick={() => setPreview(true)}>Preview</button>
          </span>
        )}
        <button
          type="button"
          className={`tb-btn ${wrap ? 'toggled' : ''}`}
          onClick={() => setWrap((v) => !v)}
          title="Toggle word wrap"
        >
          Wrap
        </button>
      </div>

      <div className="ed-tabs" role="tablist">
        {state.buffers.map((b) => (
          <span
            key={b.id}
            role="tab"
            aria-selected={b.id === state.activeId}
            tabIndex={0}
            className={`ed-tab ${b.id === state.activeId ? 'on' : ''}`}
            onClick={() => applyState(reducer(state, { type: 'activate', id: b.id }))}
            onKeyDown={(e) => e.key === 'Enter' && applyState(reducer(state, { type: 'activate', id: b.id }))}
            onDoubleClick={() => setRenaming({ id: b.id, name: b.name })}
          >
            {renaming?.id === b.id ? (
              <input
                ref={renameInput}
                value={renaming.name}
                onChange={(e) => setRenaming({ id: b.id, name: e.target.value })}
                onBlur={() => { applyState(reducer(state, { type: 'rename', id: b.id, name: renaming.name })); setRenaming(null); }}
                onKeyDown={(e) => e.key === 'Escape' && setRenaming(null)}
              />
            ) : (
              <>
                <span className="ed-name">{b.name}{b.dirty ? ' •' : ''}</span>
                <button type="button" className="ed-close" aria-label={`Close ${b.name}`} onClick={(e) => { e.stopPropagation(); close(b.id); }}>×</button>
              </>
            )}
          </span>
        ))}
      </div>

      {showPreview ? (
        <div className="ed-preview">
          <MarkdownView src={active.text} />
        </div>
      ) : (
        <div className="ed-host" ref={host} />
      )}

      <div className="ed-status">
        <span>{showPreview ? 'preview — editing paused' : `Ln ${line.number}, Col ${col + 1}`}</span>
        <span>{active.text.length} chars</span>
        <span>{languageLabel(active.name)}</span>
        {active.storePath && <em title={active.storePath}>Files: {active.storePath}</em>}
        {active.needsHandle && !active.handle && <em title="Re-open the file to save in place again">link lost</em>}
        {status && <span className="ed-msg">{status}</span>}
      </div>
    </div>
  );
}
