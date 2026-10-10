import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import Welcome from './shell/Welcome.jsx';
import { startMoveDrag } from './shell/winDrag.js';
import { zoneRect } from './os/snap.js';
import { PLUGIN_IDS } from './os/registry.js';
import { wallpaperLayer } from './os/wallpapers.js';

/* Virtual apps that render in-window instead of an iframe. */
const VIRTUAL = {
  store: { name: 'App Store', render: (win) => <AppStore /> },
  settings: { name: 'Settings', render: (win) => <Settings args={win.args} /> },
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
      data-id={win.id}
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
      <div className="win-body virtual">{v.render(win)}</div>
      {hint && hint !== 'top' && createPortal(
        <div id="snap-preview" style={{ ...zoneRect(hint) }} aria-hidden="true" />,
        document.body
      )}
    </section>
  );
}

const DRAG_THRESHOLD = 6; // px of movement before a press becomes a drag

/* Group popup: rename, launch members, unfile members, remove the group. */
function GroupPopup({ groupId, onClose }) {
  const os = useOS();
  const group = os.groups.find((g) => g.id === groupId);
  const [name, setName] = useState(group?.name || '');
  useEffect(() => { setName(group?.name || ''); }, [group?.name]);
  if (!group) return null;
  const members = group.appIds.map((id) => os.findApp(id)).filter(Boolean);
  return (
    <>
      <div className="gp-backdrop" onClick={onClose} />
      <section className="gp" role="dialog" aria-label={group.name}>
        <header className="gp-head">
          <input
            className="gp-name"
            value={name}
            aria-label="Group name"
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
            onBlur={() => os.renameGroup(group.id, name.trim() || group.name)}
          />
          <button className="gp-x" onClick={onClose} title="Close">✕</button>
        </header>
        <div className="gp-list">
          {members.map((app) => (
            <div key={app.id} className="gp-row">
              <button className="gp-app" onClick={() => { os.launch(app.id); onClose(); }} title={`Open ${app.name}`}>
                <img src={app.icon} alt="" />
                <span>{app.name}</span>
              </button>
              <button className="gp-rm" title={`Remove ${app.name} from group`} onClick={() => os.groupRemove(group.id, app.id)}>✕</button>
            </div>
          ))}
          {!members.length && <div className="gp-empty">Empty group — drag app icons onto the folder tile to file them here.</div>}
        </div>
        <footer className="gp-foot">
          <button className="gp-del" onClick={() => { os.removeGroup(group.id); onClose(); }}>Remove group</button>
          <span className="hint">icons return to the desktop</span>
        </footer>
      </section>
    </>
  );
}

export default function App() {
  const os = useOS();
  const [startOpen, setStartOpen] = useState(false);
  const [propsId, setPropsId] = useState(null);
  const [appDlg, setAppDlg] = useState(null); // null | 'new' | app row (edit)
  const [widgetsOpen, setWidgetsOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [openGroupId, setOpenGroupId] = useState(null);
  // First-run welcome: skipped for ?open= deep links (app-first UX), reopenable
  // from Settings → About via the webos:welcome event.
  const [welcome, setWelcome] = useState(() =>
    !localStorage.getItem('webos.welcomed') && !new URLSearchParams(location.search).get('open'));
  const drag = useRef(null); // { id, moved, order }

  useEffect(() => {
    const h = () => setWelcome(true);
    window.addEventListener('webos:welcome', h);
    return () => window.removeEventListener('webos:welcome', h);
  }, []);
  const enterWelcome = () => {
    try { localStorage.setItem('webos.welcomed', 'true'); } catch { /* private mode */ }
    setWelcome(false);
  };

  // Power menu (start menu footer): restart reloads, shut down shows the
  // halt overlay — a browser page can't actually power anything off, so the
  // overlay says exactly that and offers "Power on" (reload).
  const [halted, setHalted] = useState(false);
  const power = (action) => {
    if (action === 'restart') location.reload();
    else setHalted(true);
  };

  /* Desktop flow: loose apps + group tiles arranged by the saved order.
     `desktop.order` stores app ids AND group ids; grouped apps are hidden
     from the grid — they live inside their group tile. */
  const memberOf = useMemo(() => {
    const m = new Map();
    os.groups.forEach((g) => g.appIds.forEach((id) => m.set(id, g.id)));
    return m;
  }, [os.groups]);
  const desktopApps = os.apps;
  const entries = useMemo(() => {
    const known = new Map(os.groups.map((g) => [g.id, { kind: 'group', id: g.id, group: g }]));
    desktopApps.forEach((a) => { if (!memberOf.has(a.id)) known.set(a.id, { kind: 'app', id: a.id, app: a }); });
    const out = [];
    const seen = new Set();
    const put = (e) => { if (e && !seen.has(e.id)) { seen.add(e.id); out.push(e); } };
    os.order.forEach((id) => put(known.get(id)));
    known.forEach((e) => put(e));
    return out;
  }, [desktopApps, os.groups, os.order, memberOf]);

  // Context menu items per target kind.
  const buildItems = useCallback((kind, arg) => {
    switch (kind) {
      case 'desktop':
        return [
          { label: 'Open Terminal', hint: 'shell + js', run: () => os.launch('terminal') },
          { label: 'App Store…', run: () => os.launch('store') },
          '-',
          { label: 'Sort icons by name', run: () => os.sortDesktop() },
          { label: 'Rearrange freely', run: () => { os.setDesktop({ sort: 'custom' }); os.setOrder([...os.apps.map((a) => a.id), ...os.groups.map((g) => g.id)]); } },
          '-',
          { label: 'New group', hint: 'drag icons in', run: () => os.addGroup({ id: `grp-${Date.now().toString(36)}`, name: 'New group', appIds: [] }) },
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
      case 'group': {
        const g = os.groups.find((x) => x.id === arg);
        if (!g) return [];
        return [
          { label: `Open ${g.name}`, hint: `${g.appIds.length} apps`, run: () => setOpenGroupId(g.id) },
          '-',
          { label: 'Remove group', hint: 'icons return', run: () => os.removeGroup(g.id) },
        ];
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

  // Focus follows the mouse (Settings → Desktop → Windows): hovering a window
  // raises it, X11-style. Off by default — clicks remain the normal focus path.
  useEffect(() => {
    if (!os.ui.focusHover || os.mobile) return undefined;
    const h = (e) => {
      const el = e.target.closest?.('.win[data-id]');
      if (!el) return;
      const id = Number(el.dataset.id);
      if (id && id !== os.focused && os.windows.some((w) => w.id === id && !w.min)) os.focus(id);
    };
    document.getElementById('windows')?.addEventListener('pointerover', h);
    return () => document.getElementById('windows')?.removeEventListener('pointerover', h);
  }, [os]);

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
     Dropping onto the taskbar pins the app; dropping onto a group tile files
     the app into that group. Works for group tiles too (reorder only). */
  const beginIconDrag = (e, id) => {
    if (e.button !== 0 || os.mobile || os.desktop.sort === 'name') return;
    const startX = e.clientX, startY = e.clientY;
    let moved = false;
    let lastTarget = -1;
    let overTaskbar = false;
    let overGroup = null; // group tile id under the pointer, if any
    const el = e.currentTarget;
    const swallow = () => {
      e.preventDefault();
      e.stopPropagation();
      drag.current = { swallowed: true }; // swallow the click that follows
      setTimeout(() => { drag.current = null; }, 0);
    };
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
      const hit = (n) => {
        const r = n.getBoundingClientRect();
        return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
      };
      // Hovering a group tile files the icon into it on drop (no nesting).
      const gid = id.startsWith('grp-')
        ? null
        : icons.find((n) => n.dataset.gid && n.dataset.gid !== id && hit(n))?.dataset.gid || null;
      if (gid !== overGroup) {
        icons.find((n) => n.dataset.gid === overGroup)?.classList.remove('drop-hint');
        overGroup = gid;
        icons.find((n) => n.dataset.gid === gid)?.classList.add('drop-hint');
      }
      if (overGroup) return;
      const target = icons.findIndex(hit);
      if (target < 0 || target === lastTarget) return;
      lastTarget = target;
      const ids = entries.map((x) => x.id);
      const from = ids.indexOf(id);
      if (from < 0) return;
      ids.splice(from, 1);
      const to = Math.max(0, Math.min(ids.length, target > from ? target - 1 : target));
      ids.splice(to, 0, id);
      if (ids.join() === entries.map((x) => x.id).join()) return; // no-op hover
      drag.current = { order: ids };
      os.setOrder(ids);
    };
    const up = (ev) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      el.classList.remove('dragging');
      document.querySelector('#task-apps')?.classList.remove('drop-hint');
      document.querySelector('#icon-grid .desk-icon.drop-hint')?.classList.remove('drop-hint');
      if (moved && overGroup) { os.groupAdd(overGroup, id); swallow(); return; }
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
        swallow();
        return;
      }
      if (moved) swallow();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const iconClick = (id) => {
    if (drag.current?.swallowed) return;
    os.launch(id);
  };

  const groupClick = (gid) => {
    if (drag.current?.swallowed) return;
    setOpenGroupId(gid);
  };

  // Wallpaper renders in its own fixed layer (behind everything, slightly
  // oversized) so custom images can take blur/brightness/saturation filters.
  const wp = wallpaperLayer(os.theme);
  return (
    <>
      {wp && <div id="wallpaper" aria-hidden="true" style={wp} />}
      <main id="desktop" data-cm="desktop">
        <section id="icon-grid" aria-label="Applications">
          {entries.map((e) => (e.kind === 'group' ? (
            <button
              key={e.id}
              className="desk-icon group-tile"
              data-gid={e.id}
              data-cm={`group:${e.id}`}
              onPointerDown={(ev) => beginIconDrag(ev, e.id)}
              onClick={() => groupClick(e.id)}
              title={`${e.group.name} — group of ${e.group.appIds.length}`}
            >
              <span className="g-thumb" aria-hidden="true">
                {e.group.appIds.slice(0, 4).map((id) => {
                  const app = os.findApp(id);
                  return app ? <img key={id} src={app.icon} alt="" /> : null;
                })}
              </span>
              <span className="lbl">{e.group.name}</span>
              <span className="ver">{e.group.appIds.length} app{e.group.appIds.length === 1 ? '' : 's'}</span>
            </button>
          ) : (
            <button
              key={e.id}
              className="desk-icon"
              data-cm={`icon:${e.id}`}
              onPointerDown={(ev) => beginIconDrag(ev, e.id)}
              onClick={() => iconClick(e.id)}
              title={`${e.app.name} — ${e.app.tagline}${newTab(e.app) ? ' (opens in new tab)' : ''}`}
            >
              <img src={e.app.icon} alt="" />
              <span className="lbl">{e.app.name}</span>
              <span className="ver">v{e.app.version}{newTab(e.app) ? ' ↗' : ''}</span>
            </button>
          )))}
        </section>
        <div id="windows">
          {os.windows.map((w) =>
            VIRTUAL[w.appId] ? <VirtualWindow key={w.id} win={w} /> : <Window key={w.id} win={w} />
          )}
        </div>
      </main>
      <StartMenu
        open={startOpen}
        onClose={() => setStartOpen(false)}
        openStore={() => os.launch('store')}
        openSettings={(args) => os.launch('settings', args)}
        onPower={(action) => { setStartOpen(false); power(action); }}
      />
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
      {openGroupId && <GroupPopup groupId={openGroupId} onClose={() => setOpenGroupId(null)} />}
      {appDlg && <AddApp app={appDlg === 'new' ? null : appDlg} onClose={() => setAppDlg(null)} />}
      {welcome && <Welcome onEnter={enterWelcome} />}
      {halted && (
        <div id="halt" role="alertdialog" aria-label="System shut down">
          <div className="halt-card">
            <div className="halt-logo" aria-hidden="true">⏻</div>
            <h2>System halted</h2>
            <p className="dim">It is now safe to close this browser tab. Nothing is running.</p>
            <button className="btn accent" onClick={() => location.reload()}>Power on</button>
          </div>
        </div>
      )}
      {menu}
    </>
  );
}
