// ESLint 9 flat config. Base: js recommended + React hooks correctness +
// jsx-a11y recommended (accessibility is a CI concern — see
// docs/planning/QUALITY-PROGRAM.md phase 6 for the AAA contrast pass).
import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import jsxA11y from 'eslint-plugin-jsx-a11y';
import react from 'eslint-plugin-react';

export default [
  { ignores: ['dist/', 'node_modules/', 'vendor/', 'coverage/'] },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      parserOptions: { ecmaFeatures: { jsx: true } },
      globals: { ...globals.browser, ...globals.node },
    },
  },
  {
    files: ['**/*.jsx', '**/*.js'],
    plugins: { 'react-hooks': reactHooks, 'jsx-a11y': jsxA11y, react },
    rules: {
      ...reactHooks.configs.flat?.recommended?.rules,
      ...jsxA11y.flatConfigs.recommended.rules,
      // Mark JSX identifiers as variable uses — without these, core
      // no-unused-vars flags every component/prop reference as unused.
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'error',
      // shipped browser app: development-only logging must not land
      'no-console': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  {
    files: ['tests/**/*.js', 'tests/**/*.jsx', 'scripts/**/*.mjs'],
    rules: {
      // test/driver code logs intentionally
      'no-console': 'off',
    },
  },
];
