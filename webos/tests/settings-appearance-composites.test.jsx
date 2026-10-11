// Settings → Appearance → Wallpaper studio: the composite editor wires —
// builder → wpSave → active wallpaper, float add/edit/remove, gradient stop
// editing, edit-in-place and delete-with-fallback. Pure CSS generation is
// covered in wpcompose.test.js; here the wires and honest button state.
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
const btns = (c) => [...c.container.querySelectorAll('.theme-builder .btn')];
const clickBtn = (c, text) => fireEvent.click(btns(c).find((b) => b.textContent === text));
// file inputs: scope to the studio (the Wallpaper section has its own upload)
const baseFileInput = (c) => byLabel(c, 'Base image URL').closest('.row').querySelector('input[type="file"]');
const floatFileInput = (c) => c.container.querySelector('.wpb-floats input[type="file"]');
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};
const upload = async (input, file) => {
  Object.defineProperty(input, 'files', { value: [file] });
  fireEvent.change(input);
  await settle(); // FileReader.onload
};

// the tiny transparent PNG used for float URLs in these tests
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==';

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('composite cards', () => {
  it('a saved composite appears, applies and resolves as the wallpaper', () => {
    const c = mount();
    expect(c.container.querySelectorAll('.preset.user')).toHaveLength(0);
    act(() => cur.wpSave({
      id: 'wp-dawn', name: 'Dawn',
      base: { kind: 'gradient', angle: 200, stops: [{ color: '#38bdf8', at: 0 }, { color: '#0b0e14', at: 100 }] },
      pattern: { kind: 'dots', size: 40, color: '#ffffff', opacity: 0.1 },
      effect: { kind: 'none' },
      floats: [],
    }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    // wpSave activated it: the theme points at the composite id
    expect(cur.theme.wallpaper).toBe('wp-dawn');
    const card = byLabel(c, 'Edit composite Dawn');
    expect(card).toBeTruthy();
    expect(card.closest('.preset').className).toContain('on');
    // the card thumbnail renders the real composite stack
    expect(card.closest('.preset').querySelector('.wpcomp')).toBeTruthy();
  });

  it('deleting the active composite falls back to the theme default', () => {
    const c = mount();
    act(() => cur.wpSave({ id: 'wp-dawn', name: 'Dawn', base: { kind: 'theme' } }));
    expect(cur.theme.wallpaper).toBe('wp-dawn');
    act(() => cur.wpDelete('wp-dawn'));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    expect(cur.theme.wallpaper).toBe('');
    expect(cur.composites).toHaveLength(0);
    expect(byLabel(c, 'Edit composite Dawn')).toBeNull();
  });

  it('deleting an inactive composite leaves the active one alone', () => {
    mount();
    act(() => cur.wpSave({ id: 'wp-a', name: 'A', base: { kind: 'theme' } }));
    act(() => cur.setTheme({ wallpaper: '' }));
    act(() => cur.wpSave({ id: 'wp-b', name: 'B', base: { kind: 'theme' } }));
    expect(cur.theme.wallpaper).toBe('wp-b'); // saving activates
    act(() => cur.wpDelete('wp-a'));
    expect(cur.theme.wallpaper).toBe('wp-b');
    expect(cur.composites.map((x) => x.id)).toEqual(['wp-b']);
  });
});

describe('the composite builder', () => {
  const openStudio = (c) => {
    fireEvent.click(byLabel(c, 'New composite'));
    return c.container.querySelector('.theme-builder');
  };

  it('opens with sensible defaults and a live preview that follows edits', () => {
    const c = mount();
    act(() => cur.setTheme({ preset: 'ocean' }));
    const b = openStudio(c);
    expect(b).toBeTruthy();
    expect(c.container.querySelector('#wp-name').value).toBe('My wallpaper');
    // preview renders the real component with the gradient + pattern layers
    const preview = c.container.querySelector('.wpb-preview');
    expect(preview).toBeTruthy();
    expect(preview.style.background).toContain('linear-gradient(160deg');
    expect(preview.querySelectorAll('.wp-layer')).toHaveLength(2); // dots pattern + vignette
    // rename lives in the input; the preview is purely graphical
    fireEvent.change(c.container.querySelector('#wp-name'), { target: { value: 'Sea Fog' } });
    expect(c.container.querySelector('#wp-name').value).toBe('Sea Fog');
    // and the preview gradient follows the angle knob live (160° default)
    fireEvent.change(byLabel(c, 'Gradient angle'), { target: { value: '200' } });
    expect(c.container.querySelector('.wpb-preview').style.background).toContain('linear-gradient(200deg');
  });

  it('base kind chips switch the field set', () => {
    const c = mount();
    openStudio(c);
    expect(c.container.querySelector('.wpb-stops')).toBeTruthy(); // gradient default
    fireEvent.click([...c.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Solid color'));
    expect(c.container.querySelector('#wp-base-color')).toBeTruthy();
    expect(c.container.querySelector('.wpb-stops')).toBeNull();
    fireEvent.click([...c.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Image'));
    expect(byLabel(c, 'Base image URL')).toBeTruthy();
    fireEvent.click([...c.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Theme colors'));
    expect(byLabel(c, 'Base image URL')).toBeNull();
  });

  it('gradient stops: add inserts a midpoint color, remove keeps ≥ 2', () => {
    const c = mount();
    openStudio(c);
    const stopCount = () => c.container.querySelectorAll('.wpb-stops input[type="color"]').length;
    expect(stopCount()).toBe(2);
    fireEvent.click(btns(c).find((b) => b.textContent === 'Add stop'));
    expect(stopCount()).toBe(3);
    // remove the first (✕ buttons in the stops block only exist when > 2)
    const removeBtns = [...c.container.querySelectorAll('.wpb-stops button')];
    fireEvent.click(removeBtns[0]);
    expect(stopCount()).toBe(2);
    // no ✕ at exactly 2 — only Add stop remains
    expect([...c.container.querySelectorAll('.wpb-stops button')].map((b) => b.textContent)).toEqual(['Add stop']);
  });

  it('floats: add by URL, edit knobs, remove; honest empty state', () => {
    const c = mount();
    openStudio(c);
    expect(c.container.textContent).toContain('No floating images yet');
    const url = byLabel(c, 'Floating image URL');
    fireEvent.change(url, { target: { value: PNG } });
    fireEvent.click(btns(c).find((b) => b.textContent === 'Add URL'));
    expect(c.container.querySelectorAll('.wpb-float')).toHaveLength(1);
    expect(c.container.textContent).not.toContain('No floating images yet');
    // a junk URL is refused — no float row appears
    fireEvent.change(url, { target: { value: 'not a url' } });
    fireEvent.click(btns(c).find((b) => b.textContent === 'Add URL'));
    expect(c.container.querySelectorAll('.wpb-float')).toHaveLength(1);
    // drag the X slider; the input reflects it (state round-trip)
    const x = byLabel(c, 'Float 1 horizontal position');
    fireEvent.change(x, { target: { value: '20' } });
    expect(byLabel(c, 'Float 1 horizontal position').value).toBe('20');
    // animation chips render per float
    expect(byLabel(c, 'Float 1 animation').textContent).toContain('Drift');
    fireEvent.click(byLabel(c, 'Remove floating image 1'));
    expect(c.container.querySelectorAll('.wpb-float')).toHaveLength(0);
    expect(c.container.textContent).toContain('No floating images yet');
  });

  it('Create saves a slug id, activates the wallpaper and closes', () => {
    const c = mount();
    openStudio(c);
    fireEvent.change(c.container.querySelector('#wp-name'), { target: { value: 'Deep Dawn!' } });
    const url = byLabel(c, 'Floating image URL');
    fireEvent.change(url, { target: { value: PNG } });
    fireEvent.click(btns(c).find((b) => b.textContent === 'Add URL'));
    clickBtn(c, 'Create composite');
    expect(cur.composites.map((x) => x.id)).toEqual(['wp-deep-dawn']);
    expect(cur.theme.wallpaper).toBe('wp-deep-dawn');
    expect(cur.composites[0].floats).toHaveLength(1);
    expect(c.container.querySelector('.theme-builder')).toBeNull(); // closed
  });

  it('editing loads the stored spec, Save updates in place, Delete removes', () => {
    const c = mount();
    act(() => cur.wpSave({
      id: 'wp-dawn', name: 'Dawn', base: { kind: 'color', color: '#10141c' },
      pattern: { kind: 'none' }, effect: { kind: 'none' },
      floats: [{ id: 'fl-1', image: PNG, x: 50, y: 50, scale: 1, opacity: 1, anim: 'none', speed: 1 }],
    }));
    fireEvent.click(byLabel(c, 'Edit composite Dawn'));
    const b = c.container.querySelector('.theme-builder');
    expect(c.container.querySelector('#wp-name').value).toBe('Dawn');
    expect(b.textContent).toContain('Delete');
    fireEvent.change(c.container.querySelector('#wp-name'), { target: { value: 'Dusk' } });
    clickBtn(c, 'Save composite');
    expect(cur.composites).toHaveLength(1); // updated, not duplicated
    expect(cur.composites[0].name).toBe('Dusk');
    // Delete inside the editor removes it and falls back
    fireEvent.click(byLabel(c, 'Edit composite Dusk'));
    clickBtn(c, 'Delete');
    expect(cur.composites).toHaveLength(0);
    expect(cur.theme.wallpaper).toBe('');
  });

  it('Cancel closes without touching the store', () => {
    const c = mount();
    openStudio(c);
    fireEvent.change(c.container.querySelector('#wp-name'), { target: { value: 'Ghost' } });
    clickBtn(c, 'Cancel');
    expect(cur.composites).toHaveLength(0);
    expect(c.container.querySelector('.theme-builder')).toBeNull();
  });

  it('hostile draft values are clamped at the save boundary', () => {
    const c = mount();
    openStudio(c);
    const url = byLabel(c, 'Floating image URL');
    fireEvent.change(url, { target: { value: PNG } });
    fireEvent.click(btns(c).find((b) => b.textContent === 'Add URL'));
    fireEvent.change(byLabel(c, 'Float 1 horizontal position'), { target: { value: '999' } });
    clickBtn(c, 'Create composite');
    expect(cur.composites[0].floats[0].x).toBe(100); // clamped by normalizeComposite
  });

  it('base image: URL typing and upload both land an image base', async () => {
    const c = mount();
    openStudio(c);
    fireEvent.click([...c.container.querySelectorAll('[role="radio"]')].find((r) => r.textContent === 'Image'));
    fireEvent.change(byLabel(c, 'Base image URL'), { target: { value: 'https://x.example/bg.png' } });
    // upload goes through FileReader into the same draft field
    const file = new File(['xx'], 'bg.png', { type: 'image/png' });
    await upload(baseFileInput(c), file);
    clickBtn(c, 'Create composite');
    expect(cur.composites[0].base.kind).toBe('image');
    expect(cur.composites[0].base.image).toMatch(/^data:image\/png/); // upload overwrote the URL
  });

  it('oversized float uploads are refused with an alert, draft untouched', async () => {
    const alert = vi.fn();
    vi.stubGlobal('alert', alert); // happy-dom has no window.alert
    const c = mount();
    openStudio(c);
    const big = new File([new Uint8Array(800_000)], 'big.png', { type: 'image/png' }); // > 700 KB float cap
    await upload(floatFileInput(c), big);
    expect(alert).toHaveBeenCalledTimes(1);
    expect(c.container.querySelectorAll('.wpb-float')).toHaveLength(0); // nothing added
    vi.unstubAllGlobals();
  });

  it('float upload adds a floating image with the data URL', async () => {
    const c = mount();
    openStudio(c);
    const file = new File(['zz'], 'mark.png', { type: 'image/png' });
    await upload(floatFileInput(c), file);
    expect(c.container.querySelectorAll('.wpb-float')).toHaveLength(1);
    clickBtn(c, 'Create composite');
    expect(cur.composites[0].floats[0].image).toMatch(/^data:image\/png/);
  });
});
