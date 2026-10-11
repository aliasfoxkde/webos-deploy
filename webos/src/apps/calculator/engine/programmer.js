// Programmer-mode evaluator: BigInt bitwise arithmetic inside a fixed word
// size (two's complement). Grammar, loosest → tightest:
//   |  then  ^  then  &  then  << >>  then  + -  then  * / %  then  unary ~ -
// Literals use the active base (2/8/10/16); digits above the base are errors.
import { CalcError } from './errors.js';

export function evalProgrammer(src, base, bits) {
  const tokens = lexProgrammer(src, base);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];

  function parseExpr() { return parseOr(); }

  function binaryChain(sub, ops) {
    let left = sub();
    for (;;) {
      const t = peek();
      if (t === undefined || !ops.includes(t)) return left;
      next();
      const rhs = sub();
      left = t === '&' ? left & rhs
        : t === '^' ? left ^ rhs
        : t === '|' ? left | rhs
        : t === '<<' ? left << rhs
        : left >> rhs;
    }
  }

  function parseOr() { return binaryChain(parseXor, ['|']); }
  function parseXor() { return binaryChain(parseAnd, ['^']); }
  function parseAnd() { return binaryChain(parseShift, ['&']); }
  function parseShift() { return binaryChain(parseAdd, ['<<', '>>']); }

  function parseAdd() {
    let left = parseMul();
    for (;;) {
      const t = peek();
      if (t === '+') { next(); left = left + parseMul(); }
      else if (t === '-') { next(); left = left - parseMul(); }
      else return left;
    }
  }

  function parseMul() {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      if (t === '*') { next(); left = left * parseUnary(); }
      else if (t === '/') {
        next();
        const d = parseUnary();
        if (d === 0n) throw new CalcError('Division by zero');
        left = left / d;
      } else if (t === '%') {
        next();
        const d = parseUnary();
        if (d === 0n) throw new CalcError('Division by zero');
        left = left % d;
      } else return left;
    }
  }

  function parseUnary() {
    const t = peek();
    if (t === '~') { next(); return ~parseUnary(); }
    if (t === '-') { next(); return -parseUnary(); }
    if (t === '+') { next(); return parseUnary(); }
    return parseAtom();
  }

  function parseAtom() {
    const t = next();
    if (t === undefined) throw new CalcError('Unexpected end of expression');
    if (typeof t === 'bigint') return t;
    if (t === '(') {
      const inner = parseExpr();
      if (next() !== ')') throw new CalcError('Missing closing parenthesis');
      return inner;
    }
    throw new CalcError(`Unexpected '${String(t)}'`);
  }

  const value = parseExpr();
  if (p < tokens.length) throw new CalcError(`Unexpected '${String(tokens[p])}'`);
  return wrapSigned(value, bits);
}

export function wrapSigned(v, bits) {
  const b = BigInt(bits);
  const m = (1n << b) - 1n;
  const u = v & m;
  return u >= (1n << (b - 1n)) ? u - (1n << b) : u;
}

function lexProgrammer(src, base) {
  const s = String(src ?? '');
  const tokens = [];
  let i = 0;
  const digits = '0123456789abcdef'.slice(0, base);
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9a-fA-F]/.test(c)) {
      let j = i;
      while (j < s.length && digits.includes(s[j].toLowerCase())) j++;
      if (j === i) throw new CalcError(`'${c}' is not valid in base ${base}`);
      // digit-by-digit: parseInt would lose precision past 32 bits
      let v = 0n;
      for (const ch of s.slice(i, j)) v = v * BigInt(base) + BigInt(parseInt(ch, 16));
      tokens.push(v);
      i = j;
      continue;
    }
    if (s.startsWith('<<', i)) { tokens.push('<<'); i += 2; continue; }
    if (s.startsWith('>>', i)) { tokens.push('>>'); i += 2; continue; }
    if ('+-*/%&|^~()'.includes(c)) { tokens.push(c); i++; continue; }
    if (c === '×') { tokens.push('*'); i++; continue; }
    if (c === '÷') { tokens.push('/'); i++; continue; }
    if (c === '−') { tokens.push('-'); i++; continue; }
    if (c === '(') { tokens.push('('); i++; continue; }
    throw new CalcError(`Unexpected character '${c}'`);
  }
  return tokens;
}

// Unsigned representation for display, grouped for readability.
export function toBaseString(v, base, bits) {
  const u = v < 0n ? v + (1n << BigInt(bits)) : v;
  let s = u.toString(base).toUpperCase();
  const group = base === 2 ? 4 : base === 16 ? 4 : 3;
  if (s.length > group) {
    const parts = [];
    for (let end = s.length; end > 0; end -= group) parts.unshift(s.slice(Math.max(0, end - group), end));
    s = parts.join(' ');
  }
  return s;
}
