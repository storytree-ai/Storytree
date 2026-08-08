---
id: "packages-forward-refusal"
tier: contract
story: cli
capability: organism-boundary-tooling
title: "Refuse a NEW story whose unit sources are hosted in another story's building unless it is on the frozen grandfather register — regardless of declared edges"
outcome: "The pure boundary judge REFUSES a story whose units' proof.real.sourceFile paths live inside another story's building (a foreign packages/<x> or apps/<x> dir) when that story is NOT named in the frozen grandfather register (hostedStories) — regardless of any declared edge between the two — so a NEW story can no longer squat in a foreign building at all (packages-forward, ADR-0192); the register grandfathers exactly the existing hosted stories, and a register entry that no longer claims any foreign-hosted file is itself a violation, making the register a self-pruning migration worklist."
status: proposed
proof_mode: contract-test
depends_on: []
# Node-borne proof config (ADR-0057 keystone A): authoring THIS block is what makes the contract
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (editsExisting: true): both files
# already exist at HEAD — the leaf ADDS a SECOND BLOCKING rule (the packages-forward refusal, sibling to
# rule 5 the landlord rule) to the existing `checkBoundaries` in packages/cli/src/boundaries.ts, plus ONE
# new OPTIONAL BoundaryInput field it reads (the FROZEN grandfather register, suggested
# `hostedStories?: string[]`), REUSING rule 5's evidence machinery (unitSourceFiles/dirOwners,
# buildingDirOf, the per-(S,T) dedup — no new evidence path), and ADDS exhaustive cases to
# packages/cli/src/boundaries.test.ts. DELIVERED red→green BY THE SPINE (2026-08-08 correction, ADR-0139
# correct-in-place): the `--real` build run `real-mrja2qgq` was promoted as the spine-authored commit
# "storytree real build real-mrja2qgq: packages-forward-refusal (authored by the gated leaf)", and
# promotion happens only on a SIGNED PASS verdict (`promoteRealPass`), so the gate did observe this
# red→green. At HEAD `checkPackagesForwardRefusal` and the `hostedStories?: string[]` field are present in
# packages/cli/src/boundaries.ts, gathered by check-boundaries.ts, and covered by passing
# `packages-forward-refusal: …` cases in packages/cli/src/boundaries.test.ts. The authored
# `status: proposed` above is the BASELINE the node rollup augments from that signed verdict — it is NOT a
# claim the work is unbuilt, and it is not flipped here because `healthy` is non-authorable (ADR-0020) and
# `mapped` would falsely deny the gate-driven proof. A re-run of this node must start from a genuine red;
# the red it was built against was a runtime-assertion red — the new cases fed a hosted-but-UNREGISTERED
# fixture to checkBoundaries as it stood before the rule existed, asserting a refusal not yet produced.
# NO `install`: the test imports ONLY node:test,
# node:assert/strict, and ./boundaries.js (relative); boundaries.ts itself imports nothing (no zod, no
# @storytree/*, no node: builtins) and must STAY that way — so the proof runs OFFLINE in a bare worktree
# with no lockfile install (and therefore no typecheck wall is required). Single LITERAL sourceFile (no
# `*`), and sourceGlobs === [sourceFile], so the default node:test proof on the single test file is legal
# — no `proofCommand` (the honesty refine does not fire: one literal source glob equal to sourceFile, no
# wildcard, stays on the default command). The write scope stays within packages/cli (ADR-0087: one
# concrete package per write scope). The register READ from repo-manifest.json's `hostedStories` list is
# the disk gatherer's glue in check-boundaries.ts — deliberately OUT of this contract's write scope,
# exactly like rule 5's dir→owner gathering.
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/cli", "test"]
  scope:
    testGlobs: ["packages/cli/src/**/*.test.ts"]
    sourceGlobs: ["packages/cli/src/**/*.ts"]
  real:
    testFile: "packages/cli/src/boundaries.test.ts"
    sourceFile: "packages/cli/src/boundaries.ts"
    editsExisting: true
    scope:
      testGlobs: ["packages/cli/src/boundaries.test.ts"]
      sourceGlobs: ["packages/cli/src/boundaries.ts"]
---

# Refuse a NEW story hosted in another story's building unless it is on the frozen grandfather register

**Outcome —** The pure boundary judge REFUSES a story whose units' `proof.real.sourceFile` paths live
inside **another story's building** (a foreign `packages/<x>` or `apps/<x>` dir) when that story is NOT
named in the **frozen grandfather register** (`hostedStories`) — **regardless of any declared edge**
between the two — so a NEW story can no longer squat in a foreign building at all (packages-forward,
[ADR-0192](../../docs/decisions/0192-hosted-story-boundary-honesty-the-landlord-rule-now-packages.md)
decision 2); the register grandfathers exactly the existing hosted stories, and a register entry that no
longer claims any foreign-hosted file is itself a violation, making the register a self-pruning migration
worklist.

> **The gap this closes (ADR-0192 decision 2 — packages-forward).** Rule 5 (the landlord rule,
> [`hosted-story-landlord-rule`](hosted-story-landlord-rule.md), increment 1) accepts a hosted story once
> it DECLARES a host edge either way. That is the right end-state for the ~18 stories already hosted — but
> it would also silently bless a BRAND-NEW story that squats in a foreign building, as long as it
> remembered to declare the edge. ADR-0192 decision 2 is stricter GOING FORWARD: a new story's code lives
> in its OWN workspace package (an organism, [ADR-0068](../../docs/decisions/0068-dissolve-core-into-organisms-the-organism-rebuild.md))
> where the compiler and the package-granular gate enforce every edge for free — a new story must not host
> in a neighbour's building **at all**, edge or no edge. The existing hosted stories are GRANDFATHERED in a
> register in `repo-manifest.json`, frozen at adoption in the sense that matters: adding a name is a loud,
> owner-reviewed diff citing its reason
> — the exact opposite of the silent `depends_on: []` omission that let the library-tech-tree-overlay
> incident through (owner-caught 2026-07-13). Entries LEAVE as stories migrate or retire; the register is
> a reviewed, bounded residual, not an immutable list (see the `hostedStories` bullet below).
> This contract is the pure core of that SECOND blocking rule. It reuses rule 5's exact evidence (so the
> two rules can never disagree about what "hosted" means); the disk gatherer that reads the `hostedStories`
> list out of `repo-manifest.json` (in
> [`check-boundaries.ts`](../../packages/cli/src/check-boundaries.ts)) is the consuming surface's I/O glue,
> deliberately OUT of this contract's write scope — exactly like rule 5's dir→owner gathering.

## Guidance

Add ONE more BLOCKING rule to the EXISTING `checkBoundaries` in
[`packages/cli/src/boundaries.ts`](../../packages/cli/src/boundaries.ts) — a sibling to rule 5
(`checkHostedStoryLandlord`), appending to the SAME violation list and SHARING rule 5's evidence
computation (`buildingDirOf`, the `unitSourceFiles`/`dirOwners` inputs, the per-`(S, T)` dedup). It reads
ONE new OPTIONAL field on `BoundaryInput` (the leaf owns the exact name/type; the asserted behaviour below
is binding):

- **`hostedStories?: string[]`** — the grandfather register: the currently-hosted story ids that are
  permitted to keep files in a foreign building. In the real gather it comes from the `hostedStories`
  block in `repo-manifest.json`, read by `check-boundaries.ts` (that read is the gatherer's glue, OUT of
  this contract's write scope). **That block is a MAP**, not a list — story id → a note naming the hosts
  it claimed at adoption — and the gatherer passes its KEYS to the pure judge, which is why the judge's
  input shape here is a `string[]`. **`repo-manifest.json` is the register's only source of truth, and
  this spec deliberately does NOT re-enumerate it.** At adoption (2026-07-13) it held **18** story ids
  with a mapped foreign-hosting pair, derived mechanically via rule 5's evidence, each already carrying a
  declared host edge (the increment-1 remediation) so rule 5 was green over them. The register is the
  bounded, reviewed, shrinking residual that IS the migration worklist (ADR-0192 consequences) — but it
  is not immutable, and membership has since moved in BOTH directions: entries LEAVE as stories migrate
  or retire (`chat-subagent-spawn`, `headless-orchestrator` and `spawn-visibility` left with the ADR-0175
  retirement), and an entry is ADDED only as a deliberate, owner-reviewed diff carrying its reason in the
  manifest's own `$comment`/note (three have been — `app-surface` as the directed first-consumer seam
  under ADR-0237, and `uat-detail-studio` + `model-uat-pilot` under ADR-0209). *(An earlier revision of
  this bullet froze the 18 ids as a named list here. It drifted three-out / three-in while the COUNT
  coincidentally stayed 18, so nothing caught it. The enumeration is removed rather than re-synced: a
  spec that mirrors a live file is a second source of truth, and re-syncing it would only reset the same
  trap.)*

**The evidence is rule 5's, computed identically.** For a story `S`, its **mapped foreign-hosting pairs**
are exactly what rule 5 computes: for each file `F` in `unitSourceFiles[S]`, take `F`'s first two path
segments as the building but ONLY if `F` starts with `packages/` or `apps/` (any other root — `.github/`,
`scripts/`, `stories/`, a bare filename — is out of the boundary surface, no pair); let `T =
dirOwners[building]`; skip if `T` is undefined (unmapped building — insufficient data) or `T === S` (S's
own building). Every surviving `(S, T)` is a mapped foreign-hosting pair. This SECOND rule then applies the
register, in TWO directions:

- **Refusal (S is hosted but not registered).** For each mapped foreign-hosting pair `(S, T)` where `S ∉
  hostedStories`, append ONE violation per `(S, T)` pair — DEDUPED across `F` and deterministically ordered
  (rule 5's `(S, T)`-key + first-seen-example-file dedup), naming `S`, the host `T`, the building dir, and
  ONE example file. Crucially this fires **REGARDLESS of any declared edge** between `S` and `T`: a
  declared `depends_on`/`consumed_by` edge SATISFIES rule 5 but does NOT satisfy this rule — a NEW story
  cannot squat in a foreign building at all (ADR-0192 decision 2). The message points the fix: re-home the
  unit's sources into `S`'s OWN workspace package (packages-forward, ADR-0192) — OR, ONLY for a deliberate
  owner-reviewed grandfathering, add `S` to the `hostedStories` register in `repo-manifest.json` (a loud
  reviewed diff that must carry its reason alongside the entry; entries leave again as stories migrate or
  retire).
- **Stale-register (a registered story with no hosting evidence).** For each entry `E` in `hostedStories`
  that has NO mapped foreign-hosting pair (`E` no longer claims any file in a foreign building — it
  migrated, retired, or the entry is a typo), append ONE violation naming `E` and pointing at REMOVING the
  entry. This is the rule-4 precedent applied to the register — an annotation must never outlive the gate
  (compare rule 4's stray/stale `artifact_edges` checks in
  [`checkDeclaredEdgeHonesty`](../../packages/cli/src/boundaries.ts)) — so the register is a self-pruning
  worklist and a migration PR that re-homes a story MUST also shrink it.

The full truth table (register defined; pairs computed via rule 5's evidence) — the discriminator the
leaf's fixtures must honour so they never trip the wrong branch:

| `S ∈ hostedStories`? | has a mapped foreign-hosting pair? | result |
| --- | --- | --- |
| yes | yes | grandfathered — NO refusal, NO stale (rule 5 still governs its edge independently) |
| yes | no | STALE-register violation (remove the entry) |
| no | yes | REFUSAL, one per `(S, T)` pair — regardless of declared edges |
| no | no | clean |

**Skip posture (fail-closed).** The whole rule is SKIPPED when `hostedStories` is **undefined** (absent) —
narrow fixtures that don't pass the register are unaffected, and every EXISTING rule-5 fixture (hosted
stories with declared edges, no register passed) stays green at HEAD. An EMPTY array is NOT absent: `[]`
means "no grandfathered stories" — every hosted story is refused (fail-closed; the real gatherer ALWAYS
passes the register). Like rule 5, the rule is also skipped when the evidence inputs
(`unitSourceFiles`/`dirOwners`) are absent — with no evidence there are no pairs, so nothing to refuse and
nothing to prune. Keep the rule pure and dependency-light: `boundaries.ts` imports NOTHING today and must
STAY import-free (no `@storytree/*`, no `node:` builtins) so `boundaries.test.ts` keeps proving OFFLINE
with builtins + `./boundaries.js` only. This is a BLOCKING rule — a packages-forward refusal (or a stale
register entry) FAILS the gate exactly like an undeclared coupling.

## Contract

1. **`packages-forward-refusal-blocks-unregistered-hosted-story`** — the second blocking rule refuses a
   hosted story absent from the frozen register regardless of any declared edge, keeps the register honest
   (a stale entry is itself a violation), and stays silent for every grandfathered / no-evidence /
   register-absent case.
   - **asserts —**
     - **hosted ∧ NOT registered ∧ a declared edge PRESENT (either direction) → a violation anyway** — the
       KEY "regardless of declared edges" case: given `unitSourceFiles` mapping story `S` to a file under a
       foreign building `B`, `dirOwners[B] = T` (`T ≠ S`), a declared edge `S → T` OR `T → S` in the merged
       graph (so rule 5 is SILENT), and `S ∉ hostedStories`, `checkBoundaries` STILL returns a
       packages-forward refusal naming `S`, the host `T`, the building dir, and an example file — a declared
       edge does not rescue an unregistered new story;
     - **hosted ∧ registered → NO refusal** — when `S ∈ hostedStories`, the grandfathered hosted file
       raises no packages-forward refusal (rule 5 still independently governs whether its host edge is
       declared — the two rules are separate outputs);
     - **hosted ∧ NOT registered against an EMPTY `[]` register → a violation** — `hostedStories: []` is
       DEFINED-but-empty ("no grandfathered stories"), NOT absent: a hosted story trips the refusal
       (fail-closed; empty ≠ absent);
     - **`hostedStories` ABSENT → the rule is SKIPPED entirely** — with `hostedStories` omitted, even a
       fixture that would otherwise trip the refusal (a hosted-but-unregistered arrangement) produces no
       packages-forward violation — so every existing rule-5 fixture stays green at HEAD;
     - **a register entry with NO hosting evidence → a stale-register violation** — an `E ∈ hostedStories`
       that claims no file in any foreign building (all own-building, off-surface, unmapped, or claims no
       files at all — it migrated, retired, or is a typo) yields one violation naming `E` and pointing at
       removing the entry from the register;
     - **own-building files, off-surface roots, and unmapped buildings contribute no hosting evidence
       (clean)** — with the register defined (and NOT listing `S`, so the stale check stays silent), a file
       in `S`'s own building (`dirOwners[building] === S`), a path outside `packages/`/`apps/` (`.github/`,
       `scripts/`, `stories/`, a bare filename), or a building absent from `dirOwners` produces no
       packages-forward violation — the same insufficient-data skips rule 5 makes;
     - **multiple foreign hosts for one unregistered story → one violation per `(S, T)` pair, deterministic
       order** — a hosted-but-unregistered story whose files sit across several foreign buildings yields
       exactly one refusal per `(S, T)` host pair, deduped across files (rule 5's dedup) and
       deterministically ordered.
   - **proven by —** `packages/cli/src/boundaries.test.ts` — the `packages-forward-refusal: …` cases,
     passing at HEAD against `checkPackagesForwardRefusal` in `packages/cli/src/boundaries.ts`. They were
     authored by the leaf inside the gate's AUTHOR_TEST phase, mirroring rule 5's `landlordOnly` isolation
     helper (`packageDeps: {}` to sidestep rules 0/1/3/4, an already-acyclic `storyGraph`/`consumedBy` to
     keep rule 2 silent) extended to pass `hostedStories`; the red — those cases asserting a
     packages-forward refusal `checkBoundaries` did not yet produce — WAS observed by the spine before the
     rule was added, and the resulting signed pass is what promoted the build (run `real-mrja2qgq`).
