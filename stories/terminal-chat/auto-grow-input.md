---
id: "auto-grow-input"
tier: capability
story: terminal-chat
title: "The chat input auto-grows to its content up to a cap, then scrolls internally — Enter sends, Shift+Enter inserts a newline"
outcome: "The chat input textarea grows in height to fit its content as the operator types or pastes — up to a maximum height, past which it scrolls inside itself — so a multi-line prompt is comfortable to edit, while plain Enter still sends and Shift+Enter still inserts a newline."
status: proposed
proof_mode: integration-test
depends_on: [multi-turn-transcript]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. BROWNFIELD (editsExisting): the textarea EXISTS at
# HEAD hard-coded `rows={1}` with NO grow logic (apps/studio/src/components/ChatPanel.tsx ~line 383). The
# RED the spine observes: an assertion that an onChange runs a height-recompute setting the textarea's
# height from its scrollHeight fails against the rows={1}-no-grow code at HEAD (no recompute exists). The
# actual VISUAL grow is not machine-provable — jsdom does NOT lay out scrollHeight — so the isolatable
# red→green is "onChange runs a height-recompute that sets the element height from a (mocked/stubbed)
# scrollHeight, capped at a max, and toggles internal overflow past the cap", PLUS the KEEP of the
# Enter=send / Shift+Enter=newline keybinding tests (those already exist as cp-enter-submits — they must
# stay green through the grow change). Sequenced AFTER multi-turn-transcript: it edits the SAME source
# file (ChatPanel.tsx), so in the shared --real worktree it builds on the transcript-model version (a
# later node builds on the earlier committed source, ADR-0057 §3 expansion D). FRONTEND-BUILDER TWO-STAGE
# (ADR-0070): the recompute-fires behaviour + the keybinding KEEP are machine-proven; the actual visual
# grow (does it feel comfortable to edit a pasted multi-line prompt) is the story's operator-attested UAT
# leg, NOT a machine visual verdict here. Studio VITEST suite, one-file real proofCommand (chat-panel
# precedent). `install: true` (fresh worktree, ADR-0031 §2).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/src/**/*.test.tsx", "apps/studio/src/**/*.test.ts"]
    sourceGlobs: ["apps/studio/src/**/*.ts", "apps/studio/src/**/*.tsx"]
  real:
    testFile: "apps/studio/src/components/ChatPanel.test.tsx"
    sourceFile: "apps/studio/src/components/ChatPanel.tsx"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/src/components/ChatPanel.test.tsx"]
      sourceGlobs: ["apps/studio/src/components/ChatPanel.tsx"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "src/components/ChatPanel.test.tsx"
---

# The chat input auto-grows to its content up to a cap, then scrolls internally

**Outcome —** The chat input textarea grows in height to fit its content as the operator types or pastes —
up to a maximum height, past which it scrolls inside itself — so a multi-line prompt is comfortable to
edit, while plain Enter still sends and Shift+Enter still inserts a newline.

**Depends on —**
- [`multi-turn-transcript`](multi-turn-transcript.md) — this capability EDITS the SAME source file
  (`apps/studio/src/components/ChatPanel.tsx`), so in the shared `--real` build worktree it builds on the
  transcript-model version of the component (a later node builds on the earlier committed source, ADR-0057
  §3 expansion D). It couples to the same component and the same input row the transcript capability leaves
  pinned below the scrollback. (There is no data-flow coupling — the grow logic does not read the transcript
  state — but the file-level sequencing edge is real and keeps the story buildable in dependency order.)

> **Proof status (honest) — BROWNFIELD, `proposed`.** The input textarea EXISTS at HEAD hard-coded
> `rows={1}` (`ChatPanel.tsx` ~line 383) with NO grow logic. The owner's live ADR-0137 Phase-3 UAT walk
> (2026-07-03) flagged it: "the input is one non-expandable row; it should auto-grow." This capability adds
> the auto-grow while KEEPING the existing Enter/Shift+Enter keybindings.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the INPUT BEHAVIOUR AS A WHOLE — a textarea
that, as its content changes (typed or pasted), recomputes and sets its own height to fit, caps that height
at a maximum and toggles internal scrolling past the cap, AND preserves the terminal keybindings (plain
Enter sends, Shift+Enter inserts a newline). It spans the onChange height-recompute, the cap-and-overflow
branch, and the keybinding preservation — a small integration of behaviours over the real textarea, not a
single isolated assertion. (It is close to the capability/contract line; it is a capability because the
grow + cap + keybinding-preservation is a coherent input BEHAVIOUR with more than one branch, and because
it shares the one component and test file with its story siblings.)

THE ISOLATABLE RED→GREEN — RECOMPUTE FIRES, NOT LAID-OUT PIXELS (the jsdom constraint, load-bearing). The
auto-grow depends on `scrollHeight`, which **jsdom does not lay out** (it returns 0). So the actual visual
grow is NOT machine-provable and is part of the story's operator-attested UAT leg. What IS isolatable and
machine-provable: an onChange handler that RUNS a height-recompute — reads the textarea's `scrollHeight`
(stubbed/mocked in the test to a scripted value), sets the element's height from it, caps it at a MAX, and
toggles `overflow-y` (internal scroll) once the content exceeds the cap. The test drives this by SCRIPTING
`scrollHeight` (defining the property on the element, or spying the height setter) and asserting the
recompute set the height accordingly and switched to internal-scroll past the cap. Pin the BEHAVIOUR (the
recompute runs and respects the cap), never the real pixels.

KEEP THE KEYBINDINGS — ENTER SENDS, SHIFT+ENTER NEWLINES (do NOT regress `cp-enter-submits`). The existing
`onKeyDown` (plain Enter → `preventDefault` + submit; Shift+Enter → fall through to insert a newline;
Cmd/Ctrl+Enter → submit for studio parity) is a load-bearing behaviour the owner explicitly said to KEEP.
The existing `cp-enter-submits` contract (and its empty-intent-guard sibling) must stay green through the
grow change — the grow logic touches height, not the key handling. This capability re-asserts those
keybindings as its own contract so the coverage check credits them under this unit and a regression is
caught here (ADR-0122).

THE `rows={1}` START + GROW-FROM-THERE. The textarea starts at one row (the terminal single-line resting
state) and grows from there as content is added. The recompute must reset-then-measure (set height to
`auto`/a base before reading `scrollHeight`) so DELETING content shrinks the height back down, not just
grows it — a one-directional grow that never shrinks is a defect the test should guard (assert a shrink
when the scripted `scrollHeight` drops). The exact CSS (`.chat-input` in `apps/studio/src/index.css`
~lines 2426–2686) carries the base height, the max-height cap, and the `overflow-y`; the terminal LOOK of
the growing input is operator-attested (no pixel/appearance assertion here).

THE PANEL STAYS A THIN CLIENT — NO AGENT, NO DRIVE, NO MODEL PATH (ADR-0004 / ADR-0108 d.1). This is a
renderer-side input-geometry change only; it imports no agent/drive/model code (the
`modelPathBoundary.test.ts` wall stays green) and touches no wire shape.

TWO-STAGE PROOF (frontend-builder, ADR-0070). This `real:` arm proves the recompute-fires behaviour + the
cap/overflow branch + the keybinding KEEP over a scripted `scrollHeight`. The actual visual grow (is a
pasted multi-line prompt comfortable to edit, does it cap and scroll cleanly) is the story's operator-
attested UAT leg — witnessed by the owner, NEVER a machine visual verdict here.

OFFLINE-TESTABLE BY STUBBING scrollHeight (the jsdom-layout workaround): `@vitest-environment jsdom`,
`vi.mock('../api', …)` (the panel still renders its seam), `@testing-library/react` + `fireEvent.change` /
`fireEvent.keyDown` to drive the input, and a scripted `scrollHeight` (define the property on the textarea
element, or spy the `style.height` setter) to drive the recompute deterministically. No real layout, no
real socket/SDK/DB/Electron.

## Integration test

**Goal —** Prove that the chat input textarea, as its content changes, runs a height-recompute that sets
its height from `scrollHeight` (scripted), caps that height at a maximum and toggles internal scrolling past
the cap, shrinks back when content is deleted, and STILL sends on plain Enter / inserts a newline on
Shift+Enter. Entirely in jsdom: `scrollHeight` is scripted (jsdom lays out nothing), the `api` seam is
mocked, `fireEvent` drives the input, no real layout/socket/SDK/DB/Electron.

The integration test exercises this capability against its **real in-story collaborator** — the real
textarea element and the real onChange/onKeyDown handlers — with only `scrollHeight` scripted (the one
value jsdom cannot compute). No stubs within the panel's own input composition.

The integration test would:

1. Render `<ChatPanel />` in jsdom; script the input textarea's `scrollHeight` (define the property / spy
   the height setter).
2. `fireEvent.change` the input with multi-line content whose scripted `scrollHeight` is BELOW the cap →
   assert the recompute set the textarea height to fit the content (grew from the one-row resting state) and
   did NOT enable internal scrolling.
3. `fireEvent.change` with content whose scripted `scrollHeight` EXCEEDS the cap → assert the height is
   clamped at the max AND internal scrolling (`overflow-y`) is enabled — grow, then cap-and-scroll.
4. `fireEvent.change` back to a short value (scripted `scrollHeight` drops) → assert the height SHRINKS back
   down (the reset-then-measure guard; a grow-only recompute would leave it tall — a defect).
5. `fireEvent.keyDown` plain Enter → assert it submits (the seam fires once), and Shift+Enter → assert it
   does NOT submit (a newline is inserted) — the KEPT keybindings, unregressed by the grow change.

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest jsdom,
`apps/studio/src/components/ChatPanel.test.tsx`), `scrollHeight` scripted. Per ADR-0122 (`storytree
coverage`), each contract id is the lead of a distinctly-named test, so `storytree coverage auto-grow-input`
reports 3/3. None is an APPEARANCE assertion — the visual grow is the story's operator-attested UAT leg
(ADR-0070).

1. **`agi-recomputes-height-from-content`** — onChange grows the textarea height to fit its (scripted-scrollHeight) content, and shrinks back
   - **asserts —** an onChange runs a height-recompute that reads the textarea's `scrollHeight` (scripted)
     and sets the element height to fit — growing from the one-row resting state as content is added, and
     SHRINKING back down when content is deleted (the reset-then-measure guard). Fails against the
     `rows={1}`-no-grow code at HEAD (no recompute exists) — the brownfield red.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the onChange height-recompute)
2. **`agi-caps-height-and-scrolls-internally`** — past a max height the textarea clamps and scrolls inside itself
   - **asserts —** when the scripted `scrollHeight` exceeds the cap, the recompute clamps the height at the
     maximum AND enables internal scrolling (`overflow-y`) so a large/pasted prompt scrolls inside the input
     rather than growing without bound — the cap-and-internal-scroll branch.
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the max-height clamp + overflow toggle)
3. **`agi-keeps-enter-send-shift-enter-newline`** — plain Enter sends, Shift+Enter inserts a newline (unregressed)
   - **asserts —** plain Enter submits (the seam fires once) and Shift+Enter does NOT submit (a newline is
     inserted) — the existing terminal keybindings, KEPT through the grow change. Re-asserts the behaviour
     the old `cp-enter-submits` covered so a regression is caught under this unit. (The empty-intent guard —
     no seam call on a blank Enter — is asserted within this contract's sibling case, sharing the component
     surface; it is part of the keybinding's fail-closed behaviour, not a separately-coverable name.)
   - **covers —** `apps/studio/src/components/ChatPanel.tsx` (the onKeyDown Enter/Shift+Enter handling +
     empty-intent guard)

## Guidance — the net-new slice that earns the signed verdict

The BROWNFIELD rung toward `healthy` (ADR-0057 §3, editsExisting): author the height-recompute assertions
(the red against the `rows={1}`-no-grow code), then add the grow logic (the green).

- **The edited test —** `apps/studio/src/components/ChatPanel.test.tsx`. Add the `agi-…` height-recompute /
  cap / keybinding-keep tests, scripting `scrollHeight`. Name each for its contract id so `storytree
  coverage auto-grow-input` reports 3/3 (ADR-0122).
- **The RED the spine observes —** with the recompute assertions authored, the test fails against the code
  at HEAD: `rows={1}` with no onChange height logic means no recompute fires — `agi-recomputes-height-from-
  content` fails. A real brownfield red→green over existing source.
- **The GREEN —** in `apps/studio/src/components/ChatPanel.tsx`, add an onChange (or a layout effect keyed
  on `intent`) that resets the textarea height to a base, reads `scrollHeight`, sets the height to fit,
  clamps at a max, and toggles `overflow-y`. Add the max-height + base + overflow CSS to `.chat-input` in
  `apps/studio/src/index.css`. Keep the Enter/Shift+Enter `onKeyDown` unchanged. Keep the thin-client wall
  (`modelPathBoundary.test.ts`) and typecheck green. The visual grow is the story's operator-attested UAT
  leg — no pixel assertion here.

Rules:

- **Recompute, don't rely on layout** — read (scripted) `scrollHeight` and set the height; the test proves
  the recompute, not laid-out pixels (`agi-recomputes-height-from-content`), because jsdom has no layout.
- **Reset-then-measure so it shrinks too** — a grow-only recompute is a defect
  (`agi-recomputes-height-from-content` asserts the shrink).
- **Cap and scroll internally** past the max (`agi-caps-height-and-scrolls-internally`) — never grow without
  bound.
- **Keep the keybindings** — Enter sends, Shift+Enter newlines, unregressed
  (`agi-keeps-enter-send-shift-enter-newline`).
- **Stay a thin client** — no agent/drive/model import (`modelPathBoundary.test.ts` stays green).
- **Appearance is operator-attested, not asserted here** (ADR-0070) — prove the recompute behaviour only;
  the visual grow is the story's UAT leg.
