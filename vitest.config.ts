import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Only run unit tests from src/, exclude Playwright e2e tests
    include: ['src/**/*.{test,spec}.{ts,tsx}'],
    exclude: ['e2e/**', 'node_modules/**', 'dist/**', 'frontend/**'],
    passWithNoTests: true,
  },
});
