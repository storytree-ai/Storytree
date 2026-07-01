---
id: "accept-reject-suggestion-api"
tier: capability
story: library-review
title: "An owner/admin accepts or rejects a suggestion through the API; transitions are enforced"
outcome: "The studio API exposes accept/reject for a suggestion: an owner/admin POST drives open→accepted (applying the proposed edit to the document through the admin asset-write path) or open→rejected (closing it), the route refuses re-deciding a closed suggestion (409), and a missing suggestion is a 404 — the suggestion state machine surfaced over HTTP."
status: proposed
proof_mode: integration-test
depends_on: [suggestion-edit-store]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a NEW
# server handler + its NEW route registration in apps/studio/server (mirroring the writeBroker /
# uatVerdict route pattern) and a NEW vitest test. The RED the spine observes is a module-not-found /
# missing-symbol red: the test imports the not-yet-existing handler (e.g. handleSuggestionDecision) and
# drives an in-memory/stub suggestion backend through accept/reject — failing at HEAD because the
# handler does not exist (the net-new red, ADR-0057). The handler is exercised in ISOLATION over a stub
# backend (the writeBroker.test.ts discipline: handler-level, no DB, no http server) so the proof is
# offline + deterministic.
#
# CRITICAL — apps/studio is VITEST, not node:test (apps/studio/vitest.config.ts includes
# server/**/*.test.ts under environment node). resolveProveSpec's DEFAULT real proof command is
# `node --import tsx --test <file>` (node:test), which CANNOT run a vitest `describe/it/expect` server
# test. So like chat-panel, this cap MUST declare a `real.proofCommand` that runs the ONE test file
# under VITEST (cwd = apps/studio, package-relative path). install: true (fresh-worktree tsx + tsc +
# vitest, ADR-0031 §2) + a typecheck wall (the handler imports the studio's server types + the new
# @storytree/library/store suggestion surface).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    testFile: "apps/studio/server/suggestionDecisionApi.test.ts"
    sourceFile: "apps/studio/server/suggestionApi.ts"
    scope:
      testGlobs: ["apps/studio/server/suggestionDecisionApi.test.ts"]
      sourceGlobs: ["apps/studio/server/suggestionApi.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # apps/studio is vitest (environment node), NOT node:test — the default `node --test` real proof
    # cannot run this `.test.ts`. Run the ONE test file under vitest (cwd = apps/studio).
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "server/suggestionDecisionApi.test.ts"
---

# An owner/admin accepts or rejects a suggestion through the API; transitions are enforced

**Outcome —** The studio API exposes accept/reject for a suggestion: an owner/admin POST drives
open→accepted (applying the proposed edit to the document through the admin asset-write path) or
open→rejected (closing it), the route refuses re-deciding a closed suggestion (409), and a missing
suggestion is a 404 — the suggestion state machine surfaced over HTTP.

**Depends on —** [`suggestion-edit-store`](suggestion-edit-store.md) — the route reads/writes the
suggestion record and drives its pure `applySuggestionTransition` state machine; it couples to that
store's surface and its transition guard.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. The studio server has no
> suggestion route today. The leaf authors `apps/studio/server/suggestionApi.ts` (a handler mirroring
> the `writeBroker` / `uatVerdict` handlers) + its registration in the route table, proven by an
> isolated vitest handler test over a stub suggestion backend (the `writeBroker.test.ts` pattern).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the accept/reject HANDLER as a whole — a
behavioural server handler that, given an owner/admin decision on a suggestion, reads the record, runs
the pure transition, on ACCEPT applies the proposed edit to the document through the existing admin
asset-write path, persists the closed suggestion, and maps the outcomes to status codes (200 decided /
409 already-closed / 404 missing) — spanning the read, the transition, the apply-on-accept, and the
HTTP mapping over a scripted backend, not a single isolated assertion.

THE BACKEND IS THE STORE + THE ASSET-WRITE PATH (the collaborators). The handler calls the suggestion
store (cap 2) for the record + the transition, and on ACCEPT calls the EXISTING asset-write path
(`LibraryBackend.updateAsset` — `apps/studio/server/libraryBackend.ts:603`) to apply the proposed prose
to the document. It does NOT invent a new write path; accepting a suggestion is "apply this edit as the
owner would have" through the admin write that already exists. In the isolated test both are scripted
as stubs (the `writeBroker.test.ts` discipline) so the proof is offline.

THE TRANSITION GUARD IS THE STORE'S, SURFACED AS HTTP. The handler does not re-implement the state
machine — it calls `applySuggestionTransition` (cap 2) and maps its refusal (a closed suggestion) to a
409, a missing record to a 404, and a successful decision to a 200 carrying the updated suggestion. The
"who may decide" gate is NOT here — that is `member-suggest-write-policy` (cap 4), which 403s a member
before this handler runs. This cap proves the STATE-TRANSITION + APPLY behaviour, assuming an authorized
caller (the test drives an authorized decision); the policy cap proves the role wall.

INTEGRITY ON ACCEPT (the apply is faithful). Accepting applies the suggestion's `proposed` prose to the
targeted block of the document — the test asserts the asset-write stub was called with the proposed
content, so the route is proven to APPLY the proposal, not merely flip a status. Rejecting closes the
suggestion WITHOUT touching the document (the asset-write stub is NOT called) — a rejected proposal
leaves the doc untouched.

OFFLINE-TESTABLE AT THE HANDLER LAYER (the `writeBroker.test.ts` discipline). The test exercises the
handler directly over stub backends (a fake suggestion store + a fake asset-write), no DB, no `node:http`
server, no IAP — `describe/it/expect` under vitest (environment node). A sibling INTEGRATION test over a
real `node:http` server (the `writeBrokerApi.integration.test.ts` pattern) is a legitimate later add but
is NOT this cap's net-new proof (slow growth — the handler behaviour is the unit).

## Integration test

**Goal —** Prove that the accept/reject handler drives a suggestion's state machine over HTTP: an
authorized accept flips open→accepted AND applies the proposed edit through the asset-write path; an
authorized reject flips open→rejected and leaves the document untouched; re-deciding a closed
suggestion is a 409; a missing suggestion is a 404 — entirely over scripted backends, no DB.

The integration test exercises this capability against its **real in-story collaborator** — the real
`applySuggestionTransition` (cap 2) wired into the handler, over stub suggestion-store + asset-write
backends (the `writeBroker.test.ts` pattern). No stubs within the handler's own logic. It would:

1. Drive an authorized ACCEPT on an `open` suggestion → assert the handler responds 200 with the
   suggestion now `accepted` (`decidedBy`/`decidedAt` stamped) AND the asset-write stub was called with
   the suggestion's `proposed` prose for the targeted block (the proposal is APPLIED, not just flipped).
2. Drive an authorized REJECT on an `open` suggestion → assert 200 with the suggestion now `rejected`
   AND the asset-write stub was NOT called (the document is untouched).
3. Drive an ACCEPT (or REJECT) on an ALREADY-`accepted` suggestion → assert 409 (the closed-suggestion
   guard, surfaced from `applySuggestionTransition`'s refusal); nothing re-applied.
4. Drive a decision on a NON-EXISTENT suggestion id → assert 404; the asset-write stub not called.
5. (Optional, slow-growth) a decision whose body is malformed (no action / unknown action) → 400 (the
   shape wall), nothing applied.

## Contracts (4)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/server/suggestionDecisionApi.test.ts`), the suggestion store + asset-write scripted as
stubs. None exist yet; each is the assertion a contract test WILL prove once authored (re-cite at real
`file:line` when built). Per ADR-0122 each contract id leads a distinctly-named test so `storytree
coverage accept-reject-suggestion-api` reports 4/4.

1. **`ars-accept-applies-and-closes`** — accepting applies the proposed edit and closes the suggestion
   - **asserts —** an authorized accept on an `open` suggestion responds 200 with the suggestion
     `accepted` (decider/timestamp stamped) and the asset-write path was called with the `proposed`
     prose for the targeted block — the proposal is applied to the document, not merely flagged.
   - **covers —** `apps/studio/server/suggestionApi.ts` (the accept branch) *(provisional path)*
2. **`ars-reject-closes-without-touching-the-doc`** — rejecting closes the suggestion and leaves the doc untouched
   - **asserts —** an authorized reject on an `open` suggestion responds 200 with the suggestion
     `rejected` and the asset-write path was NOT called — a rejected proposal never mutates the document.
   - **covers —** `apps/studio/server/suggestionApi.ts` (the reject branch) *(provisional path)*
3. **`ars-closed-suggestion-is-409`** — re-deciding a closed suggestion is refused
   - **asserts —** a decision on an already-`accepted` (or `rejected`) suggestion responds 409 (the
     closed-suggestion guard from `applySuggestionTransition`), and nothing is re-applied to the document.
   - **covers —** `apps/studio/server/suggestionApi.ts` (the transition-refusal → 409 mapping) *(provisional path)*
4. **`ars-missing-suggestion-is-404`** — a decision on an unknown suggestion is a 404
   - **asserts —** a decision targeting a non-existent suggestion id responds 404 and the asset-write
     path is not called.
   - **covers —** `apps/studio/server/suggestionApi.ts` (the not-found mapping) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the handler as a new server module,
test-first.

- **The new test —** `apps/studio/server/suggestionDecisionApi.test.ts` (vitest, `describe/it/expect`,
  environment node — the studio server convention; script the suggestion store + asset-write as stubs,
  the `writeBroker.test.ts` discipline; NO DB, NO `node:http` server, NO IAP). Import the handler from
  `"./suggestionApi"`. Name each test for its contract id (`ars-…`) so `storytree coverage` reports 4/4
  (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `suggestionApi.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/server/suggestionApi.ts`: a handler that reads the suggestion via
  the backend, runs `applySuggestionTransition` (cap 2), on accept calls the asset-write path with the
  `proposed` prose for the targeted block, persists the closed suggestion, and maps outcomes to
  200/409/404 (`HttpError` the studio uses). Register it in the route table (mirroring the
  `/api/write-broker` mount). After it, the import resolves, the assertions hold, and `pnpm --filter
  studio test` + `pnpm --filter studio typecheck` stay green.

Rules:

- **Apply on accept, never on create** — the proposed edit reaches the document only when an owner/admin
  ACCEPTS, through the existing admin asset-write path; rejecting never touches the document.
- **The transition guard is the store's** — call `applySuggestionTransition`; map its refusal to 409, a
  missing record to 404. Do NOT re-implement the state machine here.
- **The role wall is cap 4, not here** — this cap assumes an authorized caller; `member-suggest-write-policy`
  403s a member before the handler runs. Keep the "who may decide" gate out of this handler.
- **Handler-level proof** — exercise the handler over stub backends (offline, deterministic); a real
  `node:http` integration test is a legitimate later add, not this cap's net-new.
