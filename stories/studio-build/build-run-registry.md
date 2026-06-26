---
id: "build-run-registry"
tier: capability
story: studio-build
title: "Build-run registry"
outcome: "A server-side build run accumulates its coarse transcript and reaches a terminal verdict, with one build at a time."
status: "proposed"
proof_mode: "integration-test"
depends_on: []
---

# Build-run registry

**Outcome —** A server-side build run accumulates its coarse transcript and reaches a terminal
verdict, with one build at a time.

**Depends on —** *(none — a root capability: the in-memory run lifecycle, no in-story upstream)*

> **Proof status (honest) — NOT BUILT.** This precedes the code (the whole `studio-build` story is
> authored before implementation). The registry, its tests, and the integration test below are
> specs awaiting implementation, not a recording of something green. The build-path collaborator it
> drives (`nodeBuild --live`, `packages/drive/src/node-build.ts`) already exists and is real.

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the LIFECYCLE — create a run, feed it
streamed lines as the worker drives a build, land a terminal verdict — exercised against the real
build-path entry (`nodeBuild`) so the registry's transcript accumulation and terminal transition are
proven end-to-end, not just as isolated pure functions. The single-build-at-a-time refusal and the
transcript cap are individually contract-testable (below), but "a run accumulates the worker's lines
and terminalises on the real envelope" needs the worker driving it — that is the integration test.

WHY NOT A STORY: it has no operator-facing outcome of its own — it is the server-side state organ
the API and UI lean on. No browser, no HTTP, no model: just the run lifecycle and its transcript.

THE WORKER IS THE SINGLE ORCHESTRATOR BOUNDARY (ADR-0090 d.2 / ADR-0004): the registry SPAWNS the
EXISTING build path — `nodeBuild(unitId, { live: true, … })` — it does NOT re-implement the gate,
the spine, or the leaf. The registry's job is purely: hold run state, capture the coarse progress
the build emits, and record the terminal envelope. It owns no proof logic; `proveUnit` (in the
drive-machinery story) still observes red→green and signs. Get this wrong — duplicating any gate
logic in the registry — and you have a second, unproven proof path (the exact forge risk ADR-0091's
"no verdict is ever handed in" forbids).

COARSE, NOT RAW (owner's call): the transcript is a capped list of phase/progress LINES (e.g. the
phase trail, a per-phase status, the final verdict line) — NOT the raw model token stream. Source
the lines from the build's existing structured output (the phase trail `result.phasesVisited`, the
envelope `liveLeafLines`, the verdict line) rather than scraping stdout. Cap the line count and the
per-line length so a runaway build cannot grow the in-memory buffer unbounded.

SINGLE BUILD AT A TIME (Phase 1): the registry refuses to create a second run while one is
non-terminal. This is a deliberate Phase-1 simplification (one operator, own machine) — multi-run
concurrency is later-phase work and must NOT be designed in now. The refusal is a typed result the
API maps to 409, never a thrown 500.

IN-MEMORY BY DESIGN (Phase 1): run state lives in the server process only — there is no DB table for
runs. The DURABLE artifact is the signed verdict the build itself persists to `events.verdict` (via
`nodeBuild`'s `--store pg`), which the world already reads. The registry's transcript is ephemeral
progress, gone when the dev server restarts — that is correct for Phase 1 and must be stated so a
later phase that wants durable run history knows it is net-new.

NO HARNESS QUIRK: the build-path entry is async and (for `--live`) billed; the integration test
drives it with an injected scripted `PhaseAuthor` (the offline test seam `nodeBuild` already
supports via the resolve path / `authorOverride`, ADR-0010 §5) so the lifecycle is proven WITHOUT a
live SDK run on every gate pass. The live run is the story's human-witness UAT action.

## Integration test

**Goal —** Prove that a build run, driven by the real build-path entry, accumulates its coarse
transcript and reaches a terminal signed-verdict state — with a concurrent build refused.

The integration test exercises this capability against its **real in-story collaborators** — the
real `nodeBuild` drive entry (with an injected scripted `PhaseAuthor` so no live SDK spend, ADR-0010
§5) and an in-memory verdict store — with **no stubs within the organism**. It is an integration
test, not a contract, because it spans the registry AND the real build drive producing the lines and
the terminal envelope.

The integration test would:

1. Create a run for a real buildable node id (e.g. a `drive-machinery` node) via the registry's
   `createRun(unitId)` → it returns a fresh `runId` and the run is in a non-terminal `building`
   state with an empty transcript.
2. Drive the build through the real entry against that run (the worker spawn): the registry feeds the
   build's progress into the run's transcript as the scripted walk advances AUTHOR_TEST → … → GATE.
3. Assert the transcript grew with COARSE lines — the phase trail is present, in order — and did NOT
   capture a raw token stream.
4. While the build is mid-flight (before terminalisation), attempt `createRun(...)` again → it is
   REFUSED with the single-build typed result (not a throw), and the running run is untouched.
5. On completion assert the run is TERMINAL with the final build envelope attached: a `passed`
   status, the verdict line / signer / phase trail, and the run's `runId` matching the verdict's.
6. Assert the transcript is capped: feeding more lines than the cap retains only the most recent (or
   head+tail) up to the limit — the in-memory buffer cannot grow unbounded.
7. Drive a FAILING build (a scripted author that yields a closed-fail at a phase) → the run
   terminalises `failed` with the failure reason in the envelope, still single-build-respecting.

## Contracts (6)

The test-proven leaf behaviours — each **one isolated automated test** (vitest, the studio suite),
collaborators stubbed. None exist yet; each is the assertion a contract test WILL prove against the
real registry code once authored (the file is named provisionally — re-cite at real `file:line` when
built).

1. **`brr-create-run-mints-building-run`** — createRun mints a fresh non-terminal run
   - **asserts —** `createRun(unitId)` returns a unique `runId`, registers a run whose status is the
     non-terminal `building`, whose `unitId` matches, and whose transcript starts empty; two calls
     (after the first terminalises) yield distinct ids.
   - **covers —** `apps/studio/server/buildRegistry.ts` (createRun) *(provisional path)*
2. **`brr-refuses-concurrent-build`** — a second run while one is live is refused, not thrown
   - **asserts —** with a non-terminal run present, `createRun(...)` returns the typed
     `{ ok: false, reason: 'a build is already running' }` (or equivalent) and does NOT register a
     second run; once the first run terminalises, `createRun` succeeds again.
   - **covers —** `apps/studio/server/buildRegistry.ts` (the single-build guard)
3. **`brr-append-line-accumulates-coarse-transcript`** — appended lines accumulate in order
   - **asserts —** appending coarse lines to a run appends them to that run's transcript in order,
     each line trimmed/normalised to a single display line, and they are readable back by `runId`.
   - **covers —** `apps/studio/server/buildRegistry.ts` (appendLine)
4. **`brr-transcript-capped`** — the transcript never grows unbounded
   - **asserts —** appending more than the cap (N) lines retains exactly the cap (most-recent, or a
     documented head+tail), and a single over-long line is truncated to the per-line limit — proving
     the in-memory buffer is bounded.
   - **covers —** `apps/studio/server/buildRegistry.ts` (the cap)
5. **`brr-terminal-passed-carries-envelope`** — completing a run lands the terminal envelope
   - **asserts —** marking a run complete with a pass envelope sets status `passed`, attaches the
     verdict line / signer / phase trail, makes the run terminal (no further appends accepted), and
     unblocks the next `createRun`.
   - **covers —** `apps/studio/server/buildRegistry.ts` (terminalise)
6. **`brr-terminal-failed-carries-reason`** — a failed run terminalises with its reason
   - **asserts —** marking a run failed sets status `failed`, attaches the failure phase + reason
     (no signed verdict), is terminal, and unblocks the next `createRun` — a build failure is an
     honest terminal state, never a 500 swallow.
   - **covers —** `apps/studio/server/buildRegistry.ts` (terminalise-fail)
