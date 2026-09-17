---
id: "codex-detached-app-server"
tier: contract
story: agent
capability: live-codex-leaf
arc: mintbox-event-driven-orchestration-arc
title: "Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts"
outcome: "A caller can open one authenticated repo-pinned Codex app-server, observe its response-resolved thread/model/effort and exact platform-honest process ownership before work starts, then use that same bounded controller to start a turn, probe current ownership, and perform every cleanup that ownership still safely licenses idempotently; after a caller persists that opaque owner, a fresh Agent runtime can safely recover owner-only probe and termination without reconstructing protocol state."
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
      - "packages/agent/src/codex-rate-limits.ts"
      - "packages/agent/src/index.ts"
  real:
    testFile: "packages/agent/src/codex-detached-app-server.test.ts"
    sourceFile: "packages/agent/src/codex-detached-app-server.ts"
    scope:
      testGlobs: ["packages/agent/src/codex-detached-app-server.test.ts"]
      sourceGlobs:
        - "packages/agent/src/codex-detached-app-server.ts"
        - "packages/agent/src/codex-rate-limits.ts"
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
cleanup that ownership still safely licenses idempotently; after a caller persists that opaque owner,
a fresh Agent runtime can safely recover owner-only probe and termination without reconstructing
protocol state.

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
   assert acquisition observes the root's immutable process-birth generation as well as the negative
   child pid as a process group, persists both in the `posix-process-group` owner, and re-observes that
   exact generation immediately before signalling the same negative group with bounded `SIGTERM`.
   Observation error is unavailable, never live-by-sentinel. If the generation changes after a probe
   but before the termination check, send no signal. Never target a bare pid, executable name or
   another group.
4. **`windows-tree-owner-is-observed-probed-and-terminated`.** Through a deterministic Windows OS
   seam, assert acquisition records the exact live root identity and publishes the literal
   `windows-process-tree` owner. Probe and termination re-run `tasklist`, but its image/pid/session row
   is not generation identity: an independent immutable process-creation observation must also match
   immediately before `taskkill /PID <root> /T /F`. Root disappearance, creation-identity change, or a
   change after probe but before the termination check is ownership lost and dead-for-controller, so
   it is never signalled even when the tasklist row is identical. The rooted command reaches descendants
   still reachable from that live root; it is not durable containment or proof that escaped descendants
   died.
5. **`owner-validation-rejects-invalid-pid-root-kind-and-token`.** Table-drive every owner boundary:
   absent, zero, negative, fractional, non-finite and unsafe pid; missing owner; wrong root; host-wrong
   discriminant; caller platform assertion contradicting the host; blank/whitespace token; malformed
   token version/prefix/field count; embedded-root mismatch; and legacy bare `pgid:<pid>`. Every malformed
   persisted owner returns typed unavailable before any OS call. Every open-time row rejects, closes
   protocol I/O, performs only cleanup still safely licensed by the just-created process identity or
   handle, and never returns a controller or signals a stale numeric pid.
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
    already-initialized app-server and returns the existing public `CodexRateLimitSnapshot` by reusing
    the canonical full-response parser in `codex-rate-limits.ts`; detached tests prove same-channel
    integration and clock ownership, while the canonical parser tests own the nested response-boundary
    matrix. In the existing broad same-channel row, an RPC frame with `{ result: {} }` fulfills probe as
    `{ live: true, rateLimits: { status: "unavailable", reason: "invalid-response", detail:
    "account/rateLimits/read did not return a rateLimits object" } }`; it does not reject, close the
    channel or invoke cleanup. Dead starts no request and returns no snapshot; unavailable ownership is
    preserved as typed unavailable rather than collapsed to dead, guessed live or given a fabricated
    snapshot. No case starts a thread, turn or second process.
13. **`termination-is-idempotent-bounded-and-confirms-death`.** Race two terminate calls and call it
    again after settlement. They share one terminal operation and close protocol I/O. POSIX invokes one
    exact-group terminator and confirms group death; Windows invokes `taskkill /PID <root> /T /F` only
    after same-token live-root re-observation, then confirms root disappearance. A root already absent
    or changed is ownership-lost/dead-for-controller and is never signalled; descendant death is not
    inferred from it. Terminator error, observation error, bound expiry and a still-live matching root
    reject rather than report cleanup.
14. **`persisted-owner-recovers-across-runtime-restart`.** Persist the public opaque owner from one
    Agent runtime, discard every in-memory generation map, child handle and protocol channel, then pass
    it through the public barrel to `recoverCodexDetachedOwner` in a fresh runtime. On both POSIX and
    Windows, require a strict versioned token carrying host kind, embedded root pid, runtime provenance,
    and OS-observed immutable process-birth identity. Validate its complete shape before any OS call,
    report live only after re-observing that exact generation, and re-observe again inside termination
    immediately before signalling. Drive generation-change TOCTOU on each platform, malformed-owner
    zero-OS-call rows, observer and terminator throws, unavailable after signal, multi-poll death,
    still-live timeout, exact delay/poll caps, and a hanging delay that the outer bound still rejects.
    Concurrent and later terminate callers share the one fulfillment or rejection. Cross-runtime
    recovery is a fallback only for a runtime that never minted that token: if the current runtime
    minted it and has observed that exact generation dead or latch-closed it, that stronger local
    negative fact remains terminal. Durable recovery must not re-open it even when an OS descriptor is
    later observable, and a reused pid or different generation never inherits the old token's authority.
15. **`owner-token-grammar-is-strict-versioned-and-os-silent-on-rejection`.** Exercise one durable
    token grammar across both host kinds. POSIX is exactly six colon-separated fields,
    `codex-owner:v1:p:<canonical-positive-pid>:<lowercase-rfc4122-v4-runtime-uuid>:<unpadded-base64url-birth-id>`;
    Windows is exactly seven,
    `codex-owner:v1:w:<canonical-positive-pid>:<lowercase-rfc4122-v4-runtime-uuid>:<unpadded-base64url-creation-id>:<unpadded-base64url-tasklist-row>`.
    The pid is canonical base-ten `[1-9][0-9]*`, decodes to a positive safe integer, round-trips to the
    same text and equals `rootPid`; the UUID is lowercase RFC 4122 version 4; every base64url field is
    non-empty, unpadded and canonical under strict decode/re-encode. No alternate or legacy encoding is
    accepted. Pin the valid fixtures
    `codex-owner:v1:p:4242:123e4567-e89b-42d3-a456-426614174000:Ym9vdC0xOnN0YXJ0LTk4NzY1`
    and
    `codex-owner:v1:w:7331:9f1c2e3d-4a5b-4c6d-8e7f-0123456789ab:MTMzNzIyNjU2MDAwMDAwMDAw:Y29kZXguZXhlLDczMzEsQ29uc29sZSwx`,
    and reuse those constants or grammar-preserving helpers for every positive, re-observation and
    local-negative row in Contracts 15-21. Shorthand such as `v1:posix:<pid>:birth` or
    `v1:windows:<pid>:creation:row` is rejection-only. Table-drive every malformed field, missing/extra
    field, unsupported version, host mismatch, root mismatch and legacy encoding, and assert typed
    unavailable with zero ownership-observer, terminator or other OS calls.
16. **`posix-owner-requires-immutable-birth-identity`.** Make POSIX acquisition and recovery distinguish
    the exact root process birth from process-group existence. A bare negative group, a sentinel and a
    group-exists result without immutable birth identity all fail closed; only the matching immutable
    root birth makes the token live.
17. **`windows-owner-requires-tasklist-and-creation-identity`.** Make Windows acquisition and recovery
    require the conjunction of the matching `tasklist` image/pid/session row and an independent immutable
    creation identity. The same row with a different creation identity is dead-for-controller and never
    sufficient ownership.
18. **`both-platforms-reobserve-generation-immediately-before-signal`.** On POSIX and Windows, first
    observe the persisted generation live, then swap it before the termination operation's own observation.
    Each platform performs the fresh observation immediately before its signal and sends zero `SIGTERM`
    or `taskkill` calls when that generation no longer matches.
19. **`same-runtime-negative-owner-knowledge-is-terminal`.** For each platform, mint a token in one
    runtime, locally observe that exact generation dead or latch it closed, then make the OS descriptor
    look live again. Both probe and termination retain the local negative fact, make no durable fallback
    capable of reopening it, and send no signal; fresh-runtime recovery remains separately available.
20. **`recovery-outer-deadline-bounds-every-await`.** Under one recovery-termination deadline, separately
    make the initial observer, terminator, post-signal observer and injected delay never settle. Each row
    rejects when that one bound expires, stops scheduling further work, and cannot emit a late signal or
    observation after the overdue collaborator eventually settles.
21. **`recovery-settlement-matrix-is-bounded-and-shared`.** Within the same finite recovery bound,
    separately drive observer throw, terminator throw, unavailable-after-signal, multi-poll death and
    still-live exhaustion. Assert the exact finite poll cap and delay schedule, then prove concurrent and
    every later caller share the same fulfillment or rejection without a second signal or polling loop.
22. **`detached-probe-reuses-direct-canonical-rate-limit-parser`.** Feed a full response whose nested
    optional/malformed fields distinguish the canonical parser from the detached module's current local
    copy. Assert identical `CodexRateLimitSnapshot` output through the existing channel, a direct-module
    import of the canonical parser, deletion of the local parser implementation, and no new parser export
    from `packages/agent/src/index.ts`. The pre-existing broad `{ result: {} }` row is part of this proof:
    it fulfills as live with the canonical `invalid-response` unavailable snapshot and performs no
    rejection or cleanup.

Legs 15-22 are separate hardening acceptance units even where they strengthen the same public boundary
as legs 3-5 or 12-14. A test under an earlier broad prefix, or one test title naming several hardening
ids, covers none of legs 15-22; each exact prefix needs its own discriminating assertion that fails the
pre-hardening implementation during AUTHOR_TEST.

Across all twenty-two legs, errors carry bounded diagnostic classification but no stdout/stderr or raw
protocol transcript, and the public barrel exposes only the role-neutral controller/types — no
Mintbox, Terra, claim, worktree, GPU or lane policy.

The observable is the public return value plus the fake auth, command, protocol, ownership, clock and
termination logs. The real package typecheck proves publication through `packages/agent/src/index.ts`.

## Guidance

**Leaf test acceptance (prompt-exposed).** AUTHOR_TEST and IMPLEMENT both read this whole file before
writing. The contract id in a phase prompt is an index, never a substitute for the proof walkthrough
and the full assertion below.

**One public deep module.** Author `packages/agent/src/codex-detached-app-server.ts` and publish only
the narrow role-neutral types plus `openPinnedCodexDetachedThread` and
`recoverCodexDetachedOwner` through `packages/agent/src/index.ts`. The recovery operation accepts a
persisted `CodexDetachedOwner` and returns an owner-only bounded controller exposing tri-state `probe`
and idempotent `terminate`; it cannot recreate protocol state, start a thread or turn, or read rate
limits. The module hides authentication, repo-pinned command resolution, generated v2 JSONL protocol,
request correlation, detachment, ownership, bounds and cleanup. Do not export raw child-process
objects, the generated `@openai/codex` protocol types, stdout/stderr, argv, or a transcript. Do not add
another `@openai/codex` import site outside `@storytree/agent`.

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
and its process generation were acquired. Every durable token has one strict versioned encoding and
carries host kind, embedded root pid, runtime provenance, and an immutable process-birth identity
observed from the OS. Its embedded root must equal the owner's `rootPid`. Unknown/malformed prefixes or
versions, missing/extra fields, invalid or mismatched pids, and legacy bare `pgid:<pid>` tokens are typed
unavailable before any OS call. The representation is not caller policy. The complete encoding is the
literal Contract 15 grammar: fixed `codex-owner:v1` envelope, single-letter `p`/`w` host code, exactly six
POSIX or seven Windows colon-separated fields, canonical positive decimal pid, lowercase RFC 4122 v4
runtime UUID, and non-empty canonical unpadded base64url identity fields. There is no second accepted
spelling.

On POSIX, process-group existence or a sentinel is never generation authority. Acquisition persists the
root process's immutable birth identity; every probe and termination observes it, and any observation
error is unavailable. Termination re-observes the exact same generation inside the terminal operation,
immediately before bounded `SIGTERM`; a generation change after an earlier probe sends no signal. Delete
every bare-group and sentinel fallback. A host that cannot supply immutable generation identity may fail
closed rather than weaken ownership.

On Windows, `tasklist` remains required to locate the live root but its image/pid/session row is
explicitly insufficient as generation identity. Pair it with an independent immutable process-creation
observation, persist both, and require both to match immediately before any descendant-inclusive
`taskkill /PID <root> /T /F`. The same pid and identical tasklist row with a different creation identity
is ownership lost/dead-for-controller and sends no signal, including when the change occurs after probe
but before the termination check. The Windows discriminant records only that rooted capability while
the same generation remains live; it does not claim a Job Object or durable containment. Never reuse a
numeric pid, call a Windows pid a pgid, fall back to an unowned pid, broad-kill by image name, or infer
that escaped descendants died. If ownership cannot be acquired, the open fails, closes protocol I/O,
and uses only cleanup still licensed by the just-spawned process handle or a current exact-generation
observation. Production chooses the ownership variant from the OS; a caller-supplied `platform` string
is not observation. Exact POSIX process-group termination and live-root-reachable Windows tree
termination are both production behaviours, not optional test injections.

**One controller, one process, bounded all the way down.** `startTurn`, `probe` and `terminate` operate
on the same app-server. `probe` combines exact-owner liveness with a typed rate-limit observation made
through `account/rateLimits/read` on that same channel: its live result carries the existing public
`CodexRateLimitSnapshot`, parsed from the full response by the one canonical parser in
`codex-rate-limits.ts` with `capturedAt` taken from the supplied clock. Do not duplicate that nested
parser here: it may be exported from its direct module for reuse, but not widened through the package
barrel. Canonical parser tests own the full nested-boundary matrix; detached tests own same-channel
dispatch, integration, and injected/default-clock assertions. Dead or unavailable ownership sends no
rate-limit request and carries no fabricated snapshot, so a caller can take before/after account-wide
observations without starting another app-server. Every protocol request and every cleanup wait has a
positive finite bound with a safe default. A protocol error, write error, early exit, timeout, invalid
identity or failed `startTurn` closes and rejects after performing every safe owned cleanup still
available. In particular, observed Windows root exit closes the channel but forbids a stale-pid kill.
`terminate` is concurrent-safe and idempotent: it waits for exact POSIX group death, or for Windows
root disappearance/ownership loss after any same-token live-root termination it was allowed to send,
and retains only bounded diagnostic detail. The opaque owner is durable recovery authority, not an
in-memory runtime id: after persistence, `recoverCodexDetachedOwner` in a fresh Agent runtime must
re-observe the same platform-specific root generation before reporting live or signalling it. A
runtime-local map, token prefix, bare pid or bare process-group existence is insufficient; malformed,
host-wrong, changed or unobservable ownership fails closed without a signal. Recovery never implies a
surviving JSONL channel and never upgrades Windows root disappearance into proof that escaped
descendants died. Durable recovery is only the fallback when the receiving runtime has no local
mint/closure provenance for that token. If this runtime minted the token and locally observed that
exact generation dead or latch-closed it, that negative knowledge wins permanently: neither recovery
parsing nor a later matching OS descriptor may re-open the generation, and pid reuse or a different
generation never acquires the old token's authority. Recovery termination re-observes the persisted
generation immediately before signalling and then polls through the injected delay only within one
outer bound and an exact finite poll cap. Observer/terminator errors, an unavailable observation after
signal, a still-live timeout, and even a delay that never settles reject within that bound. Multi-poll
death may fulfill. All concurrent callers and every later caller share the one settled fulfillment or
rejection; they never start a second signal or polling operation.

**The red is an assertion over existing code.** Source and test now exist and carry a signed first
green, so this `real:` arm is deliberately `editsExisting: true`. AUTHOR_TEST adds regression
assertions to the existing test file and reaches the existing public value through `./index.js`; at
least one new substantive assertion must run and fail against the current implementation. A missing
import, compile failure, deleted old assertion or type-only check is the wrong red. IMPLEMENT edits
the existing source minimally until the new assertions and every old one pass. `real.scope` retains
the implementation and barrel, and the package suite remains the explicit `proofCommand` over that
public surface. AUTHOR_TEST must migrate every existing probe expectation — including the broad
`jsonl-fragments-and-correlates-responses` test — to the public `CodexRateLimitSnapshot` semantics;
no assertion may retain the raw `account/rateLimits/read` payload as `probe().rateLimits`. Clock
ownership follows explicit injection: only a controller/runtime given a `ManualClock` may assert its
exact `capturedAt`. Every path with no injected clock uses `SYSTEM_CLOCK` and must assert a valid
contemporaneous ISO timestamp, such as one bounded by system-clock readings immediately before and
after the probe — never the manual clock's fixed epoch. The broad
`jsonl-fragments-and-correlates-responses` row already returns `{ result: {} }` for the same-channel
rate-limit request; AUTHOR_TEST must change its stale expectation so probe fulfills, leaves the channel
open, performs no cleanup, and returns exactly `{ live: true, rateLimits: { status: "unavailable",
reason: "invalid-response", detail: "account/rateLimits/read did not return a rateLimits object" } }`.
That row must not be converted into a rejection test. The next AUTHOR_TEST red must define shared
`VALID_POSIX_OWNER_TOKEN` and `VALID_WINDOWS_OWNER_TOKEN` constants with the two literal Contract 15
fixtures, plus grammar-preserving fixture helpers whose overrides still emit exactly six-field `p` or
seven-field `w` tokens. Every valid acquisition/recovery, generation re-observation and same-runtime
negative-knowledge row in Contracts 15-21 must use those constants/helpers. Short forms such as
`v1:posix:<pid>:birth`, `v1:windows:<pid>:creation:row`, bare `pgid:<pid>` and any other alternate token
belong only in malformed/rejection tables; they cannot stand in for a positive owner. AUTHOR_TEST must
also add a separately titled, substantive failing test under every exact hardening prefix in Contracts
15-22: strict token grammar, POSIX immutable birth identity, Windows tasklist-plus-creation identity,
both platforms' pre-signal generation swap, both platforms' local negative knowledge, the one outer
deadline over each await, the recovery settlement matrix, and direct canonical rate-limit parser reuse.
A failure under one prefix cannot discharge another prefix. A broad existing failure, title-only shell,
renamed old assertion, or indirect high-level assertion is not this red. It also adds a
discriminating assertion for every non-equivalent branch implicated by the latest survivor/no-coverage
report; leaving those branches for an unchanged suite to miss again is not an accepted revised test.
For Contract 12, canonical tests keep the nested parser matrix while the detached test proves the same
full response reaches that parser on the existing channel, including the exact empty-result unavailable
snapshot above; do not recreate the matrix around a copy.

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
contract. The latest refused signed verdict still produced 70 surviving mutants and 41 no-coverage
mutants; this rework ships with zero survivors and zero no-coverage mutants in changed lines, except
only a precise equivalence annotation meeting that bar.

The hardening must exercise the production defaults and their branches directly, not infer them from
high-level injected substitutes: bounded authentication and credential scrubbing, pinned detached
spawn, actual-host owner selection and acquisition, POSIX-group and Windows-tree command composition,
current-owner liveness, exact POSIX-group termination, live-root-reachable Windows termination, and
platform-qualified terminal observation. Refactor a hidden default behind a deterministic low-level
seam when that is needed to make its decisions observable, while keeping the public barrel narrow and
role-neutral. The remaining protocol, validation, timeout,
failure-cleanup, idempotence, same-app-server and fresh-runtime owner-recovery branches are subject to
the same per-mutant rule.
Strengthen or simplify source together with substantive assertions until the mutation command passes;
an assertion-title shell, a test that reaches only injected happy paths, or an annotation for a mutant
that some input could distinguish does not satisfy any of the twenty-two contracts.

**Tests.** Use `node:test` and `node:assert/strict`, with every await bounded and every fake settling
deterministically. Retain the signed tests, then add at least one substantive test for EACH of the
twenty-two exact ids below. Every title begins with exactly one id verbatim; sharing a former broad
prefix, naming several ids in one title, or keeping an old title without the new prefix covers none of
the new lines. Contracts 15-22 each require a newly authored discriminating red; pre-existing tests
under Contracts 1-14 remain regression proof but do not count for those eight. For a line that names a
matrix, every named row needs an assertion under that line's prefix — one representative case is
incomplete. Literal protocol methods, command argv and platform discriminants appear in assertions
rather than being read back from production constants. Use focused table-driven cases plus one
real-child production-composition test. Every spawned stand-in/root/descendant is reaped in `finally`,
even when an assertion fails.

## Contracts (22)

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
   - **asserts —** a positive child pid is observed as negative pgid and with an immutable OS-observed
     process-birth identity, yielding `posix-process-group` ownership rooted at that exact generation.
     Probe compares that generation; observation error is unavailable. Termination re-observes the same
     generation inside the terminal operation immediately before bounded `SIGTERM`. A generation
     change after probe sends no signal; no bare-group/sentinel fallback, bare pid, other group or image
     name is targeted. A host unable to observe immutable generation identity fails closed.
   - **covers —** POSIX arms of production ownership acquisition, liveness and termination in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `posix-group-owner-is-observed-probed-and-terminated: ...` tests whose recording
     OS seam asserts literal owner discriminant, persisted process-birth identity, signed target,
     observation-error unavailability, exact pre-signal re-observation, and generation-change TOCTOU
     with zero signal.
4. **`windows-tree-owner-is-observed-probed-and-terminated`** — the Windows production path observes
   the exact live root and terminates only its currently reachable rooted tree.
   - **asserts —** a positive child pid is inspected by `tasklist` as the exact live Windows root,
     but that image/pid/session row is insufficient alone. An independent immutable process-creation
     identity is persisted in `windows-process-tree` ownership and both observations must match inside
     termination immediately before descendant-inclusive `taskkill /PID <root> /T /F`. Root
     disappearance, creation-identity change, or a change after probe means ownership is lost; the
     controller is dead and sends no signal even when pid and tasklist row are identical. No result
     claims escaped-descendant death, a Job Object, pgid ownership or image-name ownership.
   - **covers —** Windows arms of production ownership acquisition, liveness and termination in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** `windows-tree-owner-is-observed-probed-and-terminated: ...` tests whose recording
     OS seam asserts literal discriminant, required tasklist plus independent creation observation,
     exact task-kill composition, same-row/different-creation pid reuse, and pre-signal generation-change
     TOCTOU with zero taskkill.
5. **`owner-validation-rejects-invalid-pid-root-kind-and-token`** — no invalid or mismatched process identity can become the controller's owner.
   - **asserts —** absent, zero, negative, fractional, non-finite and unsafe pids plus missing owner,
     wrong root, host-wrong kind, caller platform assertion contradicting the host, and blank/whitespace
     token each reject. Durable tokens are strict and versioned and carry host kind, embedded root pid,
     runtime provenance, and OS-observed immutable process-birth identity; malformed prefix/version/
     field count, embedded-root mismatch, and legacy bare `pgid:<pid>` report unavailable before any OS
     call. Every post-spawn row closes I/O, attempts only cleanup authorized by a current identity or
     owned handle, reaches a platform-qualified terminal observation and returns no stale-pid signal.
   - **covers —** pid and exact-owner validation before protocol staging in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** an exhaustive `owner-validation-rejects-invalid-pid-root-kind-and-token: ...`
     table with one named case and platform-qualified cleanup/terminal assertion for every listed value
     class, plus malformed durable-token rows asserting typed unavailable and zero observer/terminator
     calls.
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
      app-server and returns the existing public `CodexRateLimitSnapshot`. The detached module reuses
      the canonical full-response parser from the direct `codex-rate-limits.ts` module rather than
      carrying a second parser; this reuse does not add the parser to the package barrel. `capturedAt`
      comes from the boundary's clock. Tests using an injected `ManualClock` assert its exact timestamp;
      every controller/runtime created without an explicit clock inherits `SYSTEM_CLOCK` and asserts a
      valid contemporaneous ISO timestamp with an equivalent bounded before/after check, never a fixed
      injected epoch. Dead/unavailable starts no request, process, thread or turn and returns no
      fabricated snapshot. Every existing probe assertion expects this typed public snapshot and the
      clock actually supplied to its runtime; none expects the raw rate-limit response payload. In the
      existing broad same-channel row, `{ result: {} }` is a valid RPC response carrying an invalid
      rate-limit body: probe fulfills as `{ live: true, rateLimits: { status: "unavailable", reason:
      "invalid-response", detail: "account/rateLimits/read did not return a rateLimits object" } }`,
      leaves the channel usable and performs no cleanup rather than throwing.
    - **covers —** `CodexDetachedThread.probe`, production liveness and same-channel rate-limit dispatch
      in `packages/agent/src/codex-detached-app-server.ts`, plus canonical full-response parsing in
      `packages/agent/src/codex-rate-limits.ts`.
    - **proven by —** `probe-tristate-and-same-channel-rate-limits: ...` tests for all three liveness
      states plus a spontaneous exit, an asserted full-result-to-`CodexRateLimitSnapshot` parse with
      exact explicitly injected-clock `capturedAt`, a default-clock assertion bounded around
      `SYSTEM_CLOCK`, and a literal one-channel protocol log, plus migrated typed-snapshot and
      clock-appropriate expectations in every pre-existing probe assertion, including the broad JSONL
      correlation test and its exact `{ result: {} }` unavailable fulfillment. Existing canonical parser
      tests own the nested missing/malformed boundary matrix; detached tests prove only reuse,
      same-channel integration, and clock propagation.
13. **`termination-is-idempotent-bounded-and-confirms-death`** — termination settles once for all
    callers only after a bounded platform-qualified terminal observation.
    - **asserts —** concurrent calls and a later repeat share one terminal operation and close I/O.
      POSIX re-observes the persisted immutable root generation immediately before one exact-group
      `SIGTERM` and polls until death. Windows re-runs required tasklist plus the independent immutable
      creation observation immediately before one rooted `taskkill`, then polls until root
      disappearance. A generation that changes between probe and this pre-signal check means ownership
      is lost; the controller is dead and that generation is never signalled. Terminator error,
      observation error, bound expiry and a still-live matching owner reject rather than report cleanup;
      no Windows row claims escaped-descendant death.
    - **covers —** `CodexDetachedThread.terminate`, concurrency/idempotence, bounded platform-qualified
      terminal observation and terminal error retention in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `termination-is-idempotent-bounded-and-confirms-death: ...` tests racing calls and
      separately asserting both platforms' pre-signal generation-change TOCTOU, terminator error,
      observation error, timeout and still-live rows.
14. **`persisted-owner-recovers-across-runtime-restart`** — a fresh Agent runtime can safely probe and
    terminate the exact persisted owner without reconstructing an app-server channel.
    - **asserts —** the public `recoverCodexDetachedOwner` returns an owner-only bounded controller for
      a host-appropriate `CodexDetachedOwner`. Before any OS call it strictly decodes a versioned token
      containing host kind, embedded root pid equal to `rootPid`, runtime provenance, and OS-observed
      immutable process-birth identity; malformed prefix/version/field count, pid mismatch and legacy
      bare `pgid:<pid>` report typed unavailable with zero OS calls. POSIX live requires the same exact
      root generation, never group existence or a sentinel; observation error is unavailable and a host
      without immutable generation observation may fail closed. Windows live requires both tasklist and
      an independent immutable creation identity; the same pid and identical tasklist row with changed
      creation identity is dead-for-controller. `terminate` re-observes the exact generation inside the
      terminal operation immediately before bounded `SIGTERM` or `taskkill`; a post-probe/pre-signal
      generation change sends no signal. Cross-runtime recovery applies only when the receiving runtime
      never minted that token: stronger local closed-generation knowledge stays terminal and pid reuse
      cannot inherit authority. Dead, changed, host-wrong and unavailable rows never signal and never
      authenticate, spawn, initialize, start a thread/turn or issue a rate-limit request.
      Recovery termination has one positive finite outer bound, an exact finite poll cap, and observable
      delay schedule. Observer or terminator throws, unavailable after signal, still-live exhaustion,
      and a delay promise that never settles all reject within the outer bound; multi-poll death fulfills.
      Concurrent callers and every later caller share the one fulfillment or rejection, with no second
      signal, observer sequence or delay loop.
    - **covers —** the public owner-recovery types and `recoverCodexDetachedOwner`, plus production
      cross-runtime owner validation, observation and termination in
      `packages/agent/src/codex-detached-app-server.ts` and publication through `index.ts`.
    - **proven by —** `persisted-owner-recovers-across-runtime-restart: ...` tests that mint and
      serialize each platform owner in runtime A, discard A, and recover it in independently
      constructed runtime B. The matrix asserts strict malformed-owner rejection with zero OS calls;
      POSIX bare-group/sentinel refusal and generation-change TOCTOU with zero `SIGTERM`; Windows
      same-tasklist/different-creation reuse and pre-signal TOCTOU with zero `taskkill`; host-wrong,
      observer-throw and terminator-throw rows; unavailable after signal; multi-poll death; still-live
      timeout; exact delay count/poll cap; a hanging delay bounded by the outer timer; and concurrent
      plus later callers sharing both fulfilled and rejected outcomes. Same-runtime rows separately
      prove that a locally closed generation cannot be re-opened through durable fallback, and every
      row asserts zero authentication, process creation and protocol work.
15. **`owner-token-grammar-is-strict-versioned-and-os-silent-on-rejection`** — durable owner authority
    has one complete grammar, and invalid bytes are rejected before they can name an OS process.
    - **asserts —** POSIX accepts exactly six colon-separated fields with the grammar
      `codex-owner:v1:p:<canonical-positive-pid>:<lowercase-rfc4122-v4-runtime-uuid>:<unpadded-base64url-birth-id>`;
      Windows accepts exactly seven with
      `codex-owner:v1:w:<canonical-positive-pid>:<lowercase-rfc4122-v4-runtime-uuid>:<unpadded-base64url-creation-id>:<unpadded-base64url-tasklist-row>`.
      `codex-owner`, `v1`, and the one-letter `p`/`w` kind are literal and case-sensitive. PID text
      matches `[1-9][0-9]*`, parses to a positive safe integer, equals `rootPid`, and re-stringifies to
      exactly the input, excluding signs, zero, leading zeroes, decimals, exponents and whitespace. The
      runtime id matches lowercase RFC 4122 v4 exactly:
      `[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}`. Each identity field is
      independently non-empty canonical unpadded RFC 4648 base64url: only `[A-Za-z0-9_-]+`, never `=`,
      strict decoding must succeed, and re-encoding the decoded bytes must reproduce the field byte for
      byte. Thus invalid-length/trailing-bit aliases, padded text, standard-base64 `+`/`/`, whitespace
      and empty identities are rejected. Unknown or missing version, unknown host kind,
      missing/extra/reordered fields, trailing data, root mismatch, and every legacy or alternate
      encoding — including bare `pgid:<pid>`, `v1:posix:<pid>:birth`,
      `v1:windows:<pid>:creation:row` and unversioned Windows descriptors — return typed unavailable
      before any ownership observer, terminator, process runner or other OS collaborator is called. No
      permissive alternate decoder remains.
    - **covers —** durable-token encode/decode and recovery admission in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** an `owner-token-grammar-is-strict-versioned-and-os-silent-on-rejection: ...`
      table pins `VALID_POSIX_OWNER_TOKEN` to
      `codex-owner:v1:p:4242:123e4567-e89b-42d3-a456-426614174000:Ym9vdC0xOnN0YXJ0LTk4NzY1`
      and `VALID_WINDOWS_OWNER_TOKEN` to
      `codex-owner:v1:w:7331:9f1c2e3d-4a5b-4c6d-8e7f-0123456789ab:MTMzNzIyNjU2MDAwMDAwMDAw:Y29kZXguZXhlLDczMzEsQ29uc29sZSwx`.
      Shared fixture helpers may override their semantic fields only while producing this exact grammar.
      The table covers both valid constants and every named malformed/legacy row, asserting the typed
      result and zero calls in all OS logs for each rejection. Every positive, generation re-observation
      and same-runtime local-negative owner input in Contracts 16-21 reuses those constants/helpers;
      shortened tokens occur only in rejection rows.
16. **`posix-owner-requires-immutable-birth-identity`** — POSIX owner authority identifies a process
    birth, not merely a currently occupied process group.
    - **asserts —** acquisition persists an OS-observed immutable birth identity for the positive root
      pid beside its negative process group, and fresh recovery reports live only when that exact birth
      is observed. Bare group existence, a sentinel result, an identity-less success and any observation
      error are unavailable and cannot mint or validate authority; a host without immutable birth
      observation fails closed.
    - **covers —** POSIX owner acquisition, token minting and recovery probe in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `posix-owner-requires-immutable-birth-identity: ...` tests that distinguish two
      births at the same pid/group and separately feed bare-group, sentinel, identity-less and thrown
      observations, asserting only the exact birth is live and no fallback token is minted or accepted.
      Every valid token in these rows comes from Contract 15's shared POSIX constant/helper.
17. **`windows-owner-requires-tasklist-and-creation-identity`** — Windows owner authority requires two
    independent observations of the same root generation.
    - **asserts —** acquisition and recovery require both the exact `tasklist` image/pid/session row and
      an independent immutable process-creation identity, and persist enough information to compare
      both. A missing or malformed observation is unavailable. The same pid and identical tasklist row
      paired with a different creation identity is ownership lost/dead-for-controller and never gains
      signal authority.
    - **covers —** Windows owner acquisition, token minting and recovery probe in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** `windows-owner-requires-tasklist-and-creation-identity: ...` tests for matching
      dual observations, each missing/malformed half, and the discriminating same-tasklist/different-
      creation reuse row, with zero `taskkill` in every non-matching case. Every valid token in these
      rows comes from Contract 15's shared Windows constant/helper.
18. **`both-platforms-reobserve-generation-immediately-before-signal`** — no earlier probe licenses a
    later signal after the pid has changed generations.
    - **asserts —** POSIX and Windows termination each make a fresh immutable-generation observation
      inside the terminal operation immediately before invoking the platform terminator. In each arm,
      a persisted generation that was live during an earlier probe but changes before this final check
      becomes dead-for-controller and emits no `SIGTERM`, `taskkill` or substitute signal. The Windows
      final check still requires both tasklist and creation identity.
    - **covers —** the last observation-to-signal edge in both production termination arms in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** separate
      `both-platforms-reobserve-generation-immediately-before-signal: posix ...` and
      `both-platforms-reobserve-generation-immediately-before-signal: windows ...` tests whose ordered
      logs show live probe, swapped final generation, fresh observation and zero terminator calls, using
      only Contract 15's shared valid-token constants/helpers.
19. **`same-runtime-negative-owner-knowledge-is-terminal`** — a runtime cannot resurrect an owner it
    minted and then learned was dead or closed.
    - **asserts —** on both platforms, once the minting runtime observes that exact generation dead or
      latches its controller closed, its local negative knowledge wins over later durable-token parsing
      and a later OS descriptor that appears to match. Probe stays dead and every terminate call shares
      the terminal result with zero signal. This rule is scoped to the minting runtime and does not
      prevent a genuinely fresh runtime from using durable recovery.
    - **covers —** runtime provenance, local terminal state and the recovery fallback-selection branch
      in `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —**
      `same-runtime-negative-owner-knowledge-is-terminal: posix ...` and
      `same-runtime-negative-owner-knowledge-is-terminal: windows ...` rows for observed-dead and
      latch-closed state, followed by a matching-looking OS observation and assertions of dead probe,
      shared terminal settlement and zero signals. Every local-negative token is produced by Contract
      15's shared constants/helpers rather than a shorthand token.
20. **`recovery-outer-deadline-bounds-every-await`** — one positive finite deadline bounds the entire
    recovery termination, including collaborators that never settle.
    - **asserts —** the same outer deadline covers the initial ownership observer, platform terminator,
      every post-signal observer and every injected delay rather than restarting per await. A
      never-settling promise in each position rejects at that deadline, cancels further scheduling and
      ignores any eventual late settlement. Once the deadline wins, no later observer completion may
      cause a signal and no terminator completion may restart observation or delay work.
    - **covers —** recovery deadline normalization, await racing and post-settlement fencing in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** a `recovery-outer-deadline-bounds-every-await: ...` manual-clock table with
      never-settling initial-observer, terminator, post-signal-observer and delay rows. Each advances one
      total deadline, asserts rejection and exact pre-expiry calls, then resolves the overdue promise
      and asserts no late signal, observer, delay or second settlement. Valid owner inputs use Contract
      15's shared platform constants/helpers.
21. **`recovery-settlement-matrix-is-bounded-and-shared`** — all completing recovery paths obey one
    finite polling schedule and one memoized settlement.
    - **asserts —** observer throw, terminator throw, unavailable observation after signal and
      still-live poll exhaustion reject; death after several polls fulfills. The implementation makes
      no more than the exact finite poll cap and requested delays, never schedules a delay after the
      terminal observation, and does not reset the outer deadline per poll. Concurrent callers and
      every later caller receive the identical fulfillment or rejection without a second signal,
      observer sequence or delay loop.
    - **covers —** recovery error mapping, poll state machine, finite cap and idempotent settlement in
      `packages/agent/src/codex-detached-app-server.ts`.
    - **proven by —** a `recovery-settlement-matrix-is-bounded-and-shared: ...` matrix containing every
      named error/fulfillment/timeout row with exact observer, terminator and delay logs, plus concurrent
      and later callers for both one fulfilled and one rejected operation. Valid owner inputs use
      Contract 15's shared platform constants/helpers.
22. **`detached-probe-reuses-direct-canonical-rate-limit-parser`** — detached probing has no second
    interpretation of the Codex rate-limit response.
    - **asserts —** `codex-detached-app-server.ts` imports the canonical full-response parser directly
      from `codex-rate-limits.ts`, contains no local rate-limit field/window/bucket/full-response parser,
      and returns that parser's `CodexRateLimitSnapshot` for the same-channel response and boundary clock.
      The parser may be exported from its direct module for this reuse but is not added to
      `packages/agent/src/index.ts`; the existing public snapshot types and reader remain unchanged. The
      broad `{ result: {} }` same-channel row fulfills with `{ live: true, rateLimits: { status:
      "unavailable", reason: "invalid-response", detail: "account/rateLimits/read did not return a
      rateLimits object" } }`, keeps the channel open and performs no cleanup; it never throws merely
      because the canonical parser returns an unavailable snapshot.
    - **covers —** parser ownership and same-channel integration across
      `packages/agent/src/codex-detached-app-server.ts`,
      `packages/agent/src/codex-rate-limits.ts` and `packages/agent/src/index.ts`.
    - **proven by —** `detached-probe-reuses-direct-canonical-rate-limit-parser: ...` tests using a
      nested response with distinguishable missing and malformed optional fields, asserting exact
      parity with the direct canonical parser and supplied clock, plus a source-structure assertion
      that the detached module imports that parser, defines no local copy, and the barrel exports no
      parser symbol. The existing broad JSONL correlation row separately pins the exact `{ result: {} }`
      typed-unavailable fulfillment and zero cleanup.
