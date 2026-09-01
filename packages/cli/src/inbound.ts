/**
 * `storytree library inbound <id>` — the HONEST inbound-reference reader (ADR-0498 D1).
 *
 * WHY IT EXISTS, measured 2026-09-01 while planning a retirement:
 *
 *     storytree library tree focus adr-0028        →  inbound (what stands on this): (none yet)
 *     storytree library artifact retire adr-0028   →  REFUSED, naming adr-0018
 *
 * Both behaved as built. `tree focus`'s inbound view reads the authored `dependsOn` edge; the retire
 * wall walks every string value that IS an `asset:<id>` ref, across every reference-bearing field.
 * The edge that caused the refusal sits in adr-0018's `references[13]` — data residue from the field
 * ADR-0477 retired — and adr-0018 carries no `dependsOn` field at all, so the authored-edge view
 * could never have seen it, on that row or on any of the others the retirement never rewrote.
 *
 * ⚠ THE DIRECTION OF THE ERROR IS THE DEFECT, NOT THE NARROWNESS. A narrow reader is fine. A narrow
 * reader that a session reaches for to answer *"is anything standing on this?"*, and that answers
 * CLEAR when the truth is BLOCKED, is not: a triage planned against it walks into refusals it was
 * told would not happen, which is exactly what happened. It fails toward reassurance — the failure
 * class this repo has spent the most effort on. The remedy is NEVER to narrow the wall to match;
 * that would delete a real guarantee to make two instruments agree.
 *
 * ⚠ IT SHARES THE WALL'S WALK RATHER THAN COPYING IT. `findInboundRefs` in `retire.ts` is the one
 * traversal, and `findDependents` — what the wall calls — is its `.doc` projection. Two
 * implementations of "what counts as an edge" would diverge silently and in the flattering
 * direction, which is the failure this verb exists to close.
 *
 * ⚠ IT INHERITS THE ADR-0477 NARROWING and must keep it: a value counts only when the WHOLE value
 * is a ref. An `asset:` token inside prose is a sentence, not an edge — an inline one inside a
 * 6433-character `routeReason` once hard-refused eight retires.
 *
 * A READ, so it needs no `--pg` to be honest: a bare `storytree library …` already dials the live
 * store.
 */

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import type { Envelope } from "@storytree/drive";

import { findInboundRefs } from "./retire.js";

/** An authored `dependsOn` edge — the narrow population `tree focus` renders. */
function isAuthoredEdge(path: string): boolean {
  return path === "dependsOn" || path.startsWith("dependsOn[");
}

function titleOf(stored: StoredDoc): string {
  const doc = stored.doc;
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>).title;
    if (typeof v === "string") return v;
  }
  return "";
}

/**
 * `storytree library inbound <id>` — what points at this artifact, and THROUGH WHICH FIELD, over the
 * same population `library artifact retire` enforces.
 */
export async function libraryInbound(store: Store, id: string | undefined): Promise<Envelope> {
  if (id === undefined || id === "") return libraryInboundHelp();

  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" in the corpus. ids are exact and case-sensitive.`,
      next: [`storytree library search "${id}"`, "storytree library"],
    };
  }

  const all = await store.queryDocs();
  const refs = findInboundRefs(id, all);
  const header = `${id} — ${titleOf(stored)}   [${stored.kind}]`;

  if (refs.length === 0) {
    return {
      ok: true,
      body: [
        header,
        "",
        `nothing references ${id} — across EVERY reference-bearing field, which is the same`,
        "population `storytree library artifact retire` enforces. So this is an honest CLEAR:",
        "the reference wall will not refuse a retire of it.",
        "",
        `(scanned ${all.length} artifacts. A name that appears only inside PROSE is not an edge —`,
        " ADR-0477 — so a paragraph may still mention this by name.)",
      ].join("\n"),
      next: [`storytree library artifact ${id}`, `storytree library tree focus ${id}`],
    };
  }

  const siteCount = refs.reduce((n, r) => n + r.paths.length, 0);
  const authoredCount = refs.filter((r) => r.paths.some(isAuthoredEdge)).length;
  const rows = refs.flatMap((r) => [
    `  ← ${r.doc.id}  ${titleOf(r.doc)}  [${r.doc.kind}]`,
    `      via ${r.paths.join(", ")}`,
  ]);

  return {
    ok: true,
    body: [
      header,
      "",
      `${refs.length} artifact${refs.length === 1 ? "" : "s"} reference${refs.length === 1 ? "s" : ""} this` +
        ` through ${siteCount} field${siteCount === 1 ? "" : "s"} — the same population` +
        " `library artifact retire` enforces.",
      "",
      ...rows,
      "",
      // The divergence, made visible AT the reader: how much of this the narrow view would show.
      `authored depends_on edges: ${authoredCount} of ${refs.length}` +
        `   (\`storytree library tree focus ${id}\` shows only those)`,
      // The reader's real customer is a session planning a decision's exit, so it names the exit
      // rather than leaving them to rediscover the refusal. ADR-0497 D2: retirement is not the
      // route for ANY decision with an inbound reference, and the wall is right to refuse it.
      ...(stored.kind === "adr"
        ? [
            "",
            "retirement is not the route while anything points here (ADR-0497 D2) — `retire` deletes",
            "the row, so the wall will refuse. The exit is a CONSOLIDATING SUPERSESSION: the row",
            "survives, so every edge above stays valid, and it leaves `adr list --current`.",
          ]
        : []),
    ].join("\n"),
    next: [`storytree library artifact ${id}`, `storytree library tree focus ${id}`],
  };
}

/** `storytree library inbound --help`. */
export function libraryInboundHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library inbound <id>",
      "",
      "  What points at this artifact, and THROUGH WHICH FIELD — over the same population",
      "  `library artifact retire` enforces. The retirement pre-check.",
      "",
      "  `library tree focus <id>` shows the AUTHORED depends_on edge alone, which is what it is",
      "  for. This verb is the wider read: it also sees an agent's context/rules/antiPatterns and",
      "  stepRefs, a process's branchEdges, an increment's arcRef, an open question's settledByRef,",
      "  and residue in the retired `references` list. On 2026-09-01 the narrow view said none and",
      "  the wall then refused — this is the reader that cannot say that (ADR-0498).",
      "",
      "  The field path is the useful half: `via references[13]` says the edge is residue from a",
      "  retired field, `via arcRef` says it is containment. Both need different repointing.",
      "",
      "  A name that appears only inside PROSE is NOT an edge (ADR-0477) — neither here nor at the",
      "  wall. Use `library search` to find those.",
      "",
      "  For a DECISION, any inbound reference means retirement is not the route at all (ADR-0497",
      "  D2) — the exit is a consolidating supersession, which keeps the row and every edge to it.",
      "",
      "  A READ: no --pg needed, a bare library read already dials the live store.",
      "",
      "examples",
      "  storytree library inbound adr-0028",
      "  storytree library inbound merge-ceremony",
    ].join("\n"),
    next: ["storytree library inbound adr-0028"],
  };
}
