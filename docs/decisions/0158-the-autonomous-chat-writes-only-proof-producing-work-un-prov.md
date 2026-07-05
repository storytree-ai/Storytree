---
status: accepted
decided: 2026-07-05
amends: [137, 152]
load_bearing: true
---
# ADR-0158: Glue is un-asserted code within a story; the autonomous chat writes only proof-producing work, un-provable glue is escalated or earns a contract

## Status

accepted (2026-07-05) — written by the session-orchestrator at the owner's direction as the write-up of
the desktop-chat **over-routing** investigation (the 2026-07-04 full-autonomy incident: a scoped "add 3
routes to `backend-entry.ts`" intent was routed as a whole-story `story build --real`). It was
**submitted for a fresh adversarial review first** — the owner asked a skeptical session to challenge it
and check the investigation had not spiralled into over-abstraction. That review returned (three cited
sub-audits: code-tracing, corpus-consistency, taxonomy) and did its job: it **confirmed** the mechanical
tooling-gap diagnosis, **rejected** the original R1/R2/R3 taxonomy as inert over-abstraction, and
**caught** the over-claim that the write-authority boundary was "already implied." The owner then grounded
the definition — *glue is un-asserted code that still lives **within** a story* — and directed acceptance
of the trimmed, grounded version. This ADR **amends ADR-0137** (states the chat's write-authority boundary
its d.1/d.2 imply but never state for the glue case) and **amends ADR-0152** (narrows the landing authority
0152 granted — see D3), and stands on ADR-0108 / ADR-0091 / ADR-0099 / ADR-0070 / ADR-0020 / ADR-0055.
Supporting analysis: `docs/research/desktop-chat-orchestrator-scoping-analysis.md`.

## Context

**The incident.** In the desktop full-autonomy experiment the desktop **chat** session-orchestrator was
handed a scoped, pure-wiring intent — *"add 3 missing routes to `apps/desktop/electron/backend-entry.ts`"*
— and routed it as a whole-story `story build desktop-build-mount --real`: a full, billed red→green build
of the nearest existing story, which then auto-opens a merging PR. It did not scope to the minimum change.

**The tooling-gap diagnosis (confirmed by review, traced to code).** The rendered `session-orchestrator`
prompt is byte-identical on the terminal and the desktop chat (ADR-0051, one render), and the guidance
already says the right thing: pure wiring is glue to *supplement with your own subagents*, **not** to
route into a `--real` build (`orchestrate-route-supplement`). The defect is in the **actuator surface**,
not the prose. The desktop chat runs with `tools: []` (`headless-orchestrator.ts`) plus a small in-process
MCP set — orient (read-only), `spawn_story_author` (writes fenced to `stories/**`), `spawn_builder`,
`run_gate`, `open_landing_pr`. It has **no general write-scoped glue subagent** (the terminal's Agent/Task
tool) and **no scoped edit tool.** So when the correct move is "delegate this glue edit to a subagent," the
chat has nothing to delegate to, and `spawn_builder` is the only button that can touch that file — which
over-routes to the whole story. Two mechanical findings sharpen this: `spawn_builder` advertises a
`userPrompt` scope knob in its schema (`spawn-tool-surface.ts`) that the production dep **silently
discards** (`spawn-deps.ts` `spawnBuilder({ unitId })` — `userPrompt` never read); and `routedBuildRunner`
classifies a story-kind unit into a whole-story `--real` build with `openPr: true` (`build-worker.ts`).
The guidance named an affordance the surface lacks.

**The definitional problem the incident surfaced.** The investigation first called `backend-entry.ts`
*"pure composition — no logic to assert,"* then reached for a three-axis taxonomy to explain why. Both were
imprecise. The grounded question — *does glue live within a story, or between them?* — resolves it, and is
the definitional core of this ADR (D1).

## Decision

**D1 — Glue is un-asserted code that lives WITHIN a story.** Every line of code serves some journey.
`backend-entry.ts` exists to make the `desktop-build-mount` story actually run in the deployed sidecar — it
belongs to *that story*. What glue lacks is not a home but an **isolatable assertion**: a capability is
*stated* precisely because it has a provable contract (an isolatable red→green), and glue has none, so it
declares **no capability of its own**. It is the connective tissue that binds a story's proven capabilities
into a running whole, and it is proven **transitively** — at the story / UAT altitude when the whole
journey runs green, or by operator attestation where even that can't reach it cheaply — **never by its own
contract.**

  - *"Between stories" is a category error.* Code many stories depend on (shared infrastructure, the CLI
    `--`-argv strip at `main.ts:78–79` that serves every command) belongs to a **foundation / platform
    story** — within *that* story, depended-on by the rest. Code that belongs to no story at all is dead
    code.
  - *The one discipline that matters — before you call something glue, check it isn't hiding an extractable
    pure function.* If real logic is buried in the wiring, it is **not** glue: extract it and it earns a
    contract within the story. (The prior draft split glue on three "R1/R2/R3" axes; the adversarial review
    found only this extraction check changes what an engineer does — the other axes both terminate in "not a
    unit test." The taxonomy is dropped in favour of this single check.) What genuinely remains after
    extraction — tautological wiring, plus composition only exercisable at the story altitude or by paying
    for live I/O — is glue proper.

**D2 — "glue" ≠ "operator-attested."** They are orthogonal reasons a machine cannot sign a unit: glue has
*nothing worth asserting* (structural, connective); operator-attested work has *output only a human can
judge* — look / feel / live / spend (ADR-0070). `orchestrate-route-supplement` currently files "visual/UI"
inside the glue bucket; that is a conflation to correct (a one-line librarian prose fix — see D4 — not
enforced by this ADR).

**D3 — The autonomous chat's write authority is proof-producing or human-gated only.** The desktop chat's
sanctioned write / spawn / land surface is a closed set: orient (read), `spawn_story_author`,
`spawn_builder` (a spine-signed red→green drive), `run_gate` / `open_landing_pr` (scoped fail-closed tools
CI independently re-proves), and — when built — ADR-authoring (ADR-0137 d.2). Un-provable **glue** is
handled by exactly one of:
  - **(a) refactor so a pure core earns a contract** — extract the logic and route it to the inner loop
    (ADR-0137 d.4, "a bug is a missing contract");
  - **(b) operator-attest the residual** — a human witnesses the composition serving (ADR-0070); or pay for
    a live smoke by explicit choice;
  - **(c) escalate it** to the human / next session as a scoped edit.

  It is **never** autonomously written-and-landed as un-proven surface. *This is a genuine boundary, not a
  restatement.* The adversarial corpus audit is explicit that it is **not** merely "already implied":
  ADR-0137 d.4 assumes glue is always contract-able; ADR-0152 granted the landing surface on the strength of
  *"CI re-proves before trunk"* **without** this restriction; ADR-0070 covers only *taste*. D3 is the
  affirmative generalisation that harmonises them — and it **narrows the authority ADR-0152 granted** (hence
  this ADR amends 0152, not only 0137): CI re-proving before trunk is *necessary but not sufficient* licence
  to autonomously land un-proven glue. The owner directed this boundary in conversation (ADR-0110:
  design-time alignment is ratification).

**D4 — The incident is a tooling gap; the fix is a scoped glue actuator (design left open).** The root
cause is the missing actuator, not the prose: the chat cannot make or delegate a minimal scoped edit, so it
reaches for the whole-story build. The fix direction is a **scoped glue actuator** on the chat surface
(candidates, to be designed — a fenced write-scoped glue-subagent that honours a task prompt; or a
path-fenced `edit_file` the existing `run_gate` / `open_landing_pr` can land). The exact shape is a
structural fork for `story-author` + its own build ADR, not decided here. Two *honesty* corrections to the
seed prose are recommended, owner/librarian-applied and **not** enforcement of this decision: fix
`spawn_builder`'s discarded `userPrompt` (thread it or drop it from the schema), and split D2's two axes in
`orchestrate-route-supplement` (move "visual/UI" out of the glue bucket).

## Consequences

**Good.**
- A grounded, structural definition of glue — *un-asserted code within a story, proven transitively* —
  replaces "nothing to assert," and the glue-vs-operator-attested split removes a standing conflation.
- The autonomous chat's write boundary is stated affirmatively in one place, and its true relationship to
  the corpus is honest: it *narrows* ADR-0152, it does not merely echo it.
- The incident's real fix (an actuator) is named and separated from the guidance, so no one "fixes" a
  tooling gap by rewording prose that was already correct.

**Bad / open.**
- The scoped glue actuator (D4) is **unbuilt** — until it lands, the desktop chat's honest options for a
  glue intent are (b) attest or (c) escalate; it still cannot itself perform a minimal edit.
- D3 tightens what ADR-0152 permits; any future "the chat may just land wiring because CI backstops it"
  argument must reckon with this narrowing.
- The extraction check (D1) is a lens, not a gate — it must not become a ritual applied to every line.

## References

- `docs/research/desktop-chat-orchestrator-scoping-analysis.md` — the full traced analysis (prompt path,
  actuator inventory, glue definition, proposals).
- ADR-0137 — chat gains SPAWN authority; d.1 "spawn/route, never raw write", d.2 "everything else goes
  through a spawned subagent", d.4 "a bug is a missing contract". (This ADR amends it.)
- ADR-0152 — landing wall lifted; d.2 "scoped MCP tools, never raw Write/Bash"; its safety model is "CI
  re-proves before trunk". (This ADR amends it — D3 narrows the landing grant.)
- ADR-0108 — the whole-loop authority grant (orient → decompose → route → gate → land).
- ADR-0091 / ADR-0020 — the spine is the sole verdict signer; proof is non-authorable; no verdict handed in.
- ADR-0099 (Option B) — a synthetic/un-real proof must never persist as green.
- ADR-0070 — un-provable-by-machine work (look/feel/live/spend) is operator-attested, not self-judged.
- ADR-0055 / ADR-0051 — the `session-orchestrator` is seed-canonical, rendered from one Library artifact.
- ADR-0155 — retired the chat `propose_unit` / accept-to-Build affordance (the surface list here reflects
  the post-0155 tool set).
- Code: `packages/agent/src/headless-orchestrator.ts` (`tools: []`), `packages/agent/src/spawn-tool-surface.ts`
  (`spawn_builder` schema advertises `userPrompt`), `packages/drive/src/spawn-deps.ts` (`spawnBuilder`
  discards it), `packages/drive/src/build-worker.ts` (`routedBuildRunner` story → whole-story `--real`),
  `apps/desktop/electron/backend-entry.ts` (the glue file the incident targeted).
