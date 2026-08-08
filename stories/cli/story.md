---
id: "cli"
tier: story
title: "The CLI — one agent-facing command surface that wires every organism together"
outcome: "Every organism is reachable through one agent-facing CLI that hydrates credentials, dispatches by verb to the owning organism, and returns a typed envelope/exit code — the composition root that wires the system into one command."
status: proposed
proof_mode: UAT
# Per-leg witness (re-adjudicated 2026-07-25, ADR-0209 D8): ALL FOUR legs are machine-witnessed —
# every success condition here compiles (envelope fields, exit codes, an env var, a refusal string).
# The three offline legs bind to cli#gate-1. Leg 4 (live `--pg` hydration + pull) is machine but
# deliberately UNBOUND: no harness runs it yet, and `resolveWitness` fails CLOSED on a machine leg
# with no `(proof-gate:)` → `coverage: "refused"`, so no adopt pass can observe-sign it (that is
# exactly what happened on 2026-07-04 — see the leg's note). "Not yet harnessed" is a harness
# statement, never a judgment gap (`human-witness-is-a-judgment-gap-not-cost`).
# `uat_witness` stays ABSENT on purpose: the roll-up is per-leg, and a story-level `machine` would
# re-open the blanket-adopt path that produced the stranded verdict. The crown derives per-leg.
capabilities: [unified-command-dispatch, cli-resident-corpus-tools, organism-boundary-tooling, arc-explicit-id-fidelity, guided-setup-repair, verification-decay-instruments]
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

## Capabilities (6)

Lightweight and **expandable** (ADR-0074 §3): the hub's own connective competence, NOT a re-derivation
of every per-domain command (those belong to the organism that owns the journey). The list grows one
case per real defect (`uat-proves-the-goal-not-the-surface`).

Rows 5 and 6 were authored 2026-08-08 by `capability-layer-coverage-arc` increment 5 over
already-implemented, already-tested code. Both are **CLI-resident competences that are neither
wiring nor authoring** — the third kind `organism-boundary-tooling` already OCCUPIES as a live
capability in the tree, entered on that same footing and not widening it. Read "occupies", not
"admitted": open modeling call 1 below NAMES that capability but ends "Confirm this shim-vs-journey
split", so the call is still OPEN and these two rows neither resolve it nor lean on it being
resolved. Neither re-derives a
per-domain command surface, because neither has an owning organism: one diagnoses the DEV'S OWN
MACHINE, the other judges the repo's verification apparatus, and no story in the tree owns either
subject.

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`unified-command-dispatch`](unified-command-dispatch.md) | `storytree <verb>` parses args, hydrates credentials, dispatches to the owning organism, and returns a typed `Envelope`/exit code; offline commands run with no DB. | mapped | — |
| 2 | [`cli-resident-corpus-tools`](cli-resident-corpus-tools.md) | The CLI-resident authoring primitives the gates build on: the `stories/` YAML corpus guard and the ADR frontmatter parser. | mapped | — |
| 3 | [`organism-boundary-tooling`](organism-boundary-tooling.md) | The pure organism-boundary analyser behind `check:boundaries`: the blocking subgraph judge (ADR-0074) + the non-blocking declared-edge drift report (ADR-0115) that derives a virtual story's real edges from its units' `sourceFile` imports. | mapped | — |
| 4 | [`arc-explicit-id-fidelity`](arc-explicit-id-fidelity.md) | An agent scaffolding an arc with an explicit id receives a refusal instead of creating an arc under a silently truncated id. | proposed | `unified-command-dispatch` |
| 5 | [`guided-setup-repair`](guided-setup-repair.md) | A dev's failing setup probe is driven to a re-verified repair, or to a secrets-redacted owner escalation naming why no installer step can fix it. | mapped | — |
| 6 | [`verification-decay-instruments`](verification-decay-instruments.md) | Every chartered verification instrument reports the decay it locates as a finding charged to the branch that authored it. | mapped | — |

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
> renders as an edgeless node in the forest (which reads `depends_on` only). The radial /
> solar-system world that was to draw them de-noised (ADR-0074 §6) is **retired** — ADR-0283 D2
> made DAG rows the one map layout, so nothing on the map draws `consumed_by` wiring today. The
> edges stay declared and gate-enforced; how they are eventually shown is an open UI question.

## UAT Test Criteria

The integrated acceptance walkthrough that proves the whole `cli` organism end-to-end — *an agent runs
a core command against the real thing* (ADR-0074 §3), the minimum that proves the goal.

**Goal —** One agent reaches the live library through the one binary, with no environment prefix: the
shim hydrates its credentials and wires the live store in, and the read comes back as a typed envelope.

One leg. The three offline legs that used to precede it (`library` dashboard, `tree <id>`, the
without-`--pg` write refusal) were each bound to `pnpm --filter @storytree/cli test` — the same command
that greens [`unified-command-dispatch`](unified-command-dispatch.md), whose own suite asserts all three
directly. Under ADR-0294 D2 that is the capability rung re-signed at the story rung, so they were deleted
on 2026-08-03 with the proving node named per criterion (table below;
`stories/uat-legacy-dispositions.json` records them `superseded`).

The three deleted criteria and the node that already proves each, for audit:

| deleted criterion | claim | proven at |
| --- | --- | --- |
| `uatc_fc00d80d290a86727a30e2eb` | *dispatch + envelope, offline* — `storytree library` seeds an in-memory store and returns `ok:true` with the dashboard banner + a `next:` block, no DB | [`unified-command-dispatch`](unified-command-dispatch.md) (capability) — `packages/cli/src/cli.test.ts`, *"library dashboard reports a total + categories and maps artifacts by id"* and the doctrine-pointer/`next:` tests; observed by gate-1 |
| `uatc_6488d065398e1216c9ae3d07` | *reach another organism* — the same binary dispatches to the tree surface and renders the hierarchy offline | [`unified-command-dispatch`](unified-command-dispatch.md) (capability) — `cli.test.ts`, *"tree focus `<id>` renders the node's outbound source refs"* and *"a node: ref renders as a Story node through the REAL binary, on both artifact surfaces"*; also `tree-dispatch.test.ts`; observed by gate-1 |
| `uatc_0230af87290a0b4ac797495a` | *write gate* — `artifact new` without `--pg` returns `ok:false` with "writes go to the shared store … run with --pg" and a non-zero exit | [`cli-resident-corpus-tools`](cli-resident-corpus-tools.md) (capability) — `cli.test.ts`, *"a write without --pg is refused with guidance (not an ephemeral write)"*; observed by gate-1 |

Every assertion above still runs under `pnpm --filter @storytree/cli test` and both capabilities still
green on it — the deletion removed a second signature at the story rung, not the evidence.


1. **Credential hydration + live pull:** _(witness: machine)_ with `pnpm db:up`, run `pnpm storytree _(criterion-id: uatc_dba01a60e8f19040a6732eea)_ _(revision-id: uatr1:b9554fd833374c8c)_ _(previous-revision-id: uatr1:a6be2db1ea9b6a79)_
   library artifact <id> --pg` (no env prefix). **Success —** `secrets.ts` hydrated
   `STORYTREE_DB_USER`, the live read returned `ok:true` — the shim wired the live store in.
   > **Witness re-adjudicated `human` → `machine` 2026-07-25 (ADR-0209 D8), deliberately UNBOUND.**
   > Both halves of the success condition compile: a populated `STORYTREE_DB_USER` is an assertion on
   > the environment, and `ok:true` is an envelope field. Nothing here is a judgment gap — the leg is
   > merely LIVE and unharnessed, which `human-witness-is-a-judgment-gap-not-cost` puts on the machine
   > rung. The prior `human` tag (set 2026-07-11, `9ae39cb6`) rested entirely on a harness statement —
   > "no standing suite that runs it … **until real machine proof exists**" — which concedes machine
   > proof is possible, and so disqualifies its own conclusion.
   > **No `(proof-gate:)` is asserted, and none may be added until a harness truly runs this.** Binding
   > it to `cli#gate-1` would be a rubber-stamp (ADR-0097 §2): that gate's command is `pnpm --filter
   > @storytree/cli test`, which does not exercise the live `--pg` path at all. Unbound, `resolveWitness`
   > fails CLOSED (`coverage: "refused"`) and no adopt can sign it. Under ADR-0295 D1 the honest witness
   > for it is a model driving this exact command against a live DB, not a new unit test.
   > **Known stranded verdict —** a `studio-adopt` run on 2026-07-04 observe-signed `cli#uat-4` as
   > `adopted`/pass at `c79fe948` (on main), citing evidence "observed green at a clean HEAD: `pnpm
   > --filter @storytree/cli test`". That evidence was never true for this leg: the CLI suite reports
   > **0 skipped** and contains no live-`--pg` test, skipped or otherwise. The row is a false green and
   > should be superseded when a real harness lands — it is recorded here, not silently reused.
   > **Half already covered, elsewhere —** the hydration half IS machine-proven today, by
   > `packages/drive/src/secrets.test.ts` (env-wins, exact key list) in the **`@storytree/drive`** suite,
   > not this story's gate. Only the live-read half is genuinely unharnessed — and that is exactly why
   > this leg is the one that survived ADR-0294: it has no lower-tier node that already proves it.

End state — the live store reached through one binary, credentials hydrated without an env prefix, and
the envelope contract held.
## Reliability Gates

The CLI hub entered as **brownfield**: `packages/cli` has a real, passing, OFFLINE
automated suite that observationally verifies the dominant dispatch / envelope / write-gate / corpus-
guard behaviour (no live-`--pg` test exists), but storytree's own prove-
it-gate never DROVE those proofs red→green. So its honest path off `mapped` is **not** a fail-closed
`--real` Build over a mature artifact with no genuine live red — it is the author-declared
**reliability gates** below, observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md),
resolving [ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork B). This is the `mapped → healthy` = **Adopt** transition
[ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md)
names (d.3 retired the status-blind Build for `mapped` stories). Distinct from `## UAT Test Criteria` above
(the integrated, expandable acceptance journey): the gates are the author's **expandable reliability
floor**, starting by adopting the existing green suite and GROWING a `_(gate: build-tests)_` gate (a
genuine red→green regression leg) the moment observation proves insufficient — a real dispatch/envelope
defect slips through, or the live `--pg` credential-hydration leg earns a standing offline test.

1. **The CLI hub's own suite is green** _(gate: observe)_ _(covers: unified-command-dispatch, cli-resident-corpus-tools, organism-boundary-tooling)_ `pnpm --filter @storytree/cli test`. The
   spine runs it at a clean committed HEAD and OBSERVES it green — the `run` verb dispatch + typed
   `Envelope` contract (**unified-command-dispatch**: `cli.test.ts` / `cli-aliases.test.ts` /
   `tree-dispatch.test.ts`), the offline-safe `--pg` write gate (a write refused offline with guidance,
   not a silent no-op), the genuinely CLI-resident authoring
   primitives this story owns (**cli-resident-corpus-tools**: the `stories/` YAML corpus guard
   `scripts/validate-corpus.ts`, and the `adr-health` checks over parsed ADR frontmatter,
   `adr-health.ts` / `adr-health.test.ts`), and the
   organism-boundary analyser (**organism-boundary-tooling**: `boundaries.ts` / `boundaries.test.ts`,
   the pure judge behind `check:boundaries`) all pass offline (no DB, no API key) — then signs an
   `adopted` verdict (`storytree gate run cli#gate-1 --pg`). This observes the whole `packages/cli`
   suite, which is the connective-tissue behaviour this hub owns; the three caps above green via this
   gate's `(covers:)` (ADR-0097 §5); the deep per-domain journeys it
   surfaces are adopted by their own organisms' gates (`library`'s `library-cli`, `drive-machinery`'s
   `build-drive-cli`). The live `--pg` credential-hydration + pull (UAT leg 4) is **not exercised by
   this gate at all** — it becomes a `build-tests` gate here if it ever earns a standing test.
   > **Scope correction 2026-07-25 (ADR-0209 D8).** Two citations above were stale and are fixed in
   > place. (i) *Credential hydration (`secrets.ts`)* was struck: since ADR-0112 `packages/cli/src/secrets.ts`
   > is a three-line re-export shim, and the real assertions live in `packages/drive/src/secrets.test.ts`
   > — the **`@storytree/drive`** suite, which this gate's command never runs. (ii) *The ADR frontmatter
   > parser `adr-frontmatter.ts`* was likewise never in this suite: ADR-0112 moved it to
   > `packages/drive/src/adr-frontmatter.ts`, tested by `packages/drive/src/adr-frontmatter.test.ts`.
   > What `packages/cli` genuinely owns is `adr-health.ts`, which judges already-parsed frontmatter from
   > injected fixtures — cited above in its place. (iii) The phrase *"DB-gated and skipped by default"*
   > was retired throughout: it implies a test exists that skips, and none does — this suite reports
   > **0 skipped** over 875 passing tests. The honest statement is that no live-`--pg` test exists.
   > `cli-resident-corpus-tools`' own capability text still names the ADR frontmatter parser; correcting
   > a capability's outcome is a story-shape call and is escalated, not taken here.

Adopting this gate flips the hub off `mapped` — **this already happened** (`studio-adopt`, 2026-07-04
at `c79fe948`; the flip landed in `98dc73e6`), which is why the frontmatter above reads
`status: proposed`, not `mapped`. `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the authored
frontmatter `status:` is never `healthy`; the world's crown DERIVES green from the signed verdicts
([ADR-0040](../../docs/decisions/0040-verdict-derived-green-and-the-human-witness-signpost.md)) and only
when every capability is `healthy` AND every own-proof obligation (the three machine UAT legs bound to
`cli#gate-1`, the fourth machine leg once a real harness binds it, and this reliability gate) is signed
([ADR-0082](../../docs/decisions/0082-per-test-uat-test-criteria-earn-green-by-declared-witness-story-uat.md) /
ADR-0083 Fork A + ADR-0085). No single gate greens the story.

## Proof

**Honest status — `proposed` (adopted brownfield), NOT `healthy`.** `packages/cli` has a real, passing,
offline automated suite (the dominant dispatch/envelope/guard behaviour is observationally verified;
no live-`--pg` test exists). storytree's prove-it-gate never drove these red→green, so nothing here is
`healthy`. The live-DB credential-hydration + pull (leg 4) is the unharnessed pocket — machine-witnessed
since the 2026-07-25 re-adjudication, but deliberately unbound.

**Signed state on record (probed live 2026-07-25).** Five `adopted`/pass verdicts exist for this story
— `cli#gate-1` and `cli#uat-1..4` — all from run `studio-adopt:2026-07-04T01:18:08.072Z` at
`c79fe948` (an ancestor of `main`), signer `spine@storytree`, approved by `hua.mick@gmail.com`. There
are **no** `operator-attested` verdicts and **no** `events.attestation` rows for any `cli#` id. Two
honesty notes: (i) the `cli#uat-4` row is the stranded false green documented on leg 4 — it was signed
while that leg still read `witness: machine`, before the 2026-07-11 flip to `human` that this
re-adjudication reverses; (ii) `apps/studio/data/unit-status.json` currently contains **no** `cli#`
entries despite these five verdicts, so the generated offline status view is stale for this story
(regenerate with `pnpm build:status`). Neither is repaired here — recorded, not reused.

## Open modeling calls (for the owner)

1. **Capability granularity.** The hub keeps a small set of lightweight capabilities (dispatch shim +
   CLI-resident corpus tools + the organism-boundary analyser), deliberately NOT re-owning the per-domain
   command surfaces — those are their organisms' capabilities (`library-cli`, `noticeboard-cli`,
   `build-drive-cli`). The `organism-boundary-tooling` capability (ADR-0115) homes the previously-unbounded
   pure boundary judge (`boundaries.ts`) the CLI's `check:boundaries` builds on — genuinely CLI-resident
   (it rides the CLI's test surface), distinct from the corpus tools. Confirm this shim-vs-journey split.
   *(Corrected in place 2026-08-08 by the pre-merge librarian pass, ADR-0139; the call itself is
   unchanged and still OPEN. This read "**three** lightweight capabilities", which the table above had
   already outgrown at four and this increment takes to six. The count was never the call — the
   shim-vs-journey SPLIT is — and re-stamping a number here every time a row lands is the churn
   ADR-0317's "read it live" instruction exists to prevent. The table above is the count.)*
2. **The connection-declaration shape (ADR-0074 §4) — settled in this increment.** The CLI's outbound
   edges are declared provider-side on the spokes (`consumed_by: [cli]`) to de-noise the hub; the gate
   covers a code edge when EITHER endpoint declares it. The trade is the UI-sequencing note above
   (the CLI's edges render in the radial world, not today's tree). See the PR for the rationale and
   the alternative (consumer-side `depends_on` on the CLI, visible-now but tree-tangling).
3. **`cli-resident-corpus-tools` no longer owns the ADR frontmatter parser (raised 2026-07-25).**
   That capability's outcome still reads "the `stories/` YAML corpus guard **and the ADR frontmatter
   parser**", but ADR-0112 moved the parser to `packages/drive/src/adr-frontmatter.ts` (tested in
   `@storytree/drive`'s suite). What remains CLI-resident is the corpus guard plus `adr-health.ts`,
   which judges already-parsed frontmatter. The gate leg's citation is corrected above; **restating a
   capability's outcome is a story-shape call, so it is escalated rather than taken.** Options, not
   chosen here: (a) narrow the capability's outcome to the corpus guard + `adr-health`; (b) keep the
   wording and let the capability formally span the drive-hosted parser, which would re-open a landlord
   question (ADR-0192). Owner or a scoped story-author pass should pick.
4. **The stranded `cli#uat-4` verdict needs an owner call (raised 2026-07-25).** A machine-observation
   `adopted` verdict sits on leg 4 citing evidence that was never true of it (see the leg's note). The
   re-adjudication makes the leg's *tag* honest again, but cannot unsign a row. Options, not chosen
   here: (a) leave it and let a future real harness supersede it; (b) record a superseding `fail`/void
   verdict now. Signing and voiding are both operator-granted — no agent may self-exempt.
