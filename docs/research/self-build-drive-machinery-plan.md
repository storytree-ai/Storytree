# Execution plan — drive the library as storytree's first real node

**Status:** draft for owner review (authored 2026-06-10 in an overnight autonomous session).
**Goal:** move the story tree from *hand-authored retrospective spec* to *machine-grown*: have
storytree drive its **first real node — the library** — through its own owned loop + prove-it-gate,
producing a live, evidence-backed node rather than a markdown stand-in.

This is the "rebuild the story tree, first node = the library" north star, made concrete. It is the
plan to execute; the load-bearing decisions it surfaces are flagged **[OWNER]** and gate the phases
that spend money or commit a schema.

---

## 1. Where we actually are (verified this session)

| Piece | State | Evidence |
|---|---|---|
| Prove-it-gate driver | **Built + proven** end-to-end with a scripted model, real file writes, real shell test | `proveUnit()` at [prove-it-gate.ts:101](../../packages/orchestrator/src/prove-it-gate.ts); `prove-it-gate.e2e.test.ts` green |
| Owned loop | **Built**; `runStep`/`runTurn` drive a leaf authoring step | `packages/agent/src/step.ts`, `run-turn.ts` |
| Live model seam | **Real but never run live** | `AnthropicModel` at [model.ts:93](../../packages/agent/src/model.ts); no live e2e |
| Library tier (the node we want to build) | **Built + tested**, green offline (`pnpm -r test` exit 0): 35+ tests, cross-store parity suite, offline SEED gate | `packages/{core,store,cli}` |
| Persistence | **Library/comment only** — `events.library_event`, `library_artifact`, `comment_event`, `comment`, `schema_migration` | [schema.sql](../../packages/store/src/schema.sql) |
| Work-hierarchy persistence | **Missing** — no node, verdict/signing, rollup, or claim tables | — |
| Build-orchestration glue | **Missing** — no entrypoint that turns a node spec into a `proveUnit()` call | — |

**Two notable facts that shape the plan:**

1. **`proveUnit` already takes a `Store` and appends the signed verdict as a generic event** of
   `kind: "signing"` ([prove-it-gate.ts:87](../../packages/orchestrator/src/prove-it-gate.ts)). Against
   the pg store that currently lands in `events.library_event` — i.e. **verdicts co-mingle with library
   docs today.** A dedicated `events.verdict`/`events.work_event` table is the clean home (Phase A).
2. **`proveUnit` proves ONE unit in isolation.** Everything it needs is injected (the 14 `ProveSpec`
   fields). There is no node→source mapping, no dependency chaining, no CLI — that *injection layer* is
   the whole gap (Phase B/C/E).

---

## 2. The target capability

A single command:

```
storytree node build <unit-id> [--dry-run | --live] [--actor <email>]
```

that (a) loads a node spec, (b) resolves it into a `ProveSpec`, (c) drives `proveUnit()` through
`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE`, (d) persists the lifecycle events +
signed verdict, and (e) lets a node's status be **computed** from those events (never hand-written),
honoring ADR-0020 (`healthy` only via gate evidence) and ADR-0006 (status is a projection).

### The crux: supplying the 14 `ProveSpec` fields

This table *is* Phase B. Each field already exists as a type; the work is the resolver that fills it.

| `ProveSpec` field | Source in a real build | New work? |
|---|---|---|
| `unitId` | the node id (CLI arg) | trivial |
| `proofMode` | node frontmatter (`contract-test`/`integration-test`/`UAT`) | trivial |
| `testId` | resolver: node id → test command (see registry below) | **registry** |
| `model` | factory: `--dry-run`→`ScriptedModel`, `--live`→`AnthropicModel({apiKey: env})` | **factory + key plumbing [OWNER]** |
| `tools` | `FileToolExecutor` rooted at the workspace | small |
| `scope` | per-phase `PathWriteScope`: test-glob in AUTHOR_TEST, src-glob in IMPLEMENT | **per-node write-scope config** |
| `writeTools` | `FILE_WRITE_TOOLS` (exists) | trivial |
| `testExecutor` | `ShellTestExecutor` running `testId`'s command | small |
| `store` | `InMemoryStore` (dry-run) or `PgWorkStore` (Phase A) | depends on Phase A |
| `signerInputs` | `--actor` flag → env → git email (chain exists) | small |
| `treeState` | `gitTreeState()` (real) or fake (dry-run) | small |
| `now` | wall clock | trivial |
| `prompts` | per-node `{authorTest, implement}` briefs — from the node's guidance/contract | **prompt assembly** |
| `runId` | generated per invocation | trivial |

The genuinely new pieces are bolded: a **test-command registry**, a **model factory + API-key
plumbing [OWNER]**, **per-node write-scope config**, and **prompt assembly** from the node spec.

---

## 3. Phased plan (dependency-ordered)

### Phase 0 — Decisions **[OWNER]** (gate D/E/F; A/B/C can proceed without them)
- **API-key handling** — where `ANTHROPIC_API_KEY` comes from for `--live`; never logged.
- **Per-node budget ceiling** — ADR-0005's open `per-node budget` (unit + default). Needed before any
  unbounded live loop. The loop must terminate on green **or** budget-exhausted (typed terminal event).
- **Work-hierarchy tables now, or defer?** — adding `events.work_event` + `events.verdict` is plain
  additive pg (DBOS-deferred-compatible). Recommend **yes, now** — it's the clean home for verdicts that
  today mis-land in `library_event`.
- **Workspace model** — build in-place in the worktree vs a temp dir per run. (In-place is simplest and
  matches `fail-closed-on-dirty-tree`; temp dir is safer for parallel nodes — tie to ADR-0009 claims, deferred.)
- **`mapped` vs `healthy` for already-built library** — see §5.

### Phase A — Work-hierarchy persistence *(buildable now, no [OWNER] gate; additive + reversible)*
- DDL (additive, idempotent — same style as existing `schema.sql`):
  ```sql
  -- Append-only work-hierarchy lifecycle + proof events.
  CREATE TABLE IF NOT EXISTS events.work_event (
    seq BIGSERIAL PRIMARY KEY, unit_id TEXT NOT NULL, tier TEXT NOT NULL,
    type TEXT NOT NULL,            -- proposed|building|verdict|retired|...
    doc JSONB, actor TEXT NOT NULL, at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  -- Signed proof rows (the gate's output; stops verdicts co-mingling with library_event).
  CREATE TABLE IF NOT EXISTS events.verdict (
    seq BIGSERIAL PRIMARY KEY, unit_id TEXT NOT NULL, run_id TEXT NOT NULL,
    proof_mode TEXT NOT NULL, outcome TEXT NOT NULL,  -- pass|fail
    commit_sha TEXT NOT NULL, signer TEXT NOT NULL, doc JSONB NOT NULL,
    at TIMESTAMPTZ NOT NULL DEFAULT now()
  );
  ```
- **Node-rollup projection** — a pure function (`core`) computing a unit's `status` from its
  `work_event` + `verdict` stream (ADR-0006/0020: `healthy` only with a pass verdict at HEAD;
  `unhealthy` computed; never written). Mirror the existing `storeParitySuite()` discipline so it runs
  against `InMemoryStore` and pg identically (this is the V1 story-4↔5 trait-parity lesson).
- Tests: rollup truth table + parity. All offline.

### Phase B — Build-orchestration glue *(the resolver; buildable now in dry-run)*
- `resolveProveSpec(node, opts) → ProveSpec` filling the §2 table.
- **Test-command registry** — node id → shell command (e.g. `node --test <file>` /
  `pnpm --filter <pkg> test`). Start explicit (a small map keyed by node id), not magic discovery.
- **Per-node write-scope** — glob config per node (test paths vs src paths).
- **Prompt assembly** — `{authorTest, implement}` from the node's outcome + guidance + contract.
- **Model factory** — `ScriptedModel` (dry-run/tests) | `AnthropicModel` (live).
- Failure handling v1: surface `failedAt` + reason; no auto-retry.

### Phase C — CLI entrypoint *(buildable now in dry-run)*
- Wire `storytree node build <id>` in `packages/cli/src/main.ts`; refuse writes on a dirty tree and
  without a resolved signer (`fail-closed-on-dirty-tree`). `--dry-run` uses the scripted model +
  `InMemoryStore` and spends nothing.

### Phase D — Live-API smoke **[OWNER go: spends money]**
- First real `AnthropicModel` run through the gate on a **trivial throwaway node** (one contract, e.g.
  an `add(a,b)` function) under a hard budget. Proves the live loop end-to-end before pointing it at
  anything real. Expect to shake out SDK/prompt/tool-loop issues here.

### Phase E — Dependency chaining (a whole story) **[OWNER: budget]**
- Topo-order from `depends_on`: prove contracts → capability (integration) → story (UAT). This is the
  scheduler/decomposition loop (`open-questions.md` §4) in its simplest linear form. Enforce the
  per-node budget (Phase 0).

### Phase F — Drive the library node for real **[OWNER: budget + promotion]**
- Pick the leaf-most library capability and drive it through the gate; promote via the studio outer
  loop (approval). See §5 for the honest-status nuance.

---

## 4. What is confidently buildable **without** owner input (the overnight-safe subset)

**Phases A + B + C in dry-run/offline mode.** End state: a runnable

```
storytree node build <id> --dry-run
```

that loads a **real** node spec (from the `stories/library/` tree being authored in this same session),
resolves it into a `ProveSpec`, and drives `proveUnit()` end-to-end with a `ScriptedModel` against an
`InMemoryStore` (or the new pg work tables) — asserting the gate walks `AUTHOR_TEST→…→GATE` and a
verdict is computed by the rollup. **Zero API cost, zero owner decisions, fully reversible, all behind
tests.** This de-risks the single biggest unknown (is the gate callable from a real entrypoint against a
real node spec?) and leaves *only* the live-spend + budget + promotion calls to the owner.

> **Not started tonight, on purpose.** Phase A commits a schema shape and Phase B/C add a command
> surface — both are load-bearing enough that I'm surfacing the sketch for a quick owner nod rather than
> guessing, consistent with how the story seed surfaces modeling calls. The dry-run subset is *ready to
> build on approval*; say go and it's mechanical. (It also wants the `stories/library/` node specs,
> which the parallel authoring workflow is producing now — so this is correctly sequenced after it.)

---

## 5. The honest-status nuance (`mapped` vs `healthy`)

The library already has **real passing tests**, but storytree's own prove-it-gate never drove them.
Per the glossary that is **`mapped`** (brownfield, observationally verified) — *not* `healthy`
(`healthy` requires a storytree-driven red→green + signed verdict). So:

- The library node can be marked **`mapped` immediately** (its existing suite is the observation).
- To earn **`healthy`**, the gate must drive a *fresh* red→green — which means authoring a failing test
  first, then re-implementing to green under the gate. For already-green code that's slightly artificial;
  the honest first `healthy` may instead come from the **next** capability we build net-new (e.g. the
  Phase A rollup, or a new library behaviour), where red→green is genuine.

**[OWNER] call:** do we (a) mark the library `mapped` and chase first-`healthy` on net-new work, or
(b) drive a synthetic red→green over an existing library behaviour to exercise the gate on real code?
Recommendation: **(a)** — `mapped` is the honest label, and Phase A's rollup is a natural genuine-red→green first `healthy`.

---

## 6. Risks
- **Schema commitment** (Phase A) — mitigated: additive, flagged, DBOS-deferred-compatible, parity-tested.
- **`proveUnit` is single-unit** — chaining (Phase E) is net-new control flow; keep it a thin topo-loop
  over the proven single-unit driver, not a rewrite.
- **Live loop unproven** (Phase D) — budget-bounded throwaway first; treat first-run failures as expected.
- **Verdict co-mingling today** — Phase A's `events.verdict` table fixes the current mis-landing; until
  then `--dry-run` uses `InMemoryStore` so nothing pollutes the live library.

## 7. Suggested first sprint (on owner approval)
1. **Phase A** — `events.work_event` + `events.verdict` + the rollup projection + parity tests.
2. **Phase B/C dry-run** — `storytree node build <id> --dry-run` driving a real `stories/library/`
   node spec through `proveUnit()` with a `ScriptedModel`, asserting the walk + computed verdict.

Output: a runnable, offline, no-cost proof that the drive-machinery works against a real node — leaving
only the live-API + budget + promotion decisions to you.

---

## 8. Open decisions for the owner (consolidated)
1. API-key source for `--live` (Phase 0).
2. Per-node budget unit + default ceiling (ADR-0005 open).
3. Add `events.work_event` + `events.verdict` now? (recommend yes — additive).
4. Workspace model: in-place vs temp-dir-per-run (ties to deferred ADR-0009 claims).
5. `mapped`-now vs synthetic-`healthy` for the existing library (§5; recommend `mapped`).
6. Green-light to build the **dry-run subset** (Phases A+B+C, offline, no cost) ahead of the live calls.
