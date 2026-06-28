---
status: accepted
decided: 2026-06-16
amends: [37]
---
# ADR-0067: The inner loop runs a scoped librarian-curator after a green build

## Status

accepted (2026-06-16) — owner direction in conversation ("wire a curator into the inner loop";
"detection should involve an agent, not a mechanical scan"; "may auto-retire clearly-overtaken").
Builds on [ADR-0032](0032-cite-graduation-mechanism.md) (graduation is intelligence, not arithmetic;
the future synthesis agent), [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the live SDK leaf this
mirrors), [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) /
[ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) (the inner loop as
the home for all work), [ADR-0023](0023-library-cli-choose-your-own-adventure.md) /
[ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) (the Library edit
surface and the agent-kind exception).

**Amends** [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — its §5 open-question hygiene gate
**refuses/warns** a live story build when a deciding ADR's OQ has an unprocessed operator answer, but
it never *cleans up*: it cannot retire, reframe, or resolve anything; it just blocks and tells a
human to do it by hand. This ADR adds the missing **cleanup** half — a curator that runs *after* a
green build and actually retires / reframes / raises. The §5 gate is unchanged and still runs first
(it is a real GATE; curation is advisory and runs only once the build is already green).

> **Amended in degree by [ADR-0131](0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md)**
> — the post-green curator's USD budget default (`sdk-curator.ts`'s `?? 0.5`, the cost knob this ADR's
> Consequences flag as "one place to tune") is removed: under subscription billing the metered `$` is a
> phantom, so the curator runs bounded by its single-shot turn cap (6), with `--budget` the opt-in. Every
> other property here — best-effort, never-fails-the-build, `tools: []` read-only, the kind-fence — is
> untouched.

## Context

Open-questions accumulate and go stale. An OQ is opened to track an undecided fork; the
[ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 lifecycle says *record the decision in
an ADR, then retire the OQ* — but that only happens when a session remembers. ADR-0037 §Context
already documents the failure: live OQs whose decisions were implemented and even comment-resolved but
never retired. The motivating case today is `oq-prune-reconstructible-guidance`: its blocking premise
(the "library-binding fork") was settled by ADR-0051/0052/0053, so it is overtaken — yet nothing will
ever notice or retire it. The live store currently carries seven OQs in exactly this drift-prone state.

The only existing automation is the ADR-0037 §5 hygiene gate (`packages/cli/src/oq-gate.ts`): live
story builds only, scoped to the story's *deciding* ADRs, **refuse/warn — never retire/reframe**. The
curator agents that *should* do the cleanup — `librarian-curator` (dedupe / cross-refs / prune) and
`graduation-synthesist` (ADR-0032's named-but-unbuilt synthesis agent) — exist only as Library agent
artifacts + generated `.claude/agents/*.md`. **No runtime code ever spawns them.**

Two forces shape the design:

1. **Deciding "is this OQ overtaken?" is judgment, not arithmetic.** This was the owner's correction.
   A deterministic scan (e.g. "an OQ references an ADR that a later ADR amends/supersedes") is exactly
   the cite-threshold *arithmetic* ADR-0032 rejected. It is both noisy and blind: a trivial amendment
   ≠ resolution (false positive), and the real resolution of the motivating OQ came from ADRs that
   were never authored to point back at it (false negative). An ADR-status signal fails too —
   storytree deliberately under-flips status, so the motivating OQ's referenced ADRs (0023/0024) and
   their resolvers (0051/0052/0053) are *all* still `proposed`. Judging overtaken-ness means *reading*
   the OQ's premise against current corpus state. That is the curator agent's intelligence.
2. **The owner owns the outer loop** ([asset:human-owns-the-outer-loop]). A machine mutating the
   knowledge tier without ratification is the line we do not cross — *except* where the owner
   explicitly widens it. The owner authorised one bounded exception: auto-retiring a *clearly*
   overtaken OQ, with a recorded rationale. Everything ambiguous stays a proposal/escalation.

## Decision

A **curation pass** runs at the END of a green **story** build (the inner loop), spawned **once** —
not per node. It is the inverse of ADR-0032's inbound graduation loop: instead of growing OQs from
signal, it *prunes/reshapes* the OQs a settled decision has overtaken. Five parts:

1. **Trigger — deterministic, spine-owned.** After the story build observes green (and only then —
   never on a halt), the spine runs the curation pass. It is **advisory and best-effort**: a curation
   failure is swallowed and never fails or blocks the build (the presence/oq-WARN posture). It runs on
   `--live` / `--real` (and is exercisable on `--dry-run` with a scripted curator). `never-bypass-the-gate`
   stands: curation happens *after* the prove-it-gate has signed, and changes nothing about the verdict.

2. **Detection — the agent's judgment, scoped to the story nodes built.** A `librarian-curator` is
   spawned (rendered from the Library, ADR-0051) and handed the **story node context** — the built
   story's id, its node ids, its deciding ADRs, and the open-questions / proposals already loaded
   from the live store, plus the parsed ADR metas. It works out which artifacts are *relevant* itself
   (start point: the story's deciding ADRs and the OQs/proposals citing them) and judges which are
   overtaken / resolvable / mis-framed. It does **not** roam the whole corpus, and there is **no
   deterministic overtaken-detector** — the scan idea is explicitly rejected (force 1).

3. **Authority — least-privilege, fenced by artifact kind.**

   | Kind | What the curator may do |
   |---|---|
   | **open-question** | **resolve** (auto-retire a clearly-overtaken OQ, with a recorded rationale), **raise** (author a new OQ), **reframe** (edit an existing one) |
   | **proposal** | read + **create / edit** (the ADR-0032 "emit a proposal" path) |
   | **everything else** (definition / principle / pattern / guardrail / techstack / process / **agent**) | **read + comment + escalate only** — a discrepancy becomes a comment + an escalation to the owner, **never a silent edit** |

4. **The line — judgment is the leaf's, the wall is the spine's.** The curator emits *structured
   intents* through a fixed set of tools (retire/raise/reframe open-question, create/edit proposal,
   comment, escalate); it has **no general file-write path** to the Library. The spine ENACTS those
   intents, **kind-fenced**: each write verifies the live target really is an open-question (resp. a
   proposal) before mutating, refusing a mismatch — so the fence holds even if the agent misbehaves
   (the same posture as the leaf's spine-enforced write scope / spine-observed red-green, ADR-0020).
   **Auto-retire** is the single machine-writes-the-Library affordance the owner authorised: it is
   bounded to OQs the curator judges *clearly* overtaken, and the rationale is recorded durably on the
   terminal `deleted` event (`retiredReason` / `supersededBy`, ADR-0017 history). Anything ambiguous
   is reframed, raised as a fresh OQ, written as a proposal, or escalated — never force-retired.

5. **Built in the storytree shape — scripted first, then live.** The deterministic machinery lands
   first, provable offline in `pnpm gate` (the retire-with-rationale store primitive + the kind-fenced
   `enactCuration` + a `ScriptedCuratorRunner`), then the story-build wiring, then the **live
   SDK-spawned** `librarian-curator` runner — mirroring `node build --dry-run` → `--live`.

## What this does NOT decide / honours

- **`graduation-synthesist` stays ADR-0032's inbound agent** (signal-graph → new OQs/proposals),
  named and still largely unbuilt. This ADR builds the *outbound/pruning* curator (`librarian-curator`,
  corpus structure + health). The two are complementary; this does not build the synthesis agent.
- **`live-store-is-the-edit-surface` (ADR-0023) stands.** OQ/proposal writes are live `--pg` writes
  through the existing store boundary. The **agent kind is never written** by the curator, so the
  ADR-0055 seed-canonical exception is untouched.
- **No deterministic staleness scanner.** Distinct from `binding-staleness` (ADR-0016), which hashes
  the *code* a verdict proved; this is about the *decision lifecycle* of open-questions, judged by an
  agent.
- **Scope stays the story neighbourhood.** A whole-corpus curation sweep is out of scope — the trigger
  is one story build, the scope is its nodes.

## Consequences

- Overtaken OQs get cleaned up as a by-product of building the story they relate to, instead of
  waiting for a human to remember a manual pass — and the cleanup is attributable (`librarian-curator`
  actor, recorded rationale on the retire event, comments/escalations in the shared comment store).
- A new, reusable **retire-with-rationale** store primitive (`Store.deleteDoc(id, { actor, reason,
  supersededBy })`) — the project previously retired OQs by bare `deleteDoc` + ad-hoc seed edits with
  the rationale living only in an ADR.
- A live curation pass spends subscription budget once per green story build; it is bounded (one
  agent call, scoped context) and best-effort. If it proves noisy or costly, the trigger is one place
  to tune (e.g. only-when-relevant-OQs-exist) — flagged, not pre-solved.
  > **Update:** the USD budget knob is now removed by
  > [ADR-0131](0131-extend-the-no-usd-ceiling-default-to-the-orchestrator-and-cu.md) — under subscription
  > billing the metered `$` is a phantom, so the curator is bounded by its turn cap (6), not a `$0.50`
  > estimate that could truncate a borderline pass. The "one place to tune" stays the trigger, not a $-wall.
- The auto-retire affordance is a deliberate, owner-authorised crossing of "no machine writes the
  knowledge tier" for one bounded subset; the kind-fence + recorded rationale + history-preserving
  delete keep it auditable and reversible (the deleted event carries the full prior state).

## References

- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) (§5 OQ-hygiene gate, amended here),
  [ADR-0032](0032-cite-graduation-mechanism.md) (graduation is intelligence; the inbound synthesis
  agent), [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6 (the OQ→ADR→retire
  lifecycle), [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (the SDK leaf this runner mirrors),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md) /
  [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) (edit surface +
  agent-kind exception), [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
  / [ADR-0064](0064-widen-the-inner-loop-proof-envelope-db-backed-proofs-spine-d.md) (inner loop as
  the home for all work).
- `asset:human-owns-the-outer-loop`, `asset:never-bypass-the-gate`, `asset:library-edit-ceremony`,
  `asset:live-store-is-the-edit-surface` (the doctrine this honours).
- `packages/core/src/store.ts` (`deleteDoc` retire-with-rationale + `retiredEventDoc`),
  `packages/cli/src/curate.ts` (the action types + kind-fenced `enactCuration` + `ScriptedCuratorRunner`),
  `packages/cli/src/oq-gate.ts` (the §5 gate this complements).
- The live `librarian-curator` / `graduation-synthesist` Library agent artifacts.
- Design conversation, 2026-06-15 / 2026-06-16.
