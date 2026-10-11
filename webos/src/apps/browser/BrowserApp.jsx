import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  SEARCH_URL, classify, displayUrl, hostOf, normalizeAddress, titleFor,
} from './urls.js';
import { canBack, canForward, initialTabs, tabsReducer } from './tabs.js';

/* A Chromium-style browser for WebOS. Tabs with real per-tab history, a smart
   address bar, keyboard shortcuts, and an honest rendering stack:

   - embed    official embed endpoints (YouTube /embed/, Spotify /embed/)
   - direct   plain iframe — best fidelity where sites allow framing
   - proxy    same-origin /proxy (Pages Function) that strips framing headers
              server-side for sites that send X-Frame-Options/CSP
   - external structurally impossible (Discord: their client's API calls are
              CORS-gated to their own origin) — we say so, offer a real tab

   Cross-origin frames keep their internals private from us, so tab titles
   come from the host, not the page's <title>. */

const SESSION_KEY = 'webos.browser.session';
const MODES_KEY = 'webos.browser.modes';

const loadSession = () => {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch { return null; }
};
const loadModes = () => {
  try { return JSON.parse(localStorage.getItem(MODES_KEY)) ?? {}; } catch { return {}; }
};

const TILE_DEFAULTS = [
  { label: 'YouTube', url: 'https://www.youtube.com/watch?v=jfKfPfyJRdk', hint: 'embed player' },
  { label: 'Spotify', url: 'https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M', hint: 'embed player' },
  { label: 'Wikipedia', url: 'https://en.wikipedia.org/wiki/Web_browser', hint: 'direct frame' },
  { label: 'Hacker News', url: 'https://news.ycombinator.com/', hint: 'direct frame' },
  { label: 'GitHub', url: 'https://github.com/trending', hint: 'via proxy' },
  { label: 'Excalidraw', url: 'https://excalidraw.com/', hint: 'direct frame' },
];

/* Favicon with a letter-chip fallback — sites' own /favicon.ico loads fine
   cross-origin (images aren't CORS-bound). */
function Favicon({ url, accent }) {
  const [failed, setFailed] = useState(false);
  const host = hostOf(url);
  if (!host || failed) {
    return <span className="bw-fav bw-fav-chip" style={{ background: accent }}>{(host || '?')[0].toUpperCase()}</span>;
  }
  return (
    <img
      className="bw-fav"
      src={`https://${host}/favicon.ico`}
      alt=""
      width="16"
      height="16"
      onError={() => setFailed(true)}
    />
  );
}

function NewTabPage({ onGo }) {
  const [q, setQ] = useState('');
  return (
    <div className="bw-home">
      <h2>Where to?</h2>
      <form
        className="bw-home-search"
        onSubmit={(e) => { e.preventDefault(); onGo(q); }}
      >
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search the web or type a URL"
          aria-label="Search or type a URL"
        />
        <button className="btn accent" type="submit">Go</button>
      </form>
      <div className="bw-tiles">
        {TILE_DEFAULTS.map((t) => (
          <button key={t.url} type="button" className="bw-tile" onClick={() => onGo(t.url)}>
            <Favicon url={t.url} accent="var(--accent)" />
            <span className="bw-tile-label">{t.label}</span>
            <span className="bw-tile-hint">{t.hint}</span>
          </button>
        ))}
      </div>
      <p className="dim bw-home-note">
        Sites that publish embeds (YouTube, Spotify) play natively. Frame-hostile
        sites load through the built-in proxy — flip the shield in the address bar
        if a page stays blank. A few apps (Discord) call their own APIs from inside
        the page and can’t run anywhere but their own origin; those get an honest
        hand-off to a real tab.
      </p>
    </div>
  );
}

function ExternalPage({ entry }) {
  return (
    <div className="bw-external">
      <h3>…can’t run inside any window — ours or anyone else’s</h3>
      <p>{entry.reason}</p>
      <button className="btn accent" onClick={() => window.open(entry.url, '_blank', 'noopener')}>
        Open {hostOf(entry.url)} in a system tab ↗
      </button>
    </div>
  );
}

export default function BrowserApp({ args }) {
  const restore = useMemo(() => loadSession(), []);
  const [state, dispatch] = useReducer(
    tabsReducer,
    undefined,
    () => initialTabs(args?.url, restore),
  );
  const [modes, setModes] = useState(loadModes);
  const rootRef = useRef(null);
  const addressRef = useRef(null);

  const tab = state.tabs.find((t) => t.id === state.active) ?? state.tabs[0];
  const entry = tab.entries[tab.index] ?? null;

  /* Address draft: follow the active tab's location, but let the user type
     freely. Adjusted during render when the location changes (the React
     "adjust state when props change" pattern — no effect, no cascading). */
  const navKey = `${tab.id}:${tab.index}:${entry?.raw ?? ''}`;
  const [prevNavKey, setPrevNavKey] = useState(navKey);
  const [draft, setDraft] = useState(entry?.raw ?? '');
  if (navKey !== prevNavKey) {
    setPrevNavKey(navKey);
    setDraft(entry?.raw ?? '');
  }

  /* Session persistence — entries only; frames remount on restore. */
  useEffect(() => {
    const compact = {
      active: state.tabs.findIndex((t) => t.id === state.active),
      tabs: state.tabs.map((t) => ({ entries: t.entries, index: t.index })),
    };
    try { localStorage.setItem(SESSION_KEY, JSON.stringify(compact)); } catch { /* private mode */ }
  }, [state]);

  const go = useCallback((raw, tabId = state.active, override) => {
    const url = normalizeAddress(raw);
    if (!url) return;
    const host = hostOf(url);
    const resolved = classify(url, override ?? (host ? modes[host] : undefined));
    dispatch({ type: 'navigate', tabId, raw, resolved });
  }, [state.active, modes]);

  const cycleMode = useCallback(() => {
    if (!entry?.url || entry.mode === 'embed' || entry.mode === 'external') return;
    const host = hostOf(entry.url);
    const next = entry.mode === 'proxy' ? 'direct' : 'proxy';
    const resolved = classify(entry.url, next);
    setModes((m) => {
      const nextModes = { ...m, [host]: next };
      try { localStorage.setItem(MODES_KEY, JSON.stringify(nextModes)); } catch { /* private mode */ }
      return nextModes;
    });
    dispatch({ type: 'renavigate', tabId: tab.id, resolved });
  }, [entry, tab.id]);

  const navigateHistory = useCallback((delta) => {
    dispatch({ type: delta < 0 ? 'back' : 'forward', tabId: tab.id });
  }, [tab.id]);

  /* Chromium keyboard model. Capture-phase on the browser subtree so the
     shortcuts work from the tab strip and address bar; keys typed inside a
     cross-origin frame never reach us (frames get their own key loop). */
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const onKey = (e) => {
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && (e.key === 't' || e.key === 'T')) {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'new' });
      } else if (ctrl && (e.key === 'w' || e.key === 'W')) {
        e.preventDefault(); e.stopPropagation();
        if (state.tabs.length > 1) dispatch({ type: 'close', id: tab.id });
      } else if (ctrl && (e.key === 'l' || e.key === 'L')) {
        e.preventDefault(); e.stopPropagation();
        addressRef.current?.focus();
        addressRef.current?.select();
      } else if (ctrl && (e.key === 'r' || e.key === 'R')) {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'reload', tabId: tab.id });
      } else if (ctrl && e.key === 'Tab') {
        e.preventDefault(); e.stopPropagation();
        const i = state.tabs.findIndex((t) => t.id === tab.id);
        const d = e.shiftKey ? -1 : 1;
        const next = state.tabs[(i + d + state.tabs.length) % state.tabs.length];
        dispatch({ type: 'activate', id: next.id });
      } else if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault(); e.stopPropagation();
        navigateHistory(-1);
      } else if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault(); e.stopPropagation();
        navigateHistory(1);
      } else if (e.key === 'F5') {
        e.preventDefault(); e.stopPropagation();
        dispatch({ type: 'reload', tabId: tab.id });
      }
    };
    root.addEventListener('keydown', onKey, { capture: true });
    return () => root.removeEventListener('keydown', onKey, { capture: true });
  }, [state.tabs, tab.id, navigateHistory]);

  /* Every tab with a location keeps its frame mounted (hidden when inactive)
     so tabs preserve state like a real browser. */
  const modeLabel = entry ? { embed: 'Embed', direct: 'Direct', proxy: 'Proxy' }[entry.mode] : '';

  return (
    <div className="bw" ref={rootRef}>
      <div className="bw-strip" role="tablist" aria-label="Browser tabs">
        {state.tabs.map((t, i) => {
          const e = t.entries[t.index];
          return (
            <div
              key={t.id}
              role="tab"
              aria-selected={t.id === tab.id}
              tabIndex={0}
              className={`bw-tab ${t.id === tab.id ? 'active' : ''}`}
              onClick={() => dispatch({ type: 'activate', id: t.id })}
              onKeyDown={(ev) => {
                if (ev.key === 'Enter' || ev.key === ' ') {
                  ev.preventDefault();
                  dispatch({ type: 'activate', id: t.id });
                }
              }}
            >
              <Favicon url={e?.url} accent="var(--accent)" />
              <span className="bw-tab-title">{e ? titleFor(e.url) : 'New tab'}</span>
              <button
                type="button"
                className="bw-tab-close"
                aria-label={`Close tab ${i + 1}`}
                onClick={(ev) => { ev.stopPropagation(); dispatch({ type: 'close', id: t.id }); }}
              >
                ×
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="bw-newtab"
          title="New tab (Ctrl+T)"
          aria-label="New tab"
          onClick={() => dispatch({ type: 'new' })}
        >
          +
        </button>
      </div>

      <div className="bw-toolbar">
        <button
          type="button" className="bw-nav" title="Back (Alt+←)" aria-label="Back"
          disabled={!canBack(tab)} onClick={() => navigateHistory(-1)}
        >←</button>
        <button
          type="button" className="bw-nav" title="Forward (Alt+→)" aria-label="Forward"
          disabled={!canForward(tab)} onClick={() => navigateHistory(1)}
        >→</button>
        <button
          type="button" className="bw-nav" title="Reload (Ctrl+R)" aria-label="Reload"
          onClick={() => dispatch({ type: 'reload', tabId: tab.id })}
        >↻</button>
        <div className="bw-address">
          {entry && entry.mode !== 'external' && (
            <button
              type="button"
              className={`bw-shield ${entry.mode === 'proxy' ? 'on' : ''}`}
              title={`Rendering: ${modeLabel}. Click to switch to ${entry.mode === 'proxy' ? 'direct' : 'proxy'}.`}
              onClick={cycleMode}
            >
              {entry.mode === 'proxy' ? '◆' : '◇'} {modeLabel}
            </button>
          )}
          <form
            className="bw-address-form"
            onSubmit={(e) => { e.preventDefault(); go(draft); addressRef.current?.blur(); }}
          >
            <input
              ref={addressRef}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Escape') setDraft(entry ? entry.raw : ''); }}
              placeholder={`Search ${new URL(SEARCH_URL).host} or enter a URL`}
              aria-label="Address and search bar"
              spellCheck="false"
            />
          </form>
          {entry?.url && (
            <button
              type="button" className="bw-external-btn" title="Open in a system tab"
              aria-label="Open in a system tab"
              onClick={() => window.open(entry.url, '_blank', 'noopener')}
            >↗</button>
          )}
        </div>
      </div>

      <div className="bw-content">
        {state.tabs.map((t) => {
          const e = t.entries[t.index];
          const isActive = t.id === tab.id;
          if (e?.mode === 'external') {
            return isActive ? <ExternalPage key={t.id} entry={e} /> : null;
          }
          if (!e?.src) {
            return isActive ? (
              <NewTabPage key={t.id} onGo={(raw) => go(raw, t.id)} />
            ) : null;
          }
          return (
            <iframe
              key={`${t.id}:${t.index}:${t.reloadKey}`}
              title={titleFor(e.url)}
              src={e.src}
              className="bw-frame"
              hidden={!isActive}
              allow="fullscreen; clipboard-read; clipboard-write; camera; microphone; autoplay; encrypted-media; picture-in-picture"
              allowFullScreen
            />
          );
        })}
      </div>

      <div className="bw-status">
        <span>{entry?.url ? displayUrl(entry.url) : 'Ready'}</span>
        {entry?.mode === 'direct' && (
          <span className="dim">Blank frame? The site may forbid embedding — flip the shield to Proxy.</span>
        )}
      </div>
    </div>
  );
}
