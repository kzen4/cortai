import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

// e2e/ roda no Playwright (npm run e2e), não no vitest
export default defineConfig({ resolve: { alias: { '@shared': resolve(__dirname, 'src/shared') } }, test: { include: ['src/**/*.test.ts'] } });
