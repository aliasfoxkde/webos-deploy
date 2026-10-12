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
      // Ratchet: floors sit just under the measured baseline (88.02/82.31/
      // 82.39/91.71 after the calc-modes + appearance-panel suites — all five
      // calculator mode surfaces driven through real clicks against the real
      // engine, and the Appearance panel's persona/interface/accent/wallpaper/
      // studio controls incl. upload size guards and the float cap).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 88.0,
        branches: 82.3,
        functions: 82.3,
        lines: 91.7,
      },
    },
  },
});
