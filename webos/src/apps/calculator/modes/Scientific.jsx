import React, { useState } from 'react';
import { useCalc, useCalcHotkeys } from '../calcState.jsx';
import Display from '../Display.jsx';
import BasicKeys from '../BasicKeys.jsx';
import History from './History.jsx';

// Scientific: trig/hyperbolic via a 2nd toggle, logs, powers, roots,
// constants, angle mode. Everything funnels into the shared expression entry.
export default function Scientific() {
  const calc = useCalc();
  const [second, setSecond] = useState(false);
  useCalcHotkeys(true, { equals: calc.equals, clear: calc.clear });

  const ins = (text) => () => calc.input(text);

  const trig = second
    ? [
        { label: 'sin⁻¹', onClick: ins('asin('), title: 'Arcsine' },
        { label: 'cos⁻¹', onClick: ins('acos('), title: 'Arccosine' },
        { label: 'tan⁻¹', onClick: ins('atan('), title: 'Arctangent' },
        { label: 'eˣ', onClick: ins('exp('), title: 'e to the x' },
        { label: '10ˣ', onClick: ins('10^('), title: '10 to the x' },
      ]
    : [
        { label: 'sin', onClick: ins('sin(') },
        { label: 'cos', onClick: ins('cos(') },
        { label: 'tan', onClick: ins('tan(') },
        { label: 'ln', onClick: ins('ln('), title: 'Natural log' },
        { label: 'log', onClick: ins('log('), title: 'Log base 10' },
      ];

  const power = second
    ? [
        { label: 'x³', onClick: ins('^3'), title: 'Cube' },
        { label: 'ʸ√x', onClick: ins('root('), title: 'y-th root (x first, then , y)' },
        { label: '³√', onClick: ins('cbrt('), title: 'Cube root' },
        { label: '2ˣ', onClick: ins('2^('), title: '2 to the x' },
        { label: 'ˣ', onClick: ins('^'), title: 'Exponent' },
      ]
    : [
        { label: 'x²', onClick: ins('^2'), title: 'Square' },
        { label: 'xʸ', onClick: ins('^'), title: 'Power' },
        { label: '√', onClick: ins('sqrt('), title: 'Square root' },
        { label: '1/x', onClick: ins('^(-1)'), title: 'Reciprocal' },
        { label: 'n!', onClick: ins('!'), title: 'Factorial' },
      ];

  const topRow = [
    { label: '(', kind: 'util', onClick: ins('(') },
    { label: ')', kind: 'util', onClick: ins(')') },
    { label: 'mod', kind: 'util', onClick: ins(' mod '), title: 'Modulo' },
    { label: second ? '2nd✓' : '2nd', kind: `util ${second ? 'toggled' : ''}`, onClick: () => setSecond((v) => !v), title: 'Inverse functions' },
    {
      label: calc.angle === 'deg' ? 'DEG' : calc.angle === 'rad' ? 'RAD' : 'GRAD',
      kind: 'util toggled',
      onClick: () => calc.setAngle(calc.angle === 'deg' ? 'rad' : calc.angle === 'rad' ? 'grad' : 'deg'),
      title: 'Angle unit (deg → rad → grad)',
    },
  ];

  const constRow = [
    { label: 'π', onClick: ins('π'), title: 'Pi' },
    { label: 'e', onClick: ins('e'), title: "Euler's number" },
    { label: 'EXP', onClick: ins('e'), title: 'Exponent (×10^)' },
    { label: 'ans', onClick: () => calc.input(formatAns(calc.ans)), title: 'Last answer' },
    { label: 'abs', onClick: ins('abs('), title: 'Absolute value' },
  ];

  const grid = [...topRow, ...trig, ...power, ...constRow];

  return (
    <div className="calc-mode">
      <Display />
      <div className="keypad sci-pad" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {grid.map((key, i) => (
          <button
            key={i}
            type="button"
            className={`key sci ${key.kind || 'fn'} ${key.toggled ? 'toggled' : ''}`}
            onClick={key.onClick}
            title={key.title || undefined}
          >
            {key.label}
          </button>
        ))}
      </div>
      <BasicKeys />
      <History />
    </div>
  );
}

function formatAns(v) {
  if (Number.isInteger(v) && Math.abs(v) < 1e15) return String(v);
  return String(parseFloat(v.toPrecision(13)));
}
