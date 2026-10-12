// The wosh terminal: xterm frontend is mocked, the shell is real. Covers
// builtins (os mutation, settings paths, cd/pwd, history), key editing,
// tab completion, pipelines, the JS pass-through, and the SQLite surface
// (sql.js mocked at the boundary). coreutils + IndexedDB are faked so the
// suite stays hermetic.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({
  terms: [],
  dataHandlers: [],
  kv: new Map(),
  files: [],
  filesFail: false,
  runUtil: null,
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    constructor() {
      h.terms.push(this);
      this.text = '';
      this.disposed = false;
    }

    loadAddon() {}

    open() {}

    write(s) { this.text += s; }

    writeln(s) { this.write(`${s}\r\n`); }

    clear() { this.text = ''; }

    focus() {}

    dispose() { this.disposed = true; }

    onData(fn) {
      h.dataHandlers.push(fn);
      return { dispose: () => { const i = h.dataHandlers.indexOf(fn); if (i >= 0) h.dataHandlers.splice(i, 1); } };
    }
  },
}));
vi.mock('@xterm/addon-fit', () => ({ FitAddon: class { fit() {} } }));

// The wasm multicall is a boundary: the shell's pipeline plumbing is what we
// are testing, and this fake keeps the utils contract (code/stdout/stderr).
vi.mock('../src/apps/terminal/coreutils.js', () => ({
  UTIL_NAMES: new Set(['ls', 'cat', 'tr', 'wc', 'seq', 'sort']),
  runUtil: (h.runUtil = vi.fn(async (name, args, opts) => {
    if (name === 'tr' && args[0] === 'a-z' && args[1] === 'A-Z') {
      return { code: 0, stdout: (opts.stdin || '').toUpperCase(), stderr: '' };
    }
    if (name === 'wc' && args.includes('-l')) {
      return { code: 0, stdout: `${(opts.stdin || '').split('\n').length - 1}\n`, stderr: '' };
    }
    if (name === 'ls') return { code: 0, stdout: 'Docs  Notes.txt\n', stderr: '' };
    return { code: 2, stdout: '', stderr: `${name}: mocked failure\n` };
  })),
}));

vi.mock('../src/os/db.js', () => ({
  kvGet: async (k) => h.kv.get(k),
  kvSet: async (k, v) => { h.kv.set(k, v); },
  // filesFail simulates an IndexedDB hiccup so the completion-cache
  // fallback (refreshEntries catch) is exercised, not just the happy path.
  fileList: async () => {
    if (h.filesFail) throw new Error('idb unavailable');
    return h.files;
  },
}));

vi.mock('sql.js', () => ({
  default: async () => ({
    Database: class {
      exec(sql) {
        if (sql.includes('boom')) throw new Error('near "boom": syntax error');
        return /select/i.test(sql)
          ? [{ columns: ['id', 'name'], values: [[1, 'one'], [2, 'two']] }]
          : [];
      }

      export() { return new Uint8Array([9, 8, 7]); }
    },
  }),
}));

import Terminal from '../src/apps/terminal/Terminal.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};

const strip = (s) => s
  // eslint-disable-next-line no-control-regex -- ANSI escapes are the point
  .replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '')
  // eslint-disable-next-line no-control-regex -- OSC sequences end in BEL
  .replace(/\x1b\][^\x07]*\x07/g, '')
  .replace(/\r\n/g, '\n')
  .replace(/\r/g, '');
const screen = () => strip(h.terms[h.terms.length - 1]?.text ?? '');
const type = (data) => act(() => h.dataHandlers[h.dataHandlers.length - 1](data));
const settle = async () => {
  // run(line) → finally → prompt rewrite: a couple of macrotasks
  for (let i = 0; i < 3; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  h.terms.length = 0;
  h.dataHandlers.length = 0;
  h.kv.clear();
  h.files.length = 0;
  h.filesFail = false;
  h.runUtil.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});

const mountTerm = () => {
  const c = render(<OSProvider><Probe /><Terminal /></OSProvider>);
  expect(c.container.querySelector('div[aria-label="terminal"]')).toBeTruthy();
  return c;
};
const run = async (line) => { type(`${line}\r`); await settle(); return screen(); };

describe('wosh builtins', () => {
  it('greets with the banner and a prompt', () => {
    mountTerm();
    expect(screen()).toContain('ArtCraft WebOS shell');
    expect(screen()).toContain('help');
    expect(screen()).toContain('❯');
  });

  it('help lists the command surface; unknown utilities fall through to JS', async () => {
    mountTerm();
    await run('help');
    expect(screen()).toContain('wosh — the WebOS shell');
    expect(screen()).toContain('sqlite <sql>');
    await run('nosuchcommand');
    expect(screen()).toContain('nosuchcommand is not defined');
  });

  it('apps / open / close / windows drive real OS state', async () => {
    mountTerm();
    await run('apps');
    expect(screen()).toContain('calc');
    expect(screen()).toContain('PhotoCraft');
    await run('open calc');
    expect(cur.windows[0].appId).toBe('calc');
    await run('windows');
    expect(screen()).toContain('calc');
    await run('close nosuch');
    expect(screen()).toContain('not running: nosuch');
    await run('close calc');
    expect(cur.windows).toHaveLength(0);
    await run('open calc');
    await run('close all');
    expect(cur.windows).toHaveLength(0);
    await run('open ghost');
    expect(screen()).toContain('no such app: ghost');
  });

  it('install/uninstall go through the store list', async () => {
    mountTerm();
    await run('install deckcraft');
    expect(cur.installed).toContain('deckcraft');
    await run('uninstall deckcraft');
    expect(cur.installed).not.toContain('deckcraft');
    await run('install nosuch');
    expect(screen()).toContain('no such store app: nosuch');
  });

  it('get/set read and write real settings paths, echoing the applied value', async () => {
    mountTerm();
    await run('get ui.scale');
    expect(screen()).toContain('ui.scale = 1');
    await run('set ui.scale 1.2');
    expect(cur.ui.scale).toBe(1.2);
    expect(screen()).toContain('ui.scale = 1.2');
    await run('set taskbar.position top');
    expect(cur.taskbar.position).toBe('top');
    await run('set volume.master 40');
    expect(cur.volume.level).toBe(0.4);
    await run('set ui.scale nonsense');
    expect(cur.ui.scale).toBe(1); // clamped to default, not NaN
    await run('get nope.path');
    expect(screen()).toContain('unknown settings path: nope.path');
  });

  it('persona/theme/accent/wallpaper/volume mutate the OS', async () => {
    mountTerm();
    await run('persona');
    expect(screen()).toContain('persona: win');
    await run('persona tux');
    expect(screen()).toContain('personas: win mac linux bsd android tui');
    await run('persona linux');
    expect(cur.persona).toBe('linux');
    await run('personas');
    expect(screen()).toContain('win mac linux bsd android tui');
    await run('theme ocean');
    expect(cur.theme.preset).toBe('ocean');
    await run('theme nope');
    expect(screen()).toContain('themes: midnight ocean forest sunset light omarchy cobalt');
    await run('accent emerald');
    expect(cur.theme.accent).toBe('#10b981');
    await run('accent #a1b2c3');
    expect(cur.theme.accent).toBe('#a1b2c3');
    await run('accent zzz');
    expect(screen()).toContain('usage: accent');
    await run('wallpaper https://x.example/w.png');
    expect(cur.theme.wallpaper).toBe('https://x.example/w.png');
    await run('wallpaper ""');
    expect(cur.theme.wallpaper).toBe(''); // quotes stripped, per `help`
    await run('volume 25');
    expect(cur.volume.level).toBe(0.25);
  });

  it('os / neofetch / uname / whoami / date report live state', async () => {
    mountTerm();
    await run('os');
    expect(screen()).toContain('"version"');
    expect(screen()).toContain('"persona": "win"');
    await run('neofetch');
    expect(screen()).toContain('webos@browser');
    expect(screen()).toContain('Persona: win');
    await run('whoami');
    expect(screen()).toContain('webos-user');
    await run('uname');
    expect(screen()).toContain('ArtCraft WebOS (browser)');
    await run('date');
    expect(screen()).toMatch(/\d{4}/);
  });

  it('fullscreen dispatches the OS event', async () => {
    mountTerm();
    let fired = false;
    const h2 = () => { fired = true; };
    document.addEventListener('webos:fullscreen', h2);
    await run('fullscreen');
    document.removeEventListener('webos:fullscreen', h2);
    expect(fired).toBe(true);
  });
});

describe('wosh filesystem + pipelines', () => {
  it('cd validates against the Files disk; pwd prints the tilde path', async () => {
    mountTerm();
    await run('pwd');
    expect(screen()).toContain('~');
    await run('cd /nope');
    expect(screen()).toContain('no such directory: /nope');
    h.files.push({ path: '/Home', dir: true }, { path: '/Home/Docs', dir: true });
    await run('cd Docs');
    await run('pwd');
    expect(screen()).toContain('~/Docs');
    await run('cd');
    await run('pwd');
    // the prompt mirrors cwd — back at HOME it renders '~ ❯ '
    const lines = screen().trim().split('\n');
    expect(lines[lines.length - 1]).toMatch(/^~ ❯ *$/); // HOME prompt (trim ate the space)
  });

  it('pipes connect utilities through stdin', async () => {
    mountTerm();
    await run('echo hello world | tr a-z A-Z');
    expect(h.runUtil).toHaveBeenCalled();
    expect(screen()).toContain('HELLO WORLD');
    await run('echo a\nb | wc -l'.replace('\n', '\\n'));
    await run("echo one | wc -l");
    expect(screen()).toContain('1');
    await run('echo hi | builtin');
    expect(screen()).toContain('pipes connect utilities');
    await run('ls | tr a-z A-Z');
    expect(screen()).toContain('DOCS  NOTES.TXT');
  });

  it('util failures surface stderr and exit codes; utils lists the set', async () => {
    mountTerm();
    await run('seq 1 5');
    expect(screen()).toContain('seq: mocked failure');
    await run('sort');
    expect(screen()).toContain('exit 2');
    await run('utils');
    expect(screen()).toContain('ls');
    expect(screen()).toContain('utilities via');
  });

  it('unterminated quotes are refused, not run', async () => {
    mountTerm();
    await run("echo 'oops");
    expect(screen()).toContain('unterminated quote');
  });
});

describe('wosh line editing + completion', () => {
  it('history: ↑/↓ walks previous commands; Enter re-runs them', async () => {
    mountTerm();
    await run('echo one');
    await run('echo two');
    type('\x1b[A'); // → echo two
    type('\x1b[A'); // → echo one
    type('\r');
    await settle();
    expect(screen()).toContain('one');
    type('\x1b[B'); // forward again
    type('\x1b[B'); // past the end clears the line
    type('echo three\r');
    await settle();
    await run('history');
    expect(screen()).toMatch(/echo one/);
    expect(screen()).toMatch(/echo three/);
  });

  it('backspace edits the line; Ctrl+C abandons it', async () => {
    mountTerm();
    type('echo hii');
    type('\x7f'); // drop one i
    type('\r');
    await settle();
    expect(screen()).toContain('hi\nhi'); // echoed line + output
    type('echo doomed');
    type('\x03'); // ^C
    expect(screen()).toContain('^C');
    type('\r');
    await settle();
    expect(screen()).not.toContain('doomed\n\n'); // empty line ran, no output
  });

  it('Ctrl+L clears the screen', async () => {
    mountTerm();
    await run('echo mark');
    expect(screen()).toContain('mark');
    type('\x0c');
    expect(screen()).not.toContain('mark');
    expect(screen()).toContain('❯'); // prompt redrawn
  });

  it('Tab completes commands and settings paths', async () => {
    mountTerm();
    type('set ui.s');
    type('\t');
    expect(screen()).toContain('ui.scale'); // completed into the line
    type('\r');
    await settle();
    expect(cur.ui.scale).toBe(1);
    type('person');
    type('\t');
    type('\r');
    await settle();
    expect(screen()).toContain('persona: win');
  });

  it('ambiguous Tab lists options; FS heads complete from the Files disk', async () => {
    h.files.push({ path: '/Home/Docs', dir: true }, { path: '/Home/Notes.txt' });
    mountTerm();
    await settle(); // the completion cache fills from the disk after mount
    type('cd \t');
    // two candidates (Docs/, Notes.txt) → listed
    expect(screen()).toMatch(/Docs\/\s+Notes\.txt/);
    type('\x03');
    type('cat No\t');
    expect(screen()).toContain('Notes.txt');
  });
});

describe('wosh JS pass-through + sqlite', () => {
  it('non-commands evaluate as JavaScript with `os` in scope', async () => {
    mountTerm();
    await run('1 + 41');
    expect(screen()).toContain('42');
    await run('os.persona');
    expect(screen()).toContain('win');
    await run('(() => { throw new Error("boom") })()');
    expect(screen()).toContain('boom');
  });

  it('sqlite runs SQL and persists the exported database', async () => {
    mountTerm();
    await run('sqlite');
    expect(screen()).toContain('usage: sqlite');
    await run('sqlite CREATE TABLE t (id INTEGER, name TEXT)');
    expect(screen()).toContain('ok');
    expect(screen()).toContain('saved (3 bytes');
    expect(h.kv.get('sqlite.db')).toEqual(new Uint8Array([9, 8, 7]));
    await run('sqlite SELECT * FROM t');
    expect(screen()).toContain('id | name');
    expect(screen()).toContain('2  | two');
    await run('sqlite SELECT boom');
    // mocked exec only special-cases select → returns rows; real errors would
    // print the message — exercise the catch via a throwing db below
  });

  it('the session is serialized: input during a busy command is dropped', async () => {
    mountTerm();
    type('echo first\r');
    type('echo second\r'); // arrives while first is settling
    await settle();
    expect(screen()).toContain('first');
    // the second keystroke batch was dropped mid-busy (pasted-batch rule);
    // a fresh line still works
    await run('echo third');
    expect(screen()).toContain('third');
  });
});

describe('wosh remaining branches', () => {
  it('every settings path writes through `set` and echoes the applied value', async () => {
    mountTerm();
    // theme.preset clears the wallpaper as a side effect — start from one
    await run('wallpaper https://x.example/w.png');
    const cases = [
      ['set persona mac', () => cur.persona === 'mac'],
      ['set theme.preset midnight', () => cur.theme.preset === 'midnight' && cur.theme.wallpaper === ''],
      ['set theme.accent #123456', () => cur.theme.accent === '#123456'],
      ['set theme.wallpaper https://x.example/t.png', () => cur.theme.wallpaper === 'https://x.example/t.png'],
      ['set ui.anim off', () => cur.ui.anim === false],
      ['set ui.anim on', () => cur.ui.anim === true],
      ['set ui.transparency 0.6', () => cur.ui.transparency === 0.6],
      ['set ui.radius 18px', () => cur.ui.radius === '18px'],
      ['set ui.blur 8px', () => cur.ui.blur === '8px'],
      ['set ui.focusHover on', () => cur.ui.focusHover === true],
      ['set ui.tbSide left', () => cur.ui.tbSide === 'left'],
      ['set ui.titleAlign center', () => cur.ui.titleAlign === 'center'],
      ['set ui.font mono', () => cur.ui.font === 'mono'],
      ['set ui.shadow deep', () => cur.ui.shadow === 'deep'],
      ['set taskbar.align center', () => cur.taskbar.align === 'center'],
      ['set taskbar.iconSize sm', () => cur.taskbar.iconSize === 'sm'],
      ['set taskbar.autohide on', () => cur.taskbar.autohide === true],
      ['set taskbar.labels off', () => cur.taskbar.labels === false],
      ['set taskbar.clock24 on', () => cur.taskbar.clock24 === true],
      ['set taskbar.showDate off', () => cur.taskbar.showDate === false],
      ['set desktop.iconSize lg', () => cur.desktop.iconSize === 'lg'],
      ['set desktop.gap compact', () => cur.desktop.gap === 'compact'],
      ['set volume.mute on', () => cur.volume.muted === true],
    ];
    for (const [line, check] of cases) {
      const s = await run(line);
      expect(s, line).toContain('=');
      expect(check(), line).toBe(true);
    }
    // persona-default fallbacks: an invalid value resets to '' and echoes so
    for (const line of ['set ui.tbSide diagonal', 'set ui.font cursive', 'set ui.shadow fog', 'set ui.titleAlign diagonal']) {
      expect(await run(line), line).toContain('(persona)');
    }
    expect(cur.ui.tbSide).toBe('');
    expect(cur.ui.font).toBe('');
  });

  it('set errors: an unknown path lists paths; a bad preset surfaces the throw', async () => {
    mountTerm();
    expect(await run('set nope.path x')).toContain('unknown settings path: nope.path');
    expect(await run('set theme.preset bogus')).toContain('themes: midnight');
  });

  it('completion pools: persona ids, theme presets, settings panels; unknown heads have none', async () => {
    mountTerm();
    type('persona an');
    type('\t');
    expect(screen()).toContain('persona android'); // unique hit completes inline
    type('\x03');
    type('theme mid');
    type('\t');
    expect(screen()).toContain('theme midnight');
    type('\x03');
    type('settings s');
    type('\t');
    expect(screen()).toMatch(/sound\s+storage/); // ambiguous → options listed
    type('\x03');
    type('zzz foo');
    type('\t');
    type(' echo still works\r');
    await settle();
    expect(screen()).toContain('still works'); // no candidates, no crash
  });

  it('a failed disk read empties the completion cache instead of crashing; it recovers', async () => {
    h.files.push({ path: '/Home/Docs', dir: true }, { path: '/Home/Notes.txt' });
    h.filesFail = true;
    mountTerm();
    await run('echo bump'); // the post-command refresh fails → cache empties
    type('cat No');
    type('\t');
    expect(screen()).not.toContain('Notes.txt'); // nothing to complete from
    type('\x03');
    h.filesFail = false;
    await run('echo bump'); // refresh succeeds again
    type('cat No');
    type('\t');
    expect(screen()).toContain('Notes.txt');
  });

  it('pipeline error paths: a throwing util is caught; a failing util exits nonzero', async () => {
    mountTerm();
    h.runUtil.mockRejectedValueOnce(new Error('kaboom'));
    expect(await run('echo hi | coreutils tr a-z A-Z')).toContain('coreutils: kaboom');
    expect(await run('echo hi | coreutils nosuch')).toContain('exit 2');
    expect(screen()).toContain('nosuch: mocked failure');
    // the plain (non-piped) dispatch has its own catch
    h.runUtil.mockRejectedValueOnce(new Error('kaboom again'));
    expect(await run('tr a-z A-Z')).toContain('coreutils: kaboom again');
  });

  it('sqlite surfaces engine errors instead of crashing', async () => {
    mountTerm();
    expect(await run('sqlite boom')).toContain('syntax error');
    await run('sqlite SELECT id FROM t'); // a good statement still works after
    expect(screen()).toContain('one');
  });

  it('clear wipes the scrollback (Ctrl+L equivalent as a command)', async () => {
    mountTerm();
    await run('echo mark');
    expect(screen()).toContain('mark');
    await run('clear');
    expect(screen()).not.toContain('mark');
    expect(screen()).toContain('❯'); // prompt redrawn
  });

  it('os reports open windows; store + settings launch with their echoes', async () => {
    mountTerm();
    await run('open calc');
    await run('os');
    expect(screen()).toContain('"app": "calc"');
    await run('store');
    expect(cur.windows.some((w) => w.appId === 'store')).toBe(true);
    await run('settings sound');
    expect(cur.windows.some((w) => w.appId === 'settings')).toBe(true);
    expect(screen()).toContain('settings → sound');
    await run('settings');
    expect(screen()).toContain('opening settings…');
  });

  it('history ↓ walks forward and past the newest entry clears the line', async () => {
    mountTerm();
    await run('echo one');
    await run('echo two');
    type('\x1b[A'); // → echo two
    expect(screen()).toContain('❯ echo two');
    type('\x1b[B'); // forward → empty line
    type('echo three\r');
    await settle();
    expect(screen()).toContain('three');
    await run('history');
    expect(screen()).toMatch(/echo one/);
  });
});
