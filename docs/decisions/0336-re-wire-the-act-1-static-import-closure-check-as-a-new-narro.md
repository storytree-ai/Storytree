---
status: accepted
decided: 2026-08-09
amends: [311]
---
# ADR-0336: Re-wire the Act 1 static-import-closure check as a new, narrower gate rung

## Status

accepted (2026-08-09) — decided/directed by the owner in conversation on 2026-08-09, resolving the
open question `oq-should-the-retired-check-web-experience-rung-be-re-wired` (Option D). Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** ADR-0311. ADR-0311 D2 retired `check:web-experience` and D5 requires that any re-addition
"requires only explicit root-script, gate-plan and CI wiring, but ... also requires new
production-catch evidence and an ADR." This decision is that ADR for one narrow slice of the retired
rung; ADR-0311's nine-survivor set and its retirement of the other fifteen rungs (including the
remaining two-thirds of `check:web-experience` itself) stay current and are not reopened.

## Context

`check:web-experience` was a single judge asserting three properties of the `website-experience`
story's Act 1 entry (`experience-rollout-guardrails`, ADR-0134/ADR-0216 D2/D4): (1) the entry page
carries a `data-experience-skip` marker, (2) it carries a `data-experience-fallback` marker, and (3)
no module statically reachable from the Act 1 entry imports `three`, `@react-three/*`, or the synced
`forest-world-r3f` directory. ADR-0311 D2 retired the whole rung from the gate on 2026-08-05 as one of
sixteen standalone checks with no post-introduction production catch; the pure judge and its test
(`packages/cli/src/web-experience-check.ts` / `.test.ts`) were kept but carry the `UNWIRED` banner and
answer only on a direct invocation (`npx tsx packages/cli/src/web-experience-check.ts`).

The retired open question `oq-should-the-retired-check-web-experience-rung-be-re-wired` asked whether
to re-wire the whole rung on the assumption that a backup existed: the `storytree-web` repo's own
Playwright suite covering the two runtime markers. Investigating that assumption found it false — no
merged, live coverage of `data-experience-skip` / `data-experience-fallback` exists in `storytree-web`
today. Only unmerged local work-in-progress on branch `codex/website-experience-uat-specs-rescue`
covers the markers, and it says nothing about the static-import-closure property. So the three
properties are in different states of risk:

- The two marker checks are **runtime, cross-repo, HTML-presence assertions**. Re-wiring them here
  would need either a parent-side fetch of the live/preview site (a network dependency the gate does
  not otherwise carry) or a dependency on unmerged work in a separate repository this repo does not
  control the landing of. Restoring them now would be restoring exactly the kind of cost ADR-0311
  retired the rung to avoid, on evidence that is not yet real.
- The static-import-closure property — does the Act 1 entry's static import graph reach a WebGL
  package — is a **pure, offline, deterministic function of source text already checked out in the
  `web/` submodule**. It needs no network call, no live site, and no unmerged branch. It is also the
  direct machine expression of a load-bearing architectural constraint (ADR-0216 D2/D4: Act 1 ships no
  WebGL bytes, the R3F bundle loads only at the inflection) that a single stray static `import` from
  `three` or `@react-three/*` would silently violate, with no other rung watching for it.

The owner weighed these against each other (Option D of the retired question) and directed re-wiring
only the closure half, leaving the marker half retired.

## Decision

**D1 — a NEW gate rung, `check:web-experience-closure`, asserts only the static-import-closure
property.** It is not a readmission of `check:web-experience`: that name stays in `RETIRED_CHECKS`
(`packages/cli/src/gate-order.ts`), unwired, exactly as ADR-0311 D2 left it. The new rung's source
(`packages/cli/src/check-web-experience-closure.ts`) reuses the retired judge's existing,
already-tested closure-walk primitives (`findExperienceEntries`, `walkStaticClosure`,
`isWebGlSpecifier`, `withExtensionFallback`, all still exported from `web-experience-check.ts`) rather
than re-deriving them — the property itself is unchanged from what `check:web-experience` asserted
before retirement, only the marker assertions are dropped.

**D2 — the two runtime-marker assertions (`data-experience-skip` / `data-experience-fallback`
presence) stay retired.** No parent-side gate rung checks them. This is a known, accepted gap: the
skip and reduced-motion/no-WebGL fallback affordances are load-bearing (owner decision 6 on the
`website-experience` story — first-class from the first increment) but their presence is currently
unguarded by any machine. The nearest coverage is the unmerged `storytree-web` WIP branch named
above, which this decision does not depend on and does not direct landing.

**D3 — the new rung follows the established bootstrap-allowance / local-SKIP / CI-fail posture** used
by `check:web-grounding` and the retired `check:web-experience`: absent an experience entry under
`web/src/pages/`, it SKIPs (the guard lands before the storm); absent the `web/` submodule locally it
SKIPs (declaring `GATE_SKIP_EXIT_CODE`) and fails in CI, where the submodule is always cloned. It is
`own-work` / `seconds` cost, pinned in `PRE_EXPENSIVE_CHECKS` alongside `check:web-grounding` and
`check:web-engine` — the same reasoning: what it reads is the `web/` submodule pin this branch's
checkout carries.

**D4 — the `website-experience` story's UAT leg 2 is re-pointed** from the removed direct-invocation
note to `pnpm check:web-experience-closure`, without renumbering any criterion id.

## Consequences

**Good.** The one property with a real, cheap, deterministic oracle — no WebGL in Act 1's static
closure — is machine-guarded on every merge again, the moment the story's Act 1 entry ships. It costs
seconds, needs no network and no live site, and directly protects a named architectural decision
(ADR-0216) rather than merely restoring a name.

**Bad / accepted.** The marker-presence properties remain unguarded by any parent-side or CI machine
until a future decision re-wires them (which will need its own ADR-0311 D5 justification, most
plausibly once the `storytree-web` Playwright coverage referenced above actually lands and merges).
Until Act 1's entry page exists, the new rung also verifies nothing (bootstrap-allowance SKIP) — it is
preventive, not yet load-bearing on today's tree.

## References

- ADR-0311 — the survival audit that retired `check:web-experience` (and fifteen other rungs) and set
  the D5 bar this decision clears for one narrow slice of it.
- ADR-0216 — the no-WebGL-in-Act-1 architectural constraint this rung machine-enforces.
- `packages/cli/src/web-experience-check.ts` — the intact, still-`UNWIRED` retired judge; its
  closure-walk exports now also back this new rung.
- `packages/cli/src/check-web-experience-closure.ts` / `.test.ts` — the new rung.
- `packages/cli/src/gate-order.ts` — `GATE_PLAN`, `PRE_EXPENSIVE_CHECKS`, `SKIP_CAPABLE_CHECKS`.
- `stories/website-experience/story.md` UAT leg 2 — re-pointed to the new rung.
- the retired open question `oq-should-the-retired-check-web-experience-rung-be-re-wired` — the
  investigation that found the assumed marker-coverage backup does not exist live.
