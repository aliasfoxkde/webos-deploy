import React from 'react';

// Shared button grid. Keys: { label, sub?, onClick, kind?, wide?, disabled? }.
export default function Keypad({ keys, columns = 4, className = '' }) {
  return (
    <div className={`keypad ${className}`} style={{ gridTemplateColumns: `repeat(${columns}, 1fr)` }}>
      {keys.map((k, i) => (
        <button
          key={i}
          type="button"
          className={`key ${k.kind || ''} ${k.wide ? 'wide' : ''}`}
          disabled={k.disabled}
          onClick={k.onClick}
          title={k.title || undefined}
        >
          {k.label}
          {k.sub ? <small>{k.sub}</small> : null}
        </button>
      ))}
    </div>
  );
}
