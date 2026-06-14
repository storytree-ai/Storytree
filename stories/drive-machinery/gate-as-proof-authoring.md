---
id: "gate-as-proof-authoring"
tier: capability
story: drive-machinery
title: "Gate-as-proof for authoring work"
outcome: "Authoring an ADR earns a node + signed verdict + wisp through the unchanged prove-it-gate, by reducing to edit-existing with a structural-completeness check as the proof — the machine witnesses authoring hygiene, never acceptance."
status: mapped
proof_mode: integration-test
depends_on: [multi-file-existing-source, spec-borne-proof-config]
decisions: [20, 57, 59]
---

# Gate-as-proof for authoring work

**Outcome —** Authoring an ADR earns a node + signed verdict + wisp through the unchanged prove-it-gate,
by reducing to edit-existing with a structural-completeness check as the proof — the machine witnesses
authoring hygiene, never acceptance.

**Depends on —** [`multi-file-existing-source`](multi-file-existing-source.md), [`spec-borne-proof-config`](spec-borne-proof-config.md)

> **Proof status (honest) — `mapped`, built outer-loop (the bootstrap).** [ADR-0057](../../docs/decisions/0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
> §5's expansion E, designed + decided in its own [ADR-0059](../../docs/decisions/0059-gate-as-proof-authoring-nodes-earn-a-signed-verdict-via-thei.md)
> (a 3-framing judge panel). The change is BUILT and its dominant behaviour is observationally
> verified by a real, passing, OFFLINE suite: `packages/cli/src/adr-completeness.test.ts` (the
> per-artifact completeness check is RED against the real `storytree adr new` scaffold and GREEN
> against a complete PROPOSED record, never requiring `accepted`) + `packages/cli/src/gate-as-proof.test.ts`
> (a real scaffold ADR + a completeness test drives red→green THROUGH the unchanged gate to a signed
> verdict, and the AUTHOR_TEST wall holds over a doc artifact). `@storytree/cli` green, ran 2026-06-15.
> Like the keystones it stands on, E was built outer-loop first (this ADR is the founding decision,
> authored directly, not via a leaf completing a scaffold — the accepted bootstrap caveat). The
> `proposed` pocket: a LIVE gate-as-proof `--real` build that authors a real ADR to a signed verdict
> is an operator-attested smoke (the redone blind dogfood already live-proved the edit-existing
> machinery E rides on). The honesty walls of [`prove-it-gate`](prove-it-gate.md) and
> [`phase-scoped-write-wall`](phase-scoped-write-wall.md) are PRESERVED unchanged — gate-as-proof adds
> NO new proof mode, field, or phase; it is edit-existing applied to a doc artifact.

## Guidance (the design, as built)

The crux ADR-0059 solved: a red→green proof needs a genuine RED before the work, but the structural
gates that guard authoring (`check:adr-health`, `validateLibraryDoc`, the decision-binding check)
validate EXISTING artifacts and are normally GREEN. The reduction: with A–D landed, gate-as-proof
**is edit-existing** (expansion C) — the **artifact is the source**, a **per-artifact completeness
check** is the test, and the genuine red is the on-disk state of a fresh `storytree adr new` scaffold.

The mechanism (no orchestrator/schema change — pure A/B/C reuse):

- **`packages/cli/src/adr-completeness.ts`** (the only net-new code) — `adrCompleteness(file, content,
  required?)` returns the list of completeness failures ([] = complete): frontmatter parses
  (`parseAdrFrontmatter`, @storytree/core); a `decided:` date present; NO `<…>` scaffold placeholder
  prose (angle brackets with internal whitespace — avoids false positives on `Array<string>`); the
  canonical sections present; every DECLARED `supersedes`/`amends` edge in the frontmatter. It
  **never asserts `status: accepted`** — acceptance is a human flip (ADR-0006/0037), witnessed later
  by the corpus green-flip gate. The machine proves a record is structurally complete; it never
  writes the decision.
- **The node** carries a spec-borne `proof:` block (A) with `editsExisting: true` (C), `sourceFile` =
  the ADR `.md`, and a leaf-authored completeness test as the `testFile`. The spine drives the
  unchanged ladder: AUTHOR_TEST writes the completeness test (test-globs-only) → CONFIRM_RED observes
  it fail against the unedited scaffold (placeholders / no `decided:`) → IMPLEMENT edits the ADR to
  completeness (source-globs-only) → CONFIRM_GREEN → GATE signs. `commitAuthored` is format-agnostic
  (it commits the `.md`), so nothing in the engine needed to change.

First kind = **ADR** (the scaffold's `proposed`/no-`decided`/`<…>`-prose state is a sharp real red,
`parseAdrFrontmatter` already exists, status is human-flipped). Expansion path: library-edit, then
story-authoring (ADR-0059 §4).

## Trust analysis (the honesty walls hold — verified by the suite)

test-author ≠ artifact-author holds via C's wall applied to a doc: AUTHOR_TEST is test-globs-only, so
a leaf cannot pre-complete the ADR while "authoring the proof" (proven by `gate-as-proof.test.ts`'s
wall test). CONFIRM_RED observes the completeness test failing against the UNCHANGED scaffold — a
forged already-green test (e.g. asserting nothing, or asserting the scaffold's own state) is observed
GREEN at CONFIRM_RED and the gate fails closed, exactly as C's forged-already-green walk proves. The
human-flip wall is strengthened: green requires a complete PROPOSED record, never `accepted`, so the
machine never writes the decision. The spine observes red/green out-of-band (ShellTestExecutor, NODE_TEST
scrubbed), the leaf's `run_proof` is feedback-only — unchanged from every other proof mode.

## Open owner calls (surfaced in ADR-0059, not decided here)

- **Human-flip semantics** — the completeness check asserts a complete PROPOSED record and never
  `accepted` (the conservative, honesty-preserving default). Letting the leaf write `accepted` and
  treating the human PR-merge as acceptance is the alternative; OWNER call.
- **Whole-corpus suite coupling** — a `pnpm --filter x test` proof command couples the proof to the
  whole package suite; a builtins-only node:test on the single completeness file avoids it (the
  offline walk uses this). OWNER call when the first live ADR node is built.
- **Per-ADR test accumulation** — one frozen completeness test per authored ADR accrues (inert, not
  rotting); pruning post-verdict is an OWNER call (the over-declared-scope family).

## Integration test (as built)

A real `storytree adr new` scaffold ADR (status:proposed, `<…>` placeholders, no `decided:`) committed
in a fixture git repo is the existing source; a scripted leaf authors a completeness test (AUTHOR_TEST,
red against the scaffold), the spine observes red, the leaf EDITs the ADR to a complete proposed record
(IMPLEMENT), the spine observes green, and the GATE signs the verdict — through the unchanged ladder,
with the AUTHOR_TEST wall refusing a doc edit. Proven by `packages/cli/src/gate-as-proof.test.ts` +
`adr-completeness.test.ts`, REAL, passing.

## Contracts (6, BUILT)

1. **`adr-completeness-red-on-the-real-scaffold`** — `adrCompleteness` is RED against the genuine `storytree adr new` scaffold (unfilled `<…>` placeholders + missing `decided:`).
   - **proven by —** `packages/cli/src/adr-completeness.test.ts` ("RED against the real scaffold …") (REAL, passing)
2. **`adr-completeness-green-on-complete-proposed`** — GREEN against a complete PROPOSED record; the `Array<string>` generic does not false-trip the placeholder detector.
   - **proven by —** `adr-completeness.test.ts` ("GREEN against a complete PROPOSED record …") (REAL, passing)
3. **`human-flip-preserved`** — completeness never asserts `status: accepted`; a complete proposed record passes and a complete accepted record also passes (status-agnostic) — acceptance stays a human flip.
   - **proven by —** `adr-completeness.test.ts` ("acceptance is NOT required …", "a complete ACCEPTED record also passes …") (REAL, passing)
4. **`gate-as-proof-red-green-through-the-gate`** — a scaffold ADR + a completeness test drives red→green through the UNCHANGED prove-it-gate to a signed verdict (the composition: authoring = edit-existing over a doc).
   - **proven by —** `packages/cli/src/gate-as-proof.test.ts` ("a scaffold ADR + a completeness test drives red→green …") (REAL, passing)
5. **`author-test-wall-holds-over-a-doc`** — the AUTHOR_TEST test-globs-only wall holds over a doc artifact: the leaf cannot edit the ADR while authoring the completeness test; a forged already-green completeness test fails closed at CONFIRM_RED.
   - **proven by —** `gate-as-proof.test.ts` ("the AUTHOR_TEST wall holds over a doc artifact …", "a forged already-green completeness test fails closed at CONFIRM_RED") (REAL, passing)
6. **`declared-edge-required`** — a DECLARED `supersedes`/`amends` edge absent from the frontmatter is a completeness failure (the record's edges match its stated intent).
   - **proven by —** `adr-completeness.test.ts` ("a DECLARED edge missing from the frontmatter …") (REAL, passing)
