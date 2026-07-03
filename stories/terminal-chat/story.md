---
id: "terminal-chat"
tier: story
title: "The desktop chat panel feels like a terminal"
outcome: "The desktop chat panel reads and behaves like one continuous terminal — a persistent multi-turn scrollback of prompt-and-reply, an input that grows to its content and resets cleanly — so a member converses with the agent as they would in a shell, not through a single replace-on-send exchange."
status: proposed
proof_mode: UAT
# uat_witness ABSENT → human (ADR-0040 fail-closed signpost): the whole-story UAT — "does the panel read
# like one continuous terminal" — is APPEARANCE/FEEL, operator-attested (ADR-0070). The machine-driven
# story UAT node stays WITHHELD; the crown derives from the capabilities' signed verdicts plus the
# operator's attestation of the terminal-feel legs.
# Capabilities, roots-first. The three thin-client caps edit the SAME component (apps/studio/src/
# components/ChatPanel.tsx) + its test, so they are SEQUENCED (multi-turn-transcript → auto-grow-input →
# transcript-reset) to build on each other's committed source in ONE shared --real worktree (ADR-0057 §3
# expansion D). The fourth (backend-chat-reset-route) is OPTIONAL/STRETCH — sidecar/drive, may be HELD.
capabilities: [multi-turn-transcript, auto-grow-input, transcript-reset, backend-chat-reset-route]
# Story-level cross-story edges (ADR-0010 §4 / ADR-0074):
#   - studio  — the chat panel IS a studio frontend component (apps/studio/src/components/ChatPanel.tsx,
#               the studio-story `chat-panel` capability). The three thin-client caps EDIT that studio
#               component + apps/studio/src/api.ts. So terminal-chat is a follow-on that extends studio's
#               chat-panel surface — a real code edge into apps/studio/src. The panel is proven under the
#               studio VITEST suite; the terminal FEEL is witnessed inside the desktop app (the consuming
#               surface, ADR-0070 / the desktop story's leg-7 precedent).
#   - drive-machinery — ONLY the OPTIONAL backend-chat-reset-route cap consumes drive (the exported
#               composition guard-reset it calls). The three thin-client caps do NOT touch drive (the
#               thin-client wall, modelPathBoundary.test.ts). If the stretch cap is HELD, this edge is
#               dormant; it is declared so the cap is buildable when picked up (ADR-0074 "declare the edge").
depends_on: [studio, drive-machinery]
# Deciding ADRs (ADR-0037 §2): 0137 (the Phase-3 chat-spawn arc whose live UAT walk surfaced this
# feedback, 2026-07-03); 0108 (the chat surface + read/propose-only wall the panel rides); 0070 (the
# two-stage frontend-builder proof — geometry machine-proven, appearance operator-attested); 0010 (the
# organism model + the splitting-rule that tiers these units); 0004 (the thin-client / agent boundary the
# panel must not breach); 0057 (the spec-borne proof config making each cap buildable).
decisions: [137, 108, 70, 10, 4, 57]
---

# The desktop chat panel feels like a terminal

**Outcome —** The desktop chat panel reads and behaves like one continuous terminal — a persistent
multi-turn scrollback of prompt-and-reply, an input that grows to its content and resets cleanly — so a
member converses with the agent as they would in a shell, not through a single replace-on-send exchange.

This story captures **owner feedback from a live ADR-0137 Phase-3 UAT walk (2026-07-03)**: driving the
desktop chat panel for real, the owner found it did not feel like a terminal. Three concrete gaps, one
journey:

1. **The input feels separate from the output.** Today the panel renders ONE prompt-echo (`› what you
   typed`) + one reply that is REPLACED on the next send — no persistent scrollback (the single-exchange
   `submitted`/`phase` model in `apps/studio/src/components/ChatPanel.tsx`). It should be **one continuous
   terminal**: each send APPENDS `› <prompt>` then its reply, flowing top-to-bottom in one scrollable
   surface, input pinned flush at the bottom, auto-scrolling to the newest line.
2. **The input is one non-expandable row.** The textarea is hard-coded `rows={1}` with no grow logic. It
   should **auto-grow** to its content up to a max height, then scroll inside itself — while KEEPING the
   existing Enter=send / Shift+Enter=newline keybindings.
3. **There is no reset.** A **reset** should clear the transcript back to idle AND abort the in-flight SSE
   stream (an `AbortController` threaded into `api.chatStream`) — with an OPTIONAL backend
   `POST /api/chat/reset` to clear the wedged single-session guard without an app restart.

**Owner-directed, no design fork (ADR-0110).** This is a straight build of directed feedback — the owner
named all three fixes in the live UAT walk. There is no open architectural fork here; the only judgement
calls (the tier of each fix, the sequencing, the optional-vs-required split) are the story-author's layout
domain, decided below. No ADR is reserved for this story.

## The journey (why this is ONE story — the journey-principle)

The consumer is the member chatting inside the desktop app; their goal is that **the chat panel feels like a
terminal**. Finishing "the transcript persists across turns" leaves the member immediately wanting the input
to grow (a terminal input is not one fixed row) and a reset (a terminal clears). These are not three
separate value deliveries — they are one terminal-feel journey, so they are one story (the journey-principle:
if finishing the first unit's journey leads the consumer straight to needing the next, they are the same
journey). The outcome states in one sentence without conjunctions: *the panel reads and behaves like one
continuous terminal.*

## Capabilities (4)

Listed roots-first (a capability appears after everything it depends on).

| # | capability | outcome | proof | depends on |
|---|------------|---------|-------|------------|
| 1 | [`multi-turn-transcript`](multi-turn-transcript.md) | Each send appends a `› <prompt>` echo + its streamed reply into one persistent, scrollable transcript that auto-scrolls to the newest line — prior exchanges stay, never replaced. | integration-test (studio vitest, red→green) | — |
| 2 | [`auto-grow-input`](auto-grow-input.md) | The input textarea grows to fit its content up to a cap, then scrolls internally — Enter still sends, Shift+Enter still inserts a newline. | integration-test (studio vitest, red→green) | `multi-turn-transcript` |
| 3 | [`transcript-reset`](transcript-reset.md) | A reset control clears the transcript to idle AND aborts the in-flight SSE stream (an `AbortSignal` threaded through `api.chatStream` into `fetch`). | integration-test (studio vitest, red→green) | `multi-turn-transcript`, `auto-grow-input` |
| 4 | [`backend-chat-reset-route`](backend-chat-reset-route.md) **(OPTIONAL / STRETCH)** | A `POST /api/chat/reset` sidecar route clears the backend composition single-session guard so a wedged session recovers without an app restart. | integration-test (desktop node:test, red→green) | — (cross-story: drive-machinery) |

**Capability 4 is OPTIONAL / STRETCH and MAY BE HELD.** The story's UAT is satisfiable without it (the
thin-client reset in `transcript-reset` clears the panel and aborts the CLIENT stream; the "New chat"
affordance works). Cap 4 recovers a genuinely WEDGED BACKEND session — a stretch that lands separately, only
if/when the owner asks for backend-wedge recovery. Do NOT auto-build it in the same chain as caps 1–3.

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
  studio VITEST suite (jsdom, `@testing-library/react`), exactly as `chat-panel` is. So `terminal-chat` is a
  FOLLOW-ON that extends studio's chat-panel surface; the terminal FEEL is witnessed inside the DESKTOP app
  (the consuming surface, the desktop story's operator-attested leg-7 precedent, ADR-0070). The caps stay
  THIN CLIENTS — no `@storytree/agent` / `@storytree/drive` / model import (the `modelPathBoundary.test.ts`
  wall), so this edge adds no forbidden coupling and no new `@storytree/*` frontend dep.
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

The integrated acceptance walkthrough that proves the whole terminal-chat surface meets its outcome
end-to-end. Minimal-first (one coherent journey: converse over multiple turns → the scrollback persists →
the input grows → reset gives a fresh terminal), defect-driven thereafter (each real failure earns a
permanent regression case, never speculative breadth).

> **Per-leg witness (ADR-0106 / ADR-0070).** The behaviour legs are covered by the capabilities' signed
> `--real` verdicts (studio vitest red→green: append-not-replace, auto-scroll recompute, height recompute +
> cap, clear-to-idle + abort, the signal threading). The FEEL legs — "does the panel read like one
> continuous terminal", "does the growing input feel comfortable to edit a pasted multi-line prompt", "does
> reset give a clean fresh terminal" — are `witness: human` (operator-attested, ADR-0070): an automated CI
> run cannot judge the terminal feel, because jsdom lays out no pixels and the look is subjective. The
> story-level `uat_witness` is absent → human (the ADR-0040 fail-closed signpost), so the machine-driven
> whole-story UAT node stays WITHHELD; the crown derives from the per-cap signed verdicts plus the
> operator's attestations of the feel legs.

**Goal —** A member opens the desktop chat panel, holds a multi-turn conversation whose scrollback persists,
edits a comfortable multi-line prompt in an input that grows, and resets to a fresh terminal — the panel
reading and behaving like one continuous terminal throughout.

1. **The transcript persists across turns.** _(witness: machine for the behaviour; human for the feel)_ The
   member sends several prompts in a row; each `› <prompt>` echo and its reply APPENDS below the last, prior
   exchanges stay visible, and the surface auto-scrolls to the newest line. **Success —** a persistent
   multi-turn scrollback, never a replace-on-send exchange. (The behaviour is `multi-turn-transcript`'s
   signed verdict; the "reads like one continuous terminal" FEEL is operator-attested.)
2. **The input grows and caps.** _(witness: machine for the recompute; human for the feel)_ The member types
   / pastes a multi-line prompt; the input grows to fit up to a max, then scrolls inside itself; plain Enter
   sends, Shift+Enter inserts a newline. **Success —** a comfortable multi-line input. (The recompute + cap +
   keybinding-keep is `auto-grow-input`'s signed verdict; the "comfortable to edit" FEEL is
   operator-attested.)
3. **Reset gives a fresh terminal.** _(witness: machine for clear+abort; human for the feel)_ The member
   clicks reset mid-conversation; the transcript clears to idle, the in-flight stream aborts (no ghost
   reply), and the input returns to its resting one-row height. **Success —** a clean fresh terminal without
   an app restart. (The clear-to-idle + abort is `transcript-reset`'s signed verdict; the "feels like a
   fresh terminal" FEEL is operator-attested.)
4. **It reads like one continuous terminal.** _(witness: human)_ Across the whole conversation — the
   growing scrollback, the pinned-flush input, the reset — the panel reads and behaves as ONE coherent
   terminal inside the native desktop shell. **Success —** the owner's two-stage visual verdict (ADR-0070):
   the terminal feel is witnessed, not machine-asserted.
5. **(OPTIONAL / STRETCH) A wedged backend session recovers without a restart.** _(witness: human)_ If the
   backend single-session guard is stuck (a wedged composition), a `POST /api/chat/reset` clears it and chat
   resumes without restarting the app. **Success —** backend-wedge recovery. (Behaviour is
   `backend-chat-reset-route`'s signed verdict when that stretch cap is built; the leg is MOOT / not
   required while the cap is held.)

End state — the desktop chat panel reads and behaves like one continuous terminal: a persistent multi-turn
scrollback, an input that grows and resets cleanly, the caps' behaviours signed under the studio suite and
the terminal FEEL operator-attested — the panel never breaching the thin-client wall.

## Proof

The story is proven when that walkthrough passes — the behaviour legs (1–3, and 5 if the stretch cap is
built) green under the capabilities' signed `--real` verdicts (studio vitest / desktop node:test red→green,
with each cap's contracts green underneath), and the FEEL legs (1-feel, 2-feel, 3-feel, and 4) operator-
attested. Per ADR-0020, `healthy` is only ever DERIVED from signed verdicts; nothing here is authored
healthy. The three thin-client capabilities are proof-wired (each carries a `proof:` block with a
`real:` arm — a brownfield red→green over the existing `ChatPanel.tsx` / `api.ts`) so the spine can drive
their studio suites red→green under its own gate; the story's machine-driven UAT node is WITHHELD (its
`uat_witness` is absent → human, ADR-0040), so driving those capabilities to signed verdicts is what makes
the terminal-chat surface buildable, and the crown additionally awaits the operator's attestations
(legs 1-feel, 2-feel, 3-feel, 4). Capability 4 is OPTIONAL/STRETCH — leg 5 is moot while it is held.
