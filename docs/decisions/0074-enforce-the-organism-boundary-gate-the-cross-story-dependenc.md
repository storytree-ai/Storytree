---
status: accepted
load_bearing: true
decided: 2026-06-19
amends: [10, 68]
---
# ADR-0074: Enforce the organism boundary: gate the cross-story dependency graph and make it UI-visible

## Status

accepted (2026-06-19) — the model was settled with the owner in conversation on 2026-06-19 (an
earlier "exempt the wiring layer" recommendation was **rejected** — see Decision §2), and the owner
committed to it ("we're going all in on this") once the hub increment (§2–§5) landed (PR #234).
Operationalizes [ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 ("hidden cross-story
coupling is forbidden") and [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md)
(no cross-story cycles) from prose into a machine check, and completes
[ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md) (which made the
boundary *physical* but left it held by discipline, not a gate). The radial world (§6) is the one
remaining increment (the live-library `solar-system-world` proposal + the open forks below).

## Date

2026-06-19

## Context

ADR-0010 §3/§4 declared that cross-story coupling is legal **only** through a declared interface and
that "hidden cross-story coupling is forbidden" — but as **prose**, never machine-checked. ADR-0068
then dissolved `@storytree/core` and made the boundary physical (per-organism packages, `exports`
barrels, the `verdict-contract` port). That clean state was reached by **discipline + manual
verification**, not by a gate.

A 2026-06-19 audit (the ADR-0068 closeout) measured what is actually enforced:

- **Strong existing gates.** A package's `exports` map exposes only its barrel (`.`) plus a few named
  ports — no wildcards — so a deep import into another organism's internals fails to resolve
  (verified: `import … from "@storytree/orchestrator/src/proof/signer.js"` → `error TS2307`, red
  typecheck). pnpm refuses an **undeclared** `@storytree/*` import. `check:manifest` refuses a new
  top-level `packages/<x>` dir.
- **Gap A — declared barrel coupling is unchecked.** An agent can add `@storytree/other` to a
  `package.json`, import its **barrel**, and stay green — with **no** corresponding story
  `depends_on` edge. Nothing asserts the package-dep graph is a subgraph of the declared story graph.
  (Narrow extra hole: a cross-package **relative** import `../../other/src/…` sidesteps the `exports`
  map, and no boundary linter catches it.)
- **Gap B — the coupling is invisible in the UI.** The forest's `/api/tree` renders the
  **hand-authored** `depends_on` from `story.md` frontmatter (`readTree` → `spec.dependsOn`); the
  "code-derived" edge fields in the schema are **never auto-derived** (`commands.ts` calls derivation
  "a later slice"). So a new coupling does not appear in the world until a human edits the story.

Together, Gap A + Gap B are exactly the failure the owner named: *couple code across stories and have
it be invisible in the UI.* It is currently representable.

## Decision

Gate that **the real cross-package code-dependency graph is covered by a machine-checkable
per-organism declaration**, and render the *whole* graph in the observability world. Six parts.

### 1. Everything is a visible node; every edge is drawn

No package is hidden from the world. Every workspace package — including the wiring layer — is a node,
and every cross-package edge is rendered. Density is handled by **de-noising visually** (low-salience,
e.g. very thin, for the dense hub spokes), **never by dropping edges**.

### 2. The wiring layer (`cli`/`store`) is visible, not exempt

An earlier recommendation classed `cli`/`store` as "composition roots" *exempt* from the check, to
reduce noise. **Rejected (owner, 2026-06-19):** the world's whole job is observability, and the
connections to `cli`/`store` are exactly the signal you most want when an agent miswires something or
a brownfield system is badly architected. Hiding the most-connected nodes hides the most
architecturally important relationships. So `cli` and `store` are **first-class hub organisms** that
sit at the centre because everything connects to them — visible and **enforced**, not trusted.

*(The store half of this §2 promotion was later overtaken: `store` was DISSOLVED into the library —
[ADR-0077](0077-dissolve-the-store-into-library-shared-substrate-to-library.md) — so the standalone
`store` story, `@storytree/store` package, node, and UAT described in §§3–5 below no longer exist as
such. The `cli` hub modeling and the boundary gate stand; corrected in place per
[ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md).)*

### 3. Hub organisms carry lightweight, expandable UATs

`cli`/`store` are organisms, so they get a story + UAT — but UAT is pragmatic (owner, 2026-06-19):
"just do what you can." For `cli`, an agent runs some basic commands; for `store`, a successful pull
of some data. **Not every surface needs coverage** — UAT is a *basic list that grows as errors are
found*. Where a surface can't be exercised by an agent (generally UI surfaces) it is flagged a
**human UAT action** — reusing the existing machine/human witness ([ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md);
`uatWitness`).

### 4. Each organism owns ONE machine-checkable declaration of its connections

Every organism self-describes its full boundary in **one structured place** (so you needn't read
another package's `package.json` to know how it is wired): the edges it consumes **and** the edges by
which it is consumed (e.g. drive-machinery declares, in one structure, that it is wired into `cli`).
The declaration is **machine-checkable** — a structured edge list the gate diffs against the real
imports, never prose. (Exact field shape — extend `depends_on` with a provider-side `consumed_by`/
`exposes_to`, vs a single richer `connections` block — is settled in the build; see *does NOT decide*.)

### 5. The gate — `check:boundaries`

A deterministic, offline check (wired into `pnpm gate` + the CI verify job): every real cross-package
code edge must be **covered by a declaration on one of its endpoints**; an uncovered edge fails the
gate with a precise, fix-pointing message; the cross-story graph must be **acyclic** (ADR-0058).
Because the world renders the declared graph, forcing every code edge to be a declared edge also keeps
it UI-visible (Gap A and Gap B fall to one rule). The shared **ports** — `base`, `verdict-contract` —
remain the blessed universal seams (always an allowed target), still declared and rendered.

*(This §5 rule is CROSS-package-granular, so a hosted story — one whose proof-bound source files
live inside ANOTHER story's package, with no import boundary for it to catch — slips it.
[ADR-0192](0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md) adds the
hosted-story landlord rule (rule 5), closing that intra-package gap; additive — §5 stands unchanged
for cross-package edges.)*

### 6. The world renders the declared graph radially

With the hubs as central nodes everything connects to, a tree tangles; a **radial / hub-and-spoke
("solar-system") layout** with the hubs at the centre reads cleanly, and lets the dense hub spokes be
de-emphasised. Tracked as the live-library proposal **`solar-system-world`** (open fork there: a
wholesale reskin vs a hub-centric layout *within* the forest). The per-signal art vocabulary
([ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md), one-element-per-signal)
is preserved — the layout and the hub nodes change, not the signal mappings.

### Incremental scope

**v1 — the organism↔organism floor ([PR #231](https://github.com/HuaMick/Storytree/pull/231)).**
Shipped `check:boundaries` enforcing that an undeclared cross-organism `depends_on` coupling is red —
a correct subset of the model above. It classed `cli`/`store` as exempt "composition roots", a v1
implementation scaffold, *not* the end-state class of §2.

**v2 — the hub-organism increment (this PR; includes the v1 commits).** Removes the
`compositionRoots` exemption — there are now exactly **two** package classes, `organism` and
`substrate` (§2). `cli`/`store` are first-class **hub organisms**: each has a story + a lightweight,
expandable UAT (§3 — [`stories/cli`](../../stories/cli/story.md), [`stories/store`](../../stories/store/story.md);
machine-witnessed: cli runs core commands, store pulls live data). The per-organism connection
declaration (§4) is a new provider-side **`consumed_by`** story-frontmatter field complementing
`depends_on`; the gate covers a code edge when **either** endpoint declares it (consumer's
`depends_on` OR provider's `consumed_by`), checks the merged graph for acyclicity (ADR-0058), and now
enforces every edge **to and from** the hubs (`cli`/`store`), not just between the domain organisms.
The cli hub is de-noised by declaring its outbound edges provider-side on each spoke
(`consumed_by: [cli]`), so the hub's own `depends_on` stays empty.

**Remaining — the radial world (§6).** The hub spokes are declared and gate-enforced but, because
they live on the spokes' `consumed_by`, today's forest (which renders `depends_on`) shows the cli hub
as an edgeless node; the **radial / solar-system layout** (the live-library `solar-system-world`
proposal — a separate frontend session) reads `consumed_by` to draw the hubs centrally and de-noised.
This increment is the **data model** that world depends on; it does not build the UI.

## Consequences

- The collision class cannot silently re-form: a new cross-package coupling is **either** a declared
  (and therefore world-visible) edge **or** a red gate.
- Bad architecture becomes **visible by construction** — an organism reaching into persistence, or an
  agent wiring a surface it shouldn't, shows as an edge in the world (and is flagged if undeclared),
  rather than hiding in a `package.json`.
- Adding a real dependency costs one declaration line — and that line is exactly what draws the edge
  in the world. **Friction is aligned with visibility.**
- `cli`/`store` gain stories + (lightweight, growing) UATs — a small authoring cost that makes the
  wiring layer a first-class, provable part of the tree rather than an unexamined substrate.
- One more deterministic check in the offline gate + CI; needs no DB or API key.

## What this does NOT decide

- **The declaration field shape** — extend `depends_on` with a provider-side `consumed_by`/`exposes_to`,
  or a single richer `connections` block per organism. Settled in the build (must stay machine-checkable).
- The **per-edge rule matrix** — e.g. whether `organism → store` (domain reaching into persistence) is
  always a *flagged smell* or merely a declared edge.
- Whether the radial world is a **wholesale reskin** or a **hub-layout within the forest** (the
  `solar-system-world` proposal's open fork).
- ~~The narrow cross-package **relative-import** escape — caught by a v2 import scan (the v1 gate reads
  the package.json dep graph; `devDependencies` = test scaffolding, excluded per ADR-0010 §5).~~
  **CLOSED (2026-06-19, the v2 source-import scan).** `check:boundaries` now also scans every
  `packages/<x>/src/**.ts` for import/export specifiers (`packages/cli/src/check-boundaries.ts`
  gathers; the pure judge `packages/cli/src/boundaries.ts` classifies) and fails on two couplings the
  dep-graph rule can't see: **(a)** a cross-package **relative** import (`../../<other>/src/…`) that
  sidesteps both the `package.json` declaration and the `exports` barrel, and **(b)** a runtime
  (non-test) source file value-importing `@storytree/x` where `x` is only a `devDependency` (or
  undeclared) — a real runtime coupling invisible to the runtime dep graph. Test files and parity
  suites stay sanctioned scaffolding (ADR-0010 §5, skipped), and type-only imports (erased) are not
  treated as runtime couplings for rule (b).

## References

- [ADR-0010](0010-organism-model-story-bounded-context.md) §3/§4 (the boundary, prose — enforced here),
  [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) (no cross-story
  cycles — machine-checked here), [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md)
  (made the boundary physical — this gates it), [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md)
  (the machine/human UAT witness reused in §3), [ADR-0062](0062-the-forest-world-is-the-observability-layer-rendered-one-art.md)
  (the world is the observability layer; signal vocabulary preserved in §6),
  [ADR-0022](0022-ci-green-gate-and-auto-merge.md) (the CI gate this joins).
- Live-library proposal **`solar-system-world`** (the radial-world UI, §6).
- The 2026-06-19 boundary audit (ADR-0068 closeout): the `exports`-barrel `TS2307` proof; the
  dep-graph-vs-`depends_on` gap (A); the UI-reads-`depends_on` gap (B). Owner conversation 2026-06-19
  (visibility-over-exemption; hub organisms; lightweight UATs).
