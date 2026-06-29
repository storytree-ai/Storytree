# Will in-app orchestration give us a wisp on every edit? The honest coverage envelope

**Status:** research + open questions (analysis only — no build started, no `--real`/`--live` build run,
no settled ADR re-decided). **Date:** 2026-06-29.
**Owns the owner question:** *"if we build the in-app session-orchestrator that spawns the inner loop
([ADR-0137](../decisions/0137-chat-is-the-full-session-orchestrator-it-spawns-the-inner-lo.md)), will we
now reliably get wisps on nodes for ALL edits?"*
**Builds on** (does **not** re-decide):
[ADR-0048](../decisions/0048-in-flight-build-is-the-primary-wisp.md) (the build is the wisp),
[ADR-0128](../decisions/0128-the-bare-forest-map-is-honest-by-absence-inner-loop-adoption.md)
(the bare map is honest by absence),
[ADR-0129](../decisions/0129-inner-loop-adoption-target-ratio-and-goal-open-question.md) (the open
ratio/goal fork), and [`inner-loop-adoption-gap.md`](inner-loop-adoption-gap.md) (the ~17% / ~83% split).

## TL;DR — the honest answer

**No — not every edit will wisp, and that is correct by design, not a defect.** But the map *will* get
materially livelier, and the residual gap is one concrete, ADR-0137-flagged build detail.

A wisp fires for exactly one thing: a **persisted `building` work-event** with no terminal verdict,
inside a 20-minute TTL (ADR-0048). In the code today, a persisted `building` event is written by
**only** `node build --real` and `story build --real` (the `--store pg` real-drive path) — plus the
manual `--dry-run --emit-wisp` smoke. A `--live` smoke, a `--dry-run`, a `pnpm gate` + merge, a direct
file edit, or a spawned subagent that just edits-and-gates write **nothing** to `events.work_event` →
**no wisp**.

So under ADR-0137 the wisp question collapses to: *which of the things the orchestrator spawns go
through the real-drive harness (`--store pg`)?*

| What the orchestrator spawns (ADR-0137) | Goes through `--real`/`--store pg`? | Wisp? |
|---|---|---|
| **builder leaf** drives a contract red→green (the spine observes + signs) | **yes — that is the path** | **✓ wisp** *(blocked today by OQ-A)* |
| **story-author** writes `story.md` (authoring) | no — authoring is not a build | ✗ (the node *appearing* is the signal) |
| **supplement subagents** edit glue (SQL/DB, deps, config, wiring) | no — outside the loop *by design* (`orchestrate-route-supplement`) | ✗ (honest-by-absence) |
| **the orchestrator** writes an ADR (its one direct write) | no — a decision-log write, not a node | ✗ (lives in the decision log, not the forest) |

The lift is real and large: the builder-leaf row is where ~92% of work *bypassed* the loop before
(ADR-0128). Driving it by default raises the wisping fraction of the **leaf-provable** work from ~7.6%
toward its structural ceiling. The floor is also real and permanent: **supplement-glue, authoring, and
the docs/ADR/corpus tail structurally never wisp**, even with perfect orchestration. That is exactly
ADR-0128's *honest by absence*, unchanged.

**"A bug is a missing contract"** (ADR-0137 d.4) raises the *conversion* of changes/fixes into drivable
contracts — but only for changes that have an isolatable red→green. It does **not** dissolve the
structurally-non-leaf classes. The ~83% "structural" finding largely **stands as a per-edit floor**;
the new model moves the **driven fraction of the leaf-provable subset**, not the shape of the work.

The single thing that blocks even leaf-provable **fixes** from wisping today is **OQ-A** (below): the
current node-dispatch path is the non-persisting `--live` smoke, so a spawned fix-drive writes no
`building` event. That is the one new fork worth deciding to make goal (b) — *wisps honestly show up* —
real for fixes.

---

## 1. The mechanism, from the code (ground truth)

A wisp is sourced from the harness, not the session (ADR-0048 §1): a unit shows an orbiting wisp **iff**
a `building` work-event keyed on `(unit_id, run_id)` has no terminal verdict and is within
`BUILD_IN_FLIGHT_TTL_MS` (20 min). The read fold is
[`apps/studio/server/inFlightBuilds.ts`](../../apps/studio/server/inFlightBuilds.ts) (`rowsToBuildActivity`
drops rows past the TTL and colours by `doc->>'phase'`); the row source is the `WITH latest_building …
SELECT DISTINCT ON (unit_id) … ORDER BY seq DESC` query (mirrored in the desktop
[`backend-entry.ts`](../../apps/desktop/electron/backend-entry.ts) `inFlightBuilds` and
[`libraryBackend.ts`](../../apps/studio/server/libraryBackend.ts)).

**Who writes a persisted `building` event (the exhaustive list of wisp sources):**

| writer | path | persists to `events.work_event`? | wisp? |
|---|---|---|---|
| `buildNodeReal` | `node build --real` | **yes** — `--store` resolves to `pg` for `--real` ([`node-build.ts:667`](../../packages/drive/src/node-build.ts), `:943`); runs the node's **real** proof via `proveUnit` | **✓** |
| `story build --real` (per cap) | `story build --real` | **yes** — drives each capability via the same real path; also opens an auto-merging PR | **✓** (one wisp per cap, in turn) |
| `phaseActivityWriter` | during a real build | **yes** — phase-stamped `building` marks that colour the wisp red→green ([`phase-activity.ts:53`](../../packages/drive/src/phase-activity.ts), wired at `node-build.ts:693`) | **✓** (colour only) |
| `emitWisp` | `node build --dry-run --emit-wisp` | **yes** — ONE transient `building` mark for the real unit, dwells ~75s (ADR-0080); a manual smoke, never a verdict | **✓** (transient, manual) |
| `node build --live` | the **routed** node dispatch | **NO** — synthetic `add(2,3)` smoke, in-memory; ADR-0099-B forbids persisting a forged green ([`build-worker.ts:338`](../../packages/drive/src/build-worker.ts), `node-build.ts:941`) | **✗** |
| `node build --dry-run` | scripted walk | **NO** — in-memory; `--store pg` is refused (`node-build.ts:317`) | **✗** |
| direct edit / `pnpm gate` / merge / a plain coding subagent | — | **NO** — nothing is written to `events` at all | **✗** |

The load-bearing consequence: **a wisp requires the real-drive harness with `--store pg`.** "Spawn the
leaf" only produces a wisp if the spawn invokes `buildNodeReal` / `story build --real` — *not* if it
spawns a generic coding subagent that edits files and runs `pnpm gate`. This is the linchpin for goal
(b), and it is exactly where ADR-0137's residual sits (OQ-A).

## 2. What ADR-0137 changes (and what it cannot)

ADR-0137 promotes the chat from the **propose-only** headless runtime
([`headless-orchestrator.ts`](../../packages/agent/src/headless-orchestrator.ts) — `tools: []`, no
Write/Edit/Bash, single-session guard) to a runtime that **spawns** subagents (story-author, builder
leaf, supplement subagents) and writes **ADRs** directly. It mostly affirms ADR-0108; Phase 3 (drive
authority) is the unbuilt part.

For wisps, the change is: the builder-leaf drive becomes the **default outcome of a session**, not a
manual CLI afterthought. ADR-0137 d.1 explicitly keeps the honest spine — *"the spine observes
RED→GREEN and SIGNS, CI re-proves, the human lands."* That spine path is the `buildNodeReal` /
`story build --real` path that persists a `building` event. **So the architecture intends wisps** for
the leaf-provable work it drives.

What it **cannot** change: the three non-build edit-classes have no `building` event to write, so they
cannot wisp regardless of how well the orchestrator runs.

- **Supplement-glue** is, by `orchestrate-route-supplement` (which ADR-0137 d.4 *extends*, not retires),
  done by the orchestrator's **own subagents** — SQL/DB adapters, dependency additions, visual wiring,
  pure config — work with *no isolatable red→green*. These subagents edit files; they do not drive a
  gate; they write nothing to `events`. **No wisp, by design.**
- **Authoring** (story-author writing `story.md`) is not a build. The honest signal that authoring
  happened is the **node appearing** on the map (`mapped`/`proposed`), not a wisp (a wisp needs a build —
  ADR-0128 §Context).
- **ADR-writing** — the orchestrator's one direct write — is a decision-log write, with no forest node
  and no build. It is invisible on the forest map (and correctly so; it lives in `docs/decisions/`).

## 3. Re-examining the ~17% / ~83% split under the new model

[`inner-loop-adoption-gap.md`](inner-loop-adoption-gap.md) classified the 286 source-bypass PRs by
*buildability shape*. Re-read through the question *"would this wisp under perfect ADR-0137
orchestration that routes every drivable core to `--real`?"*:

| change-kind / shape | % of bypass | wisps under perfect ADR-0137? |
|---|---:|---|
| CODE single-package clean | 10% | **✓ fully** — the clean adoption gap; one driven unit, one wisp |
| CODE single-package + 1 non-code file | 7% | **✓ core** — code wisps; the 1 doc/config file is supplement (✗) |
| UI / visual (operator-attested) | 28% | **◐ partial** — the stage-1 geometry/behaviour drive wisps *if* routed via `--real`; the stage-2 appearance attestation is separate (no wisp) |
| CODE cross-package (≥2) | 28% | **◐ sequenced** — each decomposed sub-unit wisps in turn; the wiring *between* them is supplement (✗) |
| CODE fused w/ docs/corpus/infra | 14% | **◐ core** — the code core wisps; the docs/corpus/infra is supplement (✗) |
| CODE + UI mixed | 6% | **◐ split** — logic core wisps; visual via stage-1 (◐) |
| test-only | 5% | **✗** — adding an already-green test is not a red→green leaf |
| glue / scripts only | 1% | **✗** — no isolatable proof |

**Two different denominators give two different honest answers:**

- **Per node / per provable-unit:** *most* units that carry a drivable core will show a wisp **while
  they build**. This is the big lift — from 23 driven PRs toward the ceiling ADR-0129 named (~50 clean +
  the code-cores of the ~218 mixed). The map gets visibly busier during active orchestration.
- **Per edit / per byte changed:** a large, permanent fraction never wisps — the supplement glue, the
  wiring between sequenced units, the authored `story.md`/ADR text, the docs/corpus/infra tail, and the
  test-only/pure-glue floor.

**Does "a bug is a missing contract" convert the ~83%?** Partially, and only at the leaf-provable
margin. A bug whose contract is an isolatable red→green unit test (a logic/server function returning the
wrong value) converts cleanly: story-author adds the failing contract → builder leaf drives it green →
**wisp**. A bug in a *non-leaf* surface — a visual glitch (operator-attested), a multi-surface wiring
defect, a config/infra mistake — has a "contract" only in the loose sense; it routes to the
frontend-builder (two-stage) or to supplement, so it wisps **partially or not at all**. The reframe
raises the *drivable ceiling* (changes/fixes that were previously untracked now become contracts), but
it does **not** move the *structural floor*. The ~83%-is-non-leaf finding remains the correct per-edit
picture.

## 4. The seed sub-questions, answered

1. **Does a wisp fire for EVERY inner-loop build, or only `--real --store pg`?** Only `--real`
   (`--store pg`). The current **routed node dispatch is `node build --live`** — a synthetic,
   non-persisting smoke (ADR-0099-B) → **no wisp**. So when the orchestrator spawns the leaf to drive a
   single contract for a *fix*, it wisps **only if** that spawn is wired to `buildNodeReal` (`--real`),
   not the `--live` smoke. `node build --real` *does* exist and *does* persist a real-proof `building`
   event — but routing the fix-drive to it (and deciding how the resulting verdict **lands**) is
   unsettled. → **OQ-A.**

2. **Non-leaf glue (supplemented via subagents): how should it show on the map, if at all?**
   It does not, and ADR-0128 already ruled that honest: the map orbits *builds*, blooms *verdicts*, and
   the **dock** (ADR-0033) carries advisory session presence. "No wisp for glue" is the accepted stance.
   The only open part is whether the *new* node-anchored orchestrator is a reason to revisit it
   (see #5 / OQ-B option B) — currently it is not.

3. **Authoring (a new story node appearing): is the node appearing the honest signal, vs a wisp?**
   Yes. A wisp is a *build* signal; authoring is not a build. The proposed node materialising on the map
   is the correct, honest signal that story-author ran. (Residual nicety, not a fork: how *promptly* the
   forest map reflects a freshly-authored proposed node — a render-freshness question, not a wisp one.)

4. **Does in-app orchestration ENFORCE that changes go through the inner loop?** **No — and this is the
   key structural truth.** ADR-0137 gives the chat *spawn* power, not raw Write/Bash; but the **spawned
   supplement subagents do have Write/Bash** and edit glue **outside** the loop by design. Moreover,
   nothing *enforces* that a given change becomes a contract (→ leaf → wisp) rather than a supplement
   (→ subagent → no wisp): that is the orchestrator's **routing judgment** (ADR-0137 d.4's "judge
   under-specified-story vs right-contract-wrong-impl vs glue"). **So wisps are incomplete by
   construction, and the wisping fraction is a function of how aggressively the orchestrator converts
   work into provable contracts.** Name this plainly: even a perfect in-app orchestrator leaves the map
   partially bare, and the coverage is a tunable behaviour, not a guarantee.

5. **Wisp TTL / ephemerality across a long multi-build orchestration.** Each `(unit_id, run_id)` gets
   its own `building` event, cleared the instant its verdict lands (passes are fast) or after the 20-min
   TTL. A story's caps drive in `depends_on` order, so you see **one per-cap wisp at a time, hopping
   cap→cap**, with **dark gaps** while the orchestrator decides, spawns the next leaf, or supplements
   glue. There is no continuous "this session is working on node X" glow — that is precisely the
   *planning presence* [ADR-0124](../decisions/0124-honest-session-presence-machine-emitted-by-the-outer-loop-ru.md)
   proposed and the owner **withdrew** (ADR-0128: *don't render planning*). The new wrinkle worth
   *flagging* (not reopening): ADR-0124 was decided before an in-app orchestrator that is itself
   **anchored to the node it is building**, so a machine-emitted "orchestration active here" marker is
   now *cheaper and more honest* than it was. It remains **closed** unless the owner chooses to revisit
   (OQ-B option B).

6. **Interaction with ADR-0129's target-ratio question.** ADR-0137 **is** the Phase-3 lever ADR-0129
   named — building it is what makes driving the default path. It does not change ADR-0129's OQ1
   (observability vs dogfooding) or OQ3 (the tail / ADR-0057 E), but it **sharpens the ceiling**: the
   "a bug is a missing contract" reframe pulls changes/fixes into the drivable set, so the honest
   achievable ratio is **higher** than the ~50-clean-plus-cores estimate ADR-0129 carried. Answer
   ADR-0129's OQ2 with the raised ceiling in mind.

## 5. Open questions (the deliverable)

Reserved as Library `open-question` artifacts (live store; surfaced in the studio) and escalated to the
owner — not decided here.

- **OQ-A — the fix/change-drive build shape + how a single-contract fix lands.** *(reserved:
  `oq-fix-drive-build-shape`)* The concrete enabler for goal (b). Today the routed node path is the
  `--live` smoke (no persist, no wisp); `node build --real` persists a real-proof `building` event but
  produces a signed verdict + a parked `claude/real/<id>-<run>` branch — **not** an auto-merging PR
  (only `story build --real` opens one, ADR-0136). So Phase 3 must decide: (i) route the spawned
  fix-drive to `node build --real` so it persists → wisps and runs the contract's **real** proof
  (respecting ADR-0099-B: a *real* drive may persist; a *synthetic smoke* may not); and (ii) how the
  resulting verdict+branch **lands** for a single-contract fix (human accept-to-land; promote to the
  owning story's Build affordance; or a node-level auto-merge PR). Until this is built, **leaf-provable
  fixes do not wisp**, even with the orchestrator wired.

- **OQ-B — is the target "drive every leaf-provable unit" (honest-by-absence), or do we invest in a
  signal for the non-leaf classes?** *(reserved: `oq-wisp-coverage-target`)* The owner's headline
  question of record. Recommendation leans the already-settled way (ADR-0128): accept that
  supplement-glue, authoring, and the docs/corpus tail structurally never wisp; the target is to **drive
  every leaf-provable unit** so it wisps (which OQ-A unblocks), and the dock + node-appearance are the
  honest signals for the rest. The alternatives are listed so the choice is deliberate: (B) revisit
  ADR-0124 and add a node-anchored "orchestration active" marker now that the orchestrator is
  node-anchored; (C) build ADR-0057 E (authoring-as-proof) to give the docs/ADR/corpus tail a structural
  signal (this is ADR-0129 OQ3). Feeds, and does not duplicate, ADR-0129's ratio/goal fork.

**Pointers (already tracked — no new artifact):**
- *Target ratio / goal* → [ADR-0129](../decisions/0129-inner-loop-adoption-target-ratio-and-goal-open-question.md)
  (proposed). The new model raises its ceiling; answer it with that in mind.
- *Node-anchored planning presence* → ADR-0124 (superseded) / ADR-0128 (settled: don't render
  planning). Flagged above as a possible revisit, **not reopened here**.
- *The honest-consultant enlistment discipline* → ADR-0137's named **candidate Library principle** for
  the **guidance-curator** to author + graduate. Not a wisp question.
- *Authoring-as-proof for the tail* → ADR-0057 E (unbuilt) = ADR-0129 OQ3.

## 6. Recommendation for the owner

1. **Set the expectation honestly:** in-app orchestration will make the forest map **materially
   livelier** — most provable units will wisp while they build — but it will **not** put a wisp on every
   edit, and it should not. Supplement-glue, authoring, and the docs/corpus tail are wisp-less *by
   construction*; that is ADR-0128's honest-by-absence, vindicated again under the new model.
2. **Build OQ-A** (the fix-drive build shape) so leaf-provable **fixes** — not only whole-story Builds —
   persist a real `building` event and wisp. This is the one new piece needed for goal (b) to cover
   fixes; it is the natural companion to ADR-0137 Phase 3.
3. **Answer ADR-0129's OQ2** (target ratio) with the raised ceiling the changes→contracts reframe
   creates; OQ-B parks the coverage-envelope confirmation alongside it.
4. **Do not** aim for "all edits wisp," add a planning render (ADR-0124 closed), or force-fit glue into
   a hollow proof — each fights the design the corpus already settled.

## Appendix — method

Code read on the worktree at `claude/romantic-pasteur-afc3c8` (no build run, no DB query beyond `db:status`):
the wisp fold ([`apps/studio/server/inFlightBuilds.ts`](../../apps/studio/server/inFlightBuilds.ts));
the persist paths ([`packages/drive/src/node-build.ts`](../../packages/drive/src/node-build.ts)
`buildNode`/`buildNodeReal`, the `--store` resolution, `--emit-wisp`;
[`phase-activity.ts`](../../packages/drive/src/phase-activity.ts));
the routed dispatch ([`packages/drive/src/build-worker.ts`](../../packages/drive/src/build-worker.ts)
`routedBuildRunner` — story→`--real`, node→`--live` smoke);
the propose-only runtime ([`packages/agent/src/headless-orchestrator.ts`](../../packages/agent/src/headless-orchestrator.ts)).
The PR/shape figures are carried verbatim from [`inner-loop-adoption-gap.md`](inner-loop-adoption-gap.md)
(re-derivation not repeated). ADRs read on disk: 0048, 0090, 0094, 0099, 0108, 0124, 0128, 0129, 0136, 0137.
