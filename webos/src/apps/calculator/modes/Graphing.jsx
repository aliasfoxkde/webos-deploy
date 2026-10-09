import React, { useMemo, useState } from 'react';
import { CalcError, compile } from '../engine/index.js';
import PlotCanvas from '../graph/PlotCanvas.jsx';

// Graphing: up to 6 functions of x, plotted on a pan/zoom canvas.
// Expressions are compiled once through the shared engine; invalid ones are
// flagged inline without blocking the rest. Viewport controls live inside the
// canvas component.
const FN_COLORS = ['#38bdf8', '#f472b6', '#a3e635', '#fbbf24', '#c084fc', '#2dd4bf'];
const STORE_KEY = 'webos.calc.graph';
const MAX_FNS = 6;

function loadFns() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    if (Array.isArray(parsed) && parsed.length) return parsed.slice(0, MAX_FNS);
  } catch { /* fresh start */ }
  return [{ expr: 'sin(x)' }, { expr: 'x^2/4 - 2' }];
}

function persist(fns) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(fns)); } catch { /* private mode */ }
}

export default function Graphing() {
  const [fns, setFns] = useState(loadFns);

  const compiled = useMemo(
    () => fns.map((f) => {
      try {
        const fn = compile(f.expr, { relaxed: true });
        return { ...f, fn, error: null };
      } catch (err) {
        return { ...f, fn: null, error: err instanceof CalcError ? err.message : 'Invalid expression' };
      }
    }),
    [fns]
  );

  const mutate = (updater) => setFns((prev) => {
    const next = updater(prev);
    persist(next);
    return next;
  });

  return (
    <div className="calc-mode graph-mode">
      <div className="fn-editor">
        {compiled.map((f, i) => (
          <div key={i} className={`fn-row ${f.error ? 'bad' : ''}`} title={f.error || f.expr}>
            <span className="fn-dot" style={{ background: f.error ? '#f87171' : FN_COLORS[i % FN_COLORS.length] }} />
            <span className="fn-eq">y =</span>
            <input
              value={f.expr}
              onChange={(e) => mutate((prev) => prev.map((p, j) => (j === i ? { ...p, expr: e.target.value } : p)))}
              placeholder="expression of x — e.g. sin(x)*x"
              spellCheck="false"
              autoComplete="off"
              aria-label={`Function ${i + 1}`}
            />
            <button type="button" className="tb-btn" title="Remove" onClick={() => mutate((prev) => (prev.length > 1 ? prev.filter((_, j) => j !== i) : prev))}>✕</button>
          </div>
        ))}
        {fns.length < MAX_FNS && (
          <button type="button" className="btn fn-add" onClick={() => mutate((prev) => [...prev, { expr: '' }])}>+ Add function</button>
        )}
      </div>
      <PlotCanvas fns={compiled} colors={FN_COLORS} />
      <p className="dim plot-hint">Scroll to zoom · drag to pan · double-click to reset · hover to trace</p>
    </div>
  );
}
