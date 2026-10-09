import React, { Suspense, useEffect, useRef, useState } from 'react';
import { useOS } from '../os/state.jsx';
import { APP_COMPONENTS } from '../apps/components.js';
import EmbedFrame from './EmbedFrame.jsx';

const MIN_W = 320, MIN_H = 220;

export default function Window({ win }) {
  const os = useOS();
  const app = os.findApp(win.appId);
  const ref = useRef(null);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const dragState = useRef(null);

  useEffect(() => {
    if (loaded) return;
    const t = setTimeout(() => setSlow(true), 30000);
    return () => clearTimeout(t);
  }, [loaded]);

  if (!app) return null;
  const focused = os.focused === win.id;

  const onTitlePointerDown = (e) => {
    if (e.target.closest('.tb-btn') || win.max) return;
    os.focus(win.id);
    const startX = e.clientX - win.rect.x, startY = e.clientY - win.rect.y;
    dragState.current = 'move';
    const move = (ev) => {
      if (dragState.current === 'move') {
        os.setRect(win.id, {
          ...win.rect,
          x: Math.max(-win.rect.w + 90, ev.clientX - startX),
          y: Math.max(0, Math.min(window.innerHeight - 100, ev.clientY - startY)),
        });
      } else if (dragState.current === 'resize') {
        os.setRect(win.id, {
          ...win.rect,
          w: Math.max(MIN_W, ev.clientX - win.rect.x),
          h: Math.max(MIN_H, ev.clientY - win.rect.y),
        });
      }
    };
    const up = () => {
      dragState.current = null;
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const style = win.max
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.w, height: win.rect.h, zIndex: win.z };

  return (
    <section
      ref={ref}
      className={`win ${focused ? 'focused' : ''} ${win.max ? 'maximized' : ''}`}
      style={{ ...style, display: win.min ? 'none' : undefined }}
      data-cm={`titlebar:${win.id}`}
      onPointerDownCapture={() => os.focus(win.id)}
      aria-label={app.name}
    >
      <header className="titlebar" onPointerDown={onTitlePointerDown} onDoubleClick={() => os.toggleMax(win.id)}>
        <img src={app.icon} alt="" />
        <span className="t">{app.name}<small>v{app.version}</small></span>
        {app.url ? <button className="tb-btn ext" title="Open in new tab" onClick={() => window.open(app.url, '_blank', 'noopener')}>↗</button> : null}
        <button className="tb-btn min" title="Minimize" onClick={() => os.minimize(win.id)}>—</button>
        <button className="tb-btn max" title={win.max ? 'Restore' : 'Maximize'} onClick={() => os.toggleMax(win.id)}>{win.max ? '❐' : '□'}</button>
        <button className="tb-btn close" title="Close" onClick={() => os.close(win.id)}>✕</button>
      </header>
      <div className="win-body" style={{ '--win-accent': app.accent }}>
        {(() => {
          const Plugin = APP_COMPONENTS[win.appId];
          if (Plugin) {
            return (
              <Suspense fallback={<div className="win-loading"><div className="spin" /><span>Starting {app.name}…</span></div>}>
                <Plugin />
              </Suspense>
            );
          }
          return <EmbedFrame app={app} onLoaded={() => setLoaded(true)} slow={slow} />;
        })()}
        {!loaded && !APP_COMPONENTS[win.appId] && app.embed ? (
          <div className="win-loading" style={{ opacity: loaded ? 0 : 1 }}>
            <div className="spin" />
            <span>{slow ? 'Still loading — check your connection.' : `Starting ${app.name}…`}</span>
          </div>
        ) : null}
      </div>
      {!win.max && <div className="tb-resize" onPointerDown={(e) => { e.stopPropagation(); onTitlePointerDown({ ...e, target: e.currentTarget }); dragState.current = 'resize'; }} />}
    </section>
  );
}
