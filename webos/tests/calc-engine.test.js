// Calculator expression engine: tokenizer glyph normalization, precedence
// (implicit multiplication binds tighter than explicit ×, right-assoc ^),
// postfix operators, angle-mode-aware trig, strict vs relaxed evaluation,
// and result formatting (grouping, exponent switchover).
import { describe, it, expect } from 'vitest';
import {
  CalcError, tokenize, parse, evaluate, evaluateExpression, compile,
  formatNumber, CONSTANTS, FUNCTIONS,
} from '../src/apps/calculator/engine/index.js';

describe('tokenize', () => {
  it('normalizes pretty glyphs to ASCII operators', () => {
    expect(tokenize('2×3÷4−1')).toEqual([
      { type: 'num', value: '2', pos: 0 },
      { type: 'op', value: '*', pos: 1 },
      { type: 'num', value: '3', pos: 2 },
      { type: 'op', value: '/', pos: 3 },
      { type: 'num', value: '4', pos: 4 },
      { type: 'op', value: '-', pos: 5 },
      { type: 'num', value: '1', pos: 6 },
    ]);
  });

  it('reads exponents, π, idents, and skips whitespace', () => {
    const t = tokenize(' 2.5e-3 π max(a1, x)');
    expect(t.map((x) => x.value)).toEqual(['2.5e-3', 'pi', 'max', '(', 'a1', ',', 'x', ')']);
    expect(t[0].type).toBe('num');
    expect(t[1].type).toBe('ident');
  });

  it('rejects a stray dot and unknown characters', () => {
    expect(() => tokenize('.')).toThrow(CalcError);
    expect(() => tokenize('2 + $')).toThrow(CalcError);
    expect(tokenize(null)).toEqual([]); // nullish source → empty
  });
});

describe('parse precedence', () => {
  it('implicit multiplication binds tighter than explicit ×: 1/2π = 1/(2π)', () => {
    expect(evaluateExpression('1/2pi')).toBeCloseTo(1 / (2 * Math.PI), 12);
    expect(evaluateExpression('1/2×pi')).toBeCloseTo(Math.PI / 2, 12);
  });

  it('2x^2 parses as 2*(x^2) — power binds tighter than implicit multiply', () => {
    const f = compile('2x^2');
    expect(f({ x: 3 })).toBe(18);
  });

  it('^ is right-associative; postfix ! and % bind tightest', () => {
    expect(evaluateExpression('2^3^2')).toBe(512);
    expect(evaluateExpression('5!')).toBe(120);
    expect(evaluateExpression('50%')).toBe(0.5);
    expect(evaluateExpression('2^2!')).toBe(4); // 2^(2!)
  });

  it('unary minus, parens, and calls with comma arguments', () => {
    expect(evaluateExpression('-2^2')).toBe(-4); // unary looser than ^
    expect(evaluateExpression('(-2)^2')).toBe(4);
    expect(evaluateExpression('max(3, 9)')).toBe(9);
    expect(evaluateExpression('(2(3+1))')).toBe(8);
  });

  it('reports the exact syntax failures', () => {
    expect(() => parse('2+')).toThrow(CalcError);
    expect(() => parse('(2')).toThrow('Missing closing parenthesis');
    expect(() => parse('2 3)')).toThrow(CalcError);
    expect(() => parse('sin(2')).toThrow("Missing ')' after sin(");
    expect(() => parse('4)')).toThrow("Unexpected ')'");
  });
});

describe('evaluate', () => {
  it('vars override constants; unknown names fail strictly', () => {
    expect(evaluate(parse('2x+1'), { vars: { x: 5 } })).toBe(11);
    expect(evaluate(parse('pi'), {})).toBeCloseTo(Math.PI, 12);
    expect(() => evaluate(parse('q'))).toThrow("Unknown name 'q'");
  });

  it('relaxed mode returns NaN instead of throwing', () => {
    expect(evaluate(parse('1/0'), { relaxed: true })).toBeNaN();
    expect(() => evaluate(parse('1/0'))).toThrow('Division by zero');
    expect(evaluate(parse('sqrt(-1)'), { relaxed: true })).toBeNaN();
  });

  it('angle modes feed deg/grad in and pull asin back out', () => {
    expect(evaluateExpression('sin(30)', { angle: 'deg' })).toBeCloseTo(0.5, 12);
    expect(evaluateExpression('sin(100)', { angle: 'grad' })).toBeCloseTo(1, 6);
    expect(evaluateExpression('asin(1)', { angle: 'deg' })).toBeCloseTo(90, 10);
    expect(evaluateExpression('asin(1)', { angle: 'grad' })).toBeCloseTo(100, 6); // 90° = 100 grad
  });

  it('covers the function table: arity errors and the non-trivial impls', () => {
    expect(() => evaluate(parse('sin()'))).toThrow('sin() expects 1 argument');
    expect(() => evaluate(parse('min(1)'))).toThrow('min() expects 2 arguments');
    expect(evaluateExpression('log(100)')).toBe(2);
    expect(evaluateExpression('gcd(12, 18)')).toBe(6);
    expect(evaluateExpression('lcm(4, 6)')).toBe(12);
    expect(evaluateExpression('lcm(0, 5)')).toBe(0);
    expect(evaluateExpression('root(-27, 3)')).toBeCloseTo(-3, 12);
    expect(evaluateExpression('root(16, 4)')).toBeCloseTo(2, 12);
    expect(evaluateExpression('hypot(3, 4)')).toBe(5);
    expect(evaluateExpression('fact(0)')).toBe(1);
    expect(evaluateExpression('rand()')).toBeGreaterThanOrEqual(0);
    expect(evaluateExpression('sign(-9)')).toBe(-1);
    expect(evaluateExpression('phi * 2 - 1')).toBeCloseTo(Math.sqrt(5), 12);
    expect(Object.keys(CONSTANTS)).toEqual(['pi', 'tau', 'e', 'phi']);
    expect(FUNCTIONS.rand).toBe(0);
  });

  it('fact of a negative or non-integer is NaN (strict surfaces it via =)', () => {
    expect(evaluateExpression('fact(-1)')).toBeNaN();
    expect(evaluateExpression('fact(1.5)')).toBeNaN();
  });
});

describe('formatNumber', () => {
  it('handles the sentinel values', () => {
    expect(formatNumber(NaN)).toBe('Error');
    expect(formatNumber(Infinity)).toBe('∞');
    expect(formatNumber(-Infinity)).toBe('-∞');
    expect(formatNumber(0)).toBe('0');
  });

  it('groups digits and keeps fractions', () => {
    expect(formatNumber(1234567.25)).toBe('1,234,567.25');
    expect(formatNumber(-9876543.5)).toBe('-9,876,543.5');
    expect(formatNumber(1234.5, { grouping: false })).toBe('1234.5');
  });

  it('switches to exponent at 1e15 and below 1e-9, trimming zeros', () => {
    expect(formatNumber(1e15)).toBe('1e+15');
    expect(formatNumber(2e-10)).toBe('2e-10');
    expect(formatNumber(1e-9)).toBe('1e-9'); // String() goes exponential below 1e-7
    expect(formatNumber(0.000001)).toBe('0.000001');
  });

  it('precision clamps to the supported range', () => {
    expect(formatNumber(Math.PI, { precision: 3 })).toBe('3.14');
    expect(formatNumber(1 / 3, { precision: 99 })).toBe('0.333333333333333');
  });
});
