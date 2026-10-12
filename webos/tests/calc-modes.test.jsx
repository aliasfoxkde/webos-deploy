// Calculator mode surfaces — the five tabs of Calculator.jsx driven through
// real clicks/typing: Standard + Display + BasicKeys (memory, hotkeys,
// history tape), Scientific (2nd, angle cycle, ans), Graphing (editor CRUD +
// invalid-expression flagging + persistence), Programmer (bases, word sizes,
// disabled digits, = re-entry), Converter (categories, temperature special
// case, swap, — on garbage). PlotCanvas gets the same recording-proxy ctx the
// plot-canvas suite uses; mode logic is asserted against the real engine.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import Calculator from '../src/apps/calculator/Calculator.jsx';
import Keypad from '../src/apps/calculator/Keypad.jsx';

// happy-dom has no canvas 2d context — a recording Proxy stands in.
const ctx = new Proxy({}, {
  get(_, prop) {
    if (prop === 'canvas') return undefined;
    return () => {};
  },
  set() { return true; },
});
vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(ctx);
if (!window.ResizeObserver) {
  window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}

let utils;
const mount = () => { utils = render(<Calculator />); return utils; };
const q = (sel) => utils.container.querySelector(sel);
const qa = (sel) => [...utils.container.querySelectorAll(sel)];
const key = (label, sel = 'button') => qa(sel).find((b) => b.textContent === label);
const press = (label, sel) => act(() => { fireEvent.click(key(label, sel)); });
const type = (c, value, label) =>
  act(() => { fireEvent.change(qa(`${c} input`).find((i) => i.getAttribute('aria-label') === label), { target: { value } }); });
const keydown = (k) => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: k })); });

beforeEach(() => {
  localStorage.clear();
  cleanup();
});
afterEach(() => { cleanup(); });

describe('shell + Standard mode', () => {
  it('mode tabs swap surfaces, mark aria-selected, and persist', () => {
    mount();
    const tabs = qa('[role="tab"]');
    expect(tabs.map((t) => t.textContent)).toEqual(['Standard', 'Scientific', 'Graphing', 'Programmer', 'Converter']);
    act(() => { fireEvent.click(tabs[1]); });
    expect(qa('[role="tab"]')[1].getAttribute('aria-selected')).toBe('true');
    expect(utils.container.querySelector('.sci-pad')).toBeTruthy();
    expect(JSON.parse(localStorage.getItem('webos.calc.mode'))).toBe('scientific');
    act(() => { fireEvent.click(qa('[role="tab"]')[4]); });
    expect(utils.container.querySelector('.conv-mode')).toBeTruthy();
  });

  it('digits + operators evaluate; the tape records; a row click reuses its result', () => {
    mount();
    const entry = () => q('input[aria-label="Expression"]');
    expect(q('.calc-history')).toBeNull(); // empty tape renders nothing
    for (const l of ['1', '+', '2']) press(l);
    expect(entry().value).toBe('1+2');
    expect(q('.calc-preview').textContent).toBe('3'); // live preview
    press('=');
    expect(entry().value).toBe('3');
    const tape = q('.calc-history');
    expect(tape.textContent).toContain('History (1)');
    act(() => { fireEvent.click(qa('.calc-hist-row')[0]); });
    expect(entry().value).toBe('3'); // clicked row re-entered the result
  });

  it('memory register: MS shows M, MR recalls, M+/M− accumulate, MC clears', () => {
    mount();
    const entry = () => q('input[aria-label="Expression"]');
    for (const l of ['5', 'MS']) press(l);
    expect(q('.calc-status').textContent).toContain('M');
    press('C');
    press('MR');
    expect(entry().value).toBe('5'); // MR appends the register
    // M+/M− evaluate the current entry, so clear before entering operands
    press('C');
    press('2');
    press('M+'); // 5 + 2
    press('C');
    press('MR');
    expect(entry().value).toBe('7');
    press('C');
    press('3');
    press('M−'); // 7 - 3
    press('C');
    press('MR');
    expect(entry().value).toBe('4');
    press('MC');
    expect(q('.calc-status').textContent).not.toContain('M');
  });

  it('± negates plain and compound entries; ⌫/CE/C clear; hotkeys work', () => {
    mount();
    const entry = () => q('input[aria-label="Expression"]');
    press('5');
    press('±');
    expect(entry().value).toBe('-5');
    press('±');
    expect(entry().value).toBe('5');
    press('C');
    for (const l of ['1', '+', '2', '±']) press(l);
    expect(entry().value).toBe('-(1+2)'); // compound entries wrap
    press('⌫');
    expect(entry().value).toBe('-(1+2');
    keydown('Escape'); // global hotkey → clear
    expect(entry().value).toBe('');
    for (const l of ['9', '9']) press(l);
    press('CE');
    expect(entry().value).toBe('');
    press('9');
    keydown('Enter'); // global hotkey → equals
    expect(entry().value).toBe('9');
  });

  it('a digit typed right after = starts a fresh entry; an operator continues', () => {
    mount();
    const entry = () => q('input[aria-label="Expression"]');
    for (const l of ['4', '=']) press(l);
    press('2');
    expect(entry().value).toBe('2'); // replaced, not appended
    press('+');
    expect(entry().value).toBe('2+'); // appended
  });

  it('bad input surfaces the error line instead of crashing', () => {
    mount();
    const entry = () => q('input[aria-label="Expression"]');
    act(() => { fireEvent.change(entry(), { target: { value: '2÷0' } }); });
    press('=');
    expect(q('.calc-err').textContent).toBe('Division by zero');
  });
});

describe('Scientific mode', () => {
  const toSci = () => {
    mount();
    act(() => { fireEvent.click(qa('[role="tab"]').find((t) => t.textContent === 'Scientific')); });
  };

  it('trig respects the angle mode through the shared engine', () => {
    toSci();
    const entry = () => q('input[aria-label="Expression"]');
    for (const l of ['sin', '3', '0', ')', '=']) press(l);
    expect(entry().value).toBe('0.5'); // sin(30°)
    const angle = key('DEG');
    act(() => { fireEvent.click(angle); }); // DEG → RAD
    expect(key('RAD')).toBeTruthy();
    act(() => { fireEvent.change(entry(), { target: { value: 'cos(0)' } }); });
    press('=');
    expect(entry().value).toBe('1');
    act(() => { fireEvent.click(key('RAD')); }); // RAD → GRAD
    expect(key('GRAD')).toBeTruthy();
  });

  it('2nd flips the trig/power rows to their inverses', () => {
    toSci();
    expect(key('sin')).toBeTruthy();
    press('2nd');
    expect(key('2nd✓')).toBeTruthy();
    expect(key('sin⁻¹')).toBeTruthy();
    expect(key('x³')).toBeTruthy(); // power row swapped too
    expect(key('sin')).toBeUndefined();
  });

  it('constants and ans insert into the entry', () => {
    toSci();
    const entry = () => q('input[aria-label="Expression"]');
    press('π');
    expect(entry().value).toBe('π');
    press('C');
    press('e');
    expect(entry().value).toBe('e');
    press('C');
    act(() => { fireEvent.change(entry(), { target: { value: '2^8' } }); });
    press('=');
    press('ans'); // inserts the formatted last answer
    expect(entry().value).toBe('256');
    press('C');
    press('x²');
    expect(entry().value).toBe('^2');
  });
});

describe('Graphing mode', () => {
  const toGraph = () => {
    mount();
    act(() => { fireEvent.click(qa('[role="tab"]').find((t) => t.textContent === 'Graphing')); });
  };
  const row = (i) => qa('.fn-row')[i];
  const exprInput = (i) => row(i).querySelector('input');

  it('ships two starter functions and persists edits under webos.calc.graph', () => {
    toGraph();
    expect(qa('.fn-row')).toHaveLength(2);
    expect(exprInput(0).value).toBe('sin(x)');
    expect(row(0).className).not.toContain('bad');
    act(() => { fireEvent.change(exprInput(1), { target: { value: 'x' } }); });
    const saved = JSON.parse(localStorage.getItem('webos.calc.graph'));
    expect(saved).toEqual([{ expr: 'sin(x)' }, { expr: 'x' }]);
  });

  it('flags invalid expressions on the row without breaking the rest', () => {
    toGraph();
    act(() => { fireEvent.change(exprInput(0), { target: { value: 'sin(' } }); });
    expect(row(0).className).toContain('bad');
    expect(row(0).title).toBeTruthy(); // the engine error, shown as tooltip
    expect(row(1).className).not.toContain('bad');
    expect(row(1).querySelector('.fn-dot').style.background).not.toBe('rgb(248, 113, 113)');
  });

  it('add up to six functions, remove down to one, never past the edges', () => {
    toGraph();
    const add = () => key('+ Add function');
    for (let i = 0; i < 4; i += 1) act(() => { fireEvent.click(add()); }); // 2 → 6
    expect(qa('.fn-row')).toHaveLength(6);
    expect(add()).toBeUndefined(); // + button gone at MAX_FNS
    for (let i = 0; i < 5; i += 1) act(() => { fireEvent.click(row(0).querySelector('button[title="Remove"]')); });
    expect(qa('.fn-row')).toHaveLength(1);
    const last = qa('.fn-row')[0];
    act(() => { fireEvent.click(last.querySelector('button[title="Remove"]')); }); // guarded no-op
    expect(qa('.fn-row')).toHaveLength(1);
  });

  it('restores the persisted function list on the next mount', () => {
    localStorage.setItem('webos.calc.graph', JSON.stringify([{ expr: 'cos(x)' }]));
    toGraph();
    expect(qa('.fn-row')).toHaveLength(1);
    expect(exprInput(0).value).toBe('cos(x)');
    // corrupt store → fresh defaults instead of a crash
    cleanup();
    localStorage.setItem('webos.calc.graph', '{not json');
    mount();
    act(() => { fireEvent.click(qa('[role="tab"]').find((t) => t.textContent === 'Graphing')); });
    expect(qa('.fn-row')).toHaveLength(2);
    expect(exprInput(0).value).toBe('sin(x)');
  });
});

describe('Programmer mode', () => {
  const toProg = () => {
    mount();
    act(() => { fireEvent.click(qa('[role="tab"]').find((t) => t.textContent === 'Programmer')); });
  };
  const entry = () => q('input[aria-label="Programmer expression"]');
  const baseVals = () => Object.fromEntries(qa('.prog-base-row').map((r) => {
    const [label, val] = [r.querySelector('button').textContent, r.querySelector('.prog-val').textContent];
    return [label, val];
  }));

  it('evaluates in the current base and shows the value in all four', () => {
    toProg();
    // '^' is XOR here and '+' binds tighter: 2^(3+1) = 2 xor 4 = 6
    act(() => { fireEvent.change(entry(), { target: { value: '2^3+1' } }); });
    const b = baseVals();
    expect(b.HEX).toBe('6');
    expect(b.DEC).toBe('6');
    expect(b.OCT).toBe('6');
    expect(b.BIN).toBe('110');
    expect(q('.calc-ind').textContent).toBe('64-bit');
  });

  it('= re-enters the result in the active base; ⌫ trims; errors show inline', () => {
    toProg();
    act(() => { fireEvent.click(key('HEX', '.seg-btn')); }); // base → 16
    act(() => { fireEvent.change(entry(), { target: { value: 'FF' } }); });
    press('=', '.prog-pad .key');
    expect(entry().value).toBe('FF'); // 255 shown as hex, groups of 4 → no spaces at len 2
    press('⌫', '.prog-pad .key');
    expect(entry().value).toBe('F');
    act(() => { fireEvent.change(entry(), { target: { value: '1+' } }); });
    expect(q('.calc-err')).toBeTruthy(); // 'Unexpected end of expression'
  });

  it('digits past the active base are disabled', () => {
    toProg();
    const padKey = (label) => qa('.prog-pad .key').find((b) => b.textContent === label);
    act(() => { fireEvent.click(key('BIN', '.seg-btn')); }); // base 2
    expect(padKey('1').disabled).toBe(false);
    expect(padKey('2').disabled).toBe(true);
    expect(padKey('9').disabled).toBe(true);
    expect(padKey('F').disabled).toBe(true);
    expect(padKey('0').disabled).toBe(false); // the wide zero
    act(() => { fireEvent.click(key('DEC', '.seg-btn')); }); // base 10
    expect(padKey('9').disabled).toBe(false);
    expect(padKey('F').disabled).toBe(true);
    act(() => { fireEvent.click(key('HEX', '.seg-btn')); }); // base 16
    expect(padKey('F').disabled).toBe(false);
  });

  it('word size buttons update the width indicator and wraparound', () => {
    toProg();
    act(() => { fireEvent.click(qa('[aria-label="Word size"] .seg-btn').find((b) => b.textContent === '8')); });
    expect(q('.calc-ind').textContent).toBe('8-bit');
    act(() => { fireEvent.change(entry(), { target: { value: '255+1' } }); });
    const b = baseVals();
    expect(b.DEC).toBe('0'); // 256 mod 2^8 → all bits clear in 8-bit two's complement
  });
});

describe('Converter mode', () => {
  const toConv = () => {
    mount();
    act(() => { fireEvent.click(qa('[role="tab"]').find((t) => t.textContent === 'Converter')); });
  };
  const result = () => q('.conv-result').textContent;
  const formula = () => q('.conv-formula').textContent;
  const setVal = (v) => type('.conv-mode', v, 'Value');
  const pick = (cat) => act(() => { fireEvent.click(qa('.conv-cats .chip').find((b) => b.textContent === cat)); });
  const choose = (label, unit) => act(() => {
    fireEvent.change(q('select[aria-label="' + label + '"]'), { target: { value: unit } });
  });

  it('converts Length defaults (1 m → ft) and the formula line', () => {
    toConv();
    expect(result()).toBe('3.280839895'); // 1 meter in feet
    expect(formula()).toBe('1 Meters = 3.280839895 Feet');
  });

  it('temperature uses the special-case offsets both ways', () => {
    toConv();
    pick('Temperature');
    choose('From unit', 'Celsius');
    choose('To unit', 'Fahrenheit');
    setVal('100');
    expect(result()).toBe('212');
    expect(formula()).toBe('100 Celsius = 212 Fahrenheit');
    choose('To unit', 'Kelvin');
    setVal('-40');
    expect(parseFloat(result())).toBeCloseTo(233.15, 3);
    expect(parseFloat(formula().split('=')[1])).toBeCloseTo(233.15, 3);
  });

  it('swap exchanges the units and recomputes', () => {
    toConv();
    setVal('1');
    act(() => { fireEvent.click(q('.conv-swap')); });
    expect(result()).toBe('0.3048'); // 1 foot in meters
    expect(formula()).toBe('1 Feet = 0.3048 Meters');
  });

  it('non-numeric input shows — and hides the formula', () => {
    toConv();
    setVal('abc');
    expect(result()).toBe('—');
    expect(q('.conv-formula')).toBeNull();
  });

  it('tiny magnitudes format exponentially; category switch resets the units', () => {
    toConv();
    pick('Data');
    choose('From unit', 'Bytes');
    choose('To unit', 'Tebibytes');
    setVal('1');
    expect(result()).toContain('e-'); // 1/2^40 → exponential
    pick('Length');
    expect(q('select[aria-label="From unit"]').value).toBe('Millimeters');
    expect(q('select[aria-label="To unit"]').value).toBe('Centimeters');
    setVal('1');
    expect(result()).toBe('0.1');
  });
});

describe('Keypad primitive', () => {
  it('renders keys with kind/wide/sub/disabled/title passthrough', () => {
    const { container } = render(
      <Keypad
        columns={2}
        className="extra"
        keys={[
          { label: 'A', kind: 'num' },
          { label: 'B', kind: 'op', wide: true, title: 'bee' },
          { label: 'C', sub: 'small', disabled: true },
        ]}
      />
    );
    const keys = [...container.querySelectorAll('button')];
    expect(container.firstElementChild.className).toBe('keypad extra');
    expect(keys[0].className).toBe('key num ');
    expect(keys[1].className).toContain('wide');
    expect(keys[1].title).toBe('bee');
    expect(keys[2].disabled).toBe(true);
    expect(keys[2].querySelector('small').textContent).toBe('small');
  });
});
