import React, { useState } from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';
import { Stars } from './Properties.jsx';

const CATS = ['All', ...new Set(STORE_APPS.map((a) => a.category))].sort((a, b) => (a === 'All' ? -1 : b === 'All' ? 1 : a.localeCompare(b)));

function InstallActions({ app }) {
  const os = useOS();
  const installed = os.installed.includes(app.id);
  if (installed) {
    return (
      <div className="store-actions row">
        <button className="btn accent" onClick={() => os.launch(app.id)}>Open</button>
        <button className="btn danger" onClick={() => os.uninstall(app.id)}>Remove</button>
      </div>
    );
  }
  return (
    <div className="store-actions">
      <button className="btn accent" onClick={() => os.install(app.id)}>Install</button>
      {!app.embed && <span className="dim">opens in a tab</span>}
    </div>
  );
}

/* Full-page detail view for one listing. */
function StoreDetail({ app, onBack }) {
  const os = useOS();
  const installed = os.installed.includes(app.id);
  return (
    <div className="store-detail">
      <button className="btn slim back" onClick={onBack}>← All apps</button>
      <header className="sd-head">
        <img src={app.icon} alt="" />
        <div>
          <h2>{app.name}</h2>
          <span className="dim">{app.developer} · v{app.version}</span>
          <div className="sd-rating">
            <Stars rating={app.rating} size={16} />
            <span>{app.rating.toFixed(1)}</span>
            <span className="dim">({app.reviews} reviews)</span>
          </div>
        </div>
        <span className="flex1" />
        {installed
          ? <button className="btn accent" onClick={() => os.launch(app.id)}>Open</button>
          : <button className="btn accent" onClick={() => os.install(app.id)}>Install</button>}
      </header>
      <p className="sd-desc">{app.description}</p>
      <dl className="props-grid">
        <dt>Category</dt><dd>{app.category}</dd>
        <dt>Version</dt><dd>{app.version}</dd>
        <dt>Developer</dt><dd>{app.developer}</dd>
        <dt>Runs</dt><dd>{app.embed ? 'Inside WebOS (embedded)' : 'In its own tab (site forbids embedding)'}</dd>
        <dt>Source</dt><dd><a href={app.url} target="_blank" rel="noopener noreferrer">{new URL(app.url).host} ↗</a></dd>
        <dt>Storage</dt><dd>{installed ? 'Uses this browser’s local storage only' : 'Nothing installed yet'}</dd>
      </dl>
      {installed ? (
        <button className="btn danger" onClick={() => os.uninstall(app.id)}>Uninstall from this device</button>
      ) : null}
    </div>
  );
}

export default function AppStore() {
  const os = useOS();
  const [cat, setCat] = useState('All');
  const [q, setQ] = useState('');
  const [detail, setDetail] = useState(null);

  if (detail) return <StoreDetail app={detail} onBack={() => setDetail(null)} />;

  const needle = q.trim().toLowerCase();
  const list = STORE_APPS.filter((a) => {
    if (cat !== 'All' && a.category !== cat) return false;
    if (!needle) return true;
    return [a.name, a.tagline, a.description, a.developer, a.category].join(' ').toLowerCase().includes(needle);
  });

  return (
    <div className="store">
      <header className="store-head">
        <h2>App Store</h2>
        <input
          className="store-search"
          type="search"
          placeholder="Search the store…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          aria-label="Search the App Store"
        />
        <div className="store-cats">
          {CATS.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </header>
      <div className="store-grid">
        {list.map((app) => (
          <article key={app.id} className="store-card" style={{ '--win-accent': app.accent }}>
            <button className="store-icon" onClick={() => setDetail(app)} title={`${app.name} details`}>
              <img src={app.icon} alt="" />
            </button>
            <div className="store-meta">
              <strong>{app.name}</strong>
              <span className="store-rating">
                <Stars rating={app.rating} /> <span className="dim">{app.rating.toFixed(1)} · {app.reviews} reviews</span>
              </span>
              <span className="dim">{app.tagline}</span>
              <span className="store-tags">
                <em>{app.category}</em>
                <em>{app.developer}</em>
                {!app.embed && <em className="warn">new tab only</em>}
              </span>
            </div>
            <InstallActions app={app} />
          </article>
        ))}
        {!list.length && <p className="dim">No apps match “{q}” in {cat}.</p>}
      </div>
      <p className="dim store-note">Installed apps appear on the desktop and in the Start menu. Selection persists in this browser — nothing is uploaded anywhere.</p>
    </div>
  );
}
