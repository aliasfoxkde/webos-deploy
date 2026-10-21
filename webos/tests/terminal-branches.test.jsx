// Branch coverage for the wosh terminal's remaining edges: the settings-path
// fallbacks, the SQLite value formatter, the coreutils escape hatch, the
// line-editor keys, history walking, the completion cache and the window
// listing. The shell is real; xterm, coreutils, sql.js and the OS database
// are mocked at their boundaries exactly like tests/terminal.test.jsx.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';

const h = vi.hoisted(() => ({
  terms: [],
  dataHandlers: [],
  kv: new Map(),
  files: [],
  gate: null,
  sqlBytes: null,
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

// The wasm multicall is a boundary — the shell's dispatch is what is tested.
// `boom` rejects with a bare string (no `.message`), which is what the
// shell's `err.message || err` fallback exists for.
vi.mock('../src/apps/terminal/coreutils.js', () => ({
  UTIL_NAMES: new Set(['ls', 'cat', 'tr', 'wc', 'seq', 'sort', 'true']),
  runUtil: (h.runUtil = vi.fn(async (name, args, opts) => {
    if (name === 'boom') throw 'kaboom';
    if (name === 'tr' && args[0] === 'a-z' && args[1] === 'A-Z') {
      return { code: 0, stdout: (opts.stdin || '').toUpperCase(), stderr: '' };
    }
    if (name === 'seq') return { code: 0, stdout: '1\n2\n', stderr: '', truncated: true };
    if (name === 'ls') return { code: 0, stdout: 'Docs\n', stderr: '' };
    if (name === 'true') return { code: 0, stdout: '', stderr: '' };
    return { code: 2, stdout: '', stderr: `${name}: mocked failure\n` };
  })),
}));

vi.mock('../src/os/db.js', () => ({
  kvGet: async (k) => h.kv.get(k),
  kvSet: async (k, v) => { h.kv.set(k, v); },
  // h.gate holds the disk read open, so the completion cache is still empty
  // when a Tab arrives — the `!entriesCache` fallback.
  fileList: async () => {
    if (h.gate) await h.gate.promise;
    return h.files;
  },
}));

// The SQL engine is a boundary: the shell's renderer is what is tested, so
// the rows carry a NULL, a blob and a null column name.
vi.mock('sql.js', () => ({
  default: async (cfg) => {
    cfg.locateFile(); // the shell hands the engine its wasm locator
    return {
      Database: class {
      constructor(bytes) { h.sqlBytes = bytes; }

      exec(sql) {
        if (sql.includes('boom')) throw 'sqlite exploded';
        if (/select/i.test(sql)) {
          return [{
            columns: ['id', null],
            values: [[1, 'one'], [2, null], [3, new Uint8Array([7, 8])]],
          }];
        }
        return [];
      }

      export() { return new Uint8Array([1, 2, 3]); }
      },
    };
  },
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
const raw = () => h.terms[h.terms.length - 1]?.text ?? '';
const prompts = (s) => (s.match(/❯/g) || []).length;
const type = (data) => act(() => h.dataHandlers[h.dataHandlers.length - 1](data));
const settle = async () => {
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
  h.gate = null;
  h.sqlBytes = null;
  h.runUtil.mockClear();
  // the observer fires once so the terminal's resize handler runs
  vi.stubGlobal('ResizeObserver', class {
    constructor(cb) { this.cb = cb; }

    observe() { this.cb(); }

    unobserve() {}

    disconnect() {}
  });
});

const mountTerm = () => {
  const c = render(<OSProvider><Probe /><Terminal /></OSProvider>);
  expect(c.container.querySelector('div[aria-label="terminal"]')).toBeTruthy();
  return c;
};
const run = async (line) => { type(`${line}\r`); await settle(); return screen(); };

describe('wosh settings-path fallbacks', () => {
  it('coerces out-of-range values back to the default instead of trusting them', async () => {
    mountTerm();
    expect(await run('set taskbar.position bottom')).toContain('taskbar.position = bottom');
    expect(cur.taskbar.position).toBe('bottom');
    expect(await run('set taskbar.align left')).toContain('taskbar.align = left');
    expect(cur.taskbar.align).toBe('left');
    expect(await run('set taskbar.iconSize xl')).toContain('taskbar.iconSize = md');
    expect(cur.taskbar.iconSize).toBe('md');
    expect(await run('set desktop.iconSize xl')).toContain('desktop.iconSize = md');
    expect(cur.desktop.iconSize).toBe('md');
    expect(await run('set desktop.gap tight')).toContain('desktop.gap = normal');
    expect(cur.desktop.gap).toBe('normal');
  });

  it('reports the master volume as the level, or 0 while muted', async () => {
    mountTerm();
    const before = await run('get volume.master');
    expect(before).toMatch(/volume\.master = \d+/);
    expect(Number(before.match(/volume\.master = (\d+)/)[1])).toBeGreaterThan(0);
    await run('set volume.mute on');
    expect(await run('get volume.master')).toContain('volume.master = 0');
  });

  it('reads back every settings path the shell knows', async () => {
    mountTerm();
    const paths = [
      'persona', 'theme.preset', 'theme.accent', 'theme.wallpaper', 'ui.scale', 'ui.anim',
      'ui.transparency', 'ui.radius', 'ui.blur', 'ui.focusHover', 'ui.tbSide', 'ui.titleAlign',
      'ui.font', 'ui.shadow', 'taskbar.position', 'taskbar.align', 'taskbar.iconSize',
      'taskbar.autohide', 'taskbar.labels', 'taskbar.clock24', 'taskbar.showDate',
      'desktop.iconSize', 'desktop.gap', 'volume.master', 'volume.mute',
    ];
    for (const p of paths) {
      const before = screen().length;
      expect((await run(`get ${p}`)).slice(before), p).toContain(`${p} = `);
    }
  });

  it('a settings write that throws surfaces the failure without applying it', async () => {
    mountTerm();
    const original = cur.setUi;
    cur.setUi = () => { throw 'settings offline'; };
    const s = await run('set ui.scale 1.2');
    cur.setUi = original;
    expect(s).toContain('settings offline');
    expect(s).not.toContain('ui.scale = 1.2');
    expect(cur.ui.scale).toBe(1);
  });

  it('theme completion still offers the presets when the OS has no user themes', async () => {
    mountTerm();
    const original = cur.userThemes;
    cur.userThemes = undefined;
    type('theme ');
    type('\t');
    const s = screen();
    cur.userThemes = original;
    expect(s).toContain('midnight');
    expect(s).toContain('ocean');
  });

  it("completes the user's own themes alongside the presets", async () => {
    mountTerm();
    act(() => cur.themeSave({ id: 'mytheme', name: 'My Theme' }));
    await settle();
    type('theme ');
    type('\t');
    expect(screen()).toContain('mytheme');
  });
});

describe('wosh sqlite rendering', () => {
  it('formats NULL and blob cells and reuses a persisted database', async () => {
    h.kv.set('sqlite.db', new Uint8Array([1, 2, 3]));
    mountTerm();
    const s = await run('sqlite SELECT * FROM t');
    expect(s).toContain('NULL');
    expect(s).toContain('<blob 2B>');
    expect(h.sqlBytes).toEqual(new Uint8Array([1, 2, 3])); // the saved db was reopened
    expect(h.kv.get('sqlite.db')).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('surfaces an engine failure that carries no message', async () => {
    mountTerm();
    expect(await run('sqlite boom')).toContain('sqlite exploded');
  });
});

describe('wosh coreutils dispatch', () => {
  it('`coreutils <util>` forces the multicall past the builtins', async () => {
    mountTerm();
    await run('coreutils ls');
    expect(h.runUtil).toHaveBeenCalledWith('ls', [], expect.anything());
    expect(screen()).toContain('Docs');
    expect(await run('coreutils')).toContain('usage: coreutils <util>');
  });

  it('renders stdout, truncation and exit codes of a utility', async () => {
    mountTerm();
    const s = await run('ls');
    expect(s).toContain('Docs');
    expect(await run('seq 1 3')).toContain('output truncated');
    expect(await run('sort')).toContain('exit 2');
    const before = screen().length;
    expect((await run('true')).slice(before)).not.toContain('exit');
    expect(await run('echo hi | seq')).toContain('output truncated');
  });

  it('reports a utility failure that carries no message', async () => {
    mountTerm();
    expect(await run('coreutils boom')).toContain('coreutils: kaboom');
    expect(await run('echo hi | coreutils boom')).toContain('coreutils: kaboom');
  });

  it('reports a JavaScript escape hatch that throws a non-Error', async () => {
    mountTerm();
    // the expression form throws the string itself, so the shell's
    // `err.message || err` fallback has to render the bare value
    expect(await run('(() => { throw "boom" })()')).toContain('boom');
  });
});

describe('wosh keyboard edges', () => {
  it('arrow keys move the cursor, and the edges are no-ops', () => {
    mountTerm();
    type('abc');
    expect(raw()).toContain('abc');
    type('\x1b[D'); // ←
    // eslint-disable-next-line no-control-regex -- the escape is the cursor move
    expect(raw()).toMatch(/\x1b\[1D/); // the cursor was pulled back one column
    type('\x1b[D');
    type('\x1b[D');
    const atStart = raw().length;
    type('\x1b[D'); // already at column 0 → nothing changes
    expect(raw().length).toBe(atStart);
    const atEnd = raw().length;
    type('\x1b[F'); // End — the cursor was at the start, so it moves
    type('\x1b[F'); // End at the end of the line → nothing changes
    expect(raw().length).toBeGreaterThan(atEnd);
    const parked = raw().length;
    type('\x1b[F');
    expect(raw().length).toBe(parked);
  });

  it('ignores unknown escape sequences and unhandled control characters', () => {
    mountTerm();
    type('ab');
    const before = raw().length;
    type('\x1b[Z'); // shift-tab — not an editing key
    expect(raw().length).toBe(before);
    type('\x04'); // an unmapped control byte
    expect(raw().length).toBe(before);
    expect(screen()).toContain('ab');
  });

  it('Ctrl+C while a command runs does not reprint the prompt', async () => {
    let release;
    h.runUtil.mockImplementationOnce(() => new Promise((r) => { release = r; }));
    mountTerm();
    const mounted = prompts(screen());
    type('ls\r');
    const running = prompts(screen()); // the keystrokes each redraw the line
    expect(running).toBeGreaterThan(mounted);
    type('\x03');
    expect(screen()).toContain('^C');
    expect(prompts(screen())).toBe(running); // no prompt while busy
    release({ code: 0, stdout: 'Docs\n', stderr: '' });
    await settle();
    expect(prompts(screen())).toBe(running + 1); // the prompt returns once the command ends
  });

  it('history arrows stop at both ends of the list', async () => {
    mountTerm();
    const empty = raw().length;
    type('\x1b[A'); // ↑ with no history yet
    expect(raw().length).toBe(empty);
    await run('echo one');
    await run('echo two');
    type('\x1b[A');
    type('\x1b[A'); // back to the oldest entry
    type('\x1b[B'); // forward again — into the middle of the list
    expect(screen()).toContain('echo two');
    type('\x1b[B'); // past the newest entry clears the line
    expect(screen()).toContain('❯');
  });
});

describe('wosh completion sources', () => {
  const disk = () => {
    h.files.push(
      { path: '/Home/', dir: true },
      { path: '/Home/Docs', dir: true },
      { path: '/Home/Docs/notes.txt', dir: false },
      { path: '/Home/Notes.txt', dir: false },
      { path: '/Other/x.txt', dir: false },
    );
  };

  it('completes app ids for the launch verbs', async () => {
    mountTerm();
    type('open ');
    type('\t');
    expect(screen()).toContain('calc');
    expect(screen()).toContain('notepad');
  });

  it('completes absolute paths against the whole disk', async () => {
    disk();
    mountTerm();
    await settle();
    type('cat /Ho');
    type('\t');
    expect(screen()).toContain('/Home');
  });

  it('completes relative paths from the current directory', async () => {
    disk();
    mountTerm();
    await settle();
    type('cat ');
    type('\t');
    const s = screen();
    expect(s).toContain('Docs/');
    expect(s).toContain('Notes.txt');
    expect(s).not.toContain('x.txt'); // outside the current directory
  });

  it('a completion that adds nothing leaves the line untouched', async () => {
    disk();
    mountTerm();
    await settle();
    type('cat Notes.txt');
    const before = raw().length;
    type('\t');
    expect(raw().length).toBe(before);
    expect(screen()).toContain('cat Notes.txt');
  });

  it('completes nothing while the disk read is still in flight', async () => {
    let release;
    h.gate = { promise: new Promise((r) => { release = r; }) };
    mountTerm();
    type('cat ');
    type('\t');
    expect(screen()).toContain('❯'); // no crash, nothing completed
    release();
    await settle();
    h.gate = null;
  });
});

describe('wosh window listing', () => {
  it('reports an empty desktop, and the minimized/maximized states', async () => {
    mountTerm();
    expect(await run('windows')).toContain('no windows open');
    await run('open calc');
    await run('os.minimize(os.windows[0].id)');
    await settle();
    expect(await run('windows')).toContain('min');
    await run('open notepad');
    await run('os.toggleMax(os.windows[1].id)');
    await settle();
    expect(await run('windows')).toContain('max');
  });
});

describe('wosh argument-less commands', () => {
  it('theme and volume print their usage without an argument', async () => {
    mountTerm();
    const t = await run('theme');
    expect(t).toContain('theme: midnight');
    expect(t).toContain('one of');
    expect(await run('volume')).toContain('usage: volume <0-100>');
  });
});
