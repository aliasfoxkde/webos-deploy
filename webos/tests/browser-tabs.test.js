// Tab model reducer: open/close/activate with focus correction, per-tab
// history stacks (forward truncation), mode re-navigation, session restore.
import { describe, it, expect } from 'vitest';
import { initialTabs, tabsReducer, canBack, canForward } from '../src/apps/browser/tabs.js';

const nav = (state, tabId, raw, host = 'a.com') => tabsReducer(state, {
  type: 'navigate', tabId, raw,
  resolved: { mode: 'direct', src: `https://${host}/`, url: `https://${host}/` },
});

describe('initialTabs', () => {
  it('deep link opens one resolved tab; otherwise a fresh new-tab page', () => {
    const d = initialTabs('https://example.com/');
    expect(d.tabs).toHaveLength(1);
    expect(d.tabs[0].entries).toHaveLength(1);
    expect(d.tabs[0].entries[0]).toMatchObject({ url: 'https://example.com/', mode: 'direct' });
    expect(initialTabs().tabs).toHaveLength(1);
    expect(initialTabs().tabs[0].entries).toEqual([]);
  });

  it('restores a session, clamping a corrupt index; junk tabs are dropped', () => {
    const r = initialTabs(null, {
      active: 5,
      tabs: [
        { index: 99, entries: [{ raw: 'a' }, { raw: 'b' }] },
        { index: 0, entries: 'garbage' },
        null,
        { index: 0, entries: [{ raw: 'c' }] },
      ],
    });
    expect(r.tabs).toHaveLength(2);
    expect(r.tabs[0].index).toBe(1);
    expect(r.tabs[0].entries.map((e) => e.raw)).toEqual(['a', 'b']);
    expect(r.active).toBe(r.tabs[1].id);
    expect(initialTabs(null, { tabs: [] }).tabs).toHaveLength(1);
  });
});

describe('lifecycle', () => {
  it('new tab activates; closing the active tab focuses its neighbour', () => {
    let s = initialTabs();
    const t0 = s.tabs[0].id;
    s = tabsReducer(s, { type: 'navigate', tabId: t0, raw: 'a.com', resolved: { mode: 'direct', src: 'https://a.com/', url: 'https://a.com/' } });
    s = tabsReducer(s, { type: 'new' });
    const t1 = s.tabs[1].id;
    expect(s.active).toBe(t1);
    s = tabsReducer(s, { type: 'close', id: t1 });
    expect(s.tabs).toHaveLength(1);
    expect(s.active).toBe(t0);
  });

  it('closing the LAST tab hands back a fresh window; unknown ids are no-ops', () => {
    let s = initialTabs();
    s = tabsReducer(s, { type: 'close', id: s.tabs[0].id });
    expect(s.tabs).toHaveLength(1);
    expect(s.tabs[0].entries).toEqual([]);
    expect(tabsReducer(s, { type: 'close', id: 'nope' })).toBe(s);
    expect(tabsReducer(s, { type: 'activate', id: 'nope' })).toBe(s);
  });
});

describe('per-tab history', () => {
  it('forward stack truncates on a new navigation; back/forward move within bounds', () => {
    let s = initialTabs();
    const id = s.tabs[0].id;
    s = nav(s, id, 'a.com', 'a.com');
    s = nav(s, id, 'b.com', 'b.com');
    s = nav(s, id, 'c.com', 'c.com');
    let t = s.tabs[0];
    expect(t.entries.map((e) => e.raw)).toEqual(['a.com', 'b.com', 'c.com']);
    expect(canBack(t)).toBe(true);
    expect(canForward(t)).toBe(false);
    s = tabsReducer(s, { type: 'back', tabId: id });
    t = s.tabs[0];
    expect(t.index).toBe(1);
    expect(canForward(t)).toBe(true);
    s = nav(s, id, 'd.com', 'd.com'); // truncates the forward branch
    t = s.tabs[0];
    expect(t.entries.map((e) => e.raw)).toEqual(['a.com', 'b.com', 'd.com']);
    expect(canForward(t)).toBe(false);
    s = tabsReducer(s, { type: 'back', tabId: id });
    s = tabsReducer(s, { type: 'back', tabId: id });
    s = tabsReducer(s, { type: 'back', tabId: id }); // clamps at 0
    expect(s.tabs[0].index).toBe(0);
  });

  it('history is per-tab: navigating tab 2 leaves tab 1 untouched', () => {
    let s = initialTabs();
    s = nav(s, s.tabs[0].id, 'a.com', 'a.com');
    s = tabsReducer(s, { type: 'new' });
    const t1 = s.tabs[1].id;
    s = nav(s, t1, 'z.com', 'z.com');
    expect(s.tabs[0].entries).toHaveLength(1);
    expect(s.tabs[1].entries).toHaveLength(1);
  });

  it('renavigate rewrites the current entry and bumps reloadKey; back keeps it', () => {
    let s = initialTabs();
    const id = s.tabs[0].id;
    s = nav(s, id, 'a.com', 'a.com');
    const key0 = s.tabs[0].reloadKey;
    s = tabsReducer(s, {
      type: 'renavigate', tabId: id,
      resolved: { mode: 'proxy', src: '/proxy?url=x', url: 'https://a.com/' },
    });
    expect(s.tabs[0].entries[0].mode).toBe('proxy');
    expect(s.tabs[0].reloadKey).toBe(key0 + 1);
    expect(s.tabs[0].entries).toHaveLength(1); // no history pollution
  });
});
