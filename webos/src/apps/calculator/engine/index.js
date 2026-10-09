// Expression engine barrel: tokenize → parse → evaluate, plus formatting.
// Modes never import engine internals directly except through this module.
export { CalcError } from './errors.js';
export { tokenize } from './lexer.js';
export { parse } from './parser.js';
export { evaluate } from './evaluate.js';
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
