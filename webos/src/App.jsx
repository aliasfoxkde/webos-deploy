import React, { useCallback, useEffect, useState } from 'react';
import { useOS } from './os/state.jsx';
import Window from './shell/Window.jsx';
import Taskbar from './shell/Taskbar.jsx';
import StartMenu from './shell/StartMenu.jsx';
import { useContextMenu } from './shell/ContextMenu.jsx';
import AppStore from './shell/AppStore.jsx';
import Settings from './shell/Settings.jsx';
import { PLUGIN_IDS } from './os/registry.js';

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
      <header className="titlebar" onDoubleClick={() => os.toggleMax(win.id)}>
        <span className="t">{v.name}</span>
        <button className="tb-btn min" title="Minimize" onClick={() => os.minimize(win.id)}>—</button>
        <button className="tb-btn max" title={win.max ? 'Restore' : 'Maximize'} onClick={() => os.toggleMax(win.id)}>{win.max ? '❐' : '□'}</button>
        <button className="tb-btn close" title="Close" onClick={() => os.close(win.id)}>✕</button>
      </header>
      <div className="win-body virtual">{v.render()}</div>
    </section>
  );
}

export default function App() {
  const os = useOS();
  const [startOpen, setStartOpen] = useState(false);

  // Context menu items per target kind.
  const buildItems = useCallback((kind, arg) => {
    switch (kind) {
      case 'desktop':
        return [
          { label: 'Open Terminal', hint: 'shell + js', run: () => os.launch('terminal') },
          { label: 'App Store…', run: () => os.launch('store') },
          '-',
          { label: 'Change theme…', run: () => os.launch('settings') },
          { label: 'Toggle fullscreen', hint: 'F11', run: () => document.dispatchEvent(new CustomEvent('webos:fullscreen')) },
        ];
      case 'icon': {
        const app = os.findApp(arg);
        if (!app) return [];
        const items = [
          { label: `Open ${app.name}`, icon: app.icon, run: () => os.launch(app.id) },
        ];
        if (app.url) items.push({ label: 'Open in new tab', hint: '↗', run: () => window.open(app.url, '_blank', 'noopener') });
        items.push('-');
        if (!os.isDefault(app.id)) {
          items.push({ label: 'Uninstall', run: () => os.uninstall(app.id) });
        } else {
          items.push({ label: `${app.name} (system app)`, disabled: true });
        }
        return items;
      }
      case 'taskapp': {
        const w = os.windows.find((x) => x.id === Number(arg));
        const app = w && os.findApp(w.appId);
        if (!w || !app) return [];
        return [
          { label: w.min ? 'Restore' : 'Minimize', run: () => os.minimize(w.id) },
          ...(app.url ? [{ label: 'Open in new tab', run: () => window.open(app.url, '_blank', 'noopener') }] : []),
          '-',
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
          { label: 'Close', run: () => os.close(w.id) },
        ];
      }
      case 'taskbar':
        return [
          { label: 'App Store…', run: () => os.launch('store') },
          { label: 'Settings…', run: () => os.launch('settings') },
          '-',
          { label: 'Close all windows', disabled: !os.windows.length, run: () => os.windows.forEach((w) => os.close(w.id)) },
        ];
      case 'tray':
        return [
          { label: 'Toggle fullscreen', run: () => document.dispatchEvent(new CustomEvent('webos:fullscreen')) },
          { label: 'Settings…', run: () => os.launch('settings') },
        ];
      case 'clock':
        return [{ label: 'Open calendar', run: () => document.querySelector('#clock')?.click() }];
      default:
        return null;
    }
  }, [os]);
  const { menu } = useContextMenu(buildItems);

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

  // Deep link: ?open=<app-id>
  useEffect(() => {
    const want = new URLSearchParams(location.search).get('open');
    if (want && os.findApp(want)) os.launch(want);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [os.apps.length]);

  const desktopApps = os.apps;

  return (
    <>
      <main id="desktop" data-cm="desktop">
        <section id="icon-grid" aria-label="Applications">
          {desktopApps.map((app) => (
            <button
              key={app.id}
              className="desk-icon"
              data-cm={`icon:${app.id}`}
              onClick={() => os.launch(app.id)}
              onDoubleClick={() => os.launch(app.id)}
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
      />
      {menu}
    </>
  );
}
