---
id: "arc-explicit-id-fidelity"
tier: capability
story: cli
title: "Explicit arc ids are never silently shortened"
outcome: "An agent scaffolding an arc with an explicit id receives a refusal instead of creating an arc under a silently truncated id."
status: proposed
proof_mode: integration-test
depends_on: [unified-command-dispatch]
# DELIVERED red→green BY THE SPINE (2026-08-09 correction, ADR-0139 correct-in-place): the `--real` build
# run `real-msgbv0z0` was promoted as the spine-authored commit "storytree real build real-msgbv0z0:
# arc-explicit-id-fidelity (authored by the gated leaf)", and promotion happens only on a SIGNED PASS
# verdict (`promoteRealPass`), so the gate did observe this red→green. At HEAD packages/cli/src/arc.ts
# carries `ARC_ID_CAP = 60`, a `normalizeExplicitId` helper (the shared `kebabSlug` normalisation MINUS its
# truncating slice, so the caller measures the normalised length BEFORE any cap is applied) and the
# pre-store refusal itself, whose own comment names this capability's contract id
# `arc-explicit-id-refuses-lossy-cap`; the regression is present and passing in
# packages/cli/src/cli.test.ts. The authored `status: proposed` above is the BASELINE the node rollup
# augments from that signed verdict — it is NOT a claim the work is unbuilt, and it is not flipped here
# because `healthy` is non-authorable (ADR-0020) and `mapped` would falsely deny the gate-driven proof. A
# re-run of this node must start from a genuine red; the red it WAS built against was a 61-character
# normalised explicit id, which the shared slug helper cut to 60 characters, letting creation continue
# under a different id.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/cli.test.ts"]
    sourceGlobs: ["packages/cli/src/arc.ts"]
  real:
    testFile: "packages/cli/src/cli.test.ts"
    sourceFile: "packages/cli/src/arc.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/cli/src/cli.test.ts"]
      sourceGlobs: ["packages/cli/src/arc.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/cli", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/cli", "test"]
---

# Explicit arc ids are never silently shortened

**Outcome —** An agent scaffolding an arc with an explicit id receives a refusal instead of creating
an arc under a silently truncated id.

**Depends on —** [`unified-command-dispatch`](unified-command-dispatch.md)

## Guidance

`arc new <id>` treats the explicit id as authored. It normalises that value first, then refuses it
before any store read or write when the normalised result exceeds the 60-character id cap. A
normalised explicit id of exactly 60 characters remains accepted, and an id derived from `--title`
retains its existing capped derivation.

The behavioural red this capability was built against was a 61-character normalised explicit id: the
shared slug helper cut it to 60 characters and let creation continue under a different id. The
regression lives on the canonical coverage surface, `packages/cli/src/cli.test.ts`, and passes at
HEAD; it proves zero store interaction before any verification read by counting `getDoc` alone and
reading back through `queryDocs`, so the verification read cannot inflate the count it is checking.
Test-owned probes must never contaminate the call ledger whose emptiness proves the refusal happened
pre-store.

## Integration test

**Goal —** Drive the real `arcNew` path with an explicit id whose normalised value exceeds the cap and
witness a refusal before store interaction, while pinning the exactly-60 boundary, normalisation
before length checking, and the retained cap for title-derived ids.

## Contracts (1)

1. **`arc-explicit-id-refuses-lossy-cap`** — `arc new` refuses an explicitly authored id that normalises beyond the 60-character cap rather than creating an arc under a truncated id
   - **asserts —** The explicit id is normalised before its length is checked; a normalised value over 60 characters returns `ok:false` before any store read or write, a value of exactly 60 remains accepted, and title-derived ids retain their existing capped derivation. Zero interaction is asserted before any verification read, or verification bypasses the spy; test-owned probes must not enter the call ledger.
   - **covers —** `packages/cli/src/arc.ts` (`arcNew`, explicit-id selection before store access)
   - **proven by —** `packages/cli/src/cli.test.ts` — the three `arc-explicit-id-refuses-lossy-cap: …`
     cases, passing at HEAD against `arcNew` / `normalizeExplicitId` / `ARC_ID_CAP` / `arcIdFromTitle` in
     `packages/cli/src/arc.ts`, one per behaviour this contract asserts:
     - **over the cap → refused pre-store** — drives a 61-character explicit id through the real `arcNew`
       path and asserts `ok:false`, a refusal naming the cap it exceeded, zero counted `getDoc` calls, and
       no arc written under either the typed id or its truncated form.
     - **exactly 60 → accepted, under the id as typed** — the boundary the refusal must not swallow.
     - **title-derived ids keep their capped derivation** — a title normalising past the cap still
       CREATES, with the slug core capped before the `-arc` suffix and asserted structurally (a prefix of
       the normalised title) rather than against a golden string.

     The red for the first — that case against a source where the shared slug helper truncated the
     overlength id and let creation proceed under the altered id — WAS observed by the spine before the
     refusal was added, and the resulting signed pass promoted the build (`--real` run `real-msgbv0z0`).
     The other two are a hand-landed coverage backfill over behaviour that already shipped, so no genuine
     red existed to drive and forcing one would have been theater (ADR-0085/0097); each was instead
     verified by MUTATION — `>` → `>=` at the cap reds only the exactly-60 case, and leaking the refusal
     onto the derived id reds only the title case, while the original case stays green through both.
