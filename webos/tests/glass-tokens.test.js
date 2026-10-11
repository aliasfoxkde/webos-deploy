// Liquid Glass LG1 contract (docs/planning/webos-apps/LIQUID-GLASS.md §4):
// the win/mac personas opt into the glass material via tokens, the shared
// backdrop chains consume them, Reduce Transparency flattens the surfaces,
// and every theme's chrome fill keeps the ≥0.55 legibility floor.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { THEME_PRESETS } from '../src/os/state.jsx';

// happy-dom rewrites import.meta.url to http:// — resolve from the vitest root
const css = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8');

const personaBlock = (id) => css.match(new RegExp(`\\[data-persona="${id}"\\]\\)\\s*\\{([^}]*)\\}`))?.[1] ?? '';

describe('glass tokens (win/mac personas)', () => {
  it('win and mac declare saturate + rim tokens', () => {
    for (const id of ['win', 'mac']) {
      expect(personaBlock(id), id).toContain('--glass-sat');
      expect(personaBlock(id), id).toContain('--glass-rim-hi');
      expect(personaBlock(id), id).toContain('--glass-rim-lo');
    }
  });

  it('other personas stay untouched by the material', () => {
    for (const id of ['linux', 'bsd', 'android', 'tui']) {
      expect(personaBlock(id), id).not.toContain('--glass-sat');
    }
  });

  it('the shared chrome chains consume saturate(var(--glass-sat))', () => {
    const chains = css.match(/backdrop-filter:[^;]+;/g) ?? [];
    expect(chains.length).toBeGreaterThan(4);
    // every chrome-blur chain carries the saturate pass (default 1 = inert
    // for personas without the tokens); `.blocked`'s 4px panel frost is a
    // deliberate non-glass exception
    for (const chain of chains) {
      if (chain.includes('--chrome-blur')) {
        expect(chain).toMatch(/saturate\(var\(--glass-sat, 1\)\)/);
      }
    }
    expect(chains.some((c) => c.includes('blur(4px)'))).toBe(true);
  });

  it('specular rims target the chrome slabs only under win/mac', () => {
    expect(css).toMatch(/body\[data-persona="win"\] #taskbar, body\[data-persona="mac"\] #taskbar/);
    expect(css).not.toMatch(/body\[data-persona="tui"\][^{]*--glass-rim/);
  });
});

describe('Reduce Transparency fallback', () => {
  it('flattens the glass surfaces and switches off the frost', () => {
    const mq = css.match(/@media \(prefers-reduced-transparency: reduce\)\s*\{([\s\S]*?)\n\}/);
    expect(mq, 'media query exists').toBeTruthy();
    expect(mq[1]).toContain('backdrop-filter: none');
    // triple-stack of the theme chrome — the polarity-correct way to go opaque
    expect(mq[1].match(/linear-gradient\(var\(--chrome\), var\(--chrome\)\)/g)).toHaveLength(3);
  });
});

describe('regular-glass legibility floor (LIQUID-GLASS.md §4.1)', () => {
  it('every theme chrome fill is at least 0.55 opaque', () => {
    for (const [key, t] of Object.entries(THEME_PRESETS)) {
      const a = Number(t.chrome.match(/rgba\(\d+,\s*\d+,\s*\d+,\s*([\d.]+)\)/)?.[1]);
      expect(a, `${key} chrome alpha`).toBeGreaterThanOrEqual(0.55);
    }
  });
});
