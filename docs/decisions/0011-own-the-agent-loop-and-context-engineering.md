---
status: accepted
decided: 2026-06-06
supersedes_in_part: [1]
amends: [4, 5]
---

# ADR-0011: Own the agent loop and context engineering

## Status

accepted (2026-06-06) — **supersedes** ADR-0001's *pi* per-node runtime and **relaxes**
its *model-agnostic, pay-as-you-go* non-negotiable; **amends** ADR-0004 and ADR-0005 (the
boundary now wraps an owned loop, not pi). The rest of ADR-0001's stack stands.

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** — §5's "DBOS/Postgres durable execution stands" is overtaken (DBOS deferred; the store is a plain typed Postgres connection now).

**Superseded-in-part by [ADR-0030](0030-all-in-on-claude-agent-sdk.md)** (accepted, 2026-06-10) — §§1–2 are demoted: the **Claude Agent SDK** becomes the live runtime (subscription auth), the owned loop becomes the offline/test executor + pivot-out fallback, and "own context engineering / never delegate to a third-party harness" reframes to owning the **map and pull surfaces** (story tree, Library, CLI). §3's seam discipline carries, pointed the other way.

**Superseded-in-part by [ADR-0036](0036-story-world-studio-visualisation.md)** (accepted, 2026-06-12) — §5's "the PixiJS studio" mention is overtaken (the same overtaken-mention shape as the DBOS line above): the studio's story world shipped as inline SVG; PixiJS is named-deferred.

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
   the runtime path.
2. **Own context engineering.** The assembly of each node's context — which slice of the
   story / capability / contract corpus and event-store state enters the window, pulled
   just-in-time — is first-class **owned code**, never delegated to a third-party harness.
   It is the layer storytree most needs to control, and the substrate ADR-0013 makes
   queryable.
3. **Start on the Anthropic SDK; keep a pivot trigger.** Build the loop directly on
   `@anthropic-ai/sdk` (the Messages API), accepting **Anthropic-only** for now. This
   **relaxes** ADR-0001's model-agnostic non-negotiable to a *revisit-if-it-bites*
   posture: if we hit the same wall the v1 repo hit with the Claude Code SDK (opacity,
   lock-in friction), we pivot. Keep the model call behind a **thin internal seam** so a
   future provider swap is a backend change, not a rewrite — but do **not** build a
   multi-provider abstraction now (YAGNI; the any-provider goal is downgraded, not
   re-committed).
4. **The boundary stands; the thing behind it changes.** ADR-0004's single-boundary
   discipline is kept and strengthened: the owned loop lives in **one package**
   (provisionally `packages/agent`, replacing `packages/pi-adapter`), is the **sole** place
   a model runtime is imported, and is driven **only** by `packages/orchestrator`;
   `packages/core` and `apps/studio` still hold no model-invocation path. ADR-0005's
   **spine/leaf split stands** — code sequences (the orchestrator over DBOS), the owned
   loop judges at the leaf. *run ≠ node* and *no agent-spawns-agent* are unchanged.
5. **What does NOT change.** DBOS/Postgres durable execution, the thin orchestrator, the
   event store as the single observability source, the PixiJS studio, and TS/Node/pnpm all
   stand. Only **pi-as-leaf** and the **model-agnostic non-negotiable** are reversed.

## Consequences

- **Supersedes ADR-0001** — its "per-node coding agent: pi" choice and its "model-agnostic
  via pi" non-negotiable. ADR-0001's stack (DBOS, orchestrator, event store, PixiJS, TS) is
  untouched, and its de-risk spike (3-node fan-out/fan-in on DBOS) still applies — now with
  owned-loop nodes instead of pi sessions.
- **Amends ADR-0004 / ADR-0005** — the boundary now wraps `packages/agent` (the owned
  loop), not pi; the leaf is the owned loop, not a pi session. The structural rules (single
  import site, orchestrator-only driver, spine/leaf discriminator, run≠node, sole fan-out)
  carry **verbatim**.
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

- [ADR-0001](0001-foundational-stack.md) (superseded in part), [ADR-0004](0004-orchestrator-agent-boundary.md) / [ADR-0005](0005-orchestration-spine-code-vs-judgment.md) (amended here), [ADR-0003](0003-v1-reversal-ledger.md) (ledger).
- [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md); the Claude Code SDK opacity experience (v1 `Agentic` repo).
- Design conversation, 2026-06-06.
