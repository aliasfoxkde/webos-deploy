import React from 'react';

/* Hand-drawn SVG weather glyphs (clean-room, stroke-based). Kept separate
   from WeatherApp.jsx so the sidebar widget can use them without pulling the
   whole app into the shell bundle (WeatherApp stays a lazy chunk). */
export default function WxIcon({ id, size = 64 }) {
  const s = { fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' };
  const glyphs = {
    sun: (<g {...s}><circle cx="12" cy="12" r="4.2" /><path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" /></g>),
    moon: (<g {...s}><path d="M19.5 14.2A7.8 7.8 0 0 1 9.8 4.5a7.8 7.8 0 1 0 9.7 9.7Z" /><path d="M17 4l.5 1.5L19 6l-1.5.5L17 8l-.5-1.5L15 6l1.5-.5Z" /></g>),
    'sun-cloud': (<g {...s}><circle cx="8" cy="8" r="3" /><path d="M8 2.6v1.6M2.6 8h1.6M4.2 4.2l1.2 1.2M11.8 4.2l-1.2 1.2" /><path d="M9 20h8.2a3 3 0 0 0 .4-6 4.4 4.4 0 0 0-8.4-1.2A2.9 2.9 0 0 0 9 20Z" /></g>),
    'moon-cloud': (<g {...s}><path d="M8.5 9.2A3.6 3.6 0 0 1 12 4.4a3.6 3.6 0 0 0-4.8 4.8Z" /><path d="M9 20h8.2a3 3 0 0 0 .4-6 4.4 4.4 0 0 0-8.4-1.2A2.9 2.9 0 0 0 9 20Z" /></g>),
    cloud: (<g {...s}><path d="M7 18h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 18Z" /></g>),
    fog: (<g {...s}><path d="M7 14h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 14Z" /><path d="M5 17.4h13M6.6 20.4h9.8" /></g>),
    drizzle: (<g {...s}><path d="M7 13h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 13Z" /><path d="M9 16.4l-.8 2M12.6 16.4l-.8 2M16.2 16.4l-.8 2" /></g>),
    rain: (<g {...s}><path d="M7 13h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 13Z" /><path d="M8.6 15.8 7.4 19.6M12.4 15.8l-1.2 3.8M16.2 15.8 15 19.6" /></g>),
    snow: (<g {...s}><path d="M7 13h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 13Z" /><path d="M8.4 17.2v.1M12 19.4v.1M15.6 17.2v.1" strokeWidth="2.6" /></g>),
    storm: (<g {...s}><path d="M7 12h9.6a3.4 3.4 0 0 0 .5-6.8 5 5 0 0 0-9.6-1.4A3.3 3.3 0 0 0 7 12Z" /><path d="M13.4 13.4 10.6 17h3l-2.2 4" /></g>),
  };
  return <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden="true">{glyphs[id] || glyphs.cloud}</svg>;
}
