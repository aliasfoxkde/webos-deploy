// wosh line editing + pipe parsing + pipeline stdin (fd 0).
import { describe, it, expect } from 'vitest';
import { edit, wordBack, wordFwd } from '../src/apps/terminal/lineedit.js';
import { splitPipes } from '../src/apps/terminal/pipes.js';
import { MemFS, WasiHost, errno } from '../src/apps/terminal/wasi.js';

describe('lineedit cursor movement', () => {
  it('moves left/right within bounds', () => {
    expect(edit('abc', 3, 'left')).toEqual({ buf: 'abc', cur: 2 });
    expect(edit('abc', 0, 'left')).toBeNull();
    expect(edit('abc', 1, 'right')).toEqual({ buf: 'abc', cur: 2 });
    expect(edit('abc', 3, 'right')).toBeNull();
  });

  it('homes and ends', () => {
    expect(edit('abc', 2, 'home')).toEqual({ buf: 'abc', cur: 0 });
    expect(edit('abc', 0, 'end')).toEqual({ buf: 'abc', cur: 3 });
  });

  it('inserts at the cursor, not just at the end', () => {
    expect(edit('ab', 1, 'insert', 'X')).toEqual({ buf: 'aXb', cur: 2 });
    expect(edit('ab', 2, 'insert', '!')).toEqual({ buf: 'ab!', cur: 3 });
    expect(edit('ab', 0, 'insert', '')).toBeNull();
  });

  it('backspaces before the cursor and deletes at it', () => {
    expect(edit('abc', 2, 'backspace')).toEqual({ buf: 'ac', cur: 1 });
    expect(edit('abc', 0, 'backspace')).toBeNull();
    expect(edit('abc', 1, 'delete')).toEqual({ buf: 'ac', cur: 1 }); // removes 'b' at the cursor
    expect(edit('abc', 2, 'delete')).toEqual({ buf: 'ab', cur: 2 }); // removes 'c'
    expect(edit('abc', 3, 'delete')).toBeNull();
  });

  it('jumps words over space runs', () => {
    expect(wordBack('ls docs sub', 11)).toBe(8);
    expect(wordBack('ls docs sub', 8)).toBe(3);
    expect(wordFwd('ls docs sub', 0)).toBe(2);
    expect(wordFwd('ls docs sub', 2)).toBe(7);
    expect(edit('ls docs', 7, 'wordback')).toEqual({ buf: 'ls docs', cur: 3 });
    expect(edit('ls docs', 0, 'wordfwd')).toEqual({ buf: 'ls docs', cur: 2 });
  });

  it('kills words, before, and after', () => {
    expect(edit('ls docs', 7, 'killword')).toEqual({ buf: 'ls ', cur: 3 });
    expect(edit('ls docs', 3, 'killbefore')).toEqual({ buf: 'docs', cur: 0 }); // 'd' sits at index 3
    expect(edit('ls docs', 3, 'killafter')).toEqual({ buf: 'ls ', cur: 3 });
  });

  it('ignores unknown actions', () => {
    expect(edit('abc', 1, 'explode')).toBeNull();
  });
});

describe('splitPipes', () => {
  it('splits on unquoted pipes', () => {
    expect(splitPipes('cat a | grep x | wc -l')).toEqual(['cat a ', ' grep x ', ' wc -l']);
    expect(splitPipes('ls')).toEqual(['ls']);
  });

  it('protects quoted pipes', () => {
    expect(splitPipes(`echo "a|b" | wc -c`)).toEqual([`echo "a|b" `, ' wc -c']);
    expect(splitPipes("echo 'x|y'")).toEqual(["echo 'x|y'"]);
  });

  it('reports unterminated quotes as null', () => {
    expect(splitPipes('echo "oops')).toBeNull();
    expect(splitPipes("echo 'oops")).toBeNull();
  });
});

describe('pipeline stdin (fd 0)', () => {
  const enc = new TextEncoder();
  const hostWith = (argv, stdin) => {
    const host = new WasiHost(new MemFS());
    host.memory = new WebAssembly.Memory({ initial: 1 });
    host.reset(argv, [], stdin);
    return { host, imp: host.imports() };
  };

  it('serves reset() stdin bytes to fd 0 reads, then EOF', () => {
    const { host, imp } = hostWith(['cat'], enc.encode('hello\npipeline\n'));
    // two iov entries, generously sized
    const dv = new DataView(host.memory.buffer);
    dv.setUint32(64, 256, true);
    dv.setUint32(68, 8, true);
    dv.setUint32(72, 300, true);
    dv.setUint32(76, 8, true);
    expect(imp.fd_read(0, 64, 2, 96)).toBe(errno.SUCCESS);
    expect(dv.getUint32(96, true)).toBe(15);
    // the two iovs fill independently: 8 bytes at 256, remaining 7 at 300
    const u8buf = new Uint8Array(host.memory.buffer);
    const out = [...u8buf.subarray(256, 264), ...u8buf.subarray(300, 307)];
    expect(new TextDecoder().decode(new Uint8Array(out))).toBe('hello\npipeline\n');
    // second read: EOF
    expect(imp.fd_read(0, 64, 2, 96)).toBe(errno.SUCCESS);
    expect(dv.getUint32(96, true)).toBe(0);
  });

  it('without stdin, fd 0 reads report EOF rather than ENOTSUP', () => {
    const { host, imp } = hostWith(['cat'], new Uint8Array(0));
    const dv = new DataView(host.memory.buffer);
    dv.setUint32(64, 256, true);
    dv.setUint32(68, 8, true);
    expect(imp.fd_read(0, 64, 1, 96)).toBe(errno.SUCCESS);
    expect(dv.getUint32(96, true)).toBe(0);
  });
});
