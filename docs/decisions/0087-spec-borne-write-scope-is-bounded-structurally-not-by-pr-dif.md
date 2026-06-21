---
status: accepted
decided: 2026-06-21
---
# ADR-0087: Spec-borne write-scope is bounded structurally not by PR-diff review

## Status

accepted (2026-06-21) — decided in conversation by the owner ("structural guard rail"), who reviewed
the trade-off after pulling `main` to confirm nothing had shifted. The `status:` flip was applied by
this session per [ADR-0084](0084-agents-may-flip-an-adr-green.md). It **resolves the live open question
`oq-structural-bounds-on-spec-borne-proof-declarations`** ("Spec-borne proof declarations: structural
bounds, or PR-diff review?") in favour of its **Option B (structural bound)**, the call
[ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) explicitly deferred to
"its own ADR". It overturns no honesty wall — the per-phase write wall and `green = a signed verdict`
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) are untouched.

## Context

[ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) moved a node's proof
config (its write-scope globs and, expansion B, its proof command) out of the orchestrator's
`NODE_BUILD_REGISTRY` and into the node's own `proof:` spec block, so authoring a spec is the single act
that makes a node buildable. For the 7 migrated nodes a kept registry twin is a live parity bound; a
**new spec-borne-only node has no twin** — it declares its own blast radius with nothing to diff it
against.

The honesty walls hold regardless of *where* the config is declared: the spine observes red/green
out-of-band, the per-phase write wall enforces the scope spine-side, and a forged-green command
self-defeats at `CONFIRM_RED`. So this is **not** load-bearing for correctness — it is about bounding an
*over-broad or hostile declaration* before it lands. ADR-0057 shipped matching the status quo (the
declaration is caught, if at all, by **PR-diff review** — exactly as the registry always was) and
deferred the question to a dedicated ADR.

The deferred question became the live open question
`oq-structural-bounds-on-spec-borne-proof-declarations`, framing two options:

- **A — PR-diff review** (status quo): a human reviews the spec's `proof:` block in the landing PR. Zero
  new machinery; relies on a human catching an over-broad scope or an odd command.
- **B — a structural bound**: refuse, by construction, a `sourceGlobs` entry outside the node's own
  package (or a bare `**/*`), and/or an allow-list of proof-command executables. A hostile or over-broad
  spec cannot even land; the cost is new machinery and a refine that must not false-reject a legitimate
  node.

## Decision

**1. Adopt Option B: a STRUCTURAL bound, not PR-diff review, is the control on a self-registered node's
declared write scope.** A spec-borne node may not declare a scope reaching outside a single, concrete
package/app — the schema refuses it, so PR-diff review is no longer the thing standing between an
over-broad declaration and `main`.

**2. BUILT with this ADR — the write-scope glob bound.** Every declared write-scope glob (both the outer
per-phase `scope` and the inner `real.scope`, `testGlobs` and `sourceGlobs` alike) must be a
repo-relative POSIX path that (a) is rooted under a concrete code root — `packages/<pkg>/` or
`apps/<app>/` — with (b) a concrete package/app segment (no glob metacharacter — `packages/*/…` spans
the whole repo and is refused), and (c) no `..` escape and no absolute path. The judge is the pure,
shape-only, unit-tested `scopeGlobBoundIssue`
([proof-config.ts](../../packages/orchestrator/src/proof-config.ts)), wired as a `superRefine` on
`PathWriteScopeConfigSchema`, so an over-broad scope is **loud at parse time** and can never resolve into
a `ProveSpec`. Shape-only by design: it judges the glob string, never whether the package exists on disk
(existence/staleness is a separate drift concern), so it stays pure and offline-testable.

**3. This is belt-and-suspenders over the wall, not a replacement for it.** The per-phase write wall
(`phase-scoped-write-wall`) and the SDK `PreToolUse` hook still *enforce* the scope spine-side at build
time; the new refine refuses an over-broad *declaration* up front. Both layers hold; neither weakens the
other.

**4. NAMED follow-on (decided in principle, not built) — the proof-command executable allow-list.**
Option B's second sub-bound (an allow-list of proof-command executables rejecting network- or
filesystem-mutating shapes) is **not** built here. The command surface already carries structural bounds
(no declared `cwd` redirect, no `pnpm add` flag injection, a `pnpm` command requires `install:true`, and
a forged-green self-defeats at `CONFIRM_RED`); a *positive executable allow-list* is a larger, fuzzier
design that risks false-rejecting legitimate commands, and earns its own design pass when the first
spec-borne-only node with a custom proof command actually exists.

## Consequences

**Good.**
- A hostile or over-broad self-registered write scope cannot land — it cannot even parse — so the safety
  of the first spec-borne-only node no longer rests on a reviewer noticing a `**/*`.
- The bound is a pure, shape-only function: exhaustively unit-testable offline, no filesystem coupling,
  the same fail-loud posture the rest of the `proof:` schema already takes (`.strict()`, the `cwd`
  refusal, the `install`/`db`/`addDeps` refines).
- **No false-reject for existing work:** all 7 migrated specs use concrete `packages/<name>/…` globs and
  still resolve byte-for-byte — verified by the contract-4 parity test ("every migrated real node stays
  the node:test default").

**Bad / costs / follow-on (surfaced, not buried).**
- A *legitimately cross-cutting* node — one that needs to write across more than one package — is now
  refused. This is intentional: such a unit should be split into per-package nodes (the routing filter
  the orchestrator already applies), or earn an explicit, declared exception in a future ADR rather than
  a silent repo-wide scope.
- The bound is **shape-only**, so it does not catch a glob pointing at a *non-existent* package (a stale
  `packages/core/…` glob still parses). That is a deliberate separation — package existence/drift is a
  different check — but it means "in bounds" is not "resolves to real files".
- The proof-command executable allow-list (decision 4) remains unbuilt; until then, a custom proof
  command's executable is still bounded only by the existing command refines plus PR-diff review.
- The allowed roots are **storytree's own monorepo layout** (`packages/` / `apps/`). That is correct
  while *storytree builds itself* (open-questions §8 — the only target today); a future external
  target repo with a different layout would need the roots made configurable. Recorded as the known
  assumption, not a silent hardcode.

## References

- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — moved proof config
  into the node's own spec; explicitly deferred this scope-bound question to "its own ADR" (this one).
- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — the policy under which this ADR's `proposed →
  accepted` flip was applied.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed verdict` and the
  per-phase write wall (unaffected — this bounds a declaration, it does not touch enforcement).
- `oq-structural-bounds-on-spec-borne-proof-declarations` — the live open question this resolves
  (Option B), retired against this ADR.
- `packages/orchestrator/src/proof-config.ts` (`scopeGlobBoundIssue` + the `PathWriteScopeConfigSchema`
  refine) and `packages/orchestrator/src/proof-config.test.ts` (the red→green tests) — the bound this
  ADR builds.
- `stories/drive-machinery/spec-borne-proof-config.md` — the capability whose "Open owner call" this
  resolves.
</content>
