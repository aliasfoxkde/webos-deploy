// Terminal plugin manifest. Data only — UI components are wired in
// apps/components.js so the OS registry stays import-cycle free.
export default {
  id: 'terminal',
  category: 'Development',
  name: 'Terminal',
  tagline: 'JS / shell console',
  version: '1.1',
  icon: 'icons/terminal.svg',
  accent: '#4ade80',
  win: { w: 720, h: 460 },
};
