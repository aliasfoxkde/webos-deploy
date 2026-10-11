// Weather app UI over a mocked network layer. api.js keeps its real storage
// and WMO logic (unit-tested in app-libs); only geocode/fetchWeather are
// replaced so every UI state is reachable deterministically.
import React from 'react';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, act, fireEvent, cleanup } from '@testing-library/react';
import WxIcon from '../src/apps/weather/WxIcon.jsx';

const h = vi.hoisted(() => ({
  geocode: vi.fn(),
  fetchWeather: vi.fn(),
}));

vi.mock('../src/apps/weather/api.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    geocode: (...a) => h.geocode(...a),
    fetchWeather: (...a) => h.fetchWeather(...a),
  };
});

import WeatherApp from '../src/apps/weather/WeatherApp.jsx';

const OSLO = { name: 'Oslo', label: 'Oslo, Norway', lat: 59.9, lon: 10.7 };
const forecast = (temp = 21.4) => ({
  current: { temp, feels: temp - 1.5, humidity: 55, wind: 9, precip: 0.2, code: 0, isDay: true },
  days: Array.from({ length: 5 }, (_, i) => ({
    date: `2026-10-1${i}`, code: i, max: 10 + i, min: 2 + i, pop: i * 10,
  })),
  units: '°C',
});

beforeEach(() => {
  localStorage.clear();
  cleanup();
  document.body.innerHTML = '';
  h.geocode.mockReset();
  h.fetchWeather.mockReset();
  h.fetchWeather.mockResolvedValue(forecast());
});

afterEach(() => vi.unstubAllGlobals());

const settle = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };

describe('WeatherApp', () => {
  it('shows the empty state when no location is saved', async () => {
    render(<WeatherApp />);
    expect(screen.getByText('No location set')).toBeTruthy();
    expect(screen.getByText(/saved in this browser only/)).toBeTruthy();
    await settle();
    expect(h.fetchWeather).not.toHaveBeenCalled(); // nothing to fetch for
  });

  it('renders the current conditions and five-day strip for the saved place', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    render(<WeatherApp />);
    await settle();
    expect(h.fetchWeather).toHaveBeenCalledWith(59.9, 10.7);
    expect(screen.getByText('Oslo')).toBeTruthy();
    expect(screen.getByText('Clear sky · feels like 20°C')).toBeTruthy();
    expect(screen.getByText('21°C')).toBeTruthy();
    expect(screen.getByText('55%')).toBeTruthy();
    expect(screen.getByText('9 km/h')).toBeTruthy();
    expect(screen.getAllByText(/° \/ /)).toHaveLength(5); // min/max per day
    expect(screen.getByText(/Data: Open-Meteo/)).toBeTruthy();
  });

  it('network failure surfaces an honest retryable error', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    h.fetchWeather.mockRejectedValue(new Error('offline'));
    render(<WeatherApp />);
    expect(await screen.findByText(/Could not reach the forecast service/)).toBeTruthy();
  });

  it('search lists results and picking one loads and saves it', async () => {
    h.geocode.mockResolvedValue([OSLO, { name: 'Osaka', label: 'Osaka, Japan', lat: 34.7, lon: 135.5 }]);
    render(<WeatherApp />);
    fireEvent.change(screen.getByLabelText('Search location'), { target: { value: 'os' } });
    fireEvent.submit(screen.getByLabelText('Search location').closest('form'));
    expect(await screen.findByText('Oslo, Norway')).toBeTruthy();
    expect(screen.getByText('Osaka, Japan')).toBeTruthy();

    fireEvent.click(screen.getByText('Osaka, Japan'));
    await settle();
    expect(h.fetchWeather).toHaveBeenLastCalledWith(34.7, 135.5);
    expect(JSON.parse(localStorage.getItem('webos.weather.loc')).name).toBe('Osaka');
    expect(screen.getByText('Osaka')).toBeTruthy(); // results list cleared
    expect(screen.queryByText('Oslo, Norway')).toBeNull();
  });

  it('empty and failed searches report what happened', async () => {
    render(<WeatherApp />);
    h.geocode.mockResolvedValue([]);
    fireEvent.change(screen.getByLabelText('Search location'), { target: { value: 'zzzz' } });
    fireEvent.submit(screen.getByLabelText('Search location').closest('form'));
    expect(await screen.findByText(/No places matched .zzzz./)).toBeTruthy();

    h.geocode.mockRejectedValue(new Error('down'));
    fireEvent.change(screen.getByLabelText('Search location'), { target: { value: 'oslo' } });
    fireEvent.submit(screen.getByLabelText('Search location').closest('form'));
    expect(await screen.findByText(/geocoder could not be reached/)).toBeTruthy();
  });

  it('the units button converts the whole view and persists the choice', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    render(<WeatherApp />);
    await settle();
    fireEvent.click(screen.getByTitle(/Switch temperature/));
    await act(async () => {});
    expect(screen.getByText('71°F')).toBeTruthy(); // 21.4 °C → 70.52 °F → 71
    expect(screen.getByText('6 mph')).toBeTruthy(); // 9 km/h
    expect(loadUnitsIs()).toBe('imperial');
  });

  it('follows webos:units events from the sidebar widget', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    render(<WeatherApp />);
    await settle();
    await act(async () => { window.dispatchEvent(new CustomEvent('webos:units', { detail: 'imperial' })); });
    expect(screen.getByText('71°F')).toBeTruthy();
    expect(screen.getByText('0 in')).toBeTruthy(); // 0.2 mm → 0.008 in → 0
  });

  it('Forget location clears storage and returns to the empty state', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    render(<WeatherApp />);
    await settle();
    fireEvent.click(screen.getByText('Forget location'));
    await act(async () => {});
    expect(localStorage.getItem('webos.weather.loc')).toBeNull();
    expect(screen.getByText('No location set')).toBeTruthy();
  });

  it('Refresh refetches through the same callback', async () => {
    localStorage.setItem('webos.weather.loc', JSON.stringify(OSLO));
    render(<WeatherApp />);
    await settle();
    fireEvent.click(screen.getByText('Refresh'));
    await settle();
    expect(h.fetchWeather).toHaveBeenCalledTimes(2);
  });
});

function loadUnitsIs() {
  return localStorage.getItem('webos.weather.units') === 'imperial' ? 'imperial' : 'metric';
}

describe('WxIcon', () => {
  it('renders every known glyph; unknown ids fall back to cloud', () => {
    const ids = ['sun', 'moon', 'sun-cloud', 'moon-cloud', 'cloud', 'fog', 'drizzle', 'rain', 'snow', 'storm'];
    for (const id of ids) {
      const { container } = render(<WxIcon id={id} size={30} />);
      const svg = container.querySelector('svg');
      expect(svg.getAttribute('width')).toBe('30');
      expect(svg.querySelector('g')).toBeTruthy(); // glyph path group present
      cleanup();
    }
    const { container } = render(<WxIcon id="meteor" />);
    expect(container.querySelector('svg')).toBeTruthy(); // graceful fallback
  });
});
