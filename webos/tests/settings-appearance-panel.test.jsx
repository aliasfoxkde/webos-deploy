// Settings → Appearance, the panel-level controls the focused suites don't
// drive: persona chips, Interface + Window-chrome radios, theme preset
// tiles, accent swatches + custom picker, wallpaper apply/URL/upload (size
// guard included), and the studio gaps — color/image base kinds, float cap,
// float upload guard. Everything asserts through the os api + persistence.
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
const radio = (c, group, label) =>
  [...c.container.querySelectorAll(`[role="radiogroup"][aria-label="${group}"] [role="radio"]`)]
    .find((b) => b.textContent === label);
const click = (el) => { act(() => { fireEvent.click(el); }); };
const slide = (c, label, v) =>
  act(() => { fireEvent.change(c.container.querySelector(`input[aria-label="${label}"]`), { target: { value: String(v) } }); });
const settle = async () => {
  for (let i = 0; i < 4; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('persona + interface', () => {
  it('persona chips switch the OS skin and persist', () => {
    const c = mount();
    click(radio(c, 'OS persona', 'GNOME / Linux'));
    expect(cur.persona).toBe('linux');
    expect(JSON.parse(localStorage.getItem('webos.persona'))).toBe('linux');
    expect(radio(c, 'OS persona', 'GNOME / Linux').className).toContain('on');
  });

  it('UI scale + transparency sliders write the ui state', () => {
    const c = mount();
    slide(c, 'UI scale', 1.15);
    expect(cur.ui.scale).toBeCloseTo(1.15);
    slide(c, 'Transparency strength', 0.6);
    expect(cur.ui.transparency).toBeCloseTo(0.6);
  });

  it('corner radius, animations, window buttons, title, font, shadow all persist', () => {
    const c = mount();
    click(radio(c, 'Corner radius', 'Large'));
    expect(cur.ui.radius).toBe('18px');
    const anim = c.container.querySelector('input[type="checkbox"]');
    click(anim);
    expect(cur.ui.anim).toBe(false);
    click(radio(c, 'Window button side', 'Left'));
    expect(cur.ui.tbSide).toBe('left');
    click(radio(c, 'Title alignment', 'Center'));
    expect(cur.ui.titleAlign).toBe('center');
    click(radio(c, 'Interface font', 'Mono'));
    expect(cur.ui.font).toBe('mono');
    click(radio(c, 'Window shadow', 'Deep'));
    expect(cur.ui.shadow).toBe('deep');
    const saved = JSON.parse(localStorage.getItem('webos.ui'));
    expect(saved).toMatchObject({ radius: '18px', anim: false, tbSide: 'left', titleAlign: 'center', font: 'mono', shadow: 'deep' });
  });
});

describe('theme presets + accent', () => {
  it('a preset tile clears the wallpaper and applies the preset', () => {
    const c = mount();
    cur.setTheme({ wallpaper: 'wp-dunes' });
    const tile = [...c.container.querySelectorAll('.preset-row .preset')]
      .find((b) => b.textContent.includes('Forest'));
    click(tile);
    expect(cur.theme.preset).toBe('forest');
    expect(cur.theme.wallpaper).toBe('');
  });

  it('accent swatches and the custom picker set the accent', () => {
    const c = mount();
    click(byLabel(c, 'accent #f472b6'));
    expect(cur.theme.accent).toBe('#f472b6');
    act(() => { fireEvent.change(c.container.querySelector('input[type="color"][title="Custom accent"]'), { target: { value: '#123456' } }); });
    expect(cur.theme.accent).toBe('#123456');
  });
});

describe('wallpaper section', () => {
  it('a wallpaper tile applies with fit:fill; category chips filter', () => {
    const c = mount();
    click([...c.container.querySelectorAll('.store-cats .chip')].find((b) => b.textContent !== 'All'));
    click([...c.container.querySelectorAll('.preset-row .preset')].find((b) => b.textContent.includes('Dunes')));
    expect(cur.theme.wallpaper).toBeTruthy();
    expect(cur.theme.fit).toBe('fill');
  });

  it('pasting an image URL sets it as the wallpaper', () => {
    const c = mount();
    const url = c.container.querySelector('input[type="url"]');
    act(() => { fireEvent.change(url, { target: { value: 'https://example.com/pic.jpg' } }); });
    expect(cur.theme.wallpaper).toBe('https://example.com/pic.jpg');
  });

  it('upload: an oversized file alerts instead of reading; a good one lands as data URL', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    const c = mount();
    const fileInput = c.container.querySelector('input[type="file"]'); // wallpaper section's
    Reflect.defineProperty(fileInput, 'files', { configurable: true, value: [new File([new ArrayBuffer(3 * 1048576)], 'big.png')] });
    fireEvent.change(fileInput);
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(alertSpy.mock.calls[0][0]).toContain('too large');
    expect(cur.theme.wallpaper).toBe(''); // unchanged
    const small = new File([new Uint8Array([1, 2, 3])], 'ok.png', { type: 'image/png' });
    Reflect.defineProperty(fileInput, 'files', { configurable: true, value: [small] });
    fireEvent.change(fileInput);
    await settle();
    expect(cur.theme.wallpaper).toMatch(/^data:image\/png;base64,/);
    vi.unstubAllGlobals();
  });
});

describe('studio gaps', () => {
  const openStudio = (c) => {
    click([...c.container.querySelectorAll('button')].find((b) => b.getAttribute('aria-label') === 'New composite'));
  };

  it('base kind "color" edits the color + shows the hex; "image" takes a URL', () => {
    const c = mount();
    openStudio(c);
    click(radio(c, 'Composite base kind', 'Solid color'));
    act(() => { fireEvent.change(byLabel(c, 'Base color'), { target: { value: '#010203' } }); });
    expect(c.container.querySelector('.th-hex').textContent).toBe('#010203');
    click(radio(c, 'Composite base kind', 'Image'));
    const url = byLabel(c, 'Base image URL');
    act(() => { fireEvent.change(url, { target: { value: 'https://example.com/base.png' } }); });
    click([...c.container.querySelectorAll('.theme-builder .btn')].find((b) => b.textContent === 'Create composite'));
    const saved = cur.composites[0];
    expect(saved.base).toEqual({ kind: 'image', image: 'https://example.com/base.png' });
  });

  it('float uploads past the cap are ignored — four floats maximum', async () => {
    const c = mount();
    openStudio(c);
    const floatInput = c.container.querySelector('.wpb-floats input[type="file"]');
    for (let i = 0; i < 5; i += 1) {
      Reflect.defineProperty(floatInput, 'files', { configurable: true, value: [new File([new Uint8Array([1])], `f${i}.png`, { type: 'image/png' })] });
      fireEvent.change(floatInput);
      await settle();
    }
    expect(cur.composites).toHaveLength(0); // nothing saved yet
    const count = c.container.querySelector('.wpb-floats .row .dim').textContent;
    expect(count).toContain('4/4'); // the fifth add was a no-op
  });

  it('float uploads over the per-file limit alert and add nothing', async () => {
    const alertSpy = vi.fn();
    vi.stubGlobal('alert', alertSpy);
    const c = mount();
    openStudio(c);
    const floatInput = c.container.querySelector('.wpb-floats input[type="file"]');
    Reflect.defineProperty(floatInput, 'files', { configurable: true, value: [new File([new ArrayBuffer(2 * 1048576)], 'huge.png')] });
    fireEvent.change(floatInput);
    await settle();
    expect(alertSpy).toHaveBeenCalledTimes(1);
    expect(c.container.textContent).toContain('No floating images yet');
    vi.unstubAllGlobals();
  });

  it('float knob sliders + animation chips patch the draft', async () => {
    const c = mount();
    openStudio(c);
    const floatInput = c.container.querySelector('.wpb-floats input[type="file"]');
    Reflect.defineProperty(floatInput, 'files', { configurable: true, value: [new File([new Uint8Array([1])], 'f.png', { type: 'image/png' })] });
    fireEvent.change(floatInput);
    await settle();
    act(() => { fireEvent.change(byLabel(c, 'Float 1 horizontal position'), { target: { value: '10' } }); });
    act(() => { fireEvent.change(byLabel(c, 'Float 1 vertical position'), { target: { value: '20' } }); });
    act(() => { fireEvent.change(byLabel(c, 'Float 1 scale'), { target: { value: '1.5' } }); });
    act(() => { fireEvent.change(byLabel(c, 'Float 1 opacity'), { target: { value: '0.5' } }); });
    click(radio(c, 'Float 1 animation', 'Drift'));
    act(() => { fireEvent.change(byLabel(c, 'Float 1 animation speed'), { target: { value: '2' } }); });
    click([...c.container.querySelectorAll('.theme-builder .btn')].find((b) => b.textContent === 'Create composite'));
    const f = cur.composites[0].floats[0];
    expect(f).toMatchObject({ x: 10, y: 20, scale: 1.5, opacity: 0.5, anim: 'drift', speed: 2 });
  });
});
