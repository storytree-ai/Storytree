---
id: "orientation-tool-surface"
tier: capability
story: headless-orchestrator
title: "A read-only in-process orientation tool surface — the three surfaces wrapped, no write tool"
outcome: "A read-only in-process tool surface exposes the three storytree orientation commands to a model, each returning a real envelope body, with NO write tool and writes structurally impossible."
status: proposed
proof_mode: integration-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. NET-NEW (the status quo, no editsExisting): the
# leaf authors a regression test that imports a NOT-YET-EXISTING symbol from a NEW source file (the red
# is a missing-symbol / module-not-found against the source that does not exist at HEAD), then writes
# that one new source file (green). `install: true` + a typecheck wall because the new module lives in
# @storytree/agent and the test imports it through the package (the proof runs in a fresh worktree —
# tsx + tsc need the lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`), so the
# default node:test proof on the one test file is legal — no `proofCommand`.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/orientation-tools.test.ts"
    sourceFile: "packages/agent/src/orientation-tools.ts"
    scope:
      testGlobs: ["packages/agent/src/orientation-tools.test.ts"]
      sourceGlobs: ["packages/agent/src/orientation-tools.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
---

# A read-only in-process orientation tool surface

**Outcome —** A read-only in-process tool surface exposes the three storytree orientation commands to
a model, each returning a real envelope body, with NO write tool and writes structurally impossible.

**Depends on —** *(none — a root capability: the read-tool surface, no in-story upstream)*

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code (the whole
> `headless-orchestrator` story is authored before implementation). The tool surface, its tests, and
> the integration test below are specs awaiting implementation, not a recording of something green.
> The collaborators it wraps are real and already exist: `run(argv, deps)`
> (`packages/cli/src/commands.ts`) — the single dispatch returning an `Envelope` per surface — and the
> in-process MCP tool pattern (`createSdkMcpServer` + `tool`, `packages/agent/src/sdk-author.ts`).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the read-only tool surface AS A WHOLE —
each orientation tool, when called, dispatches to the REAL storytree read command and returns its
`Envelope` body, AND the surface exposes no write tool, AND a write verb reached through it is refused.
"Each surface returns a real body" needs the real `run()` dispatch behind it (an integration test);
the individual read-only-ness invariants are contract-testable (below).

WHY THIS IS THE ROOT: it imports no other in-story capability. It is the leaf the runner wires into the
SDK session. It is `runSdkCurator`'s missing half — the curator needs no tools (its data is serialized
into the prompt), but the orchestrator must ORIENT by *calling* read tools.

THE TOOLS ARE READ-ONLY BY CONSTRUCTION (ADR-0108 Phase 1 / ADR-0004): the surface wraps ONLY the read
commands — `tree` (the work hierarchy, read off the `stories/` filesystem via `deps.storiesDir`),
`library` / `library artifact <id>` (knowledge, read off the in-memory seed `store`), and
`noticeboard` (session presence, live store). There is NO `Write`/`Edit`/`Bash` tool in the surface
(unlike `ClaudeAgentAuthor`'s `LEAF_TOOLS = ["Read","Write","Edit","Glob","Grep"]` — the orchestrator
gets NONE of the write tools). Belt-and-braces: the surface constructs its `run()` deps with
`writable: false`, so even if a write verb were somehow routed, the `notWritable` guard
(`packages/cli/src/commands.ts`, fronting `artifact new`/`edit`/`retire`, `sync-agents`/`sync-corpus`,
`noticeboard declare`, `uat attest`, `adr new`) refuses it — the agent cannot act, write, build, sign,
or land. Get this wrong — exposing a write tool or a `writable: true` deps — and you have handed the
read/propose-only agent the power to act, the exact Phase-1 wall this capability enforces.

THE ENVELOPE IS THE TOOL RESULT (ADR-0023 §4): each tool runs its read command and returns the
`Envelope` body (the result text + `doctrine`/`next` pointers) as the tool's text result, so the agent
reads exactly what the terminal session reads. Source the body from `formatEnvelope` (or the
`Envelope.body`) — do NOT scrape stdout.

OFFLINE-TESTABLE BY INJECTION: the surface takes the read-command runner as an injected callback (the
wrapped `run(argv, deps)`), so the integration test drives it with the REAL `run()` over an
`InMemoryStore` seed + the real `stories/` corpus — no DB, no live SDK. The `noticeboard` surface needs
the live store (presence has no offline seed), so the OFFLINE proof exercises the `tree` + `library`
tools (which read the filesystem corpus + the in-memory seed) and the live board tool is exercised in
the Story UAT live leg.

## Integration test

**Goal —** Prove that the read-only orientation tool surface, wired to the REAL `run()` dispatch over
the real seed corpus, exposes each surface as a callable tool returning a real envelope body — and
exposes NO write tool, with writes structurally refused.

The integration test exercises this capability against its **real in-story collaborators** — the real
`run(argv, deps)` dispatch over an `InMemoryStore` seed (`loadCorpus`) + the real `stories/` corpus
(`storiesDir`), constructed `writable: false` — with **no stubs within the organism**. It is an
integration test, not a contract, because it spans the tool surface AND the real read dispatch
producing the bodies.

The integration test would:

1. Build the orientation tool surface over a `writable: false` deps (`InMemoryStore` + `loadCorpus`,
   the real `stories/` corpus as `storiesDir`).
2. Enumerate the tools → exactly the read surfaces are present (`tree`, `library`, and the board), and
   NO `Write`/`Edit`/`Bash`/write tool appears in the surface.
3. Call the `tree` tool → it returns the real work-hierarchy envelope body (the story list / a focused
   tree), sourced from the real filesystem corpus, not a stub.
4. Call the `library` tool (and `library artifact <id>` for a real seed id) → it returns the real
   dashboard / artifact body off the in-memory seed.
5. Attempt to reach a WRITE verb through the surface (e.g. construct the args for `artifact edit` and
   route them through the surface's runner) → it is REFUSED by the `notWritable` guard (an `ok: false`
   envelope with `next` guidance), never executed — proving the surface is structurally read-only even
   if a write were attempted.
6. A read command that legitimately MISSES (unknown artifact id, bad category) → returns an `ok: false`
   envelope with `next` (guidance, not a thrown crash) as its tool result — the agent can adapt.

## Contracts (5)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/agent` suite), collaborators stubbed. None exist yet; each is the assertion a contract test
WILL prove against the real surface code once authored (the file is named provisionally — re-cite at
real `file:line` when built).

1. **`ots-exposes-exactly-the-read-surfaces`** — the surface lists the three orientation tools and no
   more
   - **asserts —** the built surface's tool names are exactly the orientation read surfaces (`tree`,
     `library`, the board) — a fixed, enumerated set — and the count matches (no extra tool leaks in).
   - **covers —** `packages/agent/src/orientation-tools.ts` (the tool list) *(provisional path)*
2. **`ots-has-no-write-tool`** — no write/act tool is in the surface
   - **asserts —** none of `Write`, `Edit`, `Bash` (nor any write-verb tool) appears in the surface's
     tool names — the orchestrator gets NONE of `ClaudeAgentAuthor`'s write tools.
   - **covers —** `packages/agent/src/orientation-tools.ts` (the read-only tool set)
3. **`ots-constructs-non-writable-deps`** — the surface's read deps are write-incapable
   - **asserts —** the deps the surface builds for `run()` carry `writable: false` (or absent), so the
     CLI's `notWritable` guard fronts every write verb — writes are refused by construction, not by
     convention.
   - **covers —** `packages/agent/src/orientation-tools.ts` (the deps construction)
4. **`ots-tool-returns-envelope-body`** — a tool call returns the read command's envelope body
   - **asserts —** invoking a tool with a stubbed runner that yields a known `Envelope` returns that
     envelope's `body` (with `doctrine`/`next` rendered) as the tool's text result — the tool is a thin
     wrapper over the read dispatch, owning no formatting of its own beyond the envelope.
   - **covers —** `packages/agent/src/orientation-tools.ts` (the tool handler)
5. **`ots-miss-is-guidance-not-throw`** — a missed read returns guidance, never throws
   - **asserts —** when the runner yields an `ok: false` envelope (unknown id / bad category), the tool
     returns it as a non-throwing result (the `next` guidance present), never propagating a throw into
     the SDK session — the same envelope contract `fs-tools.ts` tool results use.
   - **covers —** `packages/agent/src/orientation-tools.ts` (the fail-soft path)

## Guidance — the net-new slice that earns the signed verdict

The brownfield bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the read-only orientation
tool surface as a new module, test-first.

- **The new test —** `packages/agent/src/orientation-tools.test.ts` (`node:test` +
  `node:assert/strict`, the package convention). Import `{ buildOrientationTools }` (or the chosen
  factory name) from `"./orientation-tools.js"`.
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING — `orientation-tools.ts`
  does not exist at HEAD, so the test fails with a module-not-found (the net-new missing-symbol red,
  ADR-0057). Assert, against an injected runner double that yields a known `Envelope`, that the surface
  (a) lists exactly the read surfaces, (b) exposes NO write tool, and (c) returns the envelope `body` as
  a tool result.
- **The GREEN —** write `packages/agent/src/orientation-tools.ts`: a factory that takes the injected
  read-command runner (the wrapped `run(argv, deps)`) and returns the read-only tool descriptors
  (`{ name, description, run }`, the `ClaudeAgentAuthor` feedback-command shape — a fixed command per
  surface, the agent controls only the surface's own query args). NO write tool; the deps it builds for
  `run()` carry `writable: false`. After it, the import resolves, the assertions hold, and the package
  suite + typecheck stay green.

Rules:

- **READ-ONLY is the invariant — author it that way.** The surface must NOT construct any `Write`/
  `Edit`/`Bash` tool, and must NOT build a `writable: true` deps. The test pins both (`ots-has-no-write-tool`,
  `ots-constructs-non-writable-deps`).
- **The tool is a thin wrapper over `run()`** — it owns no read logic of its own; it routes the
  surface's args through the injected runner and returns the envelope body. Do not re-implement any
  read command in this module.
- **Fail soft, never throw into the session** — a missed read is an `ok: false` envelope returned as a
  tool result, the envelope contract `fs-tools.ts` already uses.
