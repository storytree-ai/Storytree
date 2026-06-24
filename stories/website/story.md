---
id: "website"
tier: story
title: "The public website — the consuming surface that draws the forest-world look from the synced render core"
outcome: "The public site (the `storytree-web` subrepo) is a first-class node in the observability world: a CONSUMING SURFACE that renders the forest-world metaphor from the shared render core's SYNCED build artifact, never its source — so the public front door can never silently drift from the system, and its forest-world edge is a visible, enforced road. A sink at the top of the dependency order: it consumes `forest-world`, and nothing consumes it."
status: mapped
proof_mode: UAT
# Machine-judged: the public site exists and deploys (the `web/` submodule, here.now CD), so its proof
# is brownfield observe-and-sign (ADR-0085) — the two cross-repo drift gates below, OBSERVED green at a
# clean HEAD and signed into `adopted` machine verdicts. The FULL visual UAT (the ADR-0070 two-stage
# operator-attested appearance proof of the rendered site) is a human job, deferred — see "Open modeling
# calls". This thin wiring node proves the EDGE is live, not the pixels.
uat_witness: machine
# Lightweight + expandable (ADR-0074 §3 / ADR-0100 §"v2 — the website node"): this first node wires the
# site in as a surface with its render-core edge proven by the existing drift gates — no sub-capabilities
# yet. The site's content/pages (the corpus-grounded claims, the generated roadmap, the visual appearance)
# are the obvious next capabilities; named as open modeling calls below, authored when each lands.
capabilities: []
# A CONSUMING SURFACE, not a root (ADR-0100): the site consumes `forest-world`'s synced artifact, so it
# depends on the render core. By construction it consumes the BUILT OUTPUT, never the source (ADR-0066
# Decision 3 / ADR-0093 §3 / ADR-0056), so there is no package import to scan — the cross-repo analog of
# the import scan is the DRIFT GATE (`check:web-engine`), which is the mechanism that proves this edge is
# live (ADR-0100 §3). `forest-world` is a foundational root that depends on nothing, so this edge is
# trivially acyclic.
depends_on: [forest-world]
# A SINK (ADR-0100): nothing consumes the public website — it is the top of the dependency order, the
# project's front door. `[]` is the honest classification, not an omission.
consumed_by: []
# Deciding ADRs (ADR-0037 §2): the website-wiring decision / the route-by-material model / the
# artifacts-not-source boundary (66); the shared forest-world render core both surfaces draw from, and
# the sync-into-submodule + drift-gate mechanism (93); the consuming-surface model that brings the site
# into the boundary graph as a first-class node backed by its drift gate (100).
decisions: [66, 93, 100]
---

# The public website — the consuming surface that draws the forest-world look from the synced render core

**Outcome —** The public site (the `storytree-web` subrepo) is a first-class node in the observability
world: a CONSUMING SURFACE that renders the forest-world metaphor from the shared render core's *synced
build artifact*, never its source — so the public front door can never silently drift from the system,
and its forest-world edge is a visible, enforced road. A sink at the top of the dependency order: it
consumes `forest-world`, and nothing consumes it.

## What this surface is

The public website is **`storytree-web`**, a separate *public* repo vendored as the
[`web/`](../../.gitmodules) submodule — the system's front door. It renders the same forest-world look
the studio shows, but as build-time **string SVG** over its own fictional "Cohoot" demo data, in a
thin Astro page shell with its own here.now deploy rail (merge = publish). [ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
made it a tracked story so it stops being invisible; [ADR-0100](../../docs/decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)
brings it into the boundary graph as a first-class **consuming surface** — a node whose render-core
edge is rendered and enforced, exactly like an organism's, by the gate that already runs.

It draws the forest-world look from the shared render core
([`packages/forest-world`](../forest-world/story.md), [ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md))
as a **synced build artifact**: `pnpm sync:web-engine` copies the core's browser-safe sources into the
site's `web/src/lib/forest-world/` (each stamped `@generated`), and the site's thin string-SVG mapper
renders over that synced scene-graph. So a studio look change lands in the core and *flows* to the site
through one sync — the last hand-port already happened ([ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
Consequences). The mechanism is [`packages/cli/src/web-engine-sync.ts`](../../packages/cli/src/web-engine-sync.ts)
(pure; the CLI shell does the IO).

## Why it is a consuming surface — and why it ships no scanned package

The site consumes the core's **built output, never its source**
([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
Decision 3 / [ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
§3 / [ADR-0056](../../docs/decisions/0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)
— the boundary that keeps the private corpus out of the public repo). It is a *separate repo*, not a
workspace package, so there is **no `package.json` dependency to scan** and the site is **not** listed
in `repo-manifest.json packageOwnership.surfaces` (which carries `apps/*` apps only — `studio` is the
first). It is a **declared story node** instead, and the cross-repo analog of the package-import scan
is the **drift gate**: `check:web-engine` is the mechanism that proves the `forest-world` edge is live
([ADR-0100](../../docs/decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)
§3 / §"v2 — the website node"). This is the deliberate difference between the two surface kinds: an app
surface's edge is a package import the boundary scan walks; this subrepo surface's edge is a synced
artifact a drift gate guards.

A surface is a **sink** ([ADR-0100](../../docs/decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)
Decision): it is never `foundational`, draws no inbound edge, and cannot close a cycle. The
`forest-world` it depends on is a foundational root that depends on nothing
([ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
§1), so `website → forest-world` is acyclic by construction — `pnpm check:boundaries` is green with
this (the website owns no package, so it draws no coverage obligation; the single edge points at a
root that points nowhere).

## Reliability Gates

The public site already exists and deploys, so there is no greenfield user JOURNEY to build red→green
here — its proof is brownfield **observe-and-sign** ([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B), machine-judged (the cross-repo drift checks are a machine's job, not a human attestation).
This node declares the two gates that ALREADY guard the site parent-side and flip it off `mapped`; both
run today in `pnpm gate`. The list is the **expandable floor** — the visual appearance proof and the
content/roadmap gates ([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
Decision 4) land as their own capabilities below, not before.

1. **The synced render core matches its source** _(gate: observe)_ `pnpm check:web-engine`. The spine
   runs the drift guard at a clean committed HEAD and OBSERVES it green — the site's
   `web/src/lib/forest-world/` synced copy is byte-identical (EOL-insensitive) to
   `packages/forest-world`'s browser-safe sources, with no stale leftover — then signs an `adopted`
   verdict (`storytree gate run website#gate-1 --pg`). This is the cross-repo analog of the organism
   import scan ([ADR-0100](../../docs/decisions/0100-bring-consuming-surfaces-apps-and-the-public-website-subrepo.md)
   §3): the drift gate is the mechanism that proves the `forest-world` edge is LIVE — a studio look
   change can't silently leave the public site stale, because a submodule bump must carry a fresh sync
   ([ADR-0093](../../docs/decisions/0093-shared-forest-world-render-core-for-studio-and-the-public-we.md)
   §3). Adopting this gate flips the surface off `mapped`; the world's crown derives green from the
   signed verdict ([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)).

2. **The site's claims are grounded in current ADRs** _(gate: observe)_ `pnpm check:web-grounding`. The
   spine runs the grounding guard at a clean committed HEAD and OBSERVES it green — every load-bearing
   claim the site carries a `data-grounds="ADR-NNNN"` attribute for resolves to a live, non-superseded
   decision in the corpus — then signs an `adopted` verdict (`storytree gate run website#gate-2 --pg`).
   This is the existing [ADR-0056](../../docs/decisions/0056-ground-the-public-website-s-claims-to-the-corpus-via-data-gr.md)
   wire ([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 4b): a cited ADR that goes missing or is fully superseded reddens the gate, so the public
   copy can't silently overclaim as the system moves.

## Proof

**Status off `mapped` is EARNED, not authored.** The public site already exists, deploys, and is
guarded by two real, passing, parent-side gates (`check:web-engine` + `check:web-grounding`, both in
`pnpm gate`) — that observational green is brownfield `mapped`. The surface leaves `mapped` exactly
when its two `observe` reliability gates above are **adopted**: the spine observes each gate green at a
clean committed HEAD and signs an `adopted` machine verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)).
`healthy` is non-authorable ([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md))
— the authored frontmatter `status:` stays `mapped`; the world crown DERIVES green from the signed
verdicts ([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)). Because the
crown greens only when ALL the surface's gates are healthy (and its capabilities — there are none yet
— [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork A), a green website crown will MEAN both the render-core edge and the claim-grounding are live.

## Open modeling calls (for the owner)

1. **The visual UAT is OUT OF SCOPE for this wiring node.** A website is fundamentally a **visual**
   artifact, and the full proof that the *rendered* public site looks right is the
   [ADR-0070](../../docs/decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
   two-stage appearance proof — geometry red→green plus an **operator-attested** screenshot nod against
   the live deployed site. That is a human-witness job ([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 5 — visual/copy/design stay human + orchestrator, fenced by design, not a gap). This thin
   node deliberately proves the **edge** is live (the synced core + grounded claims), not the pixels —
   the obvious next capability is the operator-attested visual UAT, authored when the
   `frontend-builder` drives it, not before.

2. **Capability granularity.** Kept to ZERO sub-capabilities for this first unit — wiring the surface
   in with its drift-gated render-core edge is one provable thing (ADR-0074 §3 lightweight-and-
   expandable). The obvious next capabilities are the site's **content/pages** as
   corpus-grounded claims ([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Decision 4a/4b), the **generated roadmap** projected from the story tier behind a `check:web-roadmap`
   drift gate (Decision 4c, NOT built), and the **visual appearance** proof (call 1) — author them as
   capabilities under this surface when each lands.

3. **Deploy stays on the web repo's here.now CD.** The public repo's `deploy.yml` (merge = publish)
   remains the deploy rail; folding web deploy into [`stories/ci-cd`](../ci-cd/story.md) is deferred
   ([ADR-0066](../../docs/decisions/0066-wire-the-website-into-the-system-a-tracked-corpus-grounded-s.md)
   Open call #2). If it unifies, `website` would gain a `depends_on: [ci-cd]` edge — check the direction
   is acyclic before adopting ([ADR-0058](../../docs/decisions/0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)).
