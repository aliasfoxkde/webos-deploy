// Open-Meteo client — free, keyless, no CORS issues. Pure functions, all
// network errors surface as thrown Errors for the caller to render.

export const KEY = 'webos.weather.loc';
export const loadLoc = () => {
  try { return JSON.parse(localStorage.getItem(KEY)) || null; } catch { return null; }
};
export const saveLoc = (loc) => {
  try {
    if (loc) localStorage.setItem(KEY, JSON.stringify(loc));
    else localStorage.removeItem(KEY);
  } catch { /* private mode */ }
};

/* ---- units (metric | imperial), shared by the app and the sidebar widget ----
   Open-Meteo always returns metric (°C, km/h, mm); conversion happens at
   render time so the raw fetch stays unit-pure. Components broadcast
   'webos:units' so both views flip together. */
const UNITS_KEY = 'webos.weather.units';
export const loadUnits = () => {
  try { return localStorage.getItem(UNITS_KEY) === 'imperial' ? 'imperial' : 'metric'; } catch { return 'metric'; }
};
export const saveUnits = (u) => {
  try { localStorage.setItem(UNITS_KEY, u === 'imperial' ? 'imperial' : 'metric'); } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('webos:units', { detail: u }));
};
export const fmtTemp = (celsius, units) => (units === 'imperial' ? celsius * 9 / 5 + 32 : celsius);
export const fmtWind = (kmh, units) => (units === 'imperial' ? kmh / 1.609344 : kmh);
export const fmtPrecip = (mm, units) => (units === 'imperial' ? mm / 25.4 : mm);
export const UNITS_LABEL = {
  metric: { temp: '°C', wind: 'km/h', precip: 'mm' },
  imperial: { temp: '°F', wind: 'mph', precip: 'in' },
};

export async function geocode(q) {
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`geocoder ${res.status}`);
  const data = await res.json();
  return (data.results || []).map((r) => ({
    name: r.name,
    label: [r.name, r.admin1, r.country].filter(Boolean).join(', '),
    lat: r.latitude,
    lon: r.longitude,
  }));
}

export async function fetchWeather(lat, lon) {
  const params = new URLSearchParams({
    latitude: String(lat),
    longitude: String(lon),
    current: 'temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max',
    timezone: 'auto',
    forecast_days: '6',
  });
  const res = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);
  if (!res.ok) throw new Error(`forecast ${res.status}`);
  const d = await res.json();
  const days = d.daily.time.map((t, i) => ({
    date: t,
    code: d.daily.weather_code[i],
    max: d.daily.temperature_2m_max[i],
    min: d.daily.temperature_2m_min[i],
    pop: d.daily.precipitation_probability_max?.[i] ?? 0,
  }));
  return {
    current: {
      temp: d.current.temperature_2m,
      feels: d.current.apparent_temperature,
      humidity: d.current.relative_humidity_2m,
      wind: d.current.wind_speed_10m,
      precip: d.current.precipitation,
      code: d.current.weather_code,
      isDay: !!d.current.is_day,
    },
    days: days.slice(1, 6), // forecast = next 5 days
    units: d.current_units?.temperature_2m || '°C',
  };
}

// WMO weather interpretation codes → { label, icon }. Icons are drawn by
// WxIcon (SVG components in WeatherApp.jsx), selected by `icon` id.
export function wmo(code, isDay = true) {
  const table = [
    [[0], isDay ? 'sun' : 'moon', isDay ? 'Clear sky' : 'Clear night'],
    [[1], isDay ? 'sun-cloud' : 'moon-cloud', 'Mainly clear'],
    [[2], 'sun-cloud', 'Partly cloudy'],
    [[3], 'cloud', 'Overcast'],
    [[45, 48], 'fog', 'Fog'],
    [[51, 53, 55], 'drizzle', 'Drizzle'],
    [[56, 57], 'drizzle', 'Freezing drizzle'],
    [[61, 63, 65], 'rain', 'Rain'],
    [[66, 67], 'rain', 'Freezing rain'],
    [[71, 73, 75], 'snow', 'Snowfall'],
    [[77], 'snow', 'Snow grains'],
    [[80, 81, 82], 'rain', 'Rain showers'],
    [[85, 86], 'snow', 'Snow showers'],
    [[95], 'storm', 'Thunderstorm'],
    [[96, 99], 'storm', 'Thunderstorm + hail'],
  ];
  for (const [codes, icon, label] of table) if (codes.includes(code)) return { icon, label };
  return { icon: 'cloud', label: 'Unknown' };
}
