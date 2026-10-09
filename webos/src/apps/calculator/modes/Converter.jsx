import React, { useMemo, useState } from 'react';

// Unit converter: factor-based categories plus a special-cased temperature.
// Units are defined relative to each category's base unit.
const CATEGORIES = {
  Length: {
    units: {
      Millimeters: 0.001, Centimeters: 0.01, Meters: 1, Kilometers: 1000,
      Inches: 0.0254, Feet: 0.3048, Yards: 0.9144, Miles: 1609.344, 'Nautical miles': 1852,
    },
  },
  Mass: {
    units: {
      Milligrams: 1e-6, Grams: 0.001, Kilograms: 1, Tonnes: 1000,
      Ounces: 0.028349523125, Pounds: 0.45359237, Stones: 6.35029318,
    },
  },
  Area: {
    units: {
      'Square meters': 1, 'Square kilometers': 1e6, Hectares: 1e4,
      'Square feet': 0.09290304, 'Square yards': 0.83612736, Acres: 4046.8564224, 'Square miles': 2589988.110336,
    },
  },
  Volume: {
    units: {
      Milliliters: 0.001, Liters: 1, 'Cubic meters': 1000,
      Teaspoons: 0.00492892159375, Tablespoons: 0.01478676478125, 'Fluid ounces': 0.0295735295625,
      Cups: 0.2365882365, Pints: 0.473176473, Quarts: 0.946352946, Gallons: 3.785411784,
    },
  },
  Speed: {
    units: {
      'Meters/second': 1, 'Kilometers/hour': 1 / 3.6, 'Miles/hour': 0.44704, Knots: 0.514444444444,
    },
  },
  Time: {
    units: {
      Milliseconds: 0.001, Seconds: 1, Minutes: 60, Hours: 3600, Days: 86400, Weeks: 604800, Years: 31557600,
    },
  },
  Data: {
    units: {
      Bits: 0.125, Bytes: 1, Kilobytes: 1e3, Kibibytes: 1024, Megabytes: 1e6, Mebibytes: 1024 ** 2,
      Gigabytes: 1e9, Gibibytes: 1024 ** 3, Terabytes: 1e12, Tebibytes: 1024 ** 4,
    },
  },
  Pressure: {
    units: { Pascals: 1, Kilopascals: 1000, Bar: 1e5, PSI: 6894.757293168, Atmospheres: 101325, Torr: 133.322368421 },
  },
  Energy: {
    units: { Joules: 1, Kilojoules: 1000, Calories: 4.184, Kilocalories: 4184, 'Watt-hours': 3600, 'Kilowatt-hours': 3.6e6, 'Electronvolts': 1.602176634e-19 },
  },
  Angle: {
    units: { Degrees: 1, Radians: 180 / Math.PI, Gradians: 0.9, Turns: 360 },
  },
  Temperature: { special: true, units: { Celsius: 1, Fahrenheit: 1, Kelvin: 1 } },
};

const fmt = (x) => {
  if (!Number.isFinite(x)) return '—';
  const a = Math.abs(x);
  if (a !== 0 && (a >= 1e12 || a < 1e-6)) return x.toExponential(6).replace(/(\.\d*?)0+e/, '$1e').replace(/\.e/, 'e');
  return String(parseFloat(x.toPrecision(10)));
};

export default function Converter() {
  const names = Object.keys(CATEGORIES);
  const [cat, setCat] = useState(names[0]);
  const [value, setValue] = useState('1');
  const [from, setFrom] = useState('Meters');
  const [to, setTo] = useState('Feet');

  const units = useMemo(() => Object.keys(CATEGORIES[cat].units), [cat]);

  const pickCat = (c) => {
    setCat(c);
    const u = Object.keys(CATEGORIES[c].units || {});
    setFrom(u[0]);
    setTo(u[1] ?? u[0]);
  };

  const result = useMemo(() => {
    const x = parseFloat(value);
    if (!Number.isFinite(x)) return null;
    if (CATEGORIES[cat].special) return convertTemperature(x, from, to);
    const table = CATEGORIES[cat].units;
    if (!(from in table) || !(to in table)) return null;
    return (x * table[from]) / table[to];
  }, [cat, value, from, to]);

  const num = parseFloat(value);

  return (
    <div className="calc-mode conv-mode">
      <div className="conv-cats">
        {names.map((c) => (
          <button key={c} type="button" className={`chip ${cat === c ? 'on' : ''}`} onClick={() => pickCat(c)}>{c}</button>
        ))}
      </div>

      <div className="conv-io">
        <div className="conv-side">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            inputMode="decimal"
            aria-label="Value"
            spellCheck="false"
          />
          <select value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From unit">
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
        <button
          type="button"
          className="tb-btn conv-swap"
          title="Swap units"
          onClick={() => { setFrom(to); setTo(from); }}
        >
          ⇄
        </button>
        <div className="conv-side">
          <div className="conv-result">{result === null ? '—' : fmt(result)}</div>
          <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="To unit">
            {units.map((u) => <option key={u} value={u}>{u}</option>)}
          </select>
        </div>
      </div>

      {result !== null && Number.isFinite(num) && (
        <p className="dim conv-formula">
          {fmt(num)} {from} = {fmt(result)} {to}
        </p>
      )}
    </div>
  );
}

function convertTemperature(x, from, to) {
  const toC = { Celsius: x, Fahrenheit: (x - 32) * (5 / 9), Kelvin: x - 273.15 }[from];
  if (toC === undefined) return null;
  return { Celsius: toC, Fahrenheit: toC * (9 / 5) + 32, Kelvin: toC + 273.15 }[to];
}
