---
id: "app-guide"
tier: story
title: "The app-guide concierge wires a newcomer's Claude Code into the observability layer"
outcome: "A newcomer opening the desktop app is guided by a conversational concierge from a fresh machine to a Claude Code session wired into the observability layer — install, authenticate, point at the repo, wire the presence hooks — until a wisp lights on the map confirming they are now watched."
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
# chat surface read as one continuous conversation" — is APPEARANCE/FEEL, operator-attested (ADR-0070).
# The machine-driven story UAT node stays WITHHELD; the crown derives from the capabilities' signed
# verdicts plus the operator's attestation of the concierge-chat feel legs.
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
#               consuming surface, ADR-0070 / the desktop story's leg-7 precedent).
#   - drive-machinery — ONLY the OPTIONAL backend-chat-reset-route cap consumes drive (the exported
#               composition guard-reset it calls). The three thin-client caps do NOT touch drive (the
#               thin-client wall, modelPathBoundary.test.ts). If the stretch cap is HELD, this edge is
#               dormant; it is declared so the cap is buildable when picked up (ADR-0074 "declare the edge").
#   - desktop (ADR-0192 landlord rule) — the backend-chat-reset-route cap's proof sources live in the
#               desktop's territory (apps/desktop/src/backend/chat-reset-route.ts): a hosted-seam edge,
#               annotated below.
depends_on: [studio, drive-machinery, desktop]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, drive-machinery, desktop]
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

**Capability 4 is OPTIONAL / STRETCH and MAY BE HELD.** The story's present-slice proof is satisfiable
without it (the thin-client reset in `transcript-reset` clears the panel and aborts the CLIENT stream;
the "New chat" affordance works). Cap 4 recovers a genuinely WEDGED BACKEND session — a stretch that
lands separately, only if/when the owner asks for backend-wedge recovery. Do NOT auto-build it in the
same chain as caps 1–3.

### Future slice — the concierge behaviour itself (NOT YET CAPABILITIES; prose only, ADR-0175 deferred)

The onboarding/wiring journey — orient the newcomer, answer help/advice, walk install → auth →
point-at-repo → presence-hook wiring, and verify a wisp lights — is the **deferred** app-guide build
(ADR-0175). It will likely need FURTHER capabilities when it is picked up, for example: a
setup-scoped-write fence for config/hooks (ADR-0175's "narrow writes" note; the same fail-closed
path-fence discipline the retired glue actuator used, ADR-0160 D2), a wire-and-verify walkthrough that
confirms a wisp actually lights on the map, and the re-aim of the `headless-orchestrator` SDK session
engine + the read-only inspect surface (`inspect-tool-surface.ts`) as the concierge's caller. Those are
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
  DESKTOP app (the consuming surface, the desktop story's operator-attested leg-7 precedent, ADR-0070). The
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

## Story UAT

The integrated acceptance walkthrough that proves the present chat-substrate slice meets its outcome
end-to-end. Minimal-first (one coherent journey: converse over multiple turns → the scrollback persists →
the input grows → reset gives a fresh conversation), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Present slice only — the concierge onboarding UAT is deferred (ADR-0175).** This walkthrough proves
> the continuous-conversation chat SUBSTRATE (the four caps). The full concierge journey — orient →
> help/advise → wire the user's Claude Code → verify a wisp lights — is the DEFERRED app-guide build; its
> wire-and-verify UAT is authored with that build, alongside the future-slice capabilities named above.

> **Per-leg witness (ADR-0106 / ADR-0070).** The behaviour legs are covered by the capabilities' signed
> `--real` verdicts (studio vitest red→green: append-not-replace, auto-scroll recompute, height recompute +
> cap, clear-to-idle + abort, the signal threading). The FEEL legs — "does the panel read like one
> continuous conversation", "does the growing input feel comfortable to edit a pasted multi-line prompt",
> "does reset give a clean fresh surface" — are `witness: human` (operator-attested, ADR-0070): an
> automated CI run cannot judge the conversational feel, because jsdom lays out no pixels and the look is
> subjective. The story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the
> machine-driven whole-story UAT node stays WITHHELD; the crown derives from the per-cap signed verdicts
> plus the operator's attestations of the feel legs.

**Goal —** A member opens the desktop chat panel, holds a multi-turn conversation whose scrollback
persists, edits a comfortable multi-line prompt in an input that grows, and resets to a fresh surface —
the panel reading and behaving like one continuous conversation throughout.

1. **The transcript persists across turns.** _(witness: machine for the behaviour; human for the feel)_ The
   member sends several prompts in a row; each `› <prompt>` echo and its reply APPENDS below the last, prior
   exchanges stay visible, and the surface auto-scrolls to the newest line. **Success —** a persistent
   multi-turn scrollback, never a replace-on-send exchange. (The behaviour is `multi-turn-transcript`'s
   signed verdict; the "reads like one continuous conversation" FEEL is operator-attested.)
2. **The input grows and caps.** _(witness: machine for the recompute; human for the feel)_ The member types
   / pastes a multi-line prompt; the input grows to fit up to a max, then scrolls inside itself; plain Enter
   sends, Shift+Enter inserts a newline. **Success —** a comfortable multi-line input. (The recompute + cap +
   keybinding-keep is `auto-grow-input`'s signed verdict; the "comfortable to edit" FEEL is
   operator-attested.)
3. **Reset gives a fresh surface.** _(witness: machine for clear+abort; human for the feel)_ The member
   clicks reset mid-conversation; the transcript clears to idle, the in-flight stream aborts (no ghost
   reply), and the input returns to its resting one-row height. **Success —** a clean fresh conversation
   without an app restart. (The clear-to-idle + abort is `transcript-reset`'s signed verdict; the "feels like
   a fresh start" FEEL is operator-attested.)
4. **It reads like one continuous conversation.** _(witness: human)_ Across the whole conversation — the
   growing scrollback, the pinned-flush input, the reset — the panel reads and behaves as ONE coherent
   conversational surface inside the native desktop shell (the concierge-chat feel). **Success —** the
   owner's two-stage visual verdict (ADR-0070): the conversational feel is witnessed, not machine-asserted.
5. **(OPTIONAL / STRETCH) A wedged backend session recovers without a restart.** _(witness: human)_ If the
   backend single-session guard is stuck (a wedged composition), a `POST /api/chat/reset` clears it and chat
   resumes without restarting the app. **Success —** backend-wedge recovery. (Behaviour is
   `backend-chat-reset-route`'s signed verdict when that stretch cap is built; the leg is MOOT / not
   required while the cap is held.)

End state — the desktop chat panel reads and behaves like one continuous conversation: a persistent
multi-turn scrollback, an input that grows and resets cleanly, the caps' behaviours signed under the studio
suite and the conversational FEEL operator-attested — the panel never breaching the thin-client wall. The
concierge behaviour that rides this substrate is the deferred future slice (ADR-0175).

## Reliability Gates

The three thin-client capabilities are **brownfield**: `apps/studio/src/components/ChatPanel.tsx` +
`apps/studio/src/api.ts` carry a real, passing studio VITEST suite that observationally verifies the
transcript / input-grow / reset+abort behaviour, but storytree's own prove-it-gate never DROVE those
proofs red→green — the caps landed **built-but-unregistered** (a passing real-arm test, no signed `--real`
verdict). So the honest path off `mapped` is **not** a fail-closed `--real` Build over mature, already-green
source (that HALTS on the green base) — it is the author-declared **reliability gate** below,
observe-and-signed to an `adopted` verdict
([ADR-0085](../../docs/decisions/0085-resolve-adr-0083-fork-b-brownfield-reliability-gates-author.md)):
the `mapped → healthy` **Adopt** transition
([ADR-0094](../../docs/decisions/0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) /
[ADR-0097](../../docs/decisions/0097-brownfield-go-green-is-a-proving-process-adopt-enters-brown.md)).
Distinct from `## Story UAT` above (the integrated continuous-conversation journey): this gate is the
machine-observable reliability floor — the two-stage frontend-builder split
([ADR-0070](../../docs/decisions/0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)):
the gate covers the caps' machine GEOMETRY; the "reads like one continuous conversation" FEEL stays the
Story UAT's operator-attested `witness: human` legs.

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
   / the clean reset read like one continuous conversation) is the Story UAT's operator-attested
   `witness: human` legs (1-feel, 2-feel, 3-feel, 4), never machine-asserted here.

The OPTIONAL / STRETCH `backend-chat-reset-route` cap is deliberately **left uncovered**: it is a desktop
sidecar/drive `node:test` unit (not thin-client), its backend-wedge-recovery behaviour is UNBUILT (no
`apps/desktop/src/backend/chat-reset-route.test.ts`), so an `observe` gate over it would be exactly the
rubber-stamp ADR-0097 §2 bans. It therefore keeps the crown at `proposed` alongside its backing
`witness: human` Story-UAT leg (leg 5, backend-wedge recovery) — the owner's optional stretch. Adopting
this one gate flips the story off `mapped`; `healthy` stays non-authorable
([ADR-0020](../../docs/decisions/0020-red-green-enforcement-on-the-owned-loop.md)) — the world's crown
DERIVES green from the signed verdicts and only when every capability is healthy AND every own-proof
obligation is signed
([ADR-0083](../../docs/decisions/0083-author-defined-story-green-declared-obligations-machine-per.md)
Fork A + ADR-0085), so the crown honestly reads `unproven` until the owner takes up the backend-wedge
stretch (its cap + leg 5).

## Proof

The present slice is proven when that walkthrough passes — the behaviour legs (1–3, and 5 if the stretch cap
is built) green under the capabilities' signed `--real` verdicts (studio vitest / desktop node:test
red→green, with each cap's contracts green underneath), and the FEEL legs (1-feel, 2-feel, 3-feel, and 4)
operator-attested. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is
authored healthy. The three thin-client capabilities are proof-wired (each carries a `proof:` block with a
`real:` arm — a brownfield red→green over the existing `ChatPanel.tsx` / `api.ts`) so the spine can drive
their studio suites red→green under its own gate; the story's machine-driven UAT node is WITHHELD (its
`uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts is what makes
the continuous-conversation chat surface buildable, and the crown additionally awaits the operator's
attestations (legs 1-feel, 2-feel, 3-feel, 4). Capability 4 is OPTIONAL/STRETCH — leg 5 is moot while it is
held. The concierge onboarding/wiring behaviour that rides this substrate is the DEFERRED app-guide build
(ADR-0175); its capabilities and wire-and-verify UAT are authored when that build is picked up.
