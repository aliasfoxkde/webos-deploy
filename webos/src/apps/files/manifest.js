// Files plugin manifest. Data only — UI components are wired in
// apps/components.js so the OS registry stays import-cycle free.
export default {
  id: 'files',
  category: 'Utilities',
  name: 'Files',
  tagline: 'Virtual disk · upload · device browse',
  version: '1.0',
  icon: 'icons/files.svg',
  accent: '#38bdf8',
  win: { w: 880, h: 560 },
};
