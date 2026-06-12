---
status: accepted
decided: 2026-06-06
---

# ADR-0012: Tool execution behind a borrowed, pluggable sandbox

## Status

accepted (2026-06-06) — resolves part of `open-questions.md` §3(a); complements
[ADR-0009](0009-concurrency-isolation-id-allocation.md) (state isolation) and
[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (the owned loop).

**Superseded-in-part by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)** (DBOS deferred; the store is a plain typed Postgres connection now — the DBOS-based state isolation this complements is the deferred path, not the built one).

## Date

2026-06-06

## Context

[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) puts an **owned agent
loop** at the leaf. That loop dispatches tool calls — `read` / `write` / `edit` / `bash`
— which must physically execute somewhere. [ADR-0009](0009-concurrency-isolation-id-allocation.md)
already decided **state / coordination** isolation (per-node DBOS workflow against one
shared Postgres store, *not* branch-per-session) but explicitly left **§3(a)** open:
whether the agent's **code edits** run in a git branch/worktree per node — i.e. *where
tool execution lives*.

Sandboxing — isolated `bash` + filesystem for an agent, especially many agents editing
code in parallel — is the most commoditized and the hardest-to-build-well piece of an
agent engine. Building it from scratch is low-differentiation, high-cost work, and good
open-source options exist (owner, 2026-06-06).

## Decision

1. **Don't own the sandbox; borrow it.** storytree owns the loop and context engineering
   (ADR-0011) but **rents tool-execution isolation** from open source, adopted **lazily**
   when a real need forces it — not built up front.
2. **A tool-execution interface is the seam.** The owned loop dispatches tools through one
   interface (provisionally `ToolExecutor`: `read`/`write`/`edit`/`bash`/`glob`/`grep`).
   The sandbox is a **backend behind that interface**, swappable without touching the loop.
   **Build the seam now** (with a trivial local backend); defer the heavy backend. This is
   the cheap insurance that makes "borrow later" a backend change, not a rewrite.
3. **Tiered backends, cheapest-isolation-first.** Candidates, adopted as need arises:
   an **in-process virtual sandbox** (e.g. `just-bash`) for speed/scale; a **git worktree
   per node** for parallel code-editing isolation (the natural answer to §3(a)); a
   **container / microVM (Firecracker) / sandbox-as-a-service (Daytona)** when running
   untrusted code. Anthropic's reference `bash` / text-editor tool implementations may seed
   the tool surface. **No single backend is mandated now.**
4. **Relationship to ADR-0009.** ADR-0009 **stands**: state/coordination isolation is DBOS
   workflows over shared Postgres, *not* git branches. This ADR is only about **where the
   agent's tools physically run** — the orthogonal axis ADR-0009 §3(a) deferred. A
   worktree, *if* adopted, is a tool-execution sandbox for code edits, **not** the
   coordination/claim substrate (claims remain DB rows; ADR-0009).

## Consequences

- **Resolves open-questions §3(a) in principle** — yes, tool execution has its own
  isolation seam, distinct from coordination; the concrete backend (worktree vs container
  vs virtual) stays a deferred, borrow-when-needed choice. §3(b)/(c) (claim granularity,
  conflict ceremony) remain open under ADR-0009.
- **Keeps the engine's differentiation tight** — *owned:* loop + context; *borrowed:*
  sandbox; *provided:* durable concurrency (DBOS).
- The `ToolExecutor` interface lands with `packages/agent` (ADR-0011); its exact shape is
  provisional.

## What this does NOT decide

- The actual sandbox **backend(s)** and **when** each is adopted — deliberately deferred
  to need.
- The `ToolExecutor` **surface** (tool set, signatures, streaming) — lands with the
  package.
- How a tool-execution **worktree**, if used, reconciles its writes back to the trunk under
  ADR-0008's approval gate.

## References

- [ADR-0009](0009-concurrency-isolation-id-allocation.md) (state isolation; §3(a) deferred there), [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (owned loop), `open-questions.md` §3.
- Design conversation, 2026-06-06.
