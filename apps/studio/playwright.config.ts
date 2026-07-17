import { defineConfig } from '@playwright/test';

// The scripted story UAT (uat/ — see stories/studio/story.md § "UAT Test Criteria").
// Deliberately SEPARATE from `pnpm test` (vitest): it boots the real dev server and a real
// chromium, so it is slower and needs a one-time `pnpm exec playwright install chromium`.
// Run it with `pnpm --filter studio uat`.
//
// Offline by design: the dev server is pinned to the json store (ADR-0010 §5's mock-UAT
// seam — the cross-story live-store seam may be stubbed; everything in-story is real).
// Port 5174 so a live studio session on 5173 is never disturbed.
export default defineConfig({
  testDir: './uat',
  timeout: 60_000,
  // One operator, one journey — the UAT is a single sequential walkthrough.
  fullyParallel: false,
  workers: 1,
  use: {
    baseURL: 'http://127.0.0.1:5174',
    trace: 'retain-on-failure',
  },
  webServer: {
    // --host 127.0.0.1: vite's default `localhost` can bind IPv6-only (::1) on Windows,
    // which the readiness poll against 127.0.0.1 would never see.
    command: 'node --import tsx node_modules/vite/bin/vite.js --port 5174 --strictPort --host 127.0.0.1',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: false,
    timeout: 120_000,
    env: { STORYTREE_STUDIO_STORE: 'json' },
  },
});
