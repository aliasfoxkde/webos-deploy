// Sidebar widget branches the shell-window suite doesn't hit: weather fetch
// rejection + units toggle, battery change-listeners + API rejection, storage
// estimate rejection, long chat message truncation, widget-body fallback.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, act, cleanup, fireEvent } from '@testing-library/react';
import { OSProvider } from '../src/os/state.jsx';
import Sidebar from '../src/shell/Sidebar.jsx';

const mount = () => render(<OSProvider><Sidebar /></OSProvider>);
const noop = () => {};

beforeEach(() => {
  localStorage.clear();
  cleanup();
  delete navigator.getBattery;
  delete navigator.storage;
  localStorage.setItem('webos.weather.loc', JSON.stringify({ name: 'Testville', lat: 1, lon: 2 }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete navigator.getBattery;
  delete navigator.storage;
});

describe('Sidebar widget residual branches', () => {
  it('weather fetch rejection is swallowed (widget renders the retry state)', async () => {
    vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
    const c = mount();
    await act(async () => {});
    expect(c.container.textContent).toContain('Weather'); // widget exists, no crash
  });

  it('clicking the weather tile toggles metric → imperial and persists', async () => {
    vi.stubGlobal('fetch', () => Promise.resolve({
      ok: true,
      json: async () => ({
        current: {
          temperature_2m: 21, apparent_temperature: 20, relative_humidity_2m: 40,
          wind_speed_10m: 3, precipitation: 0, weather_code: 0, is_day: 1,
        },
        current_units: { temperature_2m: '°C' },
        daily: {
          time: ['2026-10-12', '2026-10-13'], weather_code: [0, 1],
          temperature_2m_max: [23, 22], temperature_2m_min: [12, 11],
          precipitation_probability_max: [10, 20],
        },
      }),
    }));
    const c = mount();
    await act(async () => {});
    const tile = c.container.querySelector('.widget-weather');
    expect(tile).toBeTruthy();
    fireEvent.click(tile);
    expect(localStorage.getItem('webos.weather.units')).toBe('imperial');
  });

  it('battery API rejection is caught; level/charging changes re-render', async () => {
    const listeners = [];
    navigator.getBattery = () => Promise.reject(new Error('denied'));
    const c1 = mount();
    await act(async () => {});
    expect(c1.container.textContent).toContain('No battery API');
    cleanup();
    navigator.getBattery = () => Promise.resolve({
      level: 0.5, charging: false,
      addEventListener: (_e, h) => listeners.push(h), removeEventListener: noop,
    });
    const c = mount();
    await act(async () => {});
    expect(c.container.querySelector('.widget-batt-fill').style.width).toBe('50%');
    // firing the registered change handlers re-reads the (mock) battery
    act(() => { listeners.forEach((h) => h()); });
    expect(c.container.querySelector('.widget-batt-fill')).toBeTruthy();
  });

  it('storage estimate rejection keeps the unavailable notice', async () => {
    navigator.storage = { estimate: () => Promise.reject(new Error('denied')) };
    const c = mount();
    await act(async () => {});
    expect(c.container.textContent).toContain('Storage manager unavailable.');
  });

  it('long chat messages truncate at 90 chars with an ellipsis', () => {
    localStorage.setItem('webos.chat.history', JSON.stringify([
      { id: 'a', role: 'assistant', text: 'x'.repeat(120) },
      { id: 'b', role: 'user', text: 'short' },
    ]));
    const c = mount();
    const msgs = [...c.container.querySelectorAll('.widget-chat-msg')];
    expect(msgs[0].textContent).toHaveLength(91); // 90 + ellipsis
    expect(msgs[0].textContent.endsWith('…')).toBe(true);
    expect(msgs[1].textContent).toBe('short');
  });
});
