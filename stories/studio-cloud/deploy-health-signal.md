---
id: "deploy-health-signal"
tier: capability
story: studio-cloud
title: "A pure classifier turns the deploy-studio CD run list into an ok / red / unknown health signal, so a red post-merge deploy is loud at the gate tail"
outcome: "A pure, dependency-free classifier reads the newest-first deploy-studio CD run list and returns an ok / red / unknown health verdict — a red streak (the newest completed run did not succeed) carries the streak length, red-since time, newest red run URL and last green deploy, and formats a LOUD multi-line gate-tail WARN naming the stale-image consequence and the forensics pointer; a green run formats one quiet OK line (noting any in-flight deploy above it); an empty or all-in-flight page is honestly UNVERIFIED, never claimed healthy — and the classifier never throws on empty or odd input."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW, dependency-free, LEAN posture — mirrors
# stories/cli/packages-forward-refusal.md (SAME package, landed 2026-07-13) but NET-NEW instead of
# editsExisting: the leaf authors packages/cli/src/deploy-health.test.ts importing
# `{ classifyDeployHealth, formatDeployHealth }` from "./deploy-health.js" — a module that does NOT exist
# at HEAD, so the red is a genuine missing-symbol module-not-found — then writes the ONE new source file
# (green). The test imports ONLY node:test, node:assert/strict, and the relative module; deploy-health.ts
# imports NOTHING (pure TS) and must STAY import-free — so the proof runs OFFLINE in a bare worktree with
# NO lockfile install, and therefore NO `install`, NO typecheck wall, and NO `proofCommand` (single
# LITERAL sourceFile, sourceGlobs === [sourceFile], so the default `node --import tsx --test <testFile>`
# proof is legal — the honesty refine does not fire). The write scope stays within ONE concrete package
# (packages/cli, ADR-0087). The gh-shelling wrapper (check-deploy-health.ts) + the root package.json gate
# wiring are un-asserted GLUE (ADR-0158), landed by the session, deliberately OUT of this unit's proof
# scope — see "## Declared glue" below. studio-cloud declares the hosting edge to `cli` consumer-side
# (depends_on + artifact_edges += cli, ADR-0192 rule 5): deploy-health.ts is hosted in cli's building
# (packages/cli) with no code import backing it.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/deploy-health.test.ts"
    sourceFile: "packages/cli/src/deploy-health.ts"
    scope:
      testGlobs: ["packages/cli/src/deploy-health.test.ts"]
      sourceGlobs: ["packages/cli/src/deploy-health.ts"]
---

# A pure classifier turns the deploy-studio CD run list into an ok / red / unknown health signal

**Outcome —** A pure, dependency-free classifier reads the newest-first `deploy-studio` CD run list and
returns an **ok / red / unknown** health verdict — a **red** streak (the newest completed run did not
succeed) carries the streak length, red-since time, newest red run URL and last green deploy, and formats
a **LOUD multi-line gate-tail WARN** naming the stale-image consequence and the forensics pointer; a
**green** run formats one **quiet OK line** (noting any in-flight deploy above it); an empty or
all-in-flight page is honestly **UNVERIFIED**, never claimed healthy — and the classifier **never throws**
on empty or odd input.

The deciding ADR is [ADR-0194](../../docs/decisions/0194-a-red-hosted-studio-deploy-must-be-loud-the-check-deploy-hea.md)
(born accepted 2026-07-14, owner-directed): a red hosted-studio deploy must be **loud**. It records the
incident behind Library friction item `friction-deploy-studio-red-is-silent` — `deploy-studio.yml` (the
post-merge CD of the member-facing hosted studio, ADR-0042/0046/0061) **failed 11+ consecutive runs over
~2 days** (2026-07-11 → 2026-07-13, root cause `844efe60` node-pty/gyp in the Docker build) and **nobody
was signalled**. The deploy is deliberately post-merge and never a PR check ("a deploy failure never
blocks a merge" — the right call), so its conclusion had **no reader**: the hosted studio silently served a
2-day-stale image until the owner noticed by hand. ADR-0194's fix is a best-effort, WARN-only,
always-exit-0 `check:deploy-health` at the **tail of `pnpm gate`** — the one surface every session already
reads (`never-bypass-the-gate`) — in the established ADR-0055 `check:agents-sync` posture (WARN / OK / SKIP,
never blocks, offline gates unaffected, not wired into CI which runs pre-merge, the wrong side of the gap).

**This capability is the pure red→green core of that signal:** the classifier the wrapper hands its
`gh run list` output to. The gh-shelling wrapper and the gate wiring are declared glue (below), not this
unit's proof.

**Depends on —** nothing (no sibling capability). It watches the CD pipeline from the **repo side** — a
pure function over a run list — so it needs no `serve-mode`/`guest-scope`/store collaborator. (The
story-level `depends_on`/`artifact_edges` edge to `cli` is the ADR-0192 rule-5 HOSTING edge for
`deploy-health.ts` living in `packages/cli`, declared on `studio-cloud`'s own spec — a build-artifact
seam, not an in-story capability dependency.)

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. `packages/cli/src/deploy-health.ts`
> does NOT exist at HEAD — the leaf's test import of it is the net-new missing-symbol RED (ADR-0057). The
> classifier is deliberately **pure and dependency-free**: it imports nothing, takes a `DeployRun[]` and
> returns a `DeployHealth` / formatted lines, so it is total, offline-provable, and never touches `gh`, the
> network, a clock, or a store. The un-asserted collaborators it is wired into (the `gh`-shelling wrapper
> and the gate-tail script) are the session's glue (ADR-0158), not part of this proof.

## Guidance

**WHY THIS IS A CAPABILITY (grouping three verdict obligations), and the one honest divergence from
`write-broker`.** The honest proof is the **whole classify-and-format signal across its three verdict
regimes** — a red streak formatted LOUD, a green run formatted quiet, and a no-signal page reported
UNVERIFIED — not a single isolated assertion. Each regime is a **distinct red→green obligation** a leaf
must pin (the three contracts below), so the node groups contracts into one delivered sub-outcome — a
capability, per ADR-0194's "new capability `deploy-health-signal`". The one honest divergence from the
`write-broker` capability (whose `integration-test` spans real cross-package collaborators + an injected
store double): **this classifier has NO external collaborators**. The "integration" is `formatDeployHealth`
composed over `classifyDeployHealth`'s output across the verdict space — the two exported functions
exercised together — which is exactly why the LEAN, dependency-free, no-install proof posture (below) is
legitimate rather than an under-declaration.

**THE EXPORTED API — pin these names verbatim (session glue compiles against them; ADR-0194 §2).** The new
module `packages/cli/src/deploy-health.ts` exports exactly:

```ts
export interface DeployRun {
  status: string;              // "completed" | "in_progress" | "queued" | ...
  conclusion: string | null;   // "success" | "failure" | "cancelled" | ... ; null/"" while running
  updatedAt: string;           // ISO timestamp
  url: string;
  databaseId?: number;
}
export interface DeployHealth {
  verdict: "ok" | "red" | "unknown";
  streak: number;              // consecutive completed non-success runs from the newest completed backward (0 unless red)
  redSince: string | null;     // updatedAt of the OLDEST run in that red streak
  latestRedUrl: string | null; // URL of the NEWEST red run
  lastGreenAt: string | null;  // updatedAt of the newest completed success anywhere in the page, else null
  inFlight: boolean;           // true when a non-completed run is newer than the newest completed one
}
export function classifyDeployHealth(runs: DeployRun[]): DeployHealth;
export function formatDeployHealth(health: DeployHealth): string[]; // human lines, each starting "[check:deploy-health]"
```

Input contract: `runs` arrive **NEWEST-FIRST** exactly as `gh run list` returns them; neither function ever
throws on empty or odd input.

**THE CLASSIFIER SEMANTICS (implement these exactly).** A run is *completed* iff `status === "completed"`;
its `conclusion` is then `"success"` / `"failure"` / `"cancelled"` / `"timed_out"` / … A non-completed run
(`in_progress`, `queued`, or any other status) is *in-flight*. Over the newest-first page:

- **`verdict`** — find the newest completed run (the first `status === "completed"`). None → `"unknown"`.
  Its `conclusion === "success"` → `"ok"`. Its `conclusion !== "success"` (any other string, including
  `"cancelled"` / `"timed_out"` / `null` / `""`) → `"red"`.
- **`streak`** — over the completed runs only, count consecutive from the newest completed backward while
  `conclusion !== "success"`, stopping at the first completed success. `0` unless `verdict === "red"`.
- **`redSince`** — the `updatedAt` of the OLDEST run still in that red streak; `null` unless red.
- **`latestRedUrl`** — the `url` of the NEWEST red run (the newest completed run when red); `null` unless red.
- **`lastGreenAt`** — the `updatedAt` of the newest completed *success* ANYWHERE in the page (set even when
  the newest completed run is red, if a success sits below the streak); `null` when no success exists.
- **`inFlight`** — `true` iff at least one in-flight run is newer than the newest completed run (i.e. the
  newest completed run is not at the top of the page); `false` when the page has no completed run.

**THE FORMATTER (`formatDeployHealth`).** Every line starts `[check:deploy-health]`. `red` → a **LOUD
multi-line WARN block** naming: the streak count, the red-since timestamp, the newest red run URL, the
consequence (`"the hosted studio is serving the image from the last green deploy"` + `lastGreenAt`), and
the forensics pointer (`gh run view <id> --log-failed` / the run URL from `latestRedUrl`; the failing
conclusion string may be carried). `ok` → a **single quiet OK line** mentioning the last-green time and
noting an in-flight deploy when `inFlight`. `unknown` → **one line** stating deploy health is UNVERIFIED
(never "healthy").

**DEPENDENCY-FREE — and it must STAY that way.** `deploy-health.ts` imports NOTHING (no `zod`, no
`@storytree/*`, no `node:` builtins), exactly like `packages/cli/src/boundaries.ts`. That is what lets the
proof run OFFLINE in a bare worktree with no lockfile install — hence NO `install`, NO typecheck wall, NO
`proofCommand`. Keep it pure: the wrapper does the I/O; the classifier does the logic.

**TEST NAMES ARE THE CONTRACT IDS — verbatim (do NOT invent prefixes).** The coverage check
(`check:coverage`) maps each `## Contracts` id below to an observed test name in `real.testFile`
(`deploy-health.test.ts`) — a signed `--real` green scans that ONE file. The leaf's three test block names
(`describe`/`it`) MUST be the three contract ids verbatim: `deploy-health-red-run-classifies-loud`,
`deploy-health-green-run-classifies-quiet`, `deploy-health-no-signal-classifies-unknown`. A leaf-invented
prefix reports `check:coverage` 0/3 even with a green proof — the known SDK-leaf failure mode this
dictation closes.

**THE NET-NEW RED→GREEN.** RED (before IMPLEMENT): `deploy-health.test.ts` imports
`{ classifyDeployHealth, formatDeployHealth }` from `"./deploy-health.js"`, which resolves NOTHING at HEAD
— module-not-found. GREEN: author the single `deploy-health.ts` implementing the semantics above; the
import resolves and all three contracts pass under `node --import tsx --test packages/cli/src/deploy-health.test.ts`.

## Integration test

**Goal —** Prove that `classifyDeployHealth` and `formatDeployHealth`, composed over a newest-first
`gh run list` page, produce a LOUD multi-line signal for a red CD streak, a QUIET single line for a green
deploy (even with an in-flight run above it), and an honest UNVERIFIED line for no signal — the classifier
never throwing on empty or odd input.

The walkthrough exercises this capability against its only collaborators — its own two exported functions
composed (`formatDeployHealth(classifyDeployHealth(runs))`) — over the real `gh run list` fixture data from
the incident (2026-07-13/14). No external stubs, no `gh`, no DB (the pure, dependency-free posture).

1. **Red streak (the incident itself).** Feed an incident-shaped page — consecutive `failure` runs
   newest-first above an older `success` (the incident was 11+ consecutive failures with the last success
   `2026-07-11T07:51`; a representative tail: failures at `13:06:07Z`, `12:48:05Z`, `12:46:53Z`,
   `12:40:43Z`, `12:35:02Z`, `09:20:18Z`, … urls like
   `https://github.com/HuaMick/Storytree/actions/runs/29259962896`). **Success —** `verdict: "red"`;
   `streak` = the failure count; `redSince` = the OLDEST streak failure's `updatedAt`; `latestRedUrl` = the
   NEWEST failure's `url`; `lastGreenAt` = the older success's time; `formatDeployHealth` returns a
   multi-line WARN naming the streak, red-since, newest red URL, the stale-image consequence, and the
   forensics pointer — every line prefixed `[check:deploy-health]`.
2. **Green (recovered).** Feed the recovered tail — `success@2026-07-13T14:58:38Z`,
   `success@2026-07-13T13:46:57Z`, then older failures. **Success —** `verdict: "ok"`, `streak: 0`,
   `redSince: null`, `latestRedUrl: null`, `lastGreenAt: 2026-07-13T14:58:38Z`; format is ONE quiet OK line
   mentioning the last-green time.
3. **Green with an in-flight deploy above it.** Prepend an `in_progress` run (`status !== "completed"`,
   `conclusion: null`) to the recovered tail. **Success —** `verdict: "ok"`, `inFlight: true`, and the
   quiet OK line additionally notes the in-flight deploy.
4. **No signal.** Feed `[]`, then a page of only `in_progress` / `queued` runs. **Success —**
   `verdict: "unknown"`, `streak: 0`, all red fields `null`, `lastGreenAt: null`; format is ONE line saying
   deploy health is UNVERIFIED — never "healthy"; no throw.
5. **Odd input never throws.** Feed runs carrying `conclusion: null` / `conclusion: ""` and unexpected
   `status` strings. **Success —** neither function throws; the verdict resolves by the completed-run rule
   (a completed run with a `null`/`""` conclusion counts as non-success → red).

## Contracts (3)

The test-proven leaf behaviours — each one isolated automated test (`node:test`, the `@storytree/cli`
suite), no collaborators. None exist yet; each is the assertion a contract test WILL prove against the pure
classifier once authored (provisional `covers` path — re-cite at real `file:line` when built). The leaf's
test block name for each MUST be the contract id verbatim (the coverage rule above). Author EACH — a green
that proves only the green/quiet path is incomplete; the LOUD red path is the whole point.

1. **`deploy-health-red-run-classifies-loud`** — a failing newest-completed run classifies red and formats a LOUD gate-tail WARN
   - **asserts —** given a newest-first page whose newest COMPLETED run has `conclusion !== "success"`
     (e.g. the incident tail — consecutive failures above an older success), `classifyDeployHealth` returns
     `verdict: "red"`; `streak` = the count of consecutive completed non-success runs from the newest
     completed backward, stopping at the first completed success; `redSince` = the OLDEST streak run's
     `updatedAt`; `latestRedUrl` = the NEWEST red run's `url`; `lastGreenAt` = the newest completed
     success's `updatedAt` (set because a success sits below the streak). A completed conclusion of
     `"cancelled"` / `"timed_out"` / any non-`"success"` string counts toward the red streak.
     `formatDeployHealth` on that health yields a LOUD multi-line WARN block (every line prefixed
     `[check:deploy-health]`) naming: the streak count, the red-since timestamp, the newest red run URL,
     the consequence (`"the hosted studio is serving the image from the last green deploy"` + `lastGreenAt`),
     and the forensics pointer (`gh run view <id> --log-failed` / the run URL). The failing conclusion
     string may be carried in the message.
   - **covers —** `packages/cli/src/deploy-health.ts` (the red classification + LOUD format) *(provisional)*
2. **`deploy-health-green-run-classifies-quiet`** — a successful newest-completed run classifies ok and formats one quiet line
   - **asserts —** given a page whose newest COMPLETED run has `conclusion === "success"` — EVEN when one
     or more newer non-completed (`status !== "completed"`) in-flight runs sit above it — `classifyDeployHealth`
     returns `verdict: "ok"`, `streak: 0`, `redSince: null`, `latestRedUrl: null`, `lastGreenAt` = the newest
     success's `updatedAt`, and `inFlight: true` iff a non-completed run is newer than the newest completed
     one. `formatDeployHealth` yields a SINGLE quiet OK line (prefixed `[check:deploy-health]`) mentioning
     the last-green time and noting an in-flight deploy when `inFlight` is true.
   - **covers —** `packages/cli/src/deploy-health.ts` (the ok classification + quiet format + in-flight note) *(provisional)*
3. **`deploy-health-no-signal-classifies-unknown`** — no completed run classifies unknown and formats one UNVERIFIED line, never throwing
   - **asserts —** given `[]`, or a page containing ONLY non-completed runs (no `status === "completed"`
     entry), `classifyDeployHealth` returns `verdict: "unknown"` with `streak: 0`, `redSince: null`,
     `latestRedUrl: null`, `lastGreenAt: null`. `formatDeployHealth` yields exactly one line stating deploy
     health is UNVERIFIED (it never claims healthy). Runs carrying `conclusion: null` / `conclusion: ""` and
     runs with unexpected `status` strings never throw — the classifier is total over arbitrary input.
   - **covers —** `packages/cli/src/deploy-health.ts` (the unknown classification + total-input safety) *(provisional)*

## Declared glue (ADR-0158 — landed by the session, deliberately OUT of proof scope)

The provable unit above is ONLY the pure classifier. Two un-asserted connective pieces (ADR-0158 glue —
un-asserted code within this story, wired at the repo edge; the same posture as
`packages-forward-refusal`'s disk gatherer being out of that contract's write scope) are landed by the
session alongside the green unit, NOT proven by a `--real` contract:

- **`packages/cli/src/check-deploy-health.ts`** — the gh-shelling wrapper. Shells
  `gh run list --workflow deploy-studio.yml --branch main --limit 20 --json status,conclusion,updatedAt,url,databaseId`
  (bounded timeout), parses the JSON into `DeployRun[]`, calls `classifyDeployHealth` + `formatDeployHealth`,
  prints the WARN / OK lines, and **always exits 0**. When `gh` / auth / network is absent it SKIPs in one
  quiet line (offline gates unaffected — the ADR-0055 posture). This is I/O glue; its correctness is the pure
  classifier's contracts plus PR-diff review of the shell-out, not a signed verdict.
- **Root `package.json`** — a `check:deploy-health` script invoking the wrapper, plus its entry appended to
  the `gate` script's tail (after `check:agents-sync` / `check:corpus-sync`, the existing best-effort
  WARN-only tail). Wiring, not behaviour.

Both live OUTSIDE this capability's write scope (`packages/cli/src/deploy-health.{ts,test.ts}` only). The
session also updates the `hostedStories` register annotation for `studio-cloud` in `repo-manifest.json`
(currently `"hosted in studio (apps/studio)"`) to record the new `cli` hosting — a human annotation, not a
gate-read key, and outside `stories/**`.

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW, dependency-free — mirroring
[`packages-forward-refusal`](../cli/packages-forward-refusal.md)'s lean posture, same `@storytree/cli`
package):

- **The new test —** `packages/cli/src/deploy-health.test.ts` (`node:test` — `import { test } from
  "node:test"`, `import assert from "node:assert/strict"`, and `import { classifyDeployHealth,
  formatDeployHealth } from "./deploy-health.js"`). Its three top-level test names ARE the three contract
  ids verbatim. Build the fixtures inline as `DeployRun[]` literals from the incident data (§ Integration
  test) — no `gh`, no network.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING (`deploy-health.ts` does
  not exist at HEAD), so the test fails module-not-found (the net-new missing-symbol red, ADR-0057). Assert
  all three contracts — the LOUD red block, the quiet green line (+ in-flight note), and the UNVERIFIED
  unknown line + total-input safety.
- **The GREEN —** write `packages/cli/src/deploy-health.ts`: the two interfaces and the two functions,
  implementing the classifier semantics and formatter above, importing NOTHING. After it, the import
  resolves, the three contracts hold, and the proof runs offline (no install, no typecheck wall).

Rules:

- **Pure classifier, import-free** — `deploy-health.ts` imports nothing and stays that way; the wrapper owns
  all I/O. This is what keeps the proof offline and install-free.
- **Total over arbitrary input** — never throw on `[]`, `null`/`""` conclusions, or unexpected status
  strings; an odd page degrades to `unknown` / the completed-run rule, never a crash.
- **Honest about ignorance** — `unknown` says UNVERIFIED, never "healthy" (an offline/no-`gh` gate must not
  claim the deploy is green). This is the friction item's core ask: silence was the bug.
- **The red path is the deliverable** — the whole point is that a red streak is LOUD; a green-only proof is
  incomplete (the `deploy-health-red-run-classifies-loud` contract is the one that would have caught the
  2-day incident).
