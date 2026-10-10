import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useOS } from './os/state.jsx';
import Window from './shell/Window.jsx';
import Taskbar from './shell/Taskbar.jsx';
import StartMenu from './shell/StartMenu.jsx';
import { useContextMenu } from './shell/ContextMenu.jsx';
import AppStore from './shell/AppStore.jsx';
import Settings from './shell/Settings.jsx';
import Properties from './shell/Properties.jsx';
import AddApp from './shell/AddApp.jsx';
import Sidebar from './shell/Sidebar.jsx';
import MobileDrawer from './shell/MobileDrawer.jsx';
import { startMoveDrag } from './shell/winDrag.js';
import { zoneRect } from './os/snap.js';
import { PLUGIN_IDS } from './os/registry.js';
import { wallpaperLayer } from './os/wallpapers.js';

/* Virtual apps that render in-window instead of an iframe. */
const VIRTUAL = {
  store: { name: 'App Store', render: () => <AppStore /> },
  settings: { name: 'Settings', render: () => <Settings /> },
};

// Only external, non-embeddable sites launch in a new tab.
const newTab = (app) => !app.embed && !PLUGIN_IDS.has(app.id);

function VirtualWindow({ win }) {
  const os = useOS();
  const v = VIRTUAL[win.appId];
  const focused = os.focused === win.id;
  const [hint, setHint] = useState(null); // snap zone under the pointer while dragging

  // Same shared drag as Window.jsx — virtual windows (App Store, Settings)
  // are ordinary movable windows with snapping and tear-off.
  const onTitlePointerDown = (e) => {
    if (e.target.closest('.tb-btn')) return;
    e.preventDefault();
    os.focus(win.id);
    startMoveDrag(e, win, os, setHint);
  };

  const style = win.max
    ? { left: 0, top: 0, width: '100%', height: '100%', zIndex: win.z }
    : { left: win.rect.x, top: win.rect.y, width: win.rect.w, height: win.rect.h, zIndex: win.z };
  return (
    <section
      className={`win ${focused ? 'focused' : ''} ${win.max ? 'maximized' : ''}`}
      style={{ ...style, display: win.min ? 'none' : undefined }}
      data-cm={`titlebar:${win.id}`}
      onPointerDownCapture={() => os.focus(win.id)}
      aria-label={v.name}
    >
      <header className="titlebar" onPointerDown={onTitlePointerDown} onDoubleClick={() => os.toggleMax(win.id)}>
        <span className="t">{v.name}</span>
        <button className="tb-btn min" title="Minimize" onClick={() => os.minimize(win.id)}>—</button>
        <button className="tb-btn max" title={win.max ? 'Restore' : 'Maximize'} onClick={() => os.toggleMax(win.id)}>{win.max ? '❐' : '□'}</button>
        <button className="tb-btn close" title="Close" onClick={() => os.close(win.id)}>✕</button>
      </header>
      <div className="win-body virtual">{v.render()}</div>
      {hint && hint !== 'top' && createPortal(
        <div id="snap-preview" style={{ ...zoneRect(hint) }} aria-hidden="true" />,
        document.body
      )}
    </section>
  );
}

const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag

export default function App() {
  const os = useOS();
  const [startOpen, setStartOpen] = useState(false);
  const [propsId, setPropsId] = useState(null);
  const [appDlg, setAppDlg] = useState(null); // null | 'new' | app row (edit)
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const drag = useRef(null); // { id, moved, order }

  // Context menu items per target kind.
  const buildItems = useCallback((kind, arg) => {
    switch (kind) {
      case 'desktop':
        return [
          { label: 'Open Terminal', hint: 'shell + js', run: () => os.launch('terminal') },
          { label: 'App Store…', run: () => os.launch('store') },
          '-',
          { label: 'Sort icons by name', run: () => os.sortDesktop() },
          { label: 'Rearrange freely', run: () => { os.setDesktop({ sort: 'custom' }); os.setOrder(os.apps.map((a) => a.id)); } },
          '-',
          { label: 'Add app…', hint: 'PWA / link', run: () => setAppDlg('new') },
          { label: 'Display settings…', run: () => os.launch('settings') },
          { label: 'Toggle fullscreen', hint: 'F11', run: () => document.dispatchEvent(new CustomEvent('webos:fullscreen')) },
        ];
      case 'icon': {
        const app = os.findApp(arg);
        if (!app) return [];
        const isPinned = (os.taskbar.pinned || []).includes(app.id);
        const items = [
          { label: `Open ${app.name}`, icon: app.icon, run: () => os.launch(app.id) },
        ];
        if (app.url) items.push({ label: 'Open in new tab', hint: '↗', run: () => window.open(app.url, '_blank', 'noopener') });
        items.push('-');
        items.push({ label: isPinned ? 'Unpin from taskbar' : 'Pin to taskbar', run: () => togglePin(app.id) });
        items.push({ label: 'Properties', hint: 'details', run: () => setPropsId(app.id) });
        if (os.isCustom(app.id)) {
          items.push({ label: 'Edit app…', run: () => setAppDlg(app) });
          items.push({ label: 'Remove', run: () => os.removeUserApp(app.id) });
        } else if (!os.isDefault(app.id)) {
          items.push({ label: 'Uninstall', run: () => os.uninstall(app.id) });
        } else {
          items.push({ label: `${app.name} (system app)`, disabled: true });
        }
        return items;
      }
      case 'pin': {
        const app = os.findApp(arg);
        if (!app) return [];
        return [
          { label: `Open ${app.name}`, icon: app.icon, run: () => os.launch(app.id) },
          ...(app.url ? [{ label: 'Open in new tab', hint: '↗', run: () => window.open(app.url, '_blank', 'noopener') }] : []),
          '-',
          { label: 'Unpin from taskbar', run: () => togglePin(arg) },
          { label: 'Properties', hint: 'details', run: () => setPropsId(app.id) },
        ];
      }
      case 'taskapp': {
        const w = os.windows.find((x) => x.id === Number(arg));
        const app = w && os.findApp(w.appId);
        if (!w || !app) return [];
        return [
          { label: w.min ? 'Restore' : 'Minimize', run: () => os.minimize(w.id) },
          ...(app.url ? [{ label: 'Open in new tab', run: () => window.open(app.url, '_blank', 'noopener') }] : []),
          '-',
          { label: 'Properties', run: () => setPropsId(app.id) },
          { label: 'Close window', run: () => os.close(w.id) },
        ];
      }
      case 'titlebar': {
        const w = os.windows.find((x) => x.id === Number(arg));
        const app = w && os.findApp(w.appId);
        if (!w || !app) return [];
        return [
          { label: 'Minimize', run: () => os.minimize(w.id) },
          { label: w.max ? 'Restore' : 'Maximize', run: () => os.toggleMax(w.id) },
          ...(app.url ? [{ label: 'Open in new tab', run: () => window.open(app.url, '_blank', 'noopener') }] : []),
          '-',
          { label: 'Properties', run: () => setPropsId(app.id) },
          { label: 'Close', run: () => os.close(w.id) },
        ];
      }
      case 'taskbar':
        return [
          { label: 'Widgets', hint: os.widgets.enabled.length ? `${os.widgets.enabled.length} enabled` : 'off', run: () => setWidgetsOpen((v) => !v) },
          { label: 'App Store…', run: () => os.launch('store') },
          { label: 'Settings…', run: () => os.launch('settings') },
          '-',
          { label: 'Close all windows', disabled: !os.windows.length, run: () => os.windows.forEach((w) => os.close(w.id)) },
        ];
      case 'tray':
        return [
          { label: 'Toggle fullscreen', run: () => document.dispatchEvent(new CustomEvent('webos:fullscreen')) },
          { label: 'Widgets', run: () => setWidgetsOpen((v) => !v) },
          { label: 'Settings…', run: () => os.launch('settings') },
        ];
      case 'clock':
        return [{ label: 'Open calendar', run: () => document.querySelector('#clock')?.click() }];
      default:
        return null;
    }
  }, [os]);
  const { menu } = useContextMenu(buildItems);

  const togglePin = (appId) => {
    const cur = os.taskbar.pinned || [];
    os.setTaskbar({ pinned: cur.includes(appId) ? cur.filter((id) => id !== appId) : [...cur, appId] });
  };

  // Close start menu on any outside click; expose os for VirtualWindow buttons.
  useEffect(() => {
    const h = () => setStartOpen(false);
    window.addEventListener('click', h);
    window.__os = os;
    return () => { window.removeEventListener('click', h); };
  }, [os]);

  // F11 native fullscreen passthrough.
  useEffect(() => {
    const h = (e) => { if (e.key === 'F11') { e.preventDefault(); document.dispatchEvent(new CustomEvent('webos:fullscreen')); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  // Window tiling keys: Meta+Arrow or Ctrl+Alt+Arrow on the focused window —
  // Left/Right = half, Up = maximize, Down = untile/unmaximize, else minimize.
  useEffect(() => {
    const h = (e) => {
      const mod = e.metaKey || (e.ctrlKey && e.altKey);
      if (!mod || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) return;
      const w = os.windows.find((x) => x.id === os.focused);
      if (!w || w.min) return;
      e.preventDefault();
      if (e.key === 'ArrowLeft') os.snap(w.id, 'left');
      else if (e.key === 'ArrowRight') os.snap(w.id, 'right');
      else if (e.key === 'ArrowUp') os.toggleMax(w.id);
      else if (w.max) os.toggleMax(w.id);
      else if (w.snap) os.restore(w.id);
      else os.minimize(w.id);
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [os]);

  // Deep link: ?open=<app-id>
  useEffect(() => {
    const want = new URLSearchParams(location.search).get('open');
    if (want && os.findApp(want)) os.launch(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os.apps.length]);

  /* -- desktop icon drag-to-rearrange --
     Press moves after a 6px threshold (so plain clicks still launch); while
     dragging, the hovered slot index is recomputed from live rects and the
     order updates immediately, so the rest of the grid springs aside.
     Dropping onto the taskbar pins the app instead of reordering. */
  const beginIconDrag = (e, id) => {
    if (e.button !== 0 || os.mobile || os.desktop.sort === 'name') return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let lastTarget = -1;
    let overTaskbar = false;
    const el = e.currentTarget;
    const move = (ev) => {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < DRAG_THRESHOLD) return;
      moved = true;
      el.classList.add('dragging');
      try { el.setPointerCapture?.(ev.pointerId); } catch { /* synthetic pointer ids are not active */ }
      const tb = document.querySelector('#taskbar');
      const tbr = tb?.getBoundingClientRect();
      const nowOver = !!tbr && ev.clientY >= tbr.top && ev.clientY <= tbr.bottom;
      if (nowOver !== overTaskbar) {
        overTaskbar = nowOver;
        document.querySelector('#task-apps')?.classList.toggle('drop-hint', overTaskbar);
      }
      if (overTaskbar) return; // hovering the bar: pin on drop, don't reorder
      const icons = [...document.querySelectorAll('#icon-grid .desk-icon')];
      const target = icons.findIndex((n) => {
        const r = n.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      });
      if (target < 0 || target === lastTarget) return;
      lastTarget = target;
      const ids = os.apps.map((a) => a.id);
      const from = ids.indexOf(id);
      if (from < 0) return;
      ids.splice(from, 1);
      const to = Math.max(0, Math.min(ids.length, target > from ? target - 1 : target));
      ids.splice(to, 0, id);
      if (ids.join() === os.apps.map((a) => a.id).join()) return; // no-op hover
      drag.current = { order: ids };
      os.setOrder(ids);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.classList.remove('dragging');
      document.querySelector('#task-apps')?.classList.remove('drop-hint');
      if (moved && overTaskbar) {
        // Insert by hovered pinned slot when one is under the pointer.
        const cur = os.taskbar.pinned || [];
        if (!cur.includes(id)) {
          const btns = [...document.querySelectorAll('#task-apps [data-pin]')];
          const hit = btns.findIndex((n) => {
            const r = n.getBoundingClientRect();
            return ev.clientX >= r.left && ev.clientX <= r.right;
          });
          const next = [...cur];
          if (hit >= 0) next.splice(btns[hit].dataset.pin | 0, 0, id);
          else next.push(id);
          os.setTaskbar({ pinned: next });
        }
        e.preventDefault();
        e.stopPropagation();
        drag.current = { swallowed: true }; // swallow the click that follows
        setTimeout(() => { drag.current = null; }, 0);
        return;
      }
      if (moved) {
        e.preventDefault();
        e.stopPropagation();
        drag.current = { swallowed: true }; // swallow the click that follows
        setTimeout(() => { drag.current = null; }, 0);
      }
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const iconClick = (id) => {
    if (drag.current?.swallowed) return;
    os.launch(id);
  };

  const desktopApps = os.apps;

  // Wallpaper renders in its own fixed layer (behind everything, slightly
  // oversized) so custom images can take blur/brightness/saturation filters.
  const wp = wallpaperLayer(os.theme);
  return (
    <>
      {wp && <div id="wallpaper" aria-hidden="true" style={wp} />}
      <main id="desktop" data-cm="desktop">
        <section id="icon-grid" aria-label="Applications">
          {desktopApps.map((app) => (
            <button
              key={app.id}
              className="desk-icon"
              data-cm={`icon:${app.id}`}
              onPointerDown={(e) => beginIconDrag(e, app.id)}
              onClick={() => iconClick(app.id)}
              title={`${app.name} — ${app.tagline}${newTab(app) ? ' (opens in new tab)' : ''}`}
            >
              <img src={app.icon} alt="" />
              <span className="lbl">{app.name}</span>
              <span className="ver">v{app.version}{newTab(app) ? ' ↗' : ''}</span>
            </button>
          ))}
        </section>
        <div id="windows">
          {os.windows.map((w) =>
            VIRTUAL[w.appId] ? <VirtualWindow key={w.id} win={w} /> : <Window key={w.id} win={w} />
          )}
        </div>
      </main>
      <StartMenu open={startOpen} onClose={() => setStartOpen(false)} openStore={() => os.launch('store')} openSettings={() => os.launch('settings')} />
      <Taskbar
        openStart={(e) => { e?.stopPropagation(); setStartOpen((v) => !v); }}
        startOpen={startOpen}
        openSettings={() => os.launch('settings')}
        openStore={() => os.launch('store')}
        toggleWidgets={() => setWidgetsOpen((v) => !v)}
        widgetsOpen={widgetsOpen}
      />
      {widgetsOpen && <Sidebar onClose={() => setWidgetsOpen(false)} />}
      {os.mobile && !drawerOpen && (
        <button id="home-fab" onClick={() => setDrawerOpen(true)} title="All apps" aria-label="All apps">
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <rect x="3.5" y="3.5" width="7.4" height="7.4" rx="1.6" /><rect x="13.1" y="3.5" width="7.4" height="7.4" rx="1.6" />
            <rect x="3.5" y="13.1" width="7.4" height="7.4" rx="1.6" /><rect x="13.1" y="13.1" width="7.4" height="7.4" rx="1.6" />
          </svg>
        </button>
      )}
      {drawerOpen && <MobileDrawer onClose={() => setDrawerOpen(false)} />}
      {propsId && <Properties appId={propsId} onClose={() => setPropsId(null)} />}
      {appDlg && <AddApp app={appDlg === 'new' ? null : appDlg} onClose={() => setAppDlg(null)} />}
      {menu}
    </>
  );
}
