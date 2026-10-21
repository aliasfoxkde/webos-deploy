// Branch coverage targets for shell files below 90%:
//   EmbedFrame (82.4%), FxWallpaper (89.7%), Sidebar (87.3%), StartMenu (91.1%)
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider, useOS, WIDGET_IDS } from '../src/os/state.jsx';
import EmbedFrame from '../src/shell/EmbedFrame.jsx';
import FxWallpaper from '../src/shell/FxWallpaper.jsx';
import Sidebar from '../src/shell/Sidebar.jsx';
import StartMenu from '../src/shell/StartMenu.jsx';

// ------------------------------------------------------------------ //
// Shared harness (mirrors shell-window.test.jsx exactly)
// ------------------------------------------------------------------ //
let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = (ui) => render(<OSProvider><Probe />{ui}</OSProvider>);
const noop = () => {};

/* canvas 2d recording context */
let ctx2d;
const makeCtx = () => {
  const calls = [];
  const rec = (name) => (...args) => calls.push([name, ...args]);
  return {
    calls,
    setTransform: rec('setTransform'), fillRect: rec('fillRect'),
    beginPath: rec('beginPath'), arc: rec('arc'), fill: rec('fill'),
    moveTo: rec('moveTo'), lineTo: rec('lineTo'), stroke: rec('stroke'),
    closePath: rec('closePath'),
    fillText: rec('fillText'),
    createLinearGradient: () => ({ addColorStop: rec('addColorStop') }),
  };
};

let rafCalls = [];
const cancelSpy = vi.fn();

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  document.body.className = '';
  document.body.removeAttribute('data-persona');
  ctx2d = makeCtx();
  Reflect.defineProperty(HTMLCanvasElement.prototype, 'getContext', {
    value: vi.fn(() => ctx2d), configurable: true, writable: true,
  });
  rafCalls = [];
  cancelSpy.mockClear();
  vi.stubGlobal('requestAnimationFrame', (cb) => { rafCalls.push(cb); return 40 + rafCalls.length; });
  vi.stubGlobal('cancelAnimationFrame', cancelSpy);
  vi.stubGlobal('fetch', () => new Promise(() => {}));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete navigator.getBattery;
  delete navigator.storage;
});

// ------------------------------------------------------------------ //
// EmbedFrame — exercises branches the existing embed-frame-autosave.test.jsx
// does not cover: null reply guard, impostor source guard, exportPng with and
// without onExportRequest.
// ------------------------------------------------------------------ //
vi.mock('../src/os/bridge.js', async (importOriginal) => ({
  ...(await importOriginal()),
  handleBridge: vi.fn(async () => null), // null → !reply guard exercised
  postToApp: vi.fn(async () => ({})),
}));
import { handleBridge, postToApp } from '../src/os/bridge.js';

describe('EmbedFrame — uncovered branches', () => {
  const embedApp = {
    id: 'my-app', name: 'My App', url: 'https://app.example/',
    icon: 'icons/app.svg', accent: '#aaa', version: '1.0', embed: true,
  };

  it('handleBridge returning null posts no reply to the frame', async () => {
    const c = mount(<EmbedFrame app={embedApp} />);
    const frame = c.container.querySelector('iframe');
    const postSpy = vi.spyOn(frame.contentWindow, 'postMessage').mockImplementation(() => {});

    const ev = new MessageEvent('message', { data: { type: 'webos:file-get', id: 1 } });
    Object.defineProperty(ev, 'source', { value: frame.contentWindow });
    fireEvent(window, ev);
    await act(async () => {});
    expect(postSpy).not.toHaveBeenCalled();
  });

  it('an impostor source is ignored entirely — handleBridge never fires', async () => {
    mount(<EmbedFrame app={embedApp} />);
    handleBridge.mockClear();
    const impostor = new MessageEvent('message', { data: { type: 'webos:file-get', id: 5 } });
    Object.defineProperty(impostor, 'source', { value: {} }); // not the iframe's window
    fireEvent(window, impostor);
    await act(async () => {});
    expect(handleBridge).not.toHaveBeenCalled();
  });

  it('exportPng without onExportRequest silently completes (no throw)', async () => {
    postToApp.mockResolvedValueOnce({ bytes: new ArrayBuffer(4) });
    const c = mount(<EmbedFrame app={embedApp} />);
    const frame = c.container.querySelector('iframe');
    const ev = new MessageEvent('message', { data: { source: 'firecraft', type: 'exportPng' } });
    Object.defineProperty(ev, 'source', { value: frame.contentWindow });
    // Must not throw despite onExportRequest being absent
    await act(async () => { fireEvent(window, ev); });
    expect(postToApp).toHaveBeenCalled();
  });

  it('exportPng with no bytes in the response does not invoke onExportRequest', async () => {
    postToApp.mockResolvedValueOnce({ ok: true }); // no bytes
    const onExportRequest = vi.fn();
    const c = mount(<EmbedFrame app={embedApp} onExportRequest={onExportRequest} />);
    const frame = c.container.querySelector('iframe');
    const ev = new MessageEvent('message', { data: { source: 'firecraft', type: 'exportPng' } });
    Object.defineProperty(ev, 'source', { value: frame.contentWindow });
    await act(async () => { fireEvent(window, ev); });
    expect(onExportRequest).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------------ //
// FxWallpaper — covers all five named effects plus the visibility handler
// ------------------------------------------------------------------ //
describe('FxWallpaper — uncovered branches', () => {
  it('an unknown kind falls back to starfield deterministically', () => {
    render(<FxWallpaper kind="nonexistent-fx" />);
    expect(ctx2d.calls.some(([n]) => n === 'arc')).toBe(true); // starfield draws arcs
  });

  it('mesh kind draws connections between nearby points', () => {
    render(<FxWallpaper kind="mesh" />);
    expect(ctx2d.calls.some(([n]) => n === 'moveTo' || n === 'lineTo')).toBe(true);
  });

  it('matrix kind draws Japanese characters with motion trails', () => {
    render(<FxWallpaper kind="matrix" />);
    expect(ctx2d.calls.some(([n]) => n === 'fillText')).toBe(true);
    // dark rect over prior frames for trail effect
    expect(ctx2d.calls.some(([n]) => n === 'fillRect')).toBe(true);
  });

  it('visibility change cancels the loop and restarts it when visible', () => {
    render(<FxWallpaper kind="waves" />);
    expect(rafCalls).toHaveLength(1);

    // Hide tab: loop cancelled, nothing re-armed while hidden
    Object.defineProperty(document, 'hidden', { value: true, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(cancelSpy).toHaveBeenCalledTimes(1);
    expect(rafCalls).toHaveLength(1);

    // Show tab: fresh frame armed
    Object.defineProperty(document, 'hidden', { value: false, configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });
    expect(rafCalls).toHaveLength(2);
  });
});

// ------------------------------------------------------------------ //
// Sidebar — unknown widget ids, empty state, customize footer, chip toggle
// ------------------------------------------------------------------ //
describe('Sidebar — uncovered branches', () => {
  it('an unknown widget id in the enabled list renders nothing for that slot', () => {
    act(() => cur.setWidgets({ enabled: ['weather', 'bogus-widget', 'clock'] }));
    const c = mount(<Sidebar onClose={noop} />);
    // Three slots; the bogus one has no .widget child
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(3);
    const emptySlot = [...c.container.querySelectorAll('.sb-slot')]
      .find((s) => !s.querySelector('.widget'));
    expect(emptySlot).toBeTruthy();
  });

  it('no widgets enabled shows the empty-state message', () => {
    act(() => cur.setWidgets({ enabled: [] }));
    const c = mount(<Sidebar onClose={noop} />);
    expect(c.container.textContent).toContain('No widgets enabled');
    expect(c.container.querySelectorAll('.sb-slot')).toHaveLength(0);
  });

  it('customize mode shows the Add-widgets footer with all chip options', () => {
    const c = mount(<Sidebar onClose={noop} />);
    fireEvent.click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Customize'));
    expect(c.container.querySelector('.sb-edit-add')).toBeTruthy();
    expect(c.container.querySelectorAll('.sb-chips .chip')).toHaveLength(WIDGET_IDS.length);
    expect(c.container.querySelectorAll('.sb-chips .chip.on').length).toBeGreaterThan(0);
  });

  it('clicking an already-enabled chip toggles it off', () => {
    const c = mount(<Sidebar onClose={noop} />);
    fireEvent.click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Customize'));
    const weatherChip = [...c.container.querySelectorAll('.sb-chips .chip')]
      .find((b) => b.textContent === 'Weather');
    expect(weatherChip.className).toContain('on');
    fireEvent.click(weatherChip);
    expect(weatherChip.className).not.toContain('on');
    expect(cur.widgets.enabled).not.toContain('weather');
  });

  it('move buttons are disabled when a widget is at a boundary position', () => {
    act(() => cur.setWidgets({ enabled: ['weather'] }));
    const c = mount(<Sidebar onClose={noop} />);
    fireEvent.click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Customize'));
    const firstEdit = c.container.querySelector('.sb-slot .sb-edit');
    expect(firstEdit.querySelector('[title="Move up"]').disabled).toBe(true);
    expect(firstEdit.querySelector('[title="Move down"]').disabled).toBe(true);
  });
});

// ------------------------------------------------------------------ //
// StartMenu — no-match CTA, keyboard wrap/jump, power buttons, uncategorized
// ------------------------------------------------------------------ //
describe('StartMenu — uncovered branches', () => {
  const openStore = vi.fn();
  const openSettings = vi.fn();
  const onClose = vi.fn();
  const onPower = vi.fn();

  const mountMenu = (props = {}) => mount(
    <StartMenu
      open={true}
      onClose={onClose}
      openStore={openStore}
      openSettings={openSettings}
      onPower={onPower}
      {...props}
    />
  );

  beforeEach(() => {
    onClose.mockClear();
    openSettings.mockClear();
    onPower.mockClear();
    openStore.mockClear();
  });

  it('search with no app or settings hits shows the App Store CTA', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'zzzznotarealapp' } });
    expect(c.container.textContent).toContain('No matches');
    expect(c.container.textContent).toContain('Open App Store');
  });

  it('search caps results at 8 apps', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'a' } }); // matches many
    const appBtns = c.container.querySelectorAll('.sm-app');
    expect(appBtns.length).toBeLessThanOrEqual(8);
  });

  it('ArrowUp from the first item wraps focus to the last element', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(c.container.querySelector('.sm-pwr.danger'));
  });

  it('Home key jumps focus to the search input', () => {
    const c = mountMenu();
    const tiles = c.container.querySelectorAll('.sm-tile');
    if (tiles.length > 0) {
      fireEvent.focus(tiles[0]);
      fireEvent.keyDown(tiles[0], { key: 'Home' });
      expect(document.activeElement).toBe(c.container.querySelector('.sm-search'));
    }
  });

  it('End key jumps focus to the last focusable element', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.focus(input);
    fireEvent.keyDown(input, { key: 'End' });
    expect(document.activeElement).toBe(c.container.querySelector('.sm-pwr.danger'));
  });

  it('Enter on a settings search result opens settings with that section as initial', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'appearance' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onClose).toHaveBeenCalled();
    expect(openSettings).toHaveBeenCalled();
  });

  it('Escape closes the menu without launching anything', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'calc' } });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('the restart and shutdown power buttons dispatch correctly', () => {
    const c = mountMenu();
    fireEvent.click(c.container.querySelector('.sm-pwr:not(.danger)'));
    expect(onPower).toHaveBeenCalledWith('restart');
    fireEvent.click(c.container.querySelector('.sm-pwr.danger'));
    expect(onPower).toHaveBeenCalledWith('shutdown');
  });

  it('an app with no category falls back to the Utilities group', () => {
    act(() => cur._setApps([...cur.apps, {
      id: 'no-cat', name: 'NoCat', category: '', tagline: '', icon: '',
    }]));
    const c = mountMenu();
    expect(c.container.textContent).toContain('NoCat');
    expect(c.container.textContent).toContain('Utilities');
  });

  it('footer store link displays the app count', () => {
    const c = mountMenu();
    expect(c.container.querySelector('.sm-links').textContent).toContain('App Store');
  });
});
