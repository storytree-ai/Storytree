// Red→green for `apps/studio/data/build-corpus.mjs --check` (ADR-0120, finding 3a): the corpus
// generator has a DB-free drift gate, wired into `pnpm gate` + CI, so a STALE assets.json can no
// longer merge clean (before this, build-corpus had no --check and nothing in CI compared the
// generated view to its knowledge.json source). (docs/glossary.md was a second generated view, gated
// the same way; retired by ADR-0135 — the Library's definition artifacts are the term authority.)
//
// This is an end-to-end test of the real script: it copies the real (in-sync) corpus into a temp
// fixture tree, points build-corpus at it via STORYTREE_CORPUS_DATA_DIR, and asserts --check passes on
// the clean tree (GREEN) and exits non-zero on drift (RED). Spawned (not imported) so it stays
// boundary-clean: cli never imports apps/studio source.

import { test } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, copyFileSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const CLI_DIR = path.resolve(fileURLToPath(import.meta.url), "..", "..");
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");
const SCRIPT = path.join(REPO_ROOT, "apps", "studio", "data", "build-corpus.mjs");
const REAL_DATA = path.join(REPO_ROOT, "apps", "studio", "data");

/** Lay down a fresh in-sync fixture tree (real knowledge.json + its generated assets.json) in a temp dir. */
function fixture(): { dataDir: string } {
  const dataDir = mkdtempSync(path.join(tmpdir(), "corpus-build-check-"));
  copyFileSync(path.join(REAL_DATA, "knowledge.json"), path.join(dataDir, "knowledge.json"));
  copyFileSync(path.join(REAL_DATA, "assets.json"), path.join(dataDir, "assets.json"));
  return { dataDir };
}

/** Run `build-corpus.mjs --check` against the fixture; return its exit status + stderr (never throws). */
function runCheck(fx: { dataDir: string }): { status: number; stderr: string } {
  try {
    execFileSync(process.execPath, ["--import", "tsx", SCRIPT, "--check"], {
      cwd: CLI_DIR,
      env: {
        ...process.env,
        STORYTREE_CORPUS_DATA_DIR: fx.dataDir,
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stderr: "" };
  } catch (e) {
    const err = e as { status?: number; stderr?: string };
    return { status: err.status ?? 1, stderr: String(err.stderr ?? "") };
  }
}

test("--check: PASSES on an in-sync corpus tree (and the real tree is in sync)", () => {
  const { status } = runCheck(fixture());
  assert.equal(status, 0);
});

test("--check: FAILS when assets.json has drifted from knowledge.json", () => {
  const fx = fixture();
  const assetsPath = path.join(fx.dataDir, "assets.json");
  const assets = JSON.parse(readFileSync(assetsPath, "utf8")) as { title?: string }[];
  assets[0]!.title = `${assets[0]!.title ?? ""} ✦DRIFT`; // a value no regeneration would produce
  writeFileSync(assetsPath, JSON.stringify(assets, null, 2) + "\n", "utf8");

  const { status, stderr } = runCheck(fx);
  assert.equal(status, 1);
  assert.match(stderr, /assets\.json/);
});

test("--check: FAILS when knowledge.json was edited but assets.json was not regenerated", () => {
  const fx = fixture();
  const kPath = path.join(fx.dataDir, "knowledge.json");
  const docs = JSON.parse(readFileSync(kPath, "utf8")) as { description?: string }[];
  // `description` flows into every rendered asset, so a knowledge edit without a rebuild leaves a stale
  // assets.json the --check must catch.
  docs[0]!.description = `${docs[0]!.description ?? ""} (edited, views not rebuilt)`;
  writeFileSync(kPath, JSON.stringify(docs, null, 2) + "\n", "utf8");

  const { status } = runCheck(fx);
  assert.equal(status, 1);
});
