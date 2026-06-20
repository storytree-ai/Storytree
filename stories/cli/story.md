---
id: "cli"
tier: story
title: "The CLI — one agent-facing command surface that wires every organism together"
outcome: "Every organism is reachable through one agent-facing CLI that hydrates credentials, dispatches by verb to the owning organism, and returns a typed envelope/exit code — the composition root that wires the system into one command."
status: mapped
proof_mode: UAT
# Agent-exercised: the UAT is an agent running a few core commands and reading the envelope, so the
# story is machine-witnessed (ADR-0040). Offline commands run with no DB; the live `--pg` legs are
# DB-gated like library/store's.
uat_witness: machine
capabilities: [unified-command-dispatch, cli-resident-corpus-tools]
# The CLI is the wiring HUB: it imports every organism to surface it. Those outbound edges
# (cli → drive-machinery / library / notice-board / store) are declared PROVIDER-SIDE on each spoke
# (their `consumed_by: [cli]`, ADR-0074 §4) so the hub stays de-noised and each organism owns its
# "wired into the CLI" edge — hence `depends_on: []` here. Nothing imports the CLI, so `consumed_by`
# is empty (the invariant the old "nothing may depend on the wiring layer" rule encoded).
depends_on: []
consumed_by: []
# Deciding ADRs (ADR-0037 §2): the choose-your-own-adventure CLI (23), the atomic ADR-number
# allocator the CLI hosts (50), and CLI-as-a-first-class-hub-organism (74).
decisions: [23, 50, 74]
---

# The CLI — one agent-facing command surface that wires every organism together

**Outcome —** Every organism is reachable through one agent-facing CLI that hydrates credentials,
dispatches by verb to the owning organism, and returns a typed envelope/exit code — the composition
root that wires the system into one command.

This is storytree's **command hub** ([ADR-0023](../../docs/decisions/0023-library-cli-choose-your-own-adventure.md)
the choose-your-own-adventure surface). `packages/cli` is the thin shim every agent talks to:
`main.ts` parses args, hydrates credentials (`secrets.ts`), dispatches by verb, and maps the result
to a typed `Envelope` + exit code. It imports **every** organism to surface it — library explore/edit,
the node/story build drive, the notice board, the tree, db control — which is exactly why it is the
wiring hub.

**Why this is its own (hub) story now ([ADR-0074](../../docs/decisions/0074-enforce-the-organism-boundary-gate-the-cross-story-dependenc.md) §2).**
The CLI is the single most-connected package in the workspace. The v1 boundary gate classed it a
"composition root" and **exempted** its edges; ADR-0074 §2 rejects that — hiding the most-connected
node hides the most architecturally important relationships. The CLI is a **first-class hub
organism**: visible, its edges enforced, with this lightweight, expandable UAT (§3) and a declared
connection set (§4).

**The shim owns the wiring, not the journeys.** The deep per-domain journeys the CLI surfaces are
owned by their organism stories — the library CYOA is `library`'s [`library-cli`](../library/library-cli.md);
the board is `notice-board`'s [`noticeboard-cli`](../notice-board/noticeboard-cli.md) + tree-view;
the build drive is `drive-machinery`'s [`build-drive-cli`](../drive-machinery/build-drive-cli.md).
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

## Capabilities (2)

Lightweight and **expandable** (ADR-0074 §3): the hub's own connective competence, NOT a re-derivation
of every per-domain command (those belong to the organism that owns the journey). The list grows one
case per real defect (`uat-proves-the-goal-not-the-surface`).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`unified-command-dispatch`](unified-command-dispatch.md) | `storytree <verb>` parses args, hydrates credentials, dispatches to the owning organism, and returns a typed `Envelope`/exit code; offline commands run with no DB. | mapped | — |
| 2 | [`cli-resident-corpus-tools`](cli-resident-corpus-tools.md) | The CLI-resident authoring primitives the gates build on: the `stories/` YAML corpus guard and the ADR frontmatter parser. | mapped | — |

## Dependency graph (code-derived)

The CLI's real `@storytree/*` runtime imports (ADR-0010 §3) — all **cross-story** (it is the hub):

- `cli → drive-machinery` — `node-build.ts` drives `node build`/`story build` through the spine
  (`@storytree/orchestrator`) and the leaf (`@storytree/agent`).
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
runs a few core commands* (ADR-0074 §3), the minimum that proves the goal. Every leg is an **agent
(machine) exercise** (`_(witness: machine)_`); the live `--pg` leg is DB-gated (CI is DB-free). The
list is **expandable** — each real defect earns a permanent regression leg.

**Goal —** One agent reaches multiple organisms through the one binary: it explores the library
offline, is refused an offline write, and (DB up) pulls live — each command returning a typed
envelope.

1. **Dispatch + envelope, offline:** _(witness: machine)_ run `pnpm storytree library`. **Success —**
   the shim seeds an in-memory store and returns `ok:true` with the dashboard banner + a `next:`
   block — no DB needed.
2. **Reach another organism:** _(witness: machine)_ run `pnpm storytree tree drive-machinery`.
   **Success —** the same binary dispatches to the tree surface and renders the hierarchy offline
   (no presence lines, no error) — proving the verb router reaches a second organism.
3. **Write gate:** _(witness: machine)_ run `pnpm storytree library artifact new --file <doc.json>`
   WITHOUT `--pg`. **Success —** `ok:false` with "writes go to the shared store … run with --pg" and
   a non-zero exit — the offline-safe write gate.
4. **Credential hydration + live pull:** _(witness: machine)_ with `pnpm db:up`, run `pnpm storytree
   library artifact <id> --pg` (no env prefix). **Success —** `secrets.ts` hydrated
   `STORYTREE_DB_USER`, the live read returned `ok:true` — the shim wired the live store in.

End state — multiple organisms reached through one binary, the envelope/exit-code contract held, and
the write gate + credential hydration proven.

## Proof

**Honest status — `mapped` (brownfield), NOT `healthy`.** `packages/cli` has a real, passing,
offline automated suite (the dominant dispatch/envelope/guard behaviour is observationally verified;
the live `--pg` legs are gated and skipped by default). Per the glossary that is brownfield `mapped`
— storytree's prove-it-gate has not driven these red→green, so nothing here is `healthy`. The
live-DB credential-hydration + pull (step 4) is the `proposed`-flavoured pocket.

## Open modeling calls (for the owner)

1. **Capability granularity.** I kept the hub to **two** lightweight capabilities (dispatch shim +
   CLI-resident corpus tools), deliberately NOT re-owning the per-domain command surfaces — those are
   their organisms' capabilities (`library-cli`, `noticeboard-cli`, `build-drive-cli`). Confirm this
   shim-vs-journey split.
2. **The connection-declaration shape (ADR-0074 §4) — settled in this increment.** The CLI's outbound
   edges are declared provider-side on the spokes (`consumed_by: [cli]`) to de-noise the hub; the gate
   covers a code edge when EITHER endpoint declares it. The trade is the UI-sequencing note above
   (the CLI's edges render in the radial world, not today's tree). See the PR for the rationale and
   the alternative (consumer-side `depends_on` on the CLI, visible-now but tree-tangling).
