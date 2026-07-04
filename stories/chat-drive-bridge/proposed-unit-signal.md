---
id: "proposed-unit-signal"
tier: capability
story: chat-drive-bridge
title: "The non-spoofable proposed-unit signal — the agent declares a machine-actionable unit id via a typed read-only tool"
outcome: "The headless orchestrator captures a non-spoofable, machine-actionable proposed unit id — declared by the agent through a typed read-only tool, surfaced as a typed `proposedUnitId` field on the result — distinct from any human accept."
status: retired
proof_mode: integration-test
depends_on: []
# RETIRED by ADR-0155 (2026-07-04). The propose_unit tool + the proposedUnitId result field this
# capability built were removed from runHeadlessOrchestrator (PR #587): the session-orchestrator DRIVES
# via its spawn (ADR-0137) + landing (ADR-0152) tools, it no longer proposes a unit for a human to
# accept. The `real:` arm is dropped (its test packages/agent/src/proposed-unit-signal.test.ts was
# deleted with the feature), so this capability is no longer REAL-buildable. Body kept as history.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
---

# The non-spoofable proposed-unit signal

**Outcome —** The headless orchestrator captures a non-spoofable, machine-actionable proposed unit id —
declared by the agent through a typed read-only tool, surfaced as a typed `proposedUnitId` field on the
result — distinct from any human accept.

**Depends on —** nothing in-story. This is the ROOT leaf — the keystone everything downstream needs.
It REUSES the existing `packages/agent` SDK-session machinery (`buildOrientationTools`,
`runHeadlessOrchestrator`, the `createSdkMcpServer` + `tool` MCP wiring) but adds the new typed signal.

> **Proof status (honest) — `proposed`, NET-NEW signal over EXISTING machinery.** This is **ADR-0108
> Phase 3's keystone**: the conversational orchestrator can today only return a FREE-TEXT proposal
> (`HeadlessOrchestratorResult.proposal`, the SDK session's `result.result`). There is no
> machine-actionable unit id, so nothing downstream can dispatch a build without a human re-typing /
> the agent parsing prose. This capability adds the agent's STRUCTURAL declaration: a typed read-only
> `propose_unit({ unitId })` tool the agent calls to declare its proposed unit, captured as a typed
> `proposedUnitId` on the result. The signal is the agent's tool invocation, NOT a parse of the
> free-text proposal — and it is DISTINCT from the human's accept (a later click, capability 4), so the
> agent can declare but never accept.

## Guidance

**THIS BUILD — the current `--real` increment (edit-existing): the typed propose_unit tool + the
result-field capture.** Today `runHeadlessOrchestrator` wires exactly three READ tools
(`buildOrientationTools` → tree / library / noticeboard, each with an empty input schema) and captures
only the SDK session's final free text as `proposal`. What is MISSING is a machine-actionable proposed
unit id. This increment adds a FOURTH read-only tool — `propose_unit({ unitId })` — and captures the
`unitId` from its invocation onto a new `proposedUnitId` field on `HeadlessOrchestratorResult`.

- **EDIT-EXISTING, not net-new.** `headless-orchestrator.ts` and `orientation-tools.ts` EXIST; read
  them, ADD a new failing test (`packages/agent/src/proposed-unit-signal.test.ts`), then EDIT the two
  files. The red is a RUNTIME assertion on a missing result field + an unwired tool, never a
  module-not-found.
- **The tool is READ-ONLY and STRUCTURAL (the non-spoofable part).** `propose_unit` declares the
  agent's proposed unit; it performs NO write, build, sign, or land — it only records the `unitId` the
  agent passed. It is wired the SAME way the orientation tools are (`createSdkMcpServer` + `tool`, an
  `mcp__<server>__propose_unit` allowed-tool), but unlike the orientation tools it carries a TYPED
  input arg (`{ unitId: string }`) — the agent's declaration is a typed tool call the runtime records,
  not text the runtime parses. Get this wrong — scraping a unit id out of the free-text `proposal` with
  a regex — and the signal is spoofable/fragile, defeating the point (ADR-0108 d.3: the proposed-unit
  signal must be a structural declaration).
- **The capture is on the RESULT, distinct from accept — and it CAPTURES FROM THE STREAMED MESSAGE,
  not the tool handler.** Widen `HeadlessOrchestratorResult` with `proposedUnitId?: string`. CRITICAL
  capture mechanism (this changed on main 2026-06-28): the runner now inspects EVERY SDK message in its
  `for await` loop (see `extractTextDelta` + the `onMessage` trace seam in the current
  `headless-orchestrator.ts`). Capture the proposed id the SAME way — add an `extractProposedUnit(message)`
  helper, mirroring `extractTextDelta`, that structurally narrows a `tool_use` message naming
  `propose_unit` and returns its `unitId` input (else `null`); in the loop, record the LAST non-null id
  and fold it onto the result. **Do NOT capture via the MCP tool's handler** — the offline proof injects
  a scripted `queryFn` that only YIELDS messages and never executes MCP handlers, so a handler-recorded
  id would never fire in the test (the assertion would stay RED forever). Loop-inspecting the streamed
  `tool_use` works for BOTH the scripted test AND the live SDK (which also streams the assistant's
  `tool_use` block through the same loop). A session that never emits a `propose_unit` tool_use returns
  `proposedUnitId: undefined` — no forged id, no default. This field is the agent's PROPOSAL; the human's
  ACCEPT is a separate later act (a UI click, capability 4) — this capability never accepts anything.
- **The RED the spine observes:** the new test drives `runHeadlessOrchestrator` with an injected
  `queryFn` whose scripted session emits a `tool_use` message for `propose_unit` with
  `{ unitId: "some-unit" }`, then a success `result`. It asserts `res.proposedUnitId === "some-unit"`.
  At HEAD there is no `proposedUnitId` field and no `propose_unit` tool → `res.proposedUnitId` is
  `undefined` → red. ASSERT THE TYPED FIELD, never just `res.ok`: `ok` is already green at HEAD and
  would fail CONFIRM_RED.
- **The GREEN:** after the tool is wired + the field captured, `res.proposedUnitId === "some-unit"`
  holds; a control session that calls no `propose_unit` returns `proposedUnitId: undefined`; the
  package suite + typecheck stay green.

WHY THIS IS A CAPABILITY (not a contract): its honest proof spans the SDK-SESSION WIRING AS A WHOLE —
the read-only tool is registered on the MCP surface, the scripted session's `tool_use` dispatches to
its handler, the handler records the arg, and the runner folds the recorded id onto the result. That
crosses the tool surface AND the runner's result extraction, so it is an integration test of the
agent-session machinery (the SDK `query()` scripted), not a single isolated assertion. Its contracts
are the isolated leaf behaviours under it.

READ-ONLY THROUGHOUT (ADR-0091 / the Phase-1 wall this inherits): adding `propose_unit` does NOT add
write authority. There is still no `Write`/`Edit`/`Bash` tool; `propose_unit` declares an intention, it
does not act. The agent holds no signing key and hands in no verdict — the proposed id is a PROPOSAL the
human later accepts, never a build the agent triggers. Get this wrong — having `propose_unit` itself
dispatch a build — and you have collapsed the propose/accept separation ADR-0108 d.3 requires.

THE SIGNAL IS DISTINCT FROM THE ACCEPT (ADR-0108 d.3): the agent DECLARES a proposed unit id (this
capability); the human ACCEPTS it with an explicit non-spoofable click (capability 4,
`accept-to-land-affordance`). Keeping them separate is what makes the human gate real — the agent
cannot manufacture the accept by declaring. This capability produces the declaration ONLY.

OFFLINE-TESTABLE BY INJECTION: the test drives the runner with an injected `queryFn` scripted double
(an async iterable emitting a `tool_use` then a `result` message), so the tool wiring + the capture are
proven WITHOUT a live SDK run on every gate pass (ADR-0010 §5). The live run (a real `query()` whose
session calls `propose_unit`) is the story's operator-attested leg.

## Integration test

**Goal —** Prove that a scripted session's invocation of the typed read-only `propose_unit({ unitId })`
tool is captured as a typed `proposedUnitId` on `HeadlessOrchestratorResult` — read-only, structural,
and distinct from any accept.

The integration test exercises this capability against its **real in-package machinery** — the real
`runHeadlessOrchestrator` with the real `createSdkMcpServer` + `tool` MCP wiring and the real
`buildOrientationTools` surface — with an injected `queryFn` scripted double (no live SDK spend,
ADR-0010 §5). It is an integration test, not a contract, because it spans the tool registration, the
scripted `tool_use` dispatch, and the runner's result fold.

The integration test would:

1. Drive `runHeadlessOrchestrator` with an injected `queryFn` whose scripted session emits a `tool_use`
   message naming `propose_unit` with `{ unitId: "demo-unit" }`, then a success `result` message
   carrying a free-text proposal.
2. Assert the result is `{ ok: true, proposal: <text>, proposedUnitId: "demo-unit", costUsd, turns }` —
   the id came from the tool invocation, captured onto the typed field.
3. Assert the free-text `proposal` is STILL surfaced (the signal is additive — it does not replace the
   prose proposal) and that `proposedUnitId` was NOT derived by parsing that prose (the test's prose
   contains no unit id / a different token, so a regex-scrape would fail).
4. A session that emits a `result` but NEVER calls `propose_unit` → `proposedUnitId` is `undefined`
   (no forged id, no default) — the absence of a declaration is honest.
5. Assert the surface is still READ-ONLY: no `Write`/`Edit`/`Bash` tool is exposed, and `propose_unit`
   itself performs no write/build/sign (its handler only records the arg) — adding the signal added no
   authority (ADR-0091).
6. Two `propose_unit` calls in one session → the LAST id wins (a single coherent proposal per session),
   deterministically.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** (`node:test`, the
`@storytree/agent` suite), the SDK `query()` injected as a scripted double. Contract 1 is the
keystone — the FIRST drivable leaf of this story.

> **COVERAGE CONVENTION — REQUIRED, or the verdict reads 0/4 (ADR-0122 / ADR-0126).** The
> contract-coverage classifier is STRUCTURAL: a contract is "covered" only when some test's NAME
> carries the contract id as a whole token (the convention `test("<contract-id>: …")` /
> `describe("<contract-id>: …")`) AND that test asserts something SUBSTANTIVE. A descriptive-only test
> name (e.g. `test("captures the proposed id")`) leaves the contract UNCOVERED even though the
> behaviour is tested — a signed green then over-claims. So author **one named, substantive test per
> contract below**, its name beginning with the contract id, and ASSERT ALL FOUR — including
> `pus-tool-is-read-only` (the ADR-0091 wall: it must be a real assertion that the surface exposes no
> `Write`/`Edit`/`Bash` tool and `options.tools` is `[]`, not merely that `propose_unit` is present).
> Target: **4/4 covered.**

1. **`pus-captures-tool-declared-unit-id`** — the tool's `unitId` arg becomes `proposedUnitId`
   - **asserts —** when the scripted session invokes `propose_unit({ unitId })`, the runner surfaces
     that `unitId` on `HeadlessOrchestratorResult.proposedUnitId` — the id is the agent's structural
     declaration, captured from the typed tool arg.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the result fold) +
     `packages/agent/src/orientation-tools.ts` (the propose_unit tool) *(provisional paths)*
2. **`pus-signal-not-parsed-from-prose`** — the id is structural, not scraped
   - **asserts —** `proposedUnitId` is derived ONLY from the tool invocation, never from parsing the
     free-text `proposal` — a session whose prose contains a different/no token still yields the
     tool-declared id (or `undefined` when no tool call), proving the signal is non-spoofable by prose.
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the capture path)
3. **`pus-absent-declaration-is-undefined`** — no declaration → no id
   - **asserts —** a session that returns a `result` but never calls `propose_unit` yields
     `proposedUnitId: undefined` — no default, no forged id; the free-text `proposal` is still
     surfaced (the field is additive).
   - **covers —** `packages/agent/src/headless-orchestrator.ts` (the default/absence path)
4. **`pus-tool-is-read-only`** — the new tool adds no authority
   - **asserts —** the tool surface still exposes NO `Write`/`Edit`/`Bash` tool after `propose_unit` is
     added, and `propose_unit`'s handler performs no write/build/sign — it only records the arg
     (read-only, ADR-0091); the proposed id is a PROPOSAL, never an accept or a build trigger.
   - **covers —** `packages/agent/src/orientation-tools.ts` (the read-only tool set) +
     `packages/agent/src/headless-orchestrator.ts` (the allowed-tools / no-write construction)

## Guidance — the edit-existing slice that earns the signed verdict

The brownfield rung toward `healthy` (ADR-0057 §3, EDIT-EXISTING): `headless-orchestrator.ts` +
`orientation-tools.ts` already landed (ADR-0108 Phase 1) and are real. This increment EDITS them to add
the typed `propose_unit` read-only tool + the `proposedUnitId` capture, test-first.

- **The new test —** `packages/agent/src/proposed-unit-signal.test.ts` (`node:test` +
  `node:assert/strict`). Import `{ runHeadlessOrchestrator }` from `"./headless-orchestrator.js"`.
  Build a scripted `queryFn` (an `async function*` matching `SdkQueryFn`) that yields a `tool_use`
  message for `propose_unit` then a success `result` message — the SAME scripted-session pattern
  `headless-orchestrator.test.ts` already uses, extended with a `tool_use` frame. NO real SDK.
- **The RED the spine observes (before IMPLEMENT) —** the files EXIST, so the red is a RUNTIME
  assertion, not module-not-found: assert `res.proposedUnitId === "<declared id>"`. At HEAD there is no
  such field and no `propose_unit` tool → `undefined` → red. (Asserting a bare `res.ok` would be GREEN
  at HEAD and fail CONFIRM_RED — assert the TYPED field.)
- **The GREEN —** EDIT `packages/agent/src/orientation-tools.ts` to add a read-only `propose_unit` tool
  carrying a typed `{ unitId: string }` input (advertised so the LIVE agent can call it; its handler is
  a no-op record/return — it performs no write/build/sign), and EDIT
  `packages/agent/src/headless-orchestrator.ts` to (a) register the tool on the MCP surface + its
  allowed-tool name, and (b) ADD an `extractProposedUnit(message)` helper (mirroring the existing
  `extractTextDelta`) that pulls `unitId` from a streamed `propose_unit` `tool_use` message, capturing
  the LAST one in the `for await` loop and folding it onto a new
  `HeadlessOrchestratorResult.proposedUnitId?: string`. The capture is from the STREAMED MESSAGE (works
  under the scripted `queryFn`), NOT the handler (which never runs under a scripted queryFn). Then the
  typed assertion passes; a no-call control returns `undefined`; the package suite + typecheck stay green.

Rules:

- **Edit, don't fork** — the existing orientation tools + runner are untouched except for the additive
  `propose_unit` tool + the additive result field. The three read tools and the free-text `proposal`
  still work exactly as before.
- **Structural, not parsed** — the id comes from the typed tool arg, never a regex over the prose
  (`pus-signal-not-parsed-from-prose`). This is the non-spoofable property ADR-0108 d.3 requires.
- **Read-only, no authority added** — `propose_unit` declares; it does not act (`pus-tool-is-read-only`,
  ADR-0091). No write tool exists; the agent holds no key. PROVE it: a test named
  `pus-tool-is-read-only: …` that captures the session `options` and asserts `options.tools` is `[]`
  and no allowed tool matches `Write`/`Edit`/`Bash`.
- **Name every test for its contract (coverage convention)** — each contract gets one substantive
  test whose name begins with the contract id, so the ADR-0122/0126 classifier reads 4/4 (a
  descriptive-only name reads UNCOVERED — the gap that makes a signed green over-claim).
- **Stay in `@storytree/agent`** — the write scope is one package (ADR-0087). Do NOT edit
  `@storytree/drive` here; the threading onto `orchestrate`/`startChatStream` is capability 2.
