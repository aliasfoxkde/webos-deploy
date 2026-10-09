// AST evaluator. Strict mode (default) throws CalcError on bad math; relaxed
// mode returns NaN instead — used by the graphing plotter, where discontinuities
// and domain holes are data, not failures.
import { CalcError } from './errors.js';
import { CONSTANTS, FUNCTIONS, FUNCTION_IMPL, ANGLE_IN, ANGLE_OUT, factorial } from './functions.js';

export function evaluate(ast, opts = {}) {
  const ctx = {
    angle: opts.angle || 'rad',
    vars: opts.vars || null,
    relaxed: !!opts.relaxed,
  };
  return evalNode(ast, ctx);
}

const toRad = (x, angle) => (angle === 'deg' ? (x * Math.PI) / 180 : angle === 'grad' ? (x * Math.PI) / 200 : x);
const fromRad = (x, angle) => (angle === 'deg' ? (x * 180) / Math.PI : angle === 'grad' ? (x * 200) / Math.PI : x);

function fail(ctx, message) {
  if (ctx.relaxed) return NaN;
  throw new CalcError(message);
}

function evalNode(n, ctx) {
  switch (n.type) {
    case 'num':
      return n.value;
    case 'const': {
      if (ctx.vars && n.name in ctx.vars) return ctx.vars[n.name];
      if (n.name in CONSTANTS) return CONSTANTS[n.name];
      return fail(ctx, `Unknown name '${n.name}'`);
    }
    case 'unary':
      return -evalNode(n.arg, ctx);
    case 'binary':
      return evalBinary(n.op, evalNode(n.left, ctx), evalNode(n.right, ctx), ctx);
    case 'postfix':
      if (n.op === '%') return evalNode(n.arg, ctx) / 100;
      return factorial(evalNode(n.arg, ctx));
    case 'call': {
      const arity = FUNCTIONS[n.name];
      if (arity === undefined) return fail(ctx, `Unknown function '${n.name}'`);
      if (n.args.length !== arity) return fail(ctx, `${n.name}() expects ${arity} argument${arity === 1 ? '' : 's'}`);
      const argv = n.args.map((a) => evalNode(a, ctx));
      let impl = FUNCTION_IMPL[n.name];
      if (ANGLE_IN.includes(n.name)) {
        const a0 = toRad(argv[0], ctx.angle);
        return impl(a0);
      }
      if (ANGLE_OUT.includes(n.name)) return fromRad(impl(argv[0]), ctx.angle);
      return impl(...argv);
    }
    default:
      return fail(ctx, 'Malformed expression');
  }
}

function evalBinary(op, a, b, ctx) {
  switch (op) {
    case '+': return a + b;
    case '-': return a - b;
    case '*': return a * b;
    case '/':
      if (b === 0) return fail(ctx, 'Division by zero');
      return a / b;
    case 'mod':
      if (b === 0) return fail(ctx, 'Division by zero');
      return a % b;
    case '^': return Math.pow(a, b);
    default:
      return fail(ctx, `Unknown operator '${op}'`);
  }
}
