---
status: proposed
arc: linked-session-context-arc
---
# ADR-0243: A live-spend-only adapter earns its activation leg by seam, attestation, or fixture

## Status

proposed — named (deliberately unsettled) by `linked-session-context-plan-4` while planning
increment 3 of `linked-session-context-arc`, and written up by the `session-orchestrator` on
2026-07-26 when the increment hit the wall it predicts. The owner has not directed an answer, and
the three candidates trade honesty against testability in ways the corpus does not settle, so this
is born `proposed` and escalates rather than deciding. It re-opens nothing: ADR-0235 governs WHAT
is observed, ADR-0241 WHERE it is stored, and neither speaks to how an adapter's *activation* is
proven.

Reviewed in the same increment's pre-merge `librarian-curator` pass (2026-07-26), which corrected
two claims in place while the ADR was still `proposed` and the fork still open: what ADR-0184
actually converted, and what posture increment 3 actually shipped. The fork itself is untouched —
still three candidates, still deferred, still the owner's to settle.

## Context

ADR-0235 records context traversal at deterministic runtime boundaries. Two boundaries have been
instrumented so far, and they earn their activation proof in opposite ways:

- The **terminal CLI dispatch** boundary (increment 2, story `context-traversal-capture`) is
  process-per-invocation and free to run. Its activation leg SPAWNS the real CLI as a child process
  and asserts on the bytes that appear on disk. Genuinely machine-provable in CI; five machine UAT
  legs are signed.
- The **build spawn** boundary (increment 3, story `context-traversal-spawn`) only emits when a
  real `--live`/`--real` build actually spawns a subscription-funded leaf. That cannot run in CI,
  and it is not free.

Two facts make this a genuine fork rather than an engineering detail:

1. `resolveProveSpec` (`packages/orchestrator/src/resolve-prove-spec.ts`) sets `author` but **not**
   `liveAuthor` for an `authorOverride`. A scripted `PhaseAuthor` therefore yields
   `liveAuthor: undefined`, and the drive-side glue that reads `liveAuthor.runs` is unreachable from
   any offline test. A dry-run build correctly emits nothing, so there is no cheap synthetic path.
2. ADR-0184 converted drive-machinery's three live UAT legs from **human** to **machine** witnesses,
   and its framing correction is directly load-bearing here: those legs had never been
   operator-attested — they wore the `human` glyph for a *cost/harness* reason, and ADR-0184's
   finding is that conflating the two was the error. The corpus draws that line twice already, in
   `human-witness-is-a-judgment-gap-not-cost` (the human label is for a judgment gap, never for
   cost) and `a-live-only-guarantee-is-an-honesty-gap` (give a live-only guarantee a cheap offline
   red→green and let the live run be a smoke test). Taking an operator-attested leg here is
   therefore not merely a retreat from a direction — it needs the gap to be a genuine judgment gap,
   and needs to be said out loud rather than slipped in.

The forces: ADR-0020 makes the SPINE the sole arbiter of red/green and keeps the leaf out of the
verdict, so any seam widened purely for testability sits on a proof-critical path. ADR-0070 stage 2
already admits operator attestation for verdicts only the owner can sign. And a recorded fixture is
honest about the adapter while being silent about the wiring — the exact gap increment 1 fell into,
where a whole story landed with a trustworthy seam that nothing composed.

This decision generalises beyond context traversal: every future live-spend-only adapter named in
`linked-session-context-arc` (direct SDK, Codex, owned-loop, desktop-chat) inherits whatever is
decided here.

## Decision

Deferred to the owner. Three candidates, stated so the trade is visible:

- **A — injected-leaf seam.** Extend `authorOverride` (or add a sibling) so a test can supply a
  `liveAuthor` whose `runs` are scripted, making the glue reachable offline and the activation leg
  machine-provable. *Cost:* widens a proof-critical seam for testability; a scripted `liveAuthor` is
  one short step from a scripted verdict, which is what ADR-0020 exists to prevent.
- **B — operator-attested leg.** Stand the build up, run it, and have the owner attest the leg
  (ADR-0070 stage 2). *Cost:* a partial retreat from ADR-0184's machine-witness direction, and it
  prices every future adapter's activation at one owner interruption. It also has to clear an
  accepted floor before it is even available: `human-witness-is-a-judgment-gap-not-cost` reserves
  the human label for a judgment gap, and "did the glue get called?" is a harness gap, not a
  judgment one. B is therefore only reachable if the owner rules that this particular verdict is
  one only a human can sign — which is precisely the question deferred here, not an assumption
  this ADR may make on the owner's behalf.
- **C — recorded-fixture leg.** Capture one real build's slice accounting once, commit it as a
  fixture, and assert the adapter against it in CI. *Cost:* proves the ADAPTER, not the ACTIVATION —
  the fixture cannot notice the day the glue stops being called, which is precisely the failure
  increment 1 demonstrated is real.

Until this is settled, increment 3 takes **none of the three**. It ships **no activation leg at
all**: `stories/context-traversal-spawn` lists the live confirmation under *Explicitly outside this
increment* and hands it to the owner unsigned, on the explicit ground that it is neither
machine-provable in CI today nor a judgment gap
(`human-witness-is-a-judgment-gap-not-cost` — so it is NOT labelled a human leg to stand in for a
missing harness). That is deliberately weaker than B: B would put a signed operator-attested leg on
the story, and no such leg exists. Not-claiming is the only posture available to an increment that
must land before the fork is settled, and it is reversible in every direction — whichever of A, B or
C the owner takes, the leg is added then, and nothing shipped has to be unwound.

## Consequences

- Increment 3's story `context-traversal-spawn` lands with its three capabilities machine-proven on
  signed `--real` verdicts and its five machine UAT legs signed, and with **no activation leg of any
  witness kind**. The story does not claim an activation leg it did not earn, and the gap is named in
  its own spec rather than left for a reader to infer.
- The arc's remaining adapters stay blocked on this fork for their activation legs specifically —
  not for their adapter work, which is machine-provable in every case.
- Whichever option is taken, `resolveProveSpec`'s `authorOverride` asymmetry should be documented
  where it is, because it currently reads as an oversight rather than a deliberate narrowing.
- If A is chosen, the seam needs its own refusal test proving a scripted `liveAuthor` still cannot
  move a verdict.

## References

- ADR-0235 — record context traversal at deterministic runtime boundaries (the governing decision).
- ADR-0241 — context traversal traces persist locally per session (the storage contract).
- ADR-0020 — the prove-it-gate: the spine observes red/green, the leaf never reports it.
- ADR-0184 — drive-machinery's three live UAT legs converted from human to machine witnesses, and
  the human-glyph framing correction (judgment gap vs cost/harness gap).
- ADR-0070 — operator-attested legs (stage 2).
- `asset:human-witness-is-a-judgment-gap-not-cost` — the accepted floor candidate B must clear.
- `asset:a-live-only-guarantee-is-an-honesty-gap` — the standing preference for a cheap offline
  red→green with the live run as a smoke test (the shape candidates A and C reach for).
- `stories/context-traversal-spawn/story.md` — the increment that hit this wall; its *Explicitly
  outside this increment* section is where the missing activation leg is recorded.
- `packages/orchestrator/src/resolve-prove-spec.ts` — the `authorOverride` / `liveAuthor` asymmetry.
- `packages/drive/src/node-build.ts` — the composition site the glue lands at.
- `linked-session-context-plan-4` — the plan that named this fork.
