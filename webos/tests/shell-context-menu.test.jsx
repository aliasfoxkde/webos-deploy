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
});
