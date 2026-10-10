// Notepad — quick notes with autosave to localStorage, search, markdown
// preview for .md-titled notes, and "Save to Files" export into the disk.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { fileGet, filePut } from '../../os/db.js';
import MarkdownView from '../editor/MarkdownView.jsx';
import {
  loadState, persistState, createNote, updateNote, renameNote, deleteNote,
  searchNotes, byRecency, isMdTitle, exportName,
} from './notes.js';
import './notepad.css';

const relTime = (t) => {
  const s = Math.max(0, (Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

export default function Notepad() {
  const [state, setState] = useState(loadState);
  const [query, setQuery] = useState('');
  const [preview, setPreview] = useState(false);
  const [status, setStatus] = useState('');
  const [confirmDel, setConfirmDel] = useState(null);
  const saveTimer = useRef(null);
  const alive = useRef(true);
  const taRef = useRef(null);
  useEffect(() => () => { alive.current = false; clearTimeout(saveTimer.current); }, []);

  const active = state.notes.find((n) => n.id === state.activeId) || state.notes[0];
  const shown = useMemo(() => searchNotes(state.notes, query).sort(byRecency), [state.notes, query]);
  const mdMode = isMdTitle(active?.title);

  const apply = useCallback((next) => {
    setState(next);
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => persistState(next), 400);
  }, []);

  // Focus the editor whenever the active note changes.
  useEffect(() => {
    if (!preview) taRef.current?.focus();
  }, [state.activeId, preview]);

  // Preview only makes sense for markdown-titled notes — derived, so renaming
  // a note out of .md while previewing drops back to the editor by itself.
  const showPreview = preview && mdMode;

  const onText = (e) => apply(updateNote(state, active.id, { text: e.target.value }));

  const onTitle = (e) => apply(renameNote(state, active.id, e.target.value));

  const onCreate = () => apply(createNote(state));

  const onKey = (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      exportToFiles();
    }
  };

  const remove = async (id) => {
    if (confirmDel !== id) { setConfirmDel(id); return; } // arm, second click fires
    setConfirmDel(null);
    apply(deleteNote(state, id));
  };

  // Export the active note into /Home as markdown (plain notes too — .md is
  // honest: notes may contain any text). Existing files get -2, -3, … names.
  const exportToFiles = async () => {
    if (!active) return;
    try {
      const taken = new Set();
      let name = exportName(active.title, taken);
      while (await fileGet(`/Home/${name}`)) {
        taken.add(name);
        name = exportName(active.title, taken);
      }
      await filePut(`/Home/${name}`, new Blob([active.text], { type: 'text/markdown' }));
      setStatus(`saved ${name} → Files`);
    } catch (e) {
      setStatus(`export failed: ${e.message ?? e}`);
    }
  };

  const words = active?.text.trim() ? active.text.trim().split(/\s+/).length : 0;

  return (
    <div className="notepad">
      <aside className="np-side">
        <div className="np-search">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search notes…"
            aria-label="Search notes"
          />
          <button type="button" className="np-new" onClick={onCreate} title="New note">+</button>
        </div>
        <div className="np-list" role="listbox" aria-label="Notes">
          {shown.map((n) => (
            <div
              key={n.id}
              role="option"
              aria-selected={n.id === active?.id}
              tabIndex={0}
              className={`np-item ${n.id === active?.id ? 'on' : ''}`}
              onClick={() => { apply({ ...state, activeId: n.id }); setPreview(false); }}
              onKeyDown={(e) => e.key === 'Enter' && apply({ ...state, activeId: n.id })}
            >
              <span className="np-item-title">{n.title}</span>
              <span className="np-item-snippet">{n.text.split('\n').find((l) => l.trim()) || 'empty note'}</span>
              <span className="np-item-meta">
                {relTime(n.mtime)}
                <button
                  type="button"
                  className={confirmDel === n.id ? 'np-del armed' : 'np-del'}
                  onClick={(e) => { e.stopPropagation(); remove(n.id); }}
                  onDoubleClick={(e) => e.stopPropagation()}
                  aria-label={confirmDel === n.id ? `Confirm delete ${n.title}` : `Delete ${n.title}`}
                  title={confirmDel === n.id ? 'Click again to delete' : 'Delete note'}
                >{confirmDel === n.id ? 'sure?' : '✕'}</button>
              </span>
            </div>
          ))}
          {!shown.length && <div className="np-none">No notes match “{query}”.</div>}
        </div>
      </aside>

      {active ? (
        <section className="np-main">
          <input
            className="np-title"
            value={active.title}
            onChange={onTitle}
            aria-label="Note title"
            placeholder="Note title"
          />
          {mdMode && (
            <div className="np-mode" role="group" aria-label="Note view">
              <button type="button" className={!showPreview ? 'on' : ''} onClick={() => setPreview(false)}>Edit</button>
              <button type="button" className={showPreview ? 'on' : ''} onClick={() => setPreview(true)}>Preview</button>
            </div>
          )}
          {showPreview ? (
            <div className="np-preview"><MarkdownView src={active.text} /></div>
          ) : (
            <textarea
              ref={taRef}
              className="np-text"
              value={active.text}
              onChange={onText}
              onKeyDown={onKey}
              placeholder="Write something… (autosaves; Ctrl/Cmd+S copies to Files)"
              aria-label="Note text"
              spellCheck
            />
          )}
          <footer className="np-status">
            <span>{active.text.length} chars · {words} {words === 1 ? 'word' : 'words'}</span>
            <span className="np-spring" />
            {mdMode && <span className="np-md">markdown preview available</span>}
            {status && <span className="np-msg">{status}</span>}
            <button type="button" className="np-btn" onClick={exportToFiles} title="Copy this note into the WebOS disk (/Home)">Save to Files</button>
          </footer>
        </section>
      ) : (
        <section className="np-main np-empty">
          <p>No notes yet.</p>
          <button type="button" className="np-btn accent" onClick={onCreate}>Create one</button>
        </section>
      )}
    </div>
  );
}
