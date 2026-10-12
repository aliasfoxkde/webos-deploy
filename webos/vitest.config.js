import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'happy-dom',
    include: ['tests/**/*.test.{js,jsx}'],
    setupFiles: ['tests/setup.js'],
    // Coverage gate is ratcheted in CI (see docs/planning/QUALITY-PROGRAM.md);
    // locally this just reports.
    coverage: {
      provider: 'v8',
      include: ['src/**'],
      exclude: ['src/main.jsx', 'src/version.js'],
      reporter: ['text', 'lcov'],
      reportsDirectory: 'coverage',
      // Ratchet: floors sit just under the measured baseline (91.82/85.77/
      // 86.35/94.92 after the wosh remaining-branches suite — every settings
      // `set` path, completion pools, FS-cache failure fallback, pipeline +
      // sqlite error paths, clear/store/settings commands, ↓-past-history).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 91.8,
        branches: 85.7,
        functions: 86.3,
        lines: 94.9,
      },
    },
  },
});
