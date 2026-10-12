// Tab/window model for the Browser app — a pure reducer over plain data so
// the tab lifecycle (open/close/activate, per-tab history, mode overrides,
// reloads) is unit-testable without a DOM. Entry shape:
//   { raw }              — what the user typed / the tile's target
//   … plus, on navigation: { url, src, mode, reason? } from urls.classify
import { classify } from './urls.js';

let seq = 0;
const freshId = () => `t${++seq}`;

export const makeEntry = (raw, resolved = null) =>
  resolved ? { raw, ...resolved } : { raw };

export const makeTab = (raw = '', resolved = null) => ({
  id: freshId(),
  entries: resolved ? [makeEntry(raw, resolved)] : [],
  index: resolved ? 0 : -1,
  reloadKey: 0,
});

/* `active` is always a tab ID — stable across closes, no index shifting. */
export function initialTabs(argUrl, restore = null) {
  // `active` is a tab ID everywhere (see above) — an arg-launched browser
  // used to seed `0`, which no tab ever has, so the session persist saved
  // `active: -1` (findIndex miss) and the NEXT plain launch crashed on
  // `tabs[-1].id` ("Browser can't start"). Seed the real id, and clamp the
  // restored index into range — stored sessions are hostile input.
  if (argUrl) {
    const t = makeTab(argUrl, classify(argUrl));
    return { tabs: [t], active: t.id };
  }
  if (restore && Array.isArray(restore.tabs) && restore.tabs.length) {
    const tabs = restore.tabs
      .filter((t) => t && Array.isArray(t.entries))
      .map((t) => ({
        id: freshId(),
        entries: t.entries.filter((e) => e && typeof e.raw === 'string'),
        index: Math.min(Math.max(t.index ?? 0, 0), Math.max(t.entries.length - 1, 0)),
        reloadKey: 0,
      }));
    if (tabs.length) {
      const at = Math.min(Math.max(restore.active ?? 0, 0), tabs.length - 1);
      return { tabs, active: tabs[at].id };
    }
  }
  const t = makeTab();
  return { tabs: [t], active: t.id };
}

const updateTab = (state, id, fn) => ({
  ...state,
  tabs: state.tabs.map((t) => (t.id === id ? fn(t) : t)),
});

export function tabsReducer(state, action) {
  switch (action.type) {
    case 'new': {
      const t = makeTab();
      return { ...state, tabs: [...state.tabs, t], active: t.id };
    }

    case 'close': {
      const idx = state.tabs.findIndex((t) => t.id === action.id);
      if (idx === -1) return state;
      const tabs = state.tabs.filter((t) => t.id !== action.id);
      // keep the window alive: closing the last tab gives a fresh one
      if (!tabs.length) {
        const fresh = makeTab();
        return { tabs: [fresh], active: fresh.id };
      }
      if (state.active === action.id) {
        return { tabs, active: tabs[Math.min(idx, tabs.length - 1)].id };
      }
      return { tabs, active: state.active };
    }

    case 'activate':
      return state.tabs.some((t) => t.id === action.id) ? { ...state, active: action.id } : state;

    /* Navigate the current tab: truncate the forward stack, append the entry. */
    case 'navigate':
      return updateTab(state, action.tabId, (t) => ({
        ...t,
        entries: [...t.entries.slice(0, t.index + 1), makeEntry(action.raw, action.resolved)],
        index: t.index + 1,
        reloadKey: t.reloadKey, // src change remounts via index; key bump not needed
      }));

    /* Re-navigate the current entry under a different mode (toolbar toggle). */
    case 'renavigate':
      return updateTab(state, action.tabId, (t) => {
        const cur = t.entries[t.index];
        if (!cur || !cur.url) return t;
        const entries = t.entries.slice();
        entries[t.index] = { ...cur, ...action.resolved };
        return { ...t, entries, reloadKey: t.reloadKey + 1 };
      });

    case 'back':
      return updateTab(state, action.tabId, (t) => ({ ...t, index: Math.max(t.index - 1, 0) }));

    case 'forward':
      return updateTab(state, action.tabId, (t) =>
        ({ ...t, index: Math.min(t.index + 1, t.entries.length - 1) }));

    case 'reload':
      return updateTab(state, action.tabId, (t) => ({ ...t, reloadKey: t.reloadKey + 1 }));

    default:
      return state;
  }
}

export const canBack = (t) => t.index > 0;
export const canForward = (t) => t.index < t.entries.length - 1;
