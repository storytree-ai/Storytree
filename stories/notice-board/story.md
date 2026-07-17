---
id: "notice-board"
tier: story
title: "The notice board is the claim ledger — one deterministic record coordinates parallel sessions and powers every observability surface"
outcome: "Parallel agent sessions coordinate through ONE deterministic ledger (`events.node_claim` + `claim_event`): graded claims (exploring / waiting / work) taken at workspace creation, an ordered queue with atomic promotion behind each work slot, cursor-once overlap deltas — and that same ledger powers every observability surface (forest map, studio dock, CLI board, statusline) so coordination and observability can never disagree."
status: proposed
proof_mode: UAT
# declare-presence + presence-store RETIRED by ADR-0200 (2026-07-16) — the self-reported presence
# declaration doc (`events.session`) is retired; the deterministic claim ledger IS the notice board now.
# They are dropped from this list (the desktop-build-mount convention for a retired cap under a live
# story); their spec files are kept as `status: retired` history (see the capabilities table below).
capabilities: [noticeboard-cli, tree-view, ambient-integration, verdict-glyphs]
# ADR-0077 U2 held: the notice-board owns its Postgres drawer behind ./store. Post-ADR-0200 that drawer
# is the CLAIM LEDGER (`packages/notice-board/src/store/claim-store.ts` — the graded PgClaimStore over
# `events.node_claim` + `events.claim_event`; `packages/notice-board/src/claim.ts` the pure half) rather
# than the retired presence drawer. It still deps @storytree/library (createPool/closePool via
# @storytree/library/store) ONLY — it rolls its OWN duck-typed pool/Store seam, not the
# @storytree/storage-protocol port (ADR-0078 phantom-dep cleanup).
# The drive extraction (ADR-0112) gave the drive a REAL code edge ON this organism: the noticeboard
# surface + the claim-at-declare wiring moved into @storytree/drive, which imports @storytree/notice-board.
# So the genuine direction is `drive-machinery -> notice-board` (declared in stories/drive-machinery/story.md
# depends_on). The ADR-0058 test the other way fails: notice-board does NOT need the drive's delivered
# outcome to pass its OWN UAT — @storytree/notice-board imports @storytree/library ONLY (the schema, the
# pure claim math, and the Pg drawer riding @storytree/library/store), and the UAT's spine-side legs are
# the DRIVE calling this board's ledger surface, i.e. drive consuming notice-board, never the reverse.
depends_on: [library]
# Provider-side inbound edge (ADR-0074 §4): the cli HUB organism imports @storytree/notice-board (the
# claim-ledger board + grade bands + the `storytree noticeboard` / `worktree create` surfaces). The store
# hub also imports it, declared consumer-side in stories/store/story.md depends_on; the cli edge is
# declared here to de-noise the hub.
consumed_by: [cli]
# Studio render hint (ADR-0076 / ADR-0088 / ADR-0102): the notice board is shared coordination
# infrastructure consumed by nearly everything — lifted into the Shared Islands panel like `library`/`cli`
# (consumers carry its icon stamp, ADR-0102, instead of roads). The graph is unchanged — depends_on /
# consumed_by stay as-is; only the render flips. Appearance owner-attested (ADR-0070); `?buildings=off`
# restores the island.
render: building
# Deciding ADRs (ADR-0037 §2): 200 is the re-decision this story now realises (the noticeboard is the
# claim ledger; presence retired); 33 is the origin it amends (the board survives — worktree-derived
# identity and the never-blocking automation contract stand; the presence declaration doc is retired).
decisions: [200, 33]
---

# The notice board is the claim ledger

**Outcome —** Parallel agent sessions coordinate through **ONE deterministic ledger**
(`events.node_claim` + its `claim_event` audit log): **graded claims** — `exploring` (shared, taken
at session start, carries the intent prose) / `waiting` (the ordered queue behind a work slot, with
atomic promotion of the oldest live waiter on release) / `work` (the exclusive mutex, hard refusal
names the holder) — taken at **workspace creation**, liveness on one trace-driven heartbeat clock, and
**cursor-once overlap deltas** riding outputs the agent already reads. That same ledger **powers every
observability surface** — the forest map, the studio dock, the CLI board, the statusline — so
coordination and observability can never disagree, because there is one record and it is the one that
structurally can't lie (PK-enforced, audited, machine-cleared, trace-aged).

This is the **coordination** organ, re-decided by
[ADR-0200](../../docs/decisions/0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md)
(the deciding ADR; it amends [ADR-0033](../../docs/decisions/0033-session-presence-notice-board.md),
the origin). ADR-0033's answer to "sessions can't see across worktrees" was a self-reported *presence
declaration* (`events.session`: prose + derived staleness bands + a zombie reaper). ADR-0200 found that
advisory layer *not useful* — every catalogued owner interrupt and false signal traced to it, none to
the claim — and unified coordination + observability onto the **claim ledger** that was already keeping
the deterministic lock. The board survives; its *data model* changed.

## What retired, and what stands (ADR-0200)

- **RETIRED — the self-reported presence layer.** The presence declaration doc (`events.session` +
  `events.session_event`), its derived staleness bands, and the possibly-dead reaper
  ([ADR-0079](../../docs/decisions/0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md) /
  [ADR-0141](../../docs/decisions/0141-ambient-presence-heartbeat-never-resurrects-a-retired-sessio.md),
  both superseded by ADR-0200) are retired — no presence rows, no bands, no reaper. The two capabilities
  that built that layer — [`declare-presence`](declare-presence.md) and
  [`presence-store`](presence-store.md) — are **retired** (their spec files stay as history; see the
  capabilities table). The consumer removal already landed (wave 1: the studio `/api/presence`, the
  studio presence dock, the desktop mirror, the CLI board fallback, the hooks' declare/done, the
  statusline presence half); the presence **core** (`presence.ts`, `presence-store.ts`, `reaper.ts`) is
  deleted in the arc's **final** increment, gated on the owner's appearance-UAT attestation (ADR-0200 D7).
- **STANDS — the board's identity + never-blocking contract (ADR-0033, amended not deleted).** Identity
  is still the **worktree name** (derived, never typed); a board write never touches a blocking-capable
  hook (`Stop` / `PreToolUse` / `UserPromptSubmit`) and never fails the enclosing action; the store is
  live-DB only and degrades gracefully offline. These are the V1 hook-loop lessons, carried across.
- **STANDS — a build run never writes session presence
  ([ADR-0199](../../docs/decisions/0199-a-build-run-never-writes-session-presence.md)).** Generalised by
  ADR-0200 into "presence rows are not written at all." A build's footprint on the ledger is exactly its
  `building`/phase work-events (observability) plus its per-unit claim (coordination).

## Design floor (from ADR-0200)

- **One ledger.** `events.node_claim` + `claim_event` (with `events.work_event` for proof activity) is
  the noticeboard: the single coordination surface for agents AND the machinery behind every
  observability surface. There is one record to lie about, and it is the one that structurally can't.
- **Three claim grades, per-(unit, session) rows.** The PK is `(unit_id, session_id)`; exclusivity is a
  partial unique index on `unit_id WHERE grade='work'`. `exploring` is shared and carries the intent
  prose; `waiting` is the shared queue ordered by `claimed_at` with atomic promotion of the oldest live
  waiter on release; `work` is the exclusive mutex (unchanged from ADR-0121/0138 — hard refusal names
  the holder). A session may hold any number of claims at any grade; hoarding is mitigated by visibility
  and the heartbeat clock, never a hard cap.
- **Forced at start, via claim-gated workspace creation.** Sessions open on the primary checkout (the
  "lobby" — reads offline, nothing claim-gated works there) and obtain their workspace through
  `storytree worktree create --node <story>… --intent "<what>"`, which takes the exploring claim(s)
  FIRST (no claim, no workspace — ADR-0121's ordering generalised) and mints a self-describing worktree
  name. The enforcement ratchet: spawners we own call `worktree create`; hand-opened sessions get the
  SessionStart nudge; and `check:declared` FAILS (not warns) a session holding zero live claims — an
  unclaimed session cannot reach the merge ceremony.
- **Push is cursor-once deltas, never a schedule.** Each session holds a cursor over the sequenced
  `claim_event` log; deltas intersecting its own claim set are delivered ONCE, piggybacked on outputs the
  agent already reads (CLI envelope footers, gate output, the `worktree create` payload). The statusline
  stays the human's ambient state display (redrawn, not sent). No scheduled context injection exists —
  the never-blocking-hooks contract (ADR-0033 D3) holds.
- **Liveness is one trace-driven clock.** The 2 h heartbeat-staleness reclaim covers all grades;
  heartbeats are bumped by the loops' own activity. An abandoned exploring wisp fades on the same
  schedule as an abandoned lock. Machine clears stand: build completion releases `(unit, session)`; the
  CI merge releases by branch.
- **Views, not stores.** The forest map renders claims by grade (hover / queued / orbit) by default; the
  studio dock is claims-grouped-by-session; the CLI board renders the ledger; the statusline reads it.
  The ADR-0138 §5 honesty wall is untouched — no claim state is ever a proof (the proving colour + the
  verdict bloom stay work-event- and verdict-sourced).

## The claim ledger machinery (landed, arc incs 1–5)

The ledger machinery landed through the `noticeboard-claim-ledger-arc` (ADR-0183) and is proven by its
own offline + live-gated suites. It lives in the notice-board's territory (`packages/notice-board`) plus
the CLI (`packages/cli`); this section maps it so the story's living shape is honest (grounded in the
landed code, not a would-be plan). Where a piece is authored as a hosted-seam capability under the
[`wisp-as-story-claim`](../wisp-as-story-claim/story.md) render story (ADR-0192 landlord rule), the
cross-reference is named.

- **The graded claim ledger** — `packages/notice-board/src/claim.ts` (the pure half: `ClaimGrade`,
  `ClaimDoc`, `ClaimRequest`, the `exploring`/`waiting`/`work` request builders, `isReclaimable`,
  `oldestLiveWaiter`, `bumpHeartbeat`, `groupClaimsBySession`, `digestOverlapDeltas`, `foldDepartures`)
  and `packages/notice-board/src/store/claim-store.ts` (the `PgClaimStore`: `take` / `upgrade` /
  `downgrade` / `release` with atomic waiter promotion, `current` / `history`, `releaseClaimsByBranch`
  (the CI clear) / `releaseClaimsBySession` (done-releases), `bumpHeartbeat` /
  `bumpHeartbeatsBySession`, `pullOverlapDeltas`, `recentDepartures`). Proven by
  `packages/notice-board/src/claim.test.ts` and the live-gated
  `claim-store-grades.live.test.ts` / `claim-store-release-by-branch.live.test.ts` /
  `claim-cursor.live.test.ts` / `claim-departures.live.test.ts`. The claim-store's own build-time
  `releaseClaimsByBranch` proof is registered under the wisp story's
  [`claim-store-work-time`](../wisp-as-story-claim/claim-store-work-time.md) hosted-seam capability.
- **Claim-gated workspace creation** — `packages/cli/src/worktree-create.ts` +
  `worktree-create-command.ts`: `storytree worktree create` takes the exploring claim(s) FIRST, mints the
  self-describing worktree name, cuts off main, installs, and returns the start payload (claims taken +
  board digest). `storytree worktree prune`'s keep-signal is "the session holds live claims"
  (`packages/cli/src/worktree.ts`). The gate enforcement is `packages/cli/src/check-declared.ts`
  (`evaluateDeclared`) — zero live claims FAILS (ADR-0200 D3), any grade passes.
- **The ledger board + overlap deltas** — the `storytree noticeboard` CLI board renders the ledger
  grouped by session and grade (`groupClaimsBySession`), and delivers cursor-once overlap deltas
  (`pullOverlapDeltas` → `digestOverlapDeltas`) on CLI envelope footers. Authored as this story's
  [`noticeboard-cli`](noticeboard-cli.md) capability (see its ADR-0200 note).
- **The forest-map + dock renders** — the claim-grade wisps (hover / queue / orbit + departure fades)
  and the dock's claims-grouped-by-session are the render side, authored under
  [`wisp-as-story-claim`](../wisp-as-story-claim/story.md) (the map) and the studio dock. They read the
  ledger, never a presence row.

## Capabilities

Listed roots-first. Four capabilities carry the notice board's ORIENTATION + AUTOMATION surfaces over
the ledger; two presence capabilities are **retired** (ADR-0200) and kept as history. The authored
status stays `proposed` forever (ADR-0031: health is a projection of signed verdicts, never authored).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`noticeboard-cli`](noticeboard-cli.md) | `storytree noticeboard` renders the claim ledger — claims grouped by session and grade, with cursor-once overlap deltas; `declare`/`claim`/`worktree create` write with worktree-derived identity. | proposed | — |
| 2 | [`tree-view`](tree-view.md) | `storytree tree [<story>]` renders the work hierarchy offline and weaves the live ledger's claims in when the store is reachable. | proposed | `noticeboard-cli` |
| 3 | [`ambient-integration`](ambient-integration.md) | The board declares itself: the statusline glances the ledger and bumps the session's claim heartbeats; a build run NEVER writes session presence (ADR-0199); nothing notice-board-shaped sits on a blocking-capable hook. | proposed | `noticeboard-cli`, `tree-view` |
| 4 | [`verdict-glyphs`](verdict-glyphs.md) | `storytree tree` shows one signed-verdict glyph per node — ✓ proven / ✗ last run failed / – never built — read from `events.verdict` when the DB is up, silently absent offline (untouched by ADR-0200). | proposed | `tree-view` |
| ~~—~~ | ~~[`declare-presence`](declare-presence.md)~~ | **RETIRED by ADR-0200** — the presence declaration doc (`events.session`) is retired; the claim ledger is the coordination record now. Spec kept as history. | retired | — |
| ~~—~~ | ~~[`presence-store`](presence-store.md)~~ | **RETIRED by ADR-0200** — `events.session` (+ `session_event`) and the reaper are retired; `events.node_claim` + `claim_event` is the ledger. Spec kept as history. | retired | ~~`declare-presence`~~ |

## Story UAT (would-be)

**Goal —** Two parallel sessions and one operator coordinating through the ledger: each session is
forced onto the ledger at workspace creation, an `exploring` reader and a `work` holder never stomp each
other, a second work-claimant is refused (or queues and is promoted on release), overlap news arrives
once, a departed session reads as gone, a build leaves session presence untouched, and offline nothing
breaks.

1. **Forced claim at workspace creation.** Session A runs
   `storytree worktree create --node cite-event --intent "building cite-event"`. **Success —** the
   command takes an `exploring` claim on `cite-event` FIRST (no claim → no workspace), mints a
   self-describing worktree, and returns the start payload (claim taken + board digest); `events.node_claim`
   holds one exploring row keyed `(cite-event, <session>)`, `claim_event` one `claimed` row; identity was
   derived from the worktree, never typed.
2. **See the neighbour on the ledger.** Session B runs `storytree noticeboard --pg`. **Success —** the
   board lists session A grouped under its session with the `exploring` grade, its intent prose, and an
   age — read from the ledger, no presence row anywhere.
3. **Upgrade to work; a second work-claimant queues.** A upgrades its `cite-event` claim to `work`
   (`storytree noticeboard claim --node cite-event --pg`, or the build path). **Success —** the work slot
   is held; B, attempting the work claim on `cite-event`, is either **refused and told the holder** (A's
   session/branch/intent) or lands in the **`waiting` queue** — no second work row exists.
4. **Atomic promotion on release.** A releases (build completion or `noticeboard done`). **Success —** the
   store atomically promotes the oldest live waiter (B) to `work`, auditing a `promoted` `claim_event`;
   B now holds the slot with no race.
5. **Overlap deltas arrive once.** On B's next `--pg` envelope, the footer carries the cursor-once
   overlap digest ("session A took the WORK claim on cite-event", then later "released cite-event") — each
   event delivered ONCE, a session never told about its own events; a busy unit collapses to one digest
   line rather than flooding.
6. **Liveness + departure.** A live session's heartbeat is bumped by its own trace activity, so its claim
   never ages into the 2 h stale-reclaim window; when a holder releases, its row reads as a **departure**
   on the board/map for the departure window (not silently gone), then fades. An abandoned claim fades on
   the same clock as an abandoned lock — no reaper.
7. **A build leaves session presence untouched (ADR-0199).** `storytree node build <id> --real --store pg`
   writes only `building`/phase work-events plus its per-unit claim — ZERO `events.session` writes; the
   launching session's own claim survives its own build.
8. **Offline degrade + the gate wall.** With the DB down, `storytree tree cite-event` renders the hierarchy
   with no ledger block and no error; `storytree noticeboard`/`worktree create` refuse with guidance
   (`pnpm db:up`), exit non-zero, WITHOUT failing any enclosing hook. A session that holds zero live
   claims FAILS `check:declared` — it cannot reach the merge ceremony (ADR-0200 D3).

## Open modeling calls

Settled by ADR-0200 (owner-directed 2026-07-16), recorded in its `## Status`. The four ADR-0033 owner
decisions (staleness thresholds, the statusline heartbeat, verdict glyphs, shared hook installation) are
carried into the ledger world where still live: the heartbeat now bumps claim heartbeats
(`bumpHeartbeatsBySession`), the staleness clock is the single 2 h reclaim across all grades, and
[`verdict-glyphs`](verdict-glyphs.md) is untouched. The presence-specific decisions (the declaration
doc, the bands, the reaper) retired with the presence layer.
