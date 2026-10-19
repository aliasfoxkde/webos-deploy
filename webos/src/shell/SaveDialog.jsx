import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/* Shared save-as dialog for export handoffs.
   Opens a filename input over a blurred backdrop; calls onSave(filename)
   on confirm, or onCancel on dismiss. Designed to work inside any window
   context — rendered through a React portal into document.body so it is
   never clipped by a parent overflow container.

   Usage:
     <SaveDialog
       suggestedName="my-design.png"
       directory="/Apps/firecraft/exports"
       format="PNG"
       onSave={(name) => { … }}
       onCancel={() => { … })}
     />
*/
export default function SaveDialog({ suggestedName, directory, format, onSave, onCancel }) {
  const [name, setName] = useState(() => suggestedName ?? 'untitled.png');
  const inputRef = useRef(null);

  // Auto-focus the input when the dialog opens; select the name without the extension.
  // Use a ref to capture the initial name so the effect runs once on mount only —
  // the user may have edited the name and we should not steal focus mid-edit.
  const initialName = useRef(name);
  useEffect(() => {
    inputRef.current?.focus();
    const dot = initialName.current.lastIndexOf('.');
    inputRef.current?.setSelectionRange(0, dot > 0 ? dot : initialName.current.length);
  }, []);

  // Escape cancels, Enter saves
  useEffect(() => {
    const k = (e) => {
      if (e.key === 'Escape') onCancel();
    };
    document.addEventListener('keydown', k);
    return () => document.removeEventListener('keydown', k);
  }, [onCancel]);

  const save = () => {
    const n = name.trim() || 'untitled.png';
    onSave(n);
  };

  const dialog = (
    <div
      className="modal-backdrop"
      onPointerDown={(e) => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div
        className="props save-dialog"
        role="dialog"
        aria-label="Save as"
        aria-modal="true"
      >
        <header className="props-head">
          <img src="icons/file-export.svg" alt="" />
          <div>
            <h3>Save{format ? ` ${format}` : ''} as</h3>
            <span className="dim">{directory ?? '/Apps/'}</span>
          </div>
        </header>

        <div className="save-dialog-body">
          <label className="save-dialog-filename">
            <span className="dim" style={{ fontSize: '0.8rem' }}>Filename</span>
            <input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
              placeholder="untitled"
              spellCheck={false}
              autoComplete="off"
            />
          </label>
        </div>

        <footer className="props-actions">
          <button className="btn accent" onClick={save}>Save</button>
          <span className="flex1" />
          <button className="btn" onClick={onCancel}>Cancel</button>
        </footer>
      </div>
    </div>
  );

  return createPortal(dialog, document.body);
}
