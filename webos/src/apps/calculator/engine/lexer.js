// Tokenizer for the calculator expression language. Produces
// { type: 'num'|'ident'|'op'|'lp'|'rp'|'comma', value, pos } tokens.
// Pretty glyphs typed by on-screen keys (× ÷ − π) are normalized here so the
// parser only ever sees ASCII.
import { CalcError } from './errors.js';

const OP_CHARS = '+-*/^!%';
const NORMALIZE = { '×': '*', '·': '*', '÷': '/', '−': '-', '–': '-', '—': '-' };

export function tokenize(src) {
  const s = String(src ?? '');
  const tokens = [];
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (c === ' ' || c === '\t') { i++; continue; }
    if (/[0-9.]/.test(c)) {
      let j = i;
      while (j < s.length && /[0-9]/.test(s[j])) j++;
      if (s[j] === '.') { j++; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      if (s[j] === 'e' || s[j] === 'E') {
        let k = j + 1;
        if (s[k] === '+' || s[k] === '-') k++;
        if (/[0-9]/.test(s[k] ?? '')) { j = k; while (j < s.length && /[0-9]/.test(s[j])) j++; }
      }
      const text = s.slice(i, j);
      if (text === '.') throw new CalcError("Stray '.'");
      tokens.push({ type: 'num', value: text, pos: i });
      i = j;
      continue;
    }
    if (/[a-zA-Z]/.test(c)) {
      let j = i;
      while (j < s.length && /[a-zA-Z0-9]/.test(s[j])) j++;
      tokens.push({ type: 'ident', value: s.slice(i, j).toLowerCase(), pos: i });
      i = j;
      continue;
    }
    if (OP_CHARS.includes(c)) { tokens.push({ type: 'op', value: c, pos: i }); i++; continue; }
    if (NORMALIZE[c]) { tokens.push({ type: 'op', value: NORMALIZE[c], pos: i }); i++; continue; }
    if (c === 'π') { tokens.push({ type: 'ident', value: 'pi', pos: i }); i++; continue; }
    if (c === '(') { tokens.push({ type: 'lp', value: c, pos: i }); i++; continue; }
    if (c === ')') { tokens.push({ type: 'rp', value: c, pos: i }); i++; continue; }
    if (c === ',') { tokens.push({ type: 'comma', value: c, pos: i }); i++; continue; }
    throw new CalcError(`Unexpected character '${c}'`);
  }
  return tokens;
}
