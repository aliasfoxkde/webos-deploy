// Settings → Appearance: the expanded wallpaper picker (search, FX speed)
// and the water-tuning controls — every knob must write a VALIDATED patch
// into theme.water (mergeParams drops garbage) and the reset/preset chips
// must restore the documented layering (DEFAULTS < patch < preset).
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Appearance from '../src/shell/settings/Appearance.jsx';
import { resolveParams } from '../src/os/waterfx.js';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /><Appearance /></OSProvider>);

const byLabel = (c, label) => c.container.querySelector(`[aria-label="${label}"]`);
const rangeOf = (c, id) => c.container.querySelector(`#${id}`);

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('Appearance: wallpaper picker', () => {
  it('search narrows the grid by label and category', () => {
    const c = mount();
    const before = c.container.querySelectorAll('.preset-row .preset').length;
    fireEvent.change(byLabel(c, 'Search wallpapers'), { target: { value: 'dune' } });
    const after = [...c.container.querySelectorAll('.preset-row .preset')];
    expect(after.length).toBeLessThan(before);
    expect(after.some((b) => b.textContent.includes('Dunes'))).toBe(true);
    // category filter composes with the query
    fireEvent.change(byLabel(c, 'Search wallpapers'), { target: { value: 'zz-no-match' } });
    expect(c.container.querySelectorAll('.preset-row .preset').length).toBeGreaterThan(0); // Theme default stays
  });

  it('the FX speed slider only appears for fx wallpapers and persists', () => {
    const c = mount();
    expect(rangeOf(c, 'fx-speed')).toBeNull(); // hidden for CSS/photo wallpapers
    act(() => cur.setTheme({ wallpaper: 'fx:aurora' }));
    const slider = rangeOf(c, 'fx-speed');
    expect(slider).toBeTruthy();
    fireEvent.change(slider, { target: { value: '1.5' } });
    expect(cur.theme.fxSpeed).toBe(1.5);
  });
});

describe('Appearance: water tuning', () => {
  const activateWater = (c) => {
    act(() => cur.setTheme({ wallpaper: 'fx:water' }));
    return c;
  };

  it('shows the five preset looks plus Custom; chips set and clear waterPreset', () => {
    const c = activateWater(mount());
    const chips = [...c.container.querySelectorAll('[aria-label="Water look preset"] [role="radio"]')];
    const names = chips.map((b) => b.textContent);
    expect(names[0]).toBe('Custom');
    expect(names.slice(1).sort()).toEqual(['Calm', 'Deep Water', 'Glass', 'Rain', 'Storm']);
    fireEvent.click(chips.find((b) => b.textContent === 'Storm'));
    expect(cur.theme.waterPreset).toBe('storm');
    expect(resolveParams(cur.theme.water, cur.theme.waterPreset).water.waveSpeed).toBe(1.8);
    fireEvent.click(chips[0]); // Custom
    expect(cur.theme.waterPreset).toBe('');
  });

  it('sliders write validated patches; unrelated groups stay intact', () => {
    const c = activateWater(mount());
    act(() => cur.setTheme({ water: { optics: { distortion: 0.7 } } }));
    fireEvent.change(rangeOf(c, 'water-wavespeed'), { target: { value: '2' } });
    expect(cur.theme.water.water.waveSpeed).toBe(2);
    expect(cur.theme.water.optics.distortion).toBe(0.7); // untouched group survives
    // resolved tree still validates: patch + no preset → defaults elsewhere
    const resolved = resolveParams(cur.theme.water, '');
    expect(resolved.grade.brightness).toBe(1);
    fireEvent.change(rangeOf(c, 'water-ripple'), { target: { value: '0.08' } });
    expect(cur.theme.water.water.rippleRadius).toBeCloseTo(0.08);
  });

  it('rain toggles and reveals its rate slider', () => {
    const c = activateWater(mount());
    expect(rangeOf(c, 'water-rainrate')).toBeNull();
    fireEvent.click(byLabel(c, 'Ambient rain drops'));
    expect(cur.theme.water.water.rain).toBe(true);
    expect(rangeOf(c, 'water-rainrate')).toBeTruthy();
    fireEvent.change(rangeOf(c, 'water-rainrate'), { target: { value: '6' } });
    expect(cur.theme.water.water.rainRate).toBe(6);
  });

  it('color pickers patch the gradient stops', () => {
    const c = activateWater(mount());
    fireEvent.change(byLabel(c, 'Water background color A'), { target: { value: '#123456' } });
    expect(cur.theme.water.bg.colorA).toBe('#123456');
    expect(resolveParams(cur.theme.water, '').bg.colorA).toBe('#123456');
  });

  it('reset clears the patch and the preset (back to factory defaults)', () => {
    const c = activateWater(mount());
    act(() => cur.setTheme({ waterPreset: 'rain', water: { water: { waveSpeed: 2 } } }));
    fireEvent.click([...c.container.querySelectorAll('button')]
      .find((b) => b.textContent === 'Reset water settings'));
    expect(cur.theme.water).toBeUndefined();
    expect(cur.theme.waterPreset).toBe('');
    expect(resolveParams(cur.theme.water, cur.theme.waterPreset)).toEqual(resolveParams(null, ''));
  });
});
