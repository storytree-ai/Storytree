---
id: "codex-detached-app-server"
tier: contract
story: agent
capability: live-codex-leaf
arc: mintbox-event-driven-orchestration-arc
title: "Stage one authenticated pinned Codex thread in an exactly owned detached process before any turn starts"
outcome: "A caller can open one authenticated repo-pinned Codex app-server, observe its response-resolved thread/model/effort and exact platform-honest process ownership before work starts, then use that same bounded controller to start a turn, probe it, and terminate its whole owned tree idempotently."
status: proposed
proof_mode: contract-test
depends_on: []
decisions: [11, 232, 561]
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
then use that same bounded controller to start a turn, probe it, and terminate its whole owned tree
idempotently.

## Why this is a contract under `live-codex-leaf`

The proof-mode boundary decides the tier. This behaviour has no standalone integrated journey: its
honest proof replaces subscription auth, the child process, JSONL protocol, clock, OS ownership and
tree termination with injected collaborators and asserts one public boundary. That is one isolated
automated behaviour — a contract — inside the independently viable live-Codex capability. A seventh
capability would be a shallow boundary over the same `codex-*` runtime surface and would still need
the same stubs. The contract adds no capability edge: any helper it reuses from `codex-author.ts` or
`codex-rate-limits.ts` is inside `live-codex-leaf`, and no other capability's delivered outcome is a
precondition.

The seam is deliberately role-neutral. It knows Codex subscription authentication, protocol identity
and exact process ownership; it knows nothing about Mintbox, Terra, claims, worktrees, lane limits,
graphics, GPUs, or whether a caller should accept the observed identity.

## Proof walkthrough

Extend the existing `packages/agent/src/codex-detached-app-server.test.ts`; do not replace its signed
happy-path assertion. Use recording low-level adapters for protocol fault cases and a real long-lived
stand-in child for the production process-composition cases. No test spends a Codex turn, contacts a
database, or reaches the network. Each numbered leg below is one independently coverable contract and
has its own required test-title prefix; no single broad happy-path title satisfies another leg.

1. **`production-defaults-authenticate-before-detached-spawn`.** Exercise the production defaults,
   omitting the public high-level `authRunner`, app-server
   `spawn`, ownership observer and tree terminator overrides. Put a deterministic stand-in beneath the
   production command/process seam: its `login status` mode reports the exact ChatGPT-managed result;
   its `app-server --stdio` mode stays alive, speaks the required JSONL, and starts a descendant that
   also stays alive. Observe that the default path really runs the bounded login process, then spawns
   one detached app-server with a positive OS pid. It must not return an `unavailable` placeholder or
   acquire ownership through a no-op. Terminate it and independently observe both root and descendant
   dead before the test exits.
2. **`staged-protocol-returns-response-produced-identity`.** Keep the existing staged happy path and
   make the order exact: auth completes before spawn;
   initialize -> initialized -> ephemeral thread/start occurs; no turn/start occurs during open; and
   response model/effort deliberately differ from the request. Assert identity from the response,
   not merely truthiness, and assert the spawned pid and owner root are the same positive safe integer.
3. **`platform-owner-distinguishes-posix-group-from-windows-tree`.** Exercise both ownership branches.
   The POSIX branch owns and terminates the exact process group; the
   Windows branch owns and terminates the exact rooted process tree (the low-level command is scoped
   to that root and includes descendants). Production chooses the branch from the actual OS — caller
   input cannot relabel it. Assert literal discriminants, the exact target, and confirmed death. A
   Windows root pid is never returned or acted on as a POSIX pgid, and neither branch broad-kills by
   executable name.
4. **`invalid-protocol-identity-and-turn-fail-closed`.** Table-drive invalid configuration, staged
   identity and turn start. An absent, zero, negative, fractional,
   non-finite or unsafe pid refuses; a missing owner, wrong root, wrong platform variant or blank owner
   token refuses; and a missing/non-object thread, blank thread id/model/reasoning effort, wrong-shaped
   initialize/thread response, RPC error, malformed/non-object JSONL, wrong response id, write error,
   spawn error, timeout or early exit refuses. A zero, negative, `NaN` or infinite timeout never
   disables the bound: it resolves to the safe positive default and the injected clock observes that
   bound fire. Auth refusal still spawns nothing; every case after spawn performs exact bounded cleanup
   and independently confirms death before rejecting. For `startTurn`, blank input, write failure, RPC
   error, malformed result, wrong/missing turn id or status, timeout and process exit each reject. No
   case starts a second app-server. Every failed
   start after the staged process exists closes the protocol, terminates the exact owner once, waits
   for observed death, and leaves later `probe` unable to claim the lane is live.
5. **`probe-reads-os-liveness-and-same-app-server-limits`.** Make `probe` obtain liveness from the
   current OS ownership observation, not from the absence of a
   local `terminate()` call. Before termination, return live only while that exact owner is observed
   alive and read rate limits through the same initialized app-server. Simulate/observe spontaneous
   process exit without calling `terminate`; the next probe returns not-live (and does not manufacture
   a successful rate-limit read). An unavailable or failed liveness observation is typed unavailable,
   never guessed live.
6. **`termination-reaps-the-exact-owned-tree-and-confirms-death`.** Call `terminate` twice concurrently
   and again after it settles. Production termination must close
   protocol I/O, invoke the real platform terminator, and wait within its bound until the exact owner
   is observed dead. A default no-op terminator is forbidden. All calls share one terminal result; a
   termination command failure, timeout, or still-live postcondition rejects fail-closed rather than
   reporting successful cleanup.
Across all six legs, errors carry bounded diagnostic classification but no stdout/stderr or raw
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
was acquired and observed for that child; `windows-process-tree` only when a Windows-owned tree/job
rooted at that child was acquired and observed. The token may be persisted but its representation is
not caller policy. Never call a Windows pid a pgid, never fall back to an unowned bare pid, and never
broad-kill by image name. If exact ownership cannot be acquired, the open fails and cleans up the
just-spawned child within the same bound. Production chooses the ownership variant from the OS; a
caller-supplied `platform` string is not observation. POSIX process-group termination and Windows
rooted-tree termination are both production behaviours, not optional test injections.

**One controller, one process, bounded all the way down.** `startTurn`, `probe` and `terminate` operate
on the same app-server. `probe` combines exact-owner liveness with a typed rate-limit observation made
through `account/rateLimits/read` on that same channel, so a caller can take before/after account-wide
observations without starting another app-server. Every protocol request and every cleanup wait has a
positive finite bound with a safe default. A protocol error, write error, early exit, timeout, invalid
identity or failed `startTurn` terminates the owned tree before rejecting. `terminate` is concurrent-
safe and idempotent, waits for observed death, and retains only bounded diagnostic detail.

**The red is an assertion over existing code.** Source and test now exist and carry a signed first
green, so this `real:` arm is deliberately `editsExisting: true`. AUTHOR_TEST adds regression
assertions to the existing test file and reaches the existing public value through `./index.js`; at
least one new substantive assertion must run and fail against the current implementation. A missing
import, compile failure, deleted old assertion or type-only check is the wrong red. IMPLEMENT edits
the existing source minimally until the new assertions and every old one pass. `real.scope` retains
the implementation and barrel, and the package suite remains the explicit `proofCommand` over that
public surface.

**The mutation result selects the regressions; it is not a score gate.** Against the signed source and
test pair, the mutation rung generated 291 mutants: 150 killed, 99 survived and 41 had no coverage
(51.5% whole-file mutation score, 60.0% among covered mutants, 85.9% reach). No percentage in that
observation is an acceptance threshold. Its useful evidence is the clustered blind spot: one injected
POSIX happy path could stay green while production auth returned a canned refusal, production
ownership/termination were absent or no-op, Windows was unobserved, invalid timeout/pid/owner/identity/
protocol/RPC/exit/startTurn branches changed, cleanup stopped short of confirmed death, and `probe`
called any never-terminated handle live. The re-drive adds assertions for those exact behaviours; it
does not chase equivalent or irrelevant mutants to inflate a number. The first re-drive confirmed the
contract-line problem rather than resolving it: its signed proof added only one blank-owner-token test,
moved the whole-file reading from 51.5% to 53.7%, left all 99 survivors, and left 39 mutants without
coverage. Those figures set no target. They show that one broad contract id let coverage remain 1/1
while five independent behaviours still had no required test title, which is why this revision splits
the assertion into six lines.

**Tests.** Use `node:test` and `node:assert/strict`, with every await bounded and every fake settling
deterministically. Retain the signed tests, then add at least one substantive runtime test for EACH of
the six exact ids below. Its title begins with that id verbatim; sharing the former broad prefix or
naming several ids in one title does not cover the missing lines. Literal protocol method names and
platform discriminants appear in assertions rather than being read back from production constants.
Use focused table-driven cases inside the owning test where useful, plus one real-child production-
composition test. Every spawned stand-in/root/descendant is reaped in `finally`, even when an
assertion fails.

## Contracts (6)

1. **`production-defaults-authenticate-before-detached-spawn`** — production defaults perform the bounded subscription-auth probe before starting one real detached app-server.
   - **asserts —** calling `openPinnedCodexDetachedThread` without high-level auth/spawn/ownership/
     termination overrides runs the real bounded `codex login status` adapter with metered credentials
     scrubbed, admits only the exact ChatGPT-managed result, and only then spawns exactly one detached
     repo-pinned `app-server --stdio` with a positive OS pid; auth refusal or timeout spawns nothing;
     the defaults never return a canned `unavailable`/logged-out result and never substitute a no-op
     spawn or owner adapter. A deterministic stand-in beneath the production process seam proves this
     without a subscription turn.
   - **covers —** the production auth and detached-spawn composition used by
     `openPinnedCodexDetachedThread` in `packages/agent/src/codex-detached-app-server.ts`, reached through
     `packages/agent/src/index.ts`.
   - **proven by —** a substantive
     `production-defaults-authenticate-before-detached-spawn: ...` test in
     `packages/agent/src/codex-detached-app-server.test.ts` that omits every high-level override and
     observes the stand-in login process before the detached app-server process.
2. **`staged-protocol-returns-response-produced-identity`** — opening stages an ephemeral thread without work and returns only the app-server response's identity.
   - **asserts —** the one app-server receives initialize -> initialized -> ephemeral thread/start and
     no turn/start during open; a response whose thread id/model/reasoning effort deliberately differ
     from requested values is returned verbatim beside the spawned positive pid; requested defaults,
     argv, exit status and caller prose are never accepted as identity; and neither the public result
     nor a bounded error contains stdout/stderr or a raw protocol transcript.
   - **covers —** request ordering/correlation and `ThreadStartResponse` parsing in
     `packages/agent/src/codex-detached-app-server.ts` plus the public return shape in
     `packages/agent/src/index.ts`.
   - **proven by —** a substantive
     `staged-protocol-returns-response-produced-identity: ...` test in
     `packages/agent/src/codex-detached-app-server.test.ts` whose response intentionally contradicts
     its request and whose protocol log asserts the exact pre-turn order.
3. **`platform-owner-distinguishes-posix-group-from-windows-tree`** — process ownership is selected from the OS and never confuses a POSIX group with a Windows tree.
   - **asserts —** a positive safe child pid on POSIX yields an observed opaque
     `posix-process-group` rooted at that pid, while Windows yields an observed opaque
     `windows-process-tree` rooted at that pid; production selects the branch from the actual OS rather
     than caller input; missing ownership, a blank token, wrong root, wrong discriminant, or an absent/
     zero/negative/fractional/non-finite/unsafe pid refuses and cleans up; a Windows root is never
     surfaced or terminated as a pgid, and neither branch broad-kills by executable name.
   - **covers —** pid validation, platform selection and owner acquisition/validation in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** distinct substantive
     `platform-owner-distinguishes-posix-group-from-windows-tree: ...` POSIX and Windows cases in
     `packages/agent/src/codex-detached-app-server.test.ts`, including the invalid pid/owner table.
4. **`invalid-protocol-identity-and-turn-fail-closed`** — malformed staging or turn-start observations reject and clean up the owned process instead of guessing success.
   - **asserts —** malformed/non-object JSONL, wrong response id, initialize/thread/start/turn/start RPC
     errors, wrong-shaped or blank thread identity, blank turn prompt, wrong/missing turn id or status,
     write/spawn error, invalid timeout, request timeout and early exit each refuse; invalid timeout
     input cannot disable the safe positive bound; auth refusal remains pre-spawn; and every failure
     after spawn closes protocol I/O, invokes cleanup for only the exact acquired owner, waits for
     independently observed death, and leaves no later path able to report that process live.
   - **covers —** timeout normalization, JSONL/RPC dispatch, identity validation, `startTurn`, and all
     post-spawn failure exits in `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** one or more table-driven
     `invalid-protocol-identity-and-turn-fail-closed: ...` tests in
     `packages/agent/src/codex-detached-app-server.test.ts` covering every named refusal class and its
     exact cleanup/death postcondition.
5. **`probe-reads-os-liveness-and-same-app-server-limits`** — probe reports current owner liveness and account limits from the existing app-server, never local intent.
   - **asserts —** each probe observes the exact OS owner at call time and reports live only when that
     observation says live; spontaneous exit without any `terminate()` call therefore yields not-live,
     while unavailable/failed liveness is typed unavailable rather than guessed live; only a live
     owner receives bounded `account/rateLimits/read` on the already-initialized app-server; probe
     starts no thread, turn or second process and does not manufacture a successful limit result for a
     dead/unobservable owner.
   - **covers —** `CodexDetachedThread.probe` and its liveness/rate-limit request path in
     `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** a substantive
     `probe-reads-os-liveness-and-same-app-server-limits: ...` test in
     `packages/agent/src/codex-detached-app-server.test.ts` that changes OS liveness without calling
     terminate and asserts both the dead and unavailable cases plus the one-process protocol log.
6. **`termination-reaps-the-exact-owned-tree-and-confirms-death`** — termination is concurrent-safe, idempotent, bounded, exact-tree, and successful only after observed death.
   - **asserts —** concurrent and repeated terminate calls share one terminal operation; production
     closes protocol I/O, invokes the real OS terminator exactly once for the returned POSIX group or
     Windows rooted tree including descendants, and waits within a positive finite bound until that
     owner is independently observed dead; it never broad-kills or targets another pid; a missing/no-op
     default, termination command failure, timeout, or still-live postcondition rejects fail-closed
     rather than reporting successful cleanup.
   - **covers —** `CodexDetachedThread.terminate`, production POSIX/Windows termination, idempotence,
     and death confirmation in `packages/agent/src/codex-detached-app-server.ts`.
   - **proven by —** a substantive
     `termination-reaps-the-exact-owned-tree-and-confirms-death: ...` test in
     `packages/agent/src/codex-detached-app-server.test.ts` that races repeated calls, observes one
     exact termination, and separately covers terminator failure, bound expiry and still-live refusal.
