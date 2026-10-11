// Window ids are numeric seq values in state, but everything that crosses
// the DOM boundary carries them as strings (data-id attributes, control
// payloads, the window.__os api). A string id used to silently no-op every
// window mutation (`1 !== '1'`), so closing a window by its published
// data-id did nothing. Regression: string ids must behave like the ids
// they name, through the real OSProvider path.
import { describe, it, expect, beforeEach } from 'vitest';
import { render, cleanup, act } from '@testing-library/react';
import React from 'react';
import { OSProvider, useOS } from '../src/os/state.jsx';

let cur;
const Probe = () => {
  // eslint-disable-next-line react-hooks/globals
  cur = useOS();
  return null;
};
const mount = () => render(<OSProvider><Probe /></OSProvider>);

const notepad = () => cur.windows.find((w) => w.appId === 'notepad');

beforeEach(() => {
  localStorage.clear();
  cleanup();
  cur = null;
});

describe('window mutations accept string ids from the DOM boundary', () => {
  it('close() removes the window for the string form of its id', () => {
    mount();
    act(() => cur.launch('notepad'));
    expect(cur.windows).toHaveLength(1);
    const id = notepad().id;
    expect(typeof id).toBe('number');
    act(() => cur.close(String(id))); // the data-id form
    expect(cur.windows).toHaveLength(0);
  });

  it('focus() focuses and unminimizes via a string id', () => {
    mount();
    act(() => cur.launch('notepad'));
    act(() => cur.launch('calc'));
    const id = notepad().id;
    act(() => cur.minimize(id));
    expect(notepad().min).toBe(true);
    act(() => cur.focus(String(id), true));
    expect(cur.focused).toBe(id); // focused stays the typed numeric id
    expect(notepad().min).toBe(false);
  });

  it('minimize / toggleMax / setRect / snapWin / restoreWin take string ids', () => {
    mount();
    act(() => cur.launch('notepad'));
    const sid = String(notepad().id);
    act(() => cur.minimize(sid));
    expect(notepad().min).toBe(true);
    act(() => cur.minimize(sid, true)); // unminimize
    expect(notepad().min).toBe(false);
    act(() => cur.toggleMax(sid));
    expect(notepad().max).toBe(true);
    act(() => cur.toggleMax(sid));
    expect(notepad().max).toBe(false);
    const rect = { x: 10, y: 10, w: 400, h: 300 };
    act(() => cur.setRect(sid, rect));
    expect(notepad().rect).toEqual(rect);
    act(() => cur.snap(sid, 'left'));
    expect(notepad().snap).toBe('left');
    act(() => cur.restore(sid));
    expect(notepad().snap).toBe(null);
  });

  it('an id matching no window is a no-op, not a crash', () => {
    mount();
    act(() => cur.launch('notepad'));
    act(() => cur.close('999'));
    act(() => cur.focus('999'));
    act(() => cur.minimize('999'));
    expect(cur.windows).toHaveLength(1);
    expect(cur.windows[0].min).toBe(false);
  });
});
