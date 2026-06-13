# Session-friction audit — measure before wiring guidance

**Status:** findings only (single-pass; no code changed). **Date:** 2026-06-14.
**Question being answered:** storytree's library holds ~101 guidance artifacts (22 principles, 9
guardrails, 11 patterns, 3 processes) plus 8 `agent`-kind role definitions, and **none of them are
injected into any working session** — the live SDK leaf
([sdk-author.ts](packages/agent/src/sdk-author.ts) `leafSystemPrompt`) runs a fixed generic prompt,
SessionStart hooks only do remote-setup + ambient-presence, and `storytree agents <name>` is
"(coming soon)". Correctness is carried entirely by guardrails **compiled into the spine** (the
prove-it gate, the `PreToolUse` write-scope hook, dirty-tree fail-closed). The owner's observation:
building has *felt* smooth without any guidance wired. Before investing in a guidance / agent-reporting
loop, this audit asks: **is there recurring, guidance-relievable friction that would justify it?**

This is the `session-friction-audit` half of the 2026-06-13 owner fork (the other half is
`guidance-violation-audit`). See the `library-guidance-unwired` memory for the framing.

## Sources mined

| # | Source | Reachable? | What it gave |
|---|--------|-----------|--------------|
| 1 | Memory TRAP corpus (`~/.claude/projects/C--code-storytree/memory/`) | ✅ full | ~25 distinct TRAP/pitfall/recovery notes across 30+ files |
| 2 | Git recovery patterns (`git log -400 main`, `branch -r`) | ✅ full | 17 `fix()` commits, 5 rebase-reconciles, 3 ADR-numbering collisions, 5 renames, real-build retries |
| 3 | `events.work_event` vs `events.verdict` (live Cloud SQL) | ✅ **DB was RUNNABLE** | 12 build runs, 8 verdicts (all PASS), **4 orphaned runs**, retry counts |
| 4 | Session transcripts (`search_session_transcripts` MCP) | ❌ **unavailable** | requires interactive approval; blocked in this unsupervised run — skipped, not mined |

Source 3 is normally optional, but the instance happened to be `RUNNABLE` (`ALWAYS`), so the live
events tables were queried read-only. Source 4 could not be run — the transcript-search tool needs
user approval and returned "unavailable in unsupervised mode" for every query. Its absence does not
change the conclusion; sources 1–3 are strongly concordant.

---

## Friction categories, ranked by frequency × cost

Ranked highest combined frequency × per-incident cost first. "Relievable by library guidance?" is the
load-bearing column — it asks specifically whether injecting the library's *abstract* principles /
patterns / guardrails into a session prompt would have prevented the incident.

### 1. Windows / PowerShell / platform tooling — HIGH freq · MED cost · **NOT principle-relievable**

The single most recurrent class. These are platform facts, not engineering-judgement gaps.

- **PS 5.1 UTF-8 mojibake on story files** — `Get-Content -Raw` + `Set-Content` reads/writes ANSI and
  corrupts UTF-8 story/frontmatter files; fix = bash/sed or `[IO.File]` UTF-8 APIs
  (`studio-story-world` memory, hit while sed-ing `status: unhealthy` for withered-flora testing).
- **`gh pr create --body` quoting** — PS 5.1 mangles embedded double-quotes / here-string bodies in
  native-exe args; fix = write a temp file and pass `--body-file`/`-F`
  (`merge-ceremony-commit-and-pr` "hit 2026-06-13"; `studio-testing-formalised` trap 2).
- **PS 5.1 has no `&&`** — the ADR-0042 runbook's bash `cd infra && …` "bit the owner"
  (`studio-cd-proposal` trap 3).
- **Windows Terminal popup spam** — the OS re-hosted hidden console children, spamming the owner with
  terminal windows during agent work; fixed at the OS level via the `HKCU:\Console\%%Startup` conhost
  delegation (`windows-terminal-popup-fix`). **Permanently mitigated.**
- **Windows `gcloud` `.cmd` spawn** — Node refuses `.cmd` shims without a shell (CVE-2024-27980),
  shell+args-array is deprecated (DEP0190), and the detached server pops a visible window per spawn
  without `windowsHide:true`; fixed in the `gcloudInvocation()` contract (commit `79b2c24`,
  `studio-durability` / `studio-testing-formalised`). **Mitigated in code.**
- **vite binds IPv6 `::1` for `localhost`** — Playwright/preview readiness polls on `127.0.0.1` hang
  forever; fix = `--host 127.0.0.1 --strictPort` (`studio-testing-formalised` trap 1).
- **Cross-platform path test failure** — `fix(agent): platform-agnostic workspace path in sdk-author
  tests` (commit `afa3d0d`).

Git fingerprint: 2 of 17 `fix()` commits are directly Windows-tooling (`79b2c24`, `afa3d0d`); the
others above never reached a `fix()` commit because memory caught them first.

**Verdict:** would a "Windows/PowerShell gotchas" *cheat-sheet* injected at SessionStart help? **Yes —
but that is a thin reference card, not the 22 abstract principles.** None of these is a
deep-modules / signal-and-noise / reward-hacking judgement call. The corpus that actually relieves
this friction today is the *memory files*, not the library tier.

### 2. DB / Cloud SQL / credential & worktree bootstrap — MED-HIGH freq · HIGH cost · **NOT principle-relievable**

Highest per-incident cost (a stale token cost a whole overnight build). All infra/credential facts.

- **SDK-leaf OAuth auth trap** — the gate's `ClaudeAgentAuthor` leaf spawns its *own* `claude` child
  that authenticates via `CLAUDE_CODE_OAUTH_TOKEN` / `~/.claude/.credentials.json`, **not** the host
  session's auth. A dead refresh token → `401`, the gate failed *closed* (honest `building` mark, no
  verdict), "wasted night" (`sdk-leaf-auth-trap`, hit 2026-06-11). **Mitigated** by `secrets.json`
  auto-hydration — but a token expiry is still **owner-interactive** (`claude setup-token`), so the
  failure mode is live.
- **Keyless connector cold handshake ~6 s** — any fail-silent race under ~10 s loses *silently* (hook
  exits 0, nothing declares, no error anywhere); relieved by explicit timeout budgets
  (ACQUIRE 10 s / per-call 4 s / hook 20 s) (`notice-board-complete`, `presence-self-heal`).
- **DB idle-stops mid-session** — zero-connection idle-stop killed instances mid-work; relieved by
  lengthening the window 60 min → 8 h + an in-UI Start-DB banner + studio self-heal
  (`gcp-hosting-cloud-sql`, `studio-durability`, `cite-graduation-vision` "Trap repeat").
- **Fresh worktree has no `node_modules`** — SessionStart presence hook `pnpm exec tsx …` fails
  silently, the session never reaches the board (`presence-self-heal`, PR #84). **I hit this exact
  trap during this audit:** the worktree had no `node_modules`, so the events query could not run from
  it — I had to run it from the main checkout `C:\code\storytree`. Presence is now self-healed, but
  the underlying "fresh worktree can't run ad-hoc tooling" is **live**.
- **Misleading IAM error** — an SA running `gcloud builds submit` needs `serviceusage.services.use`
  or it's refused with a *"forbidden from accessing the bucket"* message that is not a bucket problem
  (`fix(infra)` `c96a77f`, `studio-cd-proposal` trap 1); plus `fix(infra)` `4b88bd9` (actAs grant).

**Live events evidence (read-only query, 2026-06-14):** of **12 `building` work-events**, only **8**
produced a verdict. The **4 orphaned `building` runs** — `declare-presence/real-mq86npz7`,
`presence-store/real-mq8ms0yb`, `tree-view/real-mq8omky0`, `ambient-integration/real-mqayn2y7` — are
abandoned/halted builds (the "dangling `building`, no verdict" signature the auth trap predicts).
**7 distinct units** were REAL-built; **4 of them needed ≥2 build runs** to land a verdict, and
`declare-presence` took **3** (it even carries two PASS verdicts — the auth-retry saga). **There are
ZERO `fail` verdicts in the table** — every recorded outcome is PASS. Failures never surface as red
verdicts; they surface as *abandoned runs* because the gate fails closed. So the build-side friction
is real (≈33 % of runs halted) but its causes are **auth/turn-limit/credential**, not a missing
principle.

Git fingerprint: 3 of 17 `fix()` are DB/infra (`c96a77f`, `afc59c0`, `4b88bd9`); `9ad8a85` is the
worktree-presence self-heal.

**Verdict:** zero of these are principle-shaped. They are credential rotation, network timing, and
worktree bootstrap. A guidance prompt cannot mint an OAuth token.

### 3. Gate / typecheck / REAL-build mechanics — MED freq · MED cost · **adjacent, but already solved by a COMPILED guardrail**

The category closest to "would guidance help" — and the one where the answer is most instructive.

- **tsx type-strip hole** — proof commands and the regression suite run under `tsx` (types stripped),
  so the leaf authored runtime-green but `exactOptionalPropertyTypes`-illegal code **three times**:
  `8d08a5f` (declare-presence), `ccc4bac` (presence-store), `71fc702` (verdict-glyphs). Solved
  *structurally* by the **REAL-build typecheck wall** (`0426cd2`, `tsc --noEmit` compiled into the
  promotion path) + the input-vs-output-type spec lesson (`real-build-typecheck-wall`).
- **The wall FIRED** on verdict-glyphs — the gate signed a PASS but parked the branch; recovery is a
  documented ceremony (git-switch to the parked `claude/real/*` branch, type-only fix, non-squash
  merge). Recurring enough to have a named recovery path.
- **Registering a new REAL node breaks 3 pinned id-list tests** — a deliberate mechanical chore on
  every new node (`real-build-typecheck-wall`).

**Verdict:** the `exactOptionalPropertyTypes` trio is the *only* friction in the whole corpus that a
leaf-prompt hint could plausibly have reduced. And the project's answer was better than a prompt: it
**compiled the check into the spine** (deterministic, can't be ignored), exactly the pattern the
owner already trusts. A prompt that says "watch out for exactOptionalPropertyTypes" is strictly weaker
than a `tsc --noEmit` wall that fails closed. This category *argues against* injecting guidance, not
for it.

### 4. CI / merge / ADR-numbering / parallel-session contention — MED freq · LOW-MED cost · **convention, already in CLAUDE.md/memory**

- **ADR-numbering collisions** — 3 occurrences: `0022→0023` (0022 taken by the CI gate, `08a5020`),
  dup `0024→0025` (`c6ae88b`), and reconcile-with-PR-#18 (`10bb593`); plus the `0014`/`0027`-already-
  taken episodes in memory (`anti-pattern-lessons-merged`). Root cause = numbering is first-come
  across parallel branches with no allocator.
- **Rebase reconciles** — 5 `Merge origin/main into …` commits (`b1a2bd1`, `8379dd2`, `10bb593`,
  `79f9a0c`, `c1010ab`) = parallel-session contention against a fast-moving main.
- **`gh pr merge` pre-CI hole** — merges instantly with no required checks; the rule "never merge
  manually, let automerge-on-green land it" lives in `background-agent-lessons` rule 4 +
  `merge-ceremony-commit-and-pr`, and is now the CLAUDE.md cadence. The merge ceremony was even
  promoted to a `process` library artifact (`merge-ceremony` / `prove-and-promote-ceremony`,
  ADR-0034) — yet it is followed because **CLAUDE.md restates it**, not because the library is
  injected.

**Verdict:** convention friction, already captured where sessions actually read it (CLAUDE.md +
memory). The one mechanizable gap is an ADR-number allocator — a tool, not guidance.

### 5. Studio version-skew / detached-server staleness — LOW-MED freq · MED cost · **ops, self-diagnosing now**

- **"specs is not iterable"** after a schema-touching merge = a detached studio server running stale
  in-memory code, *not* a DB/cache problem; a browser hard-refresh does nothing
  (`studio-version-skew-trap`). **Mitigated**: PR #53 made the failure self-diagnose
  (`fix(studio)` `f02fbc7`), PR #82 added the `codeStamp` route-staleness banner.
- **raw-TS `.js` specifiers at vite build time** must be dynamically imported (`fix(studio)` `d611a5a`,
  `056ef4d`) — a recurring tsx-resolution trap class, now patterned.

Git fingerprint: 4 of 17 `fix()` are studio skew/tsx-resolution (`d611a5a`, `f02fbc7`, `9df64fb`,
`056ef4d`).

### 6. Background-agent orchestration — LOW freq · HIGH cost · **process discipline, in memory**

- `run_in_background` agents are unmonitorable from the session → live work was destroyed on the
  assumption it was dead (`background-agent-lessons`, 2026-06-10). Now a hard rule in memory:
  foreground parallel + worktree isolation only; never destroy state you can't prove is dead.

### 7. Corpus self-consistency hygiene — LOW freq · LOW cost · **the library maintaining itself**

- `fix(library)` `36b5237` (repoint a dangling ref), `fix(knowledge)` `856edad` (reconcile
  pi→owned-loop drift), `c4c12a2` (re-derive a dependency graph from real imports). Ironically this is
  the *only* friction the library tier is itself about — and it is drift in the corpus, not in the
  code the corpus is meant to govern.

---

## Mitigated (TRAP → permanent fix) vs still-live

The defining pattern: **almost every high-cost trap was converted into a compiled guardrail, a config
change, or a code contract — the strongest mitigations, none of which a prompt can match.**

| Friction | Mitigation shipped | Mechanism | Still live? |
|----------|-------------------|-----------|-------------|
| Windows Terminal popups | conhost registry delegation | OS config | **No** (permanent) |
| gcloud `.cmd` spawn / window pop | `gcloudInvocation()` contract + `windowsHide` | code + tests | **No** |
| tsx type-strip illegal code (×3) | REAL-build typecheck wall (`tsc --noEmit`) | **compiled into spine** | **No** |
| DB idle-stop mid-session | 60 min → 8 h window + Start-DB banner + self-heal | infra + UI | **No** |
| SDK-leaf stale OAuth | `secrets.json` auto-hydration | code | **Partly** (token expiry is owner-interactive) |
| Studio "specs is not iterable" | self-diagnosing banner + `codeStamp` | code | **No** |
| Lost presence on fresh worktree | statusline declare-if-absent | code | **No** (for presence) |
| pg pool idle-client crash | `pool.on('error')` | code | **No** |
| Connector cold-handshake races | explicit timeout budgets | code | **No** |
| **PS 5.1 mojibake / quoting / `&&`** | memory note only | tacit | **Yes** |
| **vite `::1` bind** | memory note only | tacit | **Yes** |
| **ADR-numbering collisions** | memory note only | tacit | **Yes** (no allocator) |
| **Fresh worktree lacks deps for ad-hoc tooling** | self-heal covers presence only | partial | **Yes** (hit during this audit) |
| **REAL-node registration breaks 3 pinned tests** | memory note only | tacit | **Yes** (mechanical) |
| **REAL-build retries (auth/turn limits)** | fail-closed + retry | n/a | **Yes** (≈33 % of runs halt) |

The "still-live" rows are all (a) platform/tooling facts, (b) parallel-contention mechanics, or
(c) credential/turn-limit ops. **Not one is an abstract engineering principle.**

---

## The cross-cut: is the friction guidance-relievable?

Mapping every category against "would the library's abstract principles/patterns/guardrails, injected
into a session prompt, have prevented this?":

- **Windows/PS tooling (cat 1):** No — platform facts. A *thin cheat-sheet* would help; the 22
  principles would not.
- **DB/auth/worktree (cat 2):** No — credential/network/bootstrap ops.
- **Gate/typecheck (cat 3):** Marginally — and the project already solved it *better* with a compiled
  wall. Argues against prompt-injection.
- **CI/merge/numbering (cat 4):** Already covered by CLAUDE.md/memory (which sessions read). The gap is
  a tool (number allocator), not guidance.
- **Studio skew (cat 5):** No — ops; now self-diagnosing.
- **Background agents (cat 6):** Process rule, already in memory.
- **Corpus hygiene (cat 7):** This *is* the library tier drifting; injecting it wouldn't prevent its
  own drift.

**There is essentially zero evidence in any of the three mined sources that a build went wrong because
a session didn't know a library principle** (deep-modules, signal-and-noise, reward-hacking,
cold-rebuild, …). The owner's intuition holds: correctness rode the compiled guardrails, and the
*incidental* knowledge that prevented repeat friction rode the **memory files** — which are read every
session — not the unwired library tier.

A second, sharper observation: **the friction-relief mechanism that demonstrably works here is
"write the trap down, read it next time."** Every recurring trap was caught on its second encounter
*because it had been written to a memory file*. That is a **write-then-read loop** — exactly the shape
of the owner's fork's *write* path ("agents report friction via the library"), and the opposite of the
*read* path (inject 101 pre-authored principles a session never asked for). The catch: memory files
are per-machine, per-owner, and invisible to fresh worktrees and remote pods — so the knowledge that
works is also the knowledge most at risk of not reaching the session that needs it.

---

## Bottom-line recommendation

**Do not wire a read/guidance-injection path for the abstract principle corpus. The evidence does not
support it.** The friction that recurs is environmental (Windows/PowerShell, Cloud SQL/auth,
fresh-worktree bootstrap) and gate-mechanical — none of it is a deficit the 22 principles / 11
patterns would relieve, and the one type-discipline class that *might* have been was already solved
more strongly by a compiled guardrail. The smooth-building status quo is largely validated: keep
carrying correctness in the spine, not in a prompt.

**Where the evidence *does* point — a narrow, high-value slice that doubles as the write-path seed:**

1. **Promote the recurring *environmental* traps out of personal memory into a durable, session-injected
   cheat-sheet.** The highest-value still-live friction (PS 5.1 mojibake/quoting/`&&`, vite `::1`,
   fresh-worktree deps, ADR-numbering, REAL-node test-pinning) currently lives only in
   `~/.claude` memory — invisible to fresh worktrees and remote pods, the exact sessions most likely
   to trip. A short repo-resident "platform & gate gotchas" reference (a `process`/reference artifact,
   or even a CLAUDE.md appendix) injected at SessionStart is a small, evidence-backed intervention.
   This is a *thin slice* of guidance-wiring — a checklist of platform facts, **not** the principle
   corpus.

2. **Prefer the WRITE path over the READ path** (matches the owner's fork). The mechanism that
   provably reduces friction is capture-and-recall, and the memory files are the de-facto proof. A
   path where a session that hits a trap *records it into the shared library* (deduped against the
   existing corpus — the "librarian that dedupes against the ADR/OQ corpus" idea, not a
   convince-the-AI gate) would (a) make the trap visible to every future session including remote
   pods, and (b) grow the corpus from real friction instead of speculation. The audit shows the raw
   material exists and is valuable; it's just trapped in the wrong store.

3. **The remaining mechanizable gaps want tools, not prose:** an ADR-number allocator (kills cat 4's
   collisions) and a fresh-worktree `node_modules` warm-up in the SessionStart hook (kills the
   ad-hoc-tooling half of cat 2). Both are deterministic fixes in the spirit of the existing compiled
   guardrails.

**One-line answer to the owner's question:** *We got this far without the principle tier because the
principle tier was never what was load-bearing — the spine's compiled guardrails and the read-every-time
memory notes were. So don't wire the principles; if you wire anything, wire a capture-and-dedupe write
path and a thin platform cheat-sheet, because the still-live friction is tacit environmental knowledge
stuck in a per-machine store, not missing engineering judgement.*

---

### Method notes / reproducibility

- Git: `git log --oneline -400 main` then grep for `fix(`, `rename|renumber|rederive|reconcile|revert`,
  `exactOptional|typecheck`, `Merge (origin|remote-tracking)`, and `claude/real/*` branches.
- Events (read-only, instance was `RUNNABLE`): a throwaway `tsx` script over
  `events.work_event` / `events.verdict` / `events.attestation` via `createPool()` with
  `STORYTREE_DB_USER=hua.mick@gmail.com`; counted build-vs-verdict runs and per-unit retries. No
  writes; the scratch script was deleted (tree left clean). Note: the worktree had no `node_modules`,
  so the query ran from the main checkout — itself an instance of cat-2 friction.
- Memory: every `*.md` under `~/.claude/projects/C--code-storytree/memory/` read for
  `TRAP`/`trap`/`gotcha`/`pitfall`/recovery notes; grouped by theme.
- Source 4 (session transcripts) was not mined: `search_session_transcripts` is unavailable in
  unsupervised mode.
