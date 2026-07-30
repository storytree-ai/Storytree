import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
    // `pnpm -r test` runs this React/CSS suite alongside other package suites. Under that
    // aggregate load Vitest's 5s default can expire otherwise-green selector/render tests;
    // their timing contracts use injected clocks and never assert wall-clock performance.
    // Match Studio's bounded ceiling so load-induced starvation cannot masquerade as a
    // semantic failure while a genuine hang still fails the gate.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
