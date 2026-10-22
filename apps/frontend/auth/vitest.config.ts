import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
import baseConfig from '../vitest.config.ts';

export default defineConfig({
  ...baseConfig,
  test: {
    ...baseConfig.test,
    name: 'auth',
    root: fileURLToPath(new URL('.', import.meta.url)),
    include: ['src/**/*.test.{ts,tsx}'],
  },
});
