import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../os/state.jsx';
import FxWallpaper from './FxWallpaper.jsx';
import { WALLPAPERS } from '../os/wallpapers.js';

/* Screen saver. Kinds: the five FX canvas wallpapers, a photo slideshow over
   the bundled CC photos, and a big clock. Idle timeout from os.saver; any
   input dismisses. `webos:saver-preview` activates immediately (Settings →
   Preview now, driver). */

const ACTIVITIES = ['pointermove', 'pointerdown', 'keydown', 'wheel'];
const PHOTOS = WALLPAPERS.filter((w) => w.img);

export default function Screensaver() {
  const os = useOS();
  const saver = os.saver;
  const [active, setActive] = useState(false);
  const last = useRef(Date.now());

  // Idle tracking: bump on any input. While ACTIVE, the first input dismisses
  // (and its own bump keeps the timeout from instantly re-firing).
  useEffect(() => {
    const bump = () => { last.current = Date.now(); };
    ACTIVITIES.forEach((a) => window.addEventListener(a, bump, { passive: true }));
    return () => ACTIVITIES.forEach((a) => window.removeEventListener(a, bump));
  }, []);

  useEffect(() => {
    if (saver.kind === 'off') return undefined;
    const tick = setInterval(() => {
      if (active || document.hidden) return;
      if (Date.now() - last.current >= (saver.timeoutMin || 10) * 60000) setActive(true);
    }, 1000);
    const preview = () => setActive(true);
    window.addEventListener('webos:saver-preview', preview);
    return () => {
      clearInterval(tick);
      window.removeEventListener('webos:saver-preview', preview);
    };
  }, [saver.kind, saver.timeoutMin, active]);

  useEffect(() => {
    if (!active) return undefined;
    const wake = () => { setActive(false); last.current = Date.now(); };
    // keydown/pointerdown wake immediately; a plain move must exceed a small
    // travel threshold so an idle jitter (or the activating mouse settle)
    // doesn't dismiss it instantly.
    let sx = null;
    let sy = null;
    const onMove = (e) => {
      if (sx === null) { sx = e.clientX; sy = e.clientY; return; }
      if (Math.hypot(e.clientX - sx, e.clientY - sy) > 24) wake();
    };
    const onDown = () => wake();
    const onKey = () => wake();
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [active]);

  if (!active || saver.kind === 'off') return null;

  const isFx = ['starfield', 'aurora', 'tide', 'mesh', 'rain'].includes(saver.kind);
  return (
    <div id="screensaver" role="timer" aria-label="Screen saver active — press any key or move the mouse to dismiss">
      {isFx && <FxWallpaper kind={saver.kind} id="saver-fx" />}
      {saver.kind === 'photos' && <PhotoShowcase secs={saver.photoSecs || 8} />}
      {saver.kind === 'clock' && <BigClock />}
      <span className="saver-hint">Move the mouse or press a key</span>
    </div>
  );
}

/* Bundled CC photos. The layer remounts per photo (key=i) and its CSS
   animation fades it in over the black background — fade-through-black, no
   blank frame, no stacked-layer bookkeeping. */
function PhotoShowcase({ secs }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setI((v) => (v + 1) % PHOTOS.length), Math.max(3, secs) * 1000);
    return () => clearInterval(t);
  }, [secs]);
  const photo = PHOTOS[i % PHOTOS.length];
  return <div className="saver-photo" key={i} style={{ backgroundImage: `url(${photo.img})` }} />;
}

function BigClock() {
  const os = useOS();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  const time = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: !os.taskbar.clock24 });
  const date = now.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <div className="saver-clock">
      <span className="saver-time">{time}</span>
      <span className="saver-date">{date}</span>
    </div>
  );
}
