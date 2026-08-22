---
id: "terminal-capture-activation"
tier: capability
story: context-traversal-capture
arc: linked-session-context-arc
title: "The real terminal CLI captures its own reads additively and replays them"
outcome: "The real terminal CLI process records its own allowlisted reads to a durable trace without altering any envelope it already produced."
status: proposed
proof_mode: integration-test
depends_on: [traversal-trace-sink, terminal-boundary-observations, traversal-session-query]
decisions: [235, 241]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-capture", "test"]
  scope:
    testGlobs: ["packages/context-traversal-capture/src/terminal-capture.uat.test.ts"]
    sourceGlobs: ["packages/context-traversal-capture/src/terminal-capture.ts"]
  real:
    testFile: "packages/context-traversal-capture/src/terminal-capture.uat.test.ts"
    sourceFile: "packages/context-traversal-capture/src/terminal-capture.ts"
    scope:
      testGlobs: ["packages/context-traversal-capture/src/terminal-capture.uat.test.ts"]
      sourceGlobs: ["packages/context-traversal-capture/src/terminal-capture.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-capture", "typecheck"]
---

# The real terminal CLI captures its own reads additively and replays them

## Guidance

This capability converts increment 1's "an adapter exists" into "production emits". It carries the
story's UAT, and it is the ONLY unit in this story that touches a foreign building.

**Keep the composition in this story's building.** Author
`packages/context-traversal-capture/src/terminal-capture.ts` as the one entry point the CLI calls —
something of the shape `captureCliInvocation({ argv, ok, sessionId, dir, enabled, now, nextId })`:
resolve the trace directory, call `terminal-boundary-observations`' pure observer, and hand the result
to `traversal-trace-sink`'s sync append. It also exposes the thin query composition
`showTraversalSession` / `listTraversalSessionsRendered` that reads through the sink and renders
through `traversal-session-query`. This is deliberate: it keeps the proof-bound source inside this
story's own package (ADR-0192 D1/D2) and shrinks the foreign edit to a handful of un-asserted lines.

**The CLI-side edit is GLUE and is claimed by nothing** (ADR-0158 — un-asserted connective code in
another story's building). Its whole footprint:

- `packages/cli/src/main.ts` — roughly ten lines: resolve session identity via the ALREADY-imported
  `deriveIdentity()` with `STORYTREE_SESSION_ID` overriding it, observe argv plus the envelope's `ok`
  AFTER `run(…)` resolves, sync-append, the whole thing inside ONE `try`/`catch` that returns nothing.
  This is exactly the `attachDeltaFooter` fail-silent contract already living in that file.
- `packages/cli/src/cli-areas.ts` — `+ "traversal"`.
- `packages/cli/src/traversal.ts` — a thin dispatch (`show <sessionId>`, `list`) into this package's
  query composition.
- `packages/cli/src/commands.ts` — one area branch.
- `packages/cli/package.json` — the runtime dependency on `@storytree/context-traversal-capture`.

Nothing in `packages/cli` may appear in this capability's or the story's proof scope.

**Capture is additive and fail-silent, never fail-closed (ADR-0241 D3).** No telemetry failure may
change an exit code, alter an envelope, or block a command. `main.ts` runs on EVERY invocation
including the gate's own internal calls, so the append must be synchronous, must never await a network
or DB path, and must not regress the ADR-0162 startup budget. Anything that can throw or hang does not
belong in `main.ts`. With `STORYTREE_TRAVERSAL=off`, or when no session identity resolves, no file is
created and the envelope is clean (ADR-0241 D2). **Read "clean" precisely — it is no longer
whole-stdout invariance.** ADR-0260 D3 put a per-invocation offer id on the rendered surface, so a
capture-ON run prints follow-up command lines a capture-absent run does not, and two capture-ON runs
of the same command do not match each other either. What D2 promises, and what the UAT pins, is the
two-part split: the command's own **payload** and exit code are byte-identical whatever capture does,
and the **offer-carrying lines appear only where an offer is genuinely recorded** — never under
`STORYTREE_TRAVERSAL=off`, never without a resolvable identity. That second half is load-bearing, not
cosmetic: a printed id naming a candidate set nothing recorded is an id an agent can return into a
forged edge.

**The `STORYTREE_SESSION_ID` override is required, not a convenience.** `deriveIdentity()` matches
`.claude/worktrees/<name>` and returns null in the main checkout and in CI, so without the override
the UAT passes locally and fails in CI — the known "gate validates MAIN, not the worktree" class. Env
wins over derivation (the secrets-hydration precedent), and the same seam is how a future
spawned-agent adapter will inherit a parent session id (ADR-0241 D9).

**A TRACE SESSION IS ONE CONTEXT WINDOW, AND THE WORKTREE SLOT IS NOT AN IDENTITY** (since
2026-08-22, `linked-session-context-arc-inc-30`). The precedence lives in this story's own package —
`resolveTraceIdentity(…)` in `packages/context-traversal-capture/src/session-identity.ts`, PURE, with
the environment and the caller's slot injected — so the CLI edit stays glue: `main.ts` resolves
`deriveIdentity()` ONCE (the ADR-0162 startup budget) and derives both identities from it, the
worktree one for the spawn registry and the delta footer, and this one for capture. Order:
`STORYTREE_SESSION_ID`, then the harness-reported window id (`CLAUDE_CODE_SESSION_ID`), then
**nothing**. There is deliberately NO slot fallback: a slot is shared by the parent session, each
subagent it spawns, and every later session the pool hands it — measured at a median of 2 windows,
a p90 of 8, and one holding 137 — so keying a trace by it reports many windows' reads as one
session's, which inflated the corpus-wide re-read share from 13.4% to 32.0% (x2.39). A run that
cannot name its window records nothing, the same silent no-op a null identity has always been. The
slot is still passed down and stamped beside the identity as a grouping attribute.

**Prove it by spawning the real CLI.** The UAT test file
`packages/context-traversal-capture/src/terminal-capture.uat.test.ts` spawns
`node packages/cli/launch.mjs …` as a child process with `STORYTREE_TRAVERSAL_DIR` and
`STORYTREE_SESSION_ID` pointed at a temporary directory, OFFLINE and without `--pg`. A test file is
scaffolding, never landlord evidence, so the UAT may spawn the CLI without claiming its sources.

**Assert on bytes, not only on parsed events.** The canary contract below is ADR-0235 clause 6 as a
statement about what is on disk, so it reads the trace file as text and searches for the canary
string.

**Landing order.** Land the story's declared edges and the `repo-manifest.json` ownership entry BEFORE
this capability, or `check:boundaries` goes red on the undeclared `cli` → capture-package runtime edge
rather than on anything in the code. Run `pnpm install` after the package exists or the worktree
cannot resolve it. Expect `check:surface-coverage` to WARN that the new `traversal` area is an orphan
until a `process` artifact names it — that WARN never blocks, and inventing a process artifact to
silence it is the wrong fix (ADR-0154).

## Contracts

1. **`a-spawned-read-command-writes-a-replayable-visit`**
   - **asserts —** spawning the real CLI on an allowlisted read leaves a session trace file in the
     temporary directory whose replay, read by the test process after the child has exited, holds
     exactly one full-payload visit for the canonical node named in argv.
2. **`two-commands-share-one-session-with-distinct-visits`**
   - **asserts —** two spawned commands under one `STORYTREE_SESSION_ID` produce one session holding
     two events with distinct `visitId`s and distinct read strengths, and neither event carries
     `parentVisitId`, `priorVisitId`, or `followedEdgeId`.
3. **`a-spawned-write-command-leaves-no-canary-bytes`**
   - **asserts —** spawning a write-shaped command whose arguments carry canary prose appends no event
     AND leaves a trace file whose raw bytes do not contain the canary.
4. **`traversal-show-renders-the-captured-session`**
   - **asserts —** spawning `traversal show <sessionId>` exits 0 and renders both visits with the
     read-strength distinction, capacity stated as unknown, and the supported/omitted coverage block;
     the same command over a corrupt trace still exits 0 and states its skipped count.
5. **`capture-off-leaves-a-byte-identical-envelope`**
   - **asserts —** the ADR-0241 D2 envelope split, against a capture-absent baseline. With
     `STORYTREE_TRAVERSAL=off`, and again with no resolvable session identity: no trace file is
     created, the exit code is unchanged, the command's **payload** (stdout with the offer-carrying
     lines removed) is byte-identical to the baseline, and **no offer line is printed at all**. A
     third, capture-ON variant pins the other direction — offer lines MUST appear on a run that
     records an offer, while the payload still matches the baseline.
   - **the contract name is older than the contract.** Whole-stdout equality stopped holding when
     ADR-0260 D3 landed the per-invocation offer id; it does not hold between two capture-ON runs
     either. The assertion is on the payload plus the offer-line rule — do not "repair" a failure here
     by re-tightening it to whole-stdout, and do not read the name as the claim.

## Integration evidence

`packages/context-traversal-capture/src/terminal-capture.uat.test.ts` is the story's standing machine
UAT and this capability's proof, run by `pnpm --filter @storytree/context-traversal-capture test`. It
spawns the real CLI entry as a child process against a temporary trace directory with an explicit
session id — so activation is OBSERVED in a real production process rather than asserted about a
composed object — then reads the resulting file back both as parsed events and as raw text. The
capture composition it proves lives in this story's building; the CLI-side lines it exercises are
declared glue and are claimed by nothing.
