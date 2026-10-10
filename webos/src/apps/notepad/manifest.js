// Notepad plugin manifest (data only; see apps/components.js).
export default {
  id: 'notepad',
  singleInstance: true, // one notes window — the store is shared
  category: 'Utilities',
  name: 'Notepad',
  tagline: 'Quick notes, autosaved',
  version: '1.0',
  icon: 'icons/notepad.svg',
  accent: '#34d399',
  win: { w: 820, h: 560 },
};
