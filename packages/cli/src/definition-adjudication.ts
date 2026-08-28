/**
 * THE PURE HALF of `pnpm check:definition-adjudication` — ADR-0468 D3's rung over the `definition`
 * tier's authored `dependsOn` edges.
 *
 * WHAT IT ASSERTS, AND WHAT IT DELIBERATELY DOES NOT. Every definition must be ADJUDICATED: it
 * either carries at least one authored edge, or its id appears in {@link ADJUDICATED_WITHOUT_EDGES}.
 * It does NOT assert that every definition carries an edge. That weaker-looking rule is the one
 * ADR-0468 D3 REFUSES, and the refusal is the load-bearing half: "every row carries at least one"
 * prices the work toward padding the field, which is exactly the failure mode ADR-0464's candidate-D
 * refusal names — an unbounded authoring obligation with no honest stopping rule rots into a list
 * nobody means. A definition that genuinely rests on no recorded decision is supposed to carry
 * nothing, and this rung makes saying so a first-class pass rather than a hole.
 *
 * WHY THE EXEMPTION CANNOT ROT INTO A DUMPING GROUND. An allowlist that only ever grants passes is
 * how a check becomes decorative, so two of the four failure modes below point AT the list rather
 * than at the corpus: an exemption whose subject has since gained edges is STALE and reds, and an
 * exemption naming something that is not a definition at all is PHANTOM and reds. The list can only
 * be right about the present.
 *
 * PURE and total: it takes rows and returns a verdict, so every rule here is proven hermetically in
 * `definition-adjudication.test.ts` under the credential-free `pnpm -r test` leg (ADR-0302 D3), and
 * `check-definition-adjudication.ts` only reads the store, prints, and sets an exit code.
 */

/**
 * The definitions deliberately left with NO authored edge, because no recorded decision constitutes
 * them. Ids only — the reasons are here in prose, where `check:mutation-diff` does not charge one
 * mutant per word (`data-fixture-module-floods-mutation-diff`).
 *
 * - `fixture` — a general testing term. Nothing in the decision log decided what a fixture is.
 * - `ndjson` — an external data format. storytree decided only its SPELLING (never "JSONL"), which
 *   is a naming convention rather than a decision the term rests on.
 * - `probe` — the owner's spoken alias for the explorer subagent. An alias rests on the thing it
 *   renames, and that thing is a definition and an agent, not a decision.
 * - `proof-hash` — the mechanism is real and lives in the spine (`orchestrator/src/proof/`), but no
 *   decision in the log constitutes it; ADR-0016's `boundHash` is the knowledge-to-code drift
 *   anchor, a different subject. Pointing at ADR-0007 because verdicts live there would name a
 *   decision that does not decide this, which is the padding the rung exists to refuse.
 *
 * Removing an id from here is a claim that the definition now rests on something; adding one is a
 * claim that it rests on nothing. Both are curator judgments, and both must be true on the day.
 */
export const ADJUDICATED_WITHOUT_EDGES: ReadonlySet<string> = new Set([
  "fixture",
  "ndjson",
  "probe",
  "proof-hash",
]);

/** The minimal stored-doc facts the judge needs. Matches `StoredDoc` structurally. */
export interface AdjudicationRow {
  readonly id: string;
  readonly kind: string;
  readonly doc: unknown;
}

/** What the rung found. Every field is a denominator or a named failure — never a bare boolean. */
export interface AdjudicationVerdict {
  /** `definition` rows considered — the denominator, so a thin read cannot read as a whole tier. */
  readonly scanned: number;
  /** Definitions carrying at least one authored edge. */
  readonly withEdges: number;
  /** Total authored edges across the tier. */
  readonly edges: number;
  /** Exempt ids that ARE definitions carrying no edge — the intended, passing shape. */
  readonly exempt: readonly string[];
  /** FAIL: a definition with no edges and no exemption. Nobody has decided what it rests on. */
  readonly unadjudicated: readonly string[];
  /** FAIL: an exemption whose subject now carries edges — the list is behind the corpus. */
  readonly staleExemptions: readonly string[];
  /** FAIL: an exemption naming an id that is not a `definition` row (renamed, retired, or typo'd). */
  readonly phantomExemptions: readonly string[];
  /** FAIL: an `asset:` target naming no artifact in the corpus — the rot ADR-0464 D8 describes. */
  readonly danglingTargets: readonly string[];
  readonly ok: boolean;
}

/**
 * A definition tier this small is a BLIND READ, not a clean one. Borrowed verbatim in spirit from
 * `check:library-dag-acyclic`'s `VACUOUS_DEPENDS_ON_READ_FLOOR`: an instrument that cannot see its
 * subject must not report success. The live tier stood at 53 when ADR-0468 landed; the floor is set
 * well beneath that so ordinary curation never trips it, and only a reader that has genuinely lost
 * the kind — a filter typo, a rename, a store pointed at nothing — falls through.
 */
export const VACUOUS_DEFINITION_READ_FLOOR = 10;

/** PURE: the authored pointers on a stored payload, defensively (a surprise row reads as empty). */
function pointersOf(doc: unknown): readonly string[] {
  if (typeof doc !== "object" || doc === null) return [];
  const raw = (doc as Record<string, unknown>)["dependsOn"];
  if (!Array.isArray(raw)) return [];
  return raw.filter((p): p is string => typeof p === "string" && p !== "");
}

/**
 * Judge the tier. `rows` is the WHOLE corpus, not just the definitions: the dangling-target check
 * needs every live id, and taking the corpus is what stops a caller narrowing the read to the tier
 * and quietly turning that check into a permanent pass.
 */
export function evaluateDefinitionAdjudication(
  rows: readonly AdjudicationRow[],
  exemptions: ReadonlySet<string> = ADJUDICATED_WITHOUT_EDGES,
): AdjudicationVerdict {
  const liveIds = new Set(rows.map((r) => r.id));
  const definitions = rows.filter((r) => r.kind === "definition");

  const exempt: string[] = [];
  const unadjudicated: string[] = [];
  const staleExemptions: string[] = [];
  const danglingTargets: string[] = [];
  let withEdges = 0;
  let edges = 0;

  for (const row of definitions) {
    const pointers = pointersOf(row.doc);
    const isExempt = exemptions.has(row.id);
    if (pointers.length > 0) {
      withEdges += 1;
      edges += pointers.length;
      if (isExempt) staleExemptions.push(row.id);
      for (const p of pointers) {
        if (!p.startsWith("asset:")) continue; // a `doc:` target is a relpath, not a corpus id
        if (!liveIds.has(p.slice("asset:".length))) danglingTargets.push(`${row.id} -> ${p}`);
      }
    } else if (isExempt) {
      exempt.push(row.id);
    } else {
      unadjudicated.push(row.id);
    }
  }

  const definitionIds = new Set(definitions.map((r) => r.id));
  const phantomExemptions = [...exemptions].filter((id) => !definitionIds.has(id)).sort();

  return {
    scanned: definitions.length,
    withEdges,
    edges,
    exempt: exempt.sort(),
    unadjudicated: unadjudicated.sort(),
    staleExemptions: staleExemptions.sort(),
    phantomExemptions,
    danglingTargets: danglingTargets.sort(),
    ok:
      unadjudicated.length === 0 &&
      staleExemptions.length === 0 &&
      phantomExemptions.length === 0 &&
      danglingTargets.length === 0,
  };
}

/** True when the read saw too little of the tier to have verified anything. */
export function isVacuousDefinitionRead(verdict: AdjudicationVerdict): boolean {
  return verdict.scanned < VACUOUS_DEFINITION_READ_FLOOR;
}
