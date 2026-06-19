---
status: accepted
decided: 2026-06-19
amends: [74]
---
# ADR-0075: Model the shared ports as root organisms (collapse the substrate class)

## Status

accepted (2026-06-19) — the owner chose Option B ("proceed with B") of the
`oq-port-class-vs-root-node` open-question after a viability spike proved it green. Amends
[ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2/§5 (the two-class
model and the ports-as-blessed-substrate wording): there is now **one** package class, and the shared
ports are ordinary root organisms.

## Date

2026-06-19

## Context

[ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2 made a deliberate
call — *visibility over exemption*: the most-connected wiring nodes (`cli`/`store`) were taken OUT of
their "composition root" exemption and made first-class hub organisms, because hiding the
most-connected nodes hides the most architecturally important relationships. But that increment left
**one exemption standing**: the shared ports `@storytree/base` and `@storytree/verdict-contract` (the
universal `Store`/`ChangeStore` seam and the published verdict SHAPE) stayed a distinct **`substrate`
class** — anyone could depend on them with **no declared edge**, and the world never drew the
dependency. That is the same shape of "blessed invisible coupling" §2 had just rejected. ADR-0074 §5
even *described* the ports as "still declared and rendered" — but the gate as built **exempted** them
(the judge `continue`d on a substrate target), so it neither declared nor rendered the edges.

The owner asked which is right: keep the exempt `substrate` class (Option A), or model the ports as
ordinary **root organisms** every consumer declares `depends_on` against, exactly like the `library`
trunk (Option B)? The fork was captured as the live-library open-question `oq-port-class-vs-root-node`
and spiked on a throwaway branch. The spike's findings (against the real gate + the studio browser
build):

- **No cycle.** The ports are the pure bottom **sinks** of the dependency order — `verdict-contract`
  depends on nothing; `base` depends only on `verdict-contract`. Making them roots just makes an
  already-existing DAG explicit; the acyclicity check (ADR-0058) stays green.
- **Browser-safety is preserved without a dedicated rule.** Because the ports are universal bottom
  sinks (every organism transitively depends on them), any back-edge *from* a port *to* a real
  organism closes a cycle the gate already rejects. Empirically, `base → store` (store is
  browser-unsafe — it pulls `pg`) is caught **both** ways: undeclared ⇒ coverage violation; declared
  ⇒ `cycle: base → store → base`. The only residual risk — a port importing an *external* node-only
  npm package (e.g. `pg`) directly — is **identical under the old `substrate` class** (its rule only
  blocked `@storytree` organisms, never npm); the studio browser build is the real backstop either
  way.
- **Edge-noise is bounded.** Only the packages that actually import a port declare an edge
  (`library`, `drive-machinery`, `store` consumer-side; `cli` provider-side) — ~5 inbound to
  `verdict-contract`, ~3 to `base`. That is 2–3 root sinks with a handful of edges, exactly the
  hub-centrality the radial/solar world (ADR-0074 §6) lays out.

The crux: the old `substrate` class bundled **two** things — an edge **exemption** and a minimality
**guarantee**. Option B drops the exemption (honest declared edges) and keeps the guarantee almost for
free (acyclicity, because the ports are sinks). So the decision reduced to: should depending on a port
be a **visible declared edge** or an **invisible blessed exemption**? The owner chose visible.

## Decision

Collapse the `substrate` class. There is now **one** package class — `organism` — and the shared ports
are ordinary **root organisms**:

1. **The ports are root organisms.** `@storytree/base` and `@storytree/verdict-contract` each own a
   story ([`stories/verdict-contract`](../../stories/verdict-contract/story.md) `depends_on: []`;
   [`stories/base`](../../stories/base/story.md) `depends_on: [verdict-contract]`) with a lightweight,
   expandable UAT (ADR-0074 §3). They are classified as `organism` in `repo-manifest.json`
   `packageOwnership.organisms`, like every other package.
2. **Every port dependency is a declared edge — no exemption.** A consumer of a port declares the edge
   `depends_on`-side (the domain organisms: `library`, `drive-machinery`, `store`), or the port
   declares it `consumed_by`-side for the de-noised `cli` hub (the same pattern ADR-0074 §4 uses). The
   gate (`check:boundaries`) covers a port edge exactly as it covers any other cross-organism edge —
   so the dependency is **visible in the world**, honouring ADR-0074 §5's own "declared and rendered".
3. **One explicit minimality rule keeps the ports browser-safe.** The manifest still marks the ports as
   the `foundational` subset (a subset of `organisms`, **not** a class), carrying one rule the gate
   enforces: **a foundational organism may only depend on another foundational organism**. This keeps
   `base`/`verdict-contract` zod-only / node+pg-free so the studio's browser bundle works — an
   offline, fast-fail canary that is belt-and-suspenders over acyclicity and the studio build.

The gate change is small: `packages/cli/src/boundaries.ts` drops the `substrate` exemption (and the
old `substrate → organism` rejection), adds the foundational-minimality rule, and the source-import
scan no longer special-cases port targets (every real port importer already declares the runtime dep).

## Consequences

- **The last invisible exemption is gone.** Depending on a port is now a declared, world-rendered
  edge; a new coupling to the shared vocabulary cannot hide. ADR-0074's promise ("bad architecture is
  visible by construction") is complete for the whole graph.
- **One uniform node kind.** Everything is an organism owned by exactly one story; some are roots. The
  two-class system is gone — the library can own the ports as plain story-documents.
- **The graph trunk shifts.** `verdict-contract` is now the bottom root the whole graph rests on (not
  `library`); `base` is the second root. This is more honest about what the foundational vocabulary
  is.
- **A small, bounded authoring cost.** Two new root stories + a handful of declared edges. Friction is
  aligned with visibility (each declared edge is exactly what draws the dependency in the world).
- **Browser-safety stays machine-checked**, now by an explicit `foundational`-minimality rule rather
  than an implicit class invariant — clearer, and independent of the acyclicity coincidence.

## What this does NOT change

- The ports stay **separate packages** (`packages/base`, `packages/verdict-contract`) — this is a
  dependency-graph *modelling* change, not a code move or a file→DB change (storage is orthogonal to
  ownership; the owner confirmed this is not a file-vs-DB question).
- The acyclicity rule (ADR-0058), the `depends_on`/`consumed_by` declaration shape (ADR-0074 §4), and
  the source-import scan (ADR-0074 v2) are unchanged in spirit — only the `substrate` exemption is
  removed.

## References

- [ADR-0074](0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) (the boundary gate;
  §2 visibility-over-exemption — amended here to cover the ports; §5 ports "declared and rendered" —
  now actually enforced), [ADR-0068](0068-make-the-organism-model-physical-real-story-isolation-and-th.md)
  (made the boundary physical; introduced `verdict-contract` as the first port),
  [ADR-0058](0058-cross-story-dependency-direction-the-no-cycle-rule-and-the-b.md) (the no-cycle rule
  that carries browser-safety here), [ADR-0010](0010-organism-model-story-bounded-context.md) (the
  organism model).
- Live-library open-question **`oq-port-class-vs-root-node`** (the A-vs-B analysis + viability spike
  the owner settled with "proceed with B").
- Gate: `packages/cli/src/boundaries.ts` (the pure judge — foundational-minimality rule),
  `packages/cli/src/check-boundaries.ts` (reads `packageOwnership.foundational`),
  `repo-manifest.json` `packageOwnership`.
