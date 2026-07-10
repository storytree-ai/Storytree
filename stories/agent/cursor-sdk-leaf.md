---
id: "cursor-sdk-leaf"
tier: capability
story: agent
title: "A read-only Cursor SDK handshake normalizes one account-valid local run"
outcome: "The agent organism probes Cursor as a second live harness through an account-discovered model and a local read-only plan-mode run whose identity, output, tool activity, timing, usage, and failures are normalized into Storytree-owned data."
status: mapped
proof_mode: integration-test
depends_on: [phase-author-seam]
---

# The Cursor SDK leaf — Rung A read-only handshake

**Outcome —** The agent organism probes Cursor as a second live harness through an
account-discovered model and a local read-only plan-mode run whose identity, output, tool activity,
timing, usage, and failures are normalized into Storytree-owned data.

> **Proof status (honest) — `mapped`, with no operator-attested live leg claimed.**
> `cursor-handshake.test.ts` passes offline through the injected `CursorHandshakeClient`, run, and
> clock seams. It proves the Rung A decisions without credentials or network access; it does not
> attest a paid/authenticated Cursor call and has no signed verdict, so it is not `healthy`.

This is only ADR-0177 **Rung A**, the read-only admission probe. It depends on
`phase-author-seam` because it tests whether Cursor can become a second runtime behind that boundary,
but it deliberately does not implement `PhaseAuthor`. It grants the local session only plan mode
against the caller-injected `cwd`, loads no ambient setting sources, prefixes the prompt with a
read-only instruction, and discovers the selected model from the caller's account response rather
than assuming a cross-account model id.

The boundary is explicit: this capability does **not** deliver Rung B, `CursorPhaseAuthor`, write or
shell authority, a runtime selector, `ProveSpec` / `proveUnit` changes, spine-observed red/green, or
authenticated operator attestation.

## Proof

**Goal —** Exercise one Cursor handshake entirely through the injected runtime seam and observe an
honest Storytree-owned result without granting authoring authority.

1. Inject a client whose model catalogue contains an account-available model with a declared default
   variant, plus a scripted local session/run and deterministic clock.
   **Success —** the handshake selects only that discovered model and default parameters, then creates
   the session in `mode: "plan"` with the exact injected `cwd` and `settingSources: []`.
2. Stream assistant text and tool-call events, then finish the scripted run with terminal identity,
   model, duration, and token usage.
   **Success —** the result records runtime, agent/run/model identity, text, normalized tool events,
   wall-clock latency, runtime duration, and usage when the run supplies it.
3. Repeat with model-discovery or send failure, then with an error/cancelled terminal result or a
   stream exception after the run starts.
   **Success —** pre-run failures normalize as `failure: "startup"`; failures after a run exists
   normalize as `failure: "terminal"` while preserving the observations already collected.

The standing proof is `packages/agent/src/cursor-handshake.test.ts` against
`packages/agent/src/cursor-handshake.ts`, run by `pnpm --filter @storytree/agent test`. The injected
`CursorHandshakeClient`, `CursorHandshakeSession`, `CursorHandshakeRun`, and clock keep every
assertion offline and deterministic.

## Contract

1. **`cursor-model-is-account-discovered`** — The handshake selects a model only from
   `Cursor.models.list()` data supplied by the runtime edge, preserving the first model's declared
   default variant parameters and failing startup when the account returns no models.
   - **asserts —** no model id or parameters are invented from a hard-coded cross-account list.
   - **proven by —** the model-selection and no-model cases in
     `packages/agent/src/cursor-handshake.test.ts`.
2. **`cursor-handshake-is-local-read-only-plan-mode`** — The created local Cursor session receives
   the caller-injected `cwd`, `mode: "plan"`, no ambient setting sources, and a read-only prompt
   prefix.
   - **asserts —** Rung A receives no Storytree write surface and is not represented as a
     `PhaseAuthor`.
   - **proven by —** the successful handshake case in
     `packages/agent/src/cursor-handshake.test.ts`.
3. **`cursor-handshake-normalizes-observations-and-failure-stage`** — A started run returns
   Storytree-owned runtime, agent/run/model identity, text, tool events, latency, optional runtime
   duration, and optional usage; failures distinguish startup from terminal stage.
   - **asserts —** terminal failures retain observations collected before failure, while discovery,
     creation, and send failures cannot masquerade as terminal runs.
   - **proven by —** the success, startup-failure, terminal-status, and stream-exception cases in
     `packages/agent/src/cursor-handshake.test.ts`.
