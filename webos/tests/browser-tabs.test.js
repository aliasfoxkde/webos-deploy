// Pure unit tests for the browser tab model (tabs.js).
// The reducer and helpers have no UI dependencies — tested directly.
import { describe, it, expect } from 'vitest';
import {
  tabsReducer, initialTabs, makeTab, canBack, canForward,
} from '../src/apps/browser/tabs.js';
import { classify } from '../src/apps/browser/urls.js';

const NAV = (raw, tabId, resolved) => ({ type: 'navigate', tabId, raw, resolved });
const ACTIVATE = (id) => ({ type: 'activate', id });
const CLOSE = (id) => ({ type: 'close', id });
const BACK = (tabId) => ({ type: 'back', tabId });
const FORWARD = (tabId) => ({ type: 'forward', tabId });
const RELOAD = (tabId) => ({ type: 'reload', tabId });

// ---------------------------------------------------------------------------
// initialTabs
// ---------------------------------------------------------------------------
describe('initialTabs', () => {
  it('creates a single blank tab when no args given', () => {
    const s = initialTabs();
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].entries).toHaveLength(0);
    expect(s.active).toBe(s.tabs[0].id);
  });

  it('seeds a tab with a direct URL', () => {
    const s = initialTabs('https://wikipedia.org');
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].entries[0].url).toBeTruthy();
    expect(s.tabs[0].entries[0].mode).toBe('direct');
  });

  it('seeds a tab with a YouTube URL as embed', () => {
    const s = initialTabs('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
    expect(s.tabs[0].entries[0].mode).toBe('embed');
  });

  it('restores a valid session, clamping the active index', () => {
    const restore = {
      tabs: [
        { entries: [{ raw: 'https://a.com' }, { raw: 'https://b.com' }], index: 1 },
      ],
      active: 0,
    };
    const s = initialTabs(null, restore);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].index).toBe(1);
  });

  it('ignores a restore with no valid tabs', () => {
    const restore = { tabs: [], active: 0 };
    const s = initialTabs(null, restore);
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].entries).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// canBack / canForward
// ---------------------------------------------------------------------------
describe('canBack / canForward', () => {
  it('canBack is false at index 0', () => {
    const t = makeTab('https://a.com', classify('https://a.com'));
    expect(canBack(t)).toBe(false);
  });

  it('canBack is true when history exists', () => {
    const t = makeTab('https://a.com', classify('https://a.com'));
    t.index = 1;
    expect(canBack(t)).toBe(true);
  });

  it('canForward is false at the last entry', () => {
    const t = makeTab();
    t.entries = [
      { raw: 'https://a.com', url: 'https://a.com', mode: 'direct' },
      { raw: 'https://b.com', url: 'https://b.com', mode: 'direct' },
    ];
    t.index = 1;
    expect(canForward(t)).toBe(false);
  });

  it('canForward is true when forward entries exist', () => {
    const t = makeTab();
    t.entries = [
      { raw: 'https://a.com', url: 'https://a.com', mode: 'direct' },
      { raw: 'https://b.com', url: 'https://b.com', mode: 'direct' },
    ];
    t.index = 0;
    expect(canForward(t)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// close
// ---------------------------------------------------------------------------
describe("'close' action", () => {
  it('closing the last tab replaces it with a fresh blank tab', () => {
    const s = initialTabs();
    const id = s.tabs[0].id;
    const result = tabsReducer(s, CLOSE(id));
    expect(result.tabs).toHaveLength(1);
    expect(result.tabs[0].entries).toHaveLength(0);
  });

  it('closing the active tab activates the previous tab', () => {
    // Build a 2-tab state via initialTabs + dispatch
    const s0 = initialTabs('https://a.com');
    const t0 = s0.tabs[0];
    // Add a second tab
    const s1 = tabsReducer(s0, { type: 'new' });
    const t1 = s1.tabs.find((t) => t.id !== t0.id);
    const state = { tabs: [t0, t1], active: t1.id };
    const result = tabsReducer(state, CLOSE(t1.id));
    expect(result.active).toBe(t0.id);
  });

  it('closing the only tab keeps window alive', () => {
    const s = initialTabs('https://a.com');
    const result = tabsReducer(s, CLOSE(s.tabs[0].id));
    expect(result.tabs).toHaveLength(1);
    expect(result.active).toBe(result.tabs[0].id);
  });

  it('no-ops on a non-existent tab id', () => {
    const s = initialTabs();
    const result = tabsReducer(s, CLOSE('nonexistent'));
    expect(result).toEqual(s);
  });
});

// ---------------------------------------------------------------------------
// activate
// ---------------------------------------------------------------------------
describe("'activate' action", () => {
  it('switches the active tab', () => {
    const s0 = initialTabs('https://a.com');
    const t0 = s0.tabs[0];
    const s1 = tabsReducer(s0, { type: 'new' });
    const t1 = s1.tabs.find((t) => t.id !== t0.id);
    const state = { tabs: [t0, t1], active: t0.id };
    const result = tabsReducer(state, ACTIVATE(t1.id));
    expect(result.active).toBe(t1.id);
  });

  it('is idempotent when already active', () => {
    const s = initialTabs('https://a.com');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, ACTIVATE(id));
    expect(result.active).toBe(id);
    expect(result.tabs).toEqual(s.tabs);
  });

  it('no-ops for a non-existent tab id', () => {
    const s = initialTabs();
    const result = tabsReducer(s, ACTIVATE('nonexistent'));
    expect(result.active).toBe(s.active);
  });
});

// ---------------------------------------------------------------------------
// navigate (adds a new URL entry to a tab)
// ---------------------------------------------------------------------------
describe("'navigate' action", () => {
  it('adds an entry and advances the index', () => {
    const s = initialTabs('https://a.com');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, NAV('https://b.com', id, classify('https://b.com')));
    expect(result.tabs[0].entries).toHaveLength(2);
    expect(result.tabs[0].index).toBe(1);
  });

  it('each navigate advances the index by one', () => {
    const s0 = initialTabs('https://a.com');
    const id = s0.tabs[0].id;
    const s1 = tabsReducer(s0, NAV('https://b.com', id, classify('https://b.com')));
    const s2 = tabsReducer(s1, NAV('https://c.com', id, classify('https://c.com')));
    expect(s2.tabs[0].index).toBe(2);
    expect(s2.tabs[0].entries).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// back / forward (history navigation — index only, no new entries)
// ---------------------------------------------------------------------------
describe("'back' and 'forward' actions", () => {
  it('back moves the index backward', () => {
    const s0 = initialTabs('https://a.com');
    const id = s0.tabs[0].id;
    const s1 = tabsReducer(s0, NAV('https://b.com', id, classify('https://b.com')));
    const result = tabsReducer(s1, BACK(id));
    expect(result.tabs[0].index).toBe(0);
  });

  it('back clamps at 0', () => {
    const s = initialTabs('https://a.com');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, BACK(id));
    expect(result.tabs[0].index).toBe(0);
  });

  it('forward moves the index forward', () => {
    const s0 = initialTabs('https://a.com');
    const id = s0.tabs[0].id;
    // Navigate to add a second entry, then back to go to index 0, then forward to index 1
    const s1 = tabsReducer(s0, NAV('https://b.com', id, classify('https://b.com')));
    const s2 = tabsReducer(s1, BACK(id)); // back to index 0
    const result = tabsReducer(s2, FORWARD(id)); // forward to index 1
    expect(result.tabs[0].index).toBe(1);
  });

  it('forward clamps at the last index', () => {
    const s = initialTabs('https://a.com');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, FORWARD(id));
    expect(result.tabs[0].index).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reload
// ---------------------------------------------------------------------------
describe("'reload' action", () => {
  it('bumps the reloadKey', () => {
    const s = initialTabs('https://a.com');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, RELOAD(id));
    expect(result.tabs[0].reloadKey).toBe(1);
  });
});

// ---------------------------------------------------------------------------
// 'renavigate' (mode toggle)
// ---------------------------------------------------------------------------
describe("'renavigate' action", () => {
  it('changes the mode and bumps reloadKey', () => {
    const s = initialTabs('https://example.org');
    const id = s.tabs[0].id;
    const result = tabsReducer(s, { type: 'renavigate', tabId: id, resolved: { mode: 'proxy' } });
    expect(result.tabs[0].entries[0].mode).toBe('proxy');
    expect(result.tabs[0].reloadKey).toBe(1);
  });

  it('is a no-op when no entry at current index', () => {
    // A blank tab (no entries, index -1) should not crash
    const s = initialTabs();
    const id = s.tabs[0].id;
    const result = tabsReducer(s, { type: 'renavigate', tabId: id, resolved: { mode: 'proxy' } });
    expect(result.tabs[0]).toEqual(s.tabs[0]);
  });
});

// ---------------------------------------------------------------------------
// unknown action
// ---------------------------------------------------------------------------
describe('unknown action type', () => {
  it('returns state unchanged', () => {
    const s = initialTabs('https://a.com');
    // @ts-ignore
    const result = tabsReducer(s, { type: 'totally-unknown' });
    expect(result).toEqual(s);
  });
});
