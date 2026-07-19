---
status: accepted
load_bearing: true
decided: 2026-07-16
arc: noticeboard-claim-ledger-arc
amends: [33, 121, 138, 142, 143, 199]
supersedes: [79, 141]
---
# ADR-0200: The noticeboard is the claim ledger — forced session claims, presence retired

## Status

accepted (2026-07-16) — decided/directed by the owner in conversation on 2026-07-16, in the design
discussion that followed the ADR-0199 fix (design-time alignment IS ratification, ADR-0110). The
owner made the load-bearing calls recorded here: presence is *"not useful … advisory rather than
deterministic"*; the noticeboard should be *"a single surface coordination layer for agents as well
as observability on the forest — or at least the core machinery powering these two surfaces"*;
sessions are **forced to claim at start** (*"it can always release the claims if needed … this might
push us to better worktree hygiene"*); the exploring state renders as a wisp that *"hovers over the
story without moving … we capture intent"*; work claims *"push all other sessions to wait in line"*;
no scheduled notifications (*"a single, someone else is looking at this, and then never reports that
again"*); sessions start on main and **create their worktree through the storytree CLI**; worktree
names carry the story/arc slug; and the **retirement sweep is the arc's last increment, after UAT
attestation**. Built via the live `noticeboard-claim-ledger-arc` (ADR-0183 — the arc carries the
increment log).

**Amends** [ADR-0033](0033-session-presence-notice-board.md) (the board survives; its *data model*
changes — the presence declaration doc is retired; worktree-derived identity and the never-blocking
automation contract stand), [ADR-0121](0121-per-unit-write-claim-refuses-a-second-concurrent-build-of-on.md)
(claim-before-worktree generalises from builds to sessions), [ADR-0138](0138-the-wisp-is-a-forced-ci-cleared-story-claim-one-coordination.md)
(the claim gains grades; D2's hard-refuse stands for the work grade; "forced by guidance at spawn"
hardens into "forced by machinery at workspace creation"), [ADR-0142](0142-branch-dies-on-merge-the-wisp-survives-via-claim-at-declare.md)
(claim-at-declare becomes an upgrade on the ledger; the presence half of declare dies),
[ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md) (the nudge re-aims
at `worktree create`), and [ADR-0199](0199-a-build-run-never-writes-session-presence.md) ("presence
rows are written by sessions only" becomes "presence rows are not written at all").
**Supersedes** [ADR-0079](0079-possibly-dead-presence-rows-are-reaped-to-done-by-a-sweep.md) and
[ADR-0141](0141-ambient-presence-heartbeat-never-resurrects-a-retired-sessio.md) — both are
lifecycle machinery for the presence rows this ADR retires (they remained operative until the arc's
final increment landed the retirement on 2026-07-17, PRs #760–#766; their bodies stay as history).

## Context

After ADR-0199 removed the build's presence write, the review it shipped with
(`docs/research/notice-board-mechanics-review.md`) laid out the remaining architecture: THREE
overlapping records — `events.session` (advisory presence: self-reported prose, derived staleness
bands, zombie reaping), `events.node_claim` (the deterministic lock: PK mutex, audit trail, machine
clears), and `events.work_event` (proof observability) — rendered by surfaces that disagree. Every
catalogued owner interrupt and false signal traced to the advisory layer; none to the claim. The
map's canonical render (the claim wisp, ADR-0138 D1) is still parked behind a default-OFF flag; the
dock renders rows that can lie; `check:declared` warns off the wrong record; the forest is empty
while the system is busy.

The owner's verdict: the advisory layer is not useful — coordination and observability should be
two views over ONE deterministic machinery, and the forest's emptiness is itself a signal defect
("gut feel is the forest is too empty"). The design discussion resolved the standing tension in the
claim-only proposal (an unclaimed session would be invisible) by *forcing* sessions onto the ledger
at start — which requires the claim to grow a non-exclusive grade, or exploration would deny work.

## Decision

1. **One ledger.** `events.node_claim` + its `claim_event` audit log (with `events.work_event` for
   proof activity) is the noticeboard: the single coordination surface for agents AND the machinery
   behind every observability surface (forest map, studio dock, CLI board, statusline).
   `events.session` is retired — no session-presence rows, no staleness bands, no reaper.

2. **Three claim grades, per-(story, session) rows.** The PK becomes `(unit_id, session_id)`;
   exclusivity is enforced by a partial unique index on `unit_id WHERE grade='work'`:
   - **exploring** — shared (any number of sessions per story), taken at session start, carries the
     intent prose. Renders as a **hovering** wisp (stationary at the story): "someone is reading /
     planning here, and this is what they're thinking." *[The "stationary" half is REVERSED on
     purpose by [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md)
     (decided 2026-07-18, which cites this as the D7 render detail): window shopping now carries a
     small-radius orbit BESIDE the island, so the hover family MOVES. The exploring GRADE itself —
     shared, taken at session start, carrying the intent prose — is unchanged. BUILT in ADR-0212
     increment 2 (PR #828, 2026-07-18): the rest spot sits on a parent `g` and the orbit radius on a
     child `g`, because an SVG `animateTransform` rotate REPLACES the transform on the node it
     animates (`asset:stack-pixijs-react-studio`).]*
   - **waiting** — shared, ordered by `claimed_at`: the **queue** behind a work claim. On release
     of the work claim the store atomically promotes the oldest live waiter (audited `promoted`).
   - **work** — the exclusive mutex, unchanged in semantics from ADR-0121/0138: one session per
     story, hard refusal names the holder, renders as the **orbiting** wisp with the proving
     colour / bloom on top from work-events. Transitions (explore→work upgrade, downgrade,
     release) are audited `claim_event` rows.
   A session may hold any number of claims at any grade (multi-story exploring sets and legitimate
   cross-story work claims); hoarding is mitigated by visibility (N orbits under one session on the
   map) and the heartbeat clock, never a hard cap.

3. **Forced at start, via claim-gated workspace creation.** Sessions open on the PRIMARY checkout
   (the "lobby" — reads are offline; nothing claim-gated works there) and obtain their workspace
   through **`storytree worktree create --node <story>… --intent "<what>"`**, which atomically:
   takes the exploring claim(s) FIRST (no claim, no workspace — ADR-0121's claim-before-worktree
   ordering, generalised), mints the worktree name **`<arc>-<story>-<short-suffix>`** when an arc
   anchor exists and **`<story>-<short-suffix>`** for planless work (owner-refined 2026-07-16: the
   arc names the journey — a long-lived worktree walks sibling stories one landing at a time, the
   worktree surviving each merge, ADR-0142 — and the story names the anchor at creation; the first
   `--node` wins when several are claimed with no arc; slugs are truncated — the `-arc` suffix
   dropped, basename capped — because the name rides every pnpm path on Windows). The basename
   remains the session id (ADR-0033 — board/dock/map entries become self-describing), and it is
   minted ONCE: a session that walks on to a sibling story keeps its birth name (renaming would
   change the session's identity mid-flight) — the ledger, not the name, is the truth. The command
   then cuts the worktree off main, runs the install synchronously (retiring the fail-silent
   SessionStart provisioning path of ADR-0162 for this flow), and returns the **start payload** in
   its envelope: claims taken + the board digest + the "work from this path" ceremony. The
   enforcement ratchet: spawners we own call `worktree create` (deterministic); hand-opened
   sessions get the SessionStart nudge re-aimed at it; and **`check:declared` flips WARN → FAIL**
   (an unclaimed session cannot reach the merge ceremony). The one grade of "forced" we do not
   pretend to have: a fail-silent hook cannot divine a story; the wall is the workspace + the gate.

4. **Push is cursor-once deltas riding existing outputs — never a schedule.** Each session holds a
   cursor over the sequenced `claim_event` log; deltas that intersect the session's own claim set
   are delivered ONCE (cursor advances; a digest line when several accumulated), piggybacked on
   outputs the agent already reads (CLI envelope footers, gate output, the `worktree create`
   payload). **[Corrected 2026-07-16 (inc-4 build, ADR-0200 arc): SessionStart is deliberately NOT a
   delta surface — an unclaimed session's claim set is empty (no deltas by construction) and a
   `worktree create`-born session is already baselined at birth, so a hook line would add nothing and
   preserves the never-blocking-hooks contract (ADR-0033 D3); pending deltas ride the session's
   first `--pg` CLI envelope instead. The D4 principle — cursor-once, riding existing outputs,
   never a schedule — is unchanged; only the surface enumeration is corrected.]** "Someone else is exploring your story" fires once; it speaks again only
   on a genuinely new event (upgrade, queued-behind-you, release, reclaim). The statusline remains
   the HUMAN's ambient state display (redrawn, not sent — no dedup needed) and keeps the
   never-blocking-hooks contract (ADR-0033 Decision 3): no scheduled context injection exists.

5. **Liveness is one trace-driven clock.** The existing 2 h heartbeat-staleness reclaim covers all
   grades; heartbeats are bumped by the loops' own activity (the statusline beat's
   `bumpHeartbeatsBySession` today; the ADR-0138 D4 `onMessage`/`onPhase` trace bumps as they
   land). Machine clears stand: build completion releases `(unit, session)`; the CI merge releases
   by branch. An abandoned exploring wisp fades on the same schedule as an abandoned lock.

6. **Worktree hygiene keys on the ledger.** `storytree worktree prune`'s keep-signal becomes "the
   session holds live claims" (replacing the presence-row check and demoting the 48 h mtime
   heuristic to a fallback): create and reap become inverse operations of one machinery.

7. **Views, not stores.** The forest map renders claims by grade (hover / queued / orbit) **by
   default** — the `?claims=` flag retires; the proving colour + verdict bloom stay work-event- and
   verdict-sourced (the ADR-0138 §5 honesty wall is untouched: no claim state is ever a proof).
   *[Amended by [ADR-0212](0212-one-wisp-per-session-merge-the-build-wisp-into-the-claim-lif.md)
   (decided 2026-07-18): the three grades and the by-default render STAND, but the render families
   change — "hover" gains a small local orbit (see the D2 note above), and the build layer stops being
   a drawable of its own, so a story's live build phase folds onto that story's work-claim wisp as
   MOTION. The honesty wall named here is explicitly preserved by ADR-0212. Decision only: not yet
   built.]* The
   studio dock becomes claims-grouped-by-session; `/api/presence` retires. The CLI board renders
   the ledger. All render legs are **owner-attested before the old machinery is deleted**: the
   retirement sweep (presence store + parity, the hooks' auto-declare, the ADR-0079 reaper,
   `/api/presence`, the `events.session` writers/readers) is the arc's **LAST increment, gated on
   the owner's appearance-UAT attestation** (owner-directed). **[Landed 2026-07-17: the owner
   attested the inc-5 claim-grade renders that morning, gating the sweep, which then landed across
   PRs #760–#766 — desktop mirror (#760), studio server (#761) and frontend (#762), cli+drive prune
   re-key and statusline re-source onto the ledger (#763), stories re-authored to the one-ledger
   world (#764), the notice-board presence core deleted (presence.ts / presence-store.ts / reaper.ts,
   #765), and the `events.session`/`session_event` tables dropped guarded-idempotent (#766). The
   claim ledger is now the sole coordination + observability machinery; advisory presence is gone.]**

8. **Stories follow.** `notice-board` and `wisp-as-story-claim` are re-authored (story-author) to
   the one-ledger world as part of the arc — one coherent journey: the deterministic claim board
   that coordinates agents and renders the forest.

## Consequences

**Good**
- Coordination and observability stop disagreeing by construction — there is one record to lie
  about, and it is the one that structurally can't (PK-enforced, audited, machine-cleared,
  trace-aged). The whole presence defect class (clobbers, zombies, false warns, bands) retires.
- The forest is populated exactly proportionally to real activity: hover = intent, orbit = work,
  queue = contention, colour = proof in flight, empty = genuinely nothing. Intent becomes data
  (pushable, auditable) instead of a prose field on a row nobody trusted.
- Collision discovery moves from lock-time to intent-time (the cascade-duplicate class shrinks
  again); the queue turns refusal-and-retry into an ordered, visible line with atomic promotion.
- Worktree lifecycle (create → work → merge-clear → prune) closes over one ledger; worktree/session
  names become self-describing on every surface.

**Bad / accepted**
- Same-story work still serialises (ADR-0138's accepted cost); the queue makes waiting legible
  rather than removing it. Capability-grain claims remain the named scale-up.
- A session that ignores the lobby ceremony is invisible until the gate wall catches it; claim-free
  actions (ADR authoring, curation — ADR-0138 D3's exception) stay invisible on the map. Accepted
  at inner-circle scale; a session-scoped claim key is the named escape hatch if it ever matters.
- ~~Until the arc's final increment lands, both worlds run side by side (presence still written by
  hooks/declare); the interim cost is bounded by ADR-0199 having already removed the destructive
  writer.~~ *(Resolved 2026-07-17: the final increment landed (#760–#766); presence is no longer
  written or read anywhere — the two worlds collapsed to the one ledger, so this interim cost is
  retired.)*

## References

- `docs/research/notice-board-mechanics-review.md` — the analysis this decision answers.
- The design conversation's friction evidence: `friction-real-build-marks-interactive-session-done`
  (→ ADR-0199), `friction-released-build-wisp-reads-as-lost-claim`,
  `friction-claim-wisps-default-off`, `friction-claim-id-orphans-after-story-rename`,
  `friction-worktree-rename-invisible-on-desktop-map`.
- Code: `packages/notice-board/src/claim.ts` + its store (the ledger),
  `packages/drive/src/ambient-presence.ts` (hooks/statusline to re-aim), `packages/cli/src/worktree.ts`
  (prune re-key), `apps/studio/server/inFlightActivity.ts` + `apps/studio/src/components/TreeView.tsx`
  (the renders), `packages/cli/src/check-declared.ts` (WARN → FAIL).
- The live arc: `storytree arc show noticeboard-claim-ledger-arc --pg`.
