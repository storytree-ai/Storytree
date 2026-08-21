---
status: accepted
decided: 2026-07-05
---
# ADR-0162: Manage session-onboarding cost: optimize the cost centers, then own it with monitoring

## Status

accepted (2026-07-05) — decided/directed by the owner in conversation on 2026-07-05. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

This ADR is the **living charter** for the onboarding-cost arc: the roadmap in `## Roadmap` below is
the arc's shared state, updated as each increment lands (see `## How this arc runs`).

## Context

**Onboarding** — the orientation a session does before its first real-work action (booting the
worktree, re-probing the environment, pulling knowledge, reading source) — has never been a managed
concern, and it has grown. A baseline sampled 2026-07-05 from the 120 most-recent session transcripts
(92 with real onboarding; per-tool latency = tool_result − tool_use timestamp) found:

- The first real-work action lands around **tool-call #25** (p90 #41); roughly **35 % of a session's
  tool-calls** happen before real work begins (up to 67 % on short sessions).
- **Active onboarding** (summed tool latency, idle/thinking excluded) is **~107 s p50 (~1.8 min)**,
  **~478 s p90 (~8 min)**, max ~24 min.

The cost is not evenly spread. Three cost centers dominate — each verified against the code, not just
inferred from traces:

1. **ENV-PROBE — the biggest time sink** (87 % of sessions, 7.8 calls/session, **54 s p50 / 505 s p90**
   of phase time; one probe hit 466 s). The fat tail is reflexive external probes: `claude -p ok`
   (SDK-leaf auth, ~32 s, sometimes run twice), `db:status`/`db:up`/`gcloud sql` (~30 s cold),
   `git fetch origin main`. **None of this is actually prescribed as an onboarding step** — the
   guidance is all need-gated ("before `--live/--real`", "when you need it", "before a PR"); agents
   over-read it as do-first. Builds already auto-start the DB via the `ensureLiveDb` preflight, so a
   manual `db:up` before a build is a redundant no-op, and the double `claude -p` is a known
   bare-vs-hydrated-credentials false alarm.
2. **CLI startup tax** — every `pnpm storytree …` costs ~3.15 s warm / ~8.7 s cold (measured 13.2 s
   cold live on a fresh worktree), paid by every corpus lookup, `db:status`, and `noticeboard declare`.
   Root cause is **not** tsx transpile (cached at ~0.38 s): it is two nested pnpm process layers
   (~+1.2 s) plus `packages/cli/src/main.ts` eagerly importing the full node-heavy store graph
   (`@storytree/library/store` → `pg` + the Cloud SQL connector, plus the orchestrator / notice-board /
   drive / agent barrels) unconditionally — even for offline read commands that never touch Postgres.
3. **BOOT fresh-worktree install** — a mandatory `pnpm install` of **+15–35 s** before the CLI, tsx, or
   the gate will run, on the **~1 in 5** sessions that start in a brand-new worktree.

A fourth phase, **SOURCE-ORIENT**, is present in 100 % of sessions (~11 reads/session) but is
**explicitly not a Phase-1 target**: the "re-read the same engine files" pain is an unmeasured
inference (the friction-audit ledger never recorded it), a partial engine map already exists (the
CLAUDE.md package tour), and for a session about to *edit* an organism, re-reading source to see
current signatures is *correct* behaviour, not waste.

**Forces.** The pull-based / choose-your-own-adventure model (ADR-0023) is correct for *knowledge* but
compounds with the Windows pnpm+tsx cold-start. The "no build step — packages export raw TS consumed
via tsx" convention (ADR-0023 / ADR-0115) constrains the CLI fix. And critically: **no process
currently owns onboarding cost**, so it drifts upward silently — which is why the owner directed both
an optimization pass *and* a long-term owner-process, not a one-off cleanup.

**Why not a "gate".** In storytree a gate *refuses* work, fail-closed, before it happens. An
onboarding-time limit is different in kind: by the time you know a session onboarded slowly, it is
already running and its work is valuable — you cannot refuse it. So the long-term control is an
**SLA/budget with a post-session breach trigger** that *flags*, never blocks.

## Decision

Manage onboarding cost as a first-class, owned concern, in two phases — **optimize first, then monitor**
— so the monitor guards an improved baseline rather than ratifying the current one.

### Phase 1 — Optimize the cost centers (cheapest-and-safest first, convention-preserving)

1. **ENV — grant offline sessions explicit skip-license.** Tighten the guidance (CLAUDE.md +
   affected agents/memory) so offline work (analysis, docs, pure-TS, `pnpm -r test`) is told it needs
   no DB/SDK/`fetch` probe; drop the "bring the DB up first" line as a *precondition* (builds
   self-start the DB); state "one *hydrated* auth probe or none". Effort XS. Removes the ENV fat tail
   for offline/analysis sessions. Safe — the probing was never prescribed.
2. **CLI — kill the startup tax.** A thin launcher that calls `node --import tsx …/main.ts` directly
   (drops the two nested pnpm layers) + lazy-load the Postgres store graph behind `--pg` via dynamic
   import + `NODE_COMPILE_CACHE`. Effort S. Targets warm calls near ~1 s. **Preserves the no-build-step
   convention** — still tsx, no build artifact. Explicitly rejected: an esbuild/tsc `dist` bin (breaks
   ADR-0023) and, for now, a resident CLI daemon (L effort + stale-code-after-merge risk).
3. **BOOT — pre-provision worktrees.** Run `pnpm install` at worktree creation so a fresh worktree is
   ready before first use. Effort S–M. Removes the +15–35 s blocker for ~20 % of sessions.
4. **SOURCE — engine map: deferred, validate-first.** *Not* a Phase-1 commitment. Only pursue if
   ADR-0024's blind-reconstruction test shows the re-read is real waste; if so, the ceiling is a small
   generated, path-existence-gated extension of the existing package tour — never role/data-flow prose
   that rots (cf. ADR-0135).

### Phase 2 — Land the maintenance & monitoring system (the owner-process)

After Phase 1, build the system that **owns keeping onboarding cost from exploding again** — the clear
process the owner asked for. A **per-agent-type onboarding budget (SLA)**: measure active onboarding
time per session (the prefix-sum this baseline defines), tagged by agent-type, compared against that
type's budget; on breach, **emit a signal** (never halt the session) that routes remediation via the
signal → Library graduation loop (ADR-0032) at the cost centers above. Analysis agents get a low budget
(they are almost all SOURCE); build/verify agents a higher one (ENV + SOURCE). This is the terminal
deliverable of the arc: without it, Phase-1 gains regress silently and the guidance nudges (fix #1) have
no enforcement backstop.

**Sequencing is load-bearing:** Phase 1 before Phase 2. The monitor is a *regression guard on the fixed
baseline*, not a discovery tool — the baseline already did the discovery.

## Consequences

**Good.**
- Onboarding cost becomes a *measured, owned* concern: a baseline, a ranked fix roadmap, and a durable
  guard against regression — a clear process owns it (the owner's explicit goal).
- The cheap, safe wins (ENV guidance, CLI launcher) land first and compound across every session.
- The no-build-step convention (ADR-0023) is preserved; the pull-based knowledge model is untouched —
  only environment/CLI/boot *mechanics* are optimized, not the knowledge architecture.

**Costs / risks.**
- Fix #1 is a behavioural *nudge*, not enforcement — it may not fully stick until the Phase-2 monitor
  exists (which is precisely why Phase 2 is in scope, not optional).
- Per-agent-type budgets need calibration data; the first budgets will be provisional and tuned against
  observed distributions.
- Over-optimizing could fight the pull-based model — mitigated by scope: knowledge stays just-in-time;
  the SOURCE engine-map is gated behind measurement to avoid shipping dead weight.
- The baseline numbers are directional (transcript timestamps are event-*emission* time, not
  completion) — the Phase-2 monitor is what turns "directional" into "measured".

## Roadmap

The arc's shared state. Each perpetual-chip session lands **one** increment, ticks it here, and records
the landing PR. `[ ]` = open · `[~]` = in progress · `[x]` = landed.

- [x] **0. Charter** — this ADR (ADR-0162), accepted 2026-07-05. _(PR: #603.)_
- [x] **1. ENV skip-license** (Phase 1, XS) — guidance edit granting offline sessions explicit
  skip-license; drop the redundant `db:up` precondition; "one hydrated auth probe or none". Landed a
  leading "Offline is the DEFAULT" bullet in CLAUDE.md's `## How to run`: offline work (analysis/docs/
  pure-TS/`pnpm -r test`) needs no DB/SDK/`git fetch` probe; a build self-starts the DB (`ensureLiveDb`)
  so a pre-`db:up` is a no-op — only a bare `--pg` CLI write needs it; "one hydrated auth probe or none"
  before an unattended `--live`/`--real` build; the load-bearing `SELECT 1` and `git fetch origin/main`
  probes preserved. _(PR: #609.)_
- [x] **2. CLI launcher + compile-cache** (Phase 1, S) — a single-process direct launcher
  (`packages/cli/launch.mjs`): register the tsx ESM loader in-process + Node 24 `enableCompileCache`
  (a gitignored `node_modules/.cache/storytree-v8`, the `NODE_COMPILE_CACHE` mechanism) + import
  `main.ts` directly, dropping the two nested pnpm layers. The root `storytree` script points here so
  `pnpm storytree` keeps working (now one pnpm-run layer, not two); a `launch.test.ts` proves argv
  passthrough + exit-code + no-pnpm-noise. **Measured (warm dev box):** a warm offline read fell from
  **~3.8 s → ~1.9 s direct** (`node packages/cli/launch.mjs …`) / ~2.6 s via `pnpm storytree`.
  **Measurement reframed the cost model:** the two pnpm layers were **~1.7 s** of the ~3.8 s; the eager
  pg-store import (Context §2's headline target) is only **~100 ms marginal warm** — the library/zod
  tsx-transpile graph, which every offline command needs regardless, dominates the residual ~1.9 s.
  So the launcher, not lazy-pg, was the real win; lazy-pg split to 2b. _(PR: #612.)_

  **CORRECTION (2026-08-21, `the-gate-costs-what-the-change-risks-arc` inc 4): that residual was NOT
  a floor, and calling it one hid a cost that GROWS.** This item originally read "…the residual
  ~1.9 s, which is the practical floor under the no-build-step convention (ADR-0023)"; the clause is
  removed because part of that residual is tsx's own ON-DISK TRANSFORM CACHE, which is unbounded.
  tsx writes one file per transform into a flat `os.tmpdir()` directory and never evicts, so the
  "floor" silently rises as the directory fills — on this box it reached **232,254 files / 4.18 GB**,
  at which point a warm `storytree <unknown-command>` cost **3703 ms of CPU** where the same call
  with the cache disabled cost **2078 ms**, and with a FRESH cache **1796 ms**. Disabling it
  (`scripts/tsx-cache-off.mjs`, preloaded ahead of every `--import tsx`) took the whole
  `pnpm -r --no-bail test` leg from 745 s / 621 s of wall to 444 s / 424 s, two interleaved runs per
  arm, the same 5,446 tests in each. A FRESH cache is faster still — 273-296 s on the same harness —
  so the ordering is healthy cache < no cache << rotted cache, and CI (whose runner is fresh per job)
  therefore opts back in.

  **RE-MEASURED 2026-08-21 (inc 7), AND THE ROTTED ROW DID NOT REPRODUCE — read the figures above as
  one day's readings, not as a standing property of a full cache directory.** Same protocol (median
  of 7 spawned `storytree <unknown-command>`, quiet box), run TWICE hours apart from two different
  worktrees, against the SAME 235k-file directory:

  | arm | first run | second run |
  |---|---|---|
  | cache OFF (today's default) | 1735 ms | 1802 ms |
  | cache ON, fresh directory | 1288 ms | 1344 ms |
  | cache ON, **the 235k-file directory** | **1192 ms** | **1361 ms** |

  So the "rotted" directory measured as fast as a fresh one and ~25% FASTER than no cache — the
  opposite of the 3703 ms above, reproduced twice. One confound is named rather than hidden: that
  directory had been listed minutes earlier, so its NTFS index was warm, and the second run does not
  fully clear that. What survives unchanged is the generalisable lesson — **a "practical floor" read
  off a cache is a floor only while that cache is healthy** — and it now cuts both ways: a MEASUREMENT
  of a cache is likewise only good while the conditions it was taken under hold. The disable stands
  (it is the state that cannot rot, and no evidence here says it is expensive enough to reverse on),
  but nobody should plan work off the 3703 ms figure, and the bounded-cache mechanism inc 7 was parked
  to build is NOT needed for a rot that cannot currently be observed.
- [ ] **2b. Lazy-pg — offline pg-free (deferred, cold-start-only)** — dynamic-`import()` the Postgres
  store graph so offline read commands never pull `pg` / the Cloud SQL connector / `google-auth-library`.
  Deferred because item 2's measurement showed it saves only **~100 ms warm** (warm is already at the
  no-build-step floor). The real prize is COLD starts (`google-auth-library` is heavy on cold disk) —
  pursue only if a cold-start measurement shows the gain. Non-trivial: both `@storytree/library/store`
  AND the wide `@storytree/drive` barrel statically pull the connector graph, so it needs a
  dispatcher + drive lazy-load refactor — isolate a red→green test before touching it (it flows through
  every command and the gate).
- [x] **3. BOOT worktree pre-provisioning** (Phase 1, S–M) — the harness owns worktree creation (no
  reachable `git worktree add` wrapper), so the closest hook is the first `SessionStart` in the
  worktree. Added `packages/cli/provision-worktree.mjs` — bare-node ESM (zero deps: it runs BEFORE
  node_modules exists), pnpm→corepack fallback, fail-safe in `--hook` mode (always exit 0, the
  `presence-hook.sh` contract, so a slow/failed install never breaks the session) — and wired it into
  `.claude/settings.json` SessionStart. A fresh worktree now `pnpm install`s once, up front and
  unattended, OFF the agent's onboarding tool-call path, removing the +15–35 s mid-onboarding blocker
  for the ~1-in-5 fresh-worktree sessions.
  **The install trigger is TWO conditions, not one** (corrected in place per ADR-0139 when the
  staleness fix landed; the original shipped only the first — `git log -p` has the prior wording):
  the worktree is **fresh** — no completed install, pnpm's `node_modules/.modules.yaml`
  marker absent — **or stale** (`lockfileAdvanced`): the tracked `pnpm-lock.yaml` differs from
  `node_modules/.pnpm/lock.yaml`, pnpm's byte copy of the lockfile the last completed install actually
  ran against. Presence was never currency, and the original conflated them: a worktree provisioned
  once and then reused stayed a no-op forever while `main` moved under it, so a landed workspace
  package or third-party dep left node_modules stale — surfacing mid-work as an opaque error naming
  the wrong culprit (`TS2307` on an untouched dep / `ERR_MODULE_NOT_FOUND` / `tsc is not recognized`),
  which is why the four friction items in `## References` all adjudicated `→ tool` against this file.
  So it is an **up-to-date** worktree — not merely a provisioned one — that is the near-zero no-op
  making this safe to run at every SessionStart; the reasons (`refreshed` / `refresh-failed`) and the
  failure heads-up now name WHICH condition fired. A `provision-worktree.test.ts` proves the contract
  with an injected installer (idempotent no-op / fresh→install-once / stale→refresh / failure→non-zero
  exit / `--hook` swallows failure); `provision-worktree.d.mts` types the surface for the TS test (per
  `scripts/studio.d.mts`).
  **Scope fence — SessionStart only.** The hook cannot see a mid-session `git merge origin/main` (which
  the CLAUDE.md CI-red guidance actively instructs), so that path still leaves node_modules stale with
  no signal until the next session: "re-install after a mid-session main merge before trusting a red
  gate" stands unchanged. What this closes is inheriting staleness from a PREVIOUS session.
  _(PR: #618; the `lockfileAdvanced` staleness correction landed separately — `git log -S lockfileAdvanced`.)_
- [x] **4. SOURCE engine-map — DECISION GATE** (validate-first) — **closed WON'T-DO** (2026-07-06). Ran
  ADR-0024's blind-reconstruction test (three tool-blind definers, neutral preamble, judged against the
  real engine + the existing CLAUDE.md package tour). Result: the SOURCE re-read is **not real waste**, so
  item 4's criterion ("pursue only if the re-read is proven waste") is unmet. The re-read is two things and
  a new engine-map artifact is justified by neither: **(1) the STRUCTURAL map** (module roster /
  responsibilities / seams / conceptual data-flow) is blind-reconstructible — the *raw* definer rebuilt the
  ~10-package shape from the topic alone (generic industry knowledge), the *preamble* definer rebuilt the
  near-exact real structure incl. real filenames/seam names from the neutral sketch (derivable from our
  framing); by §1's earns-its-place bar a fresh prose map **fails**, and this content already lives in the
  CLAUDE.md package tour (redundant twice over). **(2) The EDITABLE detail** (current signatures, exact
  schemas, the real call graph, code-enforced invariants like "halted is never a pass") is *not*
  reconstructible — but it is **code** (outside ADR-0024 §8's authored-prose scope), it rots fast under
  refactor (strict TS makes a stale signature *actively wrong*), and reading it before an edit is *correct*
  just-in-time behaviour, not waste. A generated doc holding it would be exactly the role/data-flow prose
  §Phase-1.4 forbids and the ADR-0135 stale-glossary / "false-green from a stale doc" trap. No minimal
  path-gated extension is warranted either: the package tour already supplies the "which files?"
  search-time index (it names `prove-it-gate.ts`, `sdk-author.ts`, `phase-machine.ts`, …). Agent-decidable
  per the criterion the owner fixed in this ADR — not an owner fork. _(PR: this one.)_
- [x] **5. Maintenance & monitoring system** (Phase 2) — the per-agent-type onboarding-budget SLA
  monitor, the arc's terminal deliverable. `storytree onboarding` (`packages/cli/src/onboarding*.ts`):
  a POST-SESSION, offline, store-free command that reads a Claude Code transcript or Codex rollout
  JSONL (ADR-0291; both adapters normalize into the same budget trace, and an unknown shape is
  refused rather than reported as a false zero), MEASURES active
  onboarding cost (the baseline's prefix-sum — summed per-tool latency up to the first real-work
  action, so idle/thinking is excluded by construction), tags each pre-work call to a cost center
  (ENV / CLI / BOOT / SOURCE / KNOWLEDGE), COMPARES the total to the agent-type's budget (`AGENT_BUDGETS`
  — analysis/read agents low, build/verify higher, the interactive orchestrator highest; provisional
  per §Consequences), and on breach EMITS an `onboarding-budget-breach` signal that names the dominant
  cost center and routes remediation via the ADR-0032 signal-loop (the report's `next:` points at this
  charter + the owning Phase-1 fix). It FLAGS, never HALTS (§Why-not-a-gate) — the envelope stays
  `ok:true`; nothing runs on a session's hot path, the no-build-step convention (ADR-0023) and the
  pull-based knowledge model are untouched. `storytree onboarding budgets` prints the SLA table.
  Red→green offline tests (`onboarding-budget.test.ts` / `onboarding.test.ts`) cover the classifier,
  the prefix-sum (incl. idle-exclusion), the budget compare, the breach-vs-within-budget signal, and
  the end-to-end `run` dispatch. **The arc is DELIVERED — no further increment.** _(PR: #625.)_

## How this arc runs

- A **self-perpetuating chip** drives it: each session re-orients (a sibling may be mid-increment),
  lands the next open Roadmap item, updates this ADR (tick the item + record the PR), then spawns the
  next chip. It **halts and raises an `OWNER:` chip** at any owner fork (e.g. the item-4 decision gate,
  or if a fix needs an operator-attested verdict), and **stops** when item 5 is landed.
- Increments route through the normal ceremonies: guidance edits via the library/curation path, code
  increments (CLI launcher, the monitor) via the inner loop / a provable unit. Never bypass the gate.

## References

- Baseline analysis + artifact (session onboarding phase model & timing), 2026-07-05 — the reference
  the Phase-2 monitor calibrates against.
- ADR-0023 (pull-based Library; no-build-step / tsx convention) · ADR-0115 (raw-TS-via-tsx stance).
- ADR-0110 (owner-directed design-time alignment = accepted).
- ADR-0030 (Claude Agent SDK runtime — the `claude -p` leaf auth).
- ADR-0063 (gcloud off the DB-control hot path — REST-only).
- ADR-0024 (blind-reconstruction test; §8 exempts code from the pull-based corpus) · ADR-0135 (retired
  `glossary.md` — the stale-prose lesson for any generated engine map).
- ADR-0032 (signal → Library graduation loop — the remediation path for breach signals).
- ADR-0220 (SessionStart worktree self-repair — runs BEFORE this provision hook, so the provisioner
  meets a real checkout).
- The four friction items that drove item 3's staleness correction, all adjudicated `→ tool` against
  `provision-worktree.mjs`: `friction-worktree-provision-noop-misses-lockfile-advance` ("detect
  lockfile-newer-than-node_modules and re-install") · `a-provisioned-worktree-goes-stale-as-main-gains-packages`
  (×2) · `worktree-predates-new-package-opaque-gate-red` · `friction-worktree-stale-deps-ts2307` (×3).
  Memory `post-merge-relink-gate-ts2307` is the occurrence log and holds the residual mid-session case.
