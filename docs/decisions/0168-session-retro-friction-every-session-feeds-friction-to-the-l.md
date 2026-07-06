---
status: proposed
---
# ADR-0168: Session-retro friction: every session feeds friction to the Library through a justification-gated graduation loop

## Status

**proposed** (2026-07-06) — authored by the owner-chipped deep-think + research session (`task_cfcc5788`,
directed 2026-07-06) for the owner to ratify, fork, or reject. The owner directed the *investigation*
(a retro surface, a `friction` artifact kind, anti-slop options, a justification gate with an
alignment check, a prior-art research pass) but has NOT pre-decided the design — so this ADR is born
`proposed` and the "Owner forks" section lists the genuine forks. The prior-art research pass that informs it is
[`docs/research/session-retro-feedback-loop-prior-art.md`](../research/session-retro-feedback-loop-prior-art.md)
(dated and model-tagged per source, per the owner's charter).

## Context

### The ask

The owner's north star: **agent effectiveness** — a standing way for every session to feed its
friction back into the Library so the system keeps improving to deliver what agents need. The named
core problem is **anti-slop**: "make sure we don't spam the Library with slop friction."

### What already exists (this ADR completes a designed loop; it does not invent one)

- **[ADR-0032](0032-cite-graduation-mechanism.md)** designed the signal → Library loop: a *comment*
  is a signal an artifact needs attention (BUILT — `events.comment`, `PgCommentStore`); a *cite* is a
  typed link forming a signal-graph (**never built** — no `events.cite` exists); *graduation* is a
  synthesis agent reading accumulated signal into the OQ→ADR flow (`graduation-synthesist` — **named,
  unbuilt, owner-deferred**). Its §5 deliberately deprioritized anti-*gaming* machinery as solving an
  unobserved problem.
- **[ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md)** added agent-memory
  as a signal source with a working mechanical engine (`graduationCandidates`), the pre-merge
  librarian pass (D7), the able-things-only rule (D5), and the genuine-durability bar (D8).
- **`friction-analyst`** (BUILT, on-demand): per-RUN friction analysis over typed events, emitting an
  anchored signal post. **Per-run, not per-session** — and interactive sessions emit no typed event
  stream, so a session retro is structurally *self-report*.
- **The anti-slop corpus**: `signal-and-noise`, `edit-first-curation`, `reference-dont-restate`,
  `two-consumer-extraction`, `stateless-vs-stateful-graduation`, the ADR-0024 blind-reconstruction
  test.
- **[ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md)/[ADR-0161](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md)**:
  process artifacts make no new policy; enforcement is three-layered (code fences / structural gates /
  librarian judgment).

### The evidence — the observed failure is BLOAT, not forgery

ADR-0032 §5's posture was "defend on evidence." The evidence has arrived, but for **slop** (honest,
low-value volume), not gaming: agent-memory hit 115 files / 71 KB index against a ~24 KB budget
(ADR-0095's own context); `check:graduation-worklist` today surfaces **~31 candidates, mostly
event-specific, on every gate run** — a WARN that fires constantly and drains nothing; graduation
candidates reach the owner **one at a time with no standing gate** (live illustration 2026-07-06: a
lone un-ratified `merge-ceremony` candidate from a librarian survey). Two structural lessons:

1. **A WARN-backed worklist with no drain obligation rots.** The 31-candidate queue sits behind an
   existing WARN and an existing librarian duty — the failure is the *drain*, not the capture format.
   Any new friction store inherits this failure unless the drain is made load-bearing.
2. **Self-report is where slop enters.** A session retro has no typed event stream to cite, and an
   eager frontier model will manufacture plausible lessons — so the evidence bar must be structural
   at capture, and worth must be verified (not just cited) before anything renders into guidance.

### The prior-art pass (summary; full writeup in docs/research/, 25 claims adversarially verified 3-0)

Across Reflexion, Voyager, Generative Agents, ExpeL (2023, pre-frontier) and Mem0, Memory-R1,
ReasoningBank, ACE, SSGM (2025–26, frontier-era), five verified findings bear directly on this design
(each source dated and model-tagged in the writeup): **(a)** the owner's hypothesis is substantially
confirmed — the 2023 cohort's arithmetic scaffolding (hard caps, decay×importance retrieval, vote
counters) existed because judge models were weak (ExpeL's authors said so verbatim in 2023), and the
2025 field moved to judgment-based curation — the bet ADR-0032 §3/§5 already made; **(b)** two hard
counterpoints bound that shift: letting an LLM *holistically rewrite* a store is destructive (ACE's
"context collapse": 18,282 tokens → 122 in one step, below the no-memory baseline — so ACE keeps a
deterministic non-LLM write path even with frontier models), and judgment-only admission does not
keep a store clean at production scale (a Mem0 audit found 97.8% of 10,134 LLM-gated entries were
junk); **(c)** format is load-bearing — naive failure logging measurably *hurt* (AWM 44.4→42.2)
while distilled lessons capped at **max 3 per trajectory** helped (ReasoningBank, 46.5→49.7): the
cap-3 retro and never-inject-raw-friction choices below are that finding applied; **(d)** what
frontier models do NOT fix and structure must: confabulated lessons atop real evidence, staleness
detection (best 2026 model: 55.2% at noticing invalidated memories), and counter-evidence collection
once a wrong rule is written (the self-reinforcing-bad-lesson loop); **(e)** **no surveyed system
uses human ratification as a graduation gate** — every one automates admission — so the owner-held
ratification step below is a deliberate storytree novelty with no published precedent either way.
The design is therefore judgment-centred (per 0032) with mechanical enforcement **only** where
prior art and our own repo evidence show strong models still fail.

## Decision (proposed)

**One sentence:** every landing session runs a bounded, evidence-fenced **retro** that files typed
`friction` items onto a **disk-canonical friction shelf** (`docs/friction/`, mirroring the decision
log's disk-canonical pattern); the **pre-merge librarian pass adjudicates a bounded, aged slice**
of the shelf through a **justification gate** whose tough questions route each item to
**ADR / tool-chip / principle-or-guardrail / process / definition / edit-existing / nothing**, with
**verification proportional to blast radius**, a **fail-closed drain ceiling**, and an explicit
**rollback story** — raw friction never enters the Library; only its durable essence graduates,
through the existing ADR-0095 judgment.

### D1 — The retro: a capped, evidence-fenced orchestrator step BEFORE the librarian pass

The session-orchestrator workflow gains a step between "gate green" and the ADR-0095 D7 librarian
pass (a seed-canonical agent edit, ADR-0055): review the session for friction — *what fought you, at
what cost, with what evidence* — and file **at most 3** items; **"nothing to report" is a
first-class, free outcome** (no marker, no penalty). Filing before the pass means this session's
librarian can at least hygiene-check the new items (route-adjudication waits — D4). Capture
compliance is **discipline** (the generated workflow region), not a per-session gate — a compliance
gate would price the ceremony toward retro theater; the backstop is the shelf ceiling (D4).
Cost: one search + at most 3 small file writes — offline, no DB, within the ADR-0162 bar.

### D2 — The friction shelf: disk-canonical files, like the decision log — NOT a Library kind (yet)

Raw friction lives as **one markdown file per item under `docs/friction/`** with zod-validated YAML
frontmatter — the `docs/decisions/` pattern applied to friction: offline-readable, remote-session
writable (443-only sessions land files via their PR), CI-validatable, and it **can never drift from
the repo**. Frontmatter (designed field-compatible with a future `friction` kind — see fork F1):

- `statement` — the friction in one sentence (what fought you, not what you learned);
- `evidence` — **required, ≥1 concrete citation** (command + output excerpt, file path, PR#, quoted
  error). No evidence → the gate refuses the file (fail-closed, like `adr-health`);
- `implicates` — artifact ids / ADR numbers touched (multi-target, the role comments' single anchor
  cannot play);
- `provenance` — `{ branch, date }`;
- `reinforcedBy` — recurrence log: a later session that re-hits the trap **edits the existing item**
  (append `{ branch, date, evidence }` — reinforcement REQUIRES its own evidence), never files a
  duplicate. This realizes ADR-0032's cite-as-reinforcement for this path without building the cite
  store; recurrence count = `reinforcedBy.length`, evidence the adjudicator weighs, **never a
  threshold**;
- `route` / `routeReason` — set only at adjudication (D4/D5); capture never classifies (no severity
  enum, no taxonomy — classification-at-capture is the eager-synthesis failure, and the adjudicator
  reads prose).

**Why disk, not the Library:** ADR-0095 D5 itself says event-specific records belong in *git history /
the relevant ADR* — raw friction IS event-specific material, so its shelf belongs in git; the Library
receives only the durable essence, exactly as D5 always required. **No D5 carve-out is needed at
all.** (Note: D5's kind enumeration already omits `open-question`/`proposal`, the existing
transient kinds — the "a new kind must amend D5" framing is softer than it looks; the fork stays
real but is about surfaces and cost, not doctrine. See F1.)
**Why not comments:** single-anchor, live-DB-only at session end (the ADR-0162 regression; remote
sessions cannot write at all), and the drain check would go DB-dependent — the exact
offline-always-runs property `check:graduation-worklist` relies on.
**Why not the kind now:** a new kind is honestly ~6–7 units (schema + CLI + gates + a full studio
unit — `types.ts`/`Library.tsx`/`apiRouter.ts` allowlist/`knowledgeFields.ts`/CSS all hardcode the
kind list), bought before one week of real retro volume has ever been observed — ADR-0032 §5's own
"defend on evidence" test applied to this design. The shelf delivers the same typed + drained
semantics for ~2 units and generates the volume evidence that decides F1 properly.

### D3 — Anti-slop at capture (machine, fail-closed)

A new offline gate **`check:friction`** (in `pnpm -r test` / `pnpm gate`, CI-visible — the shelf is
in-repo, so unlike the DB-bound checks it always runs): validates frontmatter shape; **refuses
evidence-free items**; refuses >3 items per branch/date; refuses unresolvable `implicates`;
enforces the drain ceiling (D4). The repo-surface manifest gains the `docs/friction/` entry.

### D4 — The drain: bounded, aged, and fail-closed at a ceiling (the load-bearing mechanism)

- **Aged:** an item becomes *routable* only once it is at least one session old (the session that
  filed it never adjudicates it — no marking your own homework).
- **Bounded:** the pre-merge librarian pass adjudicates the **K oldest routable items** (K≈3), not
  the whole shelf — per-merge whole-batch adjudication neither scales with landing rate nor
  coordinates across parallel sessions.
- **Fail-closed ceiling:** when open items exceed **N (≈12)** or the oldest exceeds **M (≈21 days)**,
  `check:friction` flips WARN → **red**, and landing requires a dedicated drain pass (a
  librarian-curator "board" session that adjudicates the backlog and hands the owner ONE digest —
  replacing today's one-candidate-at-a-time drip). A WARN-only drain is the mechanism that already
  produced the 31-candidate rot; the fail-closed cap follows the corpus's own precedent
  (`meter-fail-closed-caps-in-real-cost`, the ADR-0130 turn cap). The ceiling gates **queue
  hygiene only** — no count or age ever decides what *graduates* (ADR-0032 §3/§5 intact).
- **Archive is a tombstone, not a delete:** `route: nothing` records `routeReason`
  (archive-with-reason, ADR-0032 §4) and the file moves to `docs/friction/archive/` — retained so
  recurrence of an archived trap is *detectable* (a re-file matches the tombstone and re-opens it
  with the stronger evidence). Deletion happens only at a long consolidation horizon. (Capture-then-
  delete, D6 of ADR-0095, applies to *agent-memory*; the shelf's tombstones are what make the
  north-star metric — see "Success measures" — observable at all.)

### D5 — The justification gate and the routing table

The gate's **RULE** is this ADR plus a new `friction-justification-bar` principle (authored through
guidance-curator — it is behavioural floor); its **PROCEDURE** ships as a `friction-adjudication`
process artifact that makes no new policy (ADR-0034 §2 / ADR-0154). The adjudicator (the librarian
pass, or the board at a ceiling breach) answers, per item, into `routeReason`:

1. **Does the evidence *support* the claim?** — not merely exist. A real cold-start log does not
   support "always `db:up` first" (it contradicts ADR-0162). Spot-verify; for any route that renders
   into agent guidance, spawn **corpus-investigator** to verify (see blast-radius rule below).
2. **Reconstructible?** Would a fresh agent re-derive this from today's corpus just-in-time?
   (ADR-0024) → `nothing`.
3. **Closest existing artifact — why is an edit not enough?** (`edit-first-curation`; the search and
   its result go in `routeReason`.)
4. **Stateless?** (`stateless-vs-stateful-graduation`) UNCERTAIN → stays on the shelf.
5. **Discriminatory?** Name the concrete future situation where an agent acts differently.
   (`signal-and-noise`.)
6. **Recurred — or structurally certain to recur?** One-offs wait on the shelf for reinforcement.
7. **Cheapest fix?** A code fence or tool beats guidance an agent must remember — prefer the
   `tool-chip` route over prose.

| route | output | executor → reviewer/ratifier |
|---|---|---|
| `nothing` | tombstone + `routeReason` | librarian (audit trail is the reason) |
| `edit-existing` | edit + provenance backref | librarian; guidance-curator if floor; **corpus-investigator verify** |
| `principle` / `guardrail` | floor artifact | **guidance-curator** authors; **corpus-investigator verify** (renders into every future session — highest blast radius) |
| `process` | derived ceremony | librarian; must cite its deciding ADR (ADR-0154) |
| `definition` | reference tier | librarian |
| `adr` | **born-`proposed` ADR, always** | drafted with the alignment check below; **owner ratifies** |
| `tool-chip` | `spawn_task` chip citing the friction id; structural forks → story-author | owner clicks |

**Verification proportional to blast radius:** the ADR route is already contained (born `proposed`,
owner-held), but the principle/guardrail/edit routes flow through the render pipeline into **every
future session's guidance** — so those routes carry the *mandatory* corpus-investigator verification,
not the ADR route alone. Batch adjudication is never "owner-directed in this conversation," so a
friction-born ADR can **never** be born `accepted` under ADR-0110.

**The alignment check (friction → ADR):** before the draft leaves the session — (a) survey
`storytree adr list --load-bearing` and name every touched decision in the new ADR's Context; (b)
corpus-investigator verifies the friction's factual claims against live sources; (c) declare
`amends`/`supersedes`/`supersedes_in_part` edges up front (`adr-health` enforces mechanically); (d) a
contradiction with an accepted load-bearing ADR halts as an owner escalation — it is never drafted
around.

### D6 — Rollback, and the self-sealing hazard

Every friction-born artifact carries provenance back to its friction item(s) and their evidence. A
graduated rule that turns out wrong is **reverted through the library-edit ceremony** (edit/retire +
regenerate + `sync-agents`), and its originating friction re-opens with the counter-evidence.
Explicitly: **contradicting a friction-born artifact with new evidence is itself first-class friction
— never non-adherence.** (Without this line, the corpus's own owner-fork-bar discipline makes a wrong
graduated rule self-sealing: sessions obey it and questioning it reads as defection.)

### D7 — Three-layer enforcement (the ADR-0161 mapping)

- **Machine, blocking:** `check:friction` shape + evidence-present + cap + `implicates` resolution +
  the drain ceiling; `adr-health` edges on the ADR route.
- **Machine, WARN:** shelf-age advisories below the ceiling; the existing `check:graduation-worklist`
  (unchanged).
- **Librarian judgment:** the seven questions, routing, reinforce-vs-new calls, tombstoning — worth
  is never arithmetic.
- **Owner-held:** ratifying friction-born ADRs; tool-chip clicks; the F1/F2 forks; un-deciding.

### D8 — What stays unchanged

`friction-analyst` (per-run, evidence-typed) is untouched and may *file* shelf items as its
best-evidenced producer when invoked. **`graduation-synthesist` stays parked** — the owner's existing
deferral stands, no new question is opened; the adjudication ceremony is written role-agnostic, so if
the synthesist is ever built it takes the board chair without re-decision. `check:graduation-worklist`
and the ADR-0095 memory-graduation path are unchanged (memory and the shelf are different sources
feeding the same librarian judgment). ADR-0032 §5's anti-gaming deferral is **reaffirmed**: this ADR
answers observed slop with structure-only mechanics; no forge-resistance, no cite-integrity machinery,
no worth-thresholds.

## Success measures — how we know it's working (the north star is effectiveness, not inbox health)

**Primary observable: post-route recurrence extinction.** After a friction routes to a fix, the same
trap must stop appearing — no re-file, no reinforcement, no reappearance in agent-memory. A routed
item that keeps recurring means the loop produces bloat, not learning.

**Falsification tripwires** (any of these standing for ~a month falsifies the design as tuned, and
escalates): open count growing monotonically across 4+ weeks with the ceiling being hit repeatedly;
`route: nothing` share near 0% (gate is theater) or near 100% (capture is noise); reinforcement never
firing (dedupe dead — duplicates minting); an archived trap re-filed without its tombstone re-opening
(recurrence detection broken); retro output ~always empty (ceremony priced too high).

## Owner forks (escalated, not decided)

- **F1 — The substrate: promote the shelf to a Library `friction` kind, and when?** The owner
  proposed `friction` as a new artifact kind (it would be the **10th structured kind**; the CLI's
  `template` category is a listing group, not a kind). This proposal starts with the disk shelf
  (D2) and treats the kind as the **evidence-gated destination**: promote when observed volume/shape
  shows the shelf needs per-id live rows (parallel-session contention), a studio inbox, or real DAG
  `references` edges — the frontmatter is field-compatible by design, so promotion is a file
  migration, not a redesign. **Alternatives:** (a) build the kind NOW (~6–7 units incl. a studio
  unit; strongest surfaces day 1; but session-end gains a live-DB dependency that still needs an
  offline fallback — two substrates in practice); (b) comments-only minimalism (cheapest; but
  single-anchor, unenforceable evidence bar, DB-dependent drain — the audited weaknesses).
  **Recommendation: shelf now, kind on evidence** — but the kind's timing is genuinely the owner's
  call, and reasonable owners could choose kind-now for the studio visibility alone.
  *Why not reuse `open-question`/`proposal`:* both force route-classification at capture (an OQ is
  already a question, a proposal already a decided change) — the exact eager-synthesis failure this
  design defers to adjudication; and neither can carry evidence-required-at-capture or reinforcement
  without distorting its spec.
- **F2 — The drain ceiling: fail-closed (recommended) or WARN-only?** Everything else about gate
  weight is corpus-settled (judgment for worth, machine for structure, cheap ceremony — ADR-0032/0161/
  0162), but flipping a full gate red on shelf-count/age is **new policy** with a real cost (a
  landing session may be forced into a drain pass it didn't plan). The WARN-only alternative is the
  mechanism the 31-candidate queue already defeated. Recommended: fail-closed at N≈12 / M≈21 days,
  tunable by evidence.
- **(Not re-asked.)** Retro surface (D1) and the shape of the justification bar (D5) follow settled
  corpus doctrine; `graduation-synthesist` remains the owner's existing parked fork (D8) — building
  it is NOT proposed here.

## Consequences

**Good.** The designed-but-dormant feedback loop gets its missing pieces — a capture moment, a shared
typed substrate, a drain obligation, and a batch surface to the owner — at ~2 units of Phase-1 build;
raw friction stays out of the Library entirely (D5 honored by construction); every mechanism that
gates worth remains judgment (0032 preserved); the whole capture/validation path runs offline and in
CI; and the loop's health is measured against agent effectiveness (recurrence extinction), not
Library growth.

**Bad / costs.** A new repo surface and two ceremonies to keep honest; the fail-closed ceiling can
block an unrelated landing until a drain runs (that is its job — but it will annoy); disk-shelf
adjudication edits can conflict across parallel sessions (git-visible, unlike silent DB clobber, but
still friction); the studio cannot render the shelf until/unless F1 promotes it; and the biggest
residual risk is unchanged from all four candidate designs — **adjudication-cadence collapse**: if
drain passes rubber-stamp `nothing` to clear the ceiling (the archive mill), the loop performs
instead of learning. §6's tripwires exist to catch exactly that.

**Build (Phase 1, if ratified — not started):** (1) frontmatter zod + `check:friction` + manifest
entry; (2) `storytree friction new/list/reinforce/route` CLI over the shelf (offline); (3) corpus
authoring — `friction-justification-bar` principle, `friction-adjudication` process,
session-orchestrator + librarian-curator agent edits (seed-canonical: regenerate + `sync-agents`),
and this ADR's edges recorded on acceptance (`amends 0032, 0095`, to be added to frontmatter at
ratification per ADR-0110/0139).

## References

- [ADR-0032](0032-cite-graduation-mechanism.md) (the loop this completes; §3/§5 the no-threshold /
  no-anti-gaming posture reaffirmed), [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md)
  (D4 routing, D5 able-only, D7 pass, D8 bar), [ADR-0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)
  (superseded origin), [ADR-0024](0024-blind-reconstruction-test-for-documentation.md),
  [ADR-0034](0034-process-artifacts-ways-of-working.md) / [ADR-0154](0154-librarian-curator-owns-the-process-tier-as-a-standing-projec.md)
  (process = projection), [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md)
  (born-proposed discipline), [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md),
  [ADR-0143](0143-undeclared-session-nudge-sessionstart-injects-the-anchor-pro.md) (the nudge
  pattern), [ADR-0161](0161-the-library-is-a-node-keyed-context-dag-agent-step-nodes-and.md)
  (three-layer enforcement), [ADR-0162](0162-manage-session-onboarding-cost-optimize-the-cost-centers-the.md)
  (the session-cost bar the retro must respect).
- Library artifacts: `signal-and-noise`, `edit-first-curation`, `reference-dont-restate`,
  `two-consumer-extraction`, `stateless-vs-stateful-graduation`, `meter-fail-closed-caps-in-real-cost`,
  agents `friction-analyst` / `graduation-synthesist` / `librarian-curator` / `guidance-curator` /
  `corpus-investigator`.
- [`docs/research/session-retro-feedback-loop-prior-art.md`](../research/session-retro-feedback-loop-prior-art.md)
  — the dated, model-tagged prior-art pass (owner charter item 5).
- Design method: four independent designs (minimalist / new-kind / frontier-native / organizational-
  practice) adversarially audited from four lenses (corpus-alignment, anti-slop red-team, cost,
  owner-intent) against the live repo, 2026-07-06; the audit corrected six load-bearing claims before
  synthesis (private-memory substrate flaw, SessionEnd-hook misconception, remote 443-only capture,
  D5's actual letter, kind-count, studio cost).
- Owner charter conversation, 2026-07-06 (`task_cfcc5788`).
