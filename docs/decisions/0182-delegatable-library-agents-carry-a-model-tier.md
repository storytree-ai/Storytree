---
status: accepted
decided: 2026-07-11
amends: [178]
load_bearing: true
---
# ADR-0182: Delegatable Library agents carry a model tier

## Status

accepted (2026-07-11) — decided/directed by the owner in conversation on 2026-07-11 ("leverage
Sonnet 5 as our workhorse and opus for planning"; "pin subagents by tier"). Design-time alignment IS
the ratification (ADR-0110); no second end-of-flow ask.

**Amends ADR-0178 §3** — that decision fixed every generated Cursor subagent at `model: inherit` and
explicitly deferred per-agent execution policy "until the Library schema can express it structurally."
This ADR is that structural expression for the model dimension only: the Library `agent` artifact now
carries an optional `model` tier, and BOTH model-emitting harness surfaces (`.claude/agents`,
`.cursor/agents`) render it. Codex, Gemini and OpenCode were admitted later and deliberately inherit
their spawning session's model: they emit no `model` key because no accepted mapping turns the
Claude-only `sonnet` / `opus` tiers into those runtimes' model identifiers. `readonly` /
`is_background` remain deferred exactly as ADR-0178 left them.

## Context

Storytree's build work splits along a clean line the Library already names in prose but never encoded:

- **Workhorse (mechanical) subagents** — `corpus-investigator`, `glue-worker`, `frontend-builder`,
  `friction-analyst` — do scoped, high-volume, well-specified work (a single read-only verification,
  one fenced glue edit, geometry/behaviour proofs, one run's friction report). Sonnet 5 is the right
  tool: near-Opus quality on this class of work at materially lower usage weight.
- **Judgment subagents** — `story-author`, `librarian-curator`, `graduation-synthesist`,
  `guidance-curator` — make whole-system, corpus-shaping calls (bounding a provable journey, keeping
  the decision log honest, adjudicating accumulated signal, authoring the behavioural floor). These
  warrant Opus.

*(Corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).
The SPLIT below is unchanged and is still the live rule — what changed is one roster assignment and the
roster's size. **`librarian-curator` is no longer a judgment subagent and no longer warrants Opus:**
[ADR-0324](0324-the-librarian-pass-is-trigger-gated-and-split-not-per-landin.md) D3 re-classified it to
the WORKHORSE side and flipped it to `sonnet`, on the ground that sweep-compare-correct against an
explicit standard — is this prose still true, does this edge exist, is this status a projection of the
`## Status` prose — is mechanical work, not a judgment call; the seats that DECIDE what is true
(`graduation-synthesist`, `guidance-curator`) stay on Opus, which is exactly this ADR's split applied
correctly. A tenth delegatable agent, `explorer` (`sonnet`), joined the workhorse side via
[ADR-0325](0325-exploration-is-delegated-to-a-disposable-context-leaf-and-ev.md) D1/D2, and `planner`
(`opus`, ADR-0183 D5) postdates this ADR — so neither list above is a current roster. Per ADR-0052 §2
the generated agent files, never a list in an ADR, are the roster of record; ask
`storytree library artifact list agent`.)*

Until now every delegatable subagent inherited the spawning session's model (ADR-0178 §3 for Cursor;
`.claude/agents` files carried no `model:` line at all, which the Claude harness also treats as
inherit). So when the orchestrator session runs on Opus — the correct default for the planning loop —
every mechanical workhorse ran on Opus too.

**The economic driver is subscription usage weight, not per-token dollars.** The live build loops
(the inner-loop leaf `ClaudeAgentAuthor`, the orchestrator session, and every spawned subagent) are
subscription-funded through the Claude Agent SDK on the OAuth token (ADR-0030). The SDK's metered
`total_cost_usd` is "a phantom that doesn't reflect our flat cost" (`sdk-author.ts`). So pinning a
subagent to Sonnet saves no per-token dollars on those paths — it saves *subscription-quota headroom*
(Opus consumes the usage limits far faster than Sonnet for equal work) and latency. The one path that
would see literal dollar savings is the API-metered owned-loop fallback (`AnthropicModel`), which is
rarely live. The inner-loop leaf already defaults to Sonnet 5 (`sdk-author.ts`) and the orchestrator
engine to Opus (`headless-orchestrator.ts`); this ADR closes the remaining gap — the delegatable
subagent tier.

## Decision

1. **The `agent` artifact carries an optional `model` tier** — the enum `inherit | sonnet | opus`
   (`AgentModel`, `knowledge.ts`). A TIER, not a raw model id, so it survives model-version bumps and
   maps onto both model-emitting harness `model:` frontmatter contracts. It is structured schema metadata on the
   `Agent` `.extend()` — like `stepRefs`, it never renders into the markdown body. OPTIONAL, so every
   existing agent doc still validates with no `CURRENT_SCHEMA_VERSION` bump and no migration.

2. **Absent tier resolves to inheritance.** Claude and Cursor render `model: inherit`; harnesses whose
   native project-agent surface emits no model key inherit by omission. The change is additive: an
   untiered agent behaves as before (the spawning session's model).

3. **Both model-emitting harness renderers emit the resolved tier.** `renderAgentFile` (Claude) now emits a `model:`
   line where it previously emitted none; `renderCursorAgentFile` (Cursor) emits the artifact's tier
   in place of its former hard-coded `inherit`. One resolved string serves both surfaces
   (`agentModelFrontmatter`, `render-agent.ts`). Codex records the Library tier only as inert foreign
   metadata in a comment and emits no model pin; Gemini and OpenCode likewise emit no `model` key.

4. **The initial tier assignment** pinned the four mechanical agents above to `sonnet` and the four
   judgment agents to `opus`. That assignment was originally authored in the seed; ADR-0307 later
   superseded ADR-0055 and made the agent tier live-canonical. Current assignments are edited only in
   the live Library with `artifact edit --pg`, then regenerated into committed harness projections.

5. **Dedicated-surface roles are untouched.** `session-orchestrator`, `red-builder`, and
   `green-builder` are excluded from `delegatableAgentIds` and render no harness frontmatter, so they
   carry no tier here — the orchestrator's model is the session's own (`/model`); the two builder
   phases run on the SDK leaf's default (Sonnet 5, `sdk-author.ts`).

## Consequences

**Good.**

- The Sonnet-workhorse / Opus-judgment split the system already believed in is now enforced at the
  point of delegation, not left to whatever model the parent session happens to run.
- Mechanical subagents no longer inherit an Opus session's high usage weight — subscription-quota
  headroom and latency both improve where the work doesn't need Opus.
- One live Library edit still drives every harness projection; the change rides the existing generated-view
  gate (`check:agents`) with no new machinery.

**Bad / watch.**

- The tier is a coarse three-value knob; a role that later needs `haiku` or a specific pinned id needs
  the enum widened (a deliberate, small schema change).
- Tier assignments are a judgment call and may need revisiting as roles evolve — they are seed edits,
  not code.
- This encodes the model dimension of per-agent execution policy; `readonly` / `is_background` remain
  deferred (ADR-0178 §3) and must not be inferred from prose.

## References

- ADR-0178 — render delegatable Library agents to native Cursor subagent files (amended here).
- ADR-0052 — generated Claude subagent files.
- ADR-0055 — superseded historical source for the original seed-canonical assignment.
- ADR-0307 — the current live-canonical agent-tier authorship direction.
- ADR-0030 — the live runtime is subscription-funded (the cost framing above).
- ADR-0110 — design-time alignment is ratification.
- `packages/library/src/knowledge.ts` — `AgentModel`, the `Agent.model` field.
- `packages/library/src/store/render-agent.ts` — `agentModelFrontmatter`, both harness renderers.
