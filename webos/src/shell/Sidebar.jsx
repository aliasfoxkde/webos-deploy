import React, { useEffect, useState } from 'react';
import { useOS, WIDGET_IDS } from '../os/state.jsx';
import { loadLoc, fetchWeather, wmo, loadUnits, saveUnits, fmtTemp } from '../apps/weather/api.js';
import WxIcon from '../apps/weather/WxIcon.jsx';
import { loadHistory, clearHistory, onHistory } from '../apps/chat/store.js';

/* --- individual widgets --- */

function WeatherWidget() {
  const os = useOS();
  const [loc] = useState(loadLoc);
  const [units, setUnits] = useState(loadUnits);
  const [wx, setWx] = useState(null);
  useEffect(() => {
    let live = true;
    if (loc) fetchWeather(loc.lat, loc.lon).then((d) => { if (live) setWx(d); }).catch(() => {});
    return () => { live = false; };
  }, [loc]);
  // The Weather app may flip the unit; keep the widget in sync.
  useEffect(() => {
    const h = (e) => setUnits(e.detail);
    window.addEventListener('webos:units', h);
    return () => window.removeEventListener('webos:units', h);
  }, []);
  if (!loc) {
    return (
      <div className="widget">
        <div className="widget-title">Weather</div>
        <button className="btn" onClick={() => os.launch('weather')}>Set location…</button>
      </div>
    );
  }
  const cond = wx ? wmo(wx.current.code, wx.current.isDay) : null;
  return (
    <div className="widget">
      <div className="widget-title">Weather · {loc.name}</div>
      {wx && cond ? (
        <button
          type="button"
          className="widget-weather"
          title={`Units: ${units} — click to switch`}
          onClick={() => { const next = units === 'metric' ? 'imperial' : 'metric'; setUnits(next); saveUnits(next); }}
        >
          <WxIcon id={cond.icon} size={40} />
          <span className="widget-temp">{Math.round(fmtTemp(wx.current.temp, units))}°</span>
          <span className="dim">{cond.label}</span>
        </button>
      ) : (
        <span className="dim">Loading…</span>
      )}
      <button className="btn slim" onClick={() => os.launch('weather')}>Open Weather</button>
    </div>
  );
}

function ClockWidget() {
  const [now, setNow] = useState(() => new Date());
  const os = useOS();
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="widget widget-center">
      <div className="widget-clock">{now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !os.taskbar.clock24 })}</div>
      <span className="dim">{now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' })}</span>
    </div>
  );
}

function BatteryWidget() {
  const [bat, setBat] = useState(null);
  useEffect(() => {
    let b = null;
    const sync = () => b && setBat({ level: b.level, charging: b.charging });
    navigator.getBattery?.().then((found) => {
      b = found;
      sync();
      b.addEventListener('levelchange', sync);
      b.addEventListener('chargingchange', sync);
    }).catch(() => {});
    return () => { if (b) { b.removeEventListener('levelchange', sync); b.removeEventListener('chargingchange', sync); } };
  }, []);
  return (
    <div className="widget">
      <div className="widget-title">Battery</div>
      {bat ? (
        <>
          <div className="widget-batt">
            <span className={`widget-batt-fill ${bat.charging ? 'chg' : ''}`} style={{ width: `${Math.round(bat.level * 100)}%` }} />
          </div>
          <span className="dim">{Math.round(bat.level * 100)}%{bat.charging ? ' · charging' : ''}</span>
        </>
      ) : (
        <span className="dim">No battery API (desktop hardware reports AC power).</span>
      )}
    </div>
  );
}

function EventsWidget() {
  const os = useOS();
  const today = new Date().toISOString().slice(0, 10);
  const list = os.events[today] || [];
  return (
    <div className="widget">
      <div className="widget-title">Today</div>
      {list.length ? list.map((t, i) => <div key={i} className="widget-ev">{t}</div>) : <span className="dim">No events today.</span>}
      <button className="btn slim" onClick={() => { document.querySelector('#clock')?.click(); }}>Open calendar</button>
    </div>
  );
}

function NotesWidget() {
  const [text, setText] = useState(() => {
    try { return localStorage.getItem('webos.notes') || ''; } catch { return ''; }
  });
  useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem('webos.notes', text); } catch { /* private mode */ }
    }, 300);
    return () => clearTimeout(t);
  }, [text]);
  return (
    <div className="widget">
      <div className="widget-title">Notes</div>
      <textarea
        className="widget-notes"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Jot something down…"
        aria-label="Quick notes"
      />
    </div>
  );
}

function StorageWidget() {
  const [est, setEst] = useState(null);
  useEffect(() => {
    navigator.storage?.estimate?.().then(setEst).catch(() => {});
  }, []);
  const mb = (n) => (n == null ? '—' : `${(n / 1048576).toFixed(1)} MB`);
  const pct = est?.quota ? Math.min(100, (est.usage / est.quota) * 100) : 0;
  return (
    <div className="widget">
      <div className="widget-title">Storage</div>
      {est ? (
        <>
          <div className="widget-batt"><span className="widget-batt-fill" style={{ width: `${Math.max(2, pct).toFixed(0)}%` }} /></div>
          <span className="dim">{mb(est.usage)} used of {mb(est.quota)} ({pct.toFixed(1)}%)</span>
        </>
      ) : (
        <span className="dim">Storage manager unavailable.</span>
      )}
    </div>
  );
}

function ChatWidget() {
  const os = useOS();
  const [msgs, setMsgs] = useState(loadHistory);
  useEffect(() => onHistory(() => setMsgs(loadHistory())), []);
  const last = msgs.slice(-3);
  return (
    <div className="widget">
      <div className="widget-title">AI Chat</div>
      {last.length ? (
        <div className="widget-chat">
          {last.map((m, i) => (
            <div key={m.id || i} className={`widget-chat-msg ${m.role}`}>{m.text.length > 90 ? `${m.text.slice(0, 90)}…` : m.text}</div>
          ))}
        </div>
      ) : (
        <span className="dim">No conversation yet.</span>
      )}
      <div className="row">
        <button className="btn slim accent" onClick={() => os.launch('chat')}>Open AI Chat</button>
        {msgs.length > 0 && <button className="btn slim" onClick={() => clearHistory()}>Clear</button>}
      </div>
    </div>
  );
}

const WIDGET_BODIES = {
  weather: WeatherWidget,
  clock: ClockWidget,
  battery: BatteryWidget,
  events: EventsWidget,
  notes: NotesWidget,
  storage: StorageWidget,
  chat: ChatWidget,
};

const WIDGET_LABELS = {
  weather: 'Weather', clock: 'Clock', battery: 'Battery',
  events: "Today's events", notes: 'Notes', storage: 'Storage', chat: 'AI Chat',
};

/* --- the sidebar panel: right-edge, editable enable/order --- */
export default function Sidebar({ onClose }) {
  const os = useOS();
  const [edit, setEdit] = useState(false);
  const enabled = os.widgets.enabled.filter((id) => WIDGET_IDS.includes(id));

  const move = (id, dir) => {
    const i = enabled.indexOf(id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= enabled.length) return;
    const next = [...enabled];
    [next[i], next[j]] = [next[j], next[i]];
    os.setWidgets({ enabled: next });
  };
  const toggle = (id) => {
    os.setWidgets({ enabled: enabled.includes(id) ? enabled.filter((x) => x !== id) : [...enabled, id] });
  };

  return (
    <aside id="sidebar" aria-label="Widgets">
      <header className="sb-head">
        <strong>Widgets</strong>
        <span className="flex1" />
        <button className="btn slim" onClick={() => setEdit((v) => !v)}>{edit ? 'Done' : 'Customize'}</button>
        <button className="tb-btn close" onClick={onClose} title="Close widgets">✕</button>
      </header>
      <div className="sb-body">
        {enabled.map((id) => {
          const Body = WIDGET_BODIES[id];
          return (
            <section key={id} className="sb-slot">
              {edit && (
                <div className="sb-edit">
                  <button className="btn slim" onClick={() => move(id, -1)} disabled={enabled.indexOf(id) === 0} title="Move up">↑</button>
                  <button className="btn slim" onClick={() => move(id, 1)} disabled={enabled.indexOf(id) === enabled.length - 1} title="Move down">↓</button>
                  <button className="btn slim danger" onClick={() => toggle(id)} title={`Hide ${WIDGET_LABELS[id]}`}>Hide</button>
                </div>
              )}
              {Body ? <Body /> : null}
            </section>
          );
        })}
        {!enabled.length && <p className="dim" style={{ padding: '12px' }}>No widgets enabled. Hit “Customize” to add some.</p>}
      </div>
      {edit && (
        <footer className="sb-edit-add">
          <div className="widget-title">Add widgets</div>
          <div className="sb-chips">
            {WIDGET_IDS.map((id) => (
              <button key={id} className={`chip ${enabled.includes(id) ? 'on' : ''}`} onClick={() => toggle(id)}>
                {WIDGET_LABELS[id]}
              </button>
            ))}
          </div>
        </footer>
      )}
    </aside>
  );
}
