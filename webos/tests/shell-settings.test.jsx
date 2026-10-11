// Settings component — deep-links, rail navigation, and the single-instance
// retarget: settings is one window, so a later launch('settings', {initial})
// arrives as new args on the SAME mounted instance and must move the rail.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, fireEvent, cleanup } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import Settings, { SECTIONS } from '../src/shell/Settings.jsx';

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.className = '';
  document.body.style.cssText = '';
  document.documentElement.style.cssText = '';
  delete document.body.dataset.persona;
});

const mountAt = (args) => render(<OSProvider><Settings args={args} /></OSProvider>);
const activeRail = (c) => c.container.querySelector('.set-nav.on').textContent;

describe('Settings', () => {
  it('opens on the requested section; an unknown deep-link falls back to Appearance', () => {
    const c = mountAt({ initial: 'sound' });
    expect(activeRail(c)).toContain('Sound');
    const c2 = mountAt({ initial: 'nope' });
    expect(activeRail(c2)).toContain('Appearance');
    expect(SECTIONS[0].id).toBe('appearance');
  });

  it('rail clicks switch sections with aria-current and the pane heading following', () => {
    const c = mountAt({});
    const about = [...c.container.querySelectorAll('.set-nav')]
      .find((b) => b.textContent.includes('About'));
    fireEvent.click(about);
    expect(activeRail(c)).toContain('About');
    expect(about.getAttribute('aria-current')).toBe('page');
    expect(c.container.querySelector('.set-pane h2').textContent).toBe('About');
  });

  it('a relaunch deep-link retargets the running window; a bare relaunch does not', () => {
    const c = mountAt({ initial: 'sound' });
    c.rerender(<OSProvider><Settings args={{ initial: 'taskbar' }} /></OSProvider>);
    expect(activeRail(c)).toContain('Taskbar');
    c.rerender(<OSProvider><Settings args={{}} /></OSProvider>);
    expect(activeRail(c)).toContain('Taskbar'); // stays where it was
  });
});
