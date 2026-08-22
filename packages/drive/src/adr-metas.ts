import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { adrNumberOfArtifactId } from "@storytree/library";
import type { Store } from "@storytree/storage-protocol";

import { AdrStatus, parseAdrFrontmatter, type AdrMeta } from "./adr-frontmatter.js";

/**
 * The ADR-meta loader (split out of the cli `adr-health.ts` in the drive extraction): the thin
 * fs-backed loader the build drivers need without pulling in the whole `adr-health` check core
 * (which depends on cli's `health.ts` `CheckResult`). `adr-health.ts` stays in cli; this loader
 * moved to drive so `story-build.ts` can consume it without a cli → drive → cli cycle.
 */

export interface LoadAdrMetasResult { adrs: AdrMeta[]; parseErrors: string[] }

/** Parse every `NNNN-*.md` under a decisions dir; parse failures become lines, not throws. */
export function loadAdrMetas(decisionsDir: string): LoadAdrMetasResult {
  const adrs: AdrMeta[] = [];
  const parseErrors: string[] = [];
  for (const file of readdirSync(decisionsDir).sort()) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      adrs.push(parseAdrFrontmatter(file, readFileSync(path.join(decisionsDir, file), "utf8")));
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { adrs, parseErrors };
}

/** PURE: the text after `# ADR-NNNN:` (the decision's H1 title); "" when there is no such heading. */
export function extractAdrTitle(content: string): string {
  const m = /^#\s+ADR-\d{4}:\s*(.+?)\s*$/m.exec(content);
  return m && m[1] !== undefined ? m[1] : "";
}

/** An ADR's frontmatter meta plus its H1 title — the shape every ADR *view* needs. */
export interface TitledAdrMeta extends AdrMeta {
  /** The `# ADR-NNNN:` heading text, falling back to the filename when the heading is missing. */
  title: string;
}

export interface LoadTitledAdrMetasResult {
  adrs: TitledAdrMeta[];
  parseErrors: string[];
}

/**
 * {@link loadAdrMetas} plus each ADR's H1 title, read from a directory of `NNNN-*.md` files.
 *
 * ⚠ NO PRODUCTION READER CALLS THIS ANY MORE, and neither does {@link loadAdrMetas}. This was the
 * ONE fs scan of `docs/decisions` every ADR view was built on — the cli's `loadAdrListings` (which
 * reshapes it into `{meta, title}` for `adr list`) and `deriveArcRollup`'s ADR leg (`@storytree/arc`'s
 * `arc-rollup.ts`, shared by the CLI, the studio server and the desktop backend) both delegated
 * here rather than walking the directory themselves. ADR-0403 dec 1 made decisions rows and deleted
 * that directory; both readers now call {@link loadTitledAdrMetasFromStore}, which is shape-identical
 * so the swap changed nothing else. This fs pair is kept as the store form's twin — do not wire a
 * new caller to it without a path that genuinely holds ADR FILES.
 *
 * A missing/unreadable dir yields an empty list rather than throwing. That fail-soft was what kept
 * an arc view derivable on a partial checkout; it is also why the deletion of `docs/decisions/` was
 * survivable but SILENT, which is the whole subject of `decision-log-readers-arc`.
 */
export function loadTitledAdrMetas(decisionsDir: string): LoadTitledAdrMetasResult {
  const adrs: TitledAdrMeta[] = [];
  const parseErrors: string[] = [];
  let files: string[];
  try {
    files = readdirSync(decisionsDir).sort();
  } catch {
    return { adrs, parseErrors };
  }
  for (const file of files) {
    if (!/^\d{4}-.*\.md$/.test(file)) continue;
    try {
      const content = readFileSync(path.join(decisionsDir, file), "utf8");
      adrs.push({ ...parseAdrFrontmatter(file, content), title: extractAdrTitle(content) || file });
    } catch (err) {
      parseErrors.push(err instanceof Error ? err.message : String(err));
    }
  }
  return { adrs, parseErrors };
}

/**
 * The STORE-BACKED half of the same view (ADR-0403 dec 1) — every `adr` row as an {@link AdrMeta}.
 *
 * `decision-log-home-arc` increment 07. Its whole point is that it returns the SAME shape as
 * {@link loadTitledAdrMetas}, so a caller swaps the source and changes nothing else: the arc rollup's
 * ADR leg, `storytree adr list` and its `--load-bearing` closure all read this result identically
 * whether it came from files or from rows.
 *
 * ## `file` BECOMES THE ROW'S ID, AND NOTHING BREAKS BECAUSE ALMOST NOTHING READS IT
 *
 * A row has no filename. Checked before assuming: `AdrMeta.file` is read in exactly one production
 * place — `adr-health`'s duplicate-number report, which lists the offenders. `renderAdrList` never
 * touches it. So it carries `adr-NNNN`, the row's id, which is the decision's address now and is what
 * a reader would need in order to go and look at it.
 *
 * ## PARSE ERRORS ARE COLLECTED, NOT THROWN — the same fail-soft posture as the fs scan
 *
 * A malformed row becomes a line rather than an exception, because both callers render a VIEW: an
 * arc's ADR leg and the orientation listing must stay derivable when one row is broken. The loud
 * boundary is the WRITE (`validateLibraryDoc`), which is where a malformed decision is actually
 * prevented; refusing to render the other 402 would punish the reader for it.
 *
 * Sorted by number, matching the fs scan's `readdirSync().sort()` — the listing's order is part of
 * what `adr list` shows, so a source swap that quietly reordered it would read as a data change.
 */
export interface StoreAdrMetasResult extends LoadTitledAdrMetasResult {
  /**
   * True when the store could not be READ at all — distinct from "it holds no decisions".
   *
   * A VIEW can ignore this and render nothing (an arc's ADR leg does). A CHECK cannot: the plan
   * freshness probe reports "decisions landed since this was anchored", and an unreadable log
   * returning zero would read as FRESH — a check failing toward the answer that blesses unread work.
   */
  unreadable: boolean;
  /**
   * Rows whose stored `number` disagrees with the number in their own id — one FAIL line each.
   *
   * This is what replaces `adr-number-unique` after the migration, and it is NOT the same question
   * wearing a new name. Two FILES sharing a number was the parallel-authoring collision ADR-0050's
   * allocator exists to prevent; two ROWS cannot share one, because the id is the primary key. That
   * check therefore becomes VACUOUS — a green that verified nothing, which is worse than no check.
   *
   * What IS reachable is a row whose `number` field drifts from its id, since both are ordinary
   * fields a `library artifact edit --set number=…` can move independently. The loader keys every
   * downstream reader off the ID (the allocator's own reservation), so a drifted `number` would make
   * a decision render and cite as one number while being addressed as another.
   */
  numberMismatches: string[];
}

export async function loadTitledAdrMetasFromStore(store: Store): Promise<StoreAdrMetasResult> {
  const adrs: TitledAdrMeta[] = [];
  const parseErrors: string[] = [];
  const numberMismatches: string[] = [];
  let rows: readonly { id: string; doc: unknown }[];
  try {
    rows = await store.queryDocs({ kind: "adr" });
  } catch (err) {
    // A store that cannot be read is NOT an empty decision log. Reported as one line rather than
    // silently yielding zero, because zero reads as "this corpus has no decisions" — a confident
    // wrong answer, and the exact failure `decisionsDir`'s missing-directory branch used to make.
    return {
      adrs,
      parseErrors: [`decision rows unreadable: ${err instanceof Error ? err.message : String(err)}`],
      unreadable: true,
      numberMismatches: [],
    };
  }
  for (const row of rows) {
    const bag = (typeof row.doc === "object" && row.doc !== null ? row.doc : {}) as Record<string, unknown>;
    const number = adrNumberOfArtifactId(row.id);
    if (number === null) {
      parseErrors.push(`${row.id}: not a decision id (expected adr-NNNN)`);
      continue;
    }
    const parsed = AdrStatus.safeParse(bag["status"]);
    if (!parsed.success) {
      parseErrors.push(`${row.id}: unreadable status ${JSON.stringify(bag["status"])}`);
      continue;
    }
    // The ID is authoritative — it is what the ADR-0050 allocator reserved and what every reader
    // addresses the decision by. A disagreeing `number` field is REPORTED and the id still wins,
    // rather than the row being dropped: a decision that renders under the wrong label is a defect
    // worth a red, and one that vanishes from the corpus entirely is a bigger one.
    const storedNumber = bag["number"];
    if (typeof storedNumber === "number" && storedNumber !== number) {
      numberMismatches.push(
        `${row.id} stores number ${String(storedNumber)}, which disagrees with its id — the id is ` +
          "what `adr new` reserved (ADR-0050); correct the field, never the id.",
      );
    }
    const numbers = (value: unknown): number[] =>
      Array.isArray(value) ? value.filter((n): n is number => typeof n === "number") : [];
    const arcRef = bag["arcRef"];
    const decided = bag["decided"];
    const title = typeof bag["title"] === "string" ? bag["title"] : row.id;
    adrs.push({
      number,
      file: row.id,
      status: parsed.data,
      supersedes: numbers(bag["supersedes"]),
      amends: numbers(bag["amends"]),
      loadBearing: bag["loadBearing"] === true,
      title,
      ...(typeof decided === "string" ? { decided } : {}),
      // The row carries an `asset:` pointer where the frontmatter carried a bare id; this view is the
      // frontmatter's, so it hands back the bare id its consumers already join on.
      ...(typeof arcRef === "string" && arcRef.startsWith("asset:")
        ? { arc: arcRef.slice("asset:".length) }
        : {}),
    });
  }
  adrs.sort((a, b) => a.number - b.number);
  return { adrs, parseErrors, unreadable: false, numberMismatches };
}
