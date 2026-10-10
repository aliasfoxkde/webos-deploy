// Regression test: the engine barrel used `export { parse } from …`
// (re-export creates no local binding), so evaluateExpression/compile threw
// ReferenceError — breaking the calculator's `=` path and the graphing
// plotter in shipped 3.4.0. Caught by the no-undef lint gate.
import { describe, it, expect } from 'vitest';
import { evaluateExpression, compile, CalcError } from '../src/apps/calculator/engine/index.js';

describe('engine barrel', () => {
  it('evaluates standard-mode expressions', () => {
    expect(evaluateExpression('2+3*4')).toBe(14);
  });

  it('compiles once and evaluates many (graphing hot path)', () => {
    const f = compile('x^2');
    expect(f({ x: 3 })).toBe(9);
    expect(f({ x: -2 })).toBe(4);
  });

  it('reports malformed input as CalcError, not a crash', () => {
    expect(() => evaluateExpression('2++/')).toThrow(CalcError);
  });
});
