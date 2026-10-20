// Deterministic coverage for the three one-second clock intervals:
//   • Taskbar      — src/shell/Taskbar.jsx      (#clock-time)
//   • Sidebar      — src/shell/Sidebar.jsx      (.widget-clock)
//   • Screensaver  — src/shell/Screensaver.jsx  (.saver-time)
//
// Each of those components re-reads `new Date()` from a `setInterval(…, 1000)`
// timer. Whether the callback ever runs is a race between the timer and the
// end of the test file: on a slow machine the tick lands before the file
// finishes (callback covered), on a fast one it does not (callback uncovered).
// That made the global coverage numbers machine-dependent — local and CI runs
// disagreed by up to 0.15%, which broke the ratchet in webos/vitest.config.js.
//
// These specs drive the timers with fake timers, so the tick always happens,
// exactly once, with no wall-clock dependency. Keep them: they are what makes
// the coverage ratchet reproducible across machines.
import React from 'react';
import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import Taskbar from '../src/shell/Taskbar.jsx';
import Sidebar from '../src/shell/Sidebar.jsx';
import { BigClock } from '../src/shell/Screensaver.jsx';

const mount = (ui) => render(<OSProvider>{ui}</OSProvider>);

// Advance the fake wall clock past the next one-second tick and let React
// flush. The component's displayed time must change — that is the observable
// proof the interval callback actually ran.
const tickOnce = (el) => {
  const before = el.textContent;
  vi.setSystemTime(new Date(Date.now() + 120_000));
  act(() => { vi.advanceTimersByTime(1000); });
  return el.textContent !== before;
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('clock timers tick on a one-second interval', () => {
  it('Taskbar clock re-reads the time every second', () => {
    vi.useFakeTimers();
    const c = mount(
      <Taskbar
        openStart={() => {}}
        startOpen={false}
        openSettings={() => {}}
        toggleWidgets={() => {}}
        widgetsOpen={false}
      />,
    );
    const el = c.container.querySelector('#clock-time');
    expect(el).toBeTruthy();
    expect(tickOnce(el)).toBe(true);
  });

  it('Sidebar clock widget re-reads the time every second', () => {
    vi.useFakeTimers();
    const c = mount(<Sidebar onClose={() => {}} />);
    const el = c.container.querySelector('.widget-clock');
    expect(el).toBeTruthy();
    expect(tickOnce(el)).toBe(true);
  });

  it('Screensaver big clock re-reads the time every second', () => {
    vi.useFakeTimers();
    const c = mount(<BigClock />);
    const el = c.container.querySelector('.saver-time');
    expect(el).toBeTruthy();
    expect(tickOnce(el)).toBe(true);
  });
});
