---
status: accepted
decided: 2026-07-11
amends: [180]
load_bearing: true
---
# ADR-0184: Machine-witness drive-machinery's three live UAT legs

## Status

accepted (2026-07-11) — decided/directed by the owner in conversation on 2026-07-11. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends [ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md)** in part:
its Consequences line — "Drive-machinery's three live, currently-human legs remain human because no
standing machine command proves their full success conditions" — is overtaken. ADR-0180's desktop
brokered-signing machinery (decisions 1–4) and its strict proof-binding rule (decision 5) STAND and
are honored here: each converted leg names the exact command-bearing gate that witnesses it, and an
unbound machine leg is still refused (`witness-resolution.ts` / `adopt.ts`).

## Context

[ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md) (2026-07-10) built
the desktop's brokered path for signing **human** UAT legs and, in passing, asserted that
drive-machinery's Story UAT legs 3 (**The REAL build**), 4 (**Land it**), and 7 (**Dogfood**) "remain
human." Reviewing that assertion — with an independent `story-author` second assessment against the
witness model — surfaced two errors, one of framing and one of fact.

**Framing error: "human" was conflating two different reasons.** The corpus has a genuine
judgment mode — `operator-attested`, "the human-anchored, dogfood-only mode … can never be
self-granted by an agent" ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md),
[ADR-0007](0007-proof-model.md)) — for success conditions with *no compiler*
("does it look right?"). It also has a *cost/harness* reason a live leg stays un-automated, captured
by the principle `a-live-only-guarantee-is-an-honesty-gap`: a fail-closed guarantee whose only
verification is expensive/live is itself an honesty gap; give it a cheap offline red→green and let the
live run be a smoke test, not the sole proof. [ADR-0092](0092-gate-as-proof-for-a-machine-witnessed-story-s-own-uat-node.md)
already named this shape for a mature `--real` build: "a human-witness action; this is surfaced,
never pretended." The three legs wore the same `human` glyph for these two very different reasons.

**Factual error: the cost premise was wrong.** The reshape was scoped "no paid inner loop." That
constraint named the then-planned metered **Cursor** leaf ([ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md),
later **retired** by [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)).
The `--real`/`--live` Claude Agent SDK leaf is **subscription-funded**
([ADR-0030](0030-all-in-on-claude-agent-sdk.md)): its SDK-reported `total_cost_usd` is "a phantom …
the maxTurns cap is the brake" (`packages/drive/src/node-build.ts:76`,
`packages/agent/src/headless-orchestrator.ts:81`;
[ADR-0130](0130-remove-the-inner-loop-usd-budget-ceilings-subscription-funde.md)/0131). So a live
proof of legs 3 and 7 is affordable on the subscription — the blocker that made them "human"
never applied. There is no live Cursor leaf path anymore.

With cost removed and judgment examined per leg, **none of the three is a genuine human-judgment
gate**:

- **Leg 4 (Land it)** — success is *"the proven commit is reachable from `main`"*: a free
  `git merge-base --is-ancestor` fact, and the non-squash-preserves-ancestry invariant is continuously
  enforced by the CI auto-merge / non-squash rail ([ADR-0022](0022-ci-green-gate-and-auto-merge.md) /
  [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)). Zero judgment.
- **Leg 3 (The REAL build)** — the spine reads red/green off a proof command's exit code
  (`shell-test-observer`) and signs the verdict; no human judges anything. It is human only because
  the faithful proof is a live run with no standing harness.
- **Leg 7 (Dogfood)** — "usable without coaching" looked like a no-compiler judgment, but it has an
  operationalization the owner's own brief named: an isolated fresh-agent, no-coaching **executable
  probe**. A cold agent given only the onboarding surface either reaches a signed verdict or does not
  — a measurable outcome. The residual human element is a *one-time* audit that the probe's context is
  genuinely uncoached, not a per-run attestation.

## Decision

**1. Legs 3, 4, and 7 convert from `human` to `machine` witnesses.** Each names the exact
command-bearing `observe` gate that witnesses it (ADR-0180 d.5, honored). No fallback, no silent
downgrade to human; an unbound or ineligible binding is refused as today.

**2. The standing test for a `human` witness is a genuine judgment gap, never cost.** A UAT leg is
`human` only when its success condition has no compiler — aesthetics ([ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)),
an owner value call. A success that is machine-observable but merely expensive, live, or
un-harnessed is `machine`, witnessed by a standing or deliberate proof — it is never labeled human to
stand in for a missing harness. This generalizes `a-live-only-guarantee-is-an-honesty-gap` to the
witness label itself. (Graduated 2026-07-11 to the Library principle
`human-witness-is-a-judgment-gap-not-cost` in the librarian pass, per ADR-0095.)

**3. Two proof shapes carry the conversion.**

- **Leg 4 — a new offline `observe` gate** proving the non-squash-preserves-ancestry invariant: a
  proven commit promoted non-squash stays an ancestor of the trunk. Free, deterministic, standing; it
  runs inline in `runAdopt` like the existing observe gates, and the story's leg 4 binds to it. The
  live residue — a *real* PR auto-merged into the *real* `main` — is the CI rail's continuous
  guarantee (ADR-0022/0031), surfaced in the leg prose, not pretended by the gate.

- **Legs 3 & 7 — a live-proof-artifact `observe` gate.** The faithful proof is a deliberate,
  subscription-funded live run the spine signs: for leg 3 a `--real` build of a drive-machinery node
  → a persisted `events.verdict` pass; for leg 7 a cold-start probe run → a signed verdict. Because a
  live SDK spawn must never run on a gate pass ([ADR-0010](0010-organism-model-story-bounded-context.md) §5,
  `spawn-deps.test.ts`), the heavy run stays **out-of-band**; the leg binds to an observe gate whose
  cheap inline command **verifies that genuine signed artifact** — a real spine-signed pass, on a
  commit in the trunk's ancestry, recent enough to be honest ([ADR-0016](0016-knowledge-code-binding-and-staleness.md)
  ageing territory). The live run *produces*; the cheap check *witnesses*.

**4. Leg 7 gains a new cold-start probe harness.** A fresh subscription agent is given only the
onboarding surface (`CLAUDE.md`), with the inner loop deliberately never named, and drives a
self-registering node to a real `--real` signed verdict. The harness asserts its own integrity
(uncoached context, a non-trivial node, a genuine red→green reaching `events.verdict`); that integrity
is audited ONCE at authoring by code review, not re-judged by a human per run.

**5. Leg 3 keeps its cheap offline twin; leg 7's proof is inherently live-only.** The
author-agnostic drive mechanics stay proven every commit by leg 2 (`node build verdict-line
--dry-run`) + gate-1 (which `(covers:)` `real-build-worktree` / `prove-spec-resolution` /
`prove-it-gate`); the leg-3 live gate sits *above* that twin, satisfying
`a-live-only-guarantee-is-an-honesty-gap`. Leg 7 has no cheap proxy — "a real agent discovers it"
can only be shown by a real agent — so its live-only proof is an accepted exception, honest because
the property proven is itself the behaviour of a real agent.

## Consequences

**Good.**
- Drive-machinery's Story UAT becomes fully machine-witnessed: no leg is labeled human for a cost
  reason, and the crown no longer waits on an operator ceremony for a machine-observable outcome.
- Because no drive-machinery UAT leg is human anymore, the story's **closure no longer depends on the
  desktop brokered human-sign path** (ADR-0180). That path stays valuable for *other* stories' genuine
  human legs (the frontend look, owner value calls), but it drops off drive-machinery's critical path —
  the greyed-out desktop buttons stop being a blocker here.
- The witness label carries honest information again: `human` = a real judgment gate, `machine` = a
  machine-observable success (standing or deliberate). A machine-checkable git fact no longer wears a
  human glyph.

**Bad / costs.**
- Legs 3 & 7 introduce a new proof *kind* (a live-artifact observe gate): a deliberate out-of-band run
  must be invoked to (re)produce the signed artifact, and a freshness policy governs when a persisted
  verdict is too stale to witness. Until that run is invoked, the gate is honestly red/unproven — never
  green-by-default.
- Leg 7's cold-start harness is net-new, consumes subscription quota + real minutes, and is
  nondeterministic; it is a deliberate run, not a gate-pass leg, and its uncoached integrity is a
  one-time human audit — a residue, though not a per-run attestation.
- This re-decides a leg the owner directed to remain human ten days ago (ADR-0180). The amendment is
  in place; ADR-0180's desktop-signing machinery (d.1–d.4) and proof-binding rule (d.5) are untouched.

## References

- [ADR-0180](0180-lift-the-desktop-write-broker-deferral-for-brokered-uat-sign.md) — the "remain
  human" consequence this amends; its d.5 binding rule + desktop-signing machinery stand.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the `--real`/`--live` leaf is subscription-funded
  (the phantom `total_cost_usd`); [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)
  — retires the metered Cursor leaf that the original "no paid inner loop" constraint named
  (superseding [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md)).
- [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — `uat_witness`; a
  machine-witnessed story drives its own UAT node. [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md)
  / [ADR-0007](0007-proof-model.md) — `operator-attested`, "no compiler for the
  look" (the genuine judgment gate this decision preserves for other stories).
- [ADR-0092](0092-gate-as-proof-for-a-machine-witnessed-story-s-own-uat-node.md) — "human-witness =
  cost, surfaced never pretended," the same shape resolved here.
- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — dogfood /
  usable-without-coaching, leg 7's load-bearing question. [ADR-0010](0010-organism-model-story-bounded-context.md)
  §5 — a live SDK spawn never runs on a gate pass. [ADR-0016](0016-knowledge-code-binding-and-staleness.md) —
  the verdict freshness policy the live-artifact gates lean on.
- The principle `a-live-only-guarantee-is-an-honesty-gap` (generalized here to the witness label).
- `stories/drive-machinery/story.md` (`## Story UAT` legs 3/4/7, `## Reliability Gates`);
  `packages/library/src/witness-resolution.ts`, `packages/drive/src/adopt.ts`,
  `packages/library/src/uat-tests.ts` (the machine-leg binding chain); `packages/drive/src/node-build.ts`
  (the subscription-funded live build).
</content>
</invoke>
