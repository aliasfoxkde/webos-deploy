// Weather client: preference storage, unit math, WMO mapping, and the two
// fetch wrappers against a stubbed fetch (no network in tests).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  KEY, loadLoc, saveLoc, loadUnits, saveUnits,
  fmtTemp, fmtWind, fmtPrecip, UNITS_LABEL, wmo, geocode, fetchWeather,
} from '../src/apps/weather/api.js';

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('location + unit preferences', () => {
  it('loadLoc returns null when unset or corrupt', () => {
    expect(loadLoc()).toBeNull();
    localStorage.setItem(KEY, '{not json');
    expect(loadLoc()).toBeNull();
  });

  it('saveLoc round-trips; saving null removes', () => {
    const loc = { name: 'Reykjavík', lat: 64.1, lon: -21.9 };
    saveLoc(loc);
    expect(loadLoc()).toEqual(loc);
    saveLoc(null);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it('units default to metric and clamp invalid writes', () => {
    expect(loadUnits()).toBe('metric');
    saveUnits('imperial');
    expect(loadUnits()).toBe('imperial');
    saveUnits('bananas');
    expect(loadUnits()).toBe('metric');
  });

  it('saving units broadcasts webos:units for app + widget sync', () => {
    const events = [];
    const hear = (e) => events.push(e.detail);
    window.addEventListener('webos:units', hear);
    saveUnits('imperial');
    window.removeEventListener('webos:units', hear);
    expect(events).toEqual(['imperial']);
  });
});

describe('unit conversions', () => {
  it('converts each measure for imperial, identity for metric', () => {
    expect(fmtTemp(100, 'imperial')).toBeCloseTo(212);
    expect(fmtTemp(20, 'metric')).toBe(20);
    expect(fmtWind(16.09344, 'imperial')).toBeCloseTo(10);
    expect(fmtPrecip(25.4, 'imperial')).toBeCloseTo(1);
    expect(UNITS_LABEL.imperial.temp).toBe('°F');
    expect(UNITS_LABEL.metric.precip).toBe('mm');
  });
});

describe('wmo codes', () => {
  it('maps representative codes to icon + label', () => {
    expect(wmo(0)).toEqual({ icon: 'sun', label: 'Clear sky' });
    expect(wmo(0, false)).toEqual({ icon: 'moon', label: 'Clear night' });
    expect(wmo(63)).toEqual({ icon: 'rain', label: 'Rain' });
    expect(wmo(95)).toEqual({ icon: 'storm', label: 'Thunderstorm' });
  });

  it('unknown codes fall back to a cloud, never throw', () => {
    expect(wmo(9999)).toEqual({ icon: 'cloud', label: 'Unknown' });
  });

  it('every documented code lands in the table', () => {
    const known = [0, 1, 2, 3, 45, 48, 51, 53, 55, 56, 57, 61, 63, 65, 66, 67,
      71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99];
    // the fallback's label is 'Unknown'; overcast's real entry also uses the
    // cloud icon, so label is the discriminator
    for (const c of known) expect(wmo(c).label).not.toBe('Unknown');
  });
});

describe('geocode', () => {
  it('maps results to {name,label,lat,lon}, skipping empties in the label', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [
        { name: 'Oslo', admin1: 'Oslo', country: 'Norway', latitude: 59.9, longitude: 10.7 },
        { name: 'Paris', admin1: null, country: 'France', latitude: 48.8, longitude: 2.3 },
      ] }),
    })));
    const hits = await geocode('os');
    expect(hits).toEqual([
      { name: 'Oslo', label: 'Oslo, Oslo, Norway', lat: 59.9, lon: 10.7 },
      { name: 'Paris', label: 'Paris, France', lat: 48.8, lon: 2.3 },
    ]);
    expect(vi.mocked(fetch).mock.calls[0][0]).toContain('name=os');
  });

  it('an empty result set and an HTTP error are honest', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => ({}) })));
    expect(await geocode('nowhere')).toEqual([]);
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 500 })));
    await expect(geocode('x')).rejects.toThrow('geocoder 500');
  });
});

describe('fetchWeather', () => {
  const payload = {
    current: {
      temperature_2m: 12, relative_humidity_2m: 70, apparent_temperature: 10,
      is_day: 1, precipitation: 0, weather_code: 3, wind_speed_10m: 9,
    },
    current_units: { temperature_2m: '°C' },
    daily: {
      time: ['2026-10-09', '2026-10-10', '2026-10-11', '2026-10-12', '2026-10-13', '2026-10-14'],
      weather_code: [3, 0, 61, 61, 95, 1],
      temperature_2m_max: [12, 13, 11, 10, 9, 14],
      temperature_2m_min: [4, 5, 6, 5, 3, 7],
      precipitation_probability_max: [10, 0, 80, 90, 60, 5],
    },
  };

  it('shapes current + the next five days', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => payload })));
    const wx = await fetchWeather(64.1, -21.9);
    expect(wx.current).toEqual({
      temp: 12, feels: 10, humidity: 70, wind: 9, precip: 0, code: 3, isDay: true,
    });
    expect(wx.days).toHaveLength(5);
    expect(wx.days[0]).toEqual({ date: '2026-10-10', code: 0, max: 13, min: 5, pop: 0 });
    expect(wx.days[4].code).toBe(1);
    expect(wx.units).toBe('°C');
  });

  it('defaults pop to 0 when the field is missing, isDay casts to boolean', async () => {
    const thin = {
      current: { ...payload.current, is_day: 0 },
      daily: { ...payload.daily, precipitation_probability_max: undefined },
    };
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, json: async () => thin })));
    const wx = await fetchWeather(1, 2);
    expect(wx.days.every((d) => d.pop === 0)).toBe(true);
    expect(wx.current.isDay).toBe(false);
  });

  it('HTTP errors surface as Errors', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 503 })));
    await expect(fetchWeather(1, 2)).rejects.toThrow('forecast 503');
  });
});
