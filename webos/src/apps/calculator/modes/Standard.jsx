import React from 'react';
import { useCalc, useCalcHotkeys } from '../calcState.jsx';
import Display from '../Display.jsx';
import BasicKeys from '../BasicKeys.jsx';
import History from './History.jsx';

export default function Standard() {
  const calc = useCalc();
  useCalcHotkeys(true, { equals: calc.equals, clear: calc.clear });

  return (
    <div className="calc-mode">
      <Display />
      <BasicKeys />
      <History />
    </div>
  );
}
