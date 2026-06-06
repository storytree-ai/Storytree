# Adjudication — the open calls only you can make

A worktool, not a permanent doc (delete once these fold into the ADRs / glossary /
open-questions). The conflicts register triaged 52 findings; ~37 were already
settled by the glossary or ADRs 0003–0009 and need nothing from you. This is the
**remaining ~14 that need your judgment** — each a self-contained card.

**How to use:** read the **Q** and **Rec**, then either ✅ accept the rec or pick an
option / add a note. I fold your calls back into the ADRs, glossary, and
open-questions. "Decide" = genuinely open. "Ratify" = I already made the call in an
ADR; confirm or override. Look up *full* v1 detail in `C:\code\Agentic` by the cited
ADR number.

---

## Tier 1 — decide before `packages/core` schema (these block the build)

### A. DAG grain — do stories have edges, or are they pure rollups?
**Decide · impacts:** core schema, scheduler, studio render · **tracked:** ADR-0002 (open), glossary `DAG`
**Q:** Are story nodes connected by edges, or are stories pure *groupings* over a capability-level dependency graph that crosses story boundaries?
**Context:** ADR-0002 settled that **dependencies are capability-level** (UAT-generated). But README/glossary still say "DAG of stories." So the grain the studio renders is undecided. (v1 had one flat "story" grain with `depends_on` between stories — no split.)
**Options:** (a) stories are **pure rollups**; edges live only between capabilities; the studio derives a story-level view. (b) stories also carry **coarse derived edges** (a real story-DAG over capability deps). (c) defer to `packages/core`.
**Rec:** **(a)** — matches ADR-0002's stated default ("pure rollup"); render the story view as a projection. Cheapest, and reversible.
**✅ RESOLVED by ADR-0010 (2026-06-06)** — neither the original (a) nor (b). Stories are **bounded contexts that carry interface-edges**: a story may depend on another **only** through a declared, documented cross-story interface (`boundary`/`port`) — there is no cross-story capability graph. Capabilities have their **own within-story, code-derived** dependency graph (static analysis of imports/calls). Two graphs at two altitudes; cross-story coupling is not a pure rollup nor a coarse derivation of capability deps, but its own declared-interface grain.

### B. Event vocabulary — OTel-GenAI conventions, or a bespoke owned-loop-shaped set?
**Decide · impacts:** the whole event schema · **tracked:** open-q §8, ADR-0006
**Q:** Do our typed events follow **OpenTelemetry GenAI semantic conventions**, or a **bespoke** owned-loop-shaped vocabulary?
**Context:** v1 (ADR-0006) chose OTel-GenAI *for trace-SaaS interop*. v2 owns its store with **no SaaS in the loop**, so the original reason is gone — but OTel is still a stable, documented vocabulary we could borrow.
**Options:** (a) **bespoke**, mapped from the owned loop's lifecycle stream (fits our model exactly; no external constraint). (b) **OTel-GenAI** envelope (interop/standard, at some impedance to the owned loop). (c) bespoke core + an OTel **export** later if ever needed.
**Rec:** **(c)** — design the bespoke event types the owned loop actually emits; keep an OTel export as a future option, don't pay for it now.

### C. Proof persistence + who signs + signer identity
**Decide + Ratify · impacts:** core schema, gate, ADR-0007/0008 · **tracked:** open-q §1
**Q:** (1) Is proof persisted as **events, files, or both**? (2) Who **signs a UAT promotion**? (3) What **identity** backs a signature when there's no single human/subscription?
**Context:** v1 committed JSONL evidence (`*-red.jsonl`/`*-green.jsonl`) + `uat_signings` rows + a 4-tier signer chain + a signing-walk-ancestry gate (v1 ADR-0005/0014/0024). ADR-0008 already leans the *signing act* toward **human approval in the studio**; the persistence shape and identity are open.
**Options (signer):** human-in-studio (ADR-0008's lean) · autonomous agent · hybrid. **(persistence):** events-only · events + committed evidence files · files-only.
**Rec:** ratify **human-in-studio** signer; **events as SSOT, with proof artifacts referenced from events** (not a parallel file truth); identity = a simple local **operator** identity for now (single-operator dogfood), revisit when multi-operator. Confirm.

### D. `operator-attested` third proof mode — keep it? (Ratify)
**Ratify · impacts:** proof model, lifecycle · **tracked:** ADR-0007, glossary
**Q:** Does v2 keep a **third** proof mode for dogfood-only surfaces (no honest UAT, no isolatable test — e.g. the orchestrator's own routing), or force everything into capability/contract?
**Context:** ADR-0002's clean trichotomy has only capability(UAT)/contract(test). v1 ADR-0024 had `manual_signings` for exactly this class; v1 ADR-0028-D16 then slated it for retirement. ADR-0007 **kept** it (overruling D16) because storytree's own self-building orchestrator *is* such a surface.
**Options:** (a) keep `operator-attested` (ADR-0007). (b) drop it; require a real test or UAT for everything.
**Rec:** **(a) keep** — without it, guardrail/routing units get a faked UAT (the exact theatre the mock-UAT seam forbids). This is the one place I extended ADR-0002's ontology; it deserves your explicit yes/no.

---

## Tier 2 — shapes the orchestrator/studio build

### E. Human/UI posture — approval-gated trunk + per-action approval (Ratify)
**Ratify · impacts:** orchestrator, studio, trunk policy · **tracked:** ADR-0006/0008
**Q:** Confirm v2 inverts v1's autonomous cascade: the studio **drives** agents (not a read-only dashboard), per-action approval is first-class, and the trunk is **approval-gated** (no auto-merge-on-green).
**Context:** v1 ran `--dangerously-skip-permissions` + auto-merge-on-green + a `main`-may-hold-broken posture + an escalation-screener to ration human pings (v1 ADR-0006/0010/0013). v2 inverts all of it; self-building stays the north-star, not day-one.
**Options:** (a) ratify the full inversion (ADR-0006/0008). (b) keep some autonomy (e.g. auto-merge for contract-only changes).
**Rec:** **(a) ratify** — it's the project's headline ("watch + drive, go slow"). If you want a fast-path (e.g. auto-land green contracts without a human click), say so and I'll carve a narrow exception.

### F. Concurrency residuals — code-edit isolation + claim shape
**Decide · impacts:** orchestrator, ADR-0009 · **tracked:** open-q §3
**Q:** (1) Do the owned loop's **code edits** still use a git **branch/worktree per node**, or edit a shared checkout under DBOS isolation? (2) Is a **claim** node-scoped or file-glob, and what happens on refusal?
**Context:** ADR-0009 moved *coordination* off git (claims = Postgres rows, isolation = DBOS workflow). But where the owned loop's actual file edits land is separate and open. v1 used a git branch + worktree per session (ADR-0013).
**Options (edits):** (a) git **worktree per node** for edits (clean rollback, familiar) + DBOS for coordination; (b) shared checkout, serialize via claims (simpler, riskier). **(claim):** node-scoped (coarse, simple) vs file-glob (precise, more bookkeeping).
**Rec:** **(a)** worktree-per-node for edits + **node-scoped claims** to start; tighten to file-glob only if real contention shows up.

### G. Per-node budget — unit and default ceiling
**Decide · impacts:** spine, studio cost surface · **tracked:** open-q §6, ADR-0005
**Q:** A node loop ends on green **or** budget-exhausted — but budget measured in **what** (iterations / tokens / wall-cost / blend), and what default ceiling?
**Context:** v1 retired its iteration budget ("cascade rounds are not a cost") under a flat subscription; ADR-0005 resurrects one because v2 is pay-as-you-go. The *mechanism* exists; the unit/ceiling don't.
**Options:** (a) **iteration count** (simplest, crude). (b) **token/$ cost** (truest to pay-as-you-go, needs the owned loop to report usage). (c) blend (cost ceiling + iteration safety cap).
**Rec:** **(c)** — a $ ceiling is the real risk, an iteration cap is the cheap backstop; expose both in the studio. Default ceilings TBD after the first real runs.

### H. Decomposition loop + per-node spec taxonomy
**Decide · impacts:** scheduler, node-driving · **tracked:** open-q §4
**Q:** (1) Does v2 have a **decompose-before-implement** loop (stabilise the capability DAG before any contract goes red), and what's it called? (2) Does any **per-node spec file** survive, under what name?
**Context:** v1 ADR-0020 had an investigator→writer→review loop converging the DAG first. v1 drove nodes with a multi-persona cascade (Curator/Inspector/QA-Engineer…) + per-agent `contract.yml`. v2 collapses a node to a **single owned-loop session** (ADR-0004, ADR-0011), so the personas are gone; whether a neutral spec file survives (never named `contract`) is open.
**Options (loop):** adopt + name it (e.g. "decomposition") · fold into scheduler implicitly · defer. **(spec):** no spec (prompt template only) · a neutral `spec.md`/`node.yml`.
**Rec:** keep the **decomposition loop** as an explicit scheduler phase (name it `decomposition`); **no per-node spec file** to start — drive nodes from a prompt template + the unit's `outcome`/`guidance` fields.

---

## Tier 3 — safe to decide later (parked; flag your lean if you have one)

### I. Channel / post — fold into per-node chat, or a separate board?
**Decide-later · tracked:** open-q §5
**Context:** v1 had a per-story prose noticeboard (`channels/<id>/` + posts) for async cross-session notes (ADR-0011/0022). ADR-0008 makes per-node chat a first-class studio surface.
**Rec:** fold channel→**per-node chat as typed events** (a node's thread = its channel); drop the separate filesystem board. Confirm or keep a board.

### J. Cross-cutting knowledge tier + the learning loop
**Decide-later · tracked:** open-q §9 (+ §5)
**Context:** v1 modelled shared content as first-class `asset` entities with reciprocity-checked refs (ADR-0007), and a forum→graduation **learning loop** with a "verification-wins-over-recency" stance (ADR-0011). v2 dropped both (asset = tree-art now); only the *principle* is parked.
**Rec:** defer both; when they return, name the knowledge tier something **other than `asset`**. Flag if you want a placeholder now.

### K. Scheduling / navigation lenses
**Decide-later · tracked:** open-q §6
**Context:** v1's useful dashboard lenses: **frontier** (actionable work-front), **blast_radius** (downstream impact), **selector grammar** (dbt-style `+id`/`id+`), **staleness**, **era**.
**Rec:** adopt **frontier** + **blast_radius** in the scheduler early (they drive "what next / fix-first"); the rest as studio views later.

### L. Epic tier above stories?
**Decide-later · tracked:** open-q §7, ADR-0002
**Context:** ADR-0002 left open whether a 4th grouping tier ("epic") ever returns; v1 had `epics/`.
**Rec:** **not now, not precluded** (ADR-0002's stance). Confirm.

### M. Brownfield mapping mechanism
**Decide-later · tracked:** open-q §2
**Context:** `mapped` (observational-green, never `healthy`) is an accepted status; *how* storytree maps an existing test suite onto capabilities/contracts under the owned loop is undesigned.
**Rec:** defer until a real brownfield target exists (storytree builds itself first).
**Status-enum note (owner, 2026-06-06):** ADR-0010 settled the adjacent status-enum question — `proposed` was **retained** for the retro-authored seed; no `experimental` / `built-unproven` tier was added (experimentation stage). The `mapped` mechanism itself stays deferred as above.

### N. ADR-number allocation (governance, meta)
**Decide-later · tracked:** open-q §3, ADR-0009
**Context:** v1 hand-authored ADRs under concurrent sessions → two ADR-0021s + a phantom 0009. ADR-0009 says v2's own ADR numbers need a concurrency-safe scheme too.
**Options:** (a) a checked allocator (read trunk before claiming an integer). (b) **ULID/timestamp-ordered** ADR filenames (no integer race at all).
**Rec:** **(b)** for new ADRs if you ever author them in parallel again; otherwise a single-session convention is fine. Low urgency.
