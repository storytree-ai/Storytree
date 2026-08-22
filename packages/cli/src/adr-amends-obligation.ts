import { adrDocId } from "@storytree/library";

/**
 * WHAT WRITING AN `amends` EDGE OWES ITS TARGET, stated at the surface where the edge is written.
 *
 * `decision-read-measurement-arc` increment 06 — ADR-0419 D2's authoring half.
 *
 * ## Why this is a module of its own
 *
 * Two verbs write the edge and they sit on opposite sides of an existing import: `adr new --amends`
 * (`adr.ts`) is the first moment, `adr push` (`adr-round-trip.ts`) is the second and by far the more
 * common one, since most amendments are added to a decision that already exists. `adr.ts` already
 * imports the round-trip verbs, so putting the note in either file would either duplicate it or
 * point an import backwards into a cycle. One pure function both import is the shape that keeps a
 * single wording, which matters more here than usual — the whole failure being addressed is a rule
 * that exists in prose nobody retrieves.
 *
 * ## Why a note and not a refusal
 *
 * ADR-0139 D4 has required an in-place annotation on an amended decision since it was decided, and
 * the floor is not holding: measured against the live store on 2026-08-22, of 446 accepted `amends`
 * edges 174 have a target whose body does not so much as mention the amender, and 58 amended
 * decisions name none of theirs. ADR-0419 D4 adds a mechanical presence check beneath the editorial
 * judgment — `packages/library/src/amends-annotation.ts` — and it is deliberately UNWIRED at this
 * phase, because enabling it today reds the gate on those 174 pre-existing edges and so punishes the
 * honest new case hardest. The obligation is therefore DISCIPLINE here, and the remedy for a rule
 * that is not being retrieved is to put it where the author already is.
 *
 * The note also names the alternative, which is more than half of what makes it act. Until
 * 2026-08-23 the authoring surface offered `--amends` and nothing else for support, so an author
 * whose decision merely RESTED on another either overstated the claim or wrote no edge at all —
 * zero of 412 decision rows carried `dependsOn` while every `process`, `guardrail` and `agent` did.
 * Telling someone their edge is wrong without telling them where the right one lives reproduces the
 * silence.
 */
export function amendsObligationNote(amends: readonly number[]): string[] {
  if (amends.length === 0) return [];
  const pad = (n: number): string => String(n).padStart(4, "0");
  const targets = amends.map((e) => `ADR-${pad(e)}`).join(", ");
  return [
    "",
    `⚠ This writes an \`amends\` edge onto ${targets}. Two things follow (ADR-0419 D2/D4):`,
    "",
    "  1. ANNOTATE EACH TARGET IN PLACE, in THIS landing — say in its body WHICH CLAUSE this",
    "     decision narrows, retires or extends (ADR-0139 D4). The edge itself is already derived and",
    "     printed by `adr list`, so a bare \"amended by NNNN\" is the double entry ADR-0037 §1 forbids;",
    "     what the target owes a reader is the clause that moved.",
    ...amends.map((e) => `       storytree adr pull ${String(e)} --out ${adrDocId(e)}.md`),
    "",
    "  2. IF NOTHING IN THE TARGET MOVES, this is plain support and `amends` overstates it — record",
    "     it as `depends_on` instead (`adr new --depends-on`, or a `depends_on:` line in the",
    "     document). `amends` is reserved for the case where reading the target ALONE is now",
    "     insufficient; that extra claim is what makes it promote its target into the",
    "     `adr list --load-bearing` set, which plain support must never do.",
  ];
}
