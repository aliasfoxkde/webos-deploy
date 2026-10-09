import React, { useState } from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';

const CATS = ['All', 'Games', 'Creative', 'Development', 'Tools'];

export default function AppStore() {
  const os = useOS();
  const [cat, setCat] = useState('All');
  const list = STORE_APPS.filter((a) => cat === 'All' || a.category === cat);

  return (
    <div className="store">
      <header className="store-head">
        <h2>App Store</h2>
        <div className="store-cats">
          {CATS.map((c) => (
            <button key={c} className={`chip ${cat === c ? 'on' : ''}`} onClick={() => setCat(c)}>{c}</button>
          ))}
        </div>
      </header>
      <div className="store-grid">
        {list.map((app) => {
          const installed = os.installed.includes(app.id);
          return (
            <article key={app.id} className="store-card" style={{ '--win-accent': app.accent }}>
              <img src={app.icon} alt="" />
              <div className="store-meta">
                <strong>{app.name}</strong>
                <span className="dim">{app.tagline}</span>
                <span className="store-tags">
                  <em>{app.category}</em>
                  {!app.embed && <em className="warn">new tab only</em>}
                </span>
              </div>
              <div className="store-actions">
                {installed ? (
                  <>
                    <button className="btn accent" onClick={() => os.launch(app.id)}>Open</button>
                    <button className="btn" onClick={() => os.uninstall(app.id)}>Remove</button>
                  </>
                ) : (
                  <button className="btn accent" onClick={() => os.install(app.id)}>Install</button>
                )}
              </div>
            </article>
          );
        })}
      </div>
      <p className="dim store-note">Installed apps appear on the desktop and in the Start menu. Selection persists in this browser.</p>
    </div>
  );
}
