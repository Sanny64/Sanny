import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import baseConfig from '../../../apps/frontend/vitest.config.ts';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    root: fileURLToPath(new URL('.', import.meta.url)),
    environment: 'jsdom',
    setupFiles: [
      fileURLToPath(new URL('./src/tests/setup.ts', import.meta.url)),
    ],
    include: ['src/tests/**/*.test.{ts,tsx}'],
  },
});
