import React from 'react';
import { CalcProvider, useCalc } from './calcState.jsx';
import Standard from './modes/Standard.jsx';
import Scientific from './modes/Scientific.jsx';
import Graphing from './modes/Graphing.jsx';
import Programmer from './modes/Programmer.jsx';
import Converter from './modes/Converter.jsx';
import './calculator.css';

// Calculator plugin shell: mode tabs over the five mode surfaces. State lives
// in CalcProvider so modes stay swappable and small.
const MODES = [
  { id: 'standard', label: 'Standard' },
  { id: 'scientific', label: 'Scientific' },
  { id: 'graph', label: 'Graphing' },
  { id: 'programmer', label: 'Programmer' },
  { id: 'converter', label: 'Converter' },
];

function Shell() {
  const calc = useCalc();
  return (
    <div className="calc">
      <nav className="calc-tabs" role="tablist">
        {MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            role="tab"
            aria-selected={calc.mode === m.id}
            className={`calc-tab ${calc.mode === m.id ? 'on' : ''}`}
            onClick={() => calc.setMode(m.id)}
          >
            {m.label}
          </button>
        ))}
      </nav>
      {calc.mode === 'standard' && <Standard />}
      {calc.mode === 'scientific' && <Scientific />}
      {calc.mode === 'graph' && <Graphing />}
      {calc.mode === 'programmer' && <Programmer />}
      {calc.mode === 'converter' && <Converter />}
    </div>
  );
}

export default function Calculator() {
  return (
    <CalcProvider>
      <Shell />
    </CalcProvider>
  );
}
