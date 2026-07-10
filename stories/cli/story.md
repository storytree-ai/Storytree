---
id: "cli"
tier: story
title: "The CLI — one agent-facing command surface that wires every organism together"
outcome: "Every organism is reachable through one agent-facing CLI that hydrates credentials, dispatches by verb to the owning organism, and returns a typed envelope/exit code — the composition root that wires the system into one command."
status: proposed
proof_mode: UAT
# Per-leg witness: the three offline command legs are machine-witnessed by the CLI suite and bind to
# cli#gate-1. The live `--pg` credential-hydration + pull has no standing suite that runs it (the DB
# path is skipped by default), so that leg is human-witnessed. With a mixed UAT the story-level
# `uat_witness` stays absent → human (ADR-0040); the crown derives from the per-leg roll-up.
capabilities: [unified-command-dispatch, cli-resident-corpus-tools, organism-boundary-tooling]
# The CLI is the wiring HUB: it imports every organism to surface it. Those outbound edges
# (cli → drive-machinery / library / notice-board / store) are declared PROVIDER-SIDE on each spoke
# (their `consumed_by: [cli]`, ADR-0074 §4) so the hub stays de-noised and each organism owns its
# "wired into the CLI" edge — hence `depends_on: []` here. Nothing imports the CLI, so `consumed_by`
# is empty (the invariant the old "nothing may depend on the wiring layer" rule encoded).
depends_on: []
consumed_by: []
# ADR-0102 (owner-directed 2026-06-25): the CLI is a SOURCE hub — it depends on nearly every
# organism (declared provider-side on each spoke as `consumed_by: [cli]`) and is depended-on by
# almost nothing. Rendered as a shared island it AGGLOMERATES a dense "city" of its dependencies'
# icons; any consumer carrying cli's rare icon would make the coupling MORE visible, not hidden
# (ADR-0074 §1). (Since ADR-0112 §3 dropped studio's `cli` dependency, cli has no inbound consumer
# edge today — it is a pure source.) The graph is unchanged: only the render flips
# (depends_on / consumed_by above stay as-is). Build behind `?buildings`; appearance owner-attested.
render: building
# Deciding ADRs (ADR-0037 §2): the choose-your-own-adventure CLI (23), the atomic ADR-number
# allocator the CLI hosts (50), CLI-as-a-first-class-hub-organism (74), the shared-island
# per-island-icon-stamp render (102), and the drive-package extraction that moved the build/orchestrate
# drivers out of cli into @storytree/drive (cli now depends on + re-exports them, 112).
decisions: [23, 50, 74, 102, 112]
---

# The CLI — one agent-facing command surface that wires every organism together

**Outcome —** Every organism is reachable through one agent-facing CLI that hydrates credentials,
dispatches by verb to the owning organism, and returns a typed envelope/exit code — the composition
root that wires the system into one command.

This is storytree's **command hub** ([ADR-0023](../../docs/decisions/0023-library-cli-choose-your-own-adventure.md)
the choose-your-own-adventure surface). `packages/cli` is the thin shim every agent talks to:
`main.ts` parses args, hydrates credentials (`secrets.ts`), dispatches by verb, and maps the result
to a typed `Envelope` + exit code. It imports **every** organism to surface it — library explore/edit,
the node/story build drive (since ADR-0112 the drivers live in `@storytree/drive`, which `cli` depends
on and dispatches from `commands.ts`), the notice board, the tree, db control — which is exactly why it
is the wiring hub. `cli`'s `secrets.ts` / `build.ts` / `envelope.ts` are now thin back-compat shims
re-exporting `@storytree/drive` (so `@storytree/cli/build` and `@storytree/cli/secrets` are unchanged
for any existing importer).

**Why this is its own (hub) story now ([ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2).**
The CLI is the single most-connected package in the workspace. The v1 boundary gate classed it a
"composition root" and **exempted** its edges; ADR-0074 §2 rejects that — hiding the most-connected
node hides the most architecturally important relationships. The CLI is a **first-class hub
organism**: visible, its edges enforced, with this lightweight, expandable UAT (§3) and a declared
connection set (§4).

**The shim owns the wiring, not the journeys.** The deep per-domain journeys the CLI surfaces are
owned by their organism stories — the library CYOA is `library`'s [`library-cli`](../library/library-cli.md);
the board is `notice-board`'s [`noticeboard-cli`](../notice-board/noticeboard-cli.md) + tree-view;
the build drive is `drive-machinery`'s [`build-drive-cli`](../drive-machinery/build-drive-cli.md)
(since ADR-0112 a separate package, `@storytree/drive`, that `cli` depends on and re-exports — the
journey is `drive-machinery`'s either way, now behind a package boundary too).
This story owns the **connective tissue** that makes them one tool, plus the genuinely CLI-resident
authoring primitives (the corpus guard, the ADR frontmatter parser).

## Design floor

- **Thin shim, business logic upstream.** `main.ts` parses, dispatches, and maps to an exit code; it
  holds no domain logic — that lives in the organisms it imports (the V1 `standalone-resilient-library`
  thin-shim pattern). The CLI never runs inference.
- **Typed envelope everywhere.** Every command returns an `Envelope` (`ok` + payload + `next:`
  guidance, ADR-0023); failures are `ok:false` with guidance, mapped to a non-zero exit code.
- **Credentials auto-hydrate.** `secrets.ts` fills `CLAUDE_CODE_OAUTH_TOKEN` (the SDK leaf) and
  `STORYTREE_DB_USER` (the live `--pg` store) from `~/.storytree/secrets.json` when unset — env
  always wins. One rotation point; no env-var prefixes on `pnpm storytree …`.
- **Offline-safe by default; writes are `--pg`-gated.** Read/explore commands run offline against the
  in-memory seed; live writes refuse without `--pg` and a reachable DB (degrade with guidance, never
  a silent no-op).

## Capabilities (3)

Lightweight and **expandable** (ADR-0074 §3): the hub's own connective competence, NOT a re-derivation
of every per-domain command (those belong to the organism that owns the journey). The list grows one
case per real defect (`uat-proves-the-goal-not-the-surface`).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`unified-command-dispatch`](unified-command-dispatch.md) | `storytree <verb>` parses args, hydrates credentials, dispatches to the owning organism, and returns a typed `Envelope`/exit code; offline commands run with no DB. | mapped | — |
| 2 | [`cli-resident-corpus-tools`](cli-resident-corpus-tools.md) | The CLI-resident authoring primitives the gates build on: the `stories/` YAML corpus guard and the ADR frontmatter parser. | mapped | — |
| 3 | [`organism-boundary-tooling`](organism-boundary-tooling.md) | The pure organism-boundary analyser behind `check:boundaries`: the blocking subgraph judge (ADR-0074) + the non-blocking declared-edge drift report (ADR-0115) that derives a virtual story's real edges from its units' `sourceFile` imports. | mapped | — |

## Dependency graph (code-derived)

The CLI's real `@storytree/*` runtime imports (ADR-0010 §3) — all **cross-story** (it is the hub):

- `cli → drive-machinery` — since ADR-0112 the build/orchestrate drivers (`node-build.ts` /
  `story-build.ts` etc.) live in `@storytree/drive` (owned by `drive-machinery`); `cli` `depends_on`
  `@storytree/drive`, dispatches the drivers from `commands.ts`, and re-exports the build seam through
  its own `./build` (and `./secrets`) subpath for back-compat. The drivers drive `node build`/`story
  build` through the spine (`@storytree/orchestrator`) and the leaf (`@storytree/agent`).
- `cli → library` — `commands.ts` validates/upcasts library docs on every write.
- `cli → notice-board` — `noticeboard.ts` classifies presence staleness for the board surface.
- `cli → store` — `main.ts`'s `buildStore` swaps `PgLibraryStore` in under `--pg`.

These four outbound edges are declared **provider-side** on each spoke (`consumed_by: [cli]`,
ADR-0074 §4), so the hub is de-noised and `depends_on` here is `[]`. Substrate edges (always
allowed, §5): `cli → base`, `cli → proof-protocol`. The merged declared graph (depends_on ∪
consumed_by) is **acyclic** (ADR-0058): the CLI is a pure source — nothing imports it.

> **UI note (sequencing).** Because these edges are declared on the spokes' `consumed_by`, the CLI
> renders as an edgeless node in TODAY's forest (which reads `depends_on` only). That is intended:
> the hub spokes tangle a tree (ADR-0074 §6), so they are laid out de-noised by the **radial /
> solar-system world** (the live-library `solar-system-world` proposal, a separate frontend session
> that reads `consumed_by`). The edges are declared and gate-enforced now; the radial UI draws them.

## Story UAT

The integrated acceptance walkthrough that proves the whole `cli` organism end-to-end — *an agent
runs a few core commands* (ADR-0074 §3), the minimum that proves the goal. The three offline legs are
machine exercises bound to the CLI suite's observe gate. The live `--pg` credential-hydration + pull
has no standing test that runs rather than skips it, so it is human-witnessed until real machine proof
exists. The list is **expandable** — each real defect earns a permanent regression leg.

**Goal —** One agent reaches multiple organisms through the one binary: it explores the library
offline, is refused an offline write, and (DB up) pulls live — each command returning a typed
envelope.

1. **Dispatch + envelope, offline:** _(witness: machine)_ _(proof-gate: cli#gate-1)_ run `pnpm storytree library`. **Success —**
   the shim seeds an in-memory store and returns `ok:true` with the dashboard banner + a `next:`
   block — no DB needed.
2. **Reach another organism:** _(witness: machine)_ _(proof-gate: cli#gate-1)_ run `pnpm storytree tree drive-machinery`.
   **Success —** the same binary dispatches to the tree surface and renders the hierarchy offline
   (no presence lines, no error) — proving the verb router reaches a second organism.
3. **Write gate:** _(witness: machine)_ _(proof-gate: cli#gate-1)_ run `pnpm storytree library artifact new --file <doc.json>`
   WITHOUT `--pg`. **Success —** `ok:false` with "writes go to the shared store … run with --pg" and
   a non-zero exit — the offline-safe write gate.
4. **Credential hydration + live pull:** _(witness: human)_ with `pnpm db:up`, run `pnpm storytree
   library artifact <id> --pg` (no env prefix). **Success —** `secrets.ts` hydrated
   `STORYTREE_DB_USER`, the live read returned `ok:true` — the shim wired the live store in.

End state — multiple organisms reached through one binary, the envelope/exit-code contract held, and
the write gate + credential hydration proven.

## Reliability Gates

The CLI hub is **brownfield** (`status: mapped`): `packages/cli` has a real, passing, OFFLINE
automated suite that observationally verifies the dominant dispatch / envelope / write-gate / corpus-
guard behaviour (the live `--pg` leg is DB-gated and skipped by default), but storytree's own prove-
it-gate never DROVE those proofs red→green. So its honest path off `mapped` is **not** a fail-closed
`--real` Build over a mature artifact with no genuine live red — it is the author-declared
**reliability gates** below, observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
names (d.3 retired the status-blind Build for `mapped` stories). Distinct from `## Story UAT` above
(the integrated, expandable acceptance journey): the gates are the author's **expandable reliability
floor**, starting by adopting the existing green suite and GROWING a `_(gate: build-tests)_` gate (a
genuine red→green regression leg) the moment observation proves insufficient — a real dispatch/envelope
defect slips through, or the live `--pg` credential-hydration leg earns a standing offline test.

1. **The CLI hub's own suite is green** _(gate: observe)_ _(covers: unified-command-dispatch, cli-resident-corpus-tools, organism-boundary-tooling)_ `pnpm --filter @storytree/cli test`. The
   spine runs it at a clean committed HEAD and OBSERVES it green — the `run` verb dispatch + typed
   `Envelope` contract (**unified-command-dispatch**: `cli.test.ts` / `cli-aliases.test.ts` /
   `tree-dispatch.test.ts`), the offline-safe `--pg` write gate (a write refused offline with guidance,
   not a silent no-op), credential hydration (`secrets.ts`), the genuinely CLI-resident authoring
   primitives this story owns (**cli-resident-corpus-tools**: the `stories/` YAML corpus guard
   `scripts/validate-corpus.ts` and the ADR frontmatter parser `adr-frontmatter.ts`), and the
   organism-boundary analyser (**organism-boundary-tooling**: `boundaries.ts` / `boundaries.test.ts`,
   the pure judge behind `check:boundaries`) all pass offline (no DB, no API key) — then signs an
   `adopted` verdict (`storytree gate run cli#gate-1 --pg`). This observes the whole `packages/cli`
   suite, which is the connective-tissue behaviour this hub owns; the three caps above green via this
   gate's `(covers:)` (ADR-0097 §5); the deep per-domain journeys it
   surfaces are adopted by their own organisms' gates (`library`'s `library-cli`, `drive-machinery`'s
   `build-drive-cli`). The live `--pg` credential-hydration + pull (Story UAT leg 4) is DB-gated and
   skipped by default — it becomes a `build-tests` gate here if it ever earns a standing offline test.

Adopting this gate flips the hub off `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` stays `mapped`; the world's crown DERIVES green from the signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` AND every own-proof obligation (the three machine-witnessed Story
UAT legs bound to `cli#gate-1`, the human-witnessed live leg, and this reliability gate) is signed
([ADR-0082](../../docs/decisions/0082-per-test-uat-tests-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085). No single gate greens the story.

## Proof

**Honest status — `mapped` (brownfield), NOT `healthy`.** `packages/cli` has a real, passing,
offline automated suite (the dominant dispatch/envelope/guard behaviour is observationally verified;
the live `--pg` leg is gated and skipped by default). Per the glossary that is brownfield `mapped`
— storytree's prove-it-gate has not driven these red→green, so nothing here is `healthy`. The
live-DB credential-hydration + pull (step 4) is the `proposed`-flavoured, human-witnessed pocket.

## Open modeling calls (for the owner)

1. **Capability granularity.** The hub keeps **three** lightweight capabilities (dispatch shim +
   CLI-resident corpus tools + the organism-boundary analyser), deliberately NOT re-owning the per-domain
   command surfaces — those are their organisms' capabilities (`library-cli`, `noticeboard-cli`,
   `build-drive-cli`). The `organism-boundary-tooling` capability (ADR-0115) homes the previously-unbounded
   pure boundary judge (`boundaries.ts`) the CLI's `check:boundaries` builds on — genuinely CLI-resident
   (it rides the CLI's test surface), distinct from the corpus tools. Confirm this shim-vs-journey split.
2. **The connection-declaration shape (ADR-0074 §4) — settled in this increment.** The CLI's outbound
   edges are declared provider-side on the spokes (`consumed_by: [cli]`) to de-noise the hub; the gate
   covers a code edge when EITHER endpoint declares it. The trade is the UI-sequencing note above
   (the CLI's edges render in the radial world, not today's tree). See the PR for the rationale and
   the alternative (consumer-side `depends_on` on the CLI, visible-now but tree-tangling).
