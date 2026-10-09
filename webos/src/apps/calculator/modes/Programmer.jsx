import React, { useMemo, useState } from 'react';
import { CalcError } from '../engine/index.js';
import { evalProgrammer, toBaseString } from '../engine/programmer.js';

// Programmer: fixed-width two's-complement bitwise arithmetic with a live
// result shown in all four bases.
const BASES = [
  { id: 16, label: 'HEX' },
  { id: 10, label: 'DEC' },
  { id: 8, label: 'OCT' },
  { id: 2, label: 'BIN' },
];
const WORDS = [8, 16, 32, 64];

export default function Programmer() {
  const [base, setBase] = useState(10);
  const [bits, setBits] = useState(64);
  const [entry, setEntry] = useState('');
  const [error, setError] = useState(null);

  const value = useMemo(() => {
    if (!entry.trim()) return { v: 0n, error: null };
    try {
      return { v: evalProgrammer(entry, base, bits), error: null };
    } catch (err) {
      return { v: null, error: err instanceof CalcError ? err.message : 'Invalid expression' };
    }
  }, [entry, base, bits]);

  const ins = (text) => setEntry((e) => e + text);

  const digitValue = (ch) => parseInt(ch, 16);

  const rows = [
    ['<<', '>>', '&', '|', '~'],
    ['A', 'B', 'C', '(', ')'],
    ['D', 'E', 'F', '×', '÷'],
    ['7', '8', '9', '−', '%'],
    ['4', '5', '6', '+', '^'],
    ['1', '2', '3', '⌫', '='],
    ['0'],
  ];

  const onKey = (label) => {
    if (label === '⌫') return setEntry((e) => e.slice(0, -1));
    if (label === '=') {
      if (value.error || value.v === null) return;
      setEntry(toBaseString(value.v, base, bits).replace(/ /g, ''));
      setError(null);
      return;
    }
    ins(label);
  };

  const keyDisabled = (label) => /^[0-9A-F]$/.test(label) && digitValue(label) >= base;

  return (
    <div className="calc-mode prog-mode">
      <div className="prog-controls">
        <div className="seg" role="group" aria-label="Base">
          {BASES.map((b) => (
            <button key={b.id} type="button" className={`seg-btn ${base === b.id ? 'on' : ''}`} onClick={() => setBase(b.id)}>{b.label}</button>
          ))}
        </div>
        <div className="seg" role="group" aria-label="Word size">
          {WORDS.map((w) => (
            <button key={w} type="button" className={`seg-btn ${bits === w ? 'on' : ''}`} onClick={() => setBits(w)}>{w}</button>
          ))}
        </div>
      </div>

      <div className="calc-display">
        <div className="calc-status">
          {error || value.error ? <span className="calc-err">{error || value.error}</span> : <span className="calc-ind">{bits}-bit</span>}
        </div>
        <input
          className="calc-entry"
          value={entry}
          onChange={(e) => setEntry(e.target.value)}
          placeholder="0"
          aria-label="Programmer expression"
          spellCheck="false"
          autoComplete="off"
        />
        <div className="calc-preview">{value.v !== null && !error ? toBaseString(value.v, base, bits) : ''}</div>
      </div>

      <div className="prog-bases">
        {BASES.map((b) => (
          <div key={b.id} className="prog-base-row">
            <button type="button" className="seg-btn mini" onClick={() => setBase(b.id)}>{b.label}</button>
            <span className={`prog-val ${base === b.id ? 'active' : ''}`}>{value.v !== null ? toBaseString(value.v, b.id, bits) : '—'}</span>
          </div>
        ))}
      </div>

      <div className="keypad prog-pad" style={{ gridTemplateColumns: 'repeat(5, 1fr)' }}>
        {rows.flat().map((label, i) => {
          if (label === '0') {
            return (
              <button key={i} type="button" className="key num wide" disabled={keyDisabled(label)} onClick={() => onKey(label)} style={{ gridColumn: '1 / 6' }}>0</button>
            );
          }
          const kind = /[0-9A-F]/.test(label) ? 'num' : label === '=' ? 'eq' : 'op';
          return (
            <button
              key={i}
              type="button"
              className={`key ${kind}`}
              disabled={keyDisabled(label)}
              onClick={() => onKey(label)}
              title={label === '^' ? 'XOR' : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
