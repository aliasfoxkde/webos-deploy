import React, { useState } from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';

/* Android-style app drawer for mobile mode: full-screen sheet, search field,
   one-tap launch grid over every available app (installed + one row to the
   store), and a dock button to get back to the desktop. */
export default function MobileDrawer({ onClose }) {
  const os = useOS();
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const apps = os.apps.filter((a) =>
    !needle || [a.name, a.tagline, a.category].join(' ').toLowerCase().includes(needle)
  );

  const launch = (id) => { onClose(); os.launch(id); };

  return (
    <div id="drawer" role="dialog" aria-label="All apps">
      <header className="drawer-head">
        <input
          type="search"
          placeholder="Search apps…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search apps"
        />
        <button className="tb-btn close" onClick={onClose} title="Close">✕</button>
      </header>
      <div className="drawer-grid">
        {apps.map((app) => (
          <button key={app.id} className="drawer-app" onClick={() => launch(app.id)}>
            <img src={app.icon} alt="" />
            <span>{app.name}</span>
          </button>
        ))}
        {!apps.length && <p className="dim">No apps match “{q}”.</p>}
      </div>
      {!needle && (
        <footer className="drawer-foot">
          <button className="btn accent" onClick={() => { onClose(); os.launch('store'); }}>
            🛍 App Store · {STORE_APPS.length} more apps
          </button>
        </footer>
      )}
    </div>
  );
}
