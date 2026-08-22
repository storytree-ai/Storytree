import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import type { Store } from "@storytree/storage-protocol";

import { adrDescriptionOf, adrDocId, parseAdrDocument } from "../adr-doc.js";
import { upcastAndValidate } from "../library-doc.js";
import { REPO_ROOT_ENV, resolveRepoRoot } from "../repo-root.js";

/**
 * THE ONE-SHOT DECISION LOAD (ADR-0403 dec 1) — `docs/decisions/**` becomes rows.
 *
 * `decision-log-home-arc` increment 03.
 *
 * A BACKFILL, not a migration, and the distinction is the same one migration #5's header draws: a
 * per-doc transform in the registry cannot CREATE documents, so anything that mints rows has to be a
 * one-shot. The registry is untouched by this increment: a new kind changes no existing document, so
 * there is nothing to forward-migrate and no `CURRENT_SCHEMA_VERSION` bump.
 *
 * ## IT RUNS BEFORE THE FILES ARE DELETED, DELIBERATELY
 *
 * This is increment 03; removing `docs/decisions/**` is increment 05, in a quiet window. Between the
 * two the corpus has BOTH — the rows are canonical for anything reading the store, the files are
 * still there for every reader not yet ported, and the two are reconciled by re-running this loader,
 * which is idempotent. That window is what lets ~45 readers (the `-inc-02` census) move one at a
 * time and be checked against a second source, instead of all at once against nothing.
 *
 * Existing `doc:decisions/…` pointers are deliberately NOT rewritten onto `asset:adr-NNNN` — see
 * `decision-pointer.ts` for why, in short: all three spellings resolve through one parser already, so
 * a 1,035-pointer rewrite would buy nothing, and what has to change when the files go is the
 * RESOLVER. The one place this loader DOES mint artifact refs is a decision's own body cross-links
 * ({@link crossLinkedDecisionRefs}), because those have no resolver to fix — `adr-link-integrity`
 * dies with the files and its rot class would otherwise go unguarded.
 *
 * ## FAIL-LOUD AND ALL-OR-NOTHING ON PARSE
 *
 * Every file is parsed before ANY row is written. A decision log half in the store and half on disk,
 * with no record of which half, is the one outcome worse than not having run: the corpus's own
 * `load_bearing` query would return a smaller set and nothing would say why. `loadAdrMetas` in
 * `@storytree/drive` collects parse errors into lines instead of throwing, and that is right for a
 * VIEW over a possibly-broken checkout; it is wrong for the write that makes those files redundant.
 */

/** The `docs/decisions/` filename shape — `NNNN-slug.md`, the ADR-0050 allocator's own format. */
const DECISION_FILE = /^(\d{4})-.*\.md$/;

/**
 * A markdown cross-link between decision bodies — `](0223-the-knowledge-dag.md)`, optionally with a
 * leading path. This is what `adr-link-integrity` guards today, measured at 13 dead targets across
 * 24 occurrences (the rename rot: the NUMBER is right and the slug is a pre-rename name).
 */
const BODY_CROSS_LINK = /\]\((?:\.\.\/)*(?:docs\/)?(?:decisions\/)?(\d{4})-[^)]*\.md\)/g;

export interface LoadDecisionsResult {
  /** How many `NNNN-*.md` files were found. */
  readonly scanned: number;
  /** How many rows were written. Equal to `scanned` on a successful run. */
  readonly written: number;
  /** The decision numbers written, ascending — the caller's denominator. */
  readonly numbers: readonly number[];
}

/**
 * The `docs/decisions` directory, resolved from the repo root as a PARAMETER (ADR-0246) rather than
 * from this module's own location, so `STORYTREE_REPO_ROOT` repoints it at another checkout.
 */
export function decisionsDir(): string {
  const { root } = resolveRepoRoot({
    env: process.env[REPO_ROOT_ENV],
    derived: fileURLToPath(new URL("../../../../", import.meta.url)),
  });
  return join(root, "docs", "decisions");
}

/**
 * PURE: the decisions a body cross-links to, as `asset:adr-NNNN` refs, deduped and in first-seen
 * order.
 *
 * WHY THIS IS EXTRACTED AT ALL. `adr-link-integrity` dies with the files — a relative markdown link
 * between two FILES has no meaning between two ROWS — and the `-inc-02` census names the risk
 * plainly: the migration would trade a guarded rot class for an unguarded one. Lifting the links
 * into `references` puts them where `referential-integrity` already looks, so a citation at a
 * decision that does not exist is caught by a rung that already runs.
 *
 * It also RETIRES the measured rot rather than carrying it: the link's slug is what rots, and an
 * `asset:adr-NNNN` ref has no slug to be stale. The dead markdown link stays in the body prose,
 * which is increment 05's business, not this one's.
 *
 * `amends` / `supersedes` targets are deliberately NOT folded in here. Those are typed edges with
 * their own fields and their own rules — never summed, never merged (ADR-0403 dec 6) — and a
 * citation list that quietly contained them would be the first step toward treating them as one.
 */
export function crossLinkedDecisionRefs(body: string, selfNumber: number): string[] {
  const refs: string[] = [];
  for (const match of body.matchAll(BODY_CROSS_LINK)) {
    const raw = match[1];
    if (raw === undefined) continue;
    const number = Number(raw);
    // A decision linking to itself is a table-of-contents artefact, not a citation, and would make
    // the artifact its own source.
    if (number === selfNumber) continue;
    const ref = `asset:${adrDocId(number)}`;
    if (!refs.includes(ref)) refs.push(ref);
  }
  return refs;
}

/**
 * Read every decision file and write it as an `adr` row through the validated write boundary.
 *
 * IDEMPOTENT. Re-running upserts the same rows, and an existing row's `createdAt` is preserved, so a
 * second pass during the dual-source window does not rewrite the tier's birth dates. `updatedAt`
 * moves, which is honest: the row WAS written again.
 */
/** The optional half of the `adr` row, built under guards and spread in whole — see
 *  {@link AdrOptionalFields} in `adr-doc.ts` for why this is a named interface rather than a draft
 *  of the row type or an inline type literal. */
interface AdrRowOptionalFields {
  decided?: string;
  arcRef?: string;
}

export async function loadDecisions(store: Store, dir = decisionsDir()): Promise<LoadDecisionsResult> {
  const files = (await readdir(dir)).filter((f) => DECISION_FILE.test(f)).sort();

  // PASS ONE — parse everything. Nothing is written until every file has been read successfully.
  const parsed = await Promise.all(
    files.map(async (file) => {
      const match = DECISION_FILE.exec(file);
      // The FILENAME is the number, never the `# ADR-NNNN:` heading — one committed record disagrees
      // with its own filename, and the filename is what the allocator reserved (see `adr-doc.ts`).
      const number = Number(match?.[1]);
      const content = await readFile(join(dir, file), "utf8");
      try {
        return { number, fields: parseAdrDocument(number, content) };
      } catch (err) {
        throw new Error(`${file}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }),
  );

  // PASS TWO — write.
  const now = new Date().toISOString();
  const numbers: number[] = [];
  for (const { number, fields } of parsed) {
    const id = adrDocId(number);
    const existing = await store.getDoc(id);
    const existingCreatedAt = (existing?.doc as { createdAt?: unknown } | undefined)?.createdAt;
    // `decided` is the honest birth date where the record carries one — it is the day the decision
    // was made, which is what a reader sorting the tier by age means. Fifteen of the 403 have none.
    const createdAt =
      typeof existingCreatedAt === "string"
        ? existingCreatedAt
        : fields.decided !== undefined
          ? `${fields.decided}T00:00:00.000Z`
          : now;

    const optional: AdrRowOptionalFields = {};
    if (fields.decided !== undefined) optional.decided = fields.decided;
    // The frontmatter carries a BARE arc id; the row carries the `asset:` pointer every other
    // containment stamp in the corpus uses (`Increment.arcRef` / `OpenQuestion.arcRef`), so the
    // arc surface's ADR leg becomes an ordinary pointer query.
    if (fields.arc !== undefined) optional.arcRef = `asset:${fields.arc}`;
    const doc = upcastAndValidate({
      kind: "adr",
      id,
      // A decision has no separate one-liner: its H1 IS its summary, and inventing a second one at
      // load time would be prose nobody wrote. The filename-derived fallback covers a record with no
      // H1 at all (none today, but the parser reports "" rather than throwing, so this must too).
      title: fields.title === "" ? id : fields.title,
      description: adrDescriptionOf(number, fields.title),
      body: fields.body,
      number: fields.number,
      status: fields.status,
      amends: [...fields.amends],
      supersedes: [...fields.supersedes],
      loadBearing: fields.loadBearing,
      references: crossLinkedDecisionRefs(fields.body, number),
      createdAt,
      updatedAt: now,
      ...optional,
    });

    await store.upsertDoc({ id, kind: "adr", doc: doc as Record<string, unknown> });
    numbers.push(number);
  }

  return { scanned: files.length, written: numbers.length, numbers };
}

/**
 * Run it: `npx tsx packages/library/src/store/load-decisions.ts` (needs `STORYTREE_DB_USER` or the
 * CLI's secrets hydration, and the DB up). Deliberately a thin main — the store is constructed here
 * and nowhere inside {@link loadDecisions}, so the same function is exercised against `InMemoryStore`
 * by the test suite with no credential.
 */
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { createPool, closePool } = await import("./connection.js");
  const { PgLibraryStore } = await import("./pg-store.js");
  const handle = await createPool();
  try {
    const result = await loadDecisions(new PgLibraryStore(handle.pool));
    process.stdout.write(
      `loaded ${String(result.written)}/${String(result.scanned)} decisions ` +
        `(${String(result.numbers[0] ?? 0)}..${String(result.numbers[result.numbers.length - 1] ?? 0)})\n`,
    );
  } finally {
    await closePool(handle.pool, handle.connector);
  }
}
