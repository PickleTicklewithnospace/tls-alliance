// Vitest config kept separate from vite.config.js so the dev server stays
// untouched. We scope unit tests to src/ and exclude the Playwright
// end-to-end suite in tests/, which Playwright runs on its own.
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.js'],
    environment: 'node',
  },
});
