import React from 'react';
import { useCalc } from '../calcState.jsx';

// Collapsible tape of recent computations; click a row to reuse its result.
export default function History() {
  const calc = useCalc();

  if (!calc.history.length) return null;
  return (
    <details className="calc-history">
      <summary>
        History <span className="dim">({calc.history.length})</span>
        <button
          type="button"
          className="tb-btn"
          title="Clear history"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); calc.clearHistory(); }}
        >
          ✕
        </button>
      </summary>
      <div className="calc-history-list">
        {calc.history.map((h, i) => (
          <button key={i} type="button" className="calc-hist-row" onClick={() => calc.input(h.result)}>
            <span className="dim">{h.expr}</span>
            <strong>{h.result}</strong>
          </button>
        ))}
      </div>
    </details>
  );
}
