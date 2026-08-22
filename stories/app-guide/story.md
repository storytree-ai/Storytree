---
id: "app-guide"
tier: story
title: "The app-guide concierge wires a newcomer's Claude Code into the observability layer"
outcome: "A newcomer opening the desktop app is guided by a conversational concierge from a fresh machine to a Claude Code session wired into the observability layer — install, authenticate, point at the repo, wire the presence hooks — until a wisp lights on the map confirming they are now watched."
# Immutable arc provenance (ADR-0183): this node's absorb of the dormant headless-orchestrator chat
# substrate is increment 1 of the explorer-onboarding-arc (ADR-0174 / ADR-0175, owner-directed 2026-07-17).
arc: explorer-onboarding-arc
# RENAMED / RE-AIMED (ADR-0175, 2026-07-09). This node was formerly `terminal-chat` — a chat-panel
# UX-polish story ("make the desktop chat panel feel like a terminal") from a live ADR-0137 Phase-3 UAT
# walk (2026-07-03). Two companion decisions re-aimed it: ADR-0174 retired the in-app INTERACTIVE
# orchestrator chat in favour of an EMBEDDED TERMINAL running real Claude Code — so the "terminal feel"
# framing is RETIRED (the real terminal is now the `embedded-terminal` story) — and ADR-0175 repurposed
# the freed-up chat infrastructure (SSE transport, dock, cross-turn continuity, the read-only CI/git
# inspect surface, the SDK session engine) into a future `app-guide` help/setup concierge rather than
# deleting it. This story is that re-aim. The build is DEFERRED (ADR-0175 is a standing "repurpose,
# don't delete" marker): the four capabilities below are the dormant chat-panel UX substrate the
# concierge will ride — the first slice — NOT the concierge's onboarding/wiring behaviour itself.
# status: proposed. The three thin-client chat-panel caps landed built-but-unregistered (a real,
# passing studio VITEST suite, apps/studio/src/components/ChatPanel.test.tsx, but storytree's
# prove-it-gate never DROVE them red→green — no signed `--real` verdict), the `mapped` state, NOT
# `proposed` (authored-but-unbuilt). The Adopt path (`storytree adopt app-guide --pg`) observe-and-signs
# the `## Reliability Gates` observe gate below (greening the 3 caps via coverage) and flips this line
# mapped → proposed. The crown DERIVES green from signed verdicts (ADR-0020), NOT this authored line.
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "does the concierge
# chat surface read as one continuous conversation" — is APPEARANCE/FEEL, and since ADR-0348 D6 it is
# design intent rather than a UAT leg. The machine-driven story UAT node stays WITHHELD; the crown
# derives from the capabilities' signed verdicts alone — no story-tier attestation remains.
# RE-ADJUDICATED 2026-07-26 (ADR-0209 D8 — see the `## UAT Test Criteria` section): legs 1–3 and 5 are
# `witness: machine`; only leg 4 stayed `human`, on the NO-COMPILER basis (does the surface READ as one
# continuous conversation — an aesthetic verdict no test decides). NARROWED 2026-08-11 (ADR-0348 D6):
# leg 4 is DELETED as a user EXPERIENCE rather than a user ACCEPTANCE claim, leaving ZERO human legs;
# the intent is carried in "The conversational feel". Leg 5 (backend-wedge recovery) was
# human for a HARNESS reason, not a judgment gap: clearing a module-level guard through a POST route and
# observing a subsequent session admitted is exactly what `backend-chat-reset-route`'s own authored
# integration test asserts. Per ADR-0209 §6 it is UNSTAMPED until a spec judges it — the tag records
# which witness is RIGHT, not that a proof exists, and the owner signs nothing here.
# Capabilities, roots-first. The three thin-client caps edit the SAME component (apps/studio/src/
# components/ChatPanel.tsx) + its test, so they are SEQUENCED (multi-turn-transcript → auto-grow-input →
# transcript-reset) to build on each other's committed source in ONE shared --real worktree (ADR-0057 §3
# expansion D). The fourth (backend-chat-reset-route) is OPTIONAL/STRETCH — sidecar/drive, may be HELD.
capabilities: [multi-turn-transcript, auto-grow-input, transcript-reset, backend-chat-reset-route]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074):
#   - studio  — the chat panel IS a studio frontend component (apps/studio/src/components/ChatPanel.tsx,
#               the studio-story `chat-panel` capability). The three thin-client caps EDIT that studio
#               component + apps/studio/src/api.ts. So app-guide is a follow-on that extends studio's
#               chat-panel surface — a real code edge into apps/studio/src. The panel is proven under the
#               studio VITEST suite; the concierge-chat FEEL is witnessed inside the desktop app (the
#               consuming surface, ADR-0070 / the desktop story's leg-9 precedent — corrected 2026-07-26
#               from "leg-7": desktop#uat-7 is the brokered-build SPEND leg, and desktop#uat-9 ("It feels
#               like one app, chat included") is the feel leg that actually names this chat surface).
#   - drive-machinery — the OPTIONAL backend-chat-reset-route cap consumes drive (the exported
#               composition guard-reset it calls); AND, as of the ADR-0175 absorb, app-guide now OWNS the
#               dormant chat-substrate composition physically hosted in packages/drive
#               (orchestrate.ts / chat-stream.ts) — the hosted-code-in-another-package seam (studio-build
#               precedent). The three thin-client caps do NOT touch drive (the thin-client wall,
#               modelPathBoundary.test.ts). Declared so the substrate/cap is honest + buildable when picked
#               up (ADR-0074 "declare the edge").
#   - agent (ADR-0175 absorb) — app-guide now OWNS the dormant headless-orchestrator engine + read-only
#               orientation tools, physically hosted in packages/agent (headless-orchestrator.ts,
#               orientation-tools.ts) — the same hosted-code-in-another-package seam. The concierge that
#               DRIVES this substrate is the DEFERRED build (no app-guide code imports @storytree/agent
#               yet), so this is an artifact_edge (deliberate non-import ownership seam).
#   - NOTE (cycle-break, ADR-0058): app-guide NO LONGER declares `desktop` in depends_on. desktop now
#               CONSUMES this absorbed substrate — its chat-sse-mount MOUNT rides app-guide's
#               orchestrate/chat-stream core — so the edge inverts to desktop → app-guide (see
#               stories/desktop/story.md). The backend-chat-reset-route stretch cap's proof source hosted in
#               apps/desktop is covered by THAT reverse edge (the ADR-0192 landlord rule accepts either
#               direction); the future concierge RIDING desktop's chat-sse-mount is DEFERRED and cited in
#               prose below, not a depends_on edge (declaring app-guide → desktop while desktop → app-guide
#               would be a cycle).
depends_on: [studio, drive-machinery, agent]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, drive-machinery, agent]
# Deciding ADRs (ADR-0037 §2): 0175 (repurpose-don't-delete the chat infra into the app-guide concierge —
# this node's re-aim); 0174 (retire the in-app interactive orchestrator chat for an embedded terminal —
# the companion that freed this infra, and why "terminal feel" retired: the real terminal is now
# `embedded-terminal`); 0137 (the Phase-3 chat-spawn arc whose live UAT walk surfaced the original
# chat-panel UX feedback, 2026-07-03); 0108 (the chat surface + read/propose-only wall the panel rides);
# 0070 (the two-stage frontend-builder proof — geometry machine-proven, appearance operator-attested);
# 0010 (the organism model + the splitting-rule that tiers these units); 0004 (the thin-client / agent
# boundary the panel must not breach); 0057 (the spec-borne proof config making each cap buildable).
decisions: [175, 174, 137, 108, 70, 10, 4, 57]
---

# The app-guide concierge wires a newcomer's Claude Code into the observability layer

**Outcome —** A newcomer opening the desktop app is guided by a conversational concierge from a fresh
machine to a Claude Code session wired into the observability layer — install, authenticate, point at
the repo, wire the presence hooks — until a wisp lights on the map confirming they are now watched.

> **Renamed from `terminal-chat` (ADR-0175, 2026-07-09).** This node was formerly `terminal-chat`, a
> chat-panel UX-polish story ("make the desktop chat panel feel like a terminal") born of a live
> ADR-0137 Phase-3 UAT walk (2026-07-03). Two companion decisions re-aimed it: **ADR-0174** retired the
> in-app *interactive* orchestrator chat in favour of an **embedded terminal** running real Claude Code
> — so the "terminal feel" framing is RETIRED, the real terminal is now the
> [`embedded-terminal`](../embedded-terminal/story.md) story — and **ADR-0175** repurposed the freed-up
> chat infrastructure (the SSE transport, the dock, cross-turn continuity, the read-only CI/git inspect
> surface, the SDK session engine) into a future **`app-guide`** help/setup concierge rather than
> deleting it. This story is that re-aim.

## What app-guide is (ADR-0175)

`app-guide` is a storytree-native help/setup **concierge**: it onboards a new user to the product and
answers help/advice questions, and — its real job — **onboards the user's OWN Claude Code into the
observability layer**: install Claude Code → authenticate → point it at the repo/worktree → wire the
presence hooks (`scripts/presence-hook.sh`, the `SessionStart` declare) → verify a wisp lights on the
map. The whole premise of ADR-0174 is that the observability layer already watches any plain Claude
Code session *through those seams*; app-guide is the thing that does the wiring and hand-holds the
setup. Its tool scope is **read / advise / setup** — read-only orientation + inspection, plus narrow
setup-scoped writes for config and hooks — NOT write-scoped story-code execution.

**app-guide OWNS the dormant headless-orchestrator chat substrate (the ADR-0175 absorb, owner-directed
2026-07-17, explorer-onboarding-arc inc 1).** The [`headless-orchestrator`](../headless-orchestrator/story.md)
story is now RETIRED and its dormant chat substrate is absorbed HERE, so a future session plans the
concierge against ONE story rather than split ownership. What app-guide now owns (ownership honesty — NOT a
capability dump of new red→green work in this increment): the SDK **session engine** and the read-only
**orientation tools** (`packages/agent/src/headless-orchestrator.ts`, `orientation-tools.ts`), and the
`orchestrate` / `chat-stream` **composition** (`packages/drive/src/{orchestrate,chat-stream}.ts`) — code
physically hosted in the `agent` / `drive-machinery` packages (the studio-build hosted-code precedent; the
`agent` + `drive-machinery` edges are declared in the frontmatter above). It RIDES desktop's
[`chat-sse-mount`](../desktop/chat-sse-mount.md) as the HTTP/SSE **mount surface** (that capability stays
desktop's; the edge is desktop → app-guide, desktop consuming this absorbed core). Spawn and landing do
NOT come to app-guide (ADR-0175): those retired with [`chat-subagent-spawn`](../chat-subagent-spawn/story.md)
/ [`spawn-visibility`](../spawn-visibility/story.md), and the interactive seat is the
[`embedded-terminal`](../embedded-terminal/story.md) running real Claude Code (ADR-0174). The full concierge
onboarding/wiring build — orient → advise → wire the user's Claude Code → verify a wisp lights, plus the
orientation-surface consumption edges (`library` / `notice-board`) it will then declare — remains DEFERRED
(another session is planning it); this absorb is ownership honesty only.

**The build is DEFERRED (ADR-0175).** ADR-0175 is a standing "repurpose, don't delete" marker so the
chat infrastructure is neither ripped out nor left as unowned dead code. The four capabilities below
are the **dormant chat-panel UX substrate** the concierge will ride — the continuous-conversation chat
surface (a persistent transcript, an input that grows, a clean reset). They are already authored as the
first slice and stand on their own as chat-surface UX; they are NOT the concierge's onboarding/wiring
behaviour itself (see *Future slice* below).

## The journey (why this is ONE story — the journey-principle)

The consumer is a newcomer opening the desktop app; their goal is to go from "storytree is open but my
own Claude Code is invisible to it" to "my Claude Code session is wired in and I can see my wisp on the
map." Finishing "I'm oriented and my questions are answered" leads the newcomer straight to needing
"now wire me in and show me it worked" — one continuous onboarding journey, conducted through one
conversational surface, so it is one story (the journey-principle: if finishing the first unit's
journey leads the consumer straight to needing the next, they are the same journey).

## Capabilities

### Present slice — the continuous-conversation chat substrate (4 caps)

These re-aim the former terminal-chat caps: they make the desktop chat panel read and behave as one
continuous conversation — a persistent multi-turn transcript, an input that grows to its content and
resets cleanly — the UX foundation a concierge conversation needs. They are honest, isolatable red→green
units over the existing `ChatPanel.tsx` / `api.ts`, and they stand on their own as chat-surface UX
regardless of when the concierge behaviour lands. Listed roots-first (a capability appears after
everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`multi-turn-transcript`](multi-turn-transcript.md) | Each send appends a `› <prompt>` echo + its streamed reply into one persistent, scrollable transcript that auto-scrolls to the newest line — prior exchanges stay, never replaced. | integration-test (studio vitest, red→green) | — |
| 2 | [`auto-grow-input`](auto-grow-input.md) | The input textarea grows to fit its content up to a cap, then scrolls internally — Enter still sends, Shift+Enter still inserts a newline. | integration-test (studio vitest, red→green) | `multi-turn-transcript` |
| 3 | [`transcript-reset`](transcript-reset.md) | A reset control clears the transcript to idle AND aborts the in-flight SSE stream (an `AbortSignal` threaded through `api.chatStream` into `fetch`). | integration-test (studio vitest, red→green) | `multi-turn-transcript`, `auto-grow-input` |
| 4 | [`backend-chat-reset-route`](backend-chat-reset-route.md) **(OPTIONAL / STRETCH)** | A `POST /api/chat/reset` sidecar route clears the backend composition single-session guard so a wedged session recovers without an app restart. | integration-test (desktop node:test, red→green) | — (cross-story: drive-machinery) |

**Capability 4 is OPTIONAL / STRETCH in prioritisation, not in proof accounting.** It may land
separately from caps 1–3, but while it remains a normal authored capability and Story-UAT criterion it
blocks the crown until its capability is healthy and UAT leg 5 is discharged. Holding it therefore
means holding the story at unproven; the label never makes either obligation moot. Do NOT auto-build it
in the same chain as caps 1–3. *(Re-adjudicated 2026-07-26: leg 5 is `witness: machine`, so discharging
it is a signed machine observation, no longer an owner's attestation — the obligation is unchanged, only
who may discharge it.)*

### Future slice — the concierge behaviour itself (NOT YET CAPABILITIES; prose only, ADR-0175 deferred)

The onboarding/wiring journey — orient the newcomer, answer help/advice, walk install → auth →
point-at-repo → presence-hook wiring, and verify a wisp lights — is the **deferred** app-guide build
(ADR-0175). It will likely need FURTHER capabilities when it is picked up, for example: a
setup-scoped-write fence for config/hooks (ADR-0175's "narrow writes" note; the same fail-closed
path-fence discipline the retired glue actuator used, ADR-0160 D2), a wire-and-verify walkthrough that
confirms a wisp actually lights on the map, and the wiring of the NOW-OWNED headless SDK session engine +
read-only orientation tools (absorbed from the retired `headless-orchestrator`, ADR-0175) + the read-only
inspect surface (`inspect-tool-surface.ts`) as the concierge's caller. Those are
**not authored here** — per the journey-principle and slow-growth, they are named as future work and
left for the story-author pass that accompanies the actual build. Do NOT scaffold empty capability files
ahead of a provable walkthrough.

## Within-story dependency graph

Authored from the intended data-flow + the shared-file build sequencing (re-derive from the real
imports/calls when the units are built, ADR-0010 §3). The graph is acyclic; `multi-turn-transcript` and
`backend-chat-reset-route` are the two roots.

- `auto-grow-input` → `multi-turn-transcript`. Both edit the SAME source file
  (`apps/studio/src/components/ChatPanel.tsx`); in the shared `--real` build worktree a later node builds on
  the earlier committed source (ADR-0057 §3 expansion D), so the grow capability builds on the
  transcript-model version of the component. (No data-flow coupling — the grow logic does not read the
  transcript state — but the file-sequencing edge is real and keeps the story buildable in dependency
  order.)
- `transcript-reset` → `multi-turn-transcript`, `auto-grow-input`. Reset CLEARS the transcript that cap 1
  introduces (a real data-flow edge) and returns the input to cap 2's one-row resting height; it edits the
  SAME component file plus `apps/studio/src/api.ts`, so it builds on both prior caps' committed source.
- `backend-chat-reset-route` — no within-story edge (a separate root); it consumes a CROSS-story
  drive-machinery seam (the exported composition guard-reset). Optional/stretch.

The three thin-client caps form a linear chain (1 → 2 → 3) BECAUSE they edit one file — the sequencing keeps
each cap's red→green honest against the prior cap's committed source. This is the shared-file build order,
not an artificial coupling; each cap still proves its OWN distinct observable (transcript / input geometry /
reset+abort).

## Cross-story boundary (ADR-0010 §4 / ADR-0074)

Authored from the intended consumed seams (re-verify against the real imports when built).

- **`studio`** — the chat panel IS a `studio` frontend component
  ([`apps/studio/src/components/ChatPanel.tsx`](../../apps/studio/src/components/ChatPanel.tsx), the
  studio-story [`chat-panel`](../studio/chat-panel.md) capability). The three thin-client caps EDIT that
  studio component + `apps/studio/src/api.ts` — a real code edge into `apps/studio/src`, proven under the
  studio VITEST suite (jsdom, `@testing-library/react`), exactly as `chat-panel` is. So `app-guide` is a
  FOLLOW-ON that extends studio's chat-panel surface; the concierge-chat FEEL is witnessed inside the
  DESKTOP app (the consuming surface, the desktop story's operator-attested leg-9 precedent, ADR-0070 —
  *corrected 2026-07-26 from "leg-7"*: [`desktop`](../desktop/story.md)#uat-7 is the brokered-real-build
  leg, human on SPEND + an outward write; its #uat-9 "It feels like one app, chat included" is the FEEL
  leg, and it names this very chat surface as the thing being witnessed). The
  caps stay THIN CLIENTS — no `@storytree/agent` / `@storytree/drive` / model import (the
  `modelPathBoundary.test.ts` wall), so this edge adds no forbidden coupling and no new `@storytree/*`
  frontend dep.
- **`drive-machinery`** — ONLY the OPTIONAL `backend-chat-reset-route` cap consumes drive (the exported
  composition guard-reset `resetCompositionGuard` it calls to clear `compositionInFlight`). The three
  thin-client caps do NOT touch drive. If the stretch cap is HELD, this edge is dormant; it is DECLARED so
  the cap is buildable when picked up (the ADR-0074 "declare the edge, never work around it" pattern).

The panel PARSES the SSE `data:` frames as plain JSON against the wire shape re-declared in
`apps/studio/src/api.ts` (the `chat-sse-mount` cross-boundary contract) — consuming a wire shape over HTTP
is NOT a package import and adds NO new `depends_on` edge (the `chat-panel` capability's settled boundary
reasoning stands; threading an `AbortSignal` into `api.chatStream` and onto `fetch` stays inside
`apps/studio/src`).

## UAT Test Criteria

The integrated acceptance walkthrough that proves the present chat-substrate slice meets its outcome
end-to-end. Minimal-first (one coherent journey: converse over multiple turns → the scrollback persists →
the input grows → reset gives a fresh conversation), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Present slice only — the concierge onboarding UAT is deferred (ADR-0175).** This walkthrough proves
> the continuous-conversation chat SUBSTRATE (the four caps). The full concierge journey — orient →
> help/advise → wire the user's Claude Code → verify a wisp lights — is the DEFERRED app-guide build; its
> wire-and-verify UAT is authored with that build, alongside the future-slice capabilities named above.

> **Per-leg witness (ADR-0106 / ADR-0070; RE-ADJUDICATED 2026-07-26, ADR-0209 D8).** Deterministic
> behaviour legs 1–3 are `witness: machine`, each bound exactly to the command-bearing
> `app-guide#gate-1`: the studio vitest suite covers append-not-replace + auto-scroll, height recompute
> + cap + keybindings, and clear-to-idle + abort + signal threading. Stretch leg 5 is ALSO
> `witness: machine`, and deliberately carries **no** proof-gate annotation. Leg 4 — the holistic
> conversational-feel judgment — was the one `witness: human` leg. No leg rests `either`.
>
> **NARROWED 2026-08-11 (ADR-0348 D6): leg 4 is DELETED, so this story carries ZERO human legs.** It
> asked whether the surface is any GOOD, not whether the journey achieved its goal — a user EXPERIENCE
> property, not a user ACCEPTANCE criterion, and therefore continuous owner feedback gathered through
> use rather than a discrete obligation the story must clear to be green. Its design intent, and the
> record that it was never walkable, are carried under "The conversational feel" below. Ordinal 4 is
> BURNED, not reused — as `1`–`3` already were by the ADR-0294 D2 deletions — so the surviving leg keeps
> the number it has always had and no signed verdict or `(proof-gate:)` binding is silently re-pointed.
> With legs 1–4 all gone, **leg 5 is the only criterion left**, and the single reliability gate stays
> exactly where it is, unclaimed by any criterion, for the reason recorded below.
>
> **What the re-adjudication changed and why.** Leg 5 (a wedged backend session recovers without a
> restart) was `human` for a HARNESS reason wearing a witness costume: "witnessed on the live surface".
> Live-vs-in-process is FIDELITY, not a judgment gap — `human-witness-is-a-judgment-gap-not-cost`. Every
> condition the leg states is decidable by a machine: the composition single-session guard
> (`compositionInFlight`, a module-level `let` at `packages/drive/src/orchestrate.ts:142`) is in-flight,
> a `POST /api/chat/reset` returns `200`, and a subsequent session is thereafter admitted. That is
> *exactly* what [`backend-chat-reset-route`](backend-chat-reset-route.md) already authors as its own
> integration test (`bcr-clears-the-composition-guard`, driving the REAL drive guard over a loopback
> `node:http` server — no Electron, no live app). A leg whose success condition is already someone's
> written assertion is not an irreducible human verdict. Per **ADR-0209 §6** it returns to UNSTAMPED
> until a spec judges it: the tag records which witness is RIGHT, not that a proof exists.
>
> **Why leg 5 names no proof gate, and why that is correct.** The only declared gate here
> (`app-guide#gate-1`) is an `observe` gate over the studio vitest suite, which does not touch the
> desktop sidecar or the drive guard. Binding leg 5 to it would be a false binding; minting a second
> observe gate over source that does not exist at HEAD would be precisely the rubber-stamp
> ADR-0097 §2
> bans. So the leg is `machine` and UNBOUND: `resolveWitness` reports it `refused` — *a binding gap the
> author must close when the stretch capability is built*, which is the honest state, not a defect to
> paper over. It still blocks the crown.
>
> **Leg 4 was `human` on the NO-COMPILER basis, and on that basis alone** — not spend (nothing here is
> billed), not liveness, not a missing harness: "does this read as ONE continuous conversation" is an
> aesthetic verdict with no oracle. **That was never enough to make it an ACCEPTANCE claim, which is
> the question ADR-0348 D6 puts FIRST**, and is why the leg is now deleted rather than merely correctly
> tagged. The mechanical halves it used to also assert — the scrollback appends, the input grows, the
> reset clears — were never restated as human success conditions, because each had a machine leg (1, 2,
> 3) pointing at it; restating a compiled fact as something the owner signs would launder it into an
> unrepeatable signature. That rule is unweakened.
>
> The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays WITHHELD; the crown derives from the gate's declared
> capability coverage and leg 5's future binding. There is no longer a story-tier attestation in it.

**Goal —** A member opens the desktop chat panel, holds a multi-turn conversation whose scrollback
persists, edits a comfortable multi-line prompt in an input that grows, and resets to a fresh surface —
the panel reading and behaving like one continuous conversation throughout.

> **PRECONDITION SCOPE NOTE (recorded 2026-07-26, alongside the ADR-0209 D8 re-adjudication) — the chat
> surface is DORMANT, so "a member opens the desktop chat panel" is not walkable today.** `ChatDock` is
> imported by NO non-test source file: `apps/studio/src/components/ChatDock.tsx` is rendered only from
> `ChatDock.test.tsx` / `ChatDock.reload.test.tsx`, and `ChatPanel` is mounted only by that dock (and by
> its own vitest files). **ADR-0174** gave the dock slot to the embedded terminal —
> `apps/studio/src/components/TreeView.tsx:2561` states it outright: *"the same dock slot the chat used
> (ADR-0174 terminal pivot; ChatDock stays dormant in the tree for a future app-guide, ADR-0175)"*. The
> BACKEND half is still live (`apps/desktop/electron/backend-entry.ts` still mounts `createChatSseMount`
> → `POST /api/chat`); it is the FRONTEND mount that is gone. Consequences, kept explicit so nobody
> reads a false precondition into a spec: **(a)** legs 1–3 are unaffected — the studio vitest suite
> renders the components directly under jsdom and never needs the app to mount them, which is why they
> stay machine and stay green-able; **(b)** leg 4 (the FEEL judgment) genuinely could not be walked
> until the deferred concierge build re-mounts the surface — it was human because it was irreducible,
> and *separately* it was unwalkable; those are two different facts and neither implies the other.
> **ADR-0348 D6 deleted that leg on 2026-08-11, on the first fact and not the second** — an experience
> property is not an acceptance criterion whether or not anyone can currently walk it; the intent and
> the never-walked record are preserved under "The conversational feel";
> **(c)** leg 5's re-adjudication to `machine` makes it walkable WITHOUT the UI at all (it drives the
> sidecar route + the drive guard in-process), which is a real gain, not a workaround.

### ADR-0294 disposition of the five original criteria

**Three of five deleted (2026-08-08) as D2 duplicates.** Legs 1–3 were the cleanest instance of D2's
shape in this cluster: each named its own capability BY NAME in its own success clause ("the named
studio suite tests provide positive, deterministic evidence for this `multi-turn-transcript` /
`auto-grow-input` / `transcript-reset` behaviour"), and each bound to `app-guide#gate-1`, whose
command — `pnpm --filter studio test` — is the command that greens those three capabilities. The
duplication was authored and declared, not inferred. Each deletion was checked against the suite's
actual test titles, which are prefixed by capability (`mtt-` / `agi-` / `tr-`) and map one-to-one.

**The surviving numbers are deliberately NOT closed up.** `1`, `2` and `3` are burned: never reused,
never backfilled. The single reliability gate is likewise NOT renumbered, and is now unclaimed by any
criterion — gate ids are positional, so removing it would silently re-point already-signed verdicts
(`asset:edit-story-uat-criteria`).

| original leg | criterion id | disposition |
|---|---|---|
| 1. **The transcript persists across turns** | `uatc_68cf75456b5e5d05de9ec7d2` | **Delete as duplicate.** [`multi-turn-transcript`](multi-turn-transcript.md), `apps/studio/src/components/ChatPanel.test.tsx`: **“mtt-appends-not-replaces: a second send appends a new exchange without discarding the first — both present, in order, newest last”** asserts append-not-replace and prior-exchanges-stay-visible; **“mtt-echoes-each-prompt: each send appends its `› <prompt>` echo line above its reply, per turn”** asserts the echo; **“mtt-auto-scrolls-to-newest …”** asserts the auto-scroll. Every clause, one-to-one. |
| 2. **The input grows and caps** | `uatc_900ddbae4fabec17da85c4c6` | **Delete as duplicate.** [`auto-grow-input`](auto-grow-input.md), same file: **“agi-recomputes-height-from-content …”** asserts the height recompute, **“agi-caps-height-and-scrolls-internally: past a max height the textarea clamps at the cap and scrolls inside itself”** asserts the cap and internal scrolling, and **“agi-keeps-enter-send-shift-enter-newline …”** asserts the preserved keybindings. |
| 3. **Reset clears and aborts** | `uatc_9f5912771ca744fcae515a44` | **Delete as duplicate.** [`transcript-reset`](transcript-reset.md), same file: **“tr-clears-transcript-to-idle: clicking reset empties the transcript back to the idle empty state (input cleared + re-enabled + resting height)”** asserts clear-to-idle and the resting height, and **“tr-aborts-in-flight-stream: clicking reset mid-stream aborts the in-flight stream (the passed signal is aborted) and leaves no ghost reply …”** asserts the abort and the no-ghost-reply clause. |
| 4. **It reads like one continuous conversation** | `uatc_912f608f4b58430b772cec95` | ~~**Keep, untouched — not this increment's to move.** An ADR-0294 D3 appearance verdict, owned by the D3 increment (chip `task_99f7e0a9`).~~ **DELETED 2026-08-11 by ADR-0348 D6 — the reservation is RETIRED, and that chip's claim on this leg is discharged.** The reservation held because the leg's disposition was still open: D3 would have RELOCATED it to the capability whose look it is. ADR-0348 D6 IS that adjudication, and it went the other way — the owner ruled a user EXPERIENCE property is not a user ACCEPTANCE criterion, so the disposition changed from relocate to DELETE and there is nothing left for chip `task_99f7e0a9` to move here. ADR-0294 D3 still governs where an appearance verdict lives WHEN one is worth carrying; it is the "every one of them must be relocated" reading that is withdrawn. The design intent is carried in "The conversational feel" below. |
| 5. **A wedged backend session recovers** | `uatc_5102b68997d2cd5fdbf4e954` | **Keep.** Not a duplicate: the two assertions its capability [`backend-chat-reset-route`](backend-chat-reset-route.md) declares — `bcr-clears-the-composition-guard` and `bcr-falls-through-not-404s` — exist in the SPEC only. Searched the whole tree outside `stories/**` on 2026-08-08: neither name appears in any `.ts`/`.tsx` file, so the stretch capability is unbuilt and nothing proves this leg. It stays deliberately UNBOUND and fails closed, exactly as its own note already argued. |

### The conversational feel — design intent, deliberately NOT a UAT leg (ADR-0348 D6)

The appearance intent that stood as leg 4 until 2026-08-11 is recorded here so it is not lost with its
leg. **Holding a real conversation on the mounted panel inside the native desktop shell, the WHOLE
surface should read as ONE continuous conversation — not as a sequence of separate exchanges sharing a
box.** Machine legs 1–3 pinned the mechanical halves this leg used to also assert (the scrollback
appends and auto-scrolls, the input grows and caps, the reset clears and aborts), and those three legs
were themselves deleted as ADR-0294 D2 duplicates once their capabilities' suites were confirmed to
assert them one-to-one — so the behaviour is still proven, one rung down, by
[`multi-turn-transcript`](multi-turn-transcript.md), [`auto-grow-input`](auto-grow-input.md) and
[`transcript-reset`](transcript-reset.md) under `app-guide#gate-1`. What has never had a compiler is
whether the result READS right, and under ADR-0348 D6 that is not an acceptance criterion at all: it is
continuous owner feedback gathered through use.

**This intent was never walked, and that is a DEFERRAL, not a pass.** The record matters more here than
usual, because the leg's deletion removes the only place it was written down. `ChatDock` is imported by
no non-test source file: **ADR-0174** gave the dock slot to the embedded terminal and **ADR-0175** held
the concierge build as a deferred future slice, so there is no mounted panel on which to hold the
conversation this intent describes (`apps/studio/src/components/TreeView.tsx:2561` records the swap; the
BACKEND half still mounts `createChatSseMount`, it is the FRONTEND mount that is gone). So nobody has
ever judged this surface, nobody was ever going to under the current build, and the absence of a verdict
must not later be misread as approval (ADR-0348 Consequences). When the deferred concierge build
re-mounts the panel, this paragraph is the brief for what it should feel like.

5. **(OPTIONAL / STRETCH) A wedged backend session recovers without a restart.** _(criterion-id: uatc_5102b68997d2cd5fdbf4e954)_ _(revision-id: uatr1:c5941a43069cb8fa)_
   _(witness: machine)(detail: app-guide#uat-5)_ With the drive composition single-session guard in the
   in-flight state, a `POST /api/chat/reset` on the chat sidecar clears it and a subsequent session is
   admitted — no app restart. **Success —** the route answers `200`, the guard
   (`compositionInFlight`, `packages/drive/src/orchestrate.ts:142`) is observably cleared against the REAL
   drive export, a subsequent composition is admitted where it was previously refused, and the dispatcher
   still returns `false` for every other path/method so the sibling dispatchers and the 404 still fire.
   The stretch label controls prioritisation only: as a normal authored UAT criterion this leg remains
   crown-blocking until discharged. *(RE-ADJUDICATED human → machine 2026-07-26 (ADR-0209 D8). It was
   human on the words "witnessed on the live surface" — a FIDELITY/harness claim, not a judgment gap
   (`human-witness-is-a-judgment-gap-not-cost`). Every condition above is decidable, and
   [`backend-chat-reset-route`](backend-chat-reset-route.md) already authors it as
   `bcr-clears-the-composition-guard` + `bcr-falls-through-not-404s`, driven over a loopback `node:http`
   server against the real drive guard — no Electron, no live app, no spend. **No proof-gate annotation
   is named on purpose:** `app-guide#gate-1` observes the studio vitest suite, which never touches this
   surface, and minting an observe gate over source absent at HEAD is the rubber-stamp ADR-0097 §2 bans.
   Per ADR-0209 §6 the leg is UNSTAMPED — this records which witness is RIGHT, not that a proof exists.)*

End state — the desktop chat panel reads and behaves like one continuous conversation: a persistent
multi-turn scrollback, an input that grows and resets cleanly, the caps' behaviours signed under the studio
suite, the backend wedge-recovery machine-observed, and the conversational FEEL operator-attested — the
panel never breaching the thin-client wall. The concierge behaviour that rides this substrate is the
deferred future slice (ADR-0175).

## Reliability Gates

The three thin-client capabilities are **brownfield**: `apps/studio/src/components/ChatPanel.tsx` +
`apps/studio/src/api.ts` carry a real, passing studio VITEST suite that observationally verifies the
transcript / input-grow / reset+abort behaviour, but storytree's own prove-it-gate never DROVE those
proofs red→green — the caps landed **built-but-unregistered** (a passing real-arm test, no signed `--real`
verdict). So the honest path off `mapped` is **not** a fail-closed `--real` Build over mature, already-green
source (that HALTS on the green base) — it is the author-declared **reliability gate** below,
observe-and-signed to an `adopted` verdict
(ADR-0085):
the `mapped → healthy` **Adopt** transition
(ADR-0094 /
ADR-0097).
Distinct from `## UAT Test Criteria` above (the integrated continuous-conversation journey): this gate is the
machine-observable reliability floor — the two-stage frontend-builder split
(ADR-0070):
the gate covers the caps' machine GEOMETRY; the "reads like one continuous conversation" FEEL is carried
by no leg at all since ADR-0348 D6 deleted it (2026-08-11) — it is design intent under "The
conversational feel", answered by the owner using the app, and is still never machine-asserted here.
*(History: this read "legs", plural, until 2026-07-26, when the ADR-0209 D8 re-adjudication left leg 4
as the story's ONLY human leg; D6 then removed that one too.)*

1. **The studio suite is green** _(gate: observe)_ _(covers: multi-turn-transcript, auto-grow-input, transcript-reset)_ `pnpm --filter studio test`. The
   spine runs the studio VITEST suite at a clean committed HEAD and OBSERVES it green, then signs an
   `adopted` verdict (`storytree adopt app-guide --pg`). The suite genuinely exercises all three
   thin-client caps in `apps/studio/src/components/ChatPanel.test.tsx` (jsdom, `@testing-library/react`,
   the `api` streaming seam mocked/scripted across multiple sends, fake timers, the scroll/height refs
   spied — no real fetch / socket / SDK / DB / Electron): **multi-turn-transcript** (the append-not-replace
   scrollback + per-turn prompt echo + per-entry terminal-kind render + tail-entry delta streaming +
   scroll-to-newest recompute — `mtt-appends-not-replaces` / `mtt-echoes-each-prompt` /
   `mtt-renders-each-terminal-kind-as-an-entry` / `mtt-streams-delta-into-the-tail-entry` /
   `mtt-auto-scrolls-to-newest`), **auto-grow-input** (the onChange height-recompute-from-`scrollHeight`,
   the max-height cap + internal overflow, and the KEEP of the Enter=send / Shift+Enter=newline
   keybindings), and **transcript-reset** (clear-to-idle + abort the in-flight stream + the
   `api.chatStream(intent, onEvent, signal?)` signal threading onto `fetch` — `tr-clears-transcript-to-idle`
   / `tr-aborts-in-flight-stream` / `tr-threads-abort-signal-through-api`), all offline (no DB, no API key).
   The three caps green via this gate's `(covers:)` (ADR-0097 §5). This is the two-stage proof (ADR-0070):
   the gate proves the machine GEOMETRY/BEHAVIOUR only; the conversational FEEL (does the growing scrollback
   / the clean reset read like one continuous conversation) is design intent under "The conversational
   feel" — formerly Story UAT leg 4, deleted by ADR-0348 D6 — and is never machine-asserted here.

The OPTIONAL / STRETCH `backend-chat-reset-route` cap is deliberately **left uncovered**: it is a desktop
sidecar/drive `node:test` unit (not thin-client), its backend-wedge-recovery behaviour is UNBUILT (no
`apps/desktop/src/backend/chat-reset-route.test.ts`), so an `observe` gate over it would be exactly the
rubber-stamp ADR-0097 §2 bans. It therefore keeps the crown at `proposed` alongside its backing Story-UAT
leg (leg 5, backend-wedge recovery) — the owner's optional stretch. *(Re-adjudicated 2026-07-26: leg 5 is
now `witness: machine` and, for exactly the reason stated in this paragraph, carries NO proof-gate
binding — there is no honest observe gate to name until the capability is built. `resolveWitness`
therefore reports it `refused`: an open binding gap, which is the truthful state of an unbuilt stretch
unit, not a defect to paper over with a fabricated gate.)* The OPTIONAL / STRETCH label does not remove
either normal obligation: until the capability is healthy and leg 5 is discharged, the crown remains
blocked. Adopting
this one gate flips the story off `mapped`; `healthy` stays non-authorable
(ADR-0020) — the world's crown
DERIVES green from the signed verdicts and only when every capability is healthy AND every own-proof
obligation is signed
(ADR-0083
Fork A + ADR-0085), so the crown honestly reads `unproven` until the owner takes up the backend-wedge
stretch (its cap + leg 5).

## Proof

The present slice is proven when that walkthrough passes: deterministic behaviour legs 1–3 sign through
their exact `app-guide#gate-1` observe binding, and the same signed gate derives
`multi-turn-transcript`, `auto-grow-input`, and `transcript-reset` healthy through its declared
`(covers:)` list. No separate per-capability `--real` verdict is claimed. The holistic
conversational-feel judgment is no longer a leg at all — ADR-0348 D6 deleted it on 2026-08-11 as an
experience rather than an acceptance claim; its intent lives under "The conversational feel".
Backend-wedge-recovery leg 5 is `witness: machine` (re-adjudicated
2026-07-26, ADR-0209 D8) and awaits the binding it can only honestly acquire once
`backend-chat-reset-route` is built. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts;
nothing here is authored healthy. The story's machine-driven UAT node is WITHHELD (`uat_witness` is
absent → human, ADR-0040), so the crown awaits the gate-backed capability coverage and leg 5's future
machine observation. No story-tier attestation remains. Capability 4 is OPTIONAL/STRETCH only in
prioritisation: because it and UAT leg 5 are normal authored obligations, holding that work keeps the
story unproven. The concierge
onboarding/wiring behaviour that rides this substrate is the DEFERRED app-guide build (ADR-0175); its
capabilities and wire-and-verify UAT are authored when that build is picked up.
