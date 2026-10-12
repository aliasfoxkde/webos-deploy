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
      // Ratchet: floors sit just under the measured baseline (90.42/84.66/
      // 85.08/94.17 after the app-shell part-2 suite — every context-menu
      // branch, the desktop icon drag machine over pinned rects, virtual
      // window chrome, GroupPopup wiring, power paths, tiling branches,
      // mobile drawer and the fx-wallpaper mount).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 90.4,
        branches: 84.6,
        functions: 85.0,
        lines: 94.1,
      },
    },
  },
});
