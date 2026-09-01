import type { StoredDoc } from "@storytree/storage-protocol";

/**
 * The reference-integrity scan behind `storytree library artifact retire` (owner call, 2026-06-20):
 * a session-facing, generalized RETIRE for ANY library artifact, gated not by kind but by whether
 * anything still DEPENDS ON the target. The one gate: you cannot retire an artifact while another
 * artifact references it — a hard refusal that lists the dependents so you re-point or retire them
 * first. This is the inverse altitude of the curator's OQ-only auto-retire (curate.ts): same
 * `store.deleteDoc` rationale primitive, but a reference wall instead of the open-question fence.
 *
 * "Depends on" = an intra-library `asset:<id>` EDGE — a string value that IS a ref, which is exactly
 * what every ref-bearing field in knowledge.ts declares via `AssetRef`: the authored `dependsOn`
 * edge, the agent kind's refList fields (`context` / `rules` / `antiPatterns`), an agent's
 * `stepRefs[].refs`, a process's `branchEdges[].ref`, and the `arcRef` / `settledByRef` pointers on
 * an increment / open question. This still walks every string in the body — so a new ref-bearing
 * field is covered the day it is added, with no per-kind list to keep — but it counts a value only
 * when the WHOLE value is a ref.
 *
 * IT USED TO COUNT `asset:` ANYWHERE IN ANY STRING, INCLUDING PROSE, and that is the defect
 * `realizing-an-entry-drops-the-friction-edge-cli-write-fidelity` closes. A friction item's
 * `routeReason` is a long adjudication record that NAMES the artifacts it reasons about; on
 * 2026-08-03 an inline `asset:<id>` token inside one 6433-character `routeReason` hard-refused the
 * retire of eight proposals, and the migration had to delete through the store instead — the exact
 * hand-path the verb exists to replace. The arc fold makes such citations MORE common, not fewer.
 *
 * WHAT THIS GIVES UP, on purpose: an artifact can now be retired while some other artifact's PROSE
 * mentions it, leaving a dangling name in a sentence. A name in a paragraph was never an edge in the
 * graph sense, nothing resolves it, and no render breaks — whereas a declared ref that dangles is a
 * broken pull. The gate keeps the guarantee it exists to give and stops charging for the other.
 * (`tree focus`'s inbound view reads only `dependsOn`, so it is still the narrower of the two.)
 *
 * ADR-0477 D1 NARROWED THIS WALL WITHOUT AN EDIT, which is the point of walking every string rather
 * than a per-kind list: the retired `references` citation list stopped being WRITTEN, so new rows
 * carry only the authored edges. It guards LESS than it did on those rows — an artifact whose only
 * inbound pointer was a fresh citation is now retirable — and that is the retirement's intent, not a
 * regression: a citation was never a dependency.
 *
 * ⚠ BUT THE FIELD IS NOT GONE FROM THE DATA, and reading it as gone is how ADR-0498's defect was
 * missed for as long as it was. Measured 2026-09-01: `adr-0018` still carries a 20-entry
 * `references` array and no `dependsOn` field at all, and it is that residue — `references[13]` —
 * that hard-refuses the retire of `adr-0028`. Walking every string is what keeps the wall correct
 * over rows the retirement never rewrote.
 *
 * THIS MODULE IS ALSO THE HONEST INBOUND READER'S WALK (ADR-0498 D1), and deliberately the SAME
 * one. `referencedAssetSites` is the single traversal; `referencedAssetIds` is its id projection and
 * `findDependents` is `findInboundRefs`'s `.doc` projection, so the wall and the reader cannot
 * disagree about what counts as an edge. Two implementations would diverge silently and in the
 * flattering direction — which is the exact failure `inbound.ts` exists to close.
 */

/** The `asset:<id>` shape — mirrors `AssetRef` in @storytree/library (knowledge.ts). Anchored. */
const ASSET_REF = /^asset:([A-Za-z0-9_-]+)$/;

/** One `asset:<id>` edge, and the field path in the referring doc body that carries it. */
export interface AssetRefSite {
  /** The referenced artifact id — the `<id>` in `asset:<id>`. */
  readonly id: string;
  /** Where the ref sits, e.g. `dependsOn[0]`, `stepRefs[2].refs[1]`, `arcRef`, `references[13]`. */
  readonly path: string;
}

/**
 * THE ONE WALK. Every library `asset:<id>` this doc body references as an EDGE, each with the field
 * path it was found at: walk all string values (recursing into arrays/objects) and take the ones
 * that ARE a ref. Document order, NOT deduped — the same id referenced from two fields is two sites,
 * which is exactly what a caller planning a repoint needs to see.
 *
 * The path is what turns an opaque refusal into a diagnosis. `via references[13]` says at a glance
 * that the edge is residue from the field ADR-0477 retired; `via arcRef` says it is a containment
 * pointer and not an argument. A bare list of referring ids can say neither.
 */
export function referencedAssetSites(doc: unknown): AssetRefSite[] {
  const sites: AssetRefSite[] = [];
  const visit = (v: unknown, path: string): void => {
    if (typeof v === "string") {
      const m = ASSET_REF.exec(v.trim());
      if (m?.[1] !== undefined) sites.push({ id: m[1], path });
    } else if (Array.isArray(v)) {
      v.forEach((item, i) => visit(item, `${path}[${i}]`));
    } else if (typeof v === "object" && v !== null) {
      for (const [k, item] of Object.entries(v)) visit(item, path === "" ? k : `${path}.${k}`);
    }
  };
  visit(doc, "");
  return sites;
}

/**
 * Every library `asset:<id>` this doc body references as an EDGE. The id PROJECTION of the one walk
 * above — never its own traversal, so the wall this feeds and the reader in `inbound.ts` cannot
 * drift apart. Order-free, deduped (a Set).
 */
export function referencedAssetIds(doc: unknown): Set<string> {
  return new Set(referencedAssetSites(doc).map((s) => s.id));
}

/** A referring artifact, and every field path in it that points at the target. */
export interface InboundRef {
  readonly doc: StoredDoc;
  /** Every site in `doc` carrying an `asset:<targetId>` edge, in document order. Never empty. */
  readonly paths: readonly string[];
}

/**
 * Every artifact that references `targetId`, with the field paths that do it — the honest inbound
 * population (ADR-0498 D1) and, projected to its docs, the retire wall's dependent list. Excludes
 * the target itself; sorted by id for a stable listing.
 */
export function findInboundRefs(targetId: string, docs: readonly StoredDoc[]): InboundRef[] {
  const found: InboundRef[] = [];
  for (const d of docs) {
    if (d.id === targetId) continue;
    const paths = referencedAssetSites(d.doc)
      .filter((s) => s.id === targetId)
      .map((s) => s.path);
    if (paths.length > 0) found.push({ doc: d, paths });
  }
  return found.sort((a, b) => a.doc.id.localeCompare(b.doc.id));
}

/**
 * The other artifacts that reference `targetId` via an `asset:<targetId>` edge — the dependents that
 * must be re-pointed or retired before `targetId` can be retired.
 *
 * The `.doc` projection of `findInboundRefs`, and that is load-bearing rather than incidental: it is
 * what makes "the reader and the wall see the same population" true by construction instead of by
 * two implementations agreeing today (ADR-0498 D1).
 */
export function findDependents(targetId: string, docs: readonly StoredDoc[]): StoredDoc[] {
  return findInboundRefs(targetId, docs).map((r) => r.doc);
}
