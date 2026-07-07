import { defineConfig } from 'vitest/config';

// Frontend unit tests. Scoped to pure logic (no DOM needed), so the default
// node environment is used — component/DOM tests can add jsdom later.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.{test,spec}.ts'],
    passWithNoTests: false,
  },
});
