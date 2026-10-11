import React, { useEffect, useRef } from 'react';
import { useOS } from '../../os/state.jsx';
import { kvGet, kvSet, fileList } from '../../os/db.js';
import { join } from './wasi.js';
import { HOME, tilde, expandTilde } from './paths.js';
import { edit } from './lineedit.js';
import { splitPipes } from './pipes.js';
import wasmUrl from 'sql.js/dist/sql-wasm.wasm?url';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { VERSION } from '../../version.js';
import { UTIL_NAMES, runUtil } from './coreutils.js';

/* Built-in terminal — xterm.js frontend (lazy chunk) over the `wosh`
   shell: a real command language that mutates OS state (apps, windows,
   settings paths, theme/persona, SQLite), runs real utilities through the
   bundled uutils coreutils.wasm (see coreutils.js — the Files-app disk is
   the preopen root, mounted at the session cwd) with | pipelines, a
   readline-style line editor (see lineedit.js), tab completion for
   commands and paths, ↑/↓ history, Ctrl+C/Ctrl+L. Unknown input still
   evaluates as JavaScript — the pass-through escape hatch. */

const HELP = [
  'wosh — the WebOS shell. Everything here mutates the real OS.',
  '  help                    this text',
  '  apps                    list installed apps',
  '  open|launch <id>        launch an app (multi-instance)',
  '  close <id>|all          close windows by app id',
  '  windows                 list open windows',
  '  install|uninstall <id>  manage store apps',
  '  store | settings [sec]  open the App Store / Settings (deep-link a section)',
  '  get <path>              read a settings path (try: get ui.scale)',
  '  set <path> <value>      write one (set taskbar.position top)',
  '  persona [id]            show or switch the OS persona',
  '  theme <preset>          midnight | ocean | forest | sunset | light',
  '  accent <color|#hex>     set the accent color',
  '  wallpaper <url>         wallpaper image ("" clears)',
  '  volume <0-100>          master volume',
  '  os | os.status          system status',
  '  sqlite <sql>            SQL on the persistent OS database',
  '  cd <dir> | pwd          change / print directory on the Files disk (~ = home)',
  '  utils                   list the bundled coreutils utilities',
  '  <util> [args…]          run a real utility (ls, cat, wc, seq, sort, sha256sum…)',
  '                          relative paths resolve against the current directory',
  '  <util> | <util>         pipe stdout → stdin (try: echo hi | tr a-z A-Z)',
  '  coreutils <util> …      force the wasm multicall past the builtins',
  `                          (${UTIL_NAMES.size} utilities; the Files disk is mounted at / — start in ~ and try ls)`,
  '  history | fullscreen | date | echo | uname | whoami | neofetch',
  '  clear                   clear the screen        (Ctrl+L)',
  '  editing                 ←→ Home End Del · Ctrl+A/E/U/K · Ctrl+W/Alt+B/F words · Tab completes',
  '  <anything else>         evaluated as JavaScript — `os` is in scope',
];

const NAMED = {
  red: '#f87171', orange: '#fb923c', amber: '#fbbf24', yellow: '#eab308', lime: '#a3e635',
  green: '#34d399', emerald: '#10b981', teal: '#2dd4bf', cyan: '#22d3ee', sky: '#38bdf8',
  blue: '#60a5fa', indigo: '#818cf8', violet: '#a78bfa', purple: '#c084fc', magenta: '#e879f9', pink: '#f472b6',
};

const PERSONA_IDS = ['win', 'mac', 'linux', 'bsd', 'android', 'tui'];
const THEME_PRESETS = ['midnight', 'ocean', 'forest', 'sunset', 'light'];

/* Settings paths for get/set. `set` returns the applied (coerced) value so
   the shell can echo truth without racing React's next render. */
const SETTINGS_PATHS = {
  'persona': { get: (o) => o.persona, set: (o, v) => { const x = String(v); o.setPersona(x); return x; } },
  'theme.preset': { get: (o) => o.theme.preset, set: (o, v) => { const x = String(v); o.setTheme({ preset: x, wallpaper: '' }); return x; } },
  'theme.accent': { get: (o) => o.theme.accent, set: (o, v) => { const x = String(v); o.setTheme({ accent: x }); return x; } },
  'theme.wallpaper': { get: (o) => o.theme.wallpaper, set: (o, v) => { const x = String(v); o.setTheme({ wallpaper: x }); return x; } },
  'ui.scale': { get: (o) => o.ui.scale, set: (o, v) => { const x = num(v, 1, 0.85, 1.25); o.setUi({ scale: x }); return x; } },
  'ui.anim': { get: (o) => o.ui.anim, set: (o, v) => { const x = bool(v); o.setUi({ anim: x }); return x; } },
  'ui.transparency': { get: (o) => o.ui.transparency, set: (o, v) => { const x = num(v, 1, 0.5, 1.2); o.setUi({ transparency: x }); return x; } },
  'ui.radius': { get: (o) => o.ui.radius, set: (o, v) => { const x = String(v); o.setUi({ radius: x }); return x; } },
  'ui.blur': { get: (o) => o.ui.blur, set: (o, v) => { const x = String(v); o.setUi({ blur: x }); return x; } },
  'ui.focusHover': { get: (o) => o.ui.focusHover, set: (o, v) => { const x = bool(v); o.setUi({ focusHover: x }); return x; } },
  'ui.tbSide': { get: (o) => o.ui.tbSide, set: (o, v) => { const x = ['left', 'right'].includes(v) ? v : ''; o.setUi({ tbSide: x }); return x || '(persona)'; } },
  'ui.titleAlign': { get: (o) => o.ui.titleAlign, set: (o, v) => { const x = ['left', 'center'].includes(v) ? v : ''; o.setUi({ titleAlign: x }); return x || '(persona)'; } },
  'ui.font': { get: (o) => o.ui.font, set: (o, v) => { const x = ['rounded', 'mono', 'serif'].includes(v) ? v : ''; o.setUi({ font: x }); return x || '(persona)'; } },
  'ui.shadow': { get: (o) => o.ui.shadow, set: (o, v) => { const x = ['off', 'soft', 'deep'].includes(v) ? v : ''; o.setUi({ shadow: x }); return x || '(persona)'; } },
  'taskbar.position': { get: (o) => o.taskbar.position, set: (o, v) => { const x = v === 'top' ? 'top' : 'bottom'; o.setTaskbar({ position: x }); return x; } },
  'taskbar.align': { get: (o) => o.taskbar.align, set: (o, v) => { const x = v === 'center' ? 'center' : 'left'; o.setTaskbar({ align: x }); return x; } },
  'taskbar.iconSize': { get: (o) => o.taskbar.iconSize, set: (o, v) => { const x = ['sm', 'md', 'lg'].includes(v) ? v : 'md'; o.setTaskbar({ iconSize: x }); return x; } },
  'taskbar.autohide': { get: (o) => o.taskbar.autohide, set: (o, v) => { const x = bool(v); o.setTaskbar({ autohide: x }); return x; } },
  'taskbar.labels': { get: (o) => o.taskbar.labels, set: (o, v) => { const x = bool(v); o.setTaskbar({ labels: x }); return x; } },
  'taskbar.clock24': { get: (o) => o.taskbar.clock24, set: (o, v) => { const x = bool(v); o.setTaskbar({ clock24: x }); return x; } },
  'taskbar.showDate': { get: (o) => o.taskbar.showDate, set: (o, v) => { const x = bool(v); o.setTaskbar({ showDate: x }); return x; } },
  'desktop.iconSize': { get: (o) => o.desktop.iconSize, set: (o, v) => { const x = ['sm', 'md', 'lg'].includes(v) ? v : 'md'; o.setDesktop({ iconSize: x }); return x; } },
  'desktop.gap': { get: (o) => o.desktop.gap, set: (o, v) => { const x = ['compact', 'normal', 'roomy'].includes(v) ? v : 'normal'; o.setDesktop({ gap: x }); return x; } },
  'volume.master': { get: (o) => Math.round((o.volume.muted ? 0 : o.volume.level) * 100), set: (o, v) => { const x = num(v, 70, 0, 100); o.setVolume({ level: x / 100, muted: false }); return x; } },
  'volume.mute': { get: (o) => o.volume.muted, set: (o, v) => { const x = bool(v); o.setVolume({ muted: x }); return x; } },
};
const num = (v, d, lo, hi) => Math.min(hi, Math.max(lo, Number.isFinite(Number(v)) ? Number(v) : d));
const bool = (v) => v === true || v === 'true' || v === 'on' || v === '1';

/* -- SQLite (sql.js) over the IndexedDB-persistent OS database -- */
const SQL_DB_KEY = 'sqlite.db';
const fmtVal = (v) => (v === null ? 'NULL' : v instanceof Uint8Array ? `<blob ${v.length}B>` : String(v));
const renderTable = (r) => {
  const rows = [r.columns, ...r.values.map((row) => row.map(fmtVal))];
  const w = r.columns.map((_, c) => Math.max(...rows.map((row) => String(row[c] ?? '').length)));
  return rows.map((row) => row.map((cell, c) => String(cell ?? '').padEnd(w[c])).join(' | ')).join('\n');
};

const C = { prompt: '\x1b[38;5;81m', dim: '\x1b[90m', err: '\x1b[91m', ok: '\x1b[92m', reset: '\x1b[0m' };

/* xterm.js escape sequences → lineedit actions (readline-style editing). */
const EDIT_KEYS = {
  '\x1b[D': 'left', '\x1b[C': 'right',
  '\x1b[H': 'home', '\x1b[1~': 'home', '\x1bOH': 'home',
  '\x1b[F': 'end', '\x1b[4~': 'end', '\x1bOF': 'end',
  '\x1b[3~': 'delete',
  '\x1bb': 'wordback', '\x1bf': 'wordfwd',
  '\x1b[1;5D': 'wordback', '\x1b[1;5C': 'wordfwd',
};
const CONTROL_KEYS = {
  '\x01': 'home', '\x02': 'left', '\x05': 'end', '\x06': 'right',
  '\x0b': 'killafter', '\x15': 'killbefore', '\x17': 'killword',
};

/* Commands whose plain last argument is a path on the Files disk — these
   get filesystem completion even without a '/' in the word. */
const FS_HEADS = new Set([
  'cd', 'ls', 'cat', 'head', 'tail', 'rm', 'rmdir', 'mkdir', 'touch', 'cp', 'mv',
  'wc', 'stat', 'sha256sum', 'sha1sum', 'sha512sum', 'md5sum', 'b2sum', 'cksum',
  'truncate', 'basename', 'dirname', 'realpath', 'tee', 'split', 'paste', 'file',
  'chmod', 'chown', 'chgrp', 'install', 'grep', 'diff', 'cmp', 'comm', 'csplit',
  'find', 'join', 'uniq', 'sort', 'shred', 'fold', 'fmt', 'base32', 'base64',
]);

export default function Terminal() {
  const hostRef = useRef(null);
  const osRef = useRef(null); // latest OS context for the imperative shell
  const sqlRef = useRef(null);
  const os = useOS();
  // latest OS context for the imperative shell — synced in an effect (declared
  // before the term setup, so it's populated on mount) rather than during render
  useEffect(() => { osRef.current = os; });

  useEffect(() => {
    const term = new XTerm({
      cursorBlink: true,
      allowTransparency: true,
      fontFamily: '"JetBrains Mono", ui-monospace, Menlo, Consolas, monospace',
      fontSize: 13,
      theme: { background: 'rgba(0,0,0,0)', foreground: '#d7e2f0', cursor: '#38bdf8', selectionBackground: 'rgba(56,189,248,0.3)' },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(hostRef.current);
    try { fit.fit(); } catch { /* zero-size host before layout */ }
    const ro = new ResizeObserver(() => { try { fit.fit(); } catch { /* hidden */ } });
    ro.observe(hostRef.current);

    const out = (s = '') => term.write(`${s}\r\n`);
    let cwd = HOME; // per-session working directory on the Files disk
    const prompt = () => `${C.prompt}${C.dim}${tilde(cwd)}${C.reset} ${C.prompt}❯${C.reset} `;
    let buf = '';
    let cur = 0; // cursor position inside buf
    let hist = [];
    let hIdx = -1;
    let busy = false;
    /* Rewrite the whole line, then pull the cursor back if it sits mid-line
       (relative moves stay correct even when the line wraps). */
    const redraw = () => {
      term.write(`\r\x1b[K${prompt()}${buf}`);
      if (cur < buf.length) term.write(`\x1b[${buf.length - cur}D`);
    };
    const apply = (action, ch) => {
      const next = edit(buf, cur, action, ch);
      if (!next) return;
      buf = next.buf;
      cur = next.cur;
      redraw();
    };
    term.writeln(`ArtCraft WebOS shell ${C.dim}(wosh 1.0)${C.reset} — type ${C.ok}help${C.reset} for commands.`);
    term.write(prompt());

    const candidates = (part) => {
      const o = osRef.current;
      const cmds = ['help', 'apps', 'open', 'launch', 'close', 'windows', 'install', 'uninstall', 'store', 'settings', 'get', 'set', 'persona', 'personas', 'theme', 'accent', 'wallpaper', 'volume', 'os', 'sqlite', 'utils', 'coreutils', 'history', 'fullscreen', 'date', 'echo', 'uname', 'whoami', 'neofetch', 'cd', 'pwd', 'clear', ...UTIL_NAMES];
      const words = part.split(/\s+/);
      const last = words[words.length - 1];
      let pool = cmds;
      if (words.length >= 2) {
        const head = words[0];
        if (head === 'open' || head === 'launch' || head === 'close' || head === 'install' || head === 'uninstall') pool = o.apps.map((a) => a.id);
        else if (head === 'set' || head === 'get') pool = Object.keys(SETTINGS_PATHS);
        else if (head === 'persona') pool = PERSONA_IDS;
        else if (head === 'theme') pool = THEME_PRESETS;
        else if (head === 'settings') pool = ['appearance', 'desktop', 'taskbar', 'widgets', 'sound', 'network', 'apps', 'storage', 'about'];
        else pool = [];
      }
      return pool.filter((c) => c.startsWith(last));
    };

    /* Filesystem completion: a live cache of the Files disk, refreshed on
       session start and after every command. `pathCandidates` returns the
       full replacement tokens (dirs get a trailing '/'), or null when the
       word isn't path-like and command completion should take over. */
    let entriesCache = null;
    const refreshEntries = async () => {
      try {
        entriesCache = (await fileList()).map(({ blob: _, path, dir }) => ({ path, dir }));
      } catch { entriesCache = []; }
    };
    refreshEntries();
    const pathCandidates = (part) => {
      const words = part.split(/\s+/);
      const last = words[words.length - 1] || '';
      const head = words[0];
      const pathLike = last.startsWith('/') || last.startsWith('~') || last.includes('/');
      if (!pathLike && !FS_HEADS.has(head)) return null;
      if (!entriesCache) return [];
      const slash = last.lastIndexOf('/');
      const dirPart = slash >= 0 ? last.slice(0, slash + 1) : '';
      const namePart = slash >= 0 ? last.slice(slash + 1) : last;
      const baseDir = join(cwd, expandTilde(dirPart || '.'));
      const prefix = baseDir.endsWith('/') ? baseDir : `${baseDir}/`;
      const kids = new Map(); // name → isDir
      for (const e of entriesCache) {
        if (!e.path.startsWith(prefix)) continue;
        const rel = e.path.slice(prefix.length);
        if (!rel) continue;
        const cut = rel.indexOf('/');
        if (cut >= 0) kids.set(rel.slice(0, cut), true);
        else kids.set(rel, !!e.dir);
      }
      return [...kids.entries()]
        .filter(([name]) => name.startsWith(namePart))
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([name, isDir]) => dirPart + name + (isDir ? '/' : ''));
    };

    const complete = () => {
      const part = buf;
      const words = part.split(/\s+/);
      const last = words[words.length - 1] || '';
      const hits = pathCandidates(part) ?? candidates(part);
      if (hits.length === 1) {
        const insert = hits[0].slice(last.length);
        if (!insert) return;
        apply('insert', insert);
      } else if (hits.length > 1) {
        // longest common prefix first, then list the options
        let lcp = hits[0];
        for (const h of hits) { let i = 0; while (i < lcp.length && lcp[i] === h[i]) i++; lcp = lcp.slice(0, i); }
        if (lcp.length > last.length) { apply('insert', lcp.slice(last.length)); return; }
        out();
        out(hits.join('  '));
        redraw();
      }
    };

    const setPath = (path, value) => {
      const o = osRef.current;
      const entry = SETTINGS_PATHS[path];
      if (!entry) { out(`${C.err}unknown settings path: ${path}${C.reset}`); out(`${C.dim}paths: ${Object.keys(SETTINGS_PATHS).join(' ')}${C.reset}`); return; }
      try { out(`${C.ok}${path} = ${entry.set(o, value)}${C.reset}`); }
      catch (err) { out(`${C.err}${String(err.message || err)}${C.reset}`); }
    };

    const sqlReady = async () => {
      if (sqlRef.current) return sqlRef.current;
      out(`${C.dim}loading sql.js…${C.reset}`);
      const initSqlJs = (await import('sql.js')).default;
      const SQL = await initSqlJs({ locateFile: () => wasmUrl });
      const saved = await kvGet(SQL_DB_KEY);
      sqlRef.current = saved ? new SQL.Database(saved) : new SQL.Database();
      return sqlRef.current;
    };

    const runSql = async (sql) => {
      if (!sql.trim()) {
        out('usage: sqlite <sql>  — e.g. sqlite CREATE TABLE t (id INTEGER, name TEXT)');
        out(`${C.dim}one persistent database (IndexedDB, survives reloads) for the whole OS.${C.reset}`);
        return;
      }
      try {
        const db = await sqlReady();
        const results = db.exec(sql);
        if (!results.length) out('ok');
        results.forEach((r) => out(renderTable(r)));
        const bytes = db.export();
        await kvSet(SQL_DB_KEY, bytes);
        out(`${C.dim}— saved (${bytes.length} bytes → IndexedDB ${SQL_DB_KEY})${C.reset}`);
      } catch (err) {
        out(`${C.err}${String(err.message || err)}${C.reset}`);
      }
    };

    /* Pipeline: each utility's stdout feeds the next one's stdin (WASI fd 0).
       A leading `echo` builtin is the usual input source; other builtins
       don't participate — the error names the offending segment. */
    const runPipe = async (segs) => {
      let input = '';
      let code = 0;
      let truncated = false;
      for (const segRaw of segs) {
        const seg = segRaw.trim();
        const [head, ...rest] = seg.split(/\s+/);
        if (head === 'echo') { input = `${rest.join(' ')}\n`; continue; }
        const util = head === 'coreutils' ? rest[0] : head;
        const utilArgs = head === 'coreutils' ? rest.slice(1) : rest;
        if (!util || !(UTIL_NAMES.has(util) || head === 'coreutils')) {
          out(`${C.err}pipes connect utilities — '${seg}' is not one (try: echo hi | tr a-z A-Z)${C.reset}`);
          return;
        }
        try {
          const r = await runUtil(util, utilArgs, { cwd, stdin: input });
          if (r.stderr) out(`${C.err}${r.stderr.replace(/\n$/, '').replace(/\n/g, '\r\n')}${C.reset}`);
          truncated = truncated || r.truncated;
          code = r.code;
          input = r.stdout;
        } catch (err) {
          out(`${C.err}coreutils: ${String(err.message || err)}${C.reset}`);
          return;
        }
      }
      if (input) out(input.replace(/\n$/, '').replace(/\n/g, '\r\n'));
      if (truncated) out(`${C.dim}— output truncated${C.reset}`);
      else if (code) out(`${C.dim}exit ${code}${C.reset}`);
    };

    const run = async (raw) => {
      const o = osRef.current;
      const cmd = raw.trim();
      if (!cmd) return;
      const segs = splitPipes(cmd);
      if (segs === null) { out(`${C.err}unterminated quote${C.reset}`); return; }
      if (segs.length > 1) { await runPipe(segs); return; }
      const [head, ...rest] = cmd.split(/\s+/);
      const arg = rest.join(' ');
      switch (head) {
        case 'help': HELP.forEach((l) => out(l)); return;
        case 'clear': term.clear(); term.write('\x1b[2J\x1b[H'); return;
        case 'date': out(new Date().toString()); return;
        case 'echo': out(arg); return;
        case 'whoami': out('webos-user'); return;
        case 'pwd': out(tilde(cwd)); return;
        case 'cd': {
          const dest = arg ? expandTilde(arg.split(/\s+/)[0]) : HOME;
          const target = join(cwd, dest);
          if (target !== '/' && !(await fileList()).some((r) => r.dir && r.path === target)) {
            out(`${C.err}cd: no such directory: ${dest}${C.reset}`);
            return;
          }
          cwd = target;
          return;
        }
        case 'uname': out(`ArtCraft WebOS (browser) — ${navigator.userAgent.slice(0, 72)}…`); return;
        case 'history': hist.forEach((h, i) => out(`${C.dim}${String(i + 1).padStart(3)}${C.reset}  ${h}`)); return;
        case 'neofetch':
          [
            '        ▄▄▄▄▄▄▄        webos@browser',
            '     ▄█████████▄      ---------------',
            '   ▄███  WEBOS  ███▄   OS: ArtCraft WebOS',
            '   ███  ▄▄▄▄▄▄▄  ███   Shell: wosh 1.0 (xterm.js)',
            '   ███  ███████  ███   Persona: ' + o.persona,
            '   ▀███  ▀▀▀▀▀▀▀  ███▀  Apps: ' + o.apps.length + ' installed · ' + o.windows.length + ' windows open',
            '     ▀█████████▀      Accent: ' + o.theme.accent + ' · Theme: ' + o.theme.preset,
            '        ▀▀▀▀▀▀▀        UI: scale ' + o.ui.scale + ' · radius ' + (o.ui.radius || 'default'),
          ].forEach((l) => out(l));
          return;
        case 'os': {
          const st = {
            version: VERSION, persona: o.persona, theme: o.theme.preset, accent: o.theme.accent,
            apps: o.apps.length, windows: o.windows.map((w) => ({ id: w.id, app: w.appId, min: !!w.min, max: !!w.max })),
            ui: o.ui, taskbar: { position: o.taskbar.position, align: o.taskbar.align, iconSize: o.taskbar.iconSize },
            volume: o.volume, mobile: o.mobile,
          };
          out(JSON.stringify(st, null, 2).replace(/\n/g, '\r\n'));
          return;
        }
        case 'apps':
          o.apps.forEach((a) => out(`${a.id.padEnd(14)} ${a.name}  —  ${a.tagline}${a.embed ? '' : '  (new tab only)'}`));
          return;
        case 'open':
        case 'launch': {
          const app = o.findApp(arg);
          if (!app) { out(`${C.err}no such app: ${arg}${C.reset}`); return; }
          o.launch(app.id); out(`launching ${app.name}…`);
          return;
        }
        case 'close': {
          if (arg === 'all') { o.windows.forEach((w) => o.close(w.id)); out('closed everything'); return; }
          const targets = o.windows.filter((x) => x.appId === arg);
          if (!targets.length) { out(`${C.err}not running: ${arg}${C.reset}`); return; }
          targets.forEach((w) => o.close(w.id));
          out(`closed ${targets.length} × ${arg}`);
          return;
        }
        case 'windows':
          if (!o.windows.length) { out('no windows open'); return; }
          o.windows.forEach((w) => out(
            `${String(w.id).padStart(3)}  ${w.appId.padEnd(14)} ${w.min ? 'min' : w.max ? 'max' : '   '}  ${Math.round(w.rect.w)}×${Math.round(w.rect.h)} @ ${Math.round(w.rect.x)},${Math.round(w.rect.y)}`
          ));
          return;
        case 'install':
          if (!o.findApp(arg)) { out(`${C.err}no such store app: ${arg}${C.reset}`); return; }
          o.install(arg); out(`installed ${arg}`);
          return;
        case 'uninstall': o.uninstall(arg); out(`uninstalled ${arg}`); return;
        case 'store': o.launch('store'); return;
        case 'settings':
          o.launch('settings', arg ? { initial: arg } : undefined);
          out(arg ? `settings → ${arg}` : 'opening settings…');
          return;
        case 'get': {
          const entry = SETTINGS_PATHS[arg];
          if (!entry) { out(`${C.err}unknown settings path: ${arg}${C.reset}`); out(`${C.dim}paths: ${Object.keys(SETTINGS_PATHS).join(' ')}${C.reset}`); return; }
          out(`${arg} = ${entry.get(o)}`);
          return;
        }
        case 'set': {
          const sp = arg.indexOf(' ');
          if (sp < 0) { out('usage: set <path> <value>  — e.g. set ui.scale 1.1'); return; }
          setPath(arg.slice(0, sp), arg.slice(sp + 1).trim());
          return;
        }
        case 'persona':
          if (!arg) { out(`persona: ${o.persona} ${C.dim}(one of ${PERSONA_IDS.join(' ')})${C.reset}`); return; }
          if (!PERSONA_IDS.includes(arg)) { out(`${C.err}personas: ${PERSONA_IDS.join(' ')}${C.reset}`); return; }
          o.setPersona(arg); out(`persona: ${arg}`);
          return;
        case 'personas': out(PERSONA_IDS.join(' ')); return;
        case 'theme':
          if (!THEME_PRESETS.includes(arg)) { out(`${C.err}themes: ${THEME_PRESETS.join(' ')}${C.reset}`); return; }
          o.setTheme({ preset: arg, wallpaper: '' }); out(`theme: ${arg}`);
          return;
        case 'accent': {
          const c = NAMED[arg] || (/^#[0-9a-fA-F]{3,8}$/.test(arg) ? arg : null);
          if (!c) { out(`${C.err}usage: accent <name|#hex>  (${Object.keys(NAMED).join(' ')})${C.reset}`); return; }
          o.setTheme({ accent: c }); out(`accent: ${c}`);
          return;
        }
        case 'wallpaper':
          o.setTheme({ wallpaper: arg });
          out(arg ? 'wallpaper set' : 'wallpaper cleared');
          return;
        case 'volume': {
          if (!arg.trim()) { out('usage: volume <0-100>'); return; }
          const v = num(arg, -1, 0, 100);
          if (v < 0) { out('usage: volume <0-100>'); return; }
          o.setVolume({ master: v, mute: false }); out(`volume: ${v}`);
          return;
        }
        case 'fullscreen': document.dispatchEvent(new CustomEvent('webos:fullscreen')); out('toggled fullscreen'); return;
        case 'sqlite': await runSql(arg); return;
        case 'utils': {
          const names = [...UTIL_NAMES];
          for (let i = 0; i < names.length; i += 8) out(names.slice(i, i + 8).join('  '));
          out(`${C.dim}${names.length} utilities via vendor/coreutils.wasm (uutils, MIT) — wosh builtins keep precedence; escape hatch: coreutils <util>${C.reset}`);
          return;
        }
        default: {
          // Real utilities through coreutils.wasm; `coreutils <util>` forces
          // the multicall past shadowing builtins (echo, date, uname…).
          const util = head === 'coreutils' ? rest[0] : head;
          const utilArgs = head === 'coreutils' ? rest.slice(1) : rest;
          if (head === 'coreutils' && !util) { out('usage: coreutils <util> [args…] — try utils for the list'); return; }
          if (util && (UTIL_NAMES.has(util) || head === 'coreutils')) {
            try {
              const r = await runUtil(util, utilArgs, { cwd });
              if (r.stdout) out(r.stdout.replace(/\n$/, '').replace(/\n/g, '\r\n'));
              if (r.stderr) out(`${C.err}${r.stderr.replace(/\n$/, '').replace(/\n/g, '\r\n')}${C.reset}`);
              if (r.truncated) out(`${C.dim}— output truncated${C.reset}`);
              else if (r.code) out(`${C.dim}exit ${r.code}${C.reset}`);
            } catch (err) {
              out(`${C.err}coreutils: ${String(err.message || err)}${C.reset}`);
            }
            return;
          }
          // Pass-through: evaluate as JavaScript with the live OS in scope.
          try {
            const fn = new Function('os', `"use strict"; return (${cmd});`);
            let v;
            try { v = fn(o); } catch { v = new Function('os', `"use strict"; ${cmd}`)(o); }
            out(typeof v === 'string' ? v : JSON.stringify(v, null, 2)?.replace(/\n/g, '\r\n'));
          } catch (err) {
            out(`${C.err}${String(err.message || err)}${C.reset}`);
          }
        }
      }
    };

    const disposeData = term.onData((data) => {
      if (busy && data !== '\x03') return;
      // escape sequences arrive as one data event — handle before char loop
      if (data === '\x1b[A' || data === '\x1b[B') {
        if (data === '\x1b[A') {
          const i = hIdx < 0 ? hist.length - 1 : Math.max(0, hIdx - 1);
          if (hist[i] !== undefined) { hIdx = i; buf = hist[i]; cur = buf.length; redraw(); }
        } else if (hIdx >= 0) {
          if (hIdx < hist.length - 1) { hIdx += 1; buf = hist[hIdx]; }
          else { hIdx = -1; buf = ''; }
          cur = buf.length;
          redraw();
        }
        return;
      }
      const action = EDIT_KEYS[data] ?? CONTROL_KEYS[data];
      if (action) { apply(action); return; }
      if (data.startsWith('\x1b')) return; // remaining sequences (paste prefixes etc.) — ignored
      for (const ch of data) {
        if (ch === '\r') {
          term.write('\r\n');
          const line = buf;
          buf = '';
          cur = 0;
          hIdx = -1;
          if (line.trim()) hist = [...hist, line].slice(-100);
          // serialize commands: sqlite loads are async; don't interleave input
          busy = true;
          Promise.resolve(run(line)).finally(() => { refreshEntries(); busy = false; term.write(prompt()); });
          return; // rest of a pasted batch after Enter is dropped — acceptable
        } else if (ch === '\x7f') {
          apply('backspace');
        } else if (ch === '\x03') {
          term.write('^C\r\n');
          buf = '';
          cur = 0;
          hIdx = -1;
          if (!busy) term.write(prompt());
        } else if (ch === '\x0c') {
          term.clear(); term.write('\x1b[2J\x1b[H'); redraw();
        } else if (ch === '\t') {
          complete();
        } else if (ch >= ' ') {
          apply('insert', ch);
        }
      }
    });

    term.focus();
    return () => { ro.disconnect(); disposeData.dispose(); term.dispose(); };
  }, []);

  return <div className="terminal xterm-host" ref={hostRef} aria-label="terminal" />;
}
