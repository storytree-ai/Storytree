---
id: "experience-rollout-guardrails"
tier: capability
story: website-experience
title: "Skip and fallback are first-class from the first increment — machine-guarded"
outcome: "A parent-side gate, check:web-experience (the check:web-grounding pattern), fails when the experience entry page lacks the persistent skip-to-calm affordance marker or the prefers-reduced-motion / no-WebGL fallback marker, or when any module statically reachable from the Act 1 entry imports the R3F island or three — so no increment of the incremental home replacement can ship the storm as a toll booth or leak WebGL into Act 1; absent an experience entry the check SKIPs (bootstrap allowance), so the guard lands BEFORE the storm."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [123, 215]
# Node-borne proof config (ADR-0057 keystone). NET-NEW: the leaf authors a node:test file importing a
# NOT-YET-EXISTING pure judge module (packages/cli/src/web-experience-check.ts) — red =
# module-not-found at HEAD — then writes the judge (green). The judge is PURE (file-path → content
# maps in, findings out; the web-engine-sync discipline), so every assertion runs offline over
# in-memory fixtures — no web/ checkout needed in the proof. The IO shell (reading the real web/
# sources at gate time), the root `check:web-experience` script, and its slot in `pnpm gate` are
# orchestrator-supplemented GLUE; the site-side markers themselves (`data-experience-entry` arming
# the gate, `data-experience-skip`, `data-experience-fallback` on the entry) land WITH the
# storm/inflection caps — this cap ships the WALL, those caps satisfy it. install: true (the suite
# runs under @storytree/cli; fresh-worktree
# tsx + tsc, ADR-0031 §2) + the typecheck wall.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/web-experience-check.test.ts"]
    sourceGlobs: ["packages/cli/src/web-experience-check.ts"]
  real:
    testFile: "packages/cli/src/web-experience-check.test.ts"
    sourceFile: "packages/cli/src/web-experience-check.ts"
    scope:
      testGlobs: ["packages/cli/src/web-experience-check.test.ts"]
      sourceGlobs: ["packages/cli/src/web-experience-check.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
---

# Skip and fallback are first-class from the first increment — machine-guarded

**Outcome —** A parent-side gate, `check:web-experience`, fails when the experience entry page lacks
the persistent **skip-to-calm** affordance marker or the **`prefers-reduced-motion` / no-WebGL
fallback** marker, or when any module statically reachable from the Act 1 entry imports the R3F
island or `three`. Absent an experience entry, the check SKIPs — so the guard lands BEFORE the
storm and fails closed the moment the storm exists.

**Depends on —** (root — deliberately upstream of `act1-terminal-storm`: the storm may only face
real visitors once these exits are machine-guarded. Owner decision 6, 2026-07-02.)

> **Proof status (honest) — BUILT, leaf-proven; the authored status stays `proposed`.** The gated
> SDK leaf authored `web-experience-check.test.ts` red (module-not-found) → `web-experience-check.ts`
> green through the real prove-it-gate (run `real-mr2tjkid`, signed PASS @ `fc9b20f` 2026-07-02,
> persisted to `events.verdict`; package typecheck + suite observed green in the installed worktree);
> the four contracts are cited at real `file:line` below (`storytree coverage
> experience-rollout-guardrails` → 4/4). The orchestrator glue is landed: the root
> `check:web-experience` script, its `pnpm gate` slot, and the CI step after "web engine in sync" —
> verified against the real pinned site (bootstrap SKIP at that pre-storm pin — no entry marker yet;
> ARMED + OK since the 2026-07-02 home flip put all three markers on the entry page). The ADEQUACY of the
> exits (does the fallback read as a real calm view; does the skip land well) stays human —
> story-UAT leg 3 — the gate guards PRESENCE and the no-WebGL floor, which is exactly what a machine
> can honestly hold; `healthy` stays earned, never authored (ADR-0020).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: one cohesive guard — the marker contract, the
import-reachability walk, and the bootstrap allowance form a single judge with one verdict, proven
by integration over fixture site-trees, not one isolated assertion.

THE MARKER CONTRACT (the `data-grounds` precedent, ADR-0056). The experience entry declares its
exits as attributes the judge greps structurally: `data-experience-skip` on the persistent
skip-to-calm control and `data-experience-fallback` on the reduced-motion / no-WebGL path. Markers
are cheap for the site, stable across redesigns, and honest about what a static check can know —
presence, not adequacy.

THE ADOPTION MARKER (as built). A page under `src/pages/` becomes "the experience entry" by
carrying **`data-experience-entry`** (`EXPERIENCE_ENTRY_MARKER`,
`packages/cli/src/web-experience-check.ts:196`) — the explicit signal that ARMS the gate. Detection
must be this explicit: keying on a page PATH (e.g. `index.astro` exists) would have armed the gate
against the pre-experience site and redded every increment until the storm lands. The storm cap
adds all THREE markers when it flips home; the closure walk is seeded at the entry page itself (the
storm's script graph hangs off its imports, resolved extensionless-tolerant via
`withExtensionFallback`, `web-experience-check.ts:215`).

THE NO-WEBGL-IN-ACT-1 WALL ([ADR-0216](../../docs/decisions/0216-act-1-experience-attested-overwhelm-finale-transform-frozen.md) D2/D4 — tech split + "the exhale buys the load"). Act 1 is
plain DOM/CSS + canvas + Web Audio; the R3F bundle may load ONLY at the inflection. The judge walks
static import edges from the Act 1 entry module (the storm's script entry) and reds if the closure
reaches `three`, `@react-three/*`, or the synced `forest-world-r3f` dir. Dynamic `import()` behind
the inflection is the sanctioned lazy-load seam and is NOT counted — the wall is against STATIC
reachability (the thing that would drag WebGL into first paint).

THE BOOTSTRAP ALLOWANCE (the `check:web-engine` posture). No experience entry in `web/` yet → SKIP
with a note, never a failure — the site has not adopted the experience. The moment the entry
exists, every rule fails closed. An absent `web/` submodule follows the established local-SKIP /
CI-fail posture.

FENCES — what this gate must NOT become: no pixel/appearance assertions (operator-attested,
ADR-0070); no performance budget (an open owner call — story open call 3); no page-copy rules
(`check:web-grounding` owns claims). One narrow job: the exits exist and Act 1 stays WebGL-free.

## Integration test

**Goal —** Prove the pure judge over fixture site-trees: missing markers red, static R3F
reachability from Act 1 reds, the faithful fixture greens, the empty fixture SKIPs.

1. Fixture with an entry page carrying both markers and an Act 1 module graph that never touches
   R3F → assert GREEN (no findings).
2. Remove `data-experience-skip` → assert one finding naming the entry + the missing marker; same
   for `data-experience-fallback`.
3. Add `import { ForestWorldCanvas } from "../lib/forest-world-r3f/..."` (or `from "three"`) to a
   module statically reachable from the Act 1 entry → assert a finding naming the import CHAIN; move
   the same reference behind a dynamic `import()` → assert green (the sanctioned lazy-load seam).
4. Fixture with NO experience entry → assert SKIP (bootstrap allowance), not a failure.

## Contracts (4)

Each one isolated automated test in `packages/cli/src/web-experience-check.test.ts` (`node:test`,
offline, fixture trees). Per ADR-0122 each contract id leads a distinctly-named test so
`storytree coverage experience-rollout-guardrails` reports 4/4.

1. **`erg-skip-marker-required`** — the storm is never a toll booth
   - **asserts —** an experience entry without the `data-experience-skip` marker reds with the page
     named; present → no finding.
   - **covers —** `packages/cli/src/web-experience-check.ts:41` (`findExperienceMarkers`) via
     `checkExperienceEntry:154`, page-tagged by `checkExperienceSite:250`
2. **`erg-fallback-marker-required`** — reduced-motion / no-WebGL visitors get the calm view
   - **asserts —** an experience entry without the `data-experience-fallback` marker reds with the
     page named; present → no finding.
   - **covers —** `packages/cli/src/web-experience-check.ts:41` (`findExperienceMarkers`, the
     `hasFallback` half) via `checkExperienceEntry:154`
3. **`erg-act1-static-closure-is-webgl-free`** — the R3F bundle loads only at the inflection
   - **asserts —** a static import chain from the Act 1 entry to `three` / `@react-three/*` / the
     synced r3f dir reds with the chain named; the same target behind dynamic `import()` is green.
   - **covers —** `packages/cli/src/web-experience-check.ts:64` (`extractStaticImports`, the
     static/dynamic split), `:88` (`isWebGlSpecifier`), `:122` (`walkStaticClosure`)
4. **`erg-absent-experience-skips`** — the guard lands before the storm
   - **asserts —** a site tree with no experience entry yields SKIP (not red, not green-silent), so
     the gate can merge in increment B without holding the site hostage.
   - **covers —** `packages/cli/src/web-experience-check.ts:250` (`checkExperienceSite`, the
     bootstrap-SKIP branch at `:254`)

## Guidance — the slice that earns the signed verdict

The bootstrap rung (ADR-0057 §3, NET-NEW): author the pure judge, test-first.

- **The new test —** `packages/cli/src/web-experience-check.test.ts` (`node:test` +
  `node:assert/strict`, in-memory fixture maps — mirror `web-engine-sync.test.ts`'s discipline).
  Import the judge from `"./web-experience-check.js"`. Name each test for its contract id (`erg-…`).
- **The RED the spine observes —** module-not-found: `web-experience-check.ts` does not exist at
  HEAD.
- **The GREEN —** write the pure judge (`(files: Map<path, content>, config) → findings | skip`).
  The IO shell + the root `check:web-experience` script + the `pnpm gate` slot follow as
  orchestrator glue; after the leaf, the `@storytree/cli` suite + typecheck stay green.

Rules:

- **Presence, not adequacy** — the gate greps markers and walks imports; a human witnesses the feel
  (story-UAT leg 3). Do not author appearance assertions here.
- **Static reachability only** — dynamic `import()` is the sanctioned inflection seam; counting it
  would outlaw the design.
- **SKIP is loud** — the bootstrap allowance prints why, so a silent no-op can never masquerade as
  green.
- **Pure judge / IO shell split** — no `node:fs` in the judge; the shell reads the real `web/` tree.
