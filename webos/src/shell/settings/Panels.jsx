import React, { useEffect, useState } from 'react';
import { useOS, WIDGET_IDS, factoryReset } from '../../os/state.jsx';
import { VERSION } from '../../version.js';

/* --- Desktop: icon size + arrangement --- */
export function DesktopPanel() {
  const os = useOS();
  return (
    <section>
      <h3>Icon size</h3>
      <div className="seg-row" role="radiogroup" aria-label="Desktop icon size">
        {[['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']].map(([id, label]) => (
          <button
            key={id}
            role="radio" aria-checked={os.desktop.iconSize === id}
            className={`chip ${os.desktop.iconSize === id ? 'on' : ''}`}
            onClick={() => os.setDesktop({ iconSize: id })}
          >{label}</button>
        ))}
      </div>
      <h3>Arrangement</h3>
      <div className="seg-row" role="radiogroup" aria-label="Desktop arrangement">
        <button
          role="radio" aria-checked={os.desktop.sort === 'custom'}
          className={`chip ${os.desktop.sort === 'custom' ? 'on' : ''}`}
          onClick={() => os.setDesktop({ sort: 'custom' })}
        >Free drag</button>
        <button
          role="radio" aria-checked={os.desktop.sort === 'name'}
          className={`chip ${os.desktop.sort === 'name' ? 'on' : ''}`}
          onClick={() => os.sortDesktop()}
        >Sorted by name</button>
      </div>
      <p className="dim">
        {os.desktop.sort === 'custom'
          ? 'Drag icons anywhere on the desktop — the layout persists.'
          : 'Icons auto-sort alphabetically. Switch to “Free drag” to rearrange by hand.'}
      </p>
      <h3>Grid spacing</h3>
      <div className="seg-row" role="radiogroup" aria-label="Desktop grid spacing">
        {[['compact', 'Compact'], ['normal', 'Normal'], ['roomy', 'Roomy']].map(([id, label]) => (
          <button
            key={id}
            role="radio" aria-checked={(os.desktop.gap || 'normal') === id}
            className={`chip ${(os.desktop.gap || 'normal') === id ? 'on' : ''}`}
            onClick={() => os.setDesktop({ gap: id })}
          >{label}</button>
        ))}
      </div>
      <h3>Windows</h3>
      <label className="check-row">
        <input type="checkbox" checked={!!os.ui.focusHover} onChange={() => os.setUi({ focusHover: !os.ui.focusHover })} />
        Focus follows the mouse (hover raises a window instead of clicking it)
      </label>
    </section>
  );
}

/* --- Taskbar: position, auto-hide, clock, labels --- */
export function TaskbarPanel() {
  const os = useOS();
  const tb = os.taskbar;
  const toggle = (key) => os.setTaskbar({ [key]: !tb[key] });
  return (
    <>
      <section>
        <h3>Position</h3>
        <div className="seg-row" role="radiogroup" aria-label="Taskbar position">
          {[['bottom', 'Bottom'], ['top', 'Top']].map(([id, label]) => (
            <button
              key={id}
              role="radio" aria-checked={tb.position === id}
              className={`chip ${tb.position === id ? 'on' : ''}`}
              onClick={() => os.setTaskbar({ position: id })}
            >{label}</button>
          ))}
        </div>
        <h3>Alignment &amp; size</h3>
        <div className="row">
          <span className="dim">Align apps</span>
          <div className="seg-row" role="radiogroup" aria-label="Taskbar alignment">
            {[['left', 'Left'], ['center', 'Center']].map(([id, label]) => (
              <button
                key={id}
                role="radio" aria-checked={(tb.align || 'left') === id}
                className={`chip ${(tb.align || 'left') === id ? 'on' : ''}`}
                onClick={() => os.setTaskbar({ align: id })}
              >{label}</button>
            ))}
          </div>
        </div>
        <div className="row">
          <span className="dim">Icon size</span>
          <div className="seg-row" role="radiogroup" aria-label="Taskbar icon size">
            {[['sm', 'Small'], ['md', 'Medium'], ['lg', 'Large']].map(([id, label]) => (
              <button
                key={id}
                role="radio" aria-checked={(tb.iconSize || 'md') === id}
                className={`chip ${(tb.iconSize || 'md') === id ? 'on' : ''}`}
                onClick={() => os.setTaskbar({ iconSize: id })}
              >{label}</button>
            ))}
          </div>
        </div>
        <h3>Behavior</h3>
        <label className="check-row">
          <input type="checkbox" checked={tb.autohide} onChange={() => toggle('autohide')} />
          Auto-hide the taskbar (reveal by moving the pointer to the screen edge)
        </label>
        <label className="check-row">
          <input type="checkbox" checked={tb.labels} onChange={() => toggle('labels')} />
          Show text labels (Start + open apps)
        </label>
      </section>
      <section>
        <h3>Clock</h3>
        <label className="check-row">
          <input type="checkbox" checked={tb.clock24} onChange={() => toggle('clock24')} />
          24-hour time
        </label>
        <label className="check-row">
          <input type="checkbox" checked={tb.showDate} onChange={() => toggle('showDate')} />
          Show the date next to the time
        </label>
      </section>
    </>
  );
}

/* --- Widgets: enable + order (mirrors the sidebar's Customize mode) --- */
export function WidgetsPanel() {
  const os = useOS();
  const enabled = os.widgets.enabled.filter((id) => WIDGET_IDS.includes(id));
  const move = (id, dir) => {
    const i = enabled.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= enabled.length) return;
    const next = [...enabled];
    [next[i], next[j]] = [next[j], next[i]];
    os.setWidgets({ enabled: next });
  };
  const toggle = (id) =>
    os.setWidgets({ enabled: enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id] });
  return (
    <section>
      <h3>Widget sidebar</h3>
      <ul className="widget-list">
        {WIDGET_IDS.map((id) => {
          const i = enabled.indexOf(id);
          const on = i >= 0;
          return (
            <li key={id} className="widget-row">
              <span>{id === 'events' ? "Today's events" : id[0].toUpperCase() + id.slice(1)}</span>
              <span className="flex1" />
              {on && (
                <>
                  <button className="btn slim" onClick={() => move(id, -1)} disabled={i === 0} title="Move up">↑</button>
                  <button className="btn slim" onClick={() => move(id, 1)} disabled={i === enabled.length - 1} title="Move down">↓</button>
                </>
              )}
              <button className={`btn slim ${on ? '' : 'accent'}`} onClick={() => toggle(id)}>{on ? 'Hide' : 'Show'}</button>
            </li>
          );
        })}
      </ul>
      <p className="dim">The sidebar lives on the right edge — toggle it from the grid button in the taskbar tray.</p>
    </section>
  );
}

/* --- Sound: system volume (broadcast to apps) --- */
export function SoundPanel() {
  const os = useOS();
  const v = os.volume;
  return (
    <section>
      <h3>Output volume</h3>
      <div className="row">
        <span className="dim" style={{ width: 48 }}>{Math.round((v.muted ? 0 : v.level) * 100)}%</span>
        <input
          type="range" min="0" max="100"
          value={Math.round((v.muted ? 0 : v.level) * 100)}
          onChange={(e) => os.setVolume({ level: Number(e.target.value) / 100, muted: false })}
        />
        <button className="btn" onClick={() => os.setVolume({ muted: !v.muted })}>{v.muted ? 'Unmute' : 'Mute'}</button>
      </div>
      <p className="dim">System-level preference. Apps that play audio receive it through the webos:volume event; the tray speaker mirrors it live.</p>
    </section>
  );
}

/* --- Screen saver: kind, idle timeout, per-kind options, preview --- */
export function SaverPanel() {
  const os = useOS();
  const s = os.saver;
  const kinds = [
    ['off', 'Off'], ['starfield', 'Starfield'], ['aurora', 'Aurora'], ['tide', 'Tide'],
    ['mesh', 'Mesh'], ['rain', 'Code rain'], ['photos', 'Photo shuffle'], ['clock', 'Clock'],
  ];
  const isFx = ['starfield', 'aurora', 'tide', 'mesh', 'rain'].includes(s.kind);
  return (
    <>
      <section>
        <h3>Screen saver</h3>
        <div className="seg-row" role="radiogroup" aria-label="Screen saver kind">
          {kinds.map(([id, label]) => (
            <button
              key={id}
              role="radio" aria-checked={s.kind === id}
              className={`chip ${s.kind === id ? 'on' : ''}`}
              onClick={() => os.setSaver({ kind: id })}
            >{label}</button>
          ))}
        </div>
        <p className="dim">Starts after the idle timeout and covers the desktop. Any mouse move or key press dismisses it.</p>
      </section>
      <section>
        <h3>Timeout</h3>
        <div className="row">
          <label className="dim" htmlFor="saver-timeout">Idle for</label>
          <input
            id="saver-timeout" type="range" min="1" max="60" step="1"
            value={s.timeoutMin}
            onChange={(e) => os.setSaver({ timeoutMin: Number(e.target.value) })}
            disabled={s.kind === 'off'}
            aria-label="Idle minutes before the screen saver starts"
          />
          <span className="dim" style={{ minWidth: 52, textAlign: 'right' }}>{s.timeoutMin} min</span>
        </div>
      </section>
      {isFx && (
        <section>
          <h3>Speed</h3>
          <div className="row">
            <label className="dim" htmlFor="saver-speed">Animation speed</label>
            <input
              id="saver-speed" type="range" min="0.25" max="3" step="0.25"
              value={s.speed}
              onChange={(e) => os.setSaver({ speed: Number(e.target.value) })}
              aria-label="Screen saver animation speed"
            />
            <span className="dim" style={{ minWidth: 52, textAlign: 'right' }}>{s.speed}×</span>
          </div>
        </section>
      )}
      {s.kind === 'photos' && (
        <section>
          <h3>Slideshow</h3>
          <div className="row">
            <label className="dim" htmlFor="saver-photo">Per photo</label>
            <input
              id="saver-photo" type="range" min="3" max="30" step="1"
              value={s.photoSecs}
              onChange={(e) => os.setSaver({ photoSecs: Number(e.target.value) })}
              aria-label="Seconds per photo"
            />
            <span className="dim" style={{ minWidth: 52, textAlign: 'right' }}>{s.photoSecs} s</span>
          </div>
          <p className="dim">Shuffles the bundled CC-licensed wallpapers (docs/ATTRIBUTION.md).</p>
        </section>
      )}
      {s.kind === 'clock' && (
        <section>
          <h3>Clock</h3>
          <p className="dim">Shows a large clock using the taskbar's 12/24-hour setting. Customize the format in Taskbar settings.</p>
        </section>
      )}
      <section>
        <h3>Try it</h3>
        <div className="row">
          <button
            className="btn"
            disabled={s.kind === 'off'}
            onClick={() => window.dispatchEvent(new Event('webos:saver-preview'))}
          >
            Preview now
          </button>
          <span className="dim">Move the mouse to come back.</span>
        </div>
      </section>
    </>
  );
}

/* --- Network: live connection readout --- */
export function NetworkPanel() {
  const [net, setNet] = useState(() => navigator.connection || {});
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    const chg = () => setNet({ ...(navigator.connection || {}) });
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    navigator.connection?.addEventListener?.('change', chg);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
      navigator.connection?.removeEventListener?.('change', chg);
    };
  }, []);
  const rows = [
    ['Status', online ? 'Connected' : 'Offline'],
    ['Effective link', net.effectiveType ? net.effectiveType.toUpperCase() : 'unknown'],
    ['Downlink', net.downlink != null ? `${net.downlink} Mb/s` : '—'],
    ['Round-trip', net.rtt != null ? `${net.rtt} ms` : '—'],
    ['Data saver', net.saveData ? 'On' : 'Off'],
    ['Platform', navigator.platform || '—'],
  ];
  return (
    <section>
      <h3>Connection properties</h3>
      <dl className="props-grid">
        {rows.map(([k, v]) => (<React.Fragment key={k}><dt>{k}</dt><dd>{v}</dd></React.Fragment>))}
      </dl>
      <p className="dim">Everything here is read from your browser on this device — WebOS makes no connectivity requests to report this.</p>
    </section>
  );
}

/* --- Storage: quota + per-key usage + reset --- */
export function StoragePanel() {
  const os = useOS();
  const [est, setEst] = useState(null);
  // localStorage is a synchronous external store — read it for the initial
  // render (lazy initializer) instead of inside an effect
  const [keys, setKeys] = useState(() => {
    try {
      return Object.keys(localStorage)
        .filter((k) => k.startsWith('webos.'))
        .map((k) => ({ k, bytes: (localStorage.getItem(k) || '').length * 2 }))
        .sort((a, b) => b.bytes - a.bytes);
    } catch { return []; }
  });
  const scan = () => {
    try {
      setKeys(
        Object.keys(localStorage)
          .filter((k) => k.startsWith('webos.'))
          .map((k) => ({ k, bytes: (localStorage.getItem(k) || '').length * 2 }))
          .sort((a, b) => b.bytes - a.bytes)
      );
    } catch { setKeys([]); }
  };
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
  }, []);
  const kb = (n) => (n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`);
  return (
    <>
      <section>
        <h3>Browser storage</h3>
        {est ? (
          <p className="dim">
            {(est.usage / 1048576).toFixed(1)} MB used of {(est.quota / 1048576).toFixed(0)} MB available to this site.
          </p>
        ) : <p className="dim">Storage manager unavailable.</p>}
        <h3>WebOS keys</h3>
        <ul className="widget-list">
          {keys.map(({ k, bytes }) => (
            <li key={k} className="widget-row">
              <code>{k}</code>
              <span className="flex1" />
              <span className="dim">{kb(bytes)}</span>
              <button
                className="btn slim danger"
                onClick={() => { try { localStorage.removeItem(k); } catch { /* noop */ } scan(); }}
              >Clear</button>
            </li>
          ))}
          {!keys.length && <li className="dim">Nothing stored yet.</li>}
        </ul>
      </section>
      <section>
        <h3>Reset</h3>
        <div className="row">
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('Reset ALL WebOS data (apps, theme, files-in-editor, notes)? This cannot be undone.')) return;
              factoryReset();
            }}
          >
            Reset WebOS data
          </button>
          <span className="dim">{os.apps.length} apps installed · {os.windows.length} windows open</span>
        </div>
      </section>
    </>
  );
}

/* --- Apps: installed inventory + quick uninstall --- */
export function AppsPanel() {
  const os = useOS();
  return (
    <section>
      <h3>Installed apps ({os.apps.length})</h3>
      <ul className="widget-list">
        {os.apps.map((app) => {
          const removable = !os.isDefault(app.id);
          return (
            <li key={app.id} className="widget-row">
              <img src={app.icon} alt="" width="20" height="20" />
              <span>{app.name}</span>
              <span className="dim">{app.category}{removable ? '' : ' · system'}</span>
              <span className="flex1" />
              <button className="btn slim" onClick={() => os.launch(app.id)}>Open</button>
              {removable && <button className="btn slim danger" onClick={() => os.uninstall(app.id)}>Remove</button>}
            </li>
          );
        })}
      </ul>
      <p className="dim">Store apps can be reinstalled any time from the App Store; system apps ship with the OS.</p>
    </section>
  );
}

/* --- About --- */
export function AboutPanel() {
  const os = useOS();
  return (
    <>
      <section>
        <h3>About WebOS</h3>
        <dl className="props-grid">
          <dt>Shell</dt><dd>WebOS {VERSION} (Vite + React, fully client-rendered)</dd>
          <dt>Persona</dt><dd>{os.persona}</dd>
          <dt>Apps</dt><dd>Bundled plugins + external web apps, installed per browser</dd>
          <dt>Privacy</dt><dd>No analytics, no server-side state, no accounts</dd>
          <dt>Deep links</dt><dd><code>?open=&lt;app-id&gt;</code> launches any app — e.g. <code>?open=weather</code></dd>
        </dl>
        <div className="row">
          <button className="btn" onClick={() => window.dispatchEvent(new Event('webos:welcome'))}>Show welcome screen…</button>
          <a className="btn" href="https://github.com/aliasfoxkde/webos-deploy" target="_blank" rel="noopener noreferrer">Source ↗</a>
          <a className="btn" href="https://getartcraft.com/" target="_blank" rel="noopener noreferrer">ArtCraft ↗</a>
        </div>
      </section>
      <section>
        <h3>Reset</h3>
        <p className="dim" style={{ marginTop: -6 }}>
          Restore every styling surface — persona, theme, wallpaper, chrome knobs,
          taskbar and desktop layout — to factory defaults. Installed apps, pinned
          icons, icon groups, files and events are kept.
        </p>
        <div className="row">
          <button
            className="btn"
            onClick={() => {
              if (!confirm('Reset look & layout to defaults? Apps, pins, groups and files are kept.')) return;
              os.resetLook();
            }}
          >
            Reset look &amp; layout
          </button>
          <button
            className="btn danger"
            onClick={() => {
              if (!confirm('Reset ALL WebOS data (apps, theme, files, notes)? This cannot be undone.')) return;
              factoryReset();
            }}
          >
            Factory reset…
          </button>
        </div>
        <p className="dim">{os.apps.length} apps installed · {os.windows.length} windows open</p>
      </section>
    </>
  );
}
