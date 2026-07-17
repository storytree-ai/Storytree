---
id: "colour-by-subagent"
tier: capability
story: wisp-as-story-claim
title: "Colour the wisp by the active subagent / intent — authoring, proving, supplementing"
outcome: "The phase→colour writer generalises so the wisp colour reflects the ACTIVE SUBAGENT ROLE / intent — authoring (story-author), proving (red→green leaf), supplementing (glue) — not only the gate phase, via a pure intent/role→colour-state mapping wired into the writer."
status: proposed
proof_mode: integration-test
depends_on: [claim-store-work-time]
decisions: [138, 137]
# Node-borne proof config (ADR-0057 keystone A). The provable delta is a PURE mapping: subagent-role / intent
# → colour-state. NET-NEW, builtins-only — the leaf authors a net-new pure module
# packages/drive/src/subagent-colour.ts (type-only imports of BuildPhase/Tier are erased), tested offline.
# The red is the missing module. NO `install`/`db`: keeping the proved unit a PURE function (not the writer
# itself, which runtime-imports `workEvent` from @storytree/orchestrator) lets the default node:test single-
# file proof run it install-free. WIRING the mapping into phaseActivityWriter (phase-activity.ts) is the
# integration touch — covered by the @storytree/drive package suite, not the isolated `--real` proof.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/drive", "test"]
  scope:
    testGlobs: ["packages/drive/src/**/*.test.ts"]
    sourceGlobs: ["packages/drive/src/**/*.ts"]
  real:
    testFile: "packages/drive/src/subagent-colour.test.ts"
    sourceFile: "packages/drive/src/subagent-colour.ts"
    scope:
      testGlobs: ["packages/drive/src/subagent-colour.test.ts"]
      sourceGlobs: ["packages/drive/src/subagent-colour.ts"]
---

# Colour the wisp by the active subagent / intent

**Outcome —** The phase→colour writer generalises so the wisp colour reflects the **active subagent role /
intent** — **authoring** (story-author), **proving** (the red→green leaf, the old build-wisp now a colour
*state*), **supplementing** (glue) — not only the gate phase (ADR-0138 §5).

**Depends on —** [`claim-store-work-time`](claim-store-work-time.md) (the work-time claim under whose
session a spawned subagent runs, so its role sets the colour).

> **ADR-0200 note (colour is intent, grade is geometry).** Under the graded ledger the two render axes
> are orthogonal: the claim **grade** drives the wisp's GEOMETRY (exploring hovers / work orbits /
> waiting queues, `render-claim-as-wisp`), while the active subagent role / **intent** drives its COLOUR
> (this capability). The §5 honesty wall binds both — `"proving"` is a claim colour state, never the
> proven-green bloom; the mapping must never emit a green/bloom token. Unchanged by ADR-0200 otherwise.

> **Proof status (honest) — `proposed`.** Today `packages/drive/src/phase-activity.ts`
> (`phaseActivityWriter`) stamps `building` work-events coloured by `doc.phase` (the five gate phases). The
> generalisation — a colour state driven by the active subagent ROLE / intent — does not exist yet. The
> provable piece is a pure role→colour mapping, net-new and builtins-only.

## Guidance

Read `packages/drive/src/phase-activity.ts`: `phaseActivityWriter(store, target)` returns the `onPhase`
observer `proveUnit` invokes; each phase appends a phase-stamped `building` work-event, and
`inFlightBuilds()` reads the latest row so the wisp re-colours red→green. Today the only colour axis is
`BuildPhase`. ADR-0138 §5 wants the colour to express WHAT the orchestrator is doing on the claimed story:
authoring / proving / supplementing.

**C1 — a pure `subagentColourState` mapping (net-new, `packages/drive/src/subagent-colour.ts`).** Define a
small intent/role vocabulary — `"authoring" | "proving" | "supplementing"` (the three ADR-0138 §5 states) —
and a pure function mapping a subagent role (and/or a claim `intent` like `"edit"` / `"orchestrate"` /
`"real"`) to a stable colour-state token the wisp renders. Type-only imports of `BuildPhase` / `Tier` from
`@storytree/proof-protocol` are erased, so the module stays builtins-only and offline-buildable. Keep it
PURE: role in, colour-state token out; no store, no clock. The §5 honesty wall holds here too — `"proving"`
is a CLAIM colour state, never the proven-green bloom; the mapping must not emit a "green"/"bloom" token (a
real build's `CONFIRM_GREEN` + signed verdict owns that, ADR-0045 / ADR-0099).

**C2 — wire the mapping into the writer (integration touch, `phase-activity.ts`).** Generalise
`phaseActivityWriter` (or add a sibling) so the `target` carries the active subagent role / intent and the
written `building` doc stamps the `subagentColourState` token alongside (or instead of) the raw phase. This
edit touches `phase-activity.ts`, which runtime-imports `workEvent` from `@storytree/orchestrator` — so it
is proven by the `@storytree/drive` package suite (the integration command), NOT the isolated `--real`
proof. The isolated `--real` deliverable is the PURE mapping (C1).

Do NOT touch files outside your write scope. Keep the proved unit a pure function so the default node:test
single-file proof runs it install-free.

## Integration test

**Goal —** Run the real `subagentColourState` mapping (no stubs) across the three subagent states —
authoring, proving, supplementing — proving each maps to a stable, distinct colour-state token, and that
NONE maps to a proven-green/bloom token (the §5 wall). The writer-wiring (C2) is exercised by the
`@storytree/drive` package suite against the real `phaseActivityWriter`.

Exercised against its **real collaborator** — the pure mapping itself (ADR-0010 §5): role in, colour-state
out, no store. The writer integration is covered by `@storytree/drive`'s own suite.

## Contracts (2)

The test-proven leaf behaviours — each one isolated automated test (ADR-0002).

1. **`subagent-role-maps-to-distinct-colour-state`** — the pure mapping turns each active subagent role /
   intent into a stable, distinct colour-state token, and never a proven-green one.
   - **asserts —** `subagentColourState("authoring")`, `("proving")`, and `("supplementing")` each return a
     stable token, the three are mutually distinct, and NONE equals the proven-green/bloom token (the §5
     honesty wall — a claim colour is never a proof, ADR-0138 §5 / ADR-0045). Pure — no store, no clock.
   - **covers —** `packages/drive/src/subagent-colour.ts`
   - **proven by —** `packages/drive/src/subagent-colour.test.ts` (net-new, offline, authored by the leaf).
2. **`writer-stamps-the-subagent-colour-state`** — `phaseActivityWriter` stamps the active subagent's
   colour-state token onto the `building` doc it appends.
   - **asserts —** given a `target` carrying a subagent role, the observer the writer returns appends a
     `building` work-event whose doc carries the `subagentColourState` token for that role (alongside the
     gate phase), so `inFlightBuilds()` reads the role colour.
   - **covers —** `packages/drive/src/phase-activity.ts`
   - **would-be test (integration) —** authored in the `@storytree/drive` package suite (the writer
     runtime-imports `@storytree/orchestrator`, so it is not the isolated `--real` unit); the pure mapping is.
