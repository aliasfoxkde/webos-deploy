import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../os/state.jsx';

// Uploaded icons are data URLs in localStorage — small cap, icons are tiny.
const MAX_ICON = 512 * 1024;

const blank = {
  id: '', name: '', url: '', icon: '', description: '',
  accent: '#38bdf8', embed: false, singleInstance: false,
};

/* Create or edit a user app ("Add app…" on the desktop right-click menu).
   Custom apps live in webos.userapps and behave like any other app: desktop
   icon, properties, taskbar pinning, launching. */
export default function AddApp({ app, onClose }) {
  const os = useOS();
  const editing = !!app;
  const [f, setF] = useState(() => (editing ? { ...blank, ...app } : blank));
  const [err, setErr] = useState('');
  const fileRef = useRef(null);
  const nameRef = useRef(null);
  const set = (patch) => setF((v) => ({ ...v, ...patch }));

  // focus the name box once the dialog is up — autoFocus would grab focus
  // before the window settles and yank it from keyboard users mid-tab
  useEffect(() => { nameRef.current?.focus(); }, []);
  // Escape closes from anywhere in the dialog (document-level listener)
  useEffect(() => {
    const k = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onClose]);

  const onUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (file.size > MAX_ICON) {
      alert(`Icon too large (${(file.size / 1024).toFixed(0)} KB) — keep icons under ${MAX_ICON / 1024} KB.`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => set({ icon: String(reader.result) });
    reader.readAsDataURL(file);
  };

  const save = () => {
    const name = f.name.trim();
    const url = f.url.trim();
    if (!name) return setErr('Give the app a name.');
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      parsed = null;
    }
    if (!parsed || !/^https?:$/.test(parsed.protocol)) return setErr('Enter a valid http(s) link.');
    const row = {
      id: editing ? f.id : `user-${Date.now().toString(36)}`,
      name, url,
      icon: f.icon.trim() || 'icons/custom.svg',
      tagline: f.description.trim().split('\n')[0].slice(0, 60) || 'Web app',
      version: '1.0',
      accent: f.accent,
      embed: !!f.embed,
      singleInstance: !!f.singleInstance,
      developer: 'You',
      category: 'Custom',
      description: f.description.trim() || `Custom web app pointing at ${parsed.host}.`,
    };
    if (editing) os.updateUserApp(row);
    else os.addUserApp(row);
    onClose();
  };

  return (
    // pointer-only dismiss affordance (target check keeps dialog clicks from
    // closing); keyboard closes via Escape on the dialog
    <div
      className="modal-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        className="props addapp"
        role="dialog"
        aria-label={editing ? 'Edit app' : 'Add app'}
      >
        <header className="props-head">
          {f.icon
            ? <img src={f.icon} alt="" onError={(e) => { e.currentTarget.src = 'icons/custom.svg'; }} />
            : <img src="icons/custom.svg" alt="" />}
          <div>
            <h3>{editing ? `Edit ${f.name || 'app'}` : 'Add an app'}</h3>
            <span className="dim">A link to any web app or installed PWA</span>
          </div>
          <button className="tb-btn close" onClick={onClose} title="Close">✕</button>
        </header>

        <div className="addapp-form">
          <label>Name
            <input ref={nameRef} value={f.name} onChange={(e) => set({ name: e.target.value })} placeholder="My app" />
          </label>
          <label>Link
            <input value={f.url} onChange={(e) => set({ url: e.target.value })} placeholder="https://example.com" inputMode="url" />
          </label>
          <label>Description
            <textarea
              value={f.description}
              onChange={(e) => set({ description: e.target.value })}
              placeholder="What does this app do?"
              rows={2}
            />
          </label>
          <div className="addapp-iconrow">
            <span className="dim">Icon</span>
            <input
              value={f.icon.startsWith('data:') ? '' : f.icon}
              onChange={(e) => set({ icon: e.target.value })}
              placeholder="…paste an image URL or upload"
            />
            <button className="btn" onClick={() => fileRef.current?.click()}>Upload…</button>
            <input ref={fileRef} type="file" accept="image/*" hidden onChange={onUpload} />
          </div>
          <div className="addapp-iconrow">
            <span className="dim">Color</span>
            <input type="color" value={f.accent} onChange={(e) => set({ accent: e.target.value })} title="Accent color" />
            <label className="check">
              <input type="checkbox" checked={!!f.embed} onChange={(e) => set({ embed: e.target.checked })} />
              Try to open inside a window
              <span className="dim">(many sites block this — they open in a tab instead)</span>
            </label>
            <label className="check">
              <input type="checkbox" checked={!!f.singleInstance} onChange={(e) => set({ singleInstance: e.target.checked })} />
              Single instance
              <span className="dim">(launching again focuses the open window)</span>
            </label>
          </div>
          {err ? <p className="wx-err">{err}</p> : null}
        </div>

        <footer className="props-actions">
          <button className="btn accent" onClick={save}>{editing ? 'Save' : 'Add app'}</button>
          <span className="flex1" />
          <button className="btn" onClick={onClose}>Cancel</button>
        </footer>
      </div>
    </div>
  );
}
