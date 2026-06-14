---
status: proposed
decided: 2026-06-14
amends: [29]
---
# ADR-0051: The agent renderer shapes CLAUDE.md and the leaf prompt from library agents

## Status

proposed — owner steer in conversation 2026-06-14: *"we should be assembling the orchestrator agent
from the library assets, and your CLAUDE.md file should be shaped from the orchestrator agent artifact
so you get it with every session."* This builds the agent↔runtime binding **[ADR-0029](0029-agents-as-library-artifact-category.md)
deliberately deferred** ("a later build may have `storytree agents <name>` read its role's `agent`
unit… that binding is ADR-0011 territory and out of scope here") — so it **amends ADR-0029**. It
applies [ADR-0030](0030-all-in-on-claude-agent-sdk.md) (pull-based, harness-agnostic context),
[ADR-0023](0023-agent-library-cli.md) (the CLI is the context surface), and
[ADR-0034](0034-process-artifacts-ways-of-working.md) (the ceremonies an agent points at).

**Update 2026-06-14 — Decision 4 (the SDK-leaf binding) is now BUILT.** The renderer + CLAUDE.md slice
landed first (PR #120); this follow-up hard-wired the live Claude Agent SDK leaf's per-phase system
prompt to the rendered library agents `red-builder` (AUTHOR_TEST) and `green-builder` (IMPLEMENT),
renamed from `leaf-test-author` / `leaf-implementer` (owner steer: a renamed-but-unwired artifact is
the blindside to avoid). The leaf prompt is no longer hard-coded; a live leaf with no injected prompt
fails closed. See Decision 4 and Consequences below.

## Context

A guidance slip exposed the gap: a finished, green unit sat in a draft PR instead of going non-draft
to auto-merge (ADR-0022). The merge-ceremony rule was *present* — both as the `merge-ceremony`
`process` artifact in the Library **and** hand-copied into `CLAUDE.md` — yet it was hand-copied, which
is the real problem: **the operating discipline an agent runs on is maintained by hand, in two places,
with nothing keeping them in sync.**

The Library already models roles as `agent` artifacts (ADR-0029): a lean unit whose `context` / `rules`
/ `antiPatterns` are typed `asset:` refs into the corpus, assembled by reference-don't-restate (§7).
Eight exist. But:

- **Nothing renders them.** `storytree agents <name>` is stubbed `(coming soon)` (`packages/cli/src/commands.ts`).
- **No agent represents the session.** The eight are narrow roles (leaf author/implementer, curators,
  investigators). There is no **orchestrator** agent — the interactive main-loop role that runs builds,
  gates, commits, opens PRs, and follows the ceremonies. That role is exactly the one whose discipline
  must reach every session, and it isn't modeled.
- **CLAUDE.md is hand-authored**, not a generated view (unlike `docs/glossary.md`, which
  `build-corpus.mjs` generates). It drifts from the Library by construction.
- **The SDK leaf prompt is hard-coded** (`packages/agent/src/sdk-author.ts` `SYSTEM_PROMPT_BASE`) —
  it ignores the `red-builder` / `green-builder` artifacts (renamed 2026-06-14 from
  `leaf-test-author` / `leaf-implementer`) that describe it.

The corpus is the source of truth for everything else (ADR-0017); the agent's operating discipline is
the one thing that escaped it. The fix is to make every runtime surface a **generated view of a Library
`agent` artifact**, the same way the glossary is a generated view of the definitions.

## Decision

1. **One renderer, the single mechanism.** `storytree agents <name>` assembles an agent's system text
   from its Library artifact: it reads the `agent` unit, fetches the units its `context` / `rules` /
   `antiPatterns` refs point at, and injects their rendered bodies under labelled sections (never
   restating — ADR-0029 §7). It runs **offline** off the seed corpus (like every other read command,
   ADR-0023), so it works in CI and in the ephemeral web container. This is the keystone every surface
   reuses.

2. **An `orchestrator` agent artifact** is added to the Library — the interactive session role that
   drives the work: orient → build → gate → commit → **merge-ceremony**. Its refs point at the
   ceremonies (`merge-ceremony`, `prove-and-promote-ceremony`, `library-edit-ceremony`) and the session
   guardrails (gate, write-scope, dirty-tree, never-self-exempt). The merge-ceremony artifact also
   gains the missing line the slip revealed: **a hold (draft / `hold` label) is temporary — when the
   held unit is green, flip it to non-draft so it merges.**

3. **CLAUDE.md's operating-discipline block is a generated view.** A generator renders the orchestrator
   agent (via the renderer) into a **marked region** of `CLAUDE.md`
   (`<!-- AGENT:orchestrator START -->` … `END`); the repo-orientation prose around it stays
   hand-authored. The generator joins `build-corpus.mjs`'s outputs, and a CI check fails if the region
   is stale (the glossary's drift-guard pattern) — so the discipline can never silently diverge from
   the Library again.

4. **The SDK leaf prompt IS a generated view too — BUILT** (2026-06-14, the follow-up unit after the
   CLAUDE.md slice). The live Claude Agent SDK leaf's per-phase system prompt is the RENDERED library
   agent, not the hard-coded `SYSTEM_PROMPT_BASE`: **`red-builder`** is the AUTHOR_TEST prompt (write
   the one failing test, stop), **`green-builder`** is the IMPLEMENT prompt (minimum source to pass,
   stop). The CLI assembles them offline via `renderAgentPrompt` (the same renderer, reference-don't-
   restate), threads them through `resolveProveSpec` into `ClaudeAgentAuthor.phasePrompts`, and the
   runtime composes `agent body + the feedback closing` (the closing keeps the spine-observes-red/green
   runtime mechanic). The dependency floor is respected — `@storytree/agent` stays core-only; the
   renderer/store live in the CLI and pass strings down. **Fail-loud, no silent fallback** (the anti-
   blindside guarantee): a live/real leaf with no injected prompt fails CLOSED rather than running the
   generic base; a missing agent or a dangling manifest ref refuses the build before any spend. The
   generic base survives ONLY behind an injected `queryFn` (the offline scripted test double). The
   **merge-ceremony stays orchestrator-only** — it is never referenced by a leaf agent.

5. **One agent population, many rendered surfaces** (the owner's reframe): the Library `agent` unit is
   the single source of truth; CLAUDE.md (the interactive/orchestrator surface), the SDK leaf prompt
   (the leaf surface), and later `.claude/agents/*` (subagents) are all **generated views** of it.

## What this explicitly does NOT do

- **Not a fully-generated CLAUDE.md.** Only the marked operating-discipline region is generated; the
  reversals, ADR map, and how-to-run prose stay hand-authored (they aren't agent discipline).
- **No agent-schema change.** ADR-0029's `agent` kind (context/rules/antiPatterns ref-lists) stands
  unchanged; this binds it to surfaces, it doesn't redesign it.
- **No status automation, no SessionStart dump.** The renderer assembles a *curated* prompt from the
  orchestrator agent's refs — not a dump of all 42 principles (the friction-audit conclusion:
  a thin, sourced cheat-sheet, not everything).

## Consequences

- The operating discipline has **one source of truth** (the orchestrator `agent` unit) and reaches
  **every session** through a generated CLAUDE.md region — no more hand-copy drift, and the exact rule
  that bit us (hold-is-temporary) is captured where it propagates.
- The same renderer now gives the SDK leaf its prompt from the Library (Decision 4, BUILT), closing the
  last hard-coded guidance surface (ADR-0030's deferred binding): `red-builder` and `green-builder` ARE
  the live leaf's per-phase system prompts, fail-loud if absent.
- New cost: a generation step + a CI staleness check; editing the discipline now means editing the
  Library artifact (the live store / `knowledge.json` seed) and regenerating — which is the point.
- `storytree agents <name>` becomes a real, testable command — useful on its own for inspecting any
  role's assembled prompt.

## Named-deferred

- **`.claude/agents/*` generation** for subagents from the same population.
- ~~**The SDK-leaf wiring** (Decision 4) as its own unit after the CLAUDE.md slice.~~ **DONE 2026-06-14**
  — `red-builder` / `green-builder` are rendered by the CLI and threaded into `ClaudeAgentAuthor`
  (`phasePrompts`); fail-loud, no generic fallback on live.

## References

- [ADR-0029](0029-agents-as-library-artifact-category.md) — the `agent` kind + reference-don't-restate
  (§7); this builds the binding it deferred.
- [ADR-0034](0034-process-artifacts-ways-of-working.md) — the `process` ceremonies the orchestrator points at.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — auto-merge-on-green (the rule the slip missed).
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) / [ADR-0023](0023-agent-library-cli.md) — the leaf
  runtime and the pull-based context surface.
- `packages/cli/src/commands.ts` (the `agents` stub), `packages/core/src/knowledge.ts` (the `agent`
  KIND_SPEC), `apps/studio/data/build-corpus.mjs` (the generated-view pattern), `CLAUDE.md`.
