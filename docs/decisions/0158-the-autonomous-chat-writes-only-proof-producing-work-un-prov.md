---
status: proposed
---
# ADR-0158: The autonomous chat writes only proof-producing work; un-provable glue is escalated or earns a contract

## Status

proposed (2026-07-05) — written by the session-orchestrator at the owner's direction, as the write-up
of the desktop-chat **over-routing** investigation (the 2026-07-04 full-autonomy incident: a scoped
"add 3 routes to `backend-entry.ts`" intent was routed as a whole-story `story build --real`). It is
**deliberately submitted for adversarial review before any acceptance** — the owner asked a fresh
session to challenge it and check the investigation did not spiral into over-abstraction. See
**Review posture** below. If accepted, this **amends ADR-0137** (adds an affirmative statement of the
chat's write-authority boundary that ADR-0137 d.1/d.2 imply but never state for the un-provable-glue
case) and stands on ADR-0152 / ADR-0108 / ADR-0091 / ADR-0099 / ADR-0070 / ADR-0020 / ADR-0055.
Supporting analysis: `docs/research/desktop-chat-orchestrator-scoping-analysis.md`.

## Context

**The incident.** In the desktop full-autonomy experiment the desktop **chat** session-orchestrator was
handed a scoped, pure-wiring intent — *"add 3 missing routes to `apps/desktop/electron/backend-entry.ts`"*
— and routed it as a whole-story `story build desktop-build-mount --real`: a full, billed red→green
build of the nearest existing story, which then auto-opens a merging PR. It did not scope to the minimum
change.

**What the investigation found (two separate questions, kept apart):**

1. **It is a tooling gap, not a guidance gap.** The rendered `session-orchestrator` prompt is byte-identical
   on the terminal and the desktop chat (ADR-0051, one render). The guidance already says the right thing:
   pure wiring is glue to *supplement with your own subagents*, **not** to route into a `--real` build
   (`orchestrate-route-supplement`). But the desktop chat's actuator surface is `tools: []` plus a small
   MCP set — orient (read-only), `propose_unit`, `spawn_story_author` (writes fenced to `stories/**`),
   `spawn_builder` (routes a unit id into a whole-unit `--real` build, discarding its task prompt),
   `run_gate`, `open_landing_pr`. It has **no general write-scoped glue subagent** (the terminal's
   Agent/Task tool) and **no scoped edit tool.** So when the correct move is "delegate this glue edit to
   a subagent," the chat has nothing to delegate to, and `spawn_builder` is the only button that can touch
   that file — which over-routes to the whole story. The guidance named an affordance the surface lacks.

2. **The corpus already leans to the answer this ADR states.** The chat's entire write/spawn/land surface
   is, by explicit prior decision, a **closed set of proof-producing or human-gated acts**: spawn is
   limited to `story-author` (authored hierarchy) and `builder` (a spine-signed red→green drive), landing
   is scoped fail-closed tools that CI independently re-proves (ADR-0152 / ADR-0022), and the one direct
   corpus write is ADR-authoring (ADR-0137 d.2). ADR-0137 d.2 states verbatim: *"everything else it
   produces goes through a spawned subagent."* ADR-0137 d.4 already prescribes the un-provable route:
   *"a bug is a missing contract"* — author the contract, drive it red→green. What is **missing** is a
   single affirmative statement, for the **autonomous chat**, of what happens to work that is genuinely
   un-provable *and* not worth turning into a contract — i.e. glue.

**The definitional problem the incident surfaced.** The investigation initially called `backend-entry.ts`
*"pure composition — no logic to assert."* That was imprecise, and the imprecision matters. `backend-entry.ts`
**can** be machine-tested (stand up the composition, assert `/api/health` serves) — it is operator-attested
because a real test would spawn subscription-billed builds each run (ADR-0010 §5), a **cost** choice, not
an assertability fact. "Nothing to assert" conflated three distinct reasons a piece is not a capability.
Separating them is the definitional core of this ADR.

## Decision (proposed)

**D1 — Define glue by *why it isn't a capability*, on three axes (R1/R2/R3).**

| Axis | Why it is not a provable capability | Machine-testable? | Correct handling |
|---|---|---|---|
| **R1 — tautological** | The only assertion possible restates the wiring ("the constructor got the pool", "field A copies to field B"); a test is change-detector noise. | Not usefully | Leave it — nothing worth asserting |
| **R2 — assertable but billed/live** | Real observable behaviour exists (the composition boots and serves), but proving it needs real keychain / pg / a subscription-billed build each run. | **Yes, if you pay / stand up real I/O** | Extract the cheap parts; **operator-attest** the residual (ADR-0070), *or* pay for a smoke if a machine proof is wanted |
| **R3 — un-extracted logic** | Real logic hides inside the wiring; it is cheaply testable, just not yet pulled into its own function. | **Yes, cheaply** | Not glue — extract it; it becomes a tested unit |

**Glue is the residue** left after every R3 nugget is extracted and R2 is deliberately attested rather
than paid for. What remains is R1 (tautology) + R2 (attested-by-choice). Worked examples:
`apps/desktop/electron/backend-entry.ts` is **R2** (assertable, billed → attested);
`packages/cli/src/main.ts` is mostly **R1** wiring with one buried **R3** nugget (the `--`-argv
normalisation at `main.ts:78–79`, which guards a real bug and should be extracted + tested).

**D2 — Name the axis split: "glue" ≠ "operator-attested".** "Glue code" is a legitimate SE term
(plumbing / wiring / bindings) and should keep being used — but only for **structural, connective**
code. Work a *machine cannot judge* — visual/appearance, live-SDK, spend — is **operator-attested**
(ADR-0070), a distinct axis, not glue. The current `orchestrate-route-supplement` wording lists
"visual/UI" inside the glue bucket; that is the conflation. (Corpus wording fix is owner/librarian work,
not enforced by this ADR — see Consequences.)

**D3 — Affirm the autonomous chat's write authority is proof-only (the "Option B" the owner named).**
The desktop chat's sanctioned write/spawn/land surface is a closed set: orient (read), `propose_unit`,
`spawn_story_author`, `spawn_builder`, `run_gate` / `open_landing_pr`, and (when built) ADR-authoring.
Un-provable **glue** is handled by exactly one of:
  - **(a) refactor so a pure core earns a contract** — extract the R3 logic and route it to the inner
    loop (ADR-0137 d.4's "a bug is a missing contract");
  - **(b) operator-attest the R2 residual** — a human witnesses the composition serving (ADR-0070); or
    pay for a live smoke by explicit choice;
  - **(c) escalate it** to the human/next session as a scoped edit.
It is **never** autonomously written-and-landed as un-proven surface. This is the affirmative
generalisation of ADR-0070 (operator-attest the un-provable) and ADR-0137 d.4 (earn a contract) to the
glue case, and the ratification of the boundary ADR-0137 d.1/d.2 and ADR-0152 d.2 already draw
("spawn/route/land, never raw write").

**D4 — Diagnose the incident as a tooling gap and name the fix direction (design left open).** The root
cause is the missing actuator, not the prose: the chat cannot make or delegate a minimal scoped edit, so
it reaches for the whole-story build. The proposed fix is a **scoped glue actuator** on the chat surface
(candidates, to be designed — a fenced write-scoped glue-subagent that honours a task prompt; or a
path-fenced `edit_file` the existing `run_gate` / `open_landing_pr` can land). The exact shape is a
structural fork routed to `story-author` + its own build ADR, not decided here. Two *honesty* corrections
to the seed prose are recommended but are **owner-applied and not enforcement of this decision**: make the
agent's "## Tools" section surface-honest (it names Edit/Write/`gh`/the Agent tool the chat lacks), and
split D2's two axes in `orchestrate-route-supplement`.

## Consequences

**Good.**
- A precise, shared definition of glue (R1/R2/R3) replaces "nothing to assert", and a clean
  glue-vs-operator-attested split removes a standing corpus conflation.
- The autonomous chat's write boundary is stated affirmatively in one place, closing the gap between what
  ADR-0137/0152 *imply* and what is *written*.
- The incident's real fix (an actuator) is named and separated from the guidance, so no one "fixes" a
  tooling gap by rewording prose that was already correct.

**Bad / open.**
- The scoped glue actuator (D4) is **unbuilt** — until it lands, the desktop chat's honest options for a
  glue intent are (b) attest or (c) escalate; it still cannot itself perform a minimal edit.
- R2's "attest vs. pay for a smoke" is a per-case judgment this ADR does not mechanise.
- Over-classification risk: R1/R2/R3 is a lens, not a gate; it must not become a bureaucratic sorting
  ritual applied to every line.

**Review posture (why this is `proposed`, not `accepted`).** This ADR is the product of a long,
deliberately abstract investigation. The owner has asked a **fresh session to adversarially review and
potentially challenge it** — including whether the R1/R2/R3 taxonomy earns its keep or is over-abstraction,
whether D3 is truly already-implied (calibrate-to-corpus) rather than a new escalation, and whether the
whole framing is sound or a shared-context spiral. It should not flip to `accepted` until that review
returns and the owner ratifies. If the review guts it, superseding or withdrawing it is the expected,
healthy outcome.

## References

- `docs/research/desktop-chat-orchestrator-scoping-analysis.md` — the full traced analysis (prompt path,
  actuator inventory, glue taxonomy, proposals).
- ADR-0137 — chat gains SPAWN authority; d.1 "spawn/route, never raw write", d.2 "everything else goes
  through a spawned subagent", d.4 "a bug is a missing contract". (This ADR, if accepted, amends it.)
- ADR-0152 — landing wall lifted; d.2 "scoped MCP tools, never raw Write/Bash".
- ADR-0108 — the whole-loop authority grant (orient → decompose → route → gate → land).
- ADR-0091 / ADR-0020 — the spine is the sole verdict signer; proof is non-authorable; no verdict handed in.
- ADR-0099 (Option B) — a synthetic/un-real proof must never persist as green.
- ADR-0070 — un-provable-by-machine work (look/feel/live/spend) is operator-attested, not self-judged.
- ADR-0055 / ADR-0051 — the `session-orchestrator` is seed-canonical, rendered from one Library artifact.
- Code: `packages/agent/src/headless-orchestrator.ts`, `packages/agent/src/spawn-tool-surface.ts`,
  `packages/drive/src/spawn-deps.ts`, `packages/drive/src/build-worker.ts` (`routedBuildRunner`),
  `apps/desktop/electron/backend-entry.ts` (the R2 glue file the incident targeted).
