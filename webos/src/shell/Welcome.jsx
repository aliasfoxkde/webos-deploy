import React from 'react';
import { PERSONAS } from '../os/personas.js';
import { VERSION } from '../version.js';
import { useOS } from '../os/state.jsx';

/* First-run welcome: brand + capabilities + persona picker + docs links.
   Shown once (webos.welcomed), skipped for ?open= deep links, reopenable
   from Settings → About (webos:welcome event). Picking a persona applies
   its defaults immediately, so the desktop behind the overlay follows. */
export default function Welcome({ onEnter }) {
  const os = useOS();
  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to WebOS">
      <section className="wl-card">
        <header className="wl-head">
          <img src="icons/logo.svg" alt="" width="44" height="44" />
          <div>
            <h1>ArtCraft WebOS</h1>
            <p className="dim">v{VERSION} — a browser desktop for the ArtCraft craft apps</p>
          </div>
        </header>

        <ul className="wl-feats">
          <li>8 real craft apps — CADCraft, PhotoCraft, GridCraft, WordCraft and friends — plus an App Store of web apps</li>
          <li>Real windows: drag, tile to halves and quadrants (Meta+arrows), minimize, maximize</li>
          <li>Files app with persistent storage, and a Terminal with a real SQLite database</li>
          <li>Widgets, wallpaper pack, icon groups, custom apps — everything stays in your browser</li>
        </ul>

        <h2 className="wl-h2">Choose your look</h2>
        <div className="wl-personas">
          {PERSONAS.map((p) => (
            <button
              key={p.id}
              className={`wl-p ${os.persona === p.id ? 'on' : ''}`}
              onClick={() => os.setPersona(p.id)}
              aria-pressed={os.persona === p.id}
              title={`${p.label} — ${p.tagline}`}
            >
              <span className="wl-mini" data-persona={p.id} aria-hidden="true">
                <i className="wl-m-title" /><i className="wl-m-body" />
                <i className="wl-m-bar" />
              </span>
              <b>{p.label}</b>
              <span className="wl-tag">{p.tagline}</span>
            </button>
          ))}
        </div>

        <footer className="wl-foot">
          <span className="wl-links">
            <a href="https://github.com/aliasfoxkde/webos-deploy" target="_blank" rel="noopener noreferrer">Source ↗</a>
            <a href="https://getartcraft.com/apps" target="_blank" rel="noopener noreferrer">ArtCraft apps ↗</a>
          </span>
          <button className="wl-enter" onClick={onEnter}>Enter WebOS →</button>
        </footer>
      </section>
    </div>
  );
}
