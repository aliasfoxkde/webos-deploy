import React, { useMemo, useState } from 'react';
import { useOS } from '../os/state.jsx';

/* Calendar popup: month navigation, today highlight, day selection and
   per-day notes/events persisted in localStorage. */
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function Calendar() {
  const os = useOS();
  const today = useMemo(() => new Date(), []);
  const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [selected, setSelected] = useState(iso(today));
  const [draft, setDraft] = useState('');

  const grid = useMemo(() => {
    const first = new Date(view.y, view.m, 1);
    const startDow = (first.getDay() + 6) % 7; // Monday-first
    const days = new Date(view.y, view.m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startDow; i++) cells.push(null);
    for (let d = 1; d <= days; d++) cells.push(new Date(view.y, view.m, d));
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [view]);

  const move = (delta) => {
    const d = new Date(view.y, view.m + delta, 1);
    setView({ y: d.getFullYear(), m: d.getMonth() });
  };

  const dayEvents = os.events[selected] || [];

  return (
    // clicks stay open via the taskbar's #tb-portal containment check — no
    // stopPropagation needed
    <div className="calendar">
      <header className="cal-head">
        <button className="tb-btn" onClick={() => move(-1)} aria-label="previous month">‹</button>
        <strong>{MONTHS[view.m]} {view.y}</strong>
        <button className="tb-btn" onClick={() => move(1)} aria-label="next month">›</button>
      </header>
      <div className="cal-grid">
        {DOW.map((d) => <div key={d} className="cal-dow">{d}</div>)}
        {grid.map((d, i) => {
          if (!d) return <div key={i} />;
          const key = iso(d);
          const isToday = key === iso(today);
          const hasEvents = (os.events[key] || []).length > 0;
          return (
            <button
              key={i}
              className={`cal-day ${key === selected ? 'sel' : ''} ${isToday ? 'today' : ''}`}
              onClick={() => setSelected(key)}
            >
              {d.getDate()}
              {hasEvents && <i />}
            </button>
          );
        })}
      </div>
      <div className="cal-events">
        <div className="cal-ev-title">{selected} {dayEvents.length ? `· ${dayEvents.length} item${dayEvents.length > 1 ? 's' : ''}` : ''}</div>
        {dayEvents.map((ev, i) => (
          <div key={i} className="cal-ev">
            <span>{ev}</span>
            <button className="tb-btn" onClick={() => os.removeEvent(selected, i)} aria-label="delete event">✕</button>
          </div>
        ))}
        <form
          className="cal-ev-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (draft.trim()) { os.addEvent(selected, draft.trim()); setDraft(''); }
          }}
        >
          <input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={`Add on ${selected}…`} />
          <button className="btn accent" type="submit">Add</button>
        </form>
      </div>
    </div>
  );
}
