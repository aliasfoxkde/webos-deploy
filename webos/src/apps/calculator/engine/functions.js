// Constants and the function table. Arity is declared here; implementations
// live in FUNCTION_IMPL. Trig functions are angle-aware and wrapped by
// evaluate.js, so these implementations are pure radians-in/radians-out.

export const CONSTANTS = {
  pi: Math.PI,
  tau: Math.PI * 2,
  e: Math.E,
  phi: (1 + Math.sqrt(5)) / 2,
};

export const FUNCTIONS = {
  sin: 1, cos: 1, tan: 1, asin: 1, acos: 1, atan: 1,
  sinh: 1, cosh: 1, tanh: 1, asinh: 1, acosh: 1, atanh: 1,
  sqrt: 1, cbrt: 1, abs: 1, exp: 1,
  ln: 1, log: 1, log2: 1,
  sign: 1, round: 1, floor: 1, ceil: 1, trunc: 1,
  fact: 1, rand: 0,
  min: 2, max: 2, gcd: 2, lcm: 2, root: 2, hypot: 2,
};

export const FUNCTION_IMPL = {
  sin: Math.sin, cos: Math.cos, tan: Math.tan,
  asin: Math.asin, acos: Math.acos, atan: Math.atan,
  sinh: Math.sinh, cosh: Math.cosh, tanh: Math.tanh,
  asinh: Math.asinh, acosh: Math.acosh, atanh: Math.atanh,
  sqrt: Math.sqrt, cbrt: Math.cbrt, abs: Math.abs, exp: Math.exp,
  ln: Math.log,
  log: (x) => Math.log10(x),
  log2: Math.log2,
  sign: Math.sign, round: Math.round, floor: Math.floor, ceil: Math.ceil, trunc: Math.trunc,
  fact: (x) => factorial(x),
  rand: () => Math.random(),
  min: (a, b) => Math.min(a, b),
  max: (a, b) => Math.max(a, b),
  gcd: (a, b) => gcd(a, b),
  lcm: (a, b) => { const g = gcd(a, b); return g === 0 ? 0 : Math.abs(a * b) / g; },
  root: (x, n) => (x < 0 && n % 2 === 1 ? -Math.pow(-x, 1 / n) : Math.pow(x, 1 / n)),
  hypot: (a, b) => Math.hypot(a, b),
};

// Angle-mode aware names: arguments/results are converted to/from the active
// unit. Everything else is passed through untouched.
export const ANGLE_IN = ['sin', 'cos', 'tan'];
export const ANGLE_OUT = ['asin', 'acos', 'atan'];

export function factorial(n) {
  if (!Number.isInteger(n) || n < 0) return NaN;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}

function gcd(a, b) {
  a = Math.abs(Math.trunc(a));
  b = Math.abs(Math.trunc(b));
  while (b) { [a, b] = [b, a % b]; }
  return a;
}
