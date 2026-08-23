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
 * the floor was not holding: measured against the live store on 2026-08-22, of 446 accepted `amends`
 * edges 174 had a target whose body did not so much as mention the amender, and 58 amended decisions
 * named none of theirs. That backlog was drained to zero on 2026-08-23 (453/453 edges annotated).
 *
 * ADR-0419 D4 added a mechanical presence check beneath the editorial judgment; **ADR-0427 retired
 * it** and deleted the code. The check asked only whether a target's body mentioned its amender's
 * number ANYWHERE, while the obligation asks which CLAUSE moved — and since `adr list` already
 * derives and prints `amended by NNNN`, the bare mention it accepted was precisely the string that
 * adds nothing (ADR-0037 §1). It was never wired to a gate.
 *
 * So there is no mechanical floor, by decision rather than by omission, and this note is now the
 * only thing that puts the rule in front of an author at the moment they write the edge. The
 * obligation is DISCIPLINE, held by the librarian's judgment on review, and the remedy for a rule
 * that is not being retrieved is to put it where the author already is. Do not replace this note
 * with a refusal, and do not rebuild the presence check — see ADR-0427.
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
