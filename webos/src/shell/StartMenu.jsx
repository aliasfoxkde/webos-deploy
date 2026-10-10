import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useOS } from '../os/state.jsx';
import { STORE_APPS } from '../os/registry.js';
import { SECTIONS } from './Settings.jsx';

/* Start menu, search-first (PROGRAM-3 §4):
   search box → apps + settings sections + "Ask AI" row; below it the pinned
   grid, a Recommended row (launch recents), all apps grouped by category,
   and a footer with the user chip + power menu. Persona variants are CSS
   only (body[data-persona] rules in styles.css). */

const CATEGORY_ORDER = ['Design', 'Photo', 'Productivity', 'Media', 'Social', 'Games', 'Creative', 'Development', 'Tools', 'Utilities', 'System'];

// Out-of-the-box pinned tiles; filtered to apps that actually exist.
const DEFAULT_PINNED = ['photocraft', 'vectorcraft', 'gridcraft', 'wordcraft', 'files', 'terminal', 'chat', 'chatgpt'];

export default function StartMenu({ open, onClose, openStore, openSettings, onPower }) {
  const os = useOS();
  const [q, setQ] = useState('');
  const inputRef = useRef(null);
  useEffect(() => {
    if (open) {
      setQ('');
      const t = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [open]);

  const groups = useMemo(() => {
    const byCat = new Map();
    for (const app of os.apps) {
      const cat = app.category || 'Utilities';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(app);
    }
    return CATEGORY_ORDER.filter((c) => byCat.has(c)).map((c) => ({ cat: c, apps: byCat.get(c) }));
  }, [os.apps]);

  if (!open) return null;

  const query = q.trim().toLowerCase();
  const launch = (id, args) => { onClose(); os.launch(id, args); };

  const appHits = query
    ? os.apps.filter((a) => `${a.name} ${a.tagline} ${a.category}`.toLowerCase().includes(query)).slice(0, 8)
    : [];
  const secHits = query
    ? SECTIONS.filter((s) => s.label.toLowerCase().includes(query)).slice(0, 4)
    : [];
  const pinned = DEFAULT_PINNED.map((id) => os.apps.find((a) => a.id === id)).filter(Boolean);
  const recentApps = os.recents.map((id) => os.apps.find((a) => a.id === id)).filter(Boolean).slice(0, 6);
  const recommend = recentApps.filter((a) => !query).slice(0, 6);

  return (
    <div id="start-menu" onClick={(e) => e.stopPropagation()}>
      <div className="sm-search-row">
        <span className="sm-search-icon" aria-hidden="true">⌕</span>
        <input
          ref={inputRef}
          className="sm-search"
          type="text"
          placeholder="Search apps and settings…"
          aria-label="Search apps and settings"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              if (appHits[0]) launch(appHits[0].id);
              else if (secHits[0]) launch('settings', { initial: secHits[0].id });
            } else if (e.key === 'Escape') onClose();
          }}
        />
      </div>

      {query ? (
        <div className="sm-results">
          <button className="sm-link sm-ai" onClick={() => launch('chat')}>✦ Ask AI<span className="sub">assistant · no model configured yet</span></button>
          {appHits.length > 0 && <div className="sm-section">Apps</div>}
          {appHits.map((app) => (
            <button key={app.id} className="sm-app" onClick={() => launch(app.id)}>
              <img src={app.icon} alt="" />
              <span>{app.name}<span className="sub">{app.tagline}</span></span>
            </button>
          ))}
          {secHits.length > 0 && <div className="sm-section">Settings</div>}
          {secHits.map((s) => (
            <button key={s.id} className="sm-app" onClick={() => launch('settings', { initial: s.id })}>
              <span className="sm-ico-glyph" aria-hidden="true">{s.icon}</span>
              <span>{s.label}<span className="sub">Settings</span></span>
            </button>
          ))}
          {appHits.length === 0 && secHits.length === 0 && (
            <p className="dim sm-empty">No matches. Try the App Store?</p>
          )}
          {appHits.length === 0 && secHits.length === 0 && (
            <button className="sm-link" onClick={() => { onClose(); openStore(); }}>🛍 Open App Store · {STORE_APPS.length} apps</button>
          )}
        </div>
      ) : (
        <div className="sm-browse">
          <div className="sm-section">Pinned</div>
          <div className="sm-grid">
            {pinned.map((app) => (
              <button key={app.id} className="sm-tile" onClick={() => launch(app.id)} title={`${app.name} — ${app.tagline}`}>
                <img src={app.icon} alt="" />
                <span>{app.name}</span>
              </button>
            ))}
          </div>
          {recommend.length > 0 && <div className="sm-section">Recommended</div>}
          {recommend.length > 0 && (
            <div className="sm-rowset">
              {recommend.map((app) => (
                <button key={app.id} className="sm-app" onClick={() => launch(app.id)}>
                  <img src={app.icon} alt="" />
                  <span>{app.name}<span className="sub">{app.tagline}</span></span>
                </button>
              ))}
            </div>
          )}
          <div className="sm-section">All apps</div>
          {groups.map(({ cat, apps }) => (
            <div key={cat} className="sm-cat">
              <div className="sm-cat-name">{cat}</div>
              <div className="sm-rowset">
                {apps.map((app) => (
                  <button key={app.id} className="sm-app" onClick={() => launch(app.id)} title={`${app.name} — ${app.tagline}`}>
                    <img src={app.icon} alt="" />
                    <span>{app.name}</span>
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div className="sm-links">
            <button className="sm-link" onClick={() => { onClose(); openStore(); }}>🛍 App Store{STORE_APPS.length ? ` · ${STORE_APPS.length} apps` : ''}</button>
            <button className="sm-link" onClick={() => { onClose(); openSettings(); }}>⚙ Settings &amp; personalization</button>
          </div>
        </div>
      )}

      <footer className="sm-foot">
        <span className="sm-user" title="Signed in locally — this desktop runs entirely in your browser">
          <span className="sm-avatar" aria-hidden="true">A</span>
          <span className="sm-who">ArtCraft User</span>
        </span>
        <span className="flex1" />
        <button className="sm-pwr" onClick={() => onPower('restart')} title="Restart — reload the desktop">↻</button>
        <button className="sm-pwr danger" onClick={() => onPower('shutdown')} title="Shut down — halt the desktop">⏻</button>
      </footer>
    </div>
  );
}
