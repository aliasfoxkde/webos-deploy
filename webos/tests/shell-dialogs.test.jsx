// Shell dialogs: StartMenu (search + browse + power), Welcome, AddApp,
// Properties, MobileDrawer, and the AppStore (grid, hero, install, detail).
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import { STORE_APPS } from '../src/os/registry.js';
import { PERSONAS } from '../src/os/personas.js';
import { VERSION } from '../src/version.js';
import StartMenu from '../src/shell/StartMenu.jsx';
import Welcome from '../src/shell/Welcome.jsx';
import AddApp from '../src/shell/AddApp.jsx';
import Properties, { Stars } from '../src/shell/Properties.jsx';
import MobileDrawer from '../src/shell/MobileDrawer.jsx';
import AppStore from '../src/shell/AppStore.jsx';

/* The hero pick is deterministic: highest rating, name tiebreak. */
const FEATURED_NAME = [...STORE_APPS]
  .filter((a) => a.rating != null)
  .sort((a, b) => (b.rating - a.rating) || a.name.localeCompare(b.name))[0].name;

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = (ui) => render(<OSProvider><Probe />{ui}</OSProvider>);
const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.style.cssText = '';
  document.body.removeAttribute('data-persona');
});

describe('StartMenu', () => {
  const setup = (open = true) => mount(
    <StartMenu open={open} onClose={noop} openStore={noop} openSettings={noop} onPower={noop} />
  );

  it('renders nothing when closed; browse view when open', () => {
    const c = setup(false);
    expect(c.container.querySelector('#start-menu')).toBeNull();
    const c2 = setup(true);
    expect(c2.container.querySelector('#start-menu')).toBeTruthy();
    expect(c2.container.textContent).toContain('Pinned');
    expect(c2.container.textContent).toContain('All apps');
    expect(c2.container.textContent).toContain('ArtCraft User');
  });

  it('pinned tiles and category groups come from the real registry', () => {
    const c = setup();
    const tiles = [...c.container.querySelectorAll('.sm-tile')].map((t) => t.textContent);
    expect(tiles).toContain('PhotoCraft');
    expect(tiles).toContain('Files');
    // every rendered app belongs to a named category section
    expect(c.container.querySelectorAll('.sm-cat').length).toBeGreaterThan(3);
  });

  it('search filters apps; Enter launches the first rendered hit and closes', () => {
    const onClose = vi.fn();
    const c = mount(<StartMenu open onClose={onClose} openStore={noop} openSettings={noop} onPower={noop} />);
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'photo' } });
    const hitButtons = [...c.container.querySelectorAll('.sm-app')];
    expect(hitButtons.some((b) => b.textContent.includes('PhotoCraft'))).toBe(true);
    // name text is the first child of the label span (the tagline is a sub-span)
    const firstName = hitButtons[0].querySelector('span > span')
      ? hitButtons[0].querySelector('span').childNodes[0].textContent
      : hitButtons[0].querySelector('span').textContent;
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    // Enter launches the FIRST rendered hit (search order, not registry order)
    const launched = cur.windows[cur.windows.length - 1];
    expect(cur.apps.find((a) => a.id === launched.appId).name).toBe(firstName);
  });

  it('search hits settings sections; Enter deep-links the settings window', () => {
    const c = setup();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'appear' } });
    expect(c.container.textContent).toContain('Settings');
    fireEvent.keyDown(input, { key: 'Enter' });
    const win = cur.windows[cur.windows.length - 1];
    expect(win.appId).toBe('settings');
    expect(win.args).toEqual({ initial: 'appearance' });
  });

  it('no matches points at the store; Ask AI row launches chat', () => {
    const openStore = vi.fn();
    const c = mount(<StartMenu open onClose={noop} openStore={openStore} openSettings={noop} onPower={noop} />);
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'zzzznothing' } });
    expect(c.container.textContent).toContain('No matches');
    fireEvent.click([...c.container.querySelectorAll('.sm-link')]
      .find((b) => b.textContent.includes('App Store')));
    expect(openStore).toHaveBeenCalled();
    // Ask AI (visible in results view) launches the chat plugin
    fireEvent.change(input, { target: { value: 'pho' } });
    fireEvent.click(c.container.querySelector('.sm-ai'));
    expect(cur.windows[cur.windows.length - 1].appId).toBe('chat');
  });

  it('Escape closes; footer links hand off to store and settings; power routes', () => {
    const onClose = vi.fn();
    const openStore = vi.fn();
    const openSettings = vi.fn();
    const onPower = vi.fn();
    const c = mount(
      <StartMenu open onClose={onClose} openStore={openStore} openSettings={openSettings} onPower={onPower} />
    );
    fireEvent.keyDown(c.container.querySelector('.sm-search'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
    const [storeLink, settingsLink] = c.container.querySelectorAll('.sm-links .sm-link');
    fireEvent.click(storeLink);
    expect(openStore).toHaveBeenCalled();
    fireEvent.click(settingsLink);
    expect(openSettings).toHaveBeenCalled();
    fireEvent.click(c.container.querySelector('.sm-pwr:not(.danger)'));
    expect(onPower).toHaveBeenCalledWith('restart');
    fireEvent.click(c.container.querySelector('.sm-pwr.danger'));
    expect(onPower).toHaveBeenCalledWith('shutdown');
  });

  it('Recommended lists recently launched apps', () => {
    const c = setup();
    expect(c.container.textContent).not.toContain('Recommended');
    act(() => cur.launch('calc'));
    act(() => { cur.windows.forEach(() => {}); });
    // relaunch open: recents now include calc
    const c2 = setup();
    expect(c2.container.textContent).toContain('Recommended');
    expect([...c2.container.querySelectorAll('.sm-app')].some((b) => b.textContent.includes('Calculator'))).toBe(true);
  });

  it('pinned tiles follow the persisted startPins slice; rows expose the pin menu', () => {
    localStorage.setItem('webos.taskbar', JSON.stringify({ startPins: ['calc'] }));
    const c = setup();
    const tiles = [...c.container.querySelectorAll('.sm-tile')];
    expect(tiles.map((t) => t.textContent)).toEqual(['Calculator']);
    expect(tiles[0].getAttribute('data-cm')).toBe('smapp:calc'); // right-click target
    // unpin everything: the grid empties but the menu keeps working
    act(() => cur.setTaskbar({ startPins: [] }));
    expect(c.container.querySelectorAll('.sm-tile')).toHaveLength(0);
    expect(c.container.textContent).toContain('All apps');
    // a stale pin (uninstalled app) renders as nothing, never a dead tile
    localStorage.setItem('webos.taskbar', JSON.stringify({ startPins: ['calc', 'not-an-app'] }));
    const c2 = setup();
    expect([...c2.container.querySelectorAll('.sm-tile')].map((t) => t.textContent)).toEqual(['Calculator']);
  });

  it('Arrow keys walk the focusable rows with wraparound; Home/End jump to the ends', () => {
    const c = setup();
    const rows = () => [...c.container.querySelectorAll('#start-menu button, #start-menu input')];
    const input = c.container.querySelector('.sm-search');
    input.focus();
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(rows()[1]);
    fireEvent.keyDown(document.activeElement, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(input); // back to the search box
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(rows()[rows().length - 1]); // wraps to last
    fireEvent.keyDown(document.activeElement, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(input); // …and forward wraps to first
    fireEvent.keyDown(input, { key: 'End' });
    expect(document.activeElement).toBe(rows()[rows().length - 1]);
    fireEvent.keyDown(document.activeElement, { key: 'Home' });
    expect(document.activeElement).toBe(input);
  });
});

describe('Welcome', () => {
  it('renders brand, version, features and one button per persona', () => {
    const c = mount(<Welcome onEnter={noop} />);
    expect(c.container.textContent).toContain(`v${VERSION}`);
    expect(c.container.querySelectorAll('.wl-p')).toHaveLength(PERSONAS.length);
    expect(c.container.querySelector('.wl-p.on')).toBeTruthy(); // default persona preselected
  });

  it('picking a persona applies it immediately; Enter hands off', () => {
    const onEnter = vi.fn();
    const c = mount(<Welcome onEnter={onEnter} />);
    const mac = [...c.container.querySelectorAll('.wl-p')].find((b) => b.textContent.includes('macOS'));
    fireEvent.click(mac);
    expect(cur.persona).toBe('mac');
    expect(mac.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(c.container.querySelector('.wl-enter'));
    expect(onEnter).toHaveBeenCalledOnce();
  });
});

describe('AddApp', () => {
  const setup = (app) => mount(<AddApp app={app} onClose={noop} />);

  it('create mode: validation for missing name and bad URL', () => {
    const c = setup();
    expect(c.container.querySelector('h3').textContent).toBe('Add an app');
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(c.container.querySelector('.wx-err').textContent).toBe('Give the app a name.');
    fireEvent.change(c.container.querySelectorAll('.addapp-form input')[0], { target: { value: 'My App' } });
    fireEvent.change(c.container.querySelectorAll('.addapp-form input')[1], { target: { value: 'notaurl' } });
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(c.container.querySelector('.wx-err').textContent).toBe('Enter a valid http(s) link.');
    expect(cur.userApps).toEqual([]);
  });

  it('create mode: a valid form adds a user app and closes', () => {
    const onClose = vi.fn();
    const c = mount(<AddApp onClose={onClose} />);
    const [name, link] = c.container.querySelectorAll('.addapp-form input');
    fireEvent.change(name, { target: { value: '  My Reader  ' } });
    fireEvent.change(link, { target: { value: 'https://reader.example/feed' } });
    fireEvent.change(c.container.querySelector('textarea'), { target: { value: 'Read feeds\nsecond line' } });
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(cur.userApps).toHaveLength(1);
    const app = cur.userApps[0];
    expect(app.name).toBe('My Reader');
    expect(app.url).toBe('https://reader.example/feed');
    expect(app.id).toMatch(/^user-/);
    expect(app.tagline).toBe('Read feeds');
    expect(app.category).toBe('Custom');
    expect(app.embed).toBe(false);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('toggles land on the created app', () => {
    const c = setup();
    const checks = c.container.querySelectorAll('input[type="checkbox"]');
    fireEvent.click(checks[0]);
    fireEvent.click(checks[1]);
    fireEvent.change(c.container.querySelectorAll('.addapp-form input')[0], { target: { value: 'X' } });
    fireEvent.change(c.container.querySelectorAll('.addapp-form input')[1], { target: { value: 'http://x.example' } });
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(cur.userApps[0].embed).toBe(true);
    expect(cur.userApps[0].singleInstance).toBe(true);
  });

  it('edit mode: pre-fills and updates in place', () => {
    const app = {
      id: 'user-abc', name: 'Old', url: 'https://old.example', icon: 'icons/custom.svg',
      tagline: 'Web app', version: '1.0', accent: '#38bdf8', embed: true,
      singleInstance: false, developer: 'You', category: 'Custom', description: 'd',
    };
    const c = mount(<AddApp app={app} onClose={noop} />);
    act(() => cur.addUserApp(app));
    expect(c.container.querySelector('h3').textContent).toBe('Edit Old');
    expect(c.container.querySelectorAll('.addapp-form input')[0].value).toBe('Old');
    fireEvent.change(c.container.querySelectorAll('.addapp-form input')[0], { target: { value: 'New' } });
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(cur.userApps).toHaveLength(1);
    expect(cur.userApps[0].name).toBe('New');
  });

  it('focuses the name field on open; Escape and backdrop close', () => {
    const onClose = vi.fn();
    const c = mount(<AddApp onClose={onClose} />);
    expect(document.activeElement).toBe(c.container.querySelector('.addapp-form input'));
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledOnce();
    // backdrop dismiss only fires for the backdrop itself
    fireEvent.pointerDown(c.container.querySelector('.modal-backdrop'));
    expect(onClose).toHaveBeenCalledTimes(2);
    fireEvent.pointerDown(c.container.querySelector('.props'));
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('oversized icon uploads are refused with an alert', () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    const c = setup();
    const fileInput = c.container.querySelector('input[type="file"]');
    const big = { size: 600 * 1024 };
    Object.defineProperty(fileInput, 'files', { value: [big] });
    fireEvent.change(fileInput);
    expect(alertSpy).toHaveBeenCalledOnce();
    expect(alertSpy.mock.calls[0][0]).toContain('512');
    expect(cur.userApps).toEqual([]);
    vi.unstubAllGlobals();
  });
});

describe('Properties', () => {
  it('plugin apps show system kind, rating, and launch/none-uninstall actions', () => {
    const onClose = vi.fn();
    const c = mount(<Properties appId="calc" onClose={onClose} />);
    expect(c.container.querySelector('h3').textContent).toBe('Calculator');
    expect(c.container.textContent).toContain('System plugin');
    expect([...c.container.querySelectorAll('.props-actions .btn')].map((b) => b.textContent))
      .toEqual(['Open', 'Close']);
    fireEvent.click(c.container.querySelector('.props-actions .btn.accent'));
    expect(cur.windows).toHaveLength(1);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('installed store apps show the installed kind with Open/Uninstall', () => {
    // Properties only ever opens for VISIBLE apps (desktop/taskbar/titlebar),
    // and uninstalled store apps are not on the desktop — install first.
    const storeId = STORE_APPS.find((a) => !cur.installed.includes(a.id)).id;
    // mount first, then install in the SAME tree (a fresh provider reads
    // localStorage, and the install only persists from a mounted tree)
    const c = mount(<Properties appId={storeId} onClose={noop} />);
    expect(c.container.textContent).toBe(''); // not visible until installed
    act(() => cur.install(storeId));
    expect(c.container.textContent).toContain('Store app (installed)');
    const actions = [...c.container.querySelectorAll('.props-actions .btn')].map((b) => b.textContent);
    expect(actions).toContain('Open');
    expect(actions).toContain('Uninstall');
    fireEvent.click(c.container.querySelector('.props-actions .btn.danger'));
    expect(cur.installed).not.toContain(storeId);
  });

  it('custom apps show the custom kind and a Remove action', () => {
    const app = {
      id: 'user-xyz', name: 'Mine', url: 'https://mine.example', icon: 'icons/custom.svg',
      tagline: 'Web app', version: '1.0', accent: '#38bdf8', embed: false,
      singleInstance: false, developer: 'You', category: 'Custom', description: 'd',
    };
    const onClose = vi.fn();
    const c = mount(<Properties appId="user-xyz" onClose={onClose} />);
    act(() => cur.addUserApp(app)); // same tree: Properties re-renders with the row
    expect(c.container.textContent).toContain('Your app (custom link)');
    fireEvent.click(c.container.querySelector('.props-actions .btn.danger'));
    expect(cur.userApps).toHaveLength(0);
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('Escape and backdrop clicks close; dialog body clicks do not', () => {
    const onClose = vi.fn();
    const c = mount(<Properties appId="calc" onClose={onClose} />);
    fireEvent.pointerDown(c.container.querySelector('.props'));
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.pointerDown(c.container.querySelector('.modal-backdrop'));
    expect(onClose).toHaveBeenCalledOnce();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it('unknown app ids render nothing', () => {
    const c = mount(<Properties appId="ghost" onClose={noop} />);
    expect(c.container.querySelector('.props')).toBeNull();
  });
});

describe('Stars', () => {
  it('rounds the rating and labels it for assistive tech', () => {
    const c = render(<Stars rating={3.6} />);
    expect(c.container.querySelectorAll('.on')).toHaveLength(4);
    expect(c.container.firstChild.getAttribute('aria-label')).toBe('3.6 out of 5 stars');
  });
});

describe('MobileDrawer', () => {
  it('lists every app; search filters; launch closes and opens', () => {
    const onClose = vi.fn();
    const c = mount(<MobileDrawer onClose={onClose} />);
    expect(c.container.querySelectorAll('.drawer-app').length).toBe(cur.apps.length);
    const input = c.container.querySelector('input[type="search"]');
    fireEvent.change(input, { target: { value: 'calc' } });
    const hits = [...c.container.querySelectorAll('.drawer-app')];
    expect(hits).toHaveLength(1);
    fireEvent.click(hits[0]);
    expect(onClose).toHaveBeenCalledOnce();
    expect(cur.windows).toHaveLength(1);
  });

  it('no matches shows a message; footer store button only when not searching', () => {
    const c = mount(<MobileDrawer onClose={noop} />);
    expect(c.container.textContent).toContain('App Store');
    const input = c.container.querySelector('input[type="search"]');
    fireEvent.change(input, { target: { value: 'zzzz' } });
    expect(c.container.textContent).toContain('No apps match');
    expect(c.container.textContent).not.toContain('App Store');
  });
});

describe('AppStore', () => {
  it('lists all store apps with ratings and the featured hero', () => {
    const c = mount(<AppStore />);
    expect(c.container.querySelectorAll('.store-card')).toHaveLength(STORE_APPS.length);
    expect(c.container.querySelector('.store-hero')).toBeTruthy();
    expect(c.container.querySelector('.store-hero h3').textContent).toBeTruthy();
    expect(c.container.querySelectorAll('.store-cats .chip').length).toBeGreaterThan(2);
  });

  it('category chips and search narrow the grid; misses explain themselves', () => {
    const c = mount(<AppStore />);
    const byCat = [...c.container.querySelectorAll('.store-cats .chip')]
      .find((b) => b.textContent !== 'All' && STORE_APPS.some((a) => a.category === b.textContent));
    const before = c.container.querySelectorAll('.store-card').length;
    fireEvent.click(byCat);
    expect(c.container.querySelectorAll('.store-card').length).toBeLessThan(before);
    const input = c.container.querySelector('.store-search');
    fireEvent.change(input, { target: { value: 'zzzznomatch' } });
    expect(c.container.textContent).toContain('No apps match');
    // back to All so the search target is actually in the filtered set
    fireEvent.click([...c.container.querySelectorAll('.store-cats .chip')]
      .find((b) => b.textContent === 'All'));
    fireEvent.change(input, { target: { value: STORE_APPS[0].name.toLowerCase() } });
    expect(c.container.querySelectorAll('.store-card')).toHaveLength(1);
  });

  it('install → open/uninstall lifecycle through the card buttons', () => {
    const c = mount(<AppStore />);
    const card = c.container.querySelector('.store-card');
    const appId = STORE_APPS.find((a) => a.name === card.querySelector('strong').textContent).id;
    fireEvent.click(card.querySelector('.store-actions .btn.accent'));
    expect(cur.installed).toContain(appId);
    const after = [...c.container.querySelectorAll('.store-card')]
      .find((el) => el.querySelector('strong').textContent === STORE_APPS.find((a) => a.id === appId).name);
    expect(after.querySelector('.store-actions .btn.accent').textContent).toBe('Open');
    fireEvent.click(after.querySelector('.store-actions .btn.danger'));
    expect(cur.installed).not.toContain(appId);
  });

  it('persona changes the store voice (tui speaks in bracket verbs)', () => {
    const c = mount(<AppStore />);
    expect(c.container.querySelector('.store-actions .btn.accent').textContent).toBe('Get');
    act(() => cur.setPersona('tui'));
    expect(c.container.querySelector('.store-actions .btn.accent').textContent).toBe('[ install ]');
    expect(c.container.querySelector('.hero-kicker').textContent).toBe('featured');
  });

  it('the hero button opens the detail page; back returns to the grid', () => {
    const c = mount(<AppStore />);
    fireEvent.click(c.container.querySelector('.hero-icon'));
    const d = c.container.querySelector('.store-detail');
    expect(d).toBeTruthy();
    expect(d.querySelector('h2').textContent).toBe(FEATURED_NAME);
    expect(d.querySelector('dl.props-grid')).toBeTruthy();
    expect(d.textContent).toMatch(/reviews/i);
    fireEvent.click(d.querySelector('button.back'));
    expect(c.container.querySelector('.store-grid')).toBeTruthy();
  });

  it('card icon opens the detail page for that app with install action', () => {
    const c = mount(<AppStore />);
    const target = STORE_APPS.find((a) => !cur.installed.includes(a.id));
    const card = [...c.container.querySelectorAll('.store-card')]
      .find((el) => el.querySelector('strong').textContent === target.name);
    fireEvent.click(card.querySelector('.store-icon'));
    expect(c.container.querySelector('.store-detail h2').textContent).toBe(target.name);
    const install = c.container.querySelector('.store-detail .btn.accent');
    fireEvent.click(install);
    expect(cur.installed).toContain(target.id);
  });
});
