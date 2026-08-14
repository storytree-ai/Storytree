---
id: "arc-explicit-id-fidelity"
tier: capability
story: arc
title: "Explicit arc ids are never silently shortened"
outcome: "An agent scaffolding an arc with an explicit id receives a refusal instead of creating an arc under a silently truncated id."
status: proposed
proof_mode: integration-test
# A REFINEMENT of `arcNew`, which `arc-derived-initiative-view` owns — so the edge is declared, and
# 2026-08-14 is the first date on which it COULD be. It used to read `[unified-command-dispatch]`
# under a `cli` home; ADR-0369 moved this unit's source into `@storytree/arc` and this spec into
# `stories/arc`, where the capability it actually refines is finally a SIBLING. The direction was
# already settled and recorded in prose the other way round: `arc-derived-initiative-view` says
# "that capability is a `proposed` refinement OF this one's `arcNew`, so the arrow runs from it to
# this, never back. Declaring the reverse would put a cycle in the story graph." This is that arrow,
# authored. Depending on a sibling with no `real:` arm is the shape this unit already had — its
# previous target, `unified-command-dispatch`, has none either — so `story build`'s topo order
# handles it exactly as before.
depends_on: [arc-derived-initiative-view]
# DELIVERED red→green BY THE SPINE (2026-08-09 correction, ADR-0139 correct-in-place): the `--real` build
# run `real-msgbv0z0` was promoted as the spine-authored commit "storytree real build real-msgbv0z0:
# arc-explicit-id-fidelity (authored by the gated leaf)", and promotion happens only on a SIGNED PASS
# verdict (`promoteRealPass`), so the gate did observe this red→green. At HEAD packages/arc/src/arc.ts
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
#
# THE SOURCE MOVED PACKAGES AND THE TEST DID NOT — the split is real, and it is why this unit's proof
# block names two suites (ADR-0369 D1). `arcNew` is now `packages/arc/src/arc.ts`; the three
# `arc-explicit-id-refuses-lossy-cap` regressions stayed in `packages/cli/src/cli.test.ts` and BELONG
# there, because they drive the real dispatcher end-to-end — `run(["arc","new",…])` through the CLI
# binary over a counting store — rather than calling `arcNew` directly. Moving them into
# `@storytree/arc` would have made this a narrower test of a function instead of the integration it is.
# So the write scope now spans two packages, and the proof command must observe both halves:
# `--filter @storytree/cli test` runs the three declared regressions (the contract below), and
# `--filter @storytree/arc test` runs `arc.test.ts`'s 51 cases, the only standing suite that holds the
# REST of `arc.ts` — the file this unit's IMPLEMENT phase is scoped to WRITE. A single `@storytree/cli`
# filter would leave a write scope partially unobserved, which is the same "each half sees something
# the other cannot" argument `arc-derived-initiative-view` used to carry. That argument did not
# disappear in the extraction; it MOVED to the unit whose files are now the split ones.
#
# THE LANDLORD RULE IS SATISFIED, NOT SIDESTEPPED (ADR-0192, and this is the reason the move was not
# optional). Unlike its two siblings, this unit HAS a `real:` arm, so `readUnitSourceFiles` DOES read
# it and rules 5/6 DO fire over its `sourceFile` + literal `sourceGlobs`. Leaving it in `stories/cli`
# while its source sat in `packages/arc` would have made `cli` a story hosted in another story's
# building — refused by the packages-forward rule (rule 6) REGARDLESS of any declared edge, because
# `cli` is not in the frozen `hostedStories.register`. Only `sourceFile`/`sourceGlobs` are read, never
# `testFile`/`testGlobs`, so the `packages/cli` test file above trips nothing.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/arc", "--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/cli.test.ts"]
    sourceGlobs: ["packages/arc/src/arc.ts"]
  real:
    testFile: "packages/cli/src/cli.test.ts"
    sourceFile: "packages/arc/src/arc.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/cli/src/cli.test.ts"]
      sourceGlobs: ["packages/arc/src/arc.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/arc", "--filter", "@storytree/cli", "typecheck"]
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/arc", "--filter", "@storytree/cli", "test"]
---

# Explicit arc ids are never silently shortened

**Outcome —** An agent scaffolding an arc with an explicit id receives a refusal instead of creating
an arc under a silently truncated id.

**Depends on —** [`arc-derived-initiative-view`](arc-derived-initiative-view.md) — this capability
refines the explicit-id selection inside that capability's `arcNew`, so it builds on it and never the
reverse. The edge was already argued, from the other end: that capability's spec has long said the
arrow runs from this one to it, "never back. Declaring the reverse would put a cycle in the story
graph." It could not be AUTHORED until 2026-08-14, because until
[ADR-0369](../../docs/decisions/0369-the-arc-domain-owns-its-own-package-and-the-arrow-runs-arc-t.md)
the two lived in different stories and a capability's `depends_on` names siblings only. It formerly
read `unified-command-dispatch` — a `cli` capability, now neither a sibling nor a real dependency:
`@storytree/cli` depends on `@storytree/arc` and not the reverse, and the `Envelope` this verb returns
comes from `@storytree/drive`.

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

**Where the two halves live, since ADR-0369 split them across packages.** The behaviour is
`packages/arc/src/arc.ts`; the regression is `packages/cli/src/cli.test.ts`. That is not drift — the
test drives `run(["arc","new",…])` through the real CLI binary, so it is an integration test of the
dispatcher-to-verb path and belongs on the CLI's surface. The consequence is that this unit's proof
command names BOTH suites; the frontmatter states why a single filter would leave part of its own
write scope unobserved.

## Integration test

**Goal —** Drive the real `arcNew` path with an explicit id whose normalised value exceeds the cap and
witness a refusal before store interaction, while pinning the exactly-60 boundary, normalisation
before length checking, and the retained cap for title-derived ids.

## Contracts (1)

1. **`arc-explicit-id-refuses-lossy-cap`** — `arc new` refuses an explicitly authored id that normalises beyond the 60-character cap rather than creating an arc under a truncated id
   - **asserts —** The explicit id is normalised before its length is checked; a normalised value over 60 characters returns `ok:false` before any store read or write, a value of exactly 60 remains accepted, and title-derived ids retain their existing capped derivation. Zero interaction is asserted before any verification read, or verification bypasses the spy; test-owned probes must not enter the call ledger.
   - **covers —** `packages/arc/src/arc.ts` (`arcNew`, explicit-id selection before store access)
   - **proven by —** `packages/cli/src/cli.test.ts` — the three `arc-explicit-id-refuses-lossy-cap: …`
     cases, passing at HEAD against `arcNew` / `normalizeExplicitId` / `ARC_ID_CAP` / `arcIdFromTitle` in
     `packages/arc/src/arc.ts`, one per behaviour this contract asserts:
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
