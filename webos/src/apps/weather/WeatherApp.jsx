import React, { useCallback, useEffect, useState } from 'react';
import { geocode, fetchWeather, wmo, loadLoc, saveLoc } from './api.js';
import WxIcon from './WxIcon.jsx';
import './weather.css';

const round = (n) => (Number.isFinite(n) ? Math.round(n) : '–');

export default function WeatherApp() {
  const [loc, setLoc] = useState(loadLoc);
  const [data, setData] = useState(null);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  const refresh = useCallback(async (place = loc) => {
    if (!place) return;
    setBusy(true);
    setErr('');
    try {
      setData(await fetchWeather(place.lat, place.lon));
    } catch {
      setErr('Could not reach the forecast service. Check your connection and retry.');
    } finally {
      setBusy(false);
    }
  }, [loc]);

  useEffect(() => { refresh(loc); }, [refresh, loc]);

  const search = async (e) => {
    e.preventDefault();
    const query = q.trim();
    if (!query) return;
    setBusy(true);
    setErr('');
    try {
      const found = await geocode(query);
      setResults(found.length ? found : null);
      if (!found.length) setErr(`No places matched “${query}”.`);
    } catch {
      setErr('Search failed — the geocoder could not be reached.');
    } finally {
      setBusy(false);
    }
  };

  const pick = (place) => {
    setResults(null);
    setQ('');
    saveLoc(place);
    setLoc(place);
  };

  const cur = data?.current;
  const cond = cur ? wmo(cur.code, cur.isDay) : null;

  return (
    <div className="weather">
      <form className="wx-search" onSubmit={search}>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search a city…"
          aria-label="Search location"
        />
        <button className="btn" disabled={busy}>{busy ? '…' : 'Search'}</button>
      </form>

      {results ? (
        <div className="wx-results">
          {results.map((r) => (
            <button key={`${r.lat},${r.lon}`} className="wx-result" onClick={() => pick(r)}>
              {r.label}
            </button>
          ))}
        </div>
      ) : null}

      {err ? <p className="wx-err">{err}</p> : null}

      {!loc && !results ? (
        <div className="wx-empty">
          <WxIcon id="sun-cloud" size={72} />
          <h3>No location set</h3>
          <p>Search for a city above — your choice is saved in this browser only.</p>
        </div>
      ) : null}

      {loc && cur && cond ? (
        <>
          <header className="wx-head">
            <div>
              <h3>{loc.name}</h3>
              <span className="dim">{cond.label} · feels like {round(cur.feels)}°</span>
            </div>
            <button className="btn" onClick={() => refresh()} disabled={busy}>Refresh</button>
          </header>
          <div className="wx-now">
            <span className="wx-glyph"><WxIcon id={cond.icon} size={96} /></span>
            <span className="wx-temp">{round(cur.temp)}°</span>
            <ul className="wx-stats">
              <li><em>Humidity</em>{round(cur.humidity)}%</li>
              <li><em>Wind</em>{round(cur.wind)} km/h</li>
              <li><em>Precip</em>{round(cur.precip)} mm</li>
            </ul>
          </div>
          <div className="wx-days">
            {data.days.map((d) => {
              const c = wmo(d.code, true);
              const day = new Date(`${d.date}T12:00:00`).toLocaleDateString([], { weekday: 'short' });
              return (
                <div key={d.date} className="wx-day">
                  <span className="wx-dayname">{day}</span>
                  <WxIcon id={c.icon} size={30} />
                  <span className="wx-range">{round(d.min)}° / {round(d.max)}°</span>
                  <span className="dim wx-pop">{d.pop}%</span>
                </div>
              );
            })}
          </div>
          <button
            className="wx-forget"
            onClick={() => { saveLoc(null); setLoc(null); setData(null); }}
          >
            Forget location
          </button>
          <p className="dim wx-src">Data: Open-Meteo (open-meteo.com) · fetched directly by your browser</p>
        </>
      ) : null}

      {loc && !cur && !err && busy ? <p className="dim">Loading forecast…</p> : null}
    </div>
  );
}
