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
      // Ratchet: floors sit just under the measured baseline (83.42/77.36/
      // 74.66/86.58 after the WASI syscall suite — the full imports()
      // surface driven against a scratch WebAssembly.Memory, which also
      // fixed path_open CREAT|DIRECTORY and implicit-dir rmdir ENOTEMPTY).
      // Raise as tests land; a regression in any metric fails `npm run
      // coverage`.
      thresholds: {
        statements: 83.4,
        branches: 77.3,
        functions: 74.6,
        lines: 86.5,
      },
    },
  },
});
