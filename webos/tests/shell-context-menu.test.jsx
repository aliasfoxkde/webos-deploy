// useContextMenu contract. The stale-builder regression here is real: the
// listeners used to re-subscribe per builder change (passive effect), so a
// right-click landing between a commit and its effect flush built items from
// the stale closure — Files' rename menu silently didn't open right after a
// listing landed. The builder must be read at dispatch time.
import React, { useCallback, useState } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import { useContextMenu } from '../src/shell/ContextMenu.jsx';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

function Probe() {
  const [label, setLabel] = useState('first');
  const build = useCallback((kind) => (kind === 'probe' ? [{ label, run: () => setLabel('ran') }] : []), [label]);
  const { menu } = useContextMenu(build);
  return (
    <div>
      <button type="button" data-cm="probe:x" onClick={() => setLabel('second')}>retarget</button>
      <output>{label}</output>
      {menu}
    </div>
  );
}

describe('useContextMenu', () => {
  it('subscribes once and a right-click reads the builder committed at dispatch time', () => {
    vi.spyOn(window, 'addEventListener'); // spies call through by default
    render(<Probe />);
    const handlers = () => window.addEventListener.mock.calls
      .filter(([type]) => type === 'contextmenu')
      .map(([, fn]) => fn);
    expect(handlers()).toHaveLength(1);
    fireEvent.click(screen.getByText('retarget')); // builder now returns 'second'
    expect(handlers()).toHaveLength(1); // …without re-subscribing

    // Invoke the FIRST-registered handler — the one a real right-click hits
    // when no re-subscription has flushed. It must still see the new builder.
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: document.querySelector('[data-cm]') });
    act(() => handlers()[0](ev));
    expect(document.querySelector('.ctx-item').textContent).toContain('second');
  });

  it('picking an item runs it and closes; an outside click just closes', () => {
    render(<Probe />);
    fireEvent.contextMenu(document.querySelector('[data-cm]'));
    expect(document.querySelector('.ctx-item').textContent).toContain('first');
    fireEvent.click(document.querySelector('.ctx-item'));
    expect(document.querySelector('.ctx-menu')).toBeNull(); // closed…
    expect(screen.getByText('ran')).toBeTruthy(); // …and run
    fireEvent.contextMenu(document.querySelector('[data-cm]'));
    fireEvent.click(document.body);
    expect(document.querySelector('.ctx-menu')).toBeNull(); // dismissed, nothing ran
    expect(screen.getByText('ran')).toBeTruthy();
  });

  it('an empty item list opens nothing', () => {
    render(<Probe />);
    const target = document.createElement('span');
    target.setAttribute('data-cm', 'other:y');
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: target });
    window.dispatchEvent(ev);
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('a right-click on anything without a data-cm ancestor opens nothing', () => {
    render(<Probe />);
    const plain = document.createElement('span');
    const ev = new Event('contextmenu', { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'target', { value: plain });
    window.dispatchEvent(ev);
    expect(document.querySelector('.ctx-menu')).toBeNull();
    // The default context menu is left alone for non-app targets.
    expect(ev.defaultPrevented).toBe(false);
  });

  /* Keyboard model (WAI-ARIA menu pattern). The menu container receives
     focus on open; Arrow keys walk with wraparound, Home/End jump, Enter
     runs the active item, Escape closes and restores focus. */
  const openMenu = () => {
    fireEvent.contextMenu(document.querySelector('[data-cm]'));
    return document.querySelector('.ctx-menu');
  };

  it('focuses the menu on open; Escape closes it', () => {
    render(<Probe />);
    const menu = openMenu();
    expect(document.activeElement).toBe(menu);
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(document.querySelector('.ctx-menu')).toBeNull();
  });

  it('ArrowDown/ArrowUp walk items with wraparound', () => {
    render(<Probe />);
    const _menu = openMenu();
    const item = () => document.querySelector('.ctx-item');
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    expect(document.activeElement).toBe(item());
    fireEvent.keyDown(document, { key: 'ArrowDown' }); // wraps to first again (single item)
    expect(document.activeElement).toBe(item());
    fireEvent.keyDown(document, { key: 'ArrowUp' }); // backwards from first wraps to last
    expect(document.activeElement).toBe(item());
  });

  it('Enter runs the active item and closes the menu', () => {
    render(<Probe />);
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(document.querySelector('.ctx-menu')).toBeNull();
    expect(screen.getByText('ran')).toBeTruthy();
  });

  it('Space runs the active item too', () => {
    render(<Probe />);
    openMenu();
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    fireEvent.keyDown(document, { key: ' ' });
    expect(screen.getByText('ran')).toBeTruthy();
  });

  it('Home and End jump to first and last items', () => {
    function Multi() {
      const { menu } = useContextMenu(() => [
        { label: 'a', run: () => {} },
        { label: 'b', run: () => {} },
        { label: 'c', run: () => {} },
      ]);
      return <div><span data-cm="multi:z" />{menu}</div>;
    }
    render(<Multi />);
    fireEvent.contextMenu(document.querySelector('[data-cm="multi:z"]'));
    const items = () => [...document.querySelectorAll('.ctx-item')];
    fireEvent.keyDown(document, { key: 'End' });
    expect(document.activeElement).toBe(items()[2]);
    fireEvent.keyDown(document, { key: 'Home' });
    expect(document.activeElement).toBe(items()[0]);
  });

  it('Tab is not intercepted — the trap does not apply to menus', () => {
    render(<Probe />);
    openMenu();
    fireEvent.keyDown(document, { key: 'Tab' });
    // Menu stays open; the key was ignored by the menu handler.
    expect(document.querySelector('.ctx-menu')).toBeTruthy();
  });
});
