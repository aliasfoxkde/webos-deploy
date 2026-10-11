// Shared byte formatter.
import { describe, it, expect } from 'vitest';
import { fmtBytes } from '../src/os/format.js';

describe('fmtBytes', () => {
  it('formats each unit with the documented precision', () => {
    expect(fmtBytes(0)).toBe('0 B');
    expect(fmtBytes(512)).toBe('512 B');
    expect(fmtBytes(1024)).toBe('1.0 KB');
    expect(fmtBytes(1536)).toBe('1.5 KB');
    expect(fmtBytes(1024 * 1024)).toBe('1.0 MB');
    expect(fmtBytes(1024 ** 3)).toBe('1.00 GB');
    expect(fmtBytes(2.5 * 1024 ** 3)).toBe('2.50 GB');
  });

  it('blanks out missing values', () => {
    expect(fmtBytes(null)).toBe('');
    expect(fmtBytes(undefined)).toBe('');
  });
});
