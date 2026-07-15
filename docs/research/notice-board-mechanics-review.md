# Notice-board mechanics review — presence vs claims vs what the map renders

*2026-07-16, the ADR-0199 fix session. Commissioned by the owner after two wisp-death interrupts
(2026-07-15/16). Companion to [ADR-0199](../decisions/0199-a-build-run-never-writes-session-presence.md);
the render-layer facts were verified against the live code (file:line refs below).*

## 1. The three stores and who writes them

| Store | Semantics | Writers | Clearers | Staleness |
|---|---|---|---|---|
| `events.session` (presence) | **who is here** — the session roster | SessionStart/End hooks (`nodes:[]`), statusline heartbeat (debounced, `reactivate:false`, ADR-0141), deliberate `noticeboard declare`/`done` (ADR-0142); ~~builds via `withPresence`~~ **retired by ADR-0199** | `done` (deliberate/hook), CI merge-retire, ADR-0079 reaper (≥4 h quiet) | bands derived at read: fresh <1 h, stale <4 h, possibly-dead ≥4 h |
| `events.node_claim` (claims) | **who holds what** — the coordination lock, one row per unit (PK) | `declare --node` (work-time claim, ADR-0142), builds (`intent: real` / `story:<mode>`, ADR-0121), spawn-seam (ADR-0138 §3) | build completion releases `(unit, session)`; CI merge clears by branch (ADR-0142); stale-reclaim ≥2 h since heartbeat | heartbeat bumped by the statusline beat (`bumpHeartbeatsBySession`) |
| `events.work_event` (`building` + phase marks) | **what is being proven** — observability | builds only (`node-build.ts` initial mark + `phaseActivityWriter` per phase, with `colourState`) | none (append-only); render-side TTL | 20 min TTL at render (`BUILD_IN_FLIGHT_TTL_MS`) |

ADR-0199 makes the row above one-sentence honest: presence = sessions, claims = coordination,
work-events = proof observability. Before it, builds wrote all three — and the presence write was
keyed on the *launching session's* identity, which is the clobber the owner hit.

## 2. What renders from which store

| Surface | Endpoint | Store | Behaviour |
|---|---|---|---|
| Studio **session dock** + StoryPanel sessions | `GET /api/presence` (30 s poll + 60 s client reband) | `events.session` `listActive()` | active rows only — a `done` row **vanishes silently**; bands via `classifyPresence`; `nodes` anchor a row to a story for dock-click focus (`sessionAnchors`, `TreeView.tsx:1665`) — **not** a map wisp |
| Studio **map wisps (default)** | `GET /api/activity` → `builds` | `events.work_event` building rows | in-flight builds, 20 min TTL, phase + colourState (`inFlightBuilds.ts`) |
| Studio **map claim layer** | `GET /api/activity` → `claims` | `events.node_claim`, 2 h TTL | **behind `?claims=` — DEFAULT OFF** (`TreeView.tsx:1003-1008`, `claimsByStory` returns empty when off) |
| Gate `check:declared` | direct pool read | `events.session` `listActive()` | WARN when own session absent or `nodes:[]` |
| CLI `storytree noticeboard` | direct pool read | `events.session` | groups sessions by *declared nodes* — never reads claims |
| CLI `storytree tree --pg` | direct pool read | presence (+ verdict glyphs) | "sessions here" weave |

## 3. The disagreements, and which have cost owner interrupts

1. **[FIXED — ADR-0199] The build presence clobber.** A `--real` build re-declared the launching
   session's row as its run and flipped it `done` at completion: the dock row vanished,
   `check:declared` false-warned, and the owner interrupted twice (2026-07-15/16, session
   `clever-chatelet-76014c`) — while `events.node_claim` truthfully held the session's claim
   throughout. Presence lied; the claim didn't. Cost: 2 interrupts + ~20 min of DB forensics +
   a manual re-declare after every build.

2. **[OPEN — the biggest residual] The ADR-0138 canonical render is dormant.** ADR-0138 D1 /
   ADR-0142 say **the claim IS the story wisp** — the SessionStart nudge and the `declare` output
   both promise "this lights the story wisp on the map." But the claim layer renders only behind
   `?claims=live|demo`, default **OFF**; the default map's wisps are in-flight **builds**
   (`buildsByStory`, `TreeView.tsx:2132`). So the thing the corpus calls "the wisp" (the claim) and
   the thing the owner sees orbiting (the build) are different objects with different lifetimes
   (2 h heartbeat vs 20 min TTL vs minutes-long builds). This mismatch is fertile ground for
   exactly the class of confusion behind both interrupts: a wisp went out and no surface could say
   which of the three stores' lifecycles ended. The flag default is not an oversight per se — it is
   gated on the story's operator-attested appearance UAT, which never ran (see §4).
   **Independently corroborated 2026-07-16** by a second session on a different harness/model
   (`friction-claim-wisps-default-off`): after a successful `declare --node` reported "the story
   wisp is lit", the dock showed the session in realtime but no claim wisp appeared — minutes of
   declare/DB/refresh debugging against what was a URL flag the success message never mentions.

2b. **[OPEN — rename-shaped corollaries, routed `tool`]** The same second session surfaced two
   claim-mechanics gaps around a story rename (`terminal-chat` → `app-guide`):
   `friction-claim-id-orphans-after-story-rename` — `declare --node <old-id>` succeeds in the DB
   (ADR-0138 D6 deliberately registers no node table) but the claim anchors to no loaded island;
   routed to a CLI validation (declare checks node ids against the loaded tree, refuses/warns on
   unknown). `friction-worktree-rename-invisible-on-desktop-map` — the map serves the PRIMARY
   checkout's `stories/`, so an in-flight worktree rename reads as stale data; routed to a
   legibility delta (surface "serving <checkout> @ <sha>" — already on the `/api/health` wire).

3. **[OPEN — residual of `friction-released-build-wisp-reads-as-lost-claim`] Wisp-out is
   illegible.** A wisp can go out because: a build finished (work-event TTL/terminal), a claim was
   released (completion or merge) or stale-reclaimed, or a presence row went done/possibly-dead.
   No surface distinguishes these — the owner needed a one-shot SQL dig against `events.claim_event`
   to prove no claim was lost. The claim-event audit log already records
   `claimed|reclaimed|released|conflict-refused`, so the material for a legible "why it went out"
   exists on the wire.

4. **[MINOR] The CLI board and the claim layer can drift.** `noticeboard` groups sessions by
   *declared* nodes (a presence field), which mirrors claims at declare time but drifts when a
   claim is stale-reclaimed or released independently; the board never reads `node_claim`. Same
   for the dock. Weaving claims into the board view is a nicety ADR-0199 names as follow-on.

5. **[MINOR] Three unaligned staleness clocks.** Presence bands 1 h/4 h, claim reclaim 2 h, build
   TTL 20 min. Coherent individually, but a session can look *fresh* in the dock while its claim
   was already reclaimed (e.g. statusline beats stopped but a hook re-declared). Not yet observed
   as an interrupt; listed for completeness.

## 4. Should wisp-as-story-claim be its own story node? (owner question 2)

**It already is** — `stories/wisp-as-story-claim/` exists (authored with ADR-0138): 7 capabilities
(claim-store work-time A, render-claim-as-wisp B, colour-by-subagent C, ci-clear-on-merge D,
take-claim-at-spawn E, claim-at-declare, appearance-uat F), a proper within-story DAG, and an
operator-attested look leg (F). ADR-0192's landlord audit already declared its hosted-story edges
(its organs live inside `packages/notice-board`, `packages/drive`, `packages/agent`, `apps/studio`).

**The real gap is that the story is 100 % `proposed` while most of its behaviour is LIVE.** The
claim store, claim-at-declare, the CI merge clear, and the claim render all landed (under ADR-0138/
0142 arcs and glue passes), but no capability was ever adopted/re-proven under the story, and the
appearance UAT was never staged for the owner — which is precisely why `?claims=` still defaults
OFF and the canonical render is dormant (§3.2). The behaviour living as glue across four hosts is
the *symptom*; the *cause* is that its story's proof legs never ran.

**Recommendation (owner decision):**
1. **Don't author a new story** — consolidate this one. Run the stale-spec check (git-log the paths
   each capability names), then **adopt** the already-built capabilities (the ADR-0097 adopt path;
   never a forced `--real` red against landed behaviour).
2. **Stage the appearance UAT (F)** for the owner (`stage-the-attestation-experience`): a running
   studio with `?claims=live`, one claimed story, the walk-list. An attested F is the gate that
   flips `?claims=` default ON — the ADR-0138 D1 end-state where the claim is *the* wisp. Two
   sessions on different harnesses have now paid debugging time to the dormant default
   (`friction-claim-wisps-default-off` + this session's interrupts) — this is the highest-value leg.
3. **Add ONE new capability** (story-author increment): *wisp-out legibility* — the map
   distinguishes released-on-completion / cleared-on-merge / stale-reclaimed / session-done, sourced
   from the existing `claim_event` audit rows. This is the durable home for
   `friction-released-build-wisp-reads-as-lost-claim`'s residual (and, with it,
   `friction-claim-wisps-default-off` archives once the default flips).
4. ADR-0192 note: the story stays **hosted** (its declared/annotated edges are already in place);
   any NEW organ (the legibility capability) follows packages-forward only if it grows a genuinely
   new building — the render delta belongs in `apps/studio` under the existing hosted-seam edges.
