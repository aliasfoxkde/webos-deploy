// Result formatting: precision control, exponent switchover, digit grouping.
export function formatNumber(x, { precision = 'auto', grouping = true } = {}) {
  if (Number.isNaN(x)) return 'Error';
  if (!Number.isFinite(x)) return x > 0 ? '∞' : '-∞';
  if (x === 0) return '0';

  const abs = Math.abs(x);
  const useExp = abs >= 1e15 || abs < 1e-9;
  let s;
  if (useExp) {
    const p = precision === 'auto' ? 9 : Math.max(0, Math.min(20, precision));
    s = trimZeros(x.toExponential(p));
  } else {
    const p = precision === 'auto' ? 13 : Math.max(1, Math.min(15, precision));
    s = String(parseFloat(x.toPrecision(p)));
  }

  if (grouping && !s.includes('e')) {
    const neg = s.startsWith('-');
    const [int, frac] = (neg ? s.slice(1) : s).split('.');
    const gi = int.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    s = (neg ? '-' : '') + gi + (frac ? '.' + frac : '');
  }
  return s;
}

function trimZeros(s) {
  return s.replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
}
