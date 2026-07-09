---
status: accepted
decided: 2026-07-08
amends: [137]
load_bearing: true
---
# ADR-0173: Give the in-app orchestrator a read-only CI/git inspection surface

## Status

accepted (2026-07-08) — decided/directed by the owner in conversation on 2026-07-08, after watching
the in-app orchestrator burn two turns producing a confident-but-wrong root-cause on a red PR because
it could not read the CI log or the git tree. Design-time alignment IS the ratification (ADR-0110);
no second end-of-flow ask. Amends ADR-0137 d.1 (the `tools: []` write-fence) by widening what the
chat may OBSERVE — not what it may write. Extends the CI-observation lineage of ADR-0152
(the landing surface, which added `poll_pr_checks`) and ADR-0163 Gap B2 (the read-only CI-watch).

> **Amended by [ADR-0175](0175-repurpose-don-t-delete-the-in-app-orchestrator-chat-infrastr.md)**
> — the read-only CI/git inspect surface (`view_ci_run` / `view_pr_checks` / `git_inspect`) is
> **re-aimed as the future `app-guide` help agent's advise-from-CI/git surface** ("your PR is red
> because …", "your checkout moved under the app"), not deleted: the in-app *interactive* orchestrator
> it was built for retires under ADR-0174, but the inspect surface is repurposed wholesale.

## Context

The desktop in-app session orchestrator is a headless SDK session with `tools: []` and a closed
`allowedTools` allowlist (ADR-0137 d.1, `packages/agent/src/headless-orchestrator.ts`). Its entire
surface is three MCP servers: `orientation` (read the tree/library/noticeboard/agents), `spawn`
(claim-gated `spawn_story_author`/`spawn_builder`/`spawn_glue_worker`), and `landing`
(`run_gate`/`open_landing_pr`/`poll_pr_checks`). It has no raw `Bash`/`git`/`gh`: writes happen only
inside spawned sub-sessions under their own fences. This fence is correct and stays.

The gap is **diagnosis, not actuation**. When a PR the orchestrator opened goes red, `poll_pr_checks`
tells it only the pass/fail rollup of the ONE PR it just opened — it cannot run `gh run view
--log-failed` to read WHY, `gh pr checks <n>` for an arbitrary PR, or `git status` / `git log` /
`git ls-tree` to inspect the branch. So when a `check:web-engine` failure landed on PR #650, the
orchestrator could see "verify FAILED" but not the cause. It theorised — wrongly — that `main` was
dirty and the branch was missing the routing work, and escalated three owner options (fresh branch /
sync-and-publish the web engine / draft-hold), one of which (`sync:web-engine` + a web publish) was
an outward-facing action that would have been actively harmful. The true cause was a **stale web
submodule pin**: a merge of `main` had resolved the `web` gitlink to the old `c850e06` (#648) while
the core `forest-world/routing.ts` already carried #649's changes — a one-line `git ls-tree web`
would have shown it. A terminal session found and fixed it in minutes.

The cost of the missing surface is not just wasted turns: a blind orchestrator escalates decisions it
should resolve, and its escalations carry *plausible-but-wrong* framing that pushes the owner toward
the wrong fix. Observability is a precondition for the honest, low-escalation loop ADR-0163 is
dogfooding toward.

## Decision

Add a fourth, **read-only, fail-closed** MCP surface to the in-app orchestrator — an `inspect`
surface — mirroring the existing `landing` surface pattern exactly (`poll_pr_checks` is the
template: a named observation tool that shells one command, returns text, and signs/writes nothing).
It exposes the CI/git *reads* the orchestrator needs to diagnose a red pipeline itself:

- `view_ci_run` — `gh run view <id> [--log-failed]` for an arbitrary run (the failing-job log).
- `view_pr_checks` — `gh pr checks <n>` / `gh pr view <n> --json ...` for an arbitrary PR, not only
  one the chat opened.
- `git_inspect` — the read-only git verbs a diagnosis needs: `git status --porcelain`, `git log`,
  `git ls-tree`, `git rev-parse`, `git show` (no mutating verbs).

Invariants (each load-bearing, none negotiable):

1. **Observation only — the write-fence (ADR-0137 d.1) is untouched.** These are named, scoped read
   verbs, NOT raw `Bash`. `tools: []` stays; no `Write`/`Edit`/mutating `git`/`gh` is added. The
   surface refuses any mutating argument fail-closed, the way `orientation` refuses write verbs.
2. **Fail-closed to conversation text.** Like `poll_pr_checks`, a handler never throws into the loop;
   a failed/again command returns a text result the model reads and reasons over.
3. **Composed the same way, gated the same way.** New tools live in
   `packages/agent/src/inspect-tool-surface.ts` (sibling of `landing-tool-surface.ts`); the real
   `gh`/`git` shelling lives in a `buildInspectDeps` in `packages/drive/` behind the same injected
   `ExecFn` seam CI already proves offline (`landing-deps.ts` `defaultExec`); the desktop composes it
   in `apps/desktop/electron/backend-entry.ts` alongside the landing block, and it mounts only when
   its deps are injected (fail-closed to absent, like every other surface).
4. **Read-only means read-only.** The surface never merges, pushes, force-pushes, syncs the web
   engine, or bumps a pin. Actuation stays in the spawn/landing surfaces and spawned sub-sessions,
   under their existing fences.

This ADR ratifies the DECISION and the shape. The build is the follow-on increment of the ADR-0163
dogfood arc (route it through the orchestrator, chip the gaps); each of the three tools has an
isolatable red→green test (given a scripted `ExecFn`, the tool returns the expected structured text
and refuses a mutating arg), so it routes cleanly through the prove-it-gate.

## Consequences

**Good.**
- The orchestrator can diagnose a red pipeline itself instead of theorising and escalating. The #650
  case becomes a `view_ci_run --log-failed` → `git_inspect ls-tree web` → "stale pin" chain the model
  can walk, then hand a *correct* narrow decision (or a scoped fix worker) to the owner.
- Escalations get more honest: when the orchestrator does escalate, it escalates on evidence it read,
  not on a guess — removing the "confident-but-wrong owner-nudge" failure mode.
- It unblocks ADR-0164's self-restart supervisor, which already depends on the chat knowing CI-merge
  state; arbitrary-run inspection is a strict superset of the `poll_pr_checks` it was leaning on.
- Zero relaxation of the write-fence: the security/scope story of ADR-0137 is preserved verbatim.

**Bad / watch.**
- More surface to keep fail-closed. Each read verb must refuse mutating arguments; a lazy
  passthrough that let `gh pr merge` or `git commit` slip through `view_ci_run` would breach the
  fence. The refusal must be tested, not assumed.
- `gh`/`git` shelling can be slow or rate-limited; the tools must time-box and return partial text
  rather than hang the turn (the turn cap, ADR-0130/0131, remains the runaway brake).
- Read access to arbitrary PRs/runs widens what the chat can see; this is desired, but the log text
  it surfaces should be treated as untrusted content, not instructions.

## References

- Amends ADR-0137 (the `tools: []` write-fence — widened for observation, not writes).
- ADR-0152 (the landing surface + `poll_pr_checks`, the read-only fail-closed template).
- ADR-0163 (the dogfood arc this is the next increment of) · ADR-0164 (self-restart, the downstream
  consumer of CI-state knowledge).
- ADR-0108 (chat-driven orchestration runtime) · ADR-0160 (`spawn_glue_worker`, the scoped actuator).
- Code: `packages/agent/src/headless-orchestrator.ts` (session assembly, `tools: []`) ·
  `packages/agent/src/landing-tool-surface.ts` (`poll_pr_checks` template) ·
  `packages/drive/src/landing-deps.ts` (`defaultExec` seam) ·
  `apps/desktop/electron/backend-entry.ts` (desktop deps composition).
- Live trigger: PR #650 (a `check:web-engine` red misdiagnosed as a dirty `main`; true cause a stale
  `web` submodule pin `c850e06`→`ae3fa12`).
