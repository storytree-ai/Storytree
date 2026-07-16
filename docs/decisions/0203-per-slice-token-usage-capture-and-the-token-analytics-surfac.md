---
status: proposed
---
# ADR-0203: Per-slice token-usage capture and the token-analytics surface

## Status

proposed — the capture + persistence half (Part 1) was owner-directed in the 2026-07-16
token-efficiency investigation and is BUILT by this unit; the analytics-surface half (Part 2) is a
design with options laid out below — the surface pick (and any forest-map placement, an owner
look/feel call) awaits the owner. Sibling of ADR-0201 (the same investigation's other unit).

## Context

storytree measured **no tokens anywhere**. The 2026-07-16 trace mining (host transcripts under
`~/.claude/projects` — the only usage record that existed) found ~10.6B billed tokens over the
mined window, ~95% of it cache-read context re-billing, and — decisive for Part 2 — **interactive
main sessions dominate (~8.4B of ~10.6B); build-leaf spend is a small fraction**. Meanwhile the
system itself discarded every usage figure it was handed:

- `AnthropicModel.createMessage` (`packages/agent/src/model.ts`) read the Messages API response
  and dropped its `usage` block — `ModelResponse` was only `{content, stopReason}`.
- `ClaudeAgentAuthor` (`packages/agent/src/sdk-author.ts`) read only `num_turns` +
  `total_cost_usd` off the SDK result, never the token breakdown (`usage` / `modelUsage`).
- Nothing persisted: the `events` schema had no usage home, and the coarse costUsd/turns died
  with the process (a console line in `packages/drive`'s build envelopes).

One structural constraint shapes the design: the signed `Verdict` (proof-protocol) **deliberately
carries no runtime cost**. Proof and spend are different axes — the verdict is the gate's signed,
byte-stable fact; accounting is advisory context. Usage must therefore ride a SIBLING surface,
never a verdict field. A second honesty rail: the SDK's metered `total_cost_usd` is a phantom
under subscription billing (ADR-0130) — recorded as context, never a meter to enforce against.

## Decision

### Part 1 — capture + persist (BUILT by this unit)

1. **Capture vocabulary** (`TokenUsage`, camelCase, four axes kept apart — the axes bill at
   different rates, and collapsing them would hide that ~95% of measured spend is cache-read
   re-billing): `inputTokens` / `cacheCreationInputTokens` / `cacheReadInputTokens` /
   `outputTokens`. Lives in `@storytree/agent`'s model-events port (the vocabulary organism);
   the wire twin is duplicated in `@storytree/proof-protocol` per the ADR-0068 Tier/Status
   precedent (the bottom root imports nothing).

2. **Both leaf paths thread it**:
   - owned loop: `ModelResponse.usage?` — `AnthropicModel` maps the API `usage` block
     (`usageFromApi`); a `ScriptedModel` script may carry or omit it.
   - SDK leaf: `SdkRunInfo.usage?` + `SdkRunInfo.byModel?` — `ClaudeAgentAuthor` reads the SDK
     result's `usage` (aggregate) and `modelUsage` (per-model split incl. its metered per-model
     cost) DEFENSIVELY (`usageFromSdkResult`): capture is **additive, never fail-closed** — a
     result with no readable usage still lands its slice with turns/cost accounting.

3. **Persistence: a sibling event stream, not the verdict.** New wire shape `UsageEventDoc`
   (proof-protocol): `{unitId, runId, phase, source: sdk-leaf|owned-loop, usage, model?, turns?,
   costUsd?, byModel?}`, kind `"usage"`, one event per authoring slice (id
   `runId:unitId:phase`). New table `events.usage_event` (schema.sql): the four token axes +
   cost_usd as the queryable scalar spine a SQL roll-up SUMs over, full doc in JSONB.
   `PgWorkStore` routes the kind (fail-closed zod parse, like the verdict arm) and surfaces the
   rows in `readEvents`; `rollupStatus` ignores the kind entirely — **a usage row can never move
   a unit's derived status** (accounting is never proof).

4. **Wiring**: the drive appends usage after `proveUnit` in both build paths (`driveNode`,
   `buildNodeReal` — covering `node build` and the `story build` chain), for PASS and FAIL alike
   (a red slice billed too). The append is ADVISORY (the phaseActivityWriter posture): a failed
   accounting write warns and never fails a build. Under `--store pg` (a `--real` build) usage
   persists durably; a dry-run/live-smoke's accounting honestly dies with its in-memory store,
   exactly like its verdict. The build envelope now prints a per-slice `tokens:` line.

### Part 2 — the top-level analytics surface (PROPOSED; owner picks)

How per-slice rows roll up into "what is this system spending?", evaluated against the honesty
constraint above (build-leaf spend is the SMALL fraction):

- **(a) CLI: `storytree tokens`** — roll-ups per node / story / phase / model from
  `events.usage_event` (the scalar spine makes this a few GROUP BYs), sibling of `storytree
  onboarding` (whose transcript miner in `packages/cli/src/onboarding-budget.ts` already parses
  host transcripts, measuring latency-ms today).
  *Honest only with a labelled scope line* — "BUILD spend only; interactive sessions are not in
  this store."
- **(b) Studio/forest surface** — a token/spend tile on the session dock or a per-node overlay
  fed by the live store (the `/api/health` read pattern). Positioning against the honest-map
  lineage (ADR-0124 → superseded by ADR-0128: the owner rejected rendering *speculative/planning*
  state on the map): an analytics tile renders **measured past fact**, not speculation, so it does
  not violate that rule — but any forest-map placement is an owner look/feel call (ADR-0070
  stage 2) and is NOT built here; a follow-up frontend story carries it through the
  frontend-builder's two-stage proof.
- **(c) Two-source: events store for BUILD spend + host-transcript mining for INTERACTIVE spend**
  — the only shape that shows the true picture, since interactive sessions dominate ~4:1. The
  transcript miner reads `~/.claude/projects` (per-request `usage` in the host JSONL; calibration
  traps from the mining: text tool-results bill ~1.6× bytes/4, images ~0.015×), so it is
  inherently per-machine/per-owner — fine for today's single-owner reality, stated as a limit.

**Recommendation: (c), delivered as (a) first.** One `storytree tokens` command with two labelled
sections — `build` (events store, durable, multi-session) and `interactive` (host-transcript
miner, this machine) — each section naming its source and scope, a combined headline only when
both sources are present. A build-only surface presented as "token analytics" would be a false
picture by ~8×; the two-source CLI is cheap (both halves' plumbing exist after Part 1) and gives
the owner real numbers before any studio pixel is spent. The studio tile (b) becomes a follow-up
story once the CLI proves which roll-ups matter.

**Escalated to the owner**: (1) pick the surface — recommendation above; (2) whether/where a
studio/forest tile lives (look/feel); (3) whether interactive-session mining should ever leave
the local machine (privacy posture of transcript-derived numbers in the shared store — NOT done
here; nothing transcript-derived persists in Part 1).

## Consequences

- Every `--real` build now leaves a durable, queryable per-slice token record — the four axes +
  metered cost per authoring phase, per unit, per run — with zero change to the proof chain: the
  verdict stays byte-stable, the rollup provably ignores the new kind, and a usage-write failure
  cannot fail a build.
- The events schema grows one append-only table (`events.usage_event`, additive `CREATE IF NOT
  EXISTS` — applySchema self-heals live DBs on next contact).
- Dry-run / live-smoke accounting is ephemeral by design (in-memory store) — synthetic walks
  keep leaving no shared-store footprint (ADR-0099-B posture).
- The SDK's `total_cost_usd` / `modelUsage.costUSD` are stored as advisory context; nothing may
  enforce against them (ADR-0130 stands — the turn cap remains the runaway brake).
- Until Part 2 lands a surface, the rows are reachable by SQL / `readEvents` only; the
  interactive-vs-build honesty constraint is RECORDED here so any future surface inherits it.
- The owned loop captures usage on `ModelResponse` but does not yet persist it (no live owned-loop
  path runs today; `source: "owned-loop"` is reserved in the wire shape for when one does).

## References

- ADR-0201 — the same investigation's other unit (prompt-keyed definition injection).
- ADR-0130 — no USD ceiling by default; metered cost is a phantom under subscription billing.
- ADR-0068 §3 — proof-protocol duplicates wire shapes rather than importing (Tier/Status precedent).
- ADR-0020 — the prove-it-gate; the signed verdict's honesty walls this design must not touch.
- ADR-0124 / ADR-0128 — the honest-map lineage any forest-surface proposal positions against.
- Code: `packages/proof-protocol/src/usage-event.ts`, `packages/agent/src/model-events.ts` /
  `model.ts` / `sdk-author.ts`, `packages/orchestrator/src/proof/usage-event.ts` /
  `store/pg-work-store.ts`, `packages/library/src/store/schema.sql`,
  `packages/drive/src/usage.ts` / `node-build.ts`.
- Memory: `token-traces-live-in-claude-projects.md` (the mining numbers + calibration traps).
