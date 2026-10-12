// Settings → Appearance, the controls the focused suites don't drive yet:
// the "Theme default" tile, user-theme apply buttons, builder chrome/line/
// glow/angle sliders, the wallpaper Upload… button, the water-fx knob bank,
// custom-wallpaper fit chips, and gradient-stop editing in the studio.
import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Appearance from '../src/shell/settings/Appearance.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /><Appearance /></OSProvider>);
const byLabel = (c, label) => c.container.querySelector(`[aria-label="${label}"]`);
const click = (el) => { act(() => { fireEvent.click(el); }); };
const slide = (c, label, v) =>
  act(() => { fireEvent.change(byLabel(c, label), { target: { value: String(v) } }); });
const color = (c, label, v) =>
  act(() => { fireEvent.change(byLabel(c, label), { target: { value: v } }); });

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('wallpaper tile + upload', () => {
  it('"Theme default" clears the wallpaper and marks itself active', () => {
    const c = mount();
    act(() => cur.setTheme({ wallpaper: 'https://example.com/x.jpg' }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    const tile = [...c.container.querySelectorAll('.preset-row .preset')]
      .find((b) => b.textContent.includes('Theme default'));
    expect(tile.className).not.toContain('on');
    click(tile);
    expect(cur.theme.wallpaper).toBe('');
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    expect(tile.className).toContain('on');
  });

  it('the Upload… button delegates to the hidden file input', () => {
    const clicks = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const c = mount();
    const upload = [...c.container.querySelectorAll('section button.btn')]
      .find((b) => b.textContent === 'Upload…');
    click(upload);
    expect(clicks).toHaveBeenCalledOnce();
    clicks.mockRestore();
  });
});

describe('water controls', () => {
  const openWater = () => {
    const c = mount();
    act(() => cur.setTheme({ wallpaper: 'fx:water' }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    return c;
  };

  it('colors, angle and physics knobs write through to theme.water', () => {
    const c = openWater();
    color(c, 'Water background color B', '#0a2a4a');
    slide(c, 'Water gradient angle', 210);
    slide(c, 'Cursor ripple strength', 1.5);
    slide(c, 'Water refraction strength', 1.2);
    slide(c, 'Water ambient sway', 0.8);
    slide(c, 'Water brightness', 1.4);
    slide(c, 'Water vignette', 0.6);
    expect(cur.theme.water.bg).toMatchObject({ colorB: '#0a2a4a', angle: 210 });
    expect(cur.theme.water.water).toMatchObject({ rippleStrength: 1.5 });
    expect(cur.theme.water.optics).toMatchObject({ distortion: 1.2, turbulence: 0.8 });
    expect(cur.theme.water.grade).toMatchObject({ brightness: 1.4 });
    expect(cur.theme.water.overlay).toMatchObject({ vignette: 0.6 });
    // untouched knobs keep their defaults — mergeParams, not replacement
    expect(cur.theme.water.water.waveSpeed).toBeTruthy();
  });

  it('look presets override the custom knobs; Custom clears the override', () => {
    const c = openWater();
    const look = c.container.querySelector('[aria-label="Water look preset"]');
    const presetBtn = [...look.querySelectorAll('[role="radio"]')]
      .find((b) => b.textContent !== 'Custom');
    click(presetBtn);
    expect(cur.theme.waterPreset).toBe(presetBtn.textContent.toLowerCase());
    click([...look.querySelectorAll('[role="radio"]')].find((b) => b.textContent === 'Custom'));
    expect(cur.theme.waterPreset).toBe('');
  });
});

describe('custom wallpaper placement', () => {
  it('fit chips set the fit; Tile hides the focus grid', () => {
    const c = mount();
    act(() => cur.setTheme({ wallpaper: 'https://example.com/x.jpg' }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    const chips = [...c.container.querySelectorAll('.wx-adj .seg-row .chip')];
    expect(chips.map((x) => x.textContent)).toEqual(['Fill', 'Fit', 'Stretch', 'Tile', 'Actual']);
    expect(byLabel(c, 'Image focus point')).toBeTruthy();
    click(chips[3]); // Tile
    expect(cur.theme.fit).toBe('tile');
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    expect(byLabel(c, 'Image focus point')).toBeNull(); // focus is meaningless when tiling
    click(chips[4]);
    expect(cur.theme.fit).toBe('actual');
  });
});

describe('builder sliders', () => {
  it('chrome opacity, line strength, glow and angle land on the saved theme', () => {
    const c = mount();
    click(byLabel(c, 'New theme'));
    slide(c, 'Chrome opacity', 0.8);
    slide(c, 'Line strength', 0.15);
    slide(c, 'Glow strength', 0.2);
    slide(c, 'Gradient angle', 270);
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create theme'));
    expect(cur.userThemes[0]).toMatchObject({ chromeA: 0.8, lineA: 0.15, glow: 0.2, angle: 270 });
  });
});

describe('user theme apply', () => {
  it('an inactive user theme applies through its card button', () => {
    const c = mount();
    act(() => cur.themeSave({ id: 'u-ink', name: 'Ink', paper: '#111111', accent: '#f87171' }));
    act(() => cur.themeSave({ id: 'u-moss', name: 'Moss', paper: '#0f140e', accent: '#34d399' }));
    expect(cur.theme.preset).toBe('u-moss'); // saving activates
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    const applyInk = [...c.container.querySelectorAll('.preset.user button')]
      .find((b) => b.title === 'Apply “Ink”');
    expect(applyInk).toBeTruthy();
    click(applyInk);
    expect(cur.theme.preset).toBe('u-ink');
    expect(cur.theme.wallpaper).toBe(''); // applying a theme resets the wallpaper
  });
});

describe('studio gradient stops', () => {
  it('stop color + position edits and the live % readout', () => {
    const c = mount();
    click(byLabel(c, 'New composite'));
    color(c, 'Stop 1 color', '#112233');
    slide(c, 'Stop 1 position', 10);
    expect(c.container.querySelector('.wpb-stops .th-hex').textContent).toBe('10%');
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    expect(cur.composites[0].base.stops[0]).toEqual({ color: '#112233', at: 10 });
  });
});

describe('custom wallpaper adjustments', () => {
  const custom = () => {
    const c = mount();
    act(() => cur.setTheme({ wallpaper: 'https://example.com/x.jpg' }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    return c;
  };

  it('focus dots set the position; sliders write dim/bright/blur/sat', () => {
    const c = custom();
    click(byLabel(c, 'focus left top'));
    expect(cur.theme.pos).toBe('left top');
    const set = (id, v) => act(() => {
      fireEvent.change(c.container.querySelector(id), { target: { value: String(v) } });
    });
    set('#wp-dim', 0.7);   // slider holds (1 - dim)
    expect(cur.theme.dim).toBeCloseTo(0.3);
    set('#wp-bright', 1.2);
    expect(cur.theme.bright).toBeCloseTo(1.2);
    set('#wp-blur', 6);
    expect(cur.theme.blur).toBe(6);
    set('#wp-sat', 1.5);
    expect(cur.theme.sat).toBeCloseTo(1.5);
  });

  it('Reset adjustments restores the defaults; Clear wallpaper drops the image', () => {
    const c = custom();
    act(() => cur.setTheme({ fit: 'tile', pos: 'left top', dim: 0.5, bright: 0.8, blur: 9, sat: 1.6 }));
    click([...c.container.querySelectorAll('button.btn.slim')]
      .find((b) => b.textContent === 'Reset adjustments'));
    expect(cur.theme).toMatchObject({ fit: 'fill', pos: 'center center', dim: 1, bright: 1, blur: 0, sat: 1 });
    click([...c.container.querySelectorAll('button.btn.slim.danger')]
      .find((b) => b.textContent === 'Clear wallpaper'));
    expect(cur.theme.wallpaper).toBe('');
  });
});

describe('wallpaper studio remainder', () => {
  it('pattern kind/size/color/opacity and effect kind/strength/color patch the draft', () => {
    const c = mount();
    click(byLabel(c, 'New composite'));
    const chip = (txt) => [...c.container.querySelectorAll('.theme-builder .chip')]
      .find((b) => b.textContent === txt);
    click(chip('Grid'));
    act(() => { fireEvent.change(c.container.querySelector('#wp-psize'), { target: { value: '48' } }); });
    color(c, 'Pattern color', '#aabbcc');
    act(() => { fireEvent.change(c.container.querySelector('#wp-popacity'), { target: { value: '0.2' } }); });
    click(chip('Glow'));
    act(() => { fireEvent.change(c.container.querySelector('#wp-estrength'), { target: { value: '0.8' } }); });
    color(c, 'Glow color', '#123456');
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    const spec = cur.composites[0];
    expect(spec.pattern).toMatchObject({ kind: 'grid', size: 48, color: '#aabbcc', opacity: 0.2 });
    expect(spec.effect).toMatchObject({ kind: 'glow', strength: 0.8, color: '#123456' });
  });

  it('the studio Upload… button delegates to its hidden input', () => {
    const clicks = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const c = mount();
    click(byLabel(c, 'New composite'));
    click([...c.container.querySelectorAll('.theme-builder button.btn')]
      .find((b) => b.textContent === 'Upload…'));
    expect(clicks).toHaveBeenCalledOnce();
    clicks.mockRestore();
  });

  it('a saved composite shows up as an applicable wallpaper tile', () => {
    const c = mount();
    click(byLabel(c, 'New composite'));
    click([...c.container.querySelectorAll('.theme-builder .btn')]
      .find((b) => b.textContent === 'Create composite'));
    const id = cur.composites[0].id;
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    const hit = c.container.querySelector('.preset.user .preset-hit');
    expect(hit.title).toBe('Apply “My wallpaper”');
    click(hit);
    expect(cur.theme.wallpaper).toBe(id);
  });
});

describe('wallpaper studio — base image row', () => {
  it('the base-image Upload… button delegates to its own hidden input', () => {
    const clicks = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {});
    const c = mount();
    click(byLabel(c, 'New composite'));
    // switch the base layer to an image to reveal the URL + Upload… row
    click([...c.container.querySelectorAll('[aria-label="Composite base kind"] button')]
      .find((b) => b.textContent === 'Image'));
    const row = byLabel(c, 'Base image URL').closest('.row');
    click(row.querySelector('button.btn'));
    expect(clicks).toHaveBeenCalledOnce();
    clicks.mockRestore();
  });
});
