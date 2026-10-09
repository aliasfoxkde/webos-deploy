// Recursive-descent parser (precedence climbing) for calculator expressions.
//
// Precedence (loosest → tightest):
//   + - (1)   * / mod (2)   implicit multiplication (3)   unary minus (3)
//   ^ (4, right-assoc)   postfix ! % (5)
// Implicit multiplication (2π, 3(4+1), 2sin(x)) binds tighter than explicit ×,
// so 1/2π parses as 1/(2π) and 2x^2 as 2*(x^2) — the convention graphing
// calculators use.
import { CalcError } from './errors.js';
import { tokenize } from './lexer.js';

const PREC = { '+': 1, '-': 1, '*': 2, '/': 2, mod: 2, '^': 4 };
const IMPLICIT_PREC = 3;
const RIGHT_ASSOC = new Set(['^']);

export function parse(src) {
  const tokens = tokenize(src);
  let p = 0;
  const peek = () => tokens[p];
  const next = () => tokens[p++];

  const startsPrimary = (t) => t && (t.type === 'num' || t.type === 'ident' || t.type === 'lp');
  const isInfixMod = (t) => t?.type === 'ident' && t.value === 'mod';

  function parseExpr(minPrec) {
    let left = parseUnary();
    for (;;) {
      const t = peek();
      // implicit multiplication
      if (startsPrimary(t) && !isInfixMod(t)) {
        if (IMPLICIT_PREC < minPrec) break;
        left = { type: 'binary', op: '*', left, right: parseExpr(IMPLICIT_PREC + 1) };
        continue;
      }
      const op = t?.type === 'op' ? t.value : isInfixMod(t) ? 'mod' : null;
      if (!op || (PREC[op] ?? 0) < minPrec) break;
      next();
      const right = parseExpr(RIGHT_ASSOC.has(op) ? PREC[op] : PREC[op] + 1);
      left = { type: 'binary', op, left, right };
    }
    return left;
  }

  function parseUnary() {
    const t = peek();
    if (t?.type === 'op' && (t.value === '+' || t.value === '-')) {
      next();
      if (t.value === '+') return parseUnary();
      return { type: 'unary', op: '-', arg: parseExpr(IMPLICIT_PREC) };
    }
    return parsePostfix();
  }

  function parsePostfix() {
    let node = parsePrimary();
    for (;;) {
      const t = peek();
      if (t?.type === 'op' && (t.value === '!' || t.value === '%')) {
        next();
        node = { type: 'postfix', op: t.value, arg: node };
        continue;
      }
      break;
    }
    return node;
  }

  function parsePrimary() {
    const t = next();
    if (!t) throw new CalcError('Unexpected end of expression');
    if (t.type === 'num') return { type: 'num', value: parseFloat(t.value) };
    if (t.type === 'lp') {
      const inner = parseExpr(1);
      const close = next();
      if (!close || close.type !== 'rp') throw new CalcError('Missing closing parenthesis');
      return inner;
    }
    if (t.type === 'ident') {
      if (peek()?.type === 'lp') {
        next(); // consume '('
        const args = [];
        if (peek()?.type !== 'rp') {
          args.push(parseExpr(1));
          while (peek()?.type === 'comma') { next(); args.push(parseExpr(1)); }
        }
        const close = next();
        if (!close || close.type !== 'rp') throw new CalcError(`Missing ')' after ${t.value}(`);
        return { type: 'call', name: t.value, args };
      }
      return { type: 'const', name: t.value };
    }
    throw new CalcError(`Unexpected '${t.value}'`);
  }

  const ast = parseExpr(1);
  if (p < tokens.length) throw new CalcError(`Unexpected '${tokens[p].value}'`);
  return ast;
}
