/* OS personas — one data record per reference desktop. The persona id lands
   on <body data-persona> and drives skin + chrome via CSS (see the persona
   block in styles.css); switching also applies the persona's defaults
   (theme preset, accent, taskbar side). Anything the user customizes
   afterwards simply wins until they re-apply a persona. Deep per-OS features
   (dock magnification physics, GNOME workspaces) are out of scope — visual
   and behavioral essence only. */
export const PERSONAS = [
  { id: 'win', label: 'Windows', tagline: 'Centered taskbar, acrylic, snap hints', preset: 'midnight', accent: '#38bdf8', taskbar: 'bottom', align: 'center' },
  { id: 'mac', label: 'macOS', tagline: 'Traffic lights, vibrancy, tight radii', preset: 'ocean', accent: '#60a5fa', taskbar: 'bottom', align: 'center' },
  { id: 'linux', label: 'GNOME / Linux', tagline: 'Top bar, centered titles, Adwaita calm', preset: 'forest', accent: '#34d399', taskbar: 'top', align: 'left' },
  { id: 'bsd', label: 'Tiling WM', tagline: 'Borders + gaps, mono, no shadows', preset: 'cobalt', accent: '#a78bfa', taskbar: 'top', align: 'left' },
  { id: 'android', label: 'Android', tagline: 'Material You, large radii, color', preset: 'sunset', accent: '#f472b6', taskbar: 'bottom', align: 'center' },
  { id: 'tui', label: 'Omarchy', tagline: 'Tokyo Night dark, waybar, keybind tiling', preset: 'omarchy', accent: '#7aa2f7', taskbar: 'top', align: 'left' },
];

export const personaOf = (id) => PERSONAS.find((p) => p.id === id) || PERSONAS[0];
