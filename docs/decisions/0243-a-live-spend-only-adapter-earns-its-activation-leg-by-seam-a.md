---
status: accepted
decided: 2026-07-27
arc: linked-session-context-arc
---
# ADR-0243: A live-spend-only adapter earns its activation leg by seam, attestation, or fixture

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

Named (deliberately unsettled) by `linked-session-context-plan-4` while planning increment 3 of
`linked-session-context-arc`, and written up on 2026-07-26 when the increment hit the wall it predicts.
Born `proposed` because the three candidates appeared to trade honesty against testability in ways the
corpus did not settle. **The owner's questions on 2026-07-27 falsified two of the premises that made it
look like a trade at all**, and the decision below is a fourth shape rather than one of the three
candidates. Both corrections are recorded in Context so the reasoning is auditable and the false trade
is not re-made.

It re-opens nothing: ADR-0235 governs WHAT is observed, ADR-0241 WHERE it is stored, and neither speaks
to how an adapter's *activation* is proven.

Two `librarian-curator` passes reached this body while it was `proposed` (increments 3 and 4,
2026-07-26), correcting what ADR-0184 actually converted, what posture increment 3 actually shipped, and
recording ADR-0247's landing against candidate B.

## Context

ADR-0235 records context traversal at deterministic runtime boundaries. Two boundaries were
instrumented before this decision, and they earned their activation proof in opposite ways:

- The **terminal CLI dispatch** boundary (increment 2, story `context-traversal-capture`) is
  process-per-invocation and free to run. Its activation leg SPAWNS the real CLI as a child process
  and asserts on the bytes that appear on disk. Genuinely machine-provable in CI; five machine UAT
  legs are signed.
- The **build spawn** boundary (increment 3, story `context-traversal-spawn`) only emits when a
  real `--live`/`--real` build actually spawns a subscription-funded leaf.

### Correction 1 — the barrier is CI's credential posture, not cost

This ADR originally read: *"That cannot run in CI, and it is not free."* The second clause is **wrong**.
The leaf is subscription-funded (ADR-0030 / ADR-0232), so a `--real` build carries no marginal cost —
it is the same subscription burn the owner already spends building, and the owner's position is that
this is not a cost he is trying to avoid.

The real barrier is narrower and is a deliberate posture, not an accident: CI runs with **no secrets at
all**. `.github/workflows/ci.yml` states it in as many words — *"Tests are offline (no DB / no API key),
so CI needs no secrets."* A `--real` build cannot happen there because nothing there can authenticate,
and keeping it that way is a choice worth keeping.

Framing the obstacle as cost made every candidate look like it was buying its way around a price. It
was not.

### Correction 2 — an agent is not needed to prove activation

The original Context stated that `resolveProveSpec` sets `author` but not `liveAuthor` for an
`authorOverride`, so *"the drive-side glue that reads `liveAuthor.runs` is unreachable from any offline
test"*, and that there is therefore no cheap synthetic path. The reachability fact is correct. The
inference that proving activation needs an agent is **not**.

Reading the seam directly:

- `packages/orchestrator/src/resolve-prove-spec.ts:489` — `if (opts.authorOverride !== undefined) {
  author = opts.authorOverride; }`. The `else` branch is the only code that ever constructs a
  `LiveAuthor` (`new ClaudeAgentAuthor(...)` / `new CodexPhaseAuthor(...)`). An override therefore
  leaves `liveAuthor` undefined by construction.
- `packages/drive/src/node-build.ts:567` — `await proveUnit(resolved.spec)` decides the verdict, by
  running the real test command and observing RED then GREEN.
- `packages/drive/src/node-build.ts:570-577` — the accounting branch reads `resolved.liveAuthor.runs`
  **after** that, and hands it to the observer.

So an agent is required today for one reason only: **the agent's constructor is the sole producer of a
`LiveAuthor`.** The observer itself reads plain data — turns, tokens, model — and never asks who
produced it. Nothing about the quantity being proven requires a model to have run.

This also voids the cost recorded against candidate A (*"a scripted `liveAuthor` is one short step from
a scripted verdict, which is what ADR-0020 exists to prevent"*) on two counts:

1. The verdict is decided before the accounting branch is read, and no arrow runs from the accounting
   branch back to it. A scripted `liveAuthor` supplies authored-slice bookkeeping, not a verdict.
2. `authorOverride` **already exists** and is already used for dry-runs, so a scripted author can
   already influence what gets tested. Populating `liveAuthor` alongside it grants no power over the
   verdict that the existing seam does not already grant.

And the fence this ADR reached for already exists, by a different mechanism than leaving the field
unset. `node-build.ts:569` records it: a dry-run/live-smoke appends slice usage to an **in-memory**
store, *"so a synthetic walk's accounting honestly dies here."* The design already anticipated scripted
accounting and fenced it by store choice.

### What remains genuinely unprovable in CI

Separating two questions that this ADR had conflated:

- **"Is the observer wired in — does anything call it?"** This is the failure that actually happened
  (increment 1 landed a seam that nothing composed). It needs a populated `liveAuthor` and
  nothing else, so it is machine-provable in CI for free.
  *(Corrected 2026-07-27. This bullet originally called increment 1's seam **trustworthy**. It was
  not: `context-traversal-telemetry` held ZERO signed verdicts from increment 1 until the floor
  rebuild of 2026-07-27 re-proved both its capabilities red→green on signed `--real` verdicts. The
  composition failure this bullet names is real and unchanged — nothing composed the adapter — but
  the seam's own trustworthiness was never established, and reading "it landed, so the seam is fine"
  off a spec is the document-checking blind spot this arc has now hit three times.)*
- **"Does a real SDK run still produce the shape the observer assumes?"** This genuinely needs a real
  run. Increment 4 already pinned part of it at compile time (`keyof ModelUsage`, falsified by renaming
  the key and observing TS2322), and any real build the owner runs exercises the rest.

### The standing rules this had to clear

ADR-0184 converted drive-machinery's three live UAT legs from **human** to **machine** witnesses, and
its framing correction is load-bearing: those legs had never been operator-attested — they wore the
`human` glyph for a *cost/harness* reason, and conflating the two was the error. The corpus draws that
line twice more, in `human-witness-is-a-judgment-gap-not-cost` and
`a-live-only-guarantee-is-an-honesty-gap`. **ADR-0247** (accepted 2026-07-26) then retired the `model`
witness tier and made the split explicitly binary, with D1 stating the test directly: a criterion is
`machine` when its success condition has a compiler — *including when the harness does not exist yet* —
and `human` only when the judgment is irreducible.

"Did the glue get called?" has a compiler and lacked only a harness. Correction 2 shows the harness was
one `else`-branch away.

The owner raised, fairly, that signing an end-to-end journey is exactly what human UAT is for. It is;
the narrower rule governs the *witness label*, which is reserved for judgments only a person can make.
The purpose is protecting the owner's attestation queue — ADR-0209's probe found ~97 legs wearing the
human glyph — and the decision below spends none of it on a question a harness can answer.

This decision generalises beyond context traversal: every future live-spend-only adapter named in
`linked-session-context-arc` (direct SDK, Codex, owned-loop, desktop-chat) inherits it.

## Decision

**A live-spend-only adapter earns a MACHINE activation leg through an injected-accounting seam.** The
seam is widened on the *accounting* side only, the leg runs in CI with no agent and no credentials, and
the owner's signature is not spent on it.

1. **Add a `liveAuthorOverride` (or equivalent sibling of `authorOverride`) that supplies a canned
   `LiveAuthor`** whose `runs` are scripted. This makes the drive-side composition site reachable from
   an offline test, so the activation leg asserts that the observer was actually called and wrote the
   expected bytes.
2. **The leg is `machine`.** Per ADR-0247 D1 the condition has a compiler; per correction 2 it now has
   a harness. No operator attestation is taken for it, and none should be offered — that would spend a
   signature on a harness gap, which `human-witness-is-a-judgment-gap-not-cost` refuses.
3. **The seam carries its own refusal test**, proving a scripted `liveAuthor` still cannot move a
   verdict. This was already required by the original Consequences and survives unchanged; it is the
   reason widening this seam is safe rather than merely convenient.
4. **The existing in-memory-store fence stays and is documented where it is.** Synthetic accounting
   must continue to die in an in-memory store rather than reach `events.usage_event` /
   `events.verdict`.
5. **Shape drift is not this leg's job.** The activation leg proves the call happens. That a real SDK
   run still produces the assumed shape is covered by the compile-time pin plus real builds, and a
   canned fixture's divergence from reality is an accepted, named limitation rather than a hidden one.
6. **`resolveProveSpec`'s `authorOverride` asymmetry is documented at the seam**, because it currently
   reads as an oversight rather than a deliberate narrowing — and after this decision it is neither.

The three candidates as they were stated, and their disposition:

- **A — injected-leaf seam.** TAKEN, in the narrowed accounting-only form above. Its recorded cost is
  void (Context, correction 2).
- **B — operator-attested leg.** REFUSED. It was only ever reachable on an explicit owner ruling that
  this verdict is one only a person can sign, and with a harness available there is no such gap to
  rule on. Nothing here restricts the owner from attesting the parts of this arc that *are* judgment
  calls — whether an eight-hour playback reads well is the obvious one.
- **C — recorded-fixture leg.** REFUSED as the activation leg, because it proves the ADAPTER and not
  the ACTIVATION: it cannot notice the day the glue stops being called, which is the failure increment
  1 demonstrated is real. A recorded fixture remains legitimate for shape assertions (D5).
- **Shipping no leg at all** — the posture increments 3, 4 and 5 actually took — is now retired. It was
  honest and reversible, and reversing it is what this decision does.

## Consequences

- Increments 3, 4 and 5 of `linked-session-context-arc` landed with `context-traversal-spawn`'s
  capabilities machine-proven on signed `--real` verdicts and **no activation leg of any witness kind**,
  recorded in the story's *Explicitly outside this increment* section. That gap is now closeable by a
  scoped increment rather than by an owner interruption, and the story's spec should be updated when it
  lands.
- The arc's remaining adapters (direct SDK, Codex, owned-loop, desktop-chat) are unblocked for their
  activation legs.
- **ADR-0248's transcript adapter does not need this seam.** Reading a local transcript file is free and
  credential-free, so its activation is expected to be provable the way increment 2's was — by spawning
  the real thing and asserting on bytes. ADR-0248's original claim that its candidates A and D both
  inherit this ADR is corrected there. **Borne out 2026-07-27:** story `context-traversal-transcript`
  landed with six `witness: machine` UAT legs bound to `context-traversal-transcript#gate-1`, all of
  them offline — no DB, no API key, no model — spawning the real CLI and asserting on the bytes it
  wrote. The expectation this bullet recorded is now an observation.
- CI keeps its no-secrets posture. Nothing in this decision asks for a subscription token in CI, which
  was the only other way to reach the same proof.
- A canned `LiveAuthor` is a fixture, and fixtures drift. D5 names that limitation rather than papering
  it; a leg that silently assumed fidelity would be the fixture candidate wearing a different label.

## References

- ADR-0235 — record context traversal at deterministic runtime boundaries (the governing decision).
- ADR-0241 — context traversal traces persist locally per session (the storage contract).
- ADR-0020 — the prove-it-gate: the spine observes red/green, the leaf never reports it.
- ADR-0184 — drive-machinery's three live UAT legs converted from human to machine witnesses, and
  the human-glyph framing correction (judgment gap vs cost/harness gap).
- ADR-0070 — operator-attested legs (stage 2); not used for this leg.
- ADR-0247 — retires the `model` UAT witness tier; its D1 (`machine` when a compiler exists, even with
  no harness yet) is the test this decision applies.
- ADR-0248 — the context-gauge decision, whose transcript adapter does not inherit this one.
- `asset:human-witness-is-a-judgment-gap-not-cost` — the rule that refuses candidate B here.
- `asset:a-live-only-guarantee-is-an-honesty-gap` — the standing preference for a cheap offline
  red→green with the live run as a smoke test; this decision is that shape.
- `stories/context-traversal-spawn/story.md` — the increments that hit this wall; its *Explicitly
  outside this increment* section is where the missing activation leg is recorded.
- `packages/orchestrator/src/resolve-prove-spec.ts:489` — the `authorOverride` / `liveAuthor`
  asymmetry, and the one branch that makes an agent look mandatory.
- `packages/drive/src/node-build.ts:567` (verdict) and `:570-577` (accounting) — the two independent
  outputs of one build, and why the accounting side is safe to inject.
- `.github/workflows/ci.yml` — the no-secrets posture that is the actual barrier.
- `linked-session-context-plan-4` — the plan that named this fork.
