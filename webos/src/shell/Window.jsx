import React, { Suspense, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from '../os/state.jsx';
import { zoneRect } from '../os/snap.js';
import { APP_COMPONENTS } from '../apps/components.js';
import EmbedFrame from './EmbedFrame.jsx';
import ErrorBoundary from './ErrorBoundary.jsx';
import { startMoveDrag } from './winDrag.js';
import SaveDialog from './SaveDialog.jsx';
import { filePut } from '../os/db.js';

const MIN_W = 320, MIN_H = 220;

/* Resize directions → CSS cursor. All eight edges/corners are live handles. */
const DIRS = ['n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw'];
const CURSOR = { n: 'ns-resize', s: 'ns-resize', e: 'ew-resize', w: 'ew-resize', ne: 'nesw-resize', sw: 'nesw-resize', nw: 'nwse-resize', se: 'nwse-resize' };

// Apply a pointer delta to a starting rect, honoring the dragged edges and
// clamping to minimums without inverting the window.
function resized(start, dx, dy, dir) {
  const r = { ...start.rect };
  if (dir.includes('e')) r.w = Math.max(MIN_W, start.rect.w + dx);
  if (dir.includes('s')) r.h = Math.max(MIN_H, start.rect.h + dy);
  if (dir.includes('w')) {
    const w = Math.max(MIN_W, start.rect.w - dx);
    r.x = start.rect.x + (start.rect.w - w);
    r.w = w;
  }
  if (dir.includes('n')) {
    const h = Math.max(MIN_H, start.rect.h - dy);
    r.y = start.rect.y + (start.rect.h - h);
    r.h = h;
  }
  return r;
}

/* Export-ready handlers for FireCraft export-to-Files dialog.
   These are separated from the component so they can be unit-tested directly,
   matching the pattern used by firecraftAutosave/firecraftRestore in EmbedFrame.
   os and filePut are passed as injectable dependencies. */
export function makeFirecraftExportHandlers({ putFile, launchPhotos }) {
  let pendingExport = null; // { bytes: ArrayBuffer, name: string }

  return {
    onExportRequest(bytes) {
      pendingExport = { bytes, name: `firecraft-export-${Date.now()}.png` };
    },
    onExportSave(name) {
      if (!pendingExport) return;
      const p = pendingExport;
      pendingExport = null;
      (async () => {
        try {
          const blob = new Blob([p.bytes], { type: 'image/png' });
          await putFile(`/Apps/firecraft/exports/${name}`, blob, 'image/png');
          launchPhotos?.(`/Apps/firecraft/exports/${name}`);
        } catch { /* save failures are silent */ }
      })();
    },
    onExportCancel() { pendingExport = null; },
    get pendingExport() { return pendingExport; },
  };
}

export default function Window({ win }) {
  const os = useOS();
  const app = os.findApp(win.appId);
  const [loaded, setLoaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [hint, setHint] = useState(null); // snap zone under the pointer while dragging
  const [pendingExport, setPendingExport] = useState(null); // { bytes: ArrayBuffer } | null

  // istanbul ignore next
  const handleExportRequest = (bytes) => {
    const name = `firecraft-export-${Date.now()}.png`;
    setPendingExport({ bytes, name });
  };

  // istanbul ignore next
  const handleExportSave = async (name) => {
    if (!pendingExport) return;
    try {
      const blob = new Blob([pendingExport.bytes], { type: 'image/png' });
      await filePut(`/Apps/firecraft/exports/${name}`, blob, 'image/png');
      os.launch('photos', { path: `/Apps/firecraft/exports/${name}` });
    } catch { /* save failures are silent */ }
    setPendingExport(null);
  };

  // istanbul ignore next
  const handleExportCancel = () => setPendingExport(null);

  useEffect(() => {
    if (loaded) return;
    const t = setTimeout(() => setSlow(true), 30000);
    return () => clearTimeout(t);
  }, [loaded]);

  if (!app) return null;
  const focused = os.focused === win.id;

  // Resize keeps its own gesture; moving is shared with VirtualWindow
  // (startMoveDrag) so both get snapping, tear-off, and the preview.
  const beginGesture = (e, dir) => {
    e.preventDefault();
    os.focus(win.id);
    const start = { x: e.clientX, y: e.clientY, rect: { ...win.rect } };
    let last = null;
    const move = (ev) => {
      last = resized(start, ev.clientX - start.x, ev.clientY - start.y, dir);
      os.setRect(win.id, last);
    };
    const up = () => {
      // Snap any clamped edge back to its min instead of leaving a
      // negative-size rect behind.
      if (last) os.setRect(win.id, last);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const onTitlePointerDown = (e) => {
    if (e.target.closest('.tb-btn')) return;
    e.preventDefault();
    os.focus(win.id);
    startMoveDrag(e, win, os, setHint);
  };

  const style = win.max
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.w, height: win.rect.h, zIndex: win.z };

  const pluginBody = (() => {
    const Plugin = APP_COMPONENTS[win.appId];
    if (Plugin) {
      return (
        <Suspense fallback={<div className="win-loading"><div className="spin" /><span>Starting {app.name}…</span></div>}>
          <Plugin args={win.args} />
        </Suspense>
      );
    }
    return <EmbedFrame app={app} onLoaded={() => setLoaded(true)} onMessage={win.onMessage} args={win.args} slow={slow} onExportRequest={handleExportRequest} />;
  })();

  return (
    <section
      className={`win ${focused ? 'focused' : ''} ${win.max ? 'maximized' : ''}`}
      style={{ ...style, display: win.min ? 'none' : undefined }}
      data-id={win.id}
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
        <ErrorBoundary soft label={app.name} onClose={() => os.close(win.id)}>
          {pluginBody}
        </ErrorBoundary>
        {!loaded && !APP_COMPONENTS[win.appId] && app.embed ? (
          <div className="win-loading" style={{ opacity: loaded ? 0 : 1 }}>
            <div className="spin" />
            <span>{slow ? 'Still loading — check your connection.' : `Starting ${app.name}…`}</span>
          </div>
        ) : null}
      </div>
      {!win.max && DIRS.map((dir) => (
        <div
          key={dir}
          className={`rz rz-${dir}`}
          style={{ cursor: CURSOR[dir] }}
          onPointerDown={(e) => { e.stopPropagation(); beginGesture(e, dir); }}
        />
      ))}
      {hint && hint !== 'top' && createPortal(
        <div
          id="snap-preview"
          style={(({ x, y, w, h }) => ({ left: x, top: y, width: w, height: h }))(zoneRect(hint))}
          aria-hidden="true"
        />,
        document.body
      )}
      {pendingExport && (
        <SaveDialog
          suggestedName={pendingExport.name}
          directory="/Apps/firecraft/exports"
          format="PNG"
          onSave={handleExportSave}
          onCancel={handleExportCancel}
        />
      )}
    </section>
  );
}
