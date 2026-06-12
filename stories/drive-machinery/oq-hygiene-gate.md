---
id: "oq-hygiene-gate"
tier: capability
story: drive-machinery
title: "The open-question hygiene gate on live story builds (ADR-0037 §5)"
outcome: "A live story build is refused while an operator answer on a deciding ADR's open question sits unprocessed."
status: mapped
proof_mode: integration-test
depends_on: [prove-spec-resolution]
---

# The open-question hygiene gate on live story builds (ADR-0037 §5)

**Outcome —** A live story build is refused while an operator answer on a deciding ADR's open question sits unprocessed.

**Depends on —** [`prove-spec-resolution`](prove-spec-resolution.md)

> **Proof status (honest) — `mapped`, with the live loader as the `proposed` pocket.** The
> classification and every gate disposition are covered by a real, passing, offline suite over
> injected rows (`packages/cli/src/oq-gate.test.ts`, part of `@storytree/cli` 110/110 — I ran it
> 2026-06-13). The pocket: `loadLive` — the thin loader composing the library tier's live
> `PgLibraryStore` + `PgCommentStore` (`oq-gate.ts:110-119`) — has no offline assertion; it is the
> cross-story leg (the story-level `library` edge), exercised only against the live DB.

## Guidance

ADR-0037 §5 — open questions sit on the GATE side of the advisory/gate line. Before any store
setup or spend, a LIVE story build resolves the story's deciding ADRs (`decisions:` frontmatter,
ADR-0037 §2), finds open-questions whose `references` point at those ADR docs
(`doc:decisions/<nnnn>-…`, `oq-gate.ts:34-38`), and classifies each
(`classifyOpenQuestions`, `packages/cli/src/oq-gate.ts:56-96`):

- an **unprocessed operator answer** (an unresolved operator comment with no LATER non-operator
  follow-up) **REFUSES** the build, naming the three paths out — process it (record + retire the
  OQ), post a follow-up where the answer is unclear (engagement unblocks), or fix a wrong link;
- an OQ still **awaiting** an answer is a loud WARN — a session cannot force the owner;
- **dry-runs and an unreachable live store never refuse** (`oqHygieneGate`,
  `oq-gate.ts:125-199`): the gate needs the live comment store to have an opinion, and refusing
  blind would block offline work on infrastructure noise.

Pure classification over injected rows; the live loader is a thin composition of the library
story's stores. The code edge for the `depends_on`: `oq-gate.ts:2` imports the `NodeSpec` type
from `@storytree/orchestrator` — the gate's input is the resolver's loaded story spec (its
`decisions` field). Consumed by [`build-drive-cli`](build-drive-cli.md)'s `story build`
(`packages/cli/src/story-build.ts:174-175`).

## Integration test

**Goal —** The gate guards a real story build: `storyBuild` calls `oqHygieneGate` with the loaded
story spec before any node runs, and the dry-run path reports "unchecked — offline" in the build
header without refusing (`packages/cli/src/story-build.test.ts:17` carries the hygiene line;
`oq-gate.test.ts:141` proves the live refusal end-to-end through `oqHygieneGate` with an injected
loader).

## Contracts (8)

1. **`only-deciding-adrs-pull-oqs-in`** — an OQ with no reference to a deciding ADR is excluded
   - **asserts —** unrelated OQs never appear in the rows.
   - **covers —** `packages/cli/src/oq-gate.ts:63-71`
   - **proven by —** `packages/cli/src/oq-gate.test.ts:69` (REAL, passing)
2. **`no-answer-is-awaiting`** — no operator comment → `awaiting-answer`
   - **asserts —** the awaiting classification.
   - **covers —** `oq-gate.ts:75-77`
   - **proven by —** `oq-gate.test.ts:74` (REAL, passing)
3. **`unresolved-answer-is-unprocessed`** — an unresolved operator comment → `unprocessed-answer`; all resolved → `engaged`
   - **asserts —** both dispositions.
   - **covers —** `oq-gate.ts:78-92`
   - **proven by —** `oq-gate.test.ts:81` and `:90` (REAL, passing)
4. **`follow-up-engages-only-after`** — a non-operator comment AFTER the latest unresolved answer engages it; one BEFORE does not
   - **asserts —** the engagement timestamp rule (the unclear-answer path).
   - **covers —** `oq-gate.ts:83-90`
   - **proven by —** `oq-gate.test.ts:99` and `:111` (REAL, passing)
5. **`nothing-to-check-never-refuses`** — a story with no `decisions` and a dry-run both pass through with an honest header line
   - **asserts —** `refusal:null` + the explanatory line in each case.
   - **covers —** `oq-gate.ts:130-141`
   - **proven by —** `oq-gate.test.ts:125` and `:133` (REAL, passing)
6. **`live-unprocessed-refuses-with-the-three-paths`** — a live build with an unprocessed answer is refused, naming the OQ, its ADRs, and the three ways out
   - **asserts —** the refusal envelope's shape and `next:` pointers.
   - **covers —** `oq-gate.ts:156-185`
   - **proven by —** `oq-gate.test.ts:141` (REAL, passing)
7. **`awaiting-warns-clean-reports`** — only-awaiting answers WARN without refusing; a clean state reports clean
   - **asserts —** the WARN lines and the clean line.
   - **covers —** `oq-gate.ts:187-198`
   - **proven by —** `oq-gate.test.ts:155` and `:172` (REAL, passing)
8. **`never-refuse-blind`** — an unreachable live store yields an UNCHECKED line, never a refusal
   - **asserts —** the loader throwing degrades to a report line.
   - **covers —** `oq-gate.ts:143-154`
   - **proven by —** `oq-gate.test.ts:164` (REAL, passing — `loadLive` itself is the `proposed` pocket)
