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
      // Ratchet: floors sit just under the measured baseline (77.23/72.06/
      // 69.73/80.27 after the store fourth wave + Settings singleton work).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 77.3,
        branches: 72,
        functions: 69.9,
        lines: 80.3,
      },
    },
  },
});
