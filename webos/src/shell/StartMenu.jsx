import React from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';

export default function StartMenu({ open, onClose, openStore, openSettings }) {
  const os = useOS();
  if (!open) return null;
  return (
    <div id="start-menu" onClick={(e) => e.stopPropagation()}>
      <div className="sm-apps">
        {os.apps.map((app) => (
          <button key={app.id} className="sm-app" onClick={() => { onClose(); os.launch(app.id); }}>
            <img src={app.icon} alt="" />
            <span>{app.name}<span className="sub">v{app.version} · {app.tagline}</span></span>
          </button>
        ))}
      </div>
      <div className="sm-links">
        <div className="sm-section">System</div>
        <button className="sm-link" onClick={() => { onClose(); openStore(); }}>🛍 App Store{STORE_APPS.length ? ` · ${STORE_APPS.length} apps` : ''}</button>
        <button className="sm-link" onClick={() => { onClose(); openSettings(); }}>⚙ Settings &amp; personalization</button>
        <button className="sm-link" onClick={() => { onClose(); os.launch('terminal'); }}>❯ Terminal</button>
        <div className="sm-section">Links</div>
        <a href="https://getartcraft.com/" target="_blank" rel="noopener noreferrer">ArtCraft home ↗</a>
        <a href="https://github.com/storytold" target="_blank" rel="noopener noreferrer">Upstream repositories ↗</a>
      </div>
    </div>
  );
}
