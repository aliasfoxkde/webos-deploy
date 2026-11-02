// Accessibility behaviour that a token-level contrast gate cannot see:
// modal focus trapping + focus restoration, ARIA tab/tabpanel wiring, the
// window-lifecycle live region, and the reduced-motion / visually-hidden
// primitives the shell relies on.
//
// The contrast auditor (tests/contrast-audit.test.js) covers WCAG 1.4.3,
// 1.4.6 and 1.4.11 at the token level. These are the behavioural items:
// 2.1.2 (no keyboard trap) / 2.4.3 (focus order) / 4.1.2 (name, role,
// value) for the parts of the shell that are not text.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, fireEvent, cleanup, act } from '@testing-library/react';
import SaveDialog from '../src/shell/SaveDialog.jsx';
import Welcome from '../src/shell/Welcome.jsx';
import AddApp from '../src/shell/AddApp.jsx';
import useModalFocus from '../src/shell/useModalFocus.js';

beforeEach(() => {
  cleanup();
  document.body.innerHTML = '';
  localStorage.clear();
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/* A minimal dialog harness that exercises the shared hook the shell uses. */
function Trap({ onClose }) {
  const ref = useModalFocus(true);
  return (
    <div>
      <button type="button" data-testid="outside">outside</button>
      <div role="dialog" aria-modal="true" aria-label="Trap" ref={ref} tabIndex={-1}>
        <button type="button" data-testid="first">first</button>
        <button type="button" data-testid="close" onClick={onClose}>close</button>
        <button type="button" data-testid="last">last</button>
      </div>
    </div>
  );
}

describe('useModalFocus', () => {
  it('moves focus into the dialog on mount', () => {
    render(<Trap />);
    const dialog = screen.getByRole('dialog');
    expect(document.activeElement).toBe(dialog);
  });

  it('wraps Tab from the last focusable back to the first', () => {
    render(<Trap />);
    const first = screen.getByTestId('first');
    const last = screen.getByTestId('last');
    last.focus();
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(first);
  });

  it('wraps Shift+Tab from the first focusable back to the last', () => {
    render(<Trap />);
    const first = screen.getByTestId('first');
    const last = screen.getByTestId('last');
    first.focus();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it('pulls focus back in when it has escaped the dialog', () => {
    render(<Trap />);
    const outside = screen.getByTestId('outside');
    outside.focus();
    expect(document.activeElement).toBe(outside);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' });
    expect(document.activeElement).toBe(screen.getByTestId('first'));
  });

  it('ignores keys other than Tab', () => {
    render(<Trap />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'a' });
    expect(document.activeElement).toBe(dialog);
  });

  it('keeps focus on the dialog when it has no focusable children', () => {
    function Empty() {
      const ref = useModalFocus(true);
      return <div role="dialog" aria-modal="true" aria-label="Empty" ref={ref} tabIndex={-1}><p>text only</p></div>;
    }
    render(<Empty />);
    const dialog = screen.getByRole('dialog');
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(document.activeElement).toBe(dialog);
  });

  it('restores focus to the previously focused element on unmount', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(<Trap />);
    expect(document.activeElement).not.toBe(trigger);
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it('tolerates an unmount with no previously focused element', () => {
    document.body.innerHTML = '';
    const { unmount } = render(<Trap />);
    expect(() => unmount()).not.toThrow();
    expect(document.activeElement).toBe(document.body);
  });

  it('does not steal focus when inactive', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    function Inactive() {
      const ref = useModalFocus(false);
      return <div role="dialog" aria-label="Off" ref={ref} tabIndex={-1}><span /></div>;
    }
    render(<Inactive />);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('shell dialogs', () => {
  it('SaveDialog traps focus and restores it on close', () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = render(
      <SaveDialog suggestedName="x.png" directory="/Apps" format="PNG" onSave={() => {}} onCancel={() => {}} />,
    );
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    // Focus lands inside the dialog (the filename input is auto-focused).
    expect(dialog.contains(document.activeElement)).toBe(true);
    unmount();
    expect(document.activeElement).toBe(trigger);
  });

  it('Welcome is a modal dialog with an accessible name', async () => {
    const { OSProvider } = await import('../src/os/state.jsx');
    render(<OSProvider><Welcome onEnter={() => {}} /></OSProvider>);
    const dialog = screen.getByRole('dialog', { name: 'Welcome to WebOS' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.hasAttribute('tabindex')).toBe(true);
  });

  it('AddApp is a modal dialog with an accessible name', () => {
    render(<AddApp onClose={() => {}} />);
    const dialog = screen.getByRole('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(dialog.getAttribute('aria-label')).toBe('Add app');
  });

  it('AddApp in edit mode names itself as the edit dialog', () => {
    render(<AddApp app={{ id: 'x', name: 'My App', icon: '', url: '', tagline: '', category: 'Utilities' }} onClose={() => {}} />);
    expect(screen.getByRole('dialog').getAttribute('aria-label')).toBe('Edit app');
  });
});

describe('tab semantics', () => {
  it('the browser tablist contains only tabs, and the new-tab button sits outside it', async () => {
    const { default: BrowserApp } = await import('../src/apps/browser/BrowserApp.jsx');
    render(<BrowserApp />);
    const list = document.querySelector('[role="tablist"]');
    expect(list).toBeTruthy();
    expect(list.getAttribute('aria-label')).toBe('Browser tabs');
    for (const child of list.children) {
      expect(child.getAttribute('role')).toBe('tab');
    }
    // The new-tab button must not be a tablist child.
    const newTab = screen.getByLabelText('New tab');
    expect(newTab.closest('[role="tablist"]')).toBeNull();
  });

  it('every role=tab points at a tabpanel that exists', async () => {
    const { default: BrowserApp } = await import('../src/apps/browser/BrowserApp.jsx');
    render(<BrowserApp />);
    for (const tab of document.querySelectorAll('[role="tab"]')) {
      const controls = tab.getAttribute('aria-controls');
      expect(controls).toBeTruthy();
      expect(document.getElementById(controls)).toBeTruthy();
    }
  });
});

describe('window lifecycle announcements', () => {
  it('announces window open and close through a polite live region', async () => {
    vi.stubGlobal('fetch', () => new Promise(() => {})); // iframes/store stay hermetic
    const { default: App } = await import('../src/App.jsx');
    const { OSProvider } = await import('../src/os/state.jsx');
    localStorage.setItem('webos.welcomed', 'true');
    history.replaceState(null, '', '/');
    await act(async () => {
      render(<OSProvider><App /></OSProvider>);
    });
    const region = document.querySelector('[role="status"][aria-live="polite"]');
    expect(region).toBeTruthy();
    expect(region.textContent).toBe('');

    await act(async () => {
      window.__os.launch('calc');
    });
    expect(region.textContent).toMatch(/window opened/i);

    const opened = region.textContent;
    await act(async () => {
      window.__os.close(window.__os.windows[0].id);
    });
    expect(region.textContent).not.toBe(opened);
    expect(region.textContent).toMatch(/closed/i);
    vi.unstubAllGlobals();
  });
});

describe('reduced motion and visually-hidden', () => {
  it('the stylesheet disables decorative animation under prefers-reduced-motion', () => {
    const css = require('node:fs').readFileSync('src/styles.css', 'utf8');
    const block = css.slice(css.indexOf('@media (prefers-reduced-motion: reduce)'));
    const reduced = block.slice(0, block.indexOf('\n}'));
    expect(reduced).toMatch(/animation: none !important/);
    // Every decorative animation class must be covered, not just the shell ones.
    for (const cls of ['.spin', '.boot-slide', '.sb-in', '.wp-a-float', '.wp-a-drift', '#screensaver']) {
      expect(reduced).toContain(cls);
    }
  });

  it('the visually-hidden utility exists for screen-reader-only text', () => {
    const css = require('node:fs').readFileSync('src/styles.css', 'utf8');
    expect(css).toMatch(/\.visually-hidden\s*\{/);
    expect(css).toMatch(/clip-path: inset\(50%\)/);
  });
});
