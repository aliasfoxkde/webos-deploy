import React, { useEffect, useRef, useState } from 'react';
import { useOS } from '../../os/state.jsx';
import { kvGet, kvSet } from '../../os/db.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';

/* Built-in terminal: shell-style commands over the OS itself, plus raw JS
   evaluation as the pass-through escape hatch. */
const HELP = [
  'help                 this text',
  'apps                 list installed apps',
  'open <id>            launch an app (e.g. open gridcraft)',
  'close <id>           close its window',
  'install <id>         install a store app',
  'uninstall <id>       remove a store app',
  'store                open the App Store',
  'settings             open Settings',
  'theme <preset>       midnight | ocean | forest | sunset | light',
  'accent <color>       set accent (name or #hex, e.g. accent emerald)',
  'wallpaper <url>      set a wallpaper image ("" to clear)',
  'sqlite <sql>         run SQL on the persistent webos database',
  'fullscreen           toggle fullscreen',
  'date | echo | uname | whoami | neofetch',
  'clear                clear the screen',
  '<anything else>      evaluated as JavaScript',
];

const NAMED = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', yellow: '#eab308', lime: '#a3e635',
  green: '#34d399', emerald: '#10b981', teal: '#2dd4bf', cyan: '#22d3ee', sky: '#38bdf8',
  blue: '#60a5fa', indigo: '#818cf8', violet: '#a78bfa', purple: '#c084fc', magenta: '#e879f9', pink: '#f472b6',
};

/* -- sqlite: real SQLite (sql.js WASM) over a database that persists to
   IndexedDB after every statement. The module + wasm load lazily on first
   use so the terminal chunk stays light. -- */
const SQL_DB_KEY = 'sqlite.db';
const fmtVal = (v) => (v === null ? 'NULL' : v instanceof Uint8Array ? `<blob ${v.length}B>` : String(v));
const renderTable = (r) => {
  const rows = [r.columns, ...r.values.map((row) => row.map(fmtVal))];
  const w = r.columns.map((_, c) => Math.max(...rows.map((row) => String(row[c] ?? '').length)));
  return rows.map((row) => row.map((cell, c) => String(cell ?? '').padEnd(w[c])).join(' | ')).join('\n');
};

export default function Terminal() {
  const os = useOS();
  const [lines, setLines] = useState(() => [
    { t: 'out', s: 'ArtCraft WebOS Terminal — type `help` for commands, anything else runs as JavaScript.' },
  ]);
  const [input, setInput] = useState('');
  const [hist, setHist] = useState([]);
  const [hIdx, setHIdx] = useState(-1);
  const endRef = useRef(null);
  const inputRef = useRef(null);
  const sqlRef = useRef(null); // opened SQL.Database, kept for the session

  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [lines]);

  const push = (t, s) => setLines((ls) => [...ls.slice(-400), { t, s }]);

  const sqlReady = async () => {
    if (sqlRef.current) return sqlRef.current;
    push('out', 'loading sql.js…');
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs({ locateFile: () => wasmUrl });
    const saved = await kvGet(SQL_DB_KEY);
    sqlRef.current = saved ? new SQL.Database(saved) : new SQL.Database();
    return sqlRef.current;
  };

  const runSql = async (sql) => {
    if (!sql.trim()) {
      push('out', 'usage: sqlite <sql>  — e.g. sqlite CREATE TABLE t (id INTEGER, name TEXT)');
      push('out', 'one persistent database (IndexedDB, survives reloads) for the whole OS.');
      return;
    }
    try {
      const db = await sqlReady();
      const results = db.exec(sql);
      if (!results.length) push('out', 'ok');
      results.forEach((r) => push('out', renderTable(r)));
      const bytes = db.export();
      await kvSet(SQL_DB_KEY, bytes);
      push('out', `— saved (${bytes.length} bytes → IndexedDB ${SQL_DB_KEY})`);
    } catch (err) {
      push('err', String(err.message || err));
    }
  };

  function run(raw) {
    const cmd = raw.trim();
    push('in', cmd);
    if (!cmd) return;
    const [head, ...rest] = cmd.split(/\s+/);
    const arg = rest.join(' ');
    switch (head) {
      case 'help': HELP.forEach((l) => push('out', l)); return;
      case 'clear': setLines([]); return;
      case 'date': push('out', new Date().toString()); return;
      case 'echo': push('out', arg); return;
      case 'whoami': push('out', 'webos-user'); return;
      case 'uname': push('out', 'ArtCraft WebOS 2.0 (browser) — ' + navigator.userAgent.slice(0, 60) + '…'); return;
      case 'neofetch':
        [
          '        ▄▄▄▄▄▄▄        webos@browser',
          '     ▄█████████▄      ---------------',
          '   ▄███  WEBOS  ███▄   OS: ArtCraft WebOS 2.0',
          '   ███  ▄▄▄▄▄▄▄  ███   Shell: wosh 0.2',
          '   ███  ███████  ███   Apps: ' + os.apps.length + ' installed',
          '   ▀███  ▀▀▀▀▀▀▀  ███▀  Windows: ' + os.windows.length + ' open',
          '     ▀█████████▀      Accent: ' + os.theme.accent,
          '        ▀▀▀▀▀▀▀        Theme: ' + os.theme.preset,
        ].forEach((l) => push('out', l));
        return;
      case 'apps':
        os.apps.forEach((a) => push('out', `${a.id.padEnd(14)} ${a.name}  —  ${a.tagline}${a.embed ? '' : '  (new tab only)'}`));
        return;
      case 'open': {
        const app = os.findApp(arg);
        if (!app) { push('err', `no such app: ${arg}`); return; }
        os.launch(app.id); push('out', `launching ${app.name}…`);
        return;
      }
      case 'close': {
        const w = os.windows.find((x) => x.appId === arg);
        if (!w) { push('err', `not running: ${arg}`); return; }
        os.close(w.id); push('out', `closed ${arg}`);
        return;
      }
      case 'install': os.install(arg); push('out', `installed ${arg}`); return;
      case 'uninstall': os.uninstall(arg); push('out', `uninstalled ${arg}`); return;
      case 'store': os.launch('store'); return;
      case 'settings': os.launch('settings'); return;
      case 'fullscreen': document.dispatchEvent(new CustomEvent('webos:fullscreen')); push('out', 'toggled fullscreen'); return;
      case 'theme':
        if (['midnight', 'ocean', 'forest', 'sunset', 'light'].includes(arg)) { os.setTheme({ preset: arg, wallpaper: '' }); push('out', `theme: ${arg}`); }
        else push('err', 'themes: midnight ocean forest sunset light');
        return;
      case 'accent': {
        const c = NAMED[arg] || (/^#[0-9a-fA-F]{3,8}$/.test(arg) ? arg : null);
        if (!c) { push('err', 'usage: accent <name|#hex>  (' + Object.keys(NAMED).join(' ') + ')'); return; }
        os.setTheme({ accent: c }); push('out', `accent: ${c}`);
        return;
      }
      case 'wallpaper':
        os.setTheme({ wallpaper: arg });
        push('out', arg ? 'wallpaper set' : 'wallpaper cleared');
        return;
      case 'sqlite':
        runSql(arg);
        return;
      default: {
        // Pass-through: evaluate as JavaScript in a scoped function.
        try {
          const fn = new Function(`"use strict"; return (${cmd});`);
          let v;
          try { v = fn(); } catch { v = new Function(`"use strict"; ${cmd}`)(); }
          push('out', typeof v === 'string' ? v : String(v));
        } catch (err) {
          push('err', String(err.message || err));
        }
      }
    }
  }

  const onKey = (e) => {
    if (e.key === 'Enter') {
      run(input);
      if (input.trim()) setHist((h) => [...h, input]);
      setHIdx(-1);
      setInput('');
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
      if (hist[i] !== undefined) { setHIdx(i); setInput(hist[i]); }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (hIdx >= 0 && hIdx < hist.length - 1) { setHIdx(hIdx + 1); setInput(hist[hIdx + 1]); }
      else { setHIdx(-1); setInput(''); }
    } else if (e.key === 'l' && e.ctrlKey) {
      e.preventDefault(); setLines([]);
    }
  };

  return (
    <div className="terminal" onClick={() => inputRef.current?.focus()}>
      <div className="t-scroll">
        {lines.map((l, i) => (
          <div key={i} className={`t-line ${l.t}`}>
            {l.t === 'in' ? <span className="t-prompt">❯</span> : null}
            <span className={l.t === 'err' ? 't-err' : undefined}>{l.s}</span>
          </div>
        ))}
        <div className="t-line in">
          <span className="t-prompt">❯</span>
          <input
            ref={inputRef}
            value={input}
            spellCheck={false}
            autoFocus
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKey}
            aria-label="terminal input"
          />
        </div>
        <div ref={endRef} />
      </div>
    </div>
  );
}
