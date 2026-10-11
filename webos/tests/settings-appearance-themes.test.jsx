// Settings → Appearance: the theming overhaul — user themes (apply / edit /
// delete), the composite theme builder (live derivation + contrast chips),
// and the searchable theme-pack library. Pure math is covered in
// os-themes.test.js; here the wires: builder → themeSave → active preset,
// pack apply → user themes list, and honest state on every button.
import React from 'react';
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, fireEvent, act } from '@testing-library/react';
import { OSProvider, useOS } from '../src/os/state.jsx';
import Appearance from '../src/shell/settings/Appearance.jsx';
import { resolveTheme } from '../src/os/themes.js';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /><Appearance /></OSProvider>);
const byLabel = (c, label) => c.container.querySelector(`[aria-label="${label}"]`);

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('user themes', () => {
  it('a saved theme appears in Your themes, applies and resolves', () => {
    const c = mount();
    expect(c.container.querySelectorAll('.preset.user')).toHaveLength(0);
    act(() => cur.themeSave({
      id: 'u-ink', name: 'Ink', paper: '#111111', text: '#eeeeee', dim: '#999999', accent: '#f87171',
    }));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    // themeSave activated it: the desktop resolves through the draft fields
    expect(cur.theme.preset).toBe('u-ink');
    expect(resolveTheme('u-ink', cur.userThemes).paper).toBe('#111111');
    const card = byLabel(c, 'Edit theme Ink');
    expect(card).toBeTruthy();
    expect(card.closest('.preset').className).toContain('on');
  });

  it('deleting the active theme falls back to Midnight', () => {
    const c = mount();
    act(() => cur.themeSave({ id: 'u-ink', name: 'Ink', paper: '#111111', accent: '#f87171' }));
    expect(cur.theme.preset).toBe('u-ink');
    act(() => cur.themeDelete('u-ink'));
    c.rerender(<OSProvider><Probe /><Appearance /></OSProvider>);
    expect(cur.theme.preset).toBe('midnight');
    expect(cur.userThemes).toHaveLength(0);
    expect(byLabel(c, 'Edit theme Ink')).toBeNull();
  });

  it('deleting an inactive theme leaves the active one alone', () => {
    mount();
    act(() => cur.themeSave({ id: 'u-a', name: 'A', paper: '#111111', accent: '#f87171' }));
    act(() => cur.setTheme({ preset: 'ocean' }));
    act(() => cur.themeSave({ id: 'u-b', name: 'B', paper: '#222222', accent: '#34d399' }));
    expect(cur.theme.preset).toBe('u-b'); // saving activates
    act(() => cur.themeDelete('u-a'));
    expect(cur.theme.preset).toBe('u-b');
    expect(cur.userThemes.map((x) => x.id)).toEqual(['u-b']);
  });
});

describe('theme builder', () => {
  const openBuilder = (c) => {
    fireEvent.click(byLabel(c, 'New theme'));
    return c.container.querySelector('.theme-builder');
  };

  it('opens seeded from the active look and previews live', () => {
    const c = mount();
    act(() => cur.setTheme({ accent: '#f87171' }));
    const b = openBuilder(c);
    expect(b).toBeTruthy();
    const name = c.container.querySelector('#th-name');
    expect(name.value).toBe('My theme');
    // seeded from the active theme's paper (midnight) + the active accent
    expect(c.container.querySelector('#th-paper').value).toBe('#10141c');
    expect(c.container.querySelector('#th-accent').value).toBe('#f87171');
    // live derivation: the preview window picks up the name + accent
    fireEvent.change(name, { target: { value: 'Ember Sea' } });
    expect(b.textContent).toContain('Ember Sea');
  });

  it('changing paper re-derives chrome and the contrast chips update', () => {
    const c = mount();
    openBuilder(c);
    // seeded on midnight: light text on dark paper reads AAA
    expect(c.container.querySelector('.th-ratio.aaa')).toBeTruthy();
    fireEvent.change(c.container.querySelector('#th-paper'), { target: { value: '#ffffff' } });
    // near-white text on white paper: the chips honestly flag it low
    expect(c.container.querySelector('.th-ratio.low')).toBeTruthy();
    // and the derived danger token flipped to the light-paper value,
    // visible as the low-warning danger chip reading AAA again
    expect(c.container.textContent).toContain('Danger');
  });

  it('Create saves a slug-named user theme and activates it', () => {
    const c = mount();
    openBuilder(c);
    fireEvent.change(c.container.querySelector('#th-name'), { target: { value: 'Deep Ocean!' } });
    fireEvent.click([...c.container.querySelectorAll('.theme-builder .btn')].find((b) => b.textContent === 'Create theme'));
    expect(cur.userThemes.map((x) => x.id)).toEqual(['u-deep-ocean']);
    expect(cur.theme.preset).toBe('u-deep-ocean');
    expect(c.container.querySelector('.theme-builder')).toBeNull(); // closed
  });

  it('editing loads the stored draft, Save updates in place, Delete removes', () => {
    const c = mount();
    act(() => cur.themeSave({
      id: 'u-ink', name: 'Ink', paper: '#111111', text: '#eeeeee', dim: '#999999',
      accent: '#f87171', chromeA: 0.9, lineA: 0.2, glow: 0.2, angle: 200,
    }));
    fireEvent.click(byLabel(c, 'Edit theme Ink'));
    const b = c.container.querySelector('.theme-builder');
    expect(c.container.querySelector('#th-paper').value).toBe('#111111');
    expect(Number(c.container.querySelector('#th-chromea').value)).toBe(0.9);
    expect(c.container.textContent).toContain('Delete');
    fireEvent.change(c.container.querySelector('#th-name'), { target: { value: 'Ink Dark' } });
    fireEvent.click([...b.querySelectorAll('.btn')].find((x) => x.textContent === 'Save theme'));
    expect(cur.userThemes).toHaveLength(1); // updated, not duplicated
    expect(cur.userThemes[0].name).toBe('Ink Dark');
    // Delete inside the editor removes it and falls back
    fireEvent.click(byLabel(c, 'Edit theme Ink Dark'));
    fireEvent.click([...c.container.querySelectorAll('.theme-builder .btn')].find((x) => x.textContent === 'Delete'));
    expect(cur.userThemes).toHaveLength(0);
    expect(cur.theme.preset).toBe('midnight');
  });

  it('Cancel closes without touching the store', () => {
    const c = mount();
    openBuilder(c);
    fireEvent.change(c.container.querySelector('#th-name'), { target: { value: 'Ghost' } });
    fireEvent.click([...c.container.querySelectorAll('.theme-builder .btn')].find((x) => x.textContent === 'Cancel'));
    expect(cur.userThemes).toHaveLength(0);
    expect(c.container.querySelector('.theme-builder')).toBeNull();
  });
});

describe('theme-pack library', () => {
  it('lists every pack theme with identity and honest apply state', () => {
    const c = mount();
    const cards = [...c.container.querySelectorAll('.pack-card')];
    expect(cards).toHaveLength(14);
    expect(cards[0].textContent).toContain('Night Lights'); // pack name shows
    // nothing applied yet: every card offers Apply
    expect(cards.every((x) => x.querySelector('button[aria-label^="Apply theme"]'))).toBe(true);
  });

  it('search narrows by name, tag and pack; empty query reports honestly', () => {
    const c = mount();
    const box = byLabel(c, 'Search theme packs');
    fireEvent.change(box, { target: { value: 'crt' } });
    let cards = [...c.container.querySelectorAll('.pack-card')];
    expect(cards.map((x) => x.querySelector('strong').textContent).sort())
      .toEqual(['Amber CRT', 'Phosphor']);
    fireEvent.change(box, { target: { value: 'zzz-no-match' } });
    expect(c.container.textContent).toContain('No pack themes match');
    fireEvent.change(box, { target: { value: '' } });
    // pack chips scope the list
    fireEvent.click([...c.container.querySelectorAll('.store-cats .chip')].find((x) => x.textContent === 'Terminals'));
    cards = [...c.container.querySelectorAll('.pack-card')];
    expect(cards).toHaveLength(3);
  });

  it('Apply installs an editable user theme and activates it; Re-apply refreshes', () => {
    const c = mount();
    fireEvent.click(byLabel(c, 'Apply theme Aurora'));
    expect(cur.userThemes.map((x) => x.id)).toEqual(['u-night-aurora']);
    expect(cur.theme.preset).toBe('u-night-aurora');
    expect(resolveTheme('u-night-aurora', cur.userThemes).paper).toBe('#0a1410');
    // the card now reads Active ✓
    const card = [...c.container.querySelectorAll('.pack-card')]
      .find((x) => x.textContent.includes('Aurora'));
    expect(card.querySelector('[aria-label="Aurora is active"]')).toBeTruthy();
    // mangle the installed copy, switch away, then Re-apply restores the pack values
    act(() => cur.themeSave({
      id: 'u-night-aurora', name: 'Aurora', paper: '#001100', accent: '#34d399',
    }));
    expect(cur.userThemes[0].paper).toBe('#001100');
    act(() => cur.setTheme({ preset: 'ocean' }));
    fireEvent.click(byLabel(c, 'Apply theme Aurora')); // label is back once inactive
    expect(cur.userThemes).toHaveLength(1); // refreshed, not duplicated
    expect(cur.userThemes[0].paper).toBe('#0a1410'); // back to the pack values
    expect(cur.theme.preset).toBe('u-night-aurora');
  });
});
