---
status: accepted
load_bearing: true
decided: 2026-06-06
amends: [4, 5]
---

# ADR-0011: Own the agent loop and context engineering

## Status

accepted (2026-06-06) — **reverses** ADR-0001's *pi* per-node runtime and its
*model-agnostic, pay-as-you-go* non-negotiable (ADR-0001 corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)); **amends**
ADR-0004 and ADR-0005 (the boundary now wraps an owned loop, not pi).

**Correction ([ADR-0030](0030-all-in-on-claude-agent-sdk.md), per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** the owned loop this ADR builds STANDS — small, green, and now the **offline/deterministic (ScriptedModel) executor + the pivot-out fallback runtime** ([ADR-0030] Decision 4 keeps it as the pivot target, not deleted); §3's pivot-seam discipline carries, pointed the other way (the seam now guards *exit from* the rented SDK, not entry to a raw-API loop); §4's boundary discipline — a single model-runtime import site (now including the Agent SDK package, [ADR-0030]), orchestrator-only driver, spine/leaf split, run≠node, no agent-spawns-agent — carries **verbatim**; and §5's thin orchestrator + event store + TS/Node/pnpm stand. Overtaken is §§1–2's PRIMACY: the owned loop is demoted from *the* live leaf runtime to one executor implementation — the live runtime is now the **Claude Agent SDK** on subscription auth ([ADR-0030]) — and §2's "own context engineering / never delegate to a third-party harness" reframes to owning the **map and pull surfaces** (story tree, Library, CLI), not the window/loop. The demoted spots below are corrected in place to point here.

## Date

2026-06-06

## Context

[ADR-0001](0001-foundational-stack.md) chose **pi** as the per-node coding agent
*precisely because* "pi already owns the model loop, per-session durability, a structured
event stream, diffs, and mid-run steering" — which shrank the orchestrator's job to
multi-node scheduling. The bet was: **rent the leaf runtime, own only the spine.**

Two things changed that bet (owner, 2026-06-06):

1. **The leaf runtime is the layer we most need to own.** storytree's real
   differentiator is **context engineering** — how the right slice of the story DAG and
   event-store state is assembled into each agent's window, pulled just-in-time (see
   [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md)) —
   and the **agent loop** that consumes it. Renting that layer (pi) means renting exactly
   what we need to control and see into. The v1 (`Agentic`) repo's experience with the
   **Claude Code SDK** — repeated pushback that it was an opaque wrapper around a binary —
   is the cautionary tale: a wrapped runtime is a runtime you don't fully own.
2. **The model-agnostic constraint is no longer load-bearing.** ADR-0001 made
   "model-agnostic, free to try non-Anthropic models" a non-negotiable and rejected the
   Claude Agent SDK *for being Anthropic-only*. The owner works in Claude today; that
   constraint is not worth paying for now.

## Decision

1. **Own the agent loop.** Build the per-node leaf runtime ourselves — a minimal tool-use
   loop on the model's Messages API (`messages.create` with `tools` → dispatch `tool_use`
   → feed `tool_result` → loop to `end_turn`). This **replaces pi as the leaf**; pi leaves
   the runtime path. *(Built — but demoted by [ADR-0030](0030-all-in-on-claude-agent-sdk.md)
   from *the* live leaf to the offline/deterministic executor + pivot-out fallback; the live
   runtime is the Claude Agent SDK. See the Correction above.)*
2. **Own context engineering.** The assembly of each node's context — which slice of the
   story / capability / contract corpus and event-store state enters the window, pulled
   just-in-time — is first-class **owned code**, never delegated to a third-party harness.
   It is the layer storytree most needs to control, and the substrate ADR-0013 makes
   queryable. *([ADR-0030](0030-all-in-on-claude-agent-sdk.md) WITHDREW "never delegated to a
   third-party harness" and reframed context engineering to owning the map and pull surfaces
   (story tree, Library, CLI), not the window/loop. See the Correction above.)*
3. **Start on the Anthropic SDK; keep a pivot trigger.** Build the loop directly on
   `@anthropic-ai/sdk` (the Messages API), accepting **Anthropic-only** for now. This
   **relaxes** ADR-0001's model-agnostic non-negotiable to a *revisit-if-it-bites*
   posture: if we hit the same wall the v1 repo hit with the Claude Code SDK (opacity,
   lock-in friction), we pivot. Keep the model call behind a **thin internal seam** so a
   future provider swap is a backend change, not a rewrite — but do **not** build a
   multi-provider abstraction now (YAGNI; the any-provider goal is downgraded, not
   re-committed). *(This thin-seam / pivot discipline CARRIES per
   [ADR-0030](0030-all-in-on-claude-agent-sdk.md), pointed the other way — the seam now guards
   *exit from* the rented Claude Agent SDK (the live runtime), not entry to a raw-API loop. See
   the Correction above.)*
4. **The boundary stands; the thing behind it changes.** ADR-0004's single-boundary
   discipline is kept and strengthened: the owned loop lives in **one package**
   (provisionally `packages/agent`, replacing `packages/pi-adapter`), is the **sole** place
   a model runtime is imported, and is driven **only** by `packages/orchestrator`;
   `packages/core` and `apps/studio` still hold no model-invocation path. ADR-0005's
   **spine/leaf split stands** — code sequences (the orchestrator spine), the owned
   loop judges at the leaf. *run ≠ node* and *no agent-spawns-agent* are unchanged.
   *(The original wording said "the orchestrator over DBOS"; DBOS is deferred —
   [ADR-0019](0019-library-tier-name-and-defer-dbos.md) — and the substrate claim is
   corrected out here per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*
5. **What does NOT change.** The thin orchestrator, the event store as the single
   observability source, and TS/Node/pnpm all stand. Only **pi-as-leaf** and the
   **model-agnostic non-negotiable** are reversed. *(Two stack picks named here as "stands"
   were later overtaken and are corrected out of this list per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md):
   DBOS/Postgres durable execution is deferred for the library store —
   [ADR-0019](0019-library-tier-name-and-defer-dbos.md), a plain typed Postgres connection
   instead; and the PixiJS studio shipped as inline SVG — [ADR-0036](0036-story-world-studio-visualisation.md).)*

## Consequences

- **Reverses ADR-0001** — its "per-node coding agent: pi" choice and its "model-agnostic
  via pi" non-negotiable (ADR-0001 corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)).
  Of the rest of ADR-0001's stack this ADR left standing, the orchestrator, event store, and
  TS stand; DBOS was later deferred ([ADR-0019](0019-library-tier-name-and-defer-dbos.md)) and
  PixiJS overtaken ([ADR-0036](0036-story-world-studio-visualisation.md)).
- **Amends ADR-0004 / ADR-0005** — the boundary now wraps `packages/agent` (the owned
  loop), not pi; the leaf is the owned loop, not a pi session. The structural rules (single
  import site, orchestrator-only driver, spine/leaf discriminator, run≠node, sole fan-out)
  carry **verbatim**. *(The LIVE leaf is now the Claude Agent SDK executor per
  [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — `packages/agent` is the offline/fallback
  executor; the structural boundary rules still carry verbatim, ADR-0030 keeping them — the
  single import site now including the Agent SDK package. See the Correction above.)*
- **Reversal ledger** — [ADR-0003](0003-v1-reversal-ledger.md) records this v2-internal
  reversal (pi → owned loop; model-agnostic relaxed) so the v1-0003 disposition
  (Claude-sub → pi) is not left stale.
- **Required sweep (follow-up — not in this ADR).** The glossary and several ADRs are
  pi-worded and must be reworded as one deliberate pass (guideline:
  [`tightening-a-shared-contract-needs-a-full-sweep`](../guidelines/tightening-a-shared-contract-needs-a-full-sweep.md)):
  `glossary.md` (`pi-adapter` → the owned-loop package; `node` / `run` / `pi event stream`
  / `spine` / `leaf` / `orchestrator` / `steering` lose pi-specific phrasing), **ADR-0006**
  (pi events → owned-loop events), and **ADR-0008** (steering an in-flight *pi* run). This
  is tracked here, not done silently.
- **open-questions §3(a)** (git worktree for pi's code edits) reframes to the owned loop's
  tool execution — see [ADR-0012](0012-tool-execution-pluggable-sandbox.md).

## What this does NOT decide

- The owned-loop **package name** (`packages/agent` provisional), its public surface, or
  its internal context-assembly API — land when the package is built.
- **Context-window management** mechanics (compaction / context-editing / memory) — the
  loop will need them; the strategy is deferred.
- **Whether/when to reintroduce multi-provider support** — explicitly deferred to the
  pivot trigger above.
- **Where tool execution physically runs** (the sandbox) — [ADR-0012](0012-tool-execution-pluggable-sandbox.md).

## References

- [ADR-0001](0001-foundational-stack.md) (corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)), [ADR-0004](0004-orchestrator-agent-boundary.md) / [ADR-0005](0005-orchestration-spine-code-vs-judgment.md) (amended here), [ADR-0003](0003-v1-reversal-ledger.md) (ledger).
- [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md); the Claude Code SDK opacity experience (v1 `Agentic` repo).
- Design conversation, 2026-06-06.
