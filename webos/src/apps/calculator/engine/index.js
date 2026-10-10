// Expression engine barrel: tokenize → parse → evaluate, plus formatting.
// Modes never import engine internals directly except through this module.
// NOTE: parse/evaluate are imported then re-exported (not `export … from`)
// because evaluateExpression/compile below use them directly — a re-export
// creates no local binding, and referencing it throws ReferenceError.
import { parse } from './parser.js';
import { evaluate } from './evaluate.js';

export { CalcError } from './errors.js';
export { tokenize } from './lexer.js';
export { parse };
export { evaluate };
export { formatNumber } from './format.js';
export { CONSTANTS, FUNCTIONS } from './functions.js';

export function evaluateExpression(src, opts) {
  return evaluate(parse(src), opts);
}

// Compile once, evaluate many times — the graphing plotter's hot path.
export function compile(src, opts) {
  const ast = parse(src);
  return (vars) => evaluate(ast, { ...opts, vars });
}
