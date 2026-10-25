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

/* seed a persisted WebOS preference before the provider mounts */
const seed = (key, value) => localStorage.setItem(`webos.${key}`, JSON.stringify(value));

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

  it('exportPng with bytes AND a handler delivers the bytes to onExportRequest', async () => {
    const bytes = new ArrayBuffer(8);
    postToApp.mockResolvedValueOnce({ bytes });
    const onExportRequest = vi.fn();
    const c = mount(<EmbedFrame app={embedApp} onExportRequest={onExportRequest} />);
    const frame = c.container.querySelector('iframe');
    const ev = new MessageEvent('message', { data: { source: 'firecraft', type: 'exportPng' } });
    Object.defineProperty(ev, 'source', { value: frame.contentWindow });
    await act(async () => { fireEvent(window, ev); });
    expect(onExportRequest).toHaveBeenCalledWith(bytes);
  });

  it('exportPng delegating a throwing postToApp is swallowed silently', async () => {
    postToApp.mockRejectedValueOnce(new Error('bridge dead'));
    const c = mount(<EmbedFrame app={embedApp} />);
    const frame = c.container.querySelector('iframe');
    const ev = new MessageEvent('message', { data: { source: 'firecraft', type: 'exportPng' } });
    Object.defineProperty(ev, 'source', { value: frame.contentWindow });
    await act(async () => { fireEvent(window, ev); }); // must not throw
  });
});

// ------------------------------------------------------------------ //
// FxWallpaper — covers all five named effects plus the visibility handler
// ------------------------------------------------------------------ //
describe('FxWallpaper — uncovered branches', () => {
  it('an unknown kind falls back to starfield deterministically', () => {
    render(<FxWallpaper kind="nonexistent-fx" />);
    act(() => { if (rafCalls.length > 0) rafCalls[rafCalls.length - 1](1000); });
    expect(ctx2d.calls.some(([n]) => n === 'arc')).toBe(true); // starfield draws arcs
  });

  it('mesh kind draws connections between nearby points', () => {
    render(<FxWallpaper kind="mesh" />);
    act(() => { if (rafCalls.length > 0) rafCalls[rafCalls.length - 1](1000); });
    expect(ctx2d.calls.some(([n]) => n === 'moveTo' || n === 'lineTo')).toBe(true);
  });

  it('matrix kind draws Japanese characters with motion trails', () => {
    render(<FxWallpaper kind="matrix" />);
    act(() => { if (rafCalls.length > 0) rafCalls[rafCalls.length - 1](1000); });
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
  it('no widgets enabled shows the empty-state message', () => {
    seed('widgets', { enabled: [] });
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

  it('move up disabled on first widget; move down disabled on last', () => {
    seed('widgets', { enabled: ['weather', 'clock'] });
    const c = mount(<Sidebar onClose={noop} />);
    fireEvent.click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Customize'));
    const edits = c.container.querySelectorAll('.sb-slot .sb-edit');
    // First widget: Move Up disabled, Move Down enabled
    expect(edits[0].querySelector('[title="Move up"]').disabled).toBe(true);
    expect(edits[0].querySelector('[title="Move down"]').disabled).toBe(false);
    // Last widget: Move Up enabled, Move Down disabled
    expect(edits[edits.length - 1].querySelector('[title="Move up"]').disabled).toBe(false);
    expect(edits[edits.length - 1].querySelector('[title="Move down"]').disabled).toBe(true);
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

  it('search with no hits shows the App Store CTA', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'zzzznotarealapp' } });
    expect(c.container.textContent).toContain('No matches');
    expect(c.container.textContent).toContain('Open App Store');
  });

  it('search with a common letter produces multiple results', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'a' } }); // matches many apps
    const resultsDiv = c.container.querySelector('.sm-results');
    expect(resultsDiv).toBeTruthy();
    // appHits are sliced to 8; settings results are separate
    const hitBtns = [...resultsDiv.querySelectorAll('.sm-app')];
    expect(hitBtns.length).toBeGreaterThan(1);
  });

  it('ArrowUp from the search input wraps to the last focusable element', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    act(() => { input.focus(); });
    expect(document.activeElement).toBe(input);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    expect(document.activeElement).toBe(c.container.querySelector('.sm-pwr.danger'));
  });

  it('Home jumps to the first focusable element', () => {
    const c = mountMenu();
    const tiles = c.container.querySelectorAll('.sm-tile');
    if (tiles.length > 0) {
      act(() => { tiles[0].focus(); });
      fireEvent.keyDown(tiles[0], { key: 'Home' });
      expect(document.activeElement).toBe(c.container.querySelector('.sm-search'));
    }
  });

  it('End jumps to the last focusable element', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    act(() => { input.focus(); });
    fireEvent.keyDown(input, { key: 'End' });
    expect(document.activeElement).toBe(c.container.querySelector('.sm-pwr.danger'));
  });

  it('clicking the settings link opens settings', () => {
    const c = mountMenu();
    // In browse mode (.sm-links) the second .sm-link is the Settings link
    const links = c.container.querySelectorAll('.sm-links .sm-link');
    expect(links.length).toBeGreaterThanOrEqual(2);
    fireEvent.click(links[1]); // index 1 = Settings
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

  it('footer store link displays the app count', () => {
    const c = mountMenu();
    expect(c.container.querySelector('.sm-links').textContent).toContain('App Store');
  });
});

describe('StartMenu — launch handlers and nav wraparound', () => {
  const openStore = vi.fn();
  const openSettings = vi.fn();
  const onClose = vi.fn();
  const onPower = vi.fn();
  let cur;

  const P = () => {
    // eslint-disable-next-line react-hooks/globals
    cur = useOS();
    return null;
  };
  const mountMenu = () => render(
    <OSProvider>
      <P />
      <StartMenu
        open={true}
        onClose={onClose}
        openStore={openStore}
        openSettings={openSettings}
        onPower={onPower}
      />
    </OSProvider>
  );

  beforeEach(() => {
    localStorage.clear();
    onClose.mockClear(); openStore.mockClear(); openSettings.mockClear(); onPower.mockClear();
  });

  it('app results, settings results and Ask AI launch through the real store', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    // app-result launch
    fireEvent.change(input, { target: { value: 'calc' } });
    const appHit = c.container.querySelector('.sm-results .sm-app');
    fireEvent.click(appHit);
    expect(cur.windows.some((w) => w.appId === 'calc')).toBe(true);
    // settings-result launch
    fireEvent.change(input, { target: { value: 'appearance' } });
    const secHit = c.container.querySelector('.sm-results .sm-app');
    fireEvent.click(secHit);
    expect(cur.windows.some((w) => w.appId === 'settings')).toBe(true);
    // Ask AI launches chat
    fireEvent.change(input, { target: { value: 'anything' } });
    fireEvent.click(c.container.querySelector('.sm-ai'));
    expect(cur.windows.some((w) => w.appId === 'chat')).toBe(true);
  });

  it('no-match CTA launches the App Store through openStore', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'zzzznope' } });
    expect(c.container.textContent).toContain('No matches');
    fireEvent.click(c.container.querySelector('.sm-results .sm-link:not(.sm-ai)'));
    expect(onClose).toHaveBeenCalled();
    expect(openStore).toHaveBeenCalled();
  });

  it('browse-mode tiles, all-apps rows, recommendations and links launch', () => {
    // seed recents so the Recommended section renders
    seed('recents', ['calc', 'notepad']);
    const c = mountMenu();
    // pinned tile
    fireEvent.click(c.container.querySelector('.sm-tile'));
    expect(cur.windows.length).toBeGreaterThan(0);
    // recommended row
    const recBtn = [...c.container.querySelectorAll('.sm-rowset .sm-app')]
      .find((b) => b.textContent.includes('Calculator'));
    if (recBtn) fireEvent.click(recBtn);
    // App Store + Settings links close the menu
    const links = c.container.querySelectorAll('.sm-links .sm-link');
    fireEvent.click(links[0]);
    expect(openStore).toHaveBeenCalled();
    fireEvent.click(links[1]);
    expect(openSettings).toHaveBeenCalled();
  });

  it('Enter launches the top app hit; Enter on a settings-only query opens settings', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'calc' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(cur.windows.some((w) => w.appId === 'calc')).toBe(true);
    expect(onClose).toHaveBeenCalled();
    // settings-only query: no app matches, section hit wins
    fireEvent.change(input, { target: { value: 'network' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(cur.windows.some((w) => w.appId === 'settings')).toBe(true);
  });

  it('reopening the menu resets the query and refocuses the search box', () => {
    vi.useFakeTimers();
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.change(input, { target: { value: 'calc' } });
    // Close → reopen: the open-transition effect clears q after 30ms.
    act(() => { c.rerender(<OSProvider><P /><StartMenu open={false} onClose={onClose} openStore={openStore} openSettings={openSettings} onPower={onPower} /></OSProvider>); });
    act(() => { c.rerender(<OSProvider><P /><StartMenu open={true} onClose={onClose} openStore={openStore} openSettings={openSettings} onPower={onPower} /></OSProvider>); });
    act(() => { vi.advanceTimersByTime(31); });
    expect(c.container.querySelector('.sm-search').value).toBe('');
    vi.useRealTimers();
  });

  it('Escape closes the menu from the search input', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });

  it('ArrowDown walks forward from the search input', () => {
    const c = mountMenu();
    const input = c.container.querySelector('.sm-search');
    act(() => { input.focus(); });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    const all = [...c.container.querySelectorAll('button, input')];
    expect(all).toContain(document.activeElement);
    expect(document.activeElement).not.toBe(input); // moved off the search box
  });
});
