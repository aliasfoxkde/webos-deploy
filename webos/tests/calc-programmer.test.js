// Programmer-mode evaluator: BigInt bitwise precedence (| ^ & shifts ± mul),
// fixed-width two's-complement wrap, base-N literals with per-base digit
// validation, and grouped base display strings.
import { describe, it, expect } from 'vitest';
import { CalcError } from '../src/apps/calculator/engine/errors.js';
import { evalProgrammer, wrapSigned, toBaseString } from '../src/apps/calculator/engine/programmer.js';

describe('evalProgrammer precedence', () => {
  it.each([[64], [32]])('bitwise chain binds looser than arithmetic (%d-bit)', (bits) => {
    expect(evalProgrammer('1 | 2', 10, bits)).toBe(3n);
    expect(evalProgrammer('3 ^ 1', 10, bits)).toBe(2n);
    expect(evalProgrammer('6 & 3', 10, bits)).toBe(2n);
    expect(evalProgrammer('1 << 4', 10, bits)).toBe(16n);
    expect(evalProgrammer('-16 >> 2', 10, bits)).toBe(-4n);
    expect(evalProgrammer('2 + 3 * 4', 10, bits)).toBe(14n);
    expect(evalProgrammer('(2 + 3) * 4', 10, bits)).toBe(20n);
    expect(evalProgrammer('1 | 2 ^ 3 & 3', 10, bits)).toBe(1n); // 1 | (2 ^ (3 & 3)) = 1 | (2 ^ 3)
    expect(evalProgrammer('1 << 2 + 1', 10, bits)).toBe(8n); // + tighter than <<
  });

  it('unary ~ and - compose', () => {
    expect(evalProgrammer('~0', 10, 32)).toBe(-1n);
    expect(evalProgrammer('--5', 10, 32)).toBe(5n);
    expect(evalProgrammer('~(1 | 2)', 10, 32)).toBe(-4n);
  });

  it('literals follow the active base; foreign digits are errors', () => {
    expect(evalProgrammer('ff + 1', 16, 32)).toBe(256n);
    expect(evalProgrammer('101 + 1', 2, 32)).toBe(6n); // 0b101 + 1 = 6? no: 5+1
    expect(evalProgrammer('17', 8, 32)).toBe(15n);
    expect(() => evalProgrammer('9', 8, 32)).toThrow(CalcError);
    expect(() => evalProgrammer('2', 2, 32)).toThrow(CalcError);
    expect(() => evalProgrammer('g', 16, 32)).toThrow(CalcError);
  });

  it('keeps BigInt precision past 32 bits', () => {
    expect(evalProgrammer('4294967296 * 4294967296', 10, 128)).toBe(18446744073709551616n);
  });

  it('word size wraps two-complement; div/mod by zero raises CalcError', () => {
    expect(evalProgrammer('127 + 1', 10, 8)).toBe(-128n);
    expect(evalProgrammer('0 - 1', 10, 8)).toBe(-1n);
    expect(() => evalProgrammer('5 / 0', 10, 32)).toThrow('Division by zero');
    expect(() => evalProgrammer('5 % 0', 10, 32)).toThrow('Division by zero');
    expect(() => evalProgrammer('5 /', 10, 32)).toThrow(CalcError);
    expect(() => evalProgrammer('(1 + 2', 10, 32)).toThrow('Missing closing parenthesis');
    expect(() => evalProgrammer('1 2', 10, 32)).toThrow("Unexpected '2'");
  });
});

describe('wrapSigned', () => {
  it.each([
    [255, 8, -1], [128, 8, -128], [127, 8, 127],
    [65535, 16, -1], [2147483648, 32, -2147483648],
    [18446744073709551615n, 64, -1],
  ])('%p in %d-bit wraps to %p', (v, bits, want) => {
    expect(wrapSigned(BigInt(v), bits)).toBe(BigInt(want));
  });
});

describe('toBaseString', () => {
  it('groups binary in nibbles and hex in nibbles, decimal in triplets', () => {
    expect(toBaseString(0b1111_0000_1010n, 2, 32)).toBe('1111 0000 1010');
    expect(toBaseString(0xdeadbeefn, 16, 32)).toBe('DEAD BEEF');
    expect(toBaseString(1234567n, 10, 32)).toBe('1 234 567');
  });

  it('renders negatives as unsigned in the target base', () => {
    expect(toBaseString(-1n, 16, 8)).toBe('FF');
    expect(toBaseString(-1n, 2, 8)).toBe('1111 1111');
    expect(toBaseString(-128n, 10, 8)).toBe('128');
  });

  it('short values pass through ungrouped', () => {
    expect(toBaseString(9n, 16, 32)).toBe('9');
  });
});
