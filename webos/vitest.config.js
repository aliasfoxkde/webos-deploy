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
      // Ratchet: floors sit just under the measured baseline (33.1/30.5/
      // 26.3/34.1 after the Browser suites: urls, tabs reducer, app shell).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 32.5,
        branches: 29.9,
        functions: 25.8,
        lines: 33.5,
      },
    },
  },
});
