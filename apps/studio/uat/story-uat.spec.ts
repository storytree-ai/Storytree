// The scripted shadow of the studio Story UAT (stories/studio/story.md § "UAT Test Criteria") —
// one coherent operator journey against the REAL running studio (real dev server, real browser,
// real /api/* middleware, real seeded corpus). The only stub is the cross-story live-store seam:
// the server is pinned to the offline json backend (playwright.config.ts,
// STORYTREE_STUDIO_STORE=json) — ADR-0010 §5's mock-UAT allowance; in-story collaborators stay
// real. No Cloud SQL, no network, no API keys.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// RE-POINTED AT THE APP'S OWN AFFORDANCES (2026-08-23). This file had drifted behind six accepted
// decisions and asserted retired chrome — `.brand-name` (a HUD brand chip ADR-0205 deleted) and
// `getByLabel('operator identity')` (an editable identity input ADR-0204 D4 deleted). It failed on
// the FIRST assertion of the first test, so the story's ONE reliability gate
// (`pnpm --filter studio uat`, studio#gate-1) was red and all thirteen machine legs stayed
// unsigned. What moved under it:
//   • ADR-0204      — the standalone Overview/Home page is retired; `/` lands on the FOREST map.
//   • ADR-0204 D4   — attribution is server-stamped; there is no editable operator input.
//   • ADR-0205      — the HUD brand chip is gone; the account avatar is the only floating control.
//   • ADR-0185 dec6 — the standalone `#/library` page is retired; the Library is a LENS in the
//                     forest's top drawer (`?overlay=library`), reached via its handle.
//   • ADR-0187 dec2 — an artifact opens in a full-detail OVERLAY over the map, not a route away.
//   • ADR-0267 D1 / ADR-0314 D6 — that drawer now has TWO lenses (Arcs | Library), arcs default.
//
// ─────────────────────────────────────────────────────────────────────────────────────────────
// WHAT IS STILL RED, AND WHY IT IS LEFT RED (ADR-0405 D4 — fix the cause, never weaken the
// assertion to chase a pass). Re-pointing the selectors does NOT make this gate green, because
// eight of the thirteen criteria describe surfaces the product no longer has. Each blocked leg
// below is written as the journey ITS CRITERION claims, so it fails at the missing affordance and
// will go green on its own the day that affordance lands — it is never skipped, never narrowed:
//
//   • Criteria 2, 3, 9 (the ADR document journey) — ADR-0403 dec 1 made decisions ROWS in the live
//     store and DELETED `docs/decisions/`. `#/doc/decisions/0002-…` answers "doc not found", and
//     the offline fixture corpus (`@storytree/library/fixture`, 20 artifacts) contains no `adr`
//     artifact at all, so ADR-0002 cannot be reached through the Library lens either. The app says
//     so itself: `deep-modules` renders its own ADR-0002 source as "(unknown doc)".
//   • Criteria 4, 5, 6, 12, 13 (the comment journey) — ADR-0146 replaced the block-anchored
//     comment surface with the CriticMarkup split-pane editor, and the replacement was never wired
//     to the comment store. `ReviewBlocks` (the only mounter of `InlineCommentThread`) is mounted
//     nowhere; nothing calls `api.createComment`, `api.updateComment` or `api.deleteComment` from
//     any mounted component. So the studio today has no way, through the UI, to post, resolve or
//     delete a comment. `stories/library-review/inline-comment-thread.md` already records this
//     reconciliation as an unfinished story-author follow-on, and
//     `remove-text-selection-anchoring.md` predicted exactly this failure mode ("or the surface is
//     left unable to comment").
//
// Both are product/corpus facts, not selector drift, and both are escalated rather than papered
// over. The five criteria the product CAN satisfy today (1, 7, 8, 10, 11) are driven in their own
// tests so their green is visible instead of being hidden behind an earlier red.
//
// The mutating tests write through the real handlers into the offline stores (git-tracked
// apps/studio/data/comments.json; the gitignored, first-run-seeded
// apps/studio/data/assets.runtime.json — ADR-0210) and MUST leave them at their seeded baseline: a
// beforeAll/afterAll snapshot-restore guard puts the baseline back if a test dies midway.

import { test, expect, type Page } from '@playwright/test';
import { spawn, spawnSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Comment, GuidanceAsset } from '../src/types';

const ADR_0002 = 'decisions/0002-work-hierarchy-story-capability-contract.md';
const ADR_0013 = 'decisions/0013-structured-corpus-markdown-as-view.md';
const DOC_URL = `/#/doc/${encodeURIComponent(ADR_0002)}`;

const studioDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const COMMENTS_FILE = path.join(studioDir, 'data', 'comments.json');
// ADR-0210: the offline backend serves a gitignored runtime store, seeded from the library fixture
// on first read — not the retired committed assets.json.
const ASSETS_FILE = path.join(studioDir, 'data', 'assets.runtime.json');

// The forest is a real Pixi world over a real /api/tree fetch; give the first paint room on a cold
// vite process without making a slow box look like a failure.
const WORLD_MS = 60_000;

// An assertion that is RED because the affordance does not exist should say so quickly rather than
// burn the whole test timeout waiting for something that can never appear.
const ABSENT_MS = 15_000;

/** Land on the forest and wait for the map route and its persistent drawer (criterion 1's surface). */
async function landOnForest(page: Page, at = '/'): Promise<void> {
  await page.goto(at);
  await expect(page.locator('[data-testid="tree-route"]')).toBeAttached({ timeout: WORLD_MS });
  await expect(page.locator('[data-testid="library-drawer"]')).toBeAttached({ timeout: WORLD_MS });
}

/**
 * Open the Library LENS the way an operator does: expand the forest's persistent top drawer from
 * its handle, then pick the Library lens (the drawer opens on Arcs, its primary slot since
 * ADR-0267 D1). Deliberately NOT a `?overlay=library` deep link — criterion 2 says "expand the
 * persistent Library drawer", so the handle is the affordance under test.
 */
async function openLibraryLens(page: Page): Promise<void> {
  const expand = page.locator('[data-testid="library-drawer-toggle"]');
  await expect(expand).toHaveAttribute('aria-label', 'expand library', { timeout: WORLD_MS });
  await expand.click();
  await page.locator('[data-testid="library-drawer-lens:library"]').click();
  await expect(page.locator('[data-testid="library-finder"]')).toBeVisible();
}

/** The lifecycle state the offline fixture's artifacts project onto (ADR-0196 D1 / ADR-0197 D2). */
async function selectLifecycle(page: Page, state: 'open' | 'active' | 'archived'): Promise<void> {
  await page.locator(`[data-testid="library-lifecycle-selector-${state}"]`).click();
  await expect(page.locator(`[data-testid="library-lifecycle-selector-${state}"]`)).toHaveAttribute(
    'aria-pressed',
    'true',
  );
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

// =============================================================================================
// Criteria 1, 7, 8 — the read slice the current product fully supports.
// =============================================================================================

test('story UAT (criteria 1, 7, 8): boot on the forest → browse the knowledge-derived Library lens → narrow it deterministically', async ({
  page,
  baseURL,
}) => {
  test.setTimeout(180_000);

  // —— Criterion 1: the persistence backbone is live and the app lands on the FOREST map.
  // The /api/* middleware answers (the world draws from /api/tree) and the offline-store status is
  // visible. The retired Overview page and pre-fold sidebar are asserted ABSENT rather than merely
  // unused — that absence is what the criterion claims ("no retired Overview page or pre-fold
  // sidebar is required"), and ADR-0205's brand chip is gone with them.
  await landOnForest(page);
  await expect(page.locator('.store-badge')).toHaveText('offline store (json)');
  await expect(page.locator('[data-testid="hud-avatar"]')).toBeVisible();
  await expect(page.locator('.brand-name, .hud-brand')).toHaveCount(0);
  await expect(page.locator('.sidebar')).toHaveCount(0);
  // The persistent Library drawer is the corpus entry point on the landing surface (ADR-0191) —
  // collapsed it is the top handle, so assert the handle's control rather than the panel's box.
  await expect(page.locator('[data-testid="library-drawer-toggle"]')).toBeVisible();

  // —— Criterion 7: the Library lens renders the knowledge-derived corpus, one row per non-empty
  // category with live counts. The expected counts are READ FROM THE DERIVATION SEAM as actually
  // served (`/api/assets` — the offline backend seeds it from
  // `deriveOfflineAssets(loadFixtureSeedUnits())`, ADR-0210) and never pinned: the fixture is a
  // small offline sandbox that drifts from the live Library by design (ADR-0302 D1), so this
  // proves the derivation is WIRED, not that the offline Library mirrors the corpus.
  await openLibraryLens(page);

  const served = (await (await fetch(`${baseURL}/api/assets`)).json()) as GuidanceAsset[];
  expect(served.length).toBeGreaterThan(0);

  // Every derived asset projects onto exactly ONE lifecycle state, so the three shelves partition
  // the served corpus. Reading all three also proves the selector governs the whole panel
  // (ADR-0197 D2/D3) rather than one category's rail.
  let shelfTotal = 0;
  for (const state of ['open', 'active', 'archived'] as const) {
    await selectLifecycle(page, state);
    const rows = page.locator('[data-testid="library-shelf"] .library-shelf-row');
    for (const text of await rows.locator('.library-shelf-row-count').allTextContents()) {
      const n = Number(text);
      expect(n).toBeGreaterThan(0); // a rendered row is a NON-EMPTY category
      shelfTotal += n;
    }
  }
  expect(shelfTotal).toBe(served.length);

  // —— Criterion 8: narrow by the declared lifecycle/category scope, then by search — the finder
  // end-to-end, with the forest still the underlying surface.
  await selectLifecycle(page, 'active');
  const shelfRows = page.locator('[data-testid="library-shelf"] .library-shelf-row');
  await expect(shelfRows.first()).toBeVisible();
  const principleRow = page.locator('[data-testid="library-shelf-row-principle"]');
  const principleCount = Number(await principleRow.locator('.library-shelf-row-count').textContent());
  expect(principleCount).toBeGreaterThan(0);

  await principleRow.click();
  await expect(page.locator('[data-testid="library-scope-chip"]')).toContainText('principle');
  await expect(page.locator('[data-testid="library-finder-results"] .library-finder-row')).toHaveCount(
    principleCount,
  );

  await page.locator('.library-finder-input').fill('deep');
  await expect(page.locator('[data-testid="library-finder-row-deep-modules"]')).toBeVisible();
  expect(
    await page.locator('[data-testid="library-finder-results"] .library-finder-row').count(),
  ).toBeLessThan(principleCount);

  // The lens is an overlay within the world frame, never a route away (ADR-0185 dec 6).
  await expect(page.locator('[data-testid="tree-route"]')).toBeAttached();
});

// =============================================================================================
// Criterion 9 — RED. The overlay half works; the citation hop has no target since ADR-0403 dec 1.
// =============================================================================================

test('story UAT (criterion 9): open deep-modules in the full-detail overlay → follow its ADR-0002 source back to the corpus', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await landOnForest(page);
  await openLibraryLens(page);
  await selectLifecycle(page, 'active');
  await page.locator('.library-finder-input').fill('deep');
  await page.locator('[data-testid="library-finder-row-deep-modules"]').click();

  // The selection card's Open control raises the SEPARATE full-detail overlay over the map
  // (ADR-0187 dec 2) — the artifact's derived body and its Sources, rendered by the byte-locked
  // LibraryDiveBody → AssetView router.
  await page.locator('[data-testid="library-selection-card"]').getByLabel('Open').click();
  const overlay = page.locator('[data-testid="library-open-overlay"]');
  await expect(overlay).toBeVisible();
  await expect(overlay.locator('article.asset-detail h1')).toHaveText('Deep modules');
  await expect(overlay.locator('.asset-refs h4')).toHaveText('Sources');

  // …and the Library → corpus seam: the cited ADR opens as real document markdown.
  //
  // RED, and left red (ADR-0405 D4). ADR-0403 dec 1 made decisions rows in the live store and
  // deleted `docs/decisions/`, so this citation resolves to nothing — AssetView renders it as the
  // literal text "(unknown doc)" rather than a link. The criterion claims a working citation hop;
  // satisfying it needs the story's ADR journey re-authored onto the store-backed decision tier
  // (story-author work), not a weaker assertion here.
  await overlay
    .locator(`.asset-refs a[href="#/doc/${encodeURIComponent(ADR_0002)}"]`)
    .click({ timeout: ABSENT_MS });
  await expect(page.locator('article.doc h1').first()).toBeVisible();
});

// =============================================================================================
// Criteria 2, 3 — RED. The ADR document journey has no subject since ADR-0403 dec 1.
// =============================================================================================

test('story UAT (criteria 2, 3): open ADR-0002 through the Library-and-document chrome → follow an in-corpus cross-link', async ({
  page,
}) => {
  test.setTimeout(180_000);

  await landOnForest(page);
  await openLibraryLens(page);

  // —— Criterion 2: find ADR-0002 in the Library lens and open it in the full-detail overlay,
  // while the only global HUD chrome remains the verified-identity avatar (ADR-0205).
  await expect(page.locator('[data-testid="hud-avatar"]')).toBeVisible();
  await expect(page.locator('.hud-brand, .brand-name')).toHaveCount(0);

  // RED, and left red (ADR-0405 D4). The offline fixture corpus holds no `adr` artifact, so the
  // Decisions scope is empty in every lifecycle state and ADR-0002 cannot be reached through the
  // lens; `#/doc/decisions/…` answers "doc not found" for the same reason (ADR-0403 dec 1 deleted
  // `docs/decisions/`). The criterion's success condition — "the real docs/ markdown renders" —
  // names a source of truth the corpus retired.
  await selectLifecycle(page, 'active');
  // The Decisions scope is where an ADR lives in the lens (the `adr` category's shelf row). It
  // renders in no lifecycle state offline, because the fixture holds no `adr` artifact.
  await expect(page.locator('[data-testid="library-shelf-decisions-row"]')).toBeVisible({
    timeout: ABSENT_MS,
  });
  await page.locator('[data-testid="library-shelf-decisions-row"]').click();
  await page.locator('.library-finder-input').fill('0002');
  await page.locator('[data-testid="library-finder-results"] .library-finder-row').first().click();
  await page.locator('[data-testid="library-selection-card"]').getByLabel('Open').click();
  await expect(
    page.locator('[data-testid="library-open-overlay"] article.doc h1').first(),
  ).toContainText('ADR-0002');

  // —— Criterion 3: the in-corpus cross-link hop — ADR-0013 cites ADR-0002, resolveDocHref turns
  // the docs-root-relative link into an internal nav, and Back restores the prior document.
  await page.goto(`/#/doc/${encodeURIComponent(ADR_0013)}`);
  await expect(page.locator('article.doc h1').first()).toBeVisible();
  await page.locator(`article.doc a[href="#/doc/${encodeURIComponent(ADR_0002)}"]`).first().click();
  await expect(page.locator('article.doc h1').first()).toContainText('ADR-0002');
  await page.goBack();
  await expect(page.locator('article.doc h1').first()).toBeVisible();
});

// =============================================================================================
// Criteria 4, 5, 6 — RED. The studio has no mounted comment post/resolve surface (ADR-0146 swap).
// =============================================================================================

test('story UAT (criteria 4, 5, 6): anchor a comment with verified attribution → reload recovers it → resolve fans out', async ({
  page,
}) => {
  test.setTimeout(180_000);

  // —— Criterion 4: open the document's review affordance, target the declared block, and post the
  // probe comment. The criterion is explicit that attribution is SERVER-stamped and that there is
  // no editable operator-identity input (ADR-0204 D4) — so the journey opens Review and posts,
  // it never types an identity.
  await page.goto('/#/asset/deep-modules');
  await expect(page.locator('article.asset-detail h1')).toHaveText('Deep modules');
  await page.getByRole('button', { name: /switch to Edit/i }).click();
  await expect(page.locator('[aria-label="operator identity"]')).toHaveCount(0); // ADR-0204 D4

  // RED, and left red (ADR-0405 D4). ADR-0146 replaced the block-anchored comment surface with the
  // CriticMarkup split-pane editor and the replacement was never wired to the comment store:
  // `ReviewBlocks` — the only mounter of `InlineCommentThread` — is mounted nowhere, and no
  // mounted component calls `api.createComment`. The editor's own "Peer comments" section is
  // READ-ONLY, and its Save writes the whole body through `api.updateAsset` (and is LOCAL-only for
  // a structured artifact), so nothing reaches `comments.json` at all. There is therefore no Post
  // affordance to click. Wiring one back is story-author + product work, not a spec edit.
  await page.getByRole('button', { name: 'Post' }).click({ timeout: ABSENT_MS });

  const posted = (await readJson<Comment[]>(COMMENTS_FILE)).find((c) => c.topicId === 'deep-modules');
  expect(posted, 'a posted comment should reach the offline comment store').toBeDefined();
  expect(posted!.anchor.kind).toBe('block'); // ADR-0140 — block placement, the text span is retired
  expect(posted!.resolved).toBe(false);

  // —— Criterion 5: reload; the comment is re-fetched and rendered at the same declared target.
  await page.reload();
  await expect(page.locator('.inline-comment-thread')).toContainText('UAT probe');

  // —— Criterion 6: resolve, and every current comment-status surface flips without a reload.
  await page.getByRole('button', { name: 'Resolve' }).click();
  const resolved = (await readJson<Comment[]>(COMMENTS_FILE)).find((c) => c.topicId === 'deep-modules');
  expect(resolved!.resolved).toBe(true);
  expect(resolved!.resolvedAt).not.toBeNull();
});

// =============================================================================================
// Criteria 10, 11 (green) and 12, 13 (red) — the mutating journey. Serial: each test consumes the
// durable state the previous one wrote; that chaining IS the durability claim under test.
// =============================================================================================

const PROBE_ID = 'uat-probe-pattern';

const probeAsset = (assets: GuidanceAsset[]): GuidanceAsset | undefined =>
  assets.find((a) => a.id === PROBE_ID);

test.describe('story UAT (criteria 10-13): the mutating journey', () => {
  test.describe.configure({ mode: 'serial' });

  // Snapshot the comment store (git-tracked) and the offline runtime assets store (gitignored,
  // ADR-0210); restore them if any test dies before its cleanup runs. On a green run the restore
  // is a no-op (writes round-trip byte-identically through the backend's serializer).
  let commentsBaseline = '';
  let assetsBaseline = '';

  test.beforeAll(async ({ baseURL }) => {
    // Force the offline backend to SEED its runtime assets store before snapshotting, so the
    // baseline exists even if this block runs before any page has listed assets.
    if (baseURL) await fetch(`${baseURL}/api/assets`).catch(() => undefined);
    commentsBaseline = await fs.readFile(COMMENTS_FILE, 'utf8');
    assetsBaseline = await fs.readFile(ASSETS_FILE, 'utf8');
  });

  test.afterAll(async () => {
    for (const [file, baseline] of [
      [COMMENTS_FILE, commentsBaseline],
      [ASSETS_FILE, assetsBaseline],
    ] as const) {
      if (baseline && (await fs.readFile(file, 'utf8')) !== baseline) {
        console.warn(`story-uat: restoring ${path.basename(file)} to its pre-test baseline`);
        await fs.writeFile(file, baseline, 'utf8');
      }
    }
  });

  test('criteria 10, 11: author a structured Library artifact → edit it (id relocked) → delete it', async ({
    page,
  }) => {
    test.setTimeout(180_000);

    // —— Criterion 10: author a fresh artifact. The default category (pattern) is a structured
    // kind, so it is authored through its per-kind fields and the live preview renders the derived
    // body.
    await page.goto('/#/asset/new');
    await page.getByLabel(/^Title/).fill('UAT probe pattern');
    await expect(page.getByLabel(/^Id /)).toHaveValue(PROBE_ID); // the title auto-slugs the id
    await expect(page.getByLabel(/^Category/)).toHaveValue('pattern');
    await page
      .getByLabel(/^Description/)
      .fill('A throwaway probe the scripted story UAT authors, edits and deletes.');
    await page
      .getByLabel(/^The pattern/)
      .fill('Drive every mutation through the real UI and assert on the durable store.');
    await page
      .getByLabel(/^Problem/)
      .fill('A scripted UAT must prove durability without leaving residue in git-tracked stores.');
    await page
      .getByLabel(/^Approach/)
      .fill('Author through the editor, assert the JSON store on disk, then delete the probe.');
    await expect(page.locator('.editor-preview')).toContainText('Drive every mutation through the real UI');
    await expect(page.locator('.editor-preview h2', { hasText: 'Problem' })).toBeVisible();

    const [createdRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/assets') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Create artifact' }).click(),
    ]);
    expect(createdRes.status()).toBe(201);
    await expect(page).toHaveURL(new RegExp(`#/asset/${PROBE_ID}$`));
    await expect(page.locator('article.asset-detail h1')).toHaveText('UAT probe pattern');

    const createdAsset = probeAsset(await readJson<GuidanceAsset[]>(ASSETS_FILE));
    expect(createdAsset).toBeDefined();
    expect(createdAsset!.createdAt).toBe(createdAsset!.updatedAt);

    // —— Criterion 11: edit (the id input is re-locked), save, then delete through the UI.
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`#/asset/${PROBE_ID}/edit$`));
    await expect(page.getByLabel(/^Id /)).toBeDisabled();
    await page
      .getByLabel(/^Approach/)
      .fill(
        'Author through the editor, assert the JSON store on disk, then delete the probe. Edited once to prove the update path.',
      );
    const [patchedRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/assets') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save changes' }).click(),
    ]);
    expect(patchedRes.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`#/asset/${PROBE_ID}$`));

    const editedAsset = probeAsset(await readJson<GuidanceAsset[]>(ASSETS_FILE));
    expect(editedAsset!.createdAt).toBe(createdAsset!.createdAt); // preserved
    expect(editedAsset!.updatedAt > editedAsset!.createdAt).toBe(true);
    expect(editedAsset!.fields?.approach).toContain('Edited once to prove the update path.');

    page.once('dialog', (d) => void d.accept());
    const [deletedRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/assets') && r.request().method() === 'DELETE'),
      page.locator('.asset-actions').getByRole('button', { name: 'Delete' }).click(),
    ]);
    expect(deletedRes.status()).toBe(200);
    // Deleting returns to the forest's Library lens — the standalone `#/library` page is retired
    // (ADR-0185 dec 6), so the landing surface is the map.
    await expect(page.locator('[data-testid="tree-route"]')).toBeAttached({ timeout: WORLD_MS });
    expect(probeAsset(await readJson<GuidanceAsset[]>(ASSETS_FILE))).toBeUndefined();
  });

  test('criteria 12, 13: a cold dev-server restart serves the durable state → cleanup back to baseline', async ({
    page,
  }) => {
    test.setTimeout(300_000);

    // —— Criterion 12: restart durability. Playwright's managed webServer cannot be bounced
    // mid-run, so the shadow spawns a SECOND, cold dev-server process on its own port — the same
    // proof: a fresh process reconstructs the whole state from the JSON stores alone.
    const cold = await startColdServer();
    try {
      // The deleted artifact is correctly absent after a cold restart (criterion 11's delete,
      // reconstructed from storage rather than from the first process's memory).
      await page.goto(`${cold.url}/#/asset/${PROBE_ID}`);
      await expect(page.locator('.error-box h2')).toHaveText('Artifact not found');

      // …and the reviewed document's resolved comment is reconstructed from storage.
      //
      // RED, and left red (ADR-0405 D4). This half of criterion 12 rests on the comment journey
      // that criteria 4-6 cannot drive: with no mounted post/resolve affordance, no comment was
      // ever written, so there is nothing for a cold process to reconstruct. Criterion 13's own
      // "delete the probe comment THROUGH THE UI" is blocked by the same missing affordance —
      // nothing mounted calls `api.deleteComment`.
      await page.goto(`${cold.url}${DOC_URL}`);
      await expect(page.locator('.inline-comment-thread')).toContainText('UAT probe');
      page.once('dialog', (d) => void d.accept());
      await page.getByRole('button', { name: 'Delete' }).click();

      // —— Criterion 13: the git-tracked stores are byte-identical to their pre-test baseline.
      expect(await fs.readFile(COMMENTS_FILE, 'utf8')).toBe(commentsBaseline);
      expect(await fs.readFile(ASSETS_FILE, 'utf8')).toBe(assetsBaseline);
    } finally {
      await cold.stop();
    }
  });
});

// ---------------------------------------------------------------------------------------
// The criterion-12 cold server: the same command as playwright.config.ts's webServer (and the
// package's own dev script), on port 5175 so neither the managed 5174 instance nor a live
// 5173 session is disturbed. --host 127.0.0.1 because vite's default `localhost` can bind
// IPv6-only on Windows, which the readiness poll would never see.
// ---------------------------------------------------------------------------------------

const COLD_PORT = 5175;

async function startColdServer(): Promise<{ url: string; stop: () => Promise<void> }> {
  const url = `http://127.0.0.1:${COLD_PORT}`;
  const logs: string[] = [];
  const proc = spawn(
    process.execPath,
    ['--import', 'tsx', 'node_modules/vite/bin/vite.js', '--port', String(COLD_PORT), '--strictPort', '--host', '127.0.0.1'],
    {
      cwd: studioDir,
      env: { ...process.env, STORYTREE_STUDIO_STORE: 'json' },
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    },
  );
  proc.stdout?.on('data', (c: Buffer) => logs.push(String(c)));
  proc.stderr?.on('data', (c: Buffer) => logs.push(String(c)));

  const stop = async (): Promise<void> => {
    if (proc.exitCode !== null) return;
    if (process.platform === 'win32' && proc.pid) {
      // kill() only terminates the node process on Windows; take the tree down.
      spawnSync('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
    } else {
      proc.kill('SIGTERM');
    }
  };

  const deadline = Date.now() + 120_000;
  for (;;) {
    if (proc.exitCode !== null) {
      throw new Error(`cold dev server exited before becoming ready:\n${logs.join('')}`);
    }
    try {
      const res = await fetch(`${url}/api/health`);
      if (res.ok) return { url, stop };
    } catch {
      // not listening yet
    }
    if (Date.now() > deadline) {
      await stop();
      throw new Error(`cold dev server never became ready on ${url}:\n${logs.join('')}`);
    }
    await new Promise((r) => setTimeout(r, 250));
  }
}
