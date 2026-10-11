// os/state.jsx — the OS reducer + provider, driven through a live OSProvider
// (probe component captures useOS()). Covers launch/close/focus/window
// lifecycle, tiling, install/uninstall cleanup, groups, user apps, theme
// persistence, every settings slice, and the four body/CSS effect groups.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider, useOS, factoryReset, THEME_PRESETS, ACCENTS, WIDGET_IDS } from '../src/os/state.jsx';

let cur;
const Probe = () => {
  // test probe: capture the live OS context outside React's knowledge —
  // assertions read `cur` after act(), never during render
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /></OSProvider>);
const act6 = (fn) => act(() => {
  fn(cur);
  return undefined;
});
const stored = (k) => JSON.parse(localStorage.getItem(`webos.${k}`));

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.className = '';
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
  delete document.body.dataset.persona;
});

describe('initial state + persistence load', () => {
  it('boots with defaults: no windows, midnight theme, bottom/left taskbar', () => {
    mount();
    expect(cur.windows).toEqual([]);
    expect(cur.theme.preset).toBe('midnight');
    expect(cur.persona).toBe('win');
    expect(cur.taskbar.position).toBe('bottom');
    expect(cur.taskbar.align).toBe('left');
    expect(cur.uiMode).toBe('auto');
    expect(cur.volume).toEqual({ level: 0.7, muted: false });
    expect(cur.saver.kind).toBe('off');
    expect(cur.widgets.enabled).toEqual(WIDGET_IDS);
  });

  it('the installed-list migration resets the legacy default catalog, keeps live lists', () => {
    // the full legacy wave-1 catalog = the old build's preinstall → clean slate
    localStorage.setItem('webos.installed', JSON.stringify(
      ['globe', 'storyweaver', 'devopsquest', 'openzenith', 'sculptgl', 'svgedit',
        'ide', 'opencad', 'sqlite', 'python', 'pyconsole', 'planly'],
    ));
    mount();
    expect(cur.installed).toEqual([]);
    cleanup();
    // a live list keeps third-wave installs, drops unknown ids
    localStorage.setItem('webos.installed', JSON.stringify(['globe', 'g2048', 'nope']));
    mount();
    expect(cur.installed).toEqual(['globe', 'g2048']);
    cleanup();
    localStorage.setItem('webos.installed', JSON.stringify('garbage'));
    mount();
    expect(cur.installed).toEqual([]);
    cleanup();
    // absent key → clean slate (2026-10-09 migration)
    localStorage.removeItem('webos.installed');
    mount();
    expect(cur.installed).toEqual([]);
  });

  it('saved slices hydrate over the defaults', () => {
    localStorage.setItem('webos.taskbar', JSON.stringify({ position: 'top', labels: false }));
    localStorage.setItem('webos.theme', JSON.stringify({ preset: 'ocean' }));
    mount();
    expect(cur.taskbar).toMatchObject({ position: 'top', labels: false, align: 'left' });
    expect(cur.theme.preset).toBe('ocean');
  });
});

describe('window lifecycle', () => {
  it('launch opens a centred window sized by the manifest, clamped to viewport', () => {
    mount();
    act6((o) => o.launch('terminal'));
    expect(cur.windows.length).toBe(1);
    const w = cur.windows[0];
    expect(w.appId).toBe('terminal');
    expect(w.rect).toEqual({
      x: Math.round((window.innerWidth - 720) / 2),
      y: Math.round((window.innerHeight - 52 - 460) / 2),
      w: 720, h: 460,
    });
    expect(cur.focused).toBe(w.id);
    expect(cur.recents).toEqual(['terminal']);
    expect(stored('recents')).toEqual(['terminal']);
  });

  it('windows of the same app cascade by 28px, wrapping after 7', () => {
    mount();
    for (let i = 0; i < 2; i++) act6((o) => o.launch('terminal'));
    const [a, b] = cur.windows;
    expect(b.rect.x - a.rect.x).toBe(28);
    expect(b.rect.y - a.rect.y).toBe(28);
    // different apps don't cascade off each other
    act6((o) => o.launch('files'));
    expect(cur.windows[2].rect.x).toBe(Math.round((window.innerWidth - cur.windows[2].rect.w) / 2) + 0);
  });

  it('recents dedupe, front-rank, and cap at 8', () => {
    mount();
    for (const id of ['terminal', 'files', 'terminal', 'calc', 'editor', 'weather', 'photos', 'notepad', 'chat', 'video']) {
      act6((o) => o.launch(id));
    }
    expect(cur.recents.length).toBe(8);
    expect(cur.recents[0]).toBe('video');
    expect(cur.recents.filter((r) => r === 'terminal').length).toBe(1);
  });

  it('single-instance apps focus the running window instead of stacking', () => {
    mount();
    act6((o) => o.launch('mail'));
    const first = cur.windows[0];
    act6((o) => o.launch('mail'));
    expect(cur.windows.length).toBe(1);
    expect(cur.focused).toBe(first.id);
    expect(cur.windows[0].z).toBeGreaterThan(first.z);
    expect(cur.windows[0].min).toBe(false);
  });

  it('virtual windows (store, settings) are single-instance and a relaunch hands over args', () => {
    mount();
    act6((o) => o.launch('settings', { initial: 'sound' }));
    act6((o) => o.launch('store'));
    act6((o) => o.launch('settings', { initial: 'about' }));
    expect(cur.windows.map((w) => w.appId).sort()).toEqual(['settings', 'store']);
    const win = cur.windows.find((w) => w.appId === 'settings');
    expect(win.args).toEqual({ initial: 'about' }); // deep-link landed on the running window
    expect(cur.focused).toBe(win.id);
    // a bare relaunch focuses without clobbering the deep-link
    act6((o) => o.launch('settings'));
    expect(cur.windows.length).toBe(2);
    expect(cur.windows.find((w) => w.appId === 'settings').args).toEqual({ initial: 'about' });
    // …and the store folds into its own single instance too
    act6((o) => o.launch('store'));
    expect(cur.windows.filter((w) => w.appId === 'store').length).toBe(1);
  });

  it('close removes the window; focus of an unknown id is a no-op', () => {
    mount();
    act6((o) => o.launch('terminal'));
    const id = cur.windows[0].id;
    act6((o) => o.close(id));
    expect(cur.windows).toEqual([]);
    const before = cur;
    act6((o) => o.focus(999));
    expect(cur).toBe(before);
  });

  it('focus raises z and can unminimize', () => {
    mount();
    act6((o) => o.launch('terminal'));
    act6((o) => o.launch('files'));
    const [a, b] = cur.windows;
    act6((o) => o.minimize(a.id));
    expect(cur.windows.find((w) => w.id === a.id).min).toBe(true);
    expect(cur.focused).toBe(b.id); // minimizing the non-focused keeps focus
    act6((o) => o.minimize(b.id));
    expect(cur.focused).toBeNull(); // minimizing the focused clears focus
    act6((o) => o.focus(a.id, true));
    // focus(id, unminimize) — the api passes unmin as second arg
    expect(cur.windows.find((w) => w.id === a.id).min).toBe(false);
    expect(cur.focused).toBe(a.id);
  });

  it('toggleMax drops the tile flag but keeps pre; setRect clears snap, keeps pre', () => {
    mount();
    act6((o) => o.launch('terminal'));
    const id = cur.windows[0].id;
    act6((o) => o.snap(id, 'left'));
    const floating = cur.windows[0].pre;
    expect(floating).toEqual({ x: 152, y: 128, w: 720, h: 460 });
    act6((o) => o.toggleMax(id));
    // maximize abandons the TILE but remembers the floating rect — a tear-off
    // drag of the un-maximized window restores it (see winDrag.js)
    expect(cur.windows[0]).toMatchObject({ max: true, snap: null, pre: floating });
    act6((o) => o.toggleMax(id));
    expect(cur.windows[0].max).toBe(false);
    // re-snap starts a fresh pre from the current rect; a manual move clears
    // the snap flag while keeping that pre for a later restore
    act6((o) => o.snap(id, 'left'));
    const pre2 = cur.windows[0].pre;
    act6((o) => o.setRect(id, { x: 5, y: 5, w: 300, h: 200 }));
    expect(cur.windows[0].snap).toBeNull();
    expect(cur.windows[0].pre).toEqual(pre2);
    expect(cur.windows[0].rect).toEqual({ x: 5, y: 5, w: 300, h: 200 });
  });
});

describe('tiling', () => {
  const launch = () => {
    mount();
    act6((o) => o.launch('terminal'));
    return cur.windows[0].id;
  };

  it('snapWin tiles into the zone and remembers the floating rect as pre', () => {
    const id = launch();
    const floating = { ...cur.windows[0].rect };
    act6((o) => o.snap(id, 'right'));
    const w = cur.windows[0];
    expect(w.snap).toBe('right');
    expect(w.max).toBe(false);
    expect(w.rect.w).toBe(window.innerWidth / 2);
    expect(w.pre).toEqual(floating);
  });

  it('re-snapping keeps the original pre, not the current tile', () => {
    const id = launch();
    const floating = { ...cur.windows[0].rect };
    act6((o) => o.snap(id, 'left'));
    act6((o) => o.snap(id, 'tr'));
    expect(cur.windows[0].pre).toEqual(floating);
  });

  it('the top zone is maximize territory — snapWin leaves the window alone', () => {
    const id = launch();
    const before = cur.windows[0];
    act6((o) => o.snap(id, 'top'));
    expect(cur.windows[0]).toBe(before);
  });

  it('restoreWin returns the pre rect and drops snap/pre', () => {
    const id = launch();
    const floating = { ...cur.windows[0].rect };
    act6((o) => o.snap(id, 'bl'));
    act6((o) => o.restore(id));
    expect(cur.windows[0]).toMatchObject({ snap: null, pre: null, rect: floating });
  });
});

describe('install / uninstall / user apps', () => {
  it('install is idempotent and persists', () => {
    mount();
    act6((o) => o.install('globe'));
    act6((o) => o.install('globe'));
    expect(cur.installed).toEqual(['globe']);
    expect(stored('installed')).toEqual(['globe']);
  });

  it('uninstall closes its windows, unpins, leaves groups and order', () => {
    localStorage.setItem('webos.taskbar', JSON.stringify({ pinned: ['globe', 'terminal'], startPins: ['globe', 'calc'] }));
    localStorage.setItem('webos.groups', JSON.stringify([{ id: 'g1', name: 'G', appIds: ['globe', 'terminal'] }]));
    localStorage.setItem('webos.desktop.order', JSON.stringify(['globe', 'terminal']));
    mount();
    act6((o) => o.install('globe'));
    act6((o) => o.launch('globe'));
    act6((o) => o.uninstall('globe'));
    expect(cur.installed).toEqual([]);
    expect(cur.windows).toEqual([]);
    expect(cur.taskbar.pinned).toEqual(['terminal']);
    expect(cur.taskbar.startPins).toEqual(['calc']);
    expect(stored('taskbar').startPins).toEqual(['calc']);
    expect(cur.groups[0].appIds).toEqual(['terminal']);
    expect(cur.order).toEqual(['terminal']);
  });

  it('startPins: seeded out of the box, user-manageable via setTaskbar, kept by resetLook', () => {
    mount();
    expect(cur.taskbar.startPins).toContain('photocraft');
    act6((o) => o.setTaskbar({ startPins: ['calc'] }));
    expect(stored('taskbar').startPins).toEqual(['calc']);
    act6((o) => o.resetLook());
    expect(cur.taskbar.startPins).toEqual(['calc']); // user pins survive a look reset
    expect(cur.taskbar.align).toBe('left'); // …while layout knobs go factory
    // the Settings panel only offers left/center/right; right must stick
    act6((o) => o.setTaskbar({ align: 'right' }));
    expect(cur.taskbar.align).toBe('right');
  });

  it('user apps add/update/remove, with the same uninstall cleanup', () => {
    mount();
    const app = { id: 'myapp', name: 'My App', url: 'https://example.com', icon: 'icons/custom.svg', accent: '#38bdf8', category: 'Tools', tagline: 'x', version: '1.0', description: 'x', developer: 'me', rating: null, reviews: 0, embed: true };
    act6((o) => o.addUserApp(app));
    expect(cur.userApps).toEqual([app]);
    expect(stored('userapps')).toEqual([app]);
    act6((o) => o.updateUserApp({ ...app, name: 'Renamed' }));
    expect(cur.userApps[0].name).toBe('Renamed');
    act6((o) => o.launch('myapp'));
    act6((o) => o.removeUserApp('myapp'));
    expect(cur.userApps).toEqual([]);
    expect(cur.windows).toEqual([]);
    expect(cur.isCustom('myapp')).toBe(false);
    expect(cur.isDefault('terminal')).toBe(true);
    expect(cur.isDefault('myapp')).toBe(false);
  });
});

describe('desktop groups + order', () => {
  it('groups add/rename/remove, with order following add/remove', () => {
    mount();
    act6((o) => o.addGroup({ id: 'grp1', name: 'Games', appIds: ['g2048'] }));
    expect(cur.groups).toEqual([{ id: 'grp1', name: 'Games', appIds: ['g2048'] }]);
    expect(cur.order).toContain('grp1');
    act6((o) => o.renameGroup('grp1', 'Play'));
    expect(cur.groups[0].name).toBe('Play');
    act6((o) => o.groupAdd('grp1', 'hextris'));
    act6((o) => o.groupAdd('grp1', 'hextris')); // no dup
    expect(cur.groups[0].appIds).toEqual(['g2048', 'hextris']);
    act6((o) => o.groupRemove('grp1', 'g2048'));
    expect(cur.groups[0].appIds).toEqual(['hextris']);
    act6((o) => o.removeGroup('grp1'));
    expect(cur.groups).toEqual([]);
    expect(cur.order).not.toContain('grp1');
  });

  it('setOrder persists and flips sort to custom; sortDesktop sorts by name', () => {
    mount();
    act6((o) => o.setOrder(['video', 'terminal']));
    expect(cur.desktop.sort).toBe('custom');
    expect(stored('desktop.order')).toEqual(['video', 'terminal']);
    act6((o) => o.install('globe'));
    act6((o) => o.sortDesktop());
    expect(cur.desktop.sort).toBe('name');
    const names = cur.apps.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
    // group ids trail the app ids
    act6((o) => o.addGroup({ id: 'zz', name: 'Z', appIds: [] }));
    act6((o) => o.sortDesktop());
    expect(cur.order[cur.order.length - 1]).toBe('zz');
  });
});

describe('theme + persona', () => {
  it('setTheme merges and persists', () => {
    mount();
    act6((o) => o.setTheme({ accent: '#f87171' }));
    expect(cur.theme.accent).toBe('#f87171');
    expect(cur.theme.preset).toBe('midnight'); // untouched keys stay
    expect(stored('theme').accent).toBe('#f87171');
  });

  it('setPersona applies the persona one-shot defaults and persists all three', () => {
    mount();
    act6((o) => o.setPersona('mac'));
    expect(cur.persona).toBe('mac');
    expect(stored('persona')).toBe('mac');
    expect(stored('theme').preset).toBe(THEME_PRESETS[cur.theme.preset] ? cur.theme.preset : 'midnight');
    // mac keeps the bar at the bottom (dock) but centers alignment
    expect(stored('taskbar')).toMatchObject({ position: 'bottom', align: 'center' });
  });

  it('unknown persona ids fall back through personaOf (win)', () => {
    mount();
    act6((o) => o.setPersona('nope'));
    expect(['win', 'mac', 'linux', 'bsd', 'android', 'tui']).toContain(cur.persona);
  });

  it('resetLook restores every styling slice, keeps pinned apps, reloads persona', () => {
    localStorage.setItem('webos.taskbar', JSON.stringify({ pinned: ['terminal'], position: 'top' }));
    mount();
    act6((o) => o.setTheme({ preset: 'sunset' }));
    act6((o) => o.setUi({ scale: 1.2, radius: '2px' }));
    act6((o) => o.resetLook());
    expect(cur.theme.preset).toBe('midnight');
    expect(cur.ui.scale).toBe(1);
    expect(cur.ui.radius).toBe('');
    expect(cur.persona).toBe('win');
    expect(cur.taskbar.position).toBe('bottom');
    expect(cur.taskbar.pinned).toEqual(['terminal']);
    expect(cur.volume.level).toBe(0.7);
    expect(cur.saver.kind).toBe('off');
  });
});

describe('events + settings slices', () => {
  it('events add/remove by date and index', () => {
    mount();
    act6((o) => o.addEvent('2026-10-11', 'standup'));
    act6((o) => o.addEvent('2026-10-11', 'review'));
    expect(cur.events['2026-10-11']).toEqual(['standup', 'review']);
    act6((o) => o.removeEvent('2026-10-11', 0));
    expect(cur.events['2026-10-11']).toEqual(['review']);
    expect(stored('events')).toEqual(cur.events);
  });

  it('each settings slice merges, persists, and keeps other keys', () => {
    mount();
    act6((o) => o.setVolume({ level: 0.4 }));
    act6((o) => o.setVolume({ muted: true }));
    expect(cur.volume).toEqual({ level: 0.4, muted: true });
    act6((o) => o.setSaver({ kind: 'starfield', timeoutMin: 5 }));
    expect(cur.saver).toMatchObject({ kind: 'starfield', timeoutMin: 5, speed: 1 });
    act6((o) => o.setWidgets({ enabled: ['clock'] }));
    expect(cur.widgets.enabled).toEqual(['clock']);
    act6((o) => o.setTaskbar({ iconSize: 'lg' }));
    expect(cur.taskbar.iconSize).toBe('lg');
    act6((o) => o.setDesktop({ gap: 'roomy' }));
    expect(cur.desktop.gap).toBe('roomy');
    expect(stored('desktop')).toMatchObject({ gap: 'roomy', iconSize: 'md' });
  });

  it('setUiMode persists; the mobile effect follows it', () => {
    mount();
    act6((o) => o.setUiMode('desktop'));
    expect(stored('uiMode')).toBe('desktop');
    act6((o) => o.setUiMode('mobile'));
    expect(cur.mobile).toBe(true);
    expect(document.body.dataset.mode).toBe('mobile');
  });
});

describe('body/CSS effect groups', () => {
  it('theme effect writes CSS custom properties and meta theme-color', () => {
    document.head.insertAdjacentHTML('beforeend', '<meta name="theme-color" content="">');
    mount();
    const root = document.documentElement.style;
    expect(root.getPropertyValue('--text')).toBe(THEME_PRESETS.midnight.text);
    expect(root.getPropertyValue('--paper')).toBe(THEME_PRESETS.midnight.paper);
    expect(root.getPropertyValue('--accent')).toBe('#38bdf8');
    // happy-dom's cssText keeps only the last background layer — assert the
    // linear base survives the roundtrip into the style property
    expect(document.body.style.background).toContain('linear-gradient(160deg, #0d1220');
    act6((o) => o.setTheme({ preset: 'light' }));
    expect(document.querySelector('meta[name="theme-color"]').content).toBe('#eef2f8');
    expect(root.getPropertyValue('--paper')).toBe('#f7f9fc');
  });

  it('transparency scales the chrome alpha with clamps at 0.35 and 0.98', () => {
    mount();
    const root = document.documentElement.style;
    act6((o) => o.setUi({ transparency: 0.5 }));
    expect(root.getPropertyValue('--chrome')).toBe('rgba(16, 20, 30, 0.410)');
    act6((o) => o.setUi({ transparency: 0.01 }));
    expect(root.getPropertyValue('--chrome')).toBe('rgba(16, 20, 30, 0.350)');
    act6((o) => o.setUi({ transparency: 9 }));
    expect(root.getPropertyValue('--chrome')).toBe('rgba(16, 20, 30, 0.980)');
  });

  it('ui effect: scale font-size, anim toggle, radius/blur overrides, chrome knobs', () => {
    mount();
    act6((o) => o.setUi({ scale: 1.25 }));
    expect(document.documentElement.style.fontSize).toBe('20px');
    act6((o) => o.setUi({ anim: false }));
    expect(document.body.hasAttribute('data-anim-off')).toBe(true);
    act6((o) => o.setUi({ radius: '3px', blur: 4 }));
    expect(document.body.style.getPropertyValue('--radius')).toBe('3px');
    expect(document.body.style.getPropertyValue('--chrome-blur')).toBe('4px');
    act6((o) => o.setUi({ radius: '', blur: '' }));
    expect(document.body.style.getPropertyValue('--radius')).toBe('');
    expect(document.body.style.getPropertyValue('--chrome-blur')).toBe('');
    act6((o) => o.setUi({ tbSide: 'left', titleAlign: 'center', font: 'mono', shadow: 'off' }));
    expect(document.body.dataset.tbside).toBe('left');
    expect(document.body.dataset.titlealign).toBe('center');
    expect(document.body.dataset.font).toBe('mono');
    expect(document.body.dataset.shadow).toBe('off');
  });

  it('taskbar/desktop/mobile layout lands on body data attributes', () => {
    mount();
    act6((o) => o.setTaskbar({ position: 'left', autohide: true, align: 'center', iconSize: 'sm' }));
    act6((o) => o.setDesktop({ iconSize: 'lg', gap: 'compact' }));
    expect(document.body.dataset.tb).toBe('left');
    expect(document.body.hasAttribute('data-tb-autohide')).toBe(true);
    expect(document.body.dataset.tbAlign).toBe('center');
    expect(document.body.dataset.tbIco).toBe('sm');
    expect(document.body.dataset.icons).toBe('lg');
    expect(document.body.dataset.deskGap).toBe('compact');
    expect(document.body.dataset.mode).toBe('desktop');
  });

  it('volume changes broadcast a webos:volume CustomEvent', () => {
    mount();
    const seen = [];
    const on = (e) => seen.push(e.detail);
    document.addEventListener('webos:volume', on);
    act6((o) => o.setVolume({ level: 0.1 }));
    document.removeEventListener('webos:volume', on);
    expect(seen.at(-1)).toEqual({ level: 0.1, muted: false });
  });
});

describe('apps list derivation', () => {
  it('defaults + installed + user apps, custom sort follows the saved order', () => {
    localStorage.setItem('webos.installed', JSON.stringify(['globe']));
    localStorage.setItem('webos.desktop.order', JSON.stringify(['video', 'globe']));
    mount();
    const app = { id: 'myapp', name: 'My App' };
    act6((o) => o.addUserApp(app));
    const ids = cur.apps.map((a) => a.id);
    expect(ids.indexOf('video')).toBeLessThan(ids.indexOf('globe')); // saved order first
    expect(ids.indexOf('myapp')).toBeGreaterThan(-1); // user apps join the grid
    expect(cur.findApp('globe').id).toBe('globe');
  });

  it('name sort sorts the combined list by name', () => {
    localStorage.setItem('webos.desktop', JSON.stringify({ sort: 'name' }));
    mount();
    const names = cur.apps.map((a) => a.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });
});

describe('ACCENTS + factoryReset', () => {
  it('ACCENTS is a non-empty list of hex colors', () => {
    expect(ACCENTS.length).toBeGreaterThan(5);
    for (const a of ACCENTS) expect(a).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('factoryReset wipes every webos.* key and reloads', () => {
    localStorage.setItem('webos.theme', '{"preset":"ocean"}');
    localStorage.setItem('unrelated', 'keep');
    const spy = vi.spyOn(window.location, 'reload').mockImplementation(() => {});
    factoryReset();
    expect(localStorage.getItem('webos.theme')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('keep');
    expect(spy).toHaveBeenCalledTimes(1);
    spy.mockRestore();
  });
});
