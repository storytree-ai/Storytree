import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Unit/integration tests for the studio (the only React/Vite workspace — vitest reuses the
// app's own Vite transform for TSX, where the pure-Node packages use node:test). Offline by
// design: no DB, no gcloud (the db tests run against a fake shim), no network. The dev-API
// plugin is deliberately NOT loaded here — server code is imported directly by its tests.
// Environment is node; the component tests opt into jsdom per-file (@vitest-environment).
export default defineConfig({
  plugins: [react()],
  test: {
    include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    environment: 'node',
    // Alias `self`→globalThis before any suite loads: the node-env pure-logic suites now transitively
    // import @xterm/addon-fit (via TreeView → TerminalDock, ADR-0174), whose UMD wrapper reads a bare
    // `self` at load. Harmless under jsdom, which already defines `self`. See vitest.setup.ts.
    setupFiles: ['./vitest.setup.ts'],
    // Under `pnpm -r test` this suite shares the box with three other packages' suites while
    // vitest runs a fork per core — vitest's default 5s testTimeout then kills starved (but
    // functionally sound) tests mid-fetch, and the killed test's still-in-flight request lands
    // LATER, mutating the file's shared stub state under a subsequent test (the observed
    // signed.length +1 cross-test bleed). No test here depends on wall-clock speed — the only
    // timing behaviours under test use their own injected deadlines — so a generous ceiling
    // trades nothing: a genuine hang still fails, load-induced slowness no longer does.
    testTimeout: 60_000,
    hookTimeout: 60_000,
  },
});
