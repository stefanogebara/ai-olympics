// ESLint 9 flat config for the backend (src/) and e2e specs.
// Pragmatic baseline: real type-aware-adjacent rules that catch genuine bugs,
// with the noisiest stylistic rules relaxed so the gate is meaningful (a red
// build means a real problem, not a style nit). Tighten over time.
import js from '@eslint/js';
import globals from 'globals';
import tsParser from '@typescript-eslint/parser';
import tsPlugin from '@typescript-eslint/eslint-plugin';

export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'playwright-report/**',
      'test-results/**',
      'frontend/**', // frontend has its own toolchain
      '**/*.js',
      '**/*.cjs',
      '**/*.mjs',
      'src/tasks/**', // static task HTML/JS fixtures
    ],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.ts', 'e2e/**/*.ts', 'scripts/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    plugins: { '@typescript-eslint': tsPlugin },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      // Downgrade the high-volume stylistic rules on an existing codebase.
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],
      // These catch real bugs — keep them as errors.
      'no-console': 'off',
      'no-constant-condition': ['error', { checkLoops: false }],
      'no-undef': 'off', // TS handles this; avoids false positives on globals
      '@typescript-eslint/no-non-null-asserted-optional-chain': 'error',
      '@typescript-eslint/no-misused-new': 'error',
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Intentional or purely-stylistic patterns in the existing codebase —
      // surfaced as warnings, not gate failures. Tighten case-by-case later.
      'no-control-regex': 'off', // deliberate control-char matching in input sanitizers
      'no-useless-escape': 'warn',
      'no-case-declarations': 'warn',
      '@typescript-eslint/no-unsafe-function-type': 'warn',
      '@typescript-eslint/no-this-alias': 'warn',
    },
  },
];
