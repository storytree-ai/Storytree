---
id: "codex-detached-app-server"
tier: contract
story: agent
capability: live-codex-leaf
arc: mintbox-event-driven-orchestration-arc
title: "Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts"
outcome: "A caller can open one authenticated repo-pinned Codex app-server, observe its response-resolved thread/model/effort and exact platform-honest process ownership before work starts, then use that same bounded controller to start a turn, probe current ownership, and perform every cleanup that ownership still safely licenses idempotently."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [11, 104, 232, 561]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/codex-detached-app-server.test.ts"]
    sourceGlobs:
      - "packages/agent/src/codex-detached-app-server.ts"
      - "packages/agent/src/index.ts"
  real:
    testFile: "packages/agent/src/codex-detached-app-server.test.ts"
    sourceFile: "packages/agent/src/codex-detached-app-server.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-detached-app-server.test.ts"]
      sourceGlobs:
        - "packages/agent/src/codex-detached-app-server.ts"
        - "packages/agent/src/index.ts"
    install: true
    editsExisting: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/agent", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts

**Outcome —** A caller can open one authenticated repo-pinned Codex app-server, observe its
response-resolved thread/model/effort and exact platform-honest process ownership before work starts,
then use that same bounded controller to start a turn, probe current ownership, and perform every
cleanup that ownership still safely licenses idempotently.

## Why this is a contract under `live-codex-leaf`

The proof-mode boundary decides the tier. This behaviour has no standalone integrated journey: its
honest proof replaces subscription auth, the child process, JSONL protocol, clock, OS ownership and
platform-safe termination with injected collaborators and asserts one public boundary. That is one
isolated
automated behaviour — a contract — inside the independently viable live-Codex capability. A seventh
capability would be a shallow boundary over the same `codex-*` runtime surface and would still need
the same stubs. The contract adds no capability edge: any helper it reuses from `codex-author.ts` or
`codex-rate-limits.ts` is inside `live-codex-leaf`, and no other capability's delivered outcome is a
precondition.

The seam is deliberately role-neutral. It knows Codex subscription authentication, protocol identity
and platform-honest process ownership; it knows nothing about Mintbox, Terra, claims, worktrees, lane
limits, graphics, GPUs, or whether a caller should accept the observed identity.

## Proof walkthrough

Extend the existing `packages/agent/src/codex-detached-app-server.test.ts`; do not replace its signed
happy-path assertion. Use recording low-level adapters for protocol fault cases and a real long-lived
stand-in child for the production process-composition cases. No test spends a Codex turn, contacts a
database, or reaches the network. Each numbered leg below is one independently coverable contract and
has its own required test-title prefix; no single broad happy-path title satisfies another leg.

1. **`auth-refusal-and-timeout-never-spawn`.** Table-drive the production authentication preflight's
   refusal observations: nonzero/ambiguous output, non-ChatGPT-managed login, explicit timeout and
   thrown runner failure. Each case rejects before command resolution or spawn; the exact managed
   success is the only result that advances.
2. **`pinned-command-scrubs-env-and-spawns-detached`.** Put a recording low-level process seam beneath
   the production defaults. Assert the repo-pinned executable (or validated absolute override), exact
   `app-server --stdio` argv, requested cwd, case-insensitive metered-credential scrub, retained benign
   environment and actual-host detached-spawn options. Exactly one positive-pid child is created after
   successful auth; a relative override, resolution failure or spawn failure rejects before ownership
   or protocol work and never starts a second child.
3. **`posix-group-owner-is-observed-probed-and-terminated`.** Through a deterministic POSIX OS seam,
   assert acquisition and liveness probe the negative child pid as a process group, publish the literal
   `posix-process-group` owner rooted at that child, and terminate that same negative group with the
   bounded signal. Never target a bare pid, executable name or another group.
4. **`windows-tree-owner-is-observed-probed-and-terminated`.** Through a deterministic Windows OS
   seam, assert acquisition records the exact live root identity and publishes the literal
   `windows-process-tree` owner. Probe and termination re-run `tasklist` and require the same live root
   token before `taskkill /PID <root> /T /F`; root disappearance or token change is ownership lost and
   dead-for-controller, so it is never signalled. The rooted command reaches descendants still reachable
   from that live root; it is not durable containment or proof that escaped descendants died.
5. **`owner-validation-rejects-invalid-pid-root-kind-and-token`.** Table-drive every owner boundary:
   absent, zero, negative, fractional, non-finite and unsafe pid; missing owner; wrong root; host-wrong
   discriminant; caller platform assertion contradicting the host; blank/whitespace token. Every row
   rejects, closes protocol I/O, performs only cleanup still safely licensed by the just-created
   process identity or handle, and never returns a controller or signals a stale numeric pid.
6. **`ownership-acquisition-failure-reaps-spawned-child`.** Make production ownership observation
   return unavailable, throw and exceed its bound after spawn. Each path closes protocol I/O and uses
   every still-owned cleanup handle: POSIX may reap the exact detached group, while Windows may signal
   only a root whose current identity is still proven. With no such proof it rejects without a numeric
   kill; inability to acquire the public owner never licenses a stale-pid guess or silent abandonment.
7. **`initialize-notification-thread-order-returns-response-identity`.** Assert auth -> spawn ->
   initialize request -> initialized notification -> ephemeral thread/start, with no turn/start during
   open. Make the returned thread id, model and effort deliberately contradict the request and assert
   the response values verbatim beside the exact pid/owner. Table-drive non-object initialize results
   plus missing/non-object thread and blank id/model/effort; every invalid row cleans up and rejects.
8. **`jsonl-fragments-and-correlates-responses`.** Split one JSON object across chunks, coalesce several
   newline-delimited objects in another chunk, and exercise correlated numeric ids while a request is
   pending. The parser retains only the incomplete suffix, resolves each request exactly once from its
   own id, ignores blank lines, and exposes no raw transcript.
9. **`jsonl-rpc-write-and-exit-faults-clean-up`.** Table-drive malformed JSON, non-object messages,
   missing/non-safe/wrong response ids, RPC error responses, request and notification write failures,
   process error and early exit. Every row rejects the affected operation, settles all pending work,
   closes I/O and performs every cleanup still safely licensed. An observed Windows root exit is
   dead-for-controller and forbids `taskkill`; no row claims that vanished-root descendants were killed.
10. **`request-timeouts-use-safe-bound-and-clean-up`.** Drive initialize, thread/start, turn/start and
    rate-limit reads past their request bound. Undefined uses the safe positive default; zero, negative,
    `NaN` and infinite inputs cannot disable or corrupt it. Each expiry removes its pending
    correlation, performs platform-safe owned cleanup, reaches the controller's terminal observation
    and rejects without a second process or stale-pid signal.
11. **`turn-prompt-and-response-failures-clean-up`.** Table-drive blank/whitespace prompts and missing,
    non-object, blank-id or blank-status turn results, then prove one valid turn/start carries the staged
    thread id and exact prompt and returns response identity. Every invalid start performs every safe
    cleanup and confirms the owner terminal for this controller; a later probe cannot report it live.
12. **`probe-tristate-and-same-channel-rate-limits`.** At call time, make exact-owner liveness report
    live, dead and unavailable/error. Live alone sends bounded `account/rateLimits/read` through the
    already-initialized app-server and returns its observation; dead starts no request; unavailable is
    preserved as typed unavailable rather than collapsed to dead or guessed live. No case starts a
    thread, turn or second process.
13. **`termination-is-idempotent-bounded-and-confirms-death`.** Race two terminate calls and call it
    again after settlement. They share one terminal operation and close protocol I/O. POSIX invokes one
    exact-group terminator and confirms group death; Windows invokes `taskkill /PID <root> /T /F` only
    after same-token live-root re-observation, then confirms root disappearance. A root already absent
    or changed is ownership-lost/dead-for-controller and is never signalled; descendant death is not
    inferred from it. Terminator error, observation error, bound expiry and a still-live matching root
    reject rather than report cleanup.
Across all thirteen legs, errors carry bounded diagnostic classification but no stdout/stderr or raw
protocol transcript, and the public barrel exposes only the role-neutral controller/types — no
Mintbox, Terra, claim, worktree, GPU or lane policy.

The observable is the public return value plus the fake auth, command, protocol, ownership, clock and
termination logs. The real package typecheck proves publication through `packages/agent/src/index.ts`.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file before
writing. The contract id in a phase prompt is an index, never a substitute for the proof walkthrough
and the full assertion below.

**One public deep module.** Author `packages/agent/src/codex-detached-app-server.ts` and publish only
the narrow role-neutral types plus `openPinnedCodexDetachedThread` through
`packages/agent/src/index.ts`. The module hides authentication, repo-pinned command resolution,
generated v2 JSONL protocol, request correlation, detachment, ownership, bounds and cleanup. Do not
export raw child-process objects, the generated `@openai/codex` protocol types, stdout/stderr, argv,
or a transcript. Do not add another `@openai/codex` import site outside `@storytree/agent`.

**Authenticate before detaching.** Run the bounded `codex login status` preflight with the existing
case-insensitive metered-credential scrub and admit only the existing exact ChatGPT-managed result.
An API-key login, ambiguity, timeout or error starts no app-server. The app-server itself comes from
the repository-pinned `@openai/codex` entrypoint (or the existing absolute executable override), with
the same scrubbed environment. It is the only detached app-server this open call may create. The
production default MUST call that real bounded auth runner; a default function that returns
`unavailable`, logged-out or any other canned refusal is not an implementation of the contract.

**Stage before work.** Speak the pinned dependency's generated v2 protocol: initialize, send the
initialized notification, then `thread/start`. Do not issue `turn/start` inside the open call. The
returned `threadId`, resolved model and resolved reasoning effort come from `ThreadStartResponse`, not
the request, argv, intended defaults, exit status, caller prose or a log line. Reject missing or
malformed response identity. `startTurn` accepts a non-blank role-neutral prompt and runs later, on
that same initialized app-server and staged thread.

**Ownership is observed, opaque and platform-honest.** The positive pid is the spawned OS child's pid.
The public owner is a discriminated opaque value: `posix-process-group` only when a POSIX process group
was acquired and observed for that child; `windows-process-tree` only when the exact live Windows root
and its observation token were acquired. The Windows discriminant records a rooted `taskkill`
capability while that same root remains live; it does not claim a Job Object or durable containment.
Before every Windows probe or termination, `tasklist` must re-observe the root and the token must equal
the acquired token. Only then may termination run `taskkill /PID <root> /T /F`, reaching descendants
still reachable from that live root. Root disappearance or token change means ownership lost and
dead-for-controller: never reuse the numeric pid, never signal it, and never infer that escaped
descendants died. The token may be persisted but its representation is not caller policy. Never call a
Windows pid a pgid, never fall back to an unowned bare pid, and never broad-kill by image name. If
ownership cannot be acquired, the open fails, closes protocol I/O, and uses only cleanup still licensed
by the just-spawned process handle or a current identity observation. Production chooses the ownership
variant from the OS; a caller-supplied `platform` string is not observation. Exact POSIX process-group
termination and live-root-reachable Windows tree termination are both production behaviours, not
optional test injections.

**One controller, one process, bounded all the way down.** `startTurn`, `probe` and `terminate` operate
on the same app-server. `probe` combines exact-owner liveness with a typed rate-limit observation made
through `account/rateLimits/read` on that same channel, so a caller can take before/after account-wide
observations without starting another app-server. Every protocol request and every cleanup wait has a
positive finite bound with a safe default. A protocol error, write error, early exit, timeout, invalid
identity or failed `startTurn` closes and rejects after performing every safe owned cleanup still
available. In particular, observed Windows root exit closes the channel but forbids a stale-pid kill.
`terminate` is concurrent-safe and idempotent: it waits for exact POSIX group death, or for Windows
root disappearance/ownership loss after any same-token live-root termination it was allowed to send,
and retains only bounded diagnostic detail. It never upgrades Windows root disappearance into proof
that escaped descendants died.

**The red is an assertion over existing code.** Source and test now exist and carry a signed first
green, so this `real:` arm is deliberately `editsExisting: true`. AUTHOR_TEST adds regression
assertions to the existing test file and reaches the existing public value through `./index.js`; at
least one new substantive assertion must run and fail against the current implementation. A missing
import, compile failure, deleted old assertion or type-only check is the wrong red. IMPLEMENT edits
the existing source minimally until the new assertions and every old one pass. `real.scope` retains
the implementation and barrel, and the package suite remains the explicit `proofCommand` over that
public surface.

**The changed-line mutation rung is a binary ship gate, not a percentage target.** The first gated
reading counted 455 mutants: 201 killed, 138 survived, 115 with no coverage and one timed out. The
mutation-bound re-drive then signed `real-mu4pozsf` at `206ecd7`, but it added only one blank-prompt
cleanup test and five implementation lines; the resulting 456-mutant run had no new production-path
or parser matrix capable of changing the verdict and was stopped rather than mistaken for progress.
A signed contract-test verdict does not override that red. The next real drive is complete only when
`pnpm check:mutation-diff` exits zero: every mutant in this branch's changed lines is killed by this
branch's tests, or the exact source line carries a narrowly scoped Stryker equivalence annotation
naming the precise mutator class and explaining why no possible input or observable can distinguish
the mutant from the original. A timeout is unproven, not a pass. Reachable, merely uncovered,
expensive, or inconvenient behaviour is not equivalent; do not disable it, do not use a blanket `all`
annotation, and remove a redundant branch instead of annotating it when deletion preserves the
contract.

The hardening must exercise the production defaults and their branches directly, not infer them from
high-level injected substitutes: bounded authentication and credential scrubbing, pinned detached
spawn, actual-host owner selection and acquisition, POSIX-group and Windows-tree command composition,
current-owner liveness, exact POSIX-group termination, live-root-reachable Windows termination, and
platform-qualified terminal observation. Refactor a hidden default behind a deterministic low-level
seam when that is needed to make its decisions observable, while keeping the public barrel narrow and
role-neutral. The remaining protocol, validation, timeout,
failure-cleanup, idempotence, and same-app-server branches are subject to the same per-mutant rule.
Strengthen or simplify source together with substantive assertions until the mutation command passes;
an assertion-title shell, a test that reaches only injected happy paths, or an annotation for a mutant
that some input could distinguish does not satisfy any of the thirteen contracts.

**Tests.** Use `node:test` and `node:assert/strict`, with every await bounded and every fake settling
deterministically. Retain the signed tests, then add at least one substantive runtime test for EACH of
the thirteen exact ids below. Every title begins with exactly one id verbatim; sharing a former broad
prefix, naming several ids in one title, or keeping an old title without the new prefix covers none of
the new lines. For a line that names a matrix, every named row needs an assertion under that line's
prefix — one representative case is incomplete. Literal protocol methods, command argv and platform
discriminants appear in assertions rather than being read back from production constants. Use focused
table-driven cases plus one real-child production-composition test. Every spawned stand-in/root/
descendant is reaped in `finally`, even when an assertion fails.

## Contracts (13)

1. **`auth-refusal-and-timeout-never-spawn`** — only a bounded exact ChatGPT-managed authentication result may reach process creation.
   - **asserts —** `openPinnedCodexDetachedThread` runs `login status` first and rejects every
     nonzero/ambiguous result, non-ChatGPT-managed login, explicit timeout and runner error before
     resolving or spawning the app-server; the exact managed success is the only advancing row.
   - **covers —** authentication admission and the pre-spawn branch in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** table-driven `auth-refusal-and-timeout-never-spawn: ...` tests that assert zero
     command-resolution/spawn calls for every named refusal row and one advancing managed-login row.
2. **`pinned-command-scrubs-env-and-spawns-detached`** — the production command path creates exactly one scrubbed repo-pinned detached app-server.
   - **asserts —** after auth, production resolves the pinned Codex executable or a validated absolute
     override, passes exact `app-server --stdio` argv and cwd, strips metered credentials regardless of
     key casing while preserving benign environment, and asks the actual host for one hidden detached
     child with piped protocol I/O and a positive safe pid; a relative override, resolution failure or
     spawn failure rejects before owner/protocol work and never creates a replacement child.
   - **covers —** pinned command composition and the production spawn adapter in
     `packages/agent/src/codex-detached-app-server.ts`, reached through the public barrel.
   - **proven by —** `pinned-command-scrubs-env-and-spawns-detached: ...` tests over a recording
     low-level process seam, its named failure rows, and the bounded real-child stand-in composition
     case.
3. **`posix-group-owner-is-observed-probed-and-terminated`** — the POSIX production path owns, observes and terminates the exact detached process group.
   - **asserts —** a positive child pid is observed as negative pgid, yields opaque
     `posix-process-group` ownership rooted at that child, is probed with the same negative target and
     is terminated with the bounded group signal; no bare pid, other group or image name is targeted.
   - **covers —** POSIX arms of production ownership acquisition, liveness and termination in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `posix-group-owner-is-observed-probed-and-terminated: ...` tests whose recording
     OS seam asserts literal owner discriminant, signed target, probe and termination signal.
4. **`windows-tree-owner-is-observed-probed-and-terminated`** — the Windows production path observes
   the exact live root and terminates only its currently reachable rooted tree.
   - **asserts —** a positive child pid is inspected by `tasklist` as the exact live Windows root,
     yields opaque `windows-process-tree` ownership with an identity token, and is re-observed with the
     same token before any descendant-inclusive `taskkill /PID <root> /T /F`. Root disappearance or
     token change reports ownership lost/dead-for-controller and sends no signal; no result claims
     escaped-descendant death, a Job Object, pgid ownership or image-name ownership.
   - **covers —** Windows arms of production ownership acquisition, liveness and termination in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `windows-tree-owner-is-observed-probed-and-terminated: ...` tests whose recording
     OS seam asserts literal discriminant, exact-token task-list re-observation, exact task-kill command
     composition, and no kill after root disappearance or token change.
5. **`owner-validation-rejects-invalid-pid-root-kind-and-token`** — no invalid or mismatched process identity can become the controller's owner.
   - **asserts —** absent, zero, negative, fractional, non-finite and unsafe pids plus missing owner,
     wrong root, host-wrong kind, caller platform assertion contradicting the host, and blank/whitespace
     token each reject; every post-spawn row closes I/O, attempts only cleanup authorized by a current
     identity or owned handle, reaches a platform-qualified terminal observation and returns no
     controller or stale-pid signal.
   - **covers —** pid and exact-owner validation before protocol staging in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** an exhaustive `owner-validation-rejects-invalid-pid-root-kind-and-token: ...`
     table with one named case and platform-qualified cleanup/terminal assertion for every listed value
     class.
6. **`ownership-acquisition-failure-reaps-spawned-child`** — failure to acquire public ownership cannot orphan the child created immediately before it.
   - **asserts —** unavailable, thrown and bounded-out production ownership observations close I/O,
     use every still-owned emergency cleanup path and then reject. POSIX targets only the exact group;
     Windows signals only a same-token live root, otherwise it closes without numeric kill. No path
     returns an unowned bare pid, claims escaped-descendant death or silently skips available cleanup.
   - **covers —** post-spawn/pre-owner failure handling and emergency cleanup in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `ownership-acquisition-failure-reaps-spawned-child: ...` tests for unavailable,
     error and timeout rows, each asserting I/O closure, every available owned cleanup, the
     platform-qualified terminal observation and no stale-pid kill before rejection settles.
7. **`initialize-notification-thread-order-returns-response-identity`** — opening stages one response-identified thread without starting work.
   - **asserts —** the one child observes auth -> spawn -> `initialize` request -> `initialized`
     notification -> ephemeral `thread/start`, and no `turn/start`; thread id, model and effort that
     deliberately differ from the request are returned verbatim beside the spawned pid and owner;
     non-object initialize plus missing/non-object thread and blank id/model/effort each clean up and
     reject rather than borrowing identity from the request.
   - **covers —** staged request ordering and thread response validation in
     `packages/agent/src/codex-detached-app-server.ts` plus the public return in `index.ts`.
   - **proven by —** `initialize-notification-thread-order-returns-response-identity: ...` tests with
     a literal protocol log, a response contradicting all requested identity fields, and one asserted
     platform-qualified cleanup/terminal row for every invalid initialize/thread shape.
8. **`jsonl-fragments-and-correlates-responses`** — the app-server reader frames chunked JSONL and resolves only the request named by each response id.
   - **asserts —** a response split across chunks, several lines coalesced in one chunk and blank lines
     preserve the incomplete suffix and parse exactly once; safe numeric ids correlate the right
     pending request without exposing transcript text or resolving any other request.
   - **covers —** buffer framing, JSON parsing and pending-request correlation in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `jsonl-fragments-and-correlates-responses: ...` tests that feed fragments,
     coalesced lines and distinguishable correlated responses under the exact prefix.
9. **`jsonl-rpc-write-and-exit-faults-clean-up`** — protocol and process faults reject pending work and clean up the exact owner.
   - **asserts —** malformed JSON, non-object messages, missing/non-safe/wrong ids, RPC errors, request
     and notification write errors, process error and early exit each reject the affected operation,
     settle all pending requests, close I/O and perform every still-safe owned cleanup once with bounded
     diagnostics only. Early Windows root exit forbids `taskkill`; it is dead-for-controller, not proof
     that descendants died.
   - **covers —** JSONL fault dispatch, RPC rejection, write catches and process event handlers in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** a `jsonl-rpc-write-and-exit-faults-clean-up: ...` matrix with one asserted row for
     every named fault and its pending-settlement plus platform-qualified cleanup/terminal postcondition.
10. **`request-timeouts-use-safe-bound-and-clean-up`** — every request family has a positive finite
    timeout whose expiry cleans up the owner within current platform authority.
    - **asserts —** initialize, thread/start, turn/start and rate-limit reads expire through the injected
      clock; undefined selects the safe default while zero, negative, `NaN` and infinite
      inputs cannot disable or corrupt it; expiry deletes correlation, performs platform-safe cleanup,
      reaches the controller's terminal observation, rejects and starts no replacement process or
      stale-pid signal.
    - **covers —** timeout normalization and per-request timer cleanup in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `request-timeouts-use-safe-bound-and-clean-up: ...` tables spanning every timeout
      input class and request family, with observed bound, correlation removal and exact cleanup.
11. **`turn-prompt-and-response-failures-clean-up`** — a staged controller starts only a valid response-identified turn and cleans up every invalid attempt.
    - **asserts —** blank/whitespace prompt and missing, non-object, blank-id or blank-status turn result
      reject and confirm the owner terminal for this controller; one valid request carries the staged thread id and exact prompt
      and returns response-produced id/status; no case starts another app-server and failed start leaves
      probe unable to report live.
    - **covers —** `CodexDetachedThread.startTurn`, turn response validation and its cleanup path in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** a `turn-prompt-and-response-failures-clean-up: ...` matrix covering every prompt/
      result row plus one contradictory valid response and its literal `turn/start` params.
12. **`probe-tristate-and-same-channel-rate-limits`** — probe preserves live/dead/unavailable ownership truth and reads limits only on the existing live channel.
    - **asserts —** exact-owner observation at call time yields distinguishable live, dead and typed
      unavailable/error results; only live sends bounded `account/rateLimits/read` through the staged
      app-server and returns that response, while dead/unavailable start no request, process, thread or
      turn and never manufacture limits.
    - **covers —** `CodexDetachedThread.probe`, production liveness and same-channel rate-limit dispatch
      in `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `probe-tristate-and-same-channel-rate-limits: ...` tests for all three liveness
      states plus a spontaneous exit and a literal one-channel protocol log.
13. **`termination-is-idempotent-bounded-and-confirms-death`** — termination settles once for all
    callers only after a bounded platform-qualified terminal observation.
    - **asserts —** concurrent calls and a later repeat share one terminal operation and close I/O.
      POSIX invokes one exact-group terminator and polls until group death. Windows first requires the
      same live root token, invokes one rooted `taskkill`, and polls until root disappearance; a root
      already absent or carrying another token is ownership-lost/dead-for-controller and is never
      signalled. Terminator error, observation error, bound expiry and a still-live matching owner
      reject rather than report cleanup; no Windows row claims escaped-descendant death.
    - **covers —** `CodexDetachedThread.terminate`, concurrency/idempotence, bounded platform-qualified
      terminal observation and terminal error retention in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `termination-is-idempotent-bounded-and-confirms-death: ...` tests racing calls and
      separately asserting terminator error, observation error, timeout and still-live rows.
