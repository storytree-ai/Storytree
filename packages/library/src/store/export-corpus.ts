import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { InMemoryStore } from "@storytree/storage-protocol";
import { upcast } from "../migrations.js";
import { Knowledge, SEED_SCOPE_KINDS } from "../knowledge.js";
import { loadCorpus } from "./load-corpus.js";

/**
 * The LIVE→SEED export (ADR-0120) — the inverse of `sync-corpus`'s seed→live migrate.
 *
 * `sync-corpus` (ADR-0103) carries seed-only artifacts DOWN to the live store, migrate-only, because
 * in that direction live is canonical and must never be clobbered. This module carries the canonical
 * LIVE tier back UP into the seed (`apps/studio/data/knowledge.json`), which is otherwise only a
 * lagging export — the gap ADR-0103 left as "later work". The conflict policy is the OWNER-DIRECTED
 * inverse (ADR-0120 decision a): **overwrite** a seed body that has drifted from live, and **add**
 * live-only artifacts — because the seed is the lagging side here, so mirroring the canonical live
 * body into it is correct (the symmetry that forced sync-corpus's migrate-only flips).
 *
 * Two invariants keep it honest:
 *  - **NEVER DELETE.** A seed entry absent from live is kept (it may be a graduation edit live has not
 *    caught up to, or a seed-canonical `agent`). The export only ever overwrites or appends.
 *  - **NEVER WRITE A DEGRADED BODY.** A live doc only overwrites/adds if it is a valid structured doc
 *    AT the current schema floor ({@link isExportableLiveDoc}). A degraded/below-floor live body (e.g.
 *    `audit-the-signed-verdict` stored at v0 in the rendered `{body,category}` shape) is REFUSED —
 *    writing it would corrupt the canonical seed; it is reported for a seed→live restore instead.
 *
 * SCOPE = {@link SEED_SCOPE_KINDS}, the durable tier `knowledge.json` is the canonical home of
 * (ADR-0263). That constant is an ALLOWLIST, so a kind nobody has ruled on is out until deliberately
 * admitted — see its doc for why the previous denylist silently enrolled `friction` / `arc` /
 * `uat-criterion` and what that would have written into the seed.
 */

/** True iff this kind is owned by the knowledge.json live→seed export — see {@link SEED_SCOPE_KINDS}. */
export function isExportScopeKind(kind: string): boolean {
  return SEED_SCOPE_KINDS.has(kind);
}

/** A loose knowledge.json entry — the whole object IS the doc body (it carries its own id + kind). */
export type SeedEntry = Record<string, unknown> & { id: string; kind: string };

/**
 * Stable, key-sorted JSON so a mere field-ORDER difference is never read as content drift.
 *
 * Exported because "do these two bodies differ" is asked in more than one place — the drift diff here,
 * and `check:corpus-content`'s comparison of one seed revision against another (ADR-0290 attribution).
 * Sharing the normalizer is what stops those two from disagreeing about what a difference IS: a
 * re-serialisation that reorders keys must not read as an edit on either side.
 */
export function canonicalJson(v: unknown): string {
  const norm = (x: unknown): unknown => {
    if (x === null || typeof x !== "object") return x;
    if (Array.isArray(x)) return x.map(norm);
    const o = x as Record<string, unknown>;
    return Object.keys(o)
      .sort()
      .reduce<Record<string, unknown>>((acc, k) => ((acc[k] = norm(o[k])), acc), {});
  };
  return JSON.stringify(norm(v));
}

function bodyOf(d: StoredDoc): Record<string, unknown> {
  return typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {};
}

/**
 * The canonical, current-version STRUCTURED body to mirror into the seed for a live doc, or `null` if
 * the live doc is not export-safe. A doc is export-safe iff it is an in-scope kind AND its body
 * upcasts to a valid STRUCTURED {@link Knowledge} unit. The structured-schema check is the load-bearing
 * guard: `upcastAndValidate` also accepts the rendered `{body, category}` `LibraryAsset` shape (the
 * degraded form a `--pg` mishap or studio asset-edit can leave), so validating against `Knowledge`
 * specifically — not the looser `LibraryDoc` union — is what refuses a degraded body. We write the
 * UPCAST output so the seed always receives the canonical current-version structured form.
 */
function exportableBody(d: StoredDoc): Record<string, unknown> | null {
  if (!isExportScopeKind(d.kind)) return null;
  let upcasted: unknown;
  try {
    upcasted = upcast(bodyOf(d));
  } catch {
    return null;
  }
  return Knowledge.safeParse(upcasted).success ? (upcasted as Record<string, unknown>) : null;
}

/** True iff this live doc is safe to mirror into the canonical seed (see {@link exportableBody}). */
export function isExportableLiveDoc(d: StoredDoc): boolean {
  return exportableBody(d) !== null;
}

export type DriftClass = "value-drift" | "degraded-live";

export interface CorpusContentDrift {
  readonly id: string;
  readonly kind: string;
  /**
   * `value-drift` — live is a valid current body that differs from seed: a genuine edit (direction is
   * not inferable, so resolve on the live edit surface). `degraded-live` — live is below the schema
   * floor / invalid: the SEED is canonical, restore it seed→live (`artifact edit <id> --file --pg`).
   */
  readonly cls: DriftClass;
}

export interface CorpusContentDiff {
  /** Export-scope ids present in BOTH seed and live whose bodies differ, classified (sorted by id). */
  readonly drifted: readonly CorpusContentDrift[];
  /**
   * Export-scope ids the LIVE store carries and the seed does not (sorted) — the population this diff
   * is structurally blind to on both drift axes, reported so a caller can no longer be silent about it.
   *
   * It is NOT drift: there is nothing to compare, so it is neither `value-drift` nor `degraded-live`.
   * It matters because {@link computeExportedSeed} APPENDS every one of these to the seed, so the
   * export writes a strict SUPERSET of what `drifted` names. Measured 2026-07-30: a caller printed
   * `OK — every seed body matches live across 177 export-scope artifacts` and exited 0 while the
   * export in the same shell reported one pending addition (`oq-diff-view-altitude`, an owner-retired
   * open question a blind `--write` would have resurrected into the committed seed).
   *
   * A live-only id has two OPPOSITE causes and the direction call is per-artifact (`library-edit-
   * ceremony`): a graduation that reached live but never the seed (export it), or an artifact
   * deliberately RETIRED live while a stale branch still carries the seed row (drop the live row).
   */
  readonly liveOnly: readonly string[];
  /** Export-scope seed ids compared. */
  readonly compared: number;
  /**
   * Export-scope seed ids that actually HAD a live counterpart — the population a body comparison was
   * genuinely performed over. It is `compared` minus the seed ids live carries nothing for.
   *
   * Separate from {@link compared} because the two diverge exactly when the result stops being
   * evidence, and the difference is invisible in `drifted`: a seed id with no live row is SKIPPED, not
   * flagged, so a live store that is empty or truncated yields `drifted: []`, `clean: true` — a FALSE
   * clean rather than a false alarm. Measured on the authoring checkout: an empty live store took
   * `drifted` 14 → 0 with `compared` still reading 160. A caller that reports "clean" without also
   * reading this number cannot tell a genuinely reconciled corpus from one nothing was compared against.
   */
  readonly comparedLive: number;
  readonly clean: boolean;
}

/**
 * READ-ONLY body-level diff of the export-scope tier — the content reconciliation `count-reconciliation`
 * and `check:corpus-sync` (id/count only) never did. Reports only ids present in BOTH sides whose
 * bodies differ (a seed-only id is the never-delete / sync-corpus domain, not content drift).
 */
export function diffCorpusContent(seed: readonly StoredDoc[], live: readonly StoredDoc[]): CorpusContentDiff {
  const liveById = new Map(live.filter((d) => isExportScopeKind(d.kind)).map((d) => [d.id, d]));
  const seedScope = seed.filter((d) => isExportScopeKind(d.kind));
  const seedIds = new Set(seedScope.map((d) => d.id));
  const drifted: CorpusContentDrift[] = [];
  let comparedLive = 0;
  for (const s of seedScope) {
    const l = liveById.get(s.id);
    if (!l) continue;
    // Counted BEFORE the equality test: this is the population a comparison happened over, whether or
    // not it drifted. It is what tells a caller that a `clean` result was measured against something.
    comparedLive++;
    const eb = exportableBody(l);
    // Compare against what the export WOULD write (the upcast structured body, or the raw body if the
    // live doc is degraded) so a v(n)→v2 upcast that already equals the seed is not flagged as drift.
    if (canonicalJson(s.doc) === canonicalJson(eb ?? bodyOf(l))) continue;
    drifted.push({ id: s.id, kind: s.kind, cls: eb ? "value-drift" : "degraded-live" });
  }
  // The other direction, which the seed walk above cannot reach: ids live carries and the seed does
  // not. `computeExportedSeed` appends every one of them, so a caller that reports only `drifted`
  // understates what the export writes — see {@link CorpusContentDiff.liveOnly}.
  const liveOnly = [...liveById.keys()].filter((id) => !seedIds.has(id)).sort((a, b) => a.localeCompare(b));
  drifted.sort((a, b) => a.id.localeCompare(b.id));
  return { drifted, liveOnly, compared: seedScope.length, comparedLive, clean: drifted.length === 0 };
}

/** Convenience: diff the SEED corpus against a live `target` store (read-only). */
export async function diffSeedCorpusContent(target: Store): Promise<CorpusContentDiff> {
  const seed = new InMemoryStore();
  await loadCorpus(seed);
  return diffCorpusContent(await seed.queryDocs(), await target.queryDocs());
}

export interface ExportSeedResult {
  /** The new knowledge.json entries (input order preserved; created entries appended in id order). */
  readonly entries: readonly SeedEntry[];
  /** Seed entries whose body was overwritten from a (newer/edited) live body (sorted). */
  readonly updated: readonly string[];
  /** Live-only artifacts appended to the seed (sorted). */
  readonly created: readonly string[];
  /** Drifted live docs REFUSED because their body is degraded/below-floor — restore seed→live (sorted). */
  readonly skippedDegraded: readonly string[];
  /** Export-scope entries left byte-identical. */
  readonly unchanged: number;
  /** True iff nothing would change (no updates, no creations). */
  readonly noop: boolean;
}

/** Narrow the export to specific artifact ids — see {@link computeExportedSeed}'s `ids` contract. */
export interface ExportSeedOptions {
  /**
   * When present, the export considers ONLY these live ids: every other live doc is invisible to both
   * the overwrite pass and the append pass, so a seed entry outside the set is returned untouched.
   *
   * This is the drain granularity `check:corpus-content` needs. Unscoped, the export is one act over
   * the whole corpus, so a session that must reconcile ONE artifact can only do it by also writing
   * every OTHER drifted body — a sibling's in-flight edit lands in its commit under its name — and by
   * appending every live-only artifact on top, which the drift axes cannot even see. Scoping is what
   * lets a session discharge exactly what it authored.
   *
   * An id in the set that live does not carry is simply a no-op here (nothing to write from). The
   * NEVER-DELETE and NEVER-WRITE-A-DEGRADED-BODY invariants are unchanged and unconditional: scoping
   * removes candidates, it never adds a permission.
   */
  ids?: ReadonlySet<string> | undefined;
}

/**
 * Compute the new knowledge.json contents from the live store — pure (entries in, entries out), so it
 * is unit-testable offline against an {@link InMemoryStore}. The CLI wrapper reads the live store +
 * the seed file, calls this, and writes the file. See the module doc for policy.
 *
 * Pass {@link ExportSeedOptions.ids} to scope the write to specific artifacts. The scope is applied
 * ONCE, by filtering the live input — the overwrite pass, the append pass and the degraded-body
 * refusal all read that same narrowed map, so a scoped run cannot diverge in policy from an unscoped
 * one. There is deliberately no second code path.
 */
export function computeExportedSeed(
  seedEntries: readonly SeedEntry[],
  live: readonly StoredDoc[],
  opts: ExportSeedOptions = {},
): ExportSeedResult {
  const scope = opts.ids;
  const inScope = (d: StoredDoc): boolean =>
    isExportScopeKind(d.kind) && (scope === undefined || scope.has(d.id));
  const liveById = new Map(live.filter(inScope).map((d) => [d.id, d]));
  const seedIds = new Set(seedEntries.map((e) => e.id));

  const updated: string[] = [];
  const skippedDegraded: string[] = [];
  let unchanged = 0;

  const entries: SeedEntry[] = seedEntries.map((entry) => {
    if (!isExportScopeKind(entry.kind)) return entry; // agents / out-of-scope: untouched
    const l = liveById.get(entry.id);
    if (!l) return entry; // live has nothing for it — never delete
    const eb = exportableBody(l);
    // Compare against what would be written (upcast structured body, else raw) — a v(n)→v2 upcast that
    // already matches the seed is a no-op, not an overwrite.
    if (canonicalJson(entry) === canonicalJson(eb ?? bodyOf(l))) {
      unchanged++;
      return entry;
    }
    // Bodies differ. Overwrite only with an exportable (valid, structured) live body.
    if (eb) {
      updated.push(entry.id);
      return eb as SeedEntry;
    }
    skippedDegraded.push(entry.id);
    return entry; // degraded live — keep the canonical seed body, report for restore
  });

  // Append live-only export-scope artifacts that are exportable. Iterates the SAME narrowed map the
  // overwrite pass read, so a scoped run appends only what it was asked for — the append pass is
  // where an unscoped export silently carries a sibling's live-only artifact into the seed.
  const created: string[] = [];
  for (const d of liveById.values()) {
    if (seedIds.has(d.id)) continue;
    const eb = exportableBody(d);
    if (!eb) {
      skippedDegraded.push(d.id);
      continue;
    }
    entries.push(eb as SeedEntry);
    created.push(d.id);
  }

  return {
    entries,
    updated: updated.sort(),
    created: created.sort(),
    skippedDegraded: skippedDegraded.sort(),
    unchanged,
    noop: updated.length === 0 && created.length === 0,
  };
}
