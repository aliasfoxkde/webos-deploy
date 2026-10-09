import React from 'react';
import { useCalc } from './calcState.jsx';

// The memory row + standard 4-column block, shared by Standard and Scientific.
export default function BasicKeys() {
  const calc = useCalc();
  const ins = (text) => () => calc.input(text);

  const memKeys = [
    ['MC', 'Clear memory', calc.memClear],
    ['MR', 'Recall memory', calc.memRecall],
    ['M+', 'Add to memory', calc.memAdd],
    ['M−', 'Subtract from memory', calc.memSub],
    ['MS', 'Store in memory', calc.memStore],
  ];

  const keys = [
    { label: '%', kind: 'util', onClick: ins('%'), title: 'Percent' },
    { label: 'CE', kind: 'util', onClick: calc.clear, title: 'Clear entry' },
    { label: 'C', kind: 'util danger', onClick: calc.clear, title: 'Clear all' },
    { label: '⌫', kind: 'util', onClick: calc.backspace, title: 'Backspace' },
    { label: '7', kind: 'num', onClick: ins('7') },
    { label: '8', kind: 'num', onClick: ins('8') },
    { label: '9', kind: 'num', onClick: ins('9') },
    { label: '÷', kind: 'op', onClick: ins('÷') },
    { label: '4', kind: 'num', onClick: ins('4') },
    { label: '5', kind: 'num', onClick: ins('5') },
    { label: '6', kind: 'num', onClick: ins('6') },
    { label: '×', kind: 'op', onClick: ins('×') },
    { label: '1', kind: 'num', onClick: ins('1') },
    { label: '2', kind: 'num', onClick: ins('2') },
    { label: '3', kind: 'num', onClick: ins('3') },
    { label: '−', kind: 'op', onClick: ins('−') },
    { label: '±', kind: 'util', onClick: calc.negate, title: 'Negate' },
    { label: '0', kind: 'num', onClick: ins('0') },
    { label: '.', kind: 'num', onClick: ins('.') },
    { label: '+', kind: 'op', onClick: ins('+') },
    { label: '=', kind: 'eq', onClick: calc.equals, wide: true },
  ];

  return (
    <>
      <div className="keypad mem-row" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {memKeys.map(([label, title, onClick]) => (
          <button key={label} type="button" className="key mem" onClick={onClick} title={title}>{label}</button>
        ))}
      </div>
      <div className="keypad" style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
        {keys.map((key, i) => (
          <button
            key={i}
            type="button"
            className={`key ${key.kind} ${key.wide ? 'wide' : ''}`}
            onClick={key.onClick}
            title={key.title || undefined}
          >
            {key.label}
          </button>
        ))}
      </div>
    </>
  );
}
