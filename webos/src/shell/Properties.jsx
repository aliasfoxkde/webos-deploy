import React from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';

export function Stars({ rating, size = 14 }) {
  const full = Math.round(rating);
  return (
    <span className="stars" style={{ fontSize: size }} aria-label={`${rating} out of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className={i <= full ? 'on' : ''} aria-hidden="true">★</span>
      ))}
    </span>
  );
}

/* App property sheet — opened from any icon / taskbar / titlebar context menu.
   Shows the full registry row plus what the user can do with it. */
export default function Properties({ appId, onClose }) {
  const os = useOS();
  const app = os.findApp(appId);
  if (!app) return null;

  const isPlugin = !app.url;
  const isStore = STORE_APPS.some((a) => a.id === app.id);
  const installed = isStore ? os.installed.includes(app.id) : true;
  const kind = isPlugin ? 'System plugin' : isStore ? (installed ? 'Store app (installed)' : 'Store app') : 'External app';

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="props"
        role="dialog"
        aria-label={`${app.name} properties`}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="props-head">
          <img src={app.icon} alt="" />
          <div>
            <h3>{app.name}</h3>
            <span className="dim">{app.tagline}</span>
          </div>
          <button className="tb-btn close" onClick={onClose} title="Close">✕</button>
        </header>

        <dl className="props-grid">
          <dt>Kind</dt><dd>{kind}</dd>
          <dt>Version</dt><dd>{app.version}</dd>
          <dt>Developer</dt><dd>{app.developer || 'Unknown'}</dd>
          <dt>Category</dt><dd>{app.category || '—'}</dd>
          <dt>Rating</dt>
          <dd>
            <Stars rating={app.rating || 0} />
            <span className="dim"> {app.rating?.toFixed(1) || '–'} · {app.reviews || 0} reviews</span>
          </dd>
          {app.url ? (<><dt>Source</dt><dd><a href={app.url} target="_blank" rel="noopener noreferrer">{new URL(app.url).host} ↗</a></dd></>) : null}
        </dl>

        <p className="props-desc">{app.description || app.tagline}</p>

        <footer className="props-actions">
          {installed ? (
            <button className="btn accent" onClick={() => { onClose(); os.launch(app.id); }}>Open</button>
          ) : (
            <button className="btn accent" onClick={() => os.install(app.id)}>Install</button>
          )}
          {app.url ? (
            <button className="btn" onClick={() => window.open(app.url, '_blank', 'noopener')}>Open in new tab</button>
          ) : null}
          {isStore && installed ? (
            <button className="btn danger" onClick={() => { os.uninstall(app.id); onClose(); }}>Uninstall</button>
          ) : null}
          <span className="flex1" />
          <button className="btn" onClick={onClose}>Close</button>
        </footer>
      </div>
    </div>
  );
}
