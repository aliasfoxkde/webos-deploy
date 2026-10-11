// Pure terminal libraries: path helpers, pipe splitting, the readline-style
// line editor, and the in-memory virtual disk (MemFS) that backs the wasm
// coreutils. No DOM, no mocks — these run in node.
import { describe, it, expect } from 'vitest';
import { HOME, tilde, expandTilde } from '../src/apps/terminal/paths.js';
import { splitPipes } from '../src/apps/terminal/pipes.js';
import { edit, wordBack, wordFwd } from '../src/apps/terminal/lineedit.js';
import { normalize, join, MemFS, WasiHost } from '../src/apps/terminal/wasi.js';

describe('paths', () => {
  it('tilde collapses HOME; expandTilde restores it', () => {
    expect(HOME).toBe('/Home');
    expect(tilde('/Home')).toBe('~');
    expect(tilde('/Home/docs/a.txt')).toBe('~/docs/a.txt');
    expect(tilde('/Other')).toBe('/Other');
    expect(expandTilde('~')).toBe('/Home');
    expect(expandTilde('~/x')).toBe('/Home/x');
    expect(expandTilde('/abs')).toBe('/abs');
    expect(expandTilde('relative')).toBe('relative');
  });
});

describe('splitPipes', () => {
  it('splits on unquoted pipes only; quotes pass through', () => {
    expect(splitPipes('echo hi | tr a-z A-Z')).toEqual(['echo hi ', ' tr a-z A-Z']);
    expect(splitPipes(`echo 'a|b' | wc -c`)).toEqual([`echo 'a|b' `, ' wc -c']);
    expect(splitPipes('echo "x|y"')).toEqual(['echo "x|y"']);
    expect(splitPipes('no pipe here')).toEqual(['no pipe here']);
  });

  it('an unterminated quote yields null', () => {
    expect(splitPipes("echo 'oops | wc")).toBeNull();
    expect(splitPipes('echo "oops')).toBeNull();
  });
});

describe('lineedit', () => {
  const apply = (buf, cur, action, ch) => edit(buf, cur, action, ch);

  it('insert at any position; empty payload is a no-op', () => {
    expect(apply('ab', 1, 'insert', 'X')).toEqual({ buf: 'aXb', cur: 2 });
    expect(apply('', 0, 'insert', 'hi')).toEqual({ buf: 'hi', cur: 2 });
    expect(apply('ab', 1, 'insert', '')).toBeNull();
  });

  it('motion is clamped and returns null at the edges (no needless redraw)', () => {
    expect(apply('abc', 0, 'left')).toBeNull();
    expect(apply('abc', 3, 'right')).toBeNull();
    expect(apply('abc', 0, 'home')).toBeNull();
    expect(apply('abc', 3, 'end')).toBeNull();
    expect(apply('abc', 1, 'left')).toEqual({ buf: 'abc', cur: 0 });
    expect(apply('abc', 1, 'end')).toEqual({ buf: 'abc', cur: 3 });
    expect(apply('abc', 2, 'home')).toEqual({ buf: 'abc', cur: 0 });
  });

  it('backspace and delete remove the right character; no-ops at edges', () => {
    expect(apply('abc', 1, 'backspace')).toEqual({ buf: 'bc', cur: 0 });
    expect(apply('abc', 0, 'backspace')).toBeNull();
    expect(apply('abc', 1, 'delete')).toEqual({ buf: 'ac', cur: 1 });
    expect(apply('abc', 3, 'delete')).toBeNull();
  });

  it('word motions skip trailing spaces then the word (readline M-b/M-f)', () => {
    expect(wordBack('one two three', 13)).toBe(8);
    expect(wordBack('one two ', 8)).toBe(4);
    expect(wordFwd('one two three', 0)).toBe(3);
    expect(wordFwd('one  two', 3)).toBe(8);
    expect(apply('one two', 7, 'wordback')).toEqual({ buf: 'one two', cur: 4 });
  });

  it('kill word / before / after behave like Ctrl+W, Ctrl+U, Ctrl+K', () => {
    expect(apply('one two', 7, 'killword')).toEqual({ buf: 'one ', cur: 4 });
    expect(apply('one two', 4, 'killbefore')).toEqual({ buf: 'two', cur: 0 }); // cur sits on 't'
    expect(apply('one two', 4, 'killafter')).toEqual({ buf: 'one ', cur: 4 });
    expect(apply('abc', 0, 'killword')).toBeNull();
    expect(apply('abc', 3, 'killafter')).toBeNull();
  });

  it('unknown actions are no-ops', () => {
    expect(apply('a', 0, 'teleport', 5)).toBeNull();
  });
});

describe('wasi paths', () => {
  it('normalize collapses dots, dot-dots and duplicate slashes', () => {
    expect(normalize('/a/./b//c')).toBe('/a/b/c');
    expect(normalize('/a/b/../c')).toBe('/a/c');
    expect(normalize('/..')).toBe('/');
    expect(normalize('/')).toBe('/');
    expect(normalize('a/b')).toBe('/a/b');
  });

  it('join resolves relative against base; absolute wins', () => {
    expect(join('/Home', 'docs')).toBe('/Home/docs');
    expect(join('/Home', '../x')).toBe('/x');
    expect(join('/Home', '/abs')).toBe('/abs');
    expect(join('/Home', '.')).toBe('/Home');
  });
});

describe('MemFS', () => {
  it('seed materializes files and implicit parent directories', () => {
    const fs = new MemFS();
    fs.seed([
      { path: '/Home/notes.txt', bytes: new Uint8Array([104, 105]) },
      { path: '/Docs/guide.md', bytes: new Uint8Array([1]) },
    ]);
    expect(fs.get('/Home').dir).toBe(true); // implicit parent
    expect(fs.get('/Home/notes.txt').bytes).toEqual(new Uint8Array([104, 105]));
    expect(fs.get('/nope')).toBeUndefined();
    expect(fs.dirty).toBe(false); // seeding is not a user mutation
  });

  it('children lists direct entries, inferring dirs from deep keys', () => {
    const fs = new MemFS();
    fs.seed([{ path: '/a/b/c.txt', bytes: new Uint8Array([1]) }, { path: '/a/f.txt', bytes: new Uint8Array([2]) }]);
    expect(fs.children('/a').map(([n]) => n)).toEqual(['b', 'f.txt']);
    expect(fs.children('/a/b').map(([n]) => n)).toEqual(['c.txt']);
    expect(fs.children('/a/b/c.txt')).toEqual([]);
  });

  it('write replaces contents, refuses dirs and bad parents', () => {
    const fs = new MemFS();
    fs.write('/x/a.txt', new Uint8Array([1]));
    fs.write('/x/a.txt', new Uint8Array([2, 2]));
    expect(fs.get('/x/a.txt').bytes).toEqual(new Uint8Array([2, 2]));
    expect(() => fs.write('/x', new Uint8Array([1]))).toThrow(); // EISDIR
    fs.write('/file.txt', new Uint8Array([1]));
    expect(() => fs.write('/file.txt/inner', new Uint8Array([1]))).toThrow(); // ENOTDIR parent
  });

  it('remove has rm -f semantics; non-empty dirs refuse; type mismatch throws', () => {
    const fs = new MemFS();
    expect(() => fs.remove('/ghost')).not.toThrow();
    fs.mkdirp('/d');
    expect(() => fs.remove('/d', { dir: false })).toThrow(); // EISDIR
    fs.write('/d/f', new Uint8Array([1]));
    expect(() => fs.remove('/d', { dir: true })).toThrow(); // ENOTEMPTY
    fs.remove('/d/f');
    fs.remove('/d', { dir: true });
    expect(fs.get('/d')).toBeUndefined();
    expect(fs.dirty).toBe(true);
  });

  it('rename moves subtrees, refuses moving into itself or onto a full dir', () => {
    const fs = new MemFS();
    fs.seed([
      { path: '/a/f.txt', bytes: new Uint8Array([1]) },
      { path: '/a/sub/deep.txt', bytes: new Uint8Array([2]) },
    ]);
    fs.rename('/a', '/b');
    expect(fs.get('/b/f.txt')).toBeTruthy();
    expect(fs.get('/b/sub/deep.txt')).toBeTruthy();
    expect(fs.get('/a')).toBeUndefined();
    fs.mkdirp('/c');
    expect(() => fs.rename('/b', '/b/sub')).toThrow(); // into own subtree
    expect(() => fs.rename('/missing', '/x')).toThrow(); // ENOENT
  });

  it('snapshot enumerates everything but root for write-back', () => {
    const fs = new MemFS();
    fs.seed([{ path: '/Home/f.txt', bytes: new Uint8Array([1]) }]);
    // only materialized entries are records; implicit parents are inferred
    const snap = fs.snapshot();
    expect(snap).toHaveLength(1);
    expect(snap[0].path).toBe('/Home/f.txt');
    expect(snap.some((r) => r.path === '/')).toBe(false);
  });

  it('utimes updates stamps and refuses missing files', () => {
    const fs = new MemFS();
    fs.write('/f', new Uint8Array([1]), 1);
    fs.utimes('/f', 5, 6);
    expect(fs.get('/f').atime).toBe(5);
    expect(fs.get('/f').mtime).toBe(6);
    expect(() => fs.utimes('/nope', 1, 1)).toThrow();
  });
});

describe('WasiHost (no wasm — state machine only)', () => {
  it('reset clears per-run state; fds restart at 4', () => {
    const host = new WasiHost(new MemFS());
    host.reset(['cat', '-n'], ['A=1'], new TextEncoder().encode('pipe in'));
    expect(host.args).toEqual(['cat', '-n']);
    expect(host.envs).toEqual(['A=1']);
    expect(host.stdin).toEqual(new TextEncoder().encode('pipe in'));
    expect(host.stdout).toBe('');
    expect(host.nextFd).toBe(4);
    host.nextFd = 9;
    host.stdout = 'x';
    host.reset(['ls']);
    expect(host.nextFd).toBe(4);
    expect(host.stdout).toBe('');
  });

  it('resolveDir maps the preopen root to cwd and open dirs to their path', () => {
    const fs = new MemFS();
    const host = new WasiHost(fs);
    host.cwd = '/Home';
    expect(host.resolveDir(3)).toBe('/Home');
    expect(host.resolveDir(99)).toBeUndefined(); // unknown fd
    fs.mkdirp('/Data');
    host.fds.set(7, { path: '/Data', dir: true, pos: 0, append: false });
    expect(host.resolveDir(7)).toBe('/Data');
    host.fds.set(8, { path: '/Data/f', dir: false, pos: 0, append: false });
    expect(host.resolveDir(8)).toBeUndefined(); // files are not dir bases
  });
});
