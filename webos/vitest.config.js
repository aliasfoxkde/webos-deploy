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
      // Ratchet: floors sit just under the measured baseline (30.4/27.0/
      // 23.8/31.3 after B2's calculator suites: engine, programmer, state,
      // plot canvas). Raise as tests land; a regression in any metric fails
      // `npm run coverage`.
      thresholds: {
        statements: 29.9,
        branches: 26.5,
        functions: 23.3,
        lines: 30.8,
      },
    },
  },
});
