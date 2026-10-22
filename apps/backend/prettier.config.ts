import type { Config } from 'prettier';
import baseConfig from '../../prettier.config.ts';

const config: Config = {
  ...baseConfig,
  overrides: [
    {
      files: 'apps/backend/auth0/**',
      options: {
        experimentalTernaries: true,
      },
    },
  ],
};

export default config;
