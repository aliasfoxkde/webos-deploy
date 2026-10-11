// calcState.jsx — the calculator-wide provider: entry/equals/history/memory
// flows, persistence, live preview, and the global hotkeys hook.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';
import { CalcProvider, useCalc, useCalcHotkeys } from '../src/apps/calculator/calcState.jsx';

let cur;
const Probe = () => {
  // test probe: capture the live calc context for assertions after act()
  // eslint-disable-next-line react-hooks/globals
  cur = useCalc();
  return null;
};
const mount = () => render(<CalcProvider><Probe /></CalcProvider>);
const type = (text) => act(() => { cur.input(text); });
const stored = (k) => JSON.parse(localStorage.getItem(`webos.calc.${k}`));

beforeEach(() => {
  localStorage.clear();
  cleanup();
});

describe('entry + equals', () => {
  it('inputs concatenate, clear empties, backspace trims', () => {
    mount();
    type('12');
    type('3');
    expect(cur.entry).toBe('123');
    act(() => { cur.backspace(); });
    expect(cur.entry).toBe('12');
    act(() => { cur.clear(); });
    expect(cur.entry).toBe('');
  });

  it('equals formats the result onto the entry tape and persists ans', () => {
    mount();
    type('2+3*4');
    act(() => { cur.equals(); });
    expect(cur.entry).toBe('14');
    expect(cur.ans).toBe(14);
    expect(cur.justEvaluated).toBe(true);
    expect(cur.history[0]).toEqual({ expr: '2+3*4', result: '14' });
    expect(stored('ans')).toBe(14);
    expect(stored('history')[0].result).toBe('14');
  });

  it('equals balances unclosed parens: (2+3 evaluates to 5', () => {
    mount();
    type('(2+3');
    act(() => { cur.equals(); });
    expect(cur.entry).toBe('5');
  });

  it('a digit after equals starts fresh; an operator continues', () => {
    mount();
    type('5');
    act(() => { cur.equals(); });
    type('2');
    expect(cur.entry).toBe('2');
    act(() => { cur.clear(); type('5'); act(() => cur.equals()); type('+'); type('1'); });
    expect(cur.entry).toBe('5+1');
  });

  it('errors surface CalcError messages; non-calc errors are generic', () => {
    mount();
    type('1/0');
    act(() => { cur.equals(); });
    expect(cur.error).toBe('Division by zero');
    act(() => { cur.clear(); });
    type('2+');
    act(() => { cur.equals(); });
    expect(cur.error).toBeTruthy();
    act(() => { cur.clear(); });
    // NaN result (fact(-1)) is rejected as 'Not a number'
    type('fact(-1)');
    act(() => { cur.equals(); });
    expect(cur.error).toBe('Not a number');
    expect(cur.entry).toBe('fact(-1)'); // failed entry stays editable
  });

  it('empty equals is a no-op; history caps at 60', () => {
    mount();
    act(() => { cur.equals(); });
    expect(cur.history).toEqual([]);
    for (let i = 0; i < 65; i++) {
      act(() => { cur.setEntry(`1+${i}`); cur.equals(); });
    }
    expect(cur.history.length).toBe(60);
    expect(cur.history[0].expr).toBe('1+64');
  });

  it('negate: empty no-op, plain number toggles, expression wraps', () => {
    mount();
    act(() => { cur.negate(); });
    expect(cur.entry).toBe('');
    type('5');
    act(() => { cur.negate(); });
    expect(cur.entry).toBe('-5');
    act(() => { cur.negate(); });
    expect(cur.entry).toBe('5');
    act(() => { cur.clear(); type('2+3'); act(() => cur.negate()); });
    expect(cur.entry).toBe('-(2+3)');
  });
});

describe('memory + settings', () => {
  it('store/add/sub/recall/clear with the memory register', () => {
    mount();
    type('10');
    act(() => { cur.memStore(); });
    expect(cur.memory).toBe(10);
    act(() => { cur.clear(); });
    type('5');
    act(() => { cur.memAdd(); });
    expect(cur.memory).toBe(15);
    act(() => { cur.clear(); });
    type('2');
    act(() => { cur.memSub(); });
    expect(cur.memory).toBe(13);
    act(() => { cur.clear(); });
    act(() => { cur.memRecall(); });
    expect(cur.entry).toBe('13');
    act(() => { cur.memClear(); });
    expect(cur.memory).toBe(0);
    expect(stored('memory')).toBe(0);
  });

  it('invalid entries leave memory untouched', () => {
    mount();
    type('7');
    act(() => { cur.memStore(); });
    act(() => { cur.setEntry('1/0'); });
    act(() => { cur.memAdd(); });
    expect(cur.memory).toBe(7);
  });

  it('mode/angle/precision persist; clearHistory empties the tape', () => {
    mount();
    act(() => { cur.setMode('scientific'); });
    act(() => { cur.setAngle('rad'); });
    act(() => { cur.setPrecision(4); });
    type('1+1');
    act(() => { cur.equals(); });
    expect(stored('mode')).toBe('scientific');
    expect(stored('angle')).toBe('rad');
    expect(stored('precision')).toBe(4);
    act(() => { cur.clearHistory(); });
    expect(cur.history).toEqual([]);
    expect(stored('history')).toEqual([]);
  });
});

describe('live preview', () => {
  it('shows the evaluated result while typing and hides after equals', () => {
    mount();
    type('2+');
    expect(cur.preview).toBe(''); // incomplete
    type('2');
    expect(cur.preview).toBe('4');
    act(() => { cur.equals(); });
    expect(cur.preview).toBe(''); // justEvaluated
  });

  it('an erroring entry has no preview and echoes are suppressed', () => {
    mount();
    type('1/');
    expect(cur.preview).toBe('');
    act(() => { cur.clear(); });
    type('9');
    // preview === entry → suppressed to avoid double display
    expect(cur.preview).toBe('');
  });
});

describe('useCalcHotkeys', () => {
  const Hot = ({ enabled, equals, clear }) => {
    useCalcHotkeys(enabled, { equals, clear });
    return null;
  };

  it('Enter equals and Escape clear, except in textarea/select targets', () => {
    const equals = vi.fn();
    const clear = vi.fn();
    const { rerender } = render(<Hot enabled equals={equals} clear={clear} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(equals).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledTimes(1);
    // focus inside a textarea ignores the hotkeys
    const ta = document.createElement('textarea');
    document.body.appendChild(ta);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(equals).toHaveBeenCalledTimes(1);
    rerender(<Hot enabled={false} equals={equals} clear={clear} />);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(equals).toHaveBeenCalledTimes(1); // disabled → no new calls
  });
});
