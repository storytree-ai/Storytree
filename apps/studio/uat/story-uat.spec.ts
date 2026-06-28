// The scripted shadow of the studio Story UAT
// (stories/studio/story.md § "Story UAT") — one coherent operator journey
// against the REAL running studio (real dev server, real browser, real /api/* middleware,
// real seeded corpus). The only stub is the cross-story live-store seam: the server is
// pinned to the offline json backend (playwright.config.ts, STORYTREE_STUDIO_STORE=json) —
// ADR-0010 §5's mock-UAT allowance; in-story collaborators stay real. No Cloud SQL, no
// network, no API keys.
//
// Coverage: ALL steps — the read slice (steps 1-3, 7-9: backbone, read-corpus, the
// in-corpus cross-link hop, Library browse, citation hop) and the mutating journey
// (steps 4-6 annotate → reload → resolve; steps 10-11 author → edit → delete; steps 12-13
// cold-restart durability + cleanup back to the git-tracked baseline). Where the prose
// describes the pre-fold UI (a sidebar doc index, an 'all' chip, a body-only editor), this
// script shadows the SAME journey through the current surfaces: the corpus index lives in
// the Library, and a structured kind is authored through its per-kind fields (option C of
// oq-library-doc-shape).
//
// The mutating tests write through the real handlers into the git-tracked JSON stores
// (apps/studio/data/comments.json + assets.json) and MUST leave them at their seeded
// baseline: step 13 cleans up through the UI and the suite asserts byte-equality; a
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
const ASSETS_FILE = path.join(studioDir, 'data', 'assets.json');

test('story UAT (steps 1-3, 7-9): backbone up → read an ADR → cross-link hop → browse the Library → follow a citation back to the corpus', async ({ page }) => {
  // —— Step 1: the persistence backbone is live. The app boots, the /api/* middleware
  // answers (the corpus loads), and the store badge confirms the offline json backend.
  await page.goto('/');
  await expect(page.locator('.brand-name')).toHaveText('storytree');
  await expect(page.locator('.store-badge')).toHaveText('offline store (json)');
  await expect(page.locator('.sidebar .side-head-link')).toHaveText('Library');

  // —— Step 2: read-corpus end-to-end. Open ADR-0002 (a doc-backed card in the Library's
  // adr category) and see it rendered as markdown from the real docs/ tree.
  await page.goto('/#/library/adr');
  await page.locator(`a.asset-card[href="#/doc/${encodeURIComponent(ADR_0002)}"]`).click();
  await expect(page.locator('article.doc h1').first()).toBeVisible();
  expect(page.url()).toContain('#/doc/decisions%2F0002');

  // —— Step 3: the in-corpus cross-link hop. ADR-0013 cites ADR-0002 with a docs-root-relative
  // markdown link; resolveDocHref turns it into an internal #/doc/<relpath> nav, the sibling
  // renders from disk, and the browser's Back returns to ADR-0013 — the corpus is genuinely
  // navigable, not a single page. (Formerly demonstrated via docs/glossary.md, retired by ADR-0135.)
  await page.goto(`/#/doc/${encodeURIComponent(ADR_0013)}`);
  await expect(page.locator('article.doc h1').first()).toBeVisible();
  await page
    .locator(`article.doc a[href="#/doc/${encodeURIComponent(ADR_0002)}"]`)
    .first()
    .click();
  await expect(page).toHaveURL(/#\/doc\/decisions%2F0002/);
  await expect(page.locator('article.doc h1').first()).toContainText('ADR-0002');
  await page.goBack();
  await expect(page).toHaveURL(/#\/doc\/decisions%2F0013/);
  await expect(page.locator('article.doc h1').first()).toBeVisible();

  // —— Step 7: the Library landing renders the seeded corpus — one live-count type card
  // per non-empty category, served from the seeder's assets.json.
  await page.goto('/#/library');
  const principleCard = page.locator('a.asset-card.type-card', { hasText: 'Principles' });
  await expect(principleCard).toBeVisible();
  const principleCount = Number(await principleCard.locator('.badge').textContent());
  expect(principleCount).toBeGreaterThan(0);

  // —— Step 8: narrow by category, then by search — browse-library's filter end-to-end.
  await principleCard.click();
  await expect(page).toHaveURL(/#\/library\/principle$/);
  await expect(page.locator('.cat-gloss')).toContainText('principle');
  await expect(page.locator('ul.asset-grid a.asset-card')).toHaveCount(principleCount);
  await page.locator('input.search').fill('deep');
  const deepCard = page.locator('a.asset-card', { hasText: 'Deep modules' });
  await expect(deepCard).toBeVisible();
  expect(await page.locator('ul.asset-grid a.asset-card').count()).toBeLessThan(principleCount);

  // —— Step 9: open the artifact and follow its doc: citation back into the corpus —
  // the Library → corpus seam (browse-library riding read-corpus).
  await deepCard.click();
  await expect(page).toHaveURL(/#\/asset\/deep-modules$/);
  await expect(page.locator('article.asset-detail h1')).toHaveText('Deep modules');
  await expect(page.locator('.asset-refs h4')).toHaveText('Sources');
  await page.locator(`.asset-refs a[href="#/doc/${encodeURIComponent(ADR_0002)}"]`).click();
  await expect(page.locator('article.doc h1').first()).toBeVisible();
  expect(page.url()).toContain('#/doc/decisions');
});

// ---------------------------------------------------------------------------------------
// The mutating journey (steps 4-6, 10-13). Serial: each test consumes the durable state
// the previous one wrote (that chaining IS the durability claim under test), so a failure
// skips the rest and the snapshot guard restores the baseline.
// ---------------------------------------------------------------------------------------

const OPERATOR = 'uat-operator';
// An exact span of ADR-0002's rendered body — one source line, no inline markup, unique.
const PHRASE = 'instead of a legible map';
const PROBE_ID = 'uat-probe-pattern';
const GREEN = '#34c759';

// The browser-side selection helper runs via page.evaluate; this file typechecks under
// tsconfig.node.json (no DOM lib), so the few browser globals it touches are declared
// untyped here instead of dragging lib.dom into the server/uat typecheck.
declare const document: any;
declare const window: any;
declare const NodeFilter: any;
declare const MouseEvent: any;

/**
 * Select an exact phrase of the rendered article and fire the (real, bubbling) mouseup the
 * annotate layer listens for — the same code path a hand drag takes (onMouseUp →
 * window.getSelection → computeTextAnchor); only the drag gesture itself is programmatic.
 */
async function selectPhrase(page: Page, phrase: string): Promise<void> {
  const found = await page.evaluate((quote: string) => {
    const root = document.querySelector('article.doc');
    if (!root) return false;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let node: any;
    while ((node = walker.nextNode())) {
      const idx = node.data.indexOf(quote);
      if (idx === -1) continue;
      const range = document.createRange();
      range.setStart(node, idx);
      range.setEnd(node, idx + quote.length);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      root.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
      return true;
    }
    return false;
  }, phrase);
  expect(found, `the phrase "${phrase}" should exist in one rendered text node`).toBe(true);
}

async function readJson<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(file, 'utf8')) as T;
}

const probeComment = (comments: Comment[]): Comment | undefined =>
  comments.find((c) => c.topicId === ADR_0002 && c.author === OPERATOR);
const probeAsset = (assets: GuidanceAsset[]): GuidanceAsset | undefined =>
  assets.find((a) => a.id === PROBE_ID);

test.describe('story UAT (steps 4-6, 10-13): the mutating journey', () => {
  test.describe.configure({ mode: 'serial' });

  // Snapshot the two git-tracked stores; restore them if any test dies before step 13's
  // UI cleanup runs. On a green run the restore is a no-op (writes round-trip
  // byte-identically through the backend's serializer — verified by step 13's assertion).
  let commentsBaseline = '';
  let assetsBaseline = '';

  test.beforeAll(async () => {
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

  test('steps 4-6: set the operator → anchor a text-span comment → reload re-finds it → resolve fans out', async ({ page }) => {
    test.setTimeout(120_000);

    // —— Step 4: set an operator name once (the header identity, persisted in localStorage)…
    await page.goto('/');
    await page.getByLabel('operator identity').fill(OPERATOR);

    // …then select an exact span of the rendered ADR body and post a comment on it.
    await page.goto(DOC_URL);
    await expect(page.locator('article.doc h1').first()).toBeVisible({ timeout: 30_000 });
    await selectPhrase(page, PHRASE);
    await expect(page.locator('.sel-popover')).toBeVisible();
    await page.getByRole('button', { name: 'Highlight Green' }).click();
    await page.locator('.sel-comment-btn').click();
    await expect(page.locator('.text-target-quote')).toContainText(PHRASE);
    await expect(page.locator('.composer-foot')).toContainText(OPERATOR);
    await page.locator('.composer-body').fill('UAT probe: anchored on an exact text span.');
    const [created] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/comments') && r.request().method() === 'POST'),
      page.getByRole('button', { name: 'Post' }).click(),
    ]);
    expect(created.status()).toBe(201);

    // Success: the span is wrapped in a coloured mark with a gutter tick, the thread shows
    // the comment, and a text-anchored record (quote/prefix/suffix, author = the operator)
    // was appended to data/comments.json.
    const mark = page.locator('mark.st-hl');
    await expect(mark).toHaveText(PHRASE);
    await expect(page.locator('.gutter-tick')).toHaveCount(1);
    const row = page.locator('li.comment');
    await expect(row).toContainText(OPERATOR);
    await expect(row.locator('.quote-tag')).toContainText(PHRASE);
    await expect(page.locator('.comments-head .badge')).toHaveText('1');

    const posted = probeComment(await readJson<Comment[]>(COMMENTS_FILE));
    expect(posted).toBeDefined();
    expect(posted!.topicKind).toBe('doc');
    expect(posted!.anchor.kind).toBe('text');
    expect(posted!.anchor.quote).toBe(PHRASE);
    expect(posted!.anchor.prefix ?? '').not.toBe('');
    expect(posted!.anchor.suffix ?? '').not.toBe('');
    expect(posted!.anchor.color).toBe(GREEN);
    expect(posted!.resolved).toBe(false);

    // —— Step 5: reload; the anchor durably survives a fresh render — the comment is
    // re-fetched and the highlight re-found at the same span (findQuoteRange).
    await page.reload();
    await expect(page.locator('mark.st-hl')).toHaveText(PHRASE, { timeout: 30_000 });
    await expect(page.locator('.gutter-tick')).toHaveCount(1);

    // —— Step 6: resolve. Without a manual reload every surface flips off the single
    // resolved flag (the prose's sidebar-count surface predates the Library fold-in;
    // the current fan-out is header count, row pill, hide-resolved toggle, gutter, mark).
    const [patched] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/comments') && r.request().method() === 'PATCH'),
      page.locator('li.comment').getByRole('button', { name: 'Resolve' }).click(),
    ]);
    expect(patched.status()).toBe(200);
    await expect(row).toHaveClass(/resolved/);
    await expect(row.locator('.resolved-pill')).toBeVisible();
    await expect(page.locator('.comments-head .badge')).toBeHidden(); // open count 1 → 0
    await expect(page.locator('label.toggle')).toBeVisible(); // 'hide resolved' appears
    await expect(page.locator('.gutter-tick.resolved')).toHaveCount(1);
    await expect(page.locator('mark.st-hl')).toHaveAttribute('data-resolved', 'true');

    const resolved = probeComment(await readJson<Comment[]>(COMMENTS_FILE));
    expect(resolved!.resolved).toBe(true);
    expect(resolved!.resolvedAt).not.toBeNull();
  });

  test('steps 10-11: author a Library artifact → edit it (id locked) → delete it', async ({ page }) => {
    test.setTimeout(120_000);

    // —— Step 10: author a fresh artifact at #/asset/new. The default category (pattern)
    // is a structured kind, so it is authored through its per-kind fields (option C);
    // the live preview renders the derived body.
    await page.goto('/#/asset/new');
    await page.getByLabel(/^Title/).fill('UAT probe pattern');
    await expect(page.getByLabel(/^Id /)).toHaveValue(PROBE_ID); // the title auto-slugs the id
    await expect(page.getByLabel(/^Category/)).toHaveValue('pattern');
    await page.getByLabel(/^Description/).fill('A throwaway probe the scripted story UAT authors, edits and deletes.');
    await page.getByLabel(/^The pattern/).fill('Drive every mutation through the real UI and assert on the durable store.');
    await page.getByLabel(/^Problem/).fill('A scripted UAT must prove durability without leaving residue in git-tracked stores.');
    await page.getByLabel(/^Approach/).fill('Author through the editor, assert the JSON store on disk, then delete the probe.');
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

    // —— Step 11: edit (the id input is re-locked), save, then delete.
    await page.getByRole('link', { name: 'Edit' }).click();
    await expect(page).toHaveURL(new RegExp(`#/asset/${PROBE_ID}/edit$`));
    await expect(page.getByLabel(/^Id /)).toBeDisabled();
    await page
      .getByLabel(/^Approach/)
      .fill('Author through the editor, assert the JSON store on disk, then delete the probe. Edited once to prove the update path.');
    const [patchedRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/assets') && r.request().method() === 'PATCH'),
      page.getByRole('button', { name: 'Save changes' }).click(),
    ]);
    expect(patchedRes.status()).toBe(200);
    await expect(page).toHaveURL(new RegExp(`#/asset/${PROBE_ID}$`));

    const editedAsset = probeAsset(await readJson<GuidanceAsset[]>(ASSETS_FILE));
    expect(editedAsset!.createdAt).toBe(createdAsset!.createdAt); // preserved
    expect(editedAsset!.updatedAt > editedAsset!.createdAt).toBe(true); // 'updated' later than 'created'
    expect(editedAsset!.fields?.approach).toContain('Edited once to prove the update path.');

    page.once('dialog', (d) => void d.accept());
    const [deletedRes] = await Promise.all([
      page.waitForResponse((r) => r.url().includes('/api/assets') && r.request().method() === 'DELETE'),
      page.locator('.asset-actions').getByRole('button', { name: 'Delete' }).click(),
    ]);
    expect(deletedRes.status()).toBe(200);
    await expect(page).toHaveURL(/#\/library$/);
    expect(probeAsset(await readJson<GuidanceAsset[]>(ASSETS_FILE))).toBeUndefined();
  });

  test('steps 12-13: a cold dev-server restart serves the durable state → cleanup back to baseline', async ({ page }) => {
    test.setTimeout(240_000);

    // —— Step 12: restart durability. Playwright's managed webServer cannot be bounced
    // mid-run, so the shadow spawns a SECOND, cold dev-server process on its own port —
    // the same proof: a fresh process reconstructs the whole state from the JSON stores
    // alone (the json backend holds nothing in memory).
    const cold = await startColdServer();
    try {
      await page.goto(`${cold.url}${DOC_URL}`);
      const mark = page.locator('mark.st-hl');
      await expect(mark).toHaveText(PHRASE, { timeout: 60_000 });
      await expect(mark).toHaveAttribute('data-resolved', 'true');
      const row = page.locator('li.comment');
      await expect(row).toHaveClass(/resolved/);
      await expect(row.locator('.resolved-pill')).toBeVisible();
      await expect(row).toContainText(OPERATOR);

      // …and the authored artifact is correctly absent (it was deleted in step 11).
      await page.goto(`${cold.url}/#/asset/${PROBE_ID}`);
      await expect(page.locator('.error-box h2')).toHaveText('Artifact not found');

      // —— Step 13: clean up THROUGH THE UI — delete the probe comment, then prove the
      // git-tracked stores are byte-identical to their pre-test baseline (no residue).
      await page.goto(`${cold.url}${DOC_URL}`);
      page.once('dialog', (d) => void d.accept());
      const [deletedRes] = await Promise.all([
        page.waitForResponse((r) => r.url().includes('/api/comments') && r.request().method() === 'DELETE'),
        page.locator('li.comment').getByRole('button', { name: 'Delete' }).click(),
      ]);
      expect(deletedRes.status()).toBe(200);
      await expect(page.locator('.comment-list')).toContainText('No comments yet.');

      expect(await fs.readFile(COMMENTS_FILE, 'utf8')).toBe(commentsBaseline);
      expect(await fs.readFile(ASSETS_FILE, 'utf8')).toBe(assetsBaseline);
    } finally {
      await cold.stop();
    }
  });
});

// ---------------------------------------------------------------------------------------
// The step-12 cold server: the same command as playwright.config.ts's webServer (and the
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
