---
status: accepted
decided: 2026-06-26
amends: [37, 97]
---
# ADR-0107: An open question attached to a proving process gates its green

## Status

accepted — RATIFIED by the owner on 2026-06-26, together with the [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md)
direction it extracts. Extracted on 2026-06-25 from ADR-0106 decision 4, which flagged that *"open
questions raised during the process gate it"* is a GENERAL mechanism (not specific to the adopt
witness-classification it served there) and **"may deserve its own ADR."** This is that ADR. It records
the general mechanism as a first-class, reusable proving-process escalation valve and **is BUILT** (see
Consequences). Originally left `proposed` because it hardened a still-unratified direction; the owner
ratified ADR-0106 (and this extraction) on 2026-06-26 once the flow was built and green, flipping it
`proposed → accepted` per [ADR-0084](0084-agents-may-flip-an-adr-green.md).

It **amends [ADR-0037](0037-decision-binding-and-hygiene-gates.md)** (§5's OQ-hygiene, which gates a
LIVE BUILD *command* on a deciding ADR's unprocessed operator answer, is generalised into a read-time
GREEN gate over OQs attached to the proving process itself) and **amends
[ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)** (§3's *"escalate the
key decisions through the open-question / ADR-fork flow"* becomes a hard gate, not a surfaced note —
exactly the strengthening ADR-0106 §Decision-4 named). It **overturns no honesty wall**: `green = a
signed verdict` ([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) stands — an open fork
WITHHOLDS a green, it never forges or revokes a verdict; the human owns the fork
([ADR-0030](0030-all-in-on-claude-agent-sdk.md)).

## Context

The brownfield go-green model is a proving process the owner ENTERS (ADR-0097), with adopt and drive as
peer best-efforts ([ADR-0105](0105-drive-and-adopt-are-peer-best-efforts-every-green-is-provisi.md)).
Inside that process an agent routinely meets a fork it cannot settle from the corpus — ADR-0106's
motivating case is the adopt pass facing an **ambiguous witness call** (is this UAT leg machine- or
human-witnessed?), but the shape recurs everywhere: a build-tests refactor that could go two ways, an
adopt that finds the suite proves something subtly different from the capability it claims to cover, a
dependency whose contract the story's UAT can't pin down. The corpus already gives the agent the right
move — **raise an open question via the Library** (ADR-0032's signal→Library flow; the OQ→ADR
lifecycle, [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6) — and hands the fork to the
human who owns the outer loop (ADR-0030).

What was missing is the TEETH. ADR-0097 §3 said *"escalate through the OQ/ADR-fork flow"* but left it a
surfaced note — nothing stopped the process from greening past the unresolved fork. ADR-0037 §5 has the
only existing OQ gate, but it is narrow in two ways: it keys OQs to the story's **deciding ADRs** (not
to the proving process the agent is actually running), and it gates the **build command** (a refusal to
*run*) on **operator-answer hygiene**, not the **green** on the fork being open. So an agent that did the
right thing — raised a genuine blocking fork mid-prove — could watch the story go green anyway, the
fork silently lost. That makes "raise rather than guess" (ADR-0106 decision 2) a hollow instruction: a
raise that doesn't block is indistinguishable from a guess.

## Decision

**1. An open question ATTACHED to a story's proving process gates that story's green.** When an agent
driving a story's adopt or build hits a genuine fork it cannot settle from the corpus, it raises an
open question via the Library carrying a reference to the story node being proven. While that OQ is
**open** (un-retired), the story's crown is **withheld from green** — it cannot roll up `healthy` past
the gated obligation until the OQ is **resolved**. This is the escape valve that lets a pass RAISE the
fork instead of guessing: the process waits, the human owns the fork (ADR-0030), and a green crown
keeps meaning *"every fork along the way was closed."*

**2. "Attached to the proving process" = a `node:<storyId>` reference on the OQ.** The OQ doc's
existing `references` list (the single citation source, `knowledge.ts`) gains one more token shape
alongside `doc:<relpath>` (an ADR) and `asset:<id>` (a Library unit): **`node:<id>`**, a pointer at the
story / capability node. An OQ raised during story *S*'s proving process carries `node:S`; the gate
finds every open OQ whose references include that token. This is the direct generalisation of ADR-0037
§5's `doc:decisions/NNNN` deciding-ADR match — same `references` mechanism, pointed at the NODE being
proven rather than at an ADR. It is a reversible convention, recorded here, not an owner fork; the
principle (OQs gate the process) is ADR-0106 decision 4's, owner-recorded.

**3. "Resolved" = the OQ is retired (the existing ADR-0018 §6 lifecycle).** An OQ is resolved exactly
as the corpus already defines: the owner answers, a session records the decision (an ADR where the fork
warrants one), and the OQ is **retired** — at which point it drops out of the live `open-question`
projection and no longer attaches to the process. No new "resolved" state and no new write path: raise =
a Library write that lands `node:S` in the references; resolve = the retire the corpus already has. The
green flows again the instant the fork is closed.

**4. The gate WITHHOLDS a green; it never paints red.** The mechanism is a pure, read-time post-filter
over the already-derived crown status (the farmer's `rollupStoryGreen` / the studio crown): a would-be
`healthy` crown over ≥1 open gating OQ drops to **abstain** (`null` — the world under-claims to
`mapped`/`proposed`, reading *"blocked — not yet green"*), and a `null`/`unhealthy` base is returned
unchanged. An open fork is a **withheld** green, not a **regression** — `unhealthy` stays reserved for a
signed `fail` / drift (ADR-0083), so the gate can never manufacture a red. It composes with, and never
overrides, the red→green and capability-coverage rules.

**5. The gate lives in the read-time roll-up, shared by every surface.** The decision is one pure
function (`gateStoryGreenOnOpenQuestions(base, openGatingOqCount)`) so the studio crown, the
`storytree tree` glyph, and the CLI build report can never drift on whether a fork blocks. WHICH OQs
attach (the `node:<id>` predicate, `openQuestionsGatingNode`) is the library's; the COUNT-to-status
fold is the orchestrator's; the surface loads the live open-questions and composes the two. This keeps
the proof compute ignorant of OQ doc shapes and the library ignorant of proof.

## Consequences

**Good.**
- "Raise rather than guess" gains teeth: an agent that escalates a genuine fork mid-prove blocks the
  green until the human resolves it, so escalation is no longer indistinguishable from silently
  proceeding. This is what makes ADR-0106 decision 2's asymmetric witness rule honest.
- Reuses the corpus end-to-end: the OQ→ADR raise/retire lifecycle (ADR-0018 §6 / ADR-0032), the
  `references` citation mechanism (one new token), and the read-time crown roll-up. The new surface is
  one attachment predicate + one status fold + one studio pass — no new proof primitive, no new state.
- A green crown's meaning strengthens: it now asserts not only that every capability and UAT obligation
  is signed, but that no open fork was left dangling along the way.
- The gate is safe by construction — it only ever WITHHOLDS a green, never forges one (no verdict is
  written) and never fabricates a red, so it cannot corrupt the proof trail it sits beside.

**Built.**
- `packages/library/src/oq-gating.ts` — the `node:<id>` convention (`nodeRef`) + the pure attachment
  predicate `openQuestionsGatingNode`, with `oq-gating.test.ts`.
- `packages/orchestrator/src/proof/uat-proof.ts` — the pure read-time gate
  `gateStoryGreenOnOpenQuestions`, exported from the package index, with tests in `uat-proof.test.ts`
  (a would-be-green crown + an open gating OQ → blocked; resolve → unblocked; never `unhealthy`).
- `apps/studio/server/apiRouter.ts` — `applyOpenQuestionGate`, a sibling read-time pass to
  `applyUatCrowns` / `applyCapCoverage` that withholds a `pass` crown on the live tree when a story has
  an open gating OQ; wired into the `/api/tree` handler (loads the live open-questions advisory-only,
  null on failure never throws), with tests in `uatCrowns.test.ts`.

**Bad / costs / follow-on (surfaced, not buried).**
- **The terminal `story build` green line is not yet gated.** The studio crown (the owner-facing world,
  where ADR-0106's binary surface lives) is the authoritative gate; the CLI `story green:` report line
  echoes the synthetic build's own events and does not yet load the OQ layer. In practice a `--real`
  story withholds its UAT node (human witness) so the line reads "unproven" anyway, but echoing the
  gate there is a cheap honesty follow-up.
- **No raise-side ergonomics yet.** An agent attaches an OQ by writing `node:<id>` into its references
  by hand (`artifact new --file --pg`); a `storytree oq raise --node <id>` affordance that stamps the
  token is unbuilt. The studio "Sources" view groups `doc:`/`asset:` refs and will show a `node:` ref
  ungrouped until that view learns the token (cosmetic, out of scope).
- **Mis-attachment is the standing risk** — an OQ that *should* gate but carries no `node:<id>` ref
  won't, and one wrongly tagged blocks a story it shouldn't. Mitigated by the retire-to-resolve path
  (a wrong tag is cleared by the same lifecycle) and the read-time, never-red posture (a mistake only
  ever delays a green, never corrupts a verdict). Residual risk acknowledged, not eliminated.

## References

- [ADR-0106](0106-the-adopt-pass-resolves-each-uat-leg-s-witness-machine-only.md) decision 4 — the
  parent: *"open questions raised during the process gate it"*, flagged there as a general mechanism
  deserving its own ADR. This ADR is that extraction; ADR-0106 keeps the witness-classification framing,
  this records the general valve it relies on.
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) §5 — the live-build OQ-hygiene gate this
  generalises (**amended**: from a build-command refusal on a deciding ADR's operator-answer hygiene to
  a read-time green-gate over OQs attached to the proving process).
- [ADR-0097](0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md) §3 — the escalation
  flow this hardens (**amended**: from a surfaced note into a hard gate).
- [ADR-0032](0032-cite-graduation-mechanism.md) /
  [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 — the signal→Library OQ raise and the
  OQ→ADR retire-to-resolve lifecycle this gate sits on.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) /
  [ADR-0083](0083-author-defined-story-green-declared-obligations-machine-per.md) — the green = a
  signed verdict wall and the `unhealthy` = a signed regression meaning this gate preserves (it only
  WITHHOLDS a green).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the human owns the outer loop (the gating OQ is how
  the inner loop hands a fork back).
- Code: `packages/library/src/oq-gating.ts`, `packages/orchestrator/src/proof/uat-proof.ts`
  (`gateStoryGreenOnOpenQuestions`), `apps/studio/server/apiRouter.ts` (`applyOpenQuestionGate`).
- Design conversation, 2026-06-25.
