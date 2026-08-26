---
id: "context-window-meter"
tier: capability
story: studio
arc: linked-session-context-arc
title: "The map says how full a session's context window is"
outcome: "An operator can see how full each recent session's context window is, against the two marks that decide whether a session takes on more work."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [452, 413, 411, 248]
# GREENFIELD, and the `proof:` block is spec-borne (ADR-0057) with deliberately NO `real:` arm — the
# reason `store-connection-signal` states next door: a `real:` arm would move the pinned REAL-buildable
# snapshot in `packages/cli/src/node-build.test.ts`, and `readUnitSourceFiles`
# (packages/cli/src/check-boundaries.ts) reads ONLY `real.sourceFile` + `real.scope.sourceGlobs`, so
# with no `real` arm this unit contributes nothing to `unitSourceFiles` and the ADR-0192 landlord rule
# does not fire over it. Every file below is in `apps/studio`, this story's OWN building.
# The command is the studio's vitest suite — apps/studio is VITEST + jsdom, not node:test.
#
# THE APPEARANCE IS NOT PROVEN HERE (ADR-0070 stage 2). What these contracts pin is which segments are
# drawn, at what widths, what the surface says when it cannot read, and that the unsigned half declares
# itself. The LOOK is the owner's verdict, and ADR-0452 D1 is explicit that shipping the widget is what
# that verdict is taken against.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs:
      - "apps/studio/src/lib/contextWindowMeter.test.ts"
      - "apps/studio/src/components/ContextWindowsTab.test.tsx"
      - "apps/studio/server/contextWindowsApi.integration.test.ts"
    sourceGlobs:
      - "apps/studio/src/lib/contextWindowMeter.ts"
      - "apps/studio/src/components/ContextWindowsTab.tsx"
      - "apps/studio/server/contextWindowsApi.ts"
---

# The map says how full a session's context window is

**Outcome —** An operator can see how full each recent session's context window is, against the two
marks that decide whether a session takes on more work.

## Why this is one capability

The journey is one glance: open the Context tab and know how much room the sessions on this machine
have left. The route, the arithmetic and the drawing are one unit because none of them is a journey
on its own — a route with no picture answers nobody, and a picture with no shared scale answers the
wrong question, since the whole point is COMPARISON against two fixed marks.

## What it measures, and why it does not read the traces

The quantity is `residentInputTokens` — tokens resident in one window at one model request, the
reading that can FALL. ADR-0248 settled that against the monotonic billing total, whose bar reads six
times full with a negative remainder.

It reads the HOST TRANSCRIPTS the harness writes, not the ingested traces, and that is forced rather
than preferred. Occupancy reaches a trace only through an explicit `storytree traversal ingest`;
measured 2026-08-26, **2 of 697** local traces carry the field. A trace-backed meter would therefore
be blank for 695 of 697 sessions, including the one an operator is sitting inside. The transcripts
are ambient — one per window, written as the window runs — so this is the only source that answers
while the answer still matters.

It goes through `readTranscriptWindow` (`transcript-occupancy-extraction`), the SAME reader the
ingest uses, and derives no parse rule of its own. A second copy of "what counts as a resident total"
is exactly how two surfaces come to describe one transcript differently.

## Guidance

- **The two marks are ADR-0411 D3's, and they are the reason this is worth looking at.** The soft
  mark (~400K) is *take on no NEW increment — finish what you hold, then hand over*; the hard mark
  (500K) is *land what is green, write the handover, let a fresh session continue*. Measured on this
  machine 2026-08-26: of 125 session windows, **37 crossed the soft mark and 15 crossed the hard
  one**. These are lines real work reaches.
- **Draw the marks as COLOUR, never as a marker, tick or arc.** That is the signed grammar of
  `docs/design/context-traversal/README.md` §"Revision 2026-07-27" clause 3, which removed the
  threshold marker from the occupancy bar and shows overflow by colouring the over-threshold portion
  — the owner's stated reason being that at 200k a 500k marker had no meaning. This keeps the rule
  and extends it to the second mark as a third colour. Reaching for a tick here is reaching for
  something already decided against.
- **ONE ceiling across every meter shown.** Per-window scales cannot be compared by eye, and
  comparison is most of why more than one window is drawn. The cost is real and accepted: a single
  very full window shrinks every other meter. It is the honest direction to err, because it never
  makes a window look fuller than it was.
- **A synthetic reading is not a reading.** The harness emits `model: "<synthetic>"` lines carrying
  an all-zero usage block — 22 across 125 windows here, every one zero, and TWO windows ENDING on
  one. Taking the last observation verbatim draws an EMPTY meter for a window that reached 437.5k.
  Exclude them by the harness's own marker and REPORT the count; a silent exclusion is a number
  nobody can check.
- **Select by file mtime, present by last reading.** mtime is the only order available before a file
  is read, so it has to choose which windows to read; but a transcript is also touched by things that
  are not model requests, so the freshest FILE can have an hours-old last request. Presenting in
  mtime order printed ages reading 1m, 33m, 5h, 25m down a list captioned "newest first".
- **NEVER fold a helper window into a session window's number.** ADR-0413 D2, restated permanently by
  ADR-0452 D4. A helper's window is gone by the time its parent reaches its own peak, so a sum draws
  a fullness level no real window ever reached — and closeness to the limit is the whole purpose.
- **The helper section is an UNSIGNED PROPOSAL and must say so on its own face** (ADR-0452 D3). A
  decision nobody reading the widget will open cannot be the only place that records it. It states
  the permanent floor too: 233 of 1,074 helper transcripts on this machine can be attributed to no
  session under any option (ADR-0413 D6).
- **A helper window's identity is its FILE.** A subagent transcript stamps its PARENT's `sessionId`
  on every line (measured 2026-08-21, 188/188), so no helper id exists anywhere in the record.
- **Bound the reading and say what was bounded.** Twelve windows out of 3,219 transcripts here; the
  wire carries found-versus-read so a bounded answer never reads as a complete one.
- **Absence and failure are different answers.** A studio server that did not answer is not an empty
  machine, and "no helper windows here" is not "no helper windows".
- **Local only**, the same call ADR-0241 and the owner's 2026-08-10 decision made for traces.
  Transcripts are per-machine; the hosted container holds none and answers an honest empty list.
- **Prove it as an integration test.** Vitest: the pure arithmetic directly, the render under jsdom
  against an injected read, and the route over a REAL `node:http` server against a temp transcript
  root pointed at by `STORYTREE_TRANSCRIPT_DIR`. Test titles carry every contract id below, each as
  ONE plain string literal with the declared id leading it — never a concatenation and never a
  locally-invented id, because the coverage scan is a static AST scan (ADR-0126).

## Integration test

1. Write a transcript whose LAST line is a synthetic zero-token reading after a 437.5k one. Assert
   the reading is 437.5k, not zero, and that the excluded count is reported.
2. Write a receding series (240.9k → 228.1k). Assert the reading is the later one and the peak is the
   earlier — the quantity that can fall.
3. Render with a reading below both marks, between them, and past the hard mark. Assert which
   segments exist, their widths, that a split is at EXACTLY the mark, and that the track holds only
   fills — no marker element of any kind.
4. Render two windows of different fullness. Assert their drawn fills are proportional to their
   readings, which can only hold on one shared ceiling.
5. Drive the tab inactive then active. Assert nothing is read until it is open.
6. Fail the read. Assert it reads as the studio server not answering, never as an empty machine.
   Answer with no windows at all. Assert it names where it looked.
7. Write a window whose file is freshest but whose last request is oldest. Assert it is NOT first.
8. Write two helper transcripts beside a window. Assert each carries its OWN peak, that the parent's
   figure is exactly its own, and that the sum of the three appears nowhere.
9. Write a helper transcript with no parent readings. Assert it is never counted as a session window,
   and that it still counts toward the machine's helper population.
10. Render with no helper anywhere. Assert the proposal block still renders, badged unsigned, and
    says where it found none.
11. POST the route. Assert it refuses by name.

## Contracts

1. **`context-window-meter-reads-the-window-the-harness-is-writing`**
   - **asserts —** the reading is the last real request's resident total; a synthetic zero-token tail
     never becomes it and the excluded count is reported; a peak is shown when a later reading fell
     below it; the reading reaches the tab strip; and nothing is read until the tab is opened.
2. **`context-window-meter-draws-the-two-marks-as-colour`**
   - **asserts —** the soft mark is 400k and the hard 500k; a reading below both draws only the calm
     segment; the soft and hard segments appear only past their own marks and split at EXACTLY them;
     the track holds three fills and no marker, tick or arc; and each band states the decision
     ADR-0411 D3 attaches to it.
3. **`context-window-meter-scales-every-window-on-one-track`**
   - **asserts —** one ceiling serves every meter, sits above the hard mark so at-the-limit and
     past-it cannot draw alike, grows to contain any reading, and makes two drawn fills proportional
     to their readings; a reading is never drawn past the track.
4. **`context-window-meter-reports-its-own-limits`**
   - **asserts —** a failed read reads as the server not answering rather than an empty machine; an
     empty machine names where it looked; found-versus-read is on the wire; the order is by last
     reading so the printed ages agree with it; token and age readouts use one house format; and the
     route refuses a write by name.
5. **`context-window-meter-never-folds-a-helper-into-a-window`**
   - **asserts —** a helper's tokens never enter its parent's figure; each helper draws its own
     reading on the shared track, identified by file; a helper transcript is never counted as a
     session window though it counts toward the machine's helper population; and the block is badged
     UNSIGNED, states the unattributable floor, and renders even with nothing to draw.

## Explicitly outside this increment

- **Feeding a RUNNING session its own occupancy at an increment boundary** (ADR-0411 D3/D4). Still
  outstanding, explicitly NOT superseded, and explicitly not what the owner asked for here — he asked
  for something to LOOK at (ADR-0452's Consequences). The fold this capability owns is most of what
  such a verb would need.
- **Any owner attestation of the helper section.** It is a PROPOSAL (ADR-0452 D3); his review is the
  next gate (D6), and whether helper measurement becomes signed work is settled after he looks
  (`linked-session-context-arc-inc-25`).
- **Summing helper tokens into a parent's total.** Ruled out permanently, not deferred (ADR-0413 D2 /
  ADR-0452 D4).
- **Attributing the 233 unattributable helper transcripts.** No option reaches them (ADR-0413 D6);
  the surface states the floor instead.
- **Mirroring the route into the desktop backend.** `/api/traversal` is not mirrored either, so the
  Context tab behaves exactly like the Traversal tab beside it — the studio dev server is where both
  answer. Doing it would add a `MIRRORS` pair registration and is its own unit.
- **Anything about the replay panel's own occupancy bar.** That bar plots a series at a playhead and
  is untouched here; `traversal-panel-arc` still owns it and is parked.
