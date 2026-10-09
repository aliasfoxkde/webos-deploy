import React, { createContext, useContext, useEffect, useMemo, useReducer } from 'react';
import { CalcError, evaluateExpression, formatNumber } from './engine/index.js';

// Calculator-wide state: entry, live preview, history tape, memory register,
// angle mode and precision. Preferences + history persist under webos.calc.*.
// Mode components stay presentational and talk to the OS through useCalc().

function load(key, fallback) {
  try {
    const raw = localStorage.getItem(`webos.calc.${key}`);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function save(key, value) {
  try { localStorage.setItem(`webos.calc.${key}`, JSON.stringify(value)); } catch { /* private mode */ }
}

const VALUE_START = /^[0-9.]/;

function initial() {
  return {
    mode: load('mode', 'standard'),
    entry: '',
    error: null,
    ans: load('ans', 0),
    history: load('history', []),
    memory: load('memory', 0),
    angle: load('angle', 'deg'),
    precision: load('precision', 'auto'),
    justEvaluated: false,
  };
}

// Balance unclosed parens so "sin(" or "2*(3+" still evaluate on =.
function balance(entry) {
  let opens = 0;
  for (const ch of entry) {
    if (ch === '(') opens++;
    else if (ch === ')') opens--;
  }
  return opens > 0 ? entry + ')'.repeat(opens) : entry;
}

function compute(entry, angle) {
  return evaluateExpression(balance(entry), { angle });
}

function reducer(state, action) {
  switch (action.type) {
    case 'setMode': {
      save('mode', action.mode);
      return { ...state, mode: action.mode, error: null };
    }
    case 'setEntry':
      return { ...state, entry: action.entry, error: null, justEvaluated: false };
    case 'input': {
      const text = action.text;
      const entry = state.justEvaluated && VALUE_START.test(text) ? text : state.entry + text;
      return { ...state, entry, error: null, justEvaluated: false };
    }
    case 'backspace': {
      if (state.justEvaluated) return { ...state, entry: '', justEvaluated: false, error: null };
      return { ...state, entry: state.entry.slice(0, -1), error: null };
    }
    case 'clear':
      return { ...state, entry: '', error: null, justEvaluated: false };
    case 'equals': {
      if (!state.entry.trim()) return state;
      try {
        const value = compute(state.entry, state.angle);
        if (Number.isNaN(value)) throw new CalcError('Not a number');
        const formatted = formatNumber(value, { precision: state.precision, grouping: false });
        const history = [{ expr: state.entry, result: formatted }, ...state.history].slice(0, 60);
        save('history', history);
        save('ans', value);
        return { ...state, entry: formatted, ans: value, history, error: null, justEvaluated: true };
      } catch (err) {
        return { ...state, error: err instanceof CalcError ? err.message : 'Invalid expression' };
      }
    }
    case 'negate': {
      const e = state.entry.trim();
      if (!e) return state;
      if (/^-[\d.]+$/.test(e)) return { ...state, entry: e.slice(1), justEvaluated: false };
      if (/^[\d.]+$/.test(e)) return { ...state, entry: '-' + e, justEvaluated: false };
      return { ...state, entry: `-(${balance(e)})`, justEvaluated: false };
    }
    case 'memClear':
      save('memory', 0);
      return { ...state, memory: 0 };
    case 'memStore': {
      const v = compute(state.entry, state.angle);
      if (!Number.isNaN(v)) { save('memory', v); return { ...state, memory: v }; }
      return state;
    }
    case 'memAdd':
    case 'memSub': {
      const v = compute(state.entry, state.angle);
      if (Number.isNaN(v)) return state;
      const memory = action.type === 'memAdd' ? state.memory + v : state.memory - v;
      save('memory', memory);
      return { ...state, memory };
    }
    case 'memRecall':
      return { ...state, entry: state.entry + formatNumber(state.memory, { grouping: false }), justEvaluated: false, error: null };
    case 'setAngle':
      save('angle', action.angle);
      return { ...state, angle: action.angle };
    case 'setPrecision':
      save('precision', action.precision);
      return { ...state, precision: action.precision };
    case 'clearHistory':
      save('history', []);
      return { ...state, history: [] };
    default:
      return state;
  }
}

const CalcCtx = createContext(null);

export function CalcProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, initial);

  const preview = useMemo(() => {
    if (!state.entry.trim() || state.justEvaluated) return '';
    try {
      const v = compute(state.entry, state.angle);
      if (Number.isNaN(v) || !Number.isFinite(v)) return '';
      const f = formatNumber(v, { precision: state.precision });
      return f === state.entry ? '' : f;
    } catch {
      return '';
    }
  }, [state.entry, state.angle, state.precision, state.justEvaluated]);

  const api = useMemo(() => ({
    ...state,
    preview,
    input: (text) => dispatch({ type: 'input', text }),
    setEntry: (entry) => dispatch({ type: 'setEntry', entry }),
    backspace: () => dispatch({ type: 'backspace' }),
    clear: () => dispatch({ type: 'clear' }),
    equals: () => dispatch({ type: 'equals' }),
    negate: () => dispatch({ type: 'negate' }),
    memClear: () => dispatch({ type: 'memClear' }),
    memStore: () => dispatch({ type: 'memStore' }),
    memAdd: () => dispatch({ type: 'memAdd' }),
    memSub: () => dispatch({ type: 'memSub' }),
    memRecall: () => dispatch({ type: 'memRecall' }),
    setMode: (mode) => dispatch({ type: 'setMode', mode }),
    setAngle: (angle) => dispatch({ type: 'setAngle', angle }),
    setPrecision: (precision) => dispatch({ type: 'setPrecision', precision }),
    clearHistory: () => dispatch({ type: 'clearHistory' }),
  }), [state, preview]);

  return <CalcCtx.Provider value={api}>{children}</CalcCtx.Provider>;
}

export function useCalc() {
  return useContext(CalcCtx);
}

// Global hotkeys for the expression modes; character entry happens natively
// in the display input.
export function useCalcHotkeys(enabled, { equals, clear }) {
  useEffect(() => {
    if (!enabled) return;
    const h = (e) => {
      const tag = e.target?.tagName;
      if (tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === 'Enter') { e.preventDefault(); equals(); }
      else if (e.key === 'Escape') { e.preventDefault(); clear(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [enabled, equals, clear]);
}
