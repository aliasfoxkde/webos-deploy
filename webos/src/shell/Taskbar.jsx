import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../os/state.jsx';
import Calendar from './Calendar.jsx';

/* --- tray glyphs (original stroke SVGs) --- */
const VolumeIcon = ({ level, muted }) => {
  if (muted || level === 0) {
    return (
      <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M4 9.5h3.2L12 5.4v13.2l-4.8-4.1H4Z" /><path d="M16 9.5l5 5M21 9.5l-5 5" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 9.5h3.2L12 5.4v13.2l-4.8-4.1H4Z" />
      {level > 0.25 && <path d="M15.2 9.2a4 4 0 0 1 0 5.6" />}
      {level > 0.6 && <path d="M18 7a7.4 7.4 0 0 1 0 10" />}
    </svg>
  );
};

const WifiIcon = ({ online }) => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    {online ? (
      <>
        <path d="M3 9.5a13.5 13.5 0 0 1 18 0" /><path d="M6.2 13a9 9 0 0 1 11.6 0" /><path d="M9.4 16.4a4.6 4.6 0 0 1 5.2 0" /><circle cx="12" cy="19.4" r="0.6" fill="currentColor" />
      </>
    ) : (
      <>
        <path d="M3 9.5a13.5 13.5 0 0 1 18 0" opacity="0.35" /><path d="M6.2 13a9 9 0 0 1 11.6 0" opacity="0.35" /><path d="M4 4l16 16" />
      </>
    )}
  </svg>
);

const WidgetsIcon = () => (
  <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
    <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="1.6" /><rect x="13.1" y="3.5" width="7.4" height="7.4" rx="1.6" />
    <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="1.6" /><rect x="13.1" y="13.1" width="7.4" height="7.4" rx="1.6" />
  </svg>
);

/* --- connection panel --- */
function NetBody() {
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
    ['Link', net.effectiveType ? net.effectiveType.toUpperCase() : '—'],
    ['Downlink', net.downlink != null ? `${net.downlink} Mb/s` : '—'],
    ['Round-trip', net.rtt != null ? `${net.rtt} ms` : '—'],
    ['Data saver', net.saveData ? 'On' : 'Off'],
  ];
  return (
    <div className="tb-pop-body">
      {rows.map(([k, v]) => (
        <div key={k} className="tb-pop-row"><span className="dim">{k}</span><strong>{v}</strong></div>
      ))}
      <p className="dim tb-pop-note">Read live from the Network Information API — nothing leaves the browser.</p>
    </div>
  );
}

export default function Taskbar({ openStart, startOpen, openSettings, openStore, toggleWidgets, widgetsOpen }) {
  const os = useOS();
  const [now, setNow] = useState(() => new Date());
  const [panel, setPanel] = useState(null); // 'cal' | 'vol' | 'net' | null
  const [fs, setFs] = useState(() => !!document.fullscreenElement);
  const rootRef = useRef(null);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => { clearInterval(t); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  // Close any open panel on ANY click outside the tray root (document-level,
  // capture phase) — windows, desktop, start menu, everything.
  useEffect(() => {
    if (!panel) return;
    const h = (e) => {
      if (rootRef.current?.contains(e.target)) return;
      const portal = document.getElementById('tb-portal');
      if (portal?.contains(e.target)) return;
      setPanel(null);
    };
    document.addEventListener('pointerdown', h, true);
    return () => document.removeEventListener('pointerdown', h, true);
  }, [panel]);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const h = () => toggleFullscreen();
    document.addEventListener('webos:fullscreen', h);
    return () => document.removeEventListener('webos:fullscreen', h);
  }, []);

  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !os.taskbar.clock24 });
  const date = now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
  const taskWindows = os.windows.map((w) => ({ w, app: os.findApp(w.appId) })).filter((x) => x.app);

  const trayBtn = (id, title, glyph) => (
    <button
      className={`tray-btn ${panel === id ? 'on' : ''}`}
      data-tray={id}
      title={title}
      aria-pressed={panel === id}
      onClick={() => setPanel((p) => (p === id ? null : id))}
    >
      {glyph}
    </button>
  );

  const vol = os.volume;
  const level = vol.muted ? 0 : vol.level;

  return (
    <>
      <footer id="taskbar" data-cm="taskbar" ref={rootRef}>
        <button id="start-btn" className={startOpen ? 'open' : ''} onClick={openStart} title="Start">
          <img src="icons/logo.svg" alt="" />{os.taskbar.labels && <span>Start</span>}
        </button>
        <div id="task-apps">
          {taskWindows.map(({ w, app }) => (
            <button
              key={w.id}
              className={`task-app ${os.focused === w.id && !w.min ? 'focused' : ''}`}
              data-cm={`taskapp:${w.id}`}
              onClick={() => {
                if (os.focused === w.id && !w.min) os.minimize(w.id);
                else { os.minimize(w.id, true); os.focus(w.id); }
              }}
              title={app.name}
            >
              <img src={app.icon} alt="" />{os.taskbar.labels && <span>{app.name}</span>}
            </button>
          ))}
        </div>
        <div id="tray">
          <button
            className={`tray-btn ${widgetsOpen ? 'on' : ''}`}
            data-tray="widgets"
            title="Widgets"
            aria-pressed={widgetsOpen}
            onClick={toggleWidgets}
          >
            <WidgetsIcon />
          </button>
          {trayBtn('vol', 'Volume', <VolumeIcon level={level} muted={vol.muted} />)}
          {trayBtn('net', 'Network', <WifiIcon online={navigator.onLine} />)}
          <button className="tray-btn" id="fs-btn" data-cm="tray" onClick={toggleFullscreen} title={fs ? 'Exit fullscreen' : 'Fullscreen'}>
            {fs ? (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M9 3v4a2 2 0 0 1-2 2H3M15 3v4a2 2 0 0 0 2 2h4M9 21v-4a2 2 0 0 0-2-2H3M15 21v-4a2 2 0 0 1 2-2h4" /></svg>
            ) : (
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" /></svg>
            )}
          </button>
          <button className="tray-btn" onClick={openSettings} title="Settings">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="3.2" /><path d="M12 2.8v3M12 18.2v3M2.8 12h3M18.2 12h3M5.5 5.5l2.1 2.1M16.4 16.4l2.1 2.1M18.5 5.5l-2.1 2.1M7.6 16.4l-2.1 2.1" /></svg>
          </button>
          <button id="clock" data-cm="clock" onClick={() => setPanel((p) => (p === 'cal' ? null : 'cal'))} title="Calendar">
            <span id="clock-time">{time}</span>
            {os.taskbar.showDate && <span id="clock-date">{date}</span>}
          </button>
        </div>
      </footer>

      {/* Popups render through a body-level portal: the taskbar's
          backdrop-filter makes <footer> the containing block for fixed
          children, which previously trapped the calendar backdrop inside a
          52px strip. Portal = the backdrop really covers the screen. */}
      {createPortal(
        panel ? (
          <div id="tb-portal">
            {panel === 'cal' && (
              <div className="cal-pop tb-pop" onClick={(e) => e.stopPropagation()}><Calendar /></div>
            )}
            {panel === 'vol' && (
              <div className="vol-pop tb-pop" onClick={(e) => e.stopPropagation()}>
                <div className="tb-pop-row">
                  <span className="dim">Output volume</span>
                  <strong>{Math.round(level * 100)}%</strong>
                </div>
                <input
                  type="range" min="0" max="100" value={Math.round(level * 100)}
                  onChange={(e) => os.setVolume({ level: Number(e.target.value) / 100, muted: false })}
                  aria-label="Output volume"
                />
                <div className="vol-actions">
                  <button className="btn" onClick={() => os.setVolume({ muted: !vol.muted })}>
                    {vol.muted ? 'Unmute' : 'Mute'}
                  </button>
                  <button className="btn" onClick={() => os.setVolume({ level: 0.7, muted: false })}>Reset</button>
                </div>
                <p className="dim tb-pop-note">System-level preference — apps that play audio read it via the webos:volume event.</p>
              </div>
            )}
            {panel === 'net' && (
              <div className="net-pop tb-pop" onClick={(e) => e.stopPropagation()}>
                <div className="tb-pop-title">Connection</div>
                <NetBody />
              </div>
            )}
          </div>
        ) : null,
        document.body
      )}
    </>
  );
}
