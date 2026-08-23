import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { adrNumberOfArtifactId, hasDependsOnKey, readDependsOnPointers } from "@storytree/library";
import { adrDescriptionOf } from "@storytree/library/adr-doc";
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

/**
 * PURE: the text after `# ADR-NNNN:` (the decision's H1 title); "" when there is no such heading.
 *
 * The TWIN of `extractAdrTitle` in `@storytree/library/adr-doc`, kept trivially identical rather than
 * shared (drive depends on library and never the reverse). **Change both together** — that module's
 * copy carries the full rationale, including why fenced code must be stripped before the scan: a
 * decision quoting another decision's `# ADR-NNNN:` heading inside a ``` block would otherwise take
 * the quoted heading as its own title.
 */
export function extractAdrTitle(content: string): string {
  const m = /^#\s+ADR-\d{4}:\s*(.+?)\s*$/m.exec(content.replace(/```[\s\S]*?```/g, ""));
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
 * ## IT IS THE ONLY SIGHTED READER OF ADR-0419 D1's SUPPORT EDGE
 *
 * `dependsOn` is projected here and NOWHERE ELSE, because this is the only loader with a row to read
 * it off (see {@link AdrMeta}'s header for why the frontmatter twin deliberately stays blind). That
 * makes this function the single point at which the depth walk either sees the edge or does not:
 * every production resolver is built from an {@link AdrMeta}, so a projection that drops the field
 * leaves ADR-0419 D1's traversal fully unit-tested and completely INERT over real data — which is
 * exactly the state it was in until 2026-08-23.
 *
 * ## ⚠ THIS DELIBERATELY REMOVES ONE OF THE TWO GUARDS ON `--load-bearing`
 *
 * ADR-0419 D1 fences the calibrate set explicitly: the depth walk traverses both support edges,
 * while `loadBearingReach` (`@storytree/cli`'s `adr.ts`) closes over `amends` ALONE. Until now that
 * fence was held TWICE — once by the closure following `amends` only, and once, incidentally, by
 * this projection dropping `dependsOn` before the closure could ever see it. Widening the projection
 * removes the second, incidental guard on purpose: it was never the decided one, and keeping it
 * would have meant keeping the walk blind.
 *
 * The REAL guard is the closure, and it is pinned directly rather than relied upon — `adr.test.ts`
 * asserts the reach set is EXACTLY the amends closure over a fixture whose rows all carry support
 * edges into it, so any widening reds whether it arrives through `dependsOn` or through some later
 * edge nobody has thought of yet, and a second store-backed test drives the real pointer forms
 * through this loader to `renderAdrList`. Mutation-verified 2026-08-23 in both shapes (numeric and
 * pointer-resolving) with this widening in place: both go red. `storytree adr list --load-bearing`
 * is the surface CLAUDE.md sends every new session to calibrate on and 215 of 409 rows would enter
 * it on a support closure — an inflation no consumer of the view can detect FROM the view.
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
  /**
   * Rows whose stored `description` disagrees with what the write path derives from their title —
   * one FAIL line each. `adr-description-identity`'s input, the same shape as
   * {@link numberMismatches} and for the same reason: the raw row is the only place the field is
   * legible, and {@link TitledAdrMeta} deliberately does not carry it.
   *
   * ## WHY IT IS REACHABLE AT ALL
   *
   * `adr push` DERIVES the description — it writes `adrDescriptionOf(number, <H1 title>)` and never
   * parses a stored one (`adr-round-trip.ts`). The FIELD-SCOPED path does not: since ADR-0352 a
   * `library artifact edit adr-NNNN --set title=... --pg` writes exactly the field it names, merged
   * onto current state, so it moves the title and leaves the description naming the old one.
   *
   * FOUND BY ACCIDENT, WHICH IS THE POINT. `decision-log-readers-arc` increment 07 pushed 318
   * decision bodies through the round trip asserting per row that only `body` changed; three rows —
   * adr-0296, adr-0395, adr-0405 — tripped it, because the push silently CORRECTED a description
   * that had been stale since an earlier `--set title=`. Nothing was watching, and the only thing
   * that repaired them was a body edit that happened to pass through.
   *
   * The drift matters because `description` is not decoration: it is the line `adr list`, the
   * Library's Decisions shelf and every artifact card render. A row whose description names a
   * superseded title reads as a DIFFERENT decision than it is.
   */
  descriptionMismatches: string[];
}

export async function loadTitledAdrMetasFromStore(store: Store): Promise<StoreAdrMetasResult> {
  const adrs: TitledAdrMeta[] = [];
  const parseErrors: string[] = [];
  const numberMismatches: string[] = [];
  const descriptionMismatches: string[] = [];
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
      descriptionMismatches: [],
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
    // `description` must be the title carrying its label — see {@link StoreAdrMetasResult}. Compared
    // against the SAME `title` local the meta is built from, so the rung can never disagree with the
    // view a reader is looking at.
    //
    // A NON-STRING description is reported rather than skipped. The `adr` schema types it
    // `z.string()`, so absence is unreachable through a validated write and a row carrying anything
    // else got there some other way — and skipping it is the vacuous-green shape this whole file is
    // organised against: the one row nobody can render would be the one row nothing checks.
    const storedDescription = bag["description"];
    const expectedDescription = adrDescriptionOf(number, title);
    if (typeof storedDescription !== "string") {
      descriptionMismatches.push(
        `${row.id} has no string description (found ${JSON.stringify(storedDescription)}); ` +
          `it must read ${JSON.stringify(expectedDescription)}.`,
      );
    } else if (storedDescription !== expectedDescription) {
      descriptionMismatches.push(
        `${row.id} describes itself as ${JSON.stringify(storedDescription)}, but its title makes ` +
          `that ${JSON.stringify(expectedDescription)} — a \`--set title=\` moved one and not the ` +
          "other (ADR-0352). Re-push the document, or correct `description` to match.",
      );
    }
    // ANNOTATED local, then one guarded assignment per optional — the shape
    // `anti-slop/no-conditional-empty-object-spread` requires. The annotation is LOAD-BEARING: an
    // un-annotated literal would infer a type without the three optionals, and the excess-property
    // check on this push would silently disappear.
    const meta: TitledAdrMeta = {
      number,
      file: row.id,
      status: parsed.data,
      supersedes: numbers(bag["supersedes"]),
      amends: numbers(bag["amends"]),
      loadBearing: bag["loadBearing"] === true,
      title,
    };
    if (typeof decided === "string") meta.decided = decided;
    // The row carries an `asset:` pointer where the frontmatter carried a bare id; this view is the
    // frontmatter's, so it hands back the bare id its consumers already join on.
    if (typeof arcRef === "string" && arcRef.startsWith("asset:")) {
      meta.arc = arcRef.slice("asset:".length);
    }
    // ADR-0419 D1's support edge — see the header, including which `--load-bearing` guard this
    // deliberately removes. PRESENCE is preserved, not just contents: the key is assigned only when
    // the row actually carries the array, so an absent field stays absent and a row authored with
    // an empty one still reports as READ. Defaulting to `[]` is the one thing that would break it,
    // because it makes a blind reader and an empty decision log print the same number.
    //
    // The two library helpers rather than a hand-rolled `bag["dependsOn"]`: they are the same
    // defensive read the acyclicity rung, the depth walk and the studio wire use, and this loader
    // runs over the LIVE corpus, where a row written by another branch's schema must project as
    // "no edges" rather than take an orientation listing down. Pointers go through VERBATIM —
    // resolving which of them name decisions is the walk's job (`decision-pointer.ts`).
    if (hasDependsOnKey(bag)) meta.dependsOn = readDependsOnPointers(bag);
    adrs.push(meta);
  }
  adrs.sort((a, b) => a.number - b.number);
  return { adrs, parseErrors, unreadable: false, numberMismatches, descriptionMismatches };
}
