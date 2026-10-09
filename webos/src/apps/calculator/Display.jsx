import React, { useEffect, useRef } from 'react';
import { useCalc } from './calcState.jsx';

// Expression display: free-form editable input, live result preview and
// status line (memory / angle / error).
export default function Display() {
  const calc = useCalc();
  const ref = useRef(null);

  useEffect(() => { ref.current?.focus(); }, []);

  return (
    <div className="calc-display">
      <div className="calc-status">
        {calc.memory !== 0 && <span className="calc-ind">M</span>}
        <span className="calc-ind">{calc.angle.toUpperCase()}</span>
        {calc.precision !== 'auto' && <span className="calc-ind">P:{calc.precision}</span>}
        {calc.error ? <span className="calc-err">{calc.error}</span> : null}
      </div>
      <input
        ref={ref}
        className="calc-entry"
        value={calc.entry}
        onChange={(e) => calc.setEntry(e.target.value)}
        placeholder="0"
        aria-label="Expression"
        spellCheck="false"
        autoComplete="off"
      />
      <div className="calc-preview" aria-live="polite">{calc.preview}</div>
    </div>
  );
}
