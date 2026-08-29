/**
 * `pnpm probe:citation-readers` — the I/O half of the `references` reader census (ADR-0477 D3 step 1).
 *
 * Walks the repo's tracked source files, scans each for a code-position occurrence of the field, and
 * reconciles the result against the committed census document. Exits 1 when a production reader is
 * not named by the census, because that is the one condition under which step 4's removal is unsafe.
 *
 * Offline: no store, no credentials. The pure compute (and the caveat on what a lexical scan can and
 * cannot establish) lives in `citation-readers.ts`.
 */

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  type CitationHit,
  formatVerdict,
  isScannable,
  parseCensus,
  reconcile,
  scanFile,
} from "./citation-readers.js";

const TAG = "probe:citation-readers";

/** The committed census this scan is reconciled against. */
const CENSUS = "docs/research/citation-reader-census-2026-08-29.md";

/**
 * The scan is over TRACKED files only — `git ls-files` — so an untracked scratch file in someone's
 * worktree can never fail a sibling's run, and the population is the same one CI sees.
 */
function trackedSources(repoRoot: string): string[] {
  const out = execFileSync("git", ["ls-files", "-z"], {
    cwd: repoRoot,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  return out.split("\0").filter((f) => f.length > 0 && isScannable(f));
}

function main(): void {
  const repoRoot = execFileSync("git", ["rev-parse", "--show-toplevel"], {
    encoding: "utf8",
  }).trim();

  const hits: CitationHit[] = [];
  for (const file of trackedSources(repoRoot)) {
    let text: string;
    try {
      text = readFileSync(join(repoRoot, file), "utf8");
    } catch {
      continue; // a file listed but absent (a partial checkout) is not this verb's subject
    }
    hits.push(...scanFile(file, text));
  }

  let censusText: string;
  try {
    censusText = readFileSync(join(repoRoot, CENSUS), "utf8");
  } catch {
    console.error(
      `${TAG} — the census is missing: ${CENSUS}\n` +
        "It is ADR-0477 D3 step 1's deliverable and this verb has nothing to reconcile against.",
    );
    process.exit(1);
    return;
  }

  const verdict = reconcile(hits, parseCensus(censusText));
  console.log(formatVerdict(verdict));
  if (!verdict.ok) process.exit(1);
}

try {
  main();
} catch (err: unknown) {
  console.error(`${TAG} — ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
