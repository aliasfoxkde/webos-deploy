import React, { useEffect, useState } from 'react';
import { useOS } from '../os/state.jsx';
import Calendar from './Calendar.jsx';

export default function Taskbar({ openStart, startOpen, openSettings, openStore }) {
  const os = useOS();
  const [now, setNow] = useState(new Date());
  const [calOpen, setCalOpen] = useState(false);
  const [fs, setFs] = useState(!!document.fullscreenElement);

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    const onFs = () => setFs(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', onFs);
    return () => { clearInterval(t); document.removeEventListener('fullscreenchange', onFs); };
  }, []);

  const toggleFullscreen = () => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    else document.documentElement.requestFullscreen().catch(() => {});
  };
  useEffect(() => {
    const h = () => toggleFullscreen();
    document.addEventListener('webos:fullscreen', h);
    return () => document.removeEventListener('webos:fullscreen', h);
  }, []);

  const taskWindows = os.windows.map((w) => ({ w, app: os.findApp(w.appId) })).filter((x) => x.app);

  return (
    <footer id="taskbar" data-cm="taskbar">
      <button id="start-btn" className={startOpen ? 'open' : ''} onClick={openStart} title="Start">
        <img src="icons/logo.svg" alt="" /><span>Start</span>
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
            <img src={app.icon} alt="" /><span>{app.name}</span>
          </button>
        ))}
      </div>
      <div id="tray">
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
        <button id="clock" data-cm="clock" onClick={() => setCalOpen((v) => !v)} title="Calendar">
          <span id="clock-time">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          <span id="clock-date">{now.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
        </button>
      </div>
      {calOpen && (
        <>
          <div className="popup-backdrop" onClick={() => setCalOpen(false)} />
          <div className="cal-pop"><Calendar /></div>
        </>
      )}
    </footer>
  );
}
