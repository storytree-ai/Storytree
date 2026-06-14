---
status: accepted
decided: 2026-06-15
amends: [57]
---
# ADR-0059: Gate-as-proof: authoring nodes earn a signed verdict via their structural gate

## Status

accepted (2026-06-15) — direct owner decision (2026-06-15, "proceed with E"). This is expansion **E**
of the [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) staged plan
(§3 / §5), which deferred E's design to "its own ADR". Designed by a 3-framing judge panel.

**Amends** ADR-0057 — fills in the E expansion its §5 named and deferred, without overturning §1–§4
(the inner loop stays the default; landing stays on the PR/CI rail; A–D stand).

## Context

ADR-0057 §5 set the direction for the hardest expansion: make **authoring work** — a doc, an ADR, a
library/knowledge edit, a story spec — *produce a node + a signed verdict + a wisp* through the
prove-it-gate, so the owner's "an ADR-able change should be evolvable into the story corpus"
hypothesis becomes literal. It chose **gate-as-proof** (an authoring node's proof is the structural
gate that guards it) over attest-as-proof (ADR-0044), and left the mechanics open.

The hard problem (the panel's crux): a red→green proof needs a GENUINE RED before the work, but the
structural gates that guard authoring — `check:adr-health`, `validateLibraryDoc`, the
decision-binding check — validate EXISTING artifacts and are NORMALLY GREEN. A *missing* ADR isn't
red (it's absent); a fresh scaffold may already have valid frontmatter. So where does the genuine red
come from, and what is the "test" vs the "source"?

The panel's key finding: gate-as-proof does **not** need a new proof mode, field, or phase. With
A–D landed it **reduces to edit-existing** ([ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md)
expansion C): the **artifact is the source**, and a **per-artifact structural-completeness check** is
the test. `storytree adr new` ([ADR-0050](0050-adr-number-allocation.md)) scaffolds a `status: proposed`
record with NO `decided:` date and literal `<…>` placeholder prose in every section — a real on-disk
property, not a manufactured exit code. That scaffold is the "existing source"; a completeness
assertion over it is genuinely RED, and authoring the record to completeness turns it GREEN.

## Decision

**1. Authoring earns a node + signed verdict + wisp through the UNCHANGED prove-it-gate ladder, by
reusing edit-existing (ADR-0057 C). No new proof mode, field, or phase.** The work hierarchy and the
honesty walls are untouched; only AUTHORED CONTENT is new.

**2. The reduction.** An authoring node carries a spec-borne `proof:` block (ADR-0057 A) with
`editsExisting: true` (C), `sourceFile` = the artifact (e.g. `docs/decisions/NNNN-slug.md`), and a
leaf-authored per-artifact **completeness test** as the `testFile`. The spine drives the unchanged
`AUTHOR_TEST → CONFIRM_RED → IMPLEMENT → CONFIRM_GREEN → GATE` ladder:
- **AUTHOR_TEST** (test-globs-only): the leaf writes the completeness test — it asserts the artifact
  is STRUCTURALLY COMPLETE.
- **CONFIRM_RED**: the spine spawns the proof against the unedited scaffold and observes it fail
  (placeholders present / `decided:` absent) — a genuine red on the real file.
- **IMPLEMENT** (source-globs-only): the leaf EDITs the scaffold into a complete record.
- **CONFIRM_GREEN / GATE**: the spine observes green and signs the verdict on a clean committed tree.

**3. The completeness contract asserts a COMPLETE *PROPOSED* record — never `status: accepted`.** For
the first kind (ADR), the check (`adrCompleteness`, `packages/cli/src/adr-completeness.ts`) requires:
frontmatter parses; a `decided:` date present; no `<…>` scaffold placeholders left; the canonical
sections (Status/Context/Decision/Consequences) present; and every DECLARED outgoing edge
(`supersedes`/`amends`) in the frontmatter. It deliberately does **not** assert `status: accepted` —
**acceptance stays a HUMAN flip** ([ADR-0006](0006-event-store-observability-surface.md)/[ADR-0037](0037-decision-binding-and-hygiene-gates.md):
no machine writes status), witnessed later by the corpus green-flip gate (`adr-health`). So the gate
proves a record is structurally complete; it never writes the decision or judges its merit.

**4. First kind = ADR-authoring** (the cleanest: the scaffold's `proposed`/no-`decided`/`<…>`-prose
state is a sharp, real red; `parseAdrFrontmatter` already exists; status is human-flipped, so
"complete proposed record" maps onto the human-accepts/gate-witnesses split). The expansion path:
library-edit next (but `validateLibraryDoc` is green on any well-formed doc, so it needs a sharper
"complete-to-its-contract" assertion), then story-authoring.

**5. Landing stays on the PR/CI rail** (ADR-0057 §4 unchanged): the proven commit promotes to a
`claude/real/*` branch ([ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)) and lands via a
non-squash PR; `--store pg` persists the verdict + wisp to `events.verdict`/`events.work_event`.

## Consequences

**Good.**
- Authoring becomes inner-loop work: it produces a node, a signed verdict, and a wisp like any build —
  the bootstrap surface (ADR-0057 gap G7) closes for ADRs, with the next kinds a clear path.
- ZERO new engine machinery — the spec-borne loader, the editsExisting brief, `ShellTestExecutor`,
  `PathWriteScope`, `commitAuthored` (format-agnostic — it commits a `.md`), `gitTreeState`, the
  signed-verdict append, and promotion all already carry it (verified). The only net-new code is the
  `adrCompleteness` checker; the only net-new *authored* artifacts are the node spec + the per-ADR
  completeness test.
- The honesty walls hold over a doc: test-author ≠ artifact-author via C's wall (AUTHOR_TEST is
  test-globs-only, so the leaf cannot pre-complete the ADR while "authoring the proof"); a forged
  already-green completeness test fails closed at CONFIRM_RED; the spine observes red/green
  out-of-band. The human-flip wall is strengthened, not eroded — the machine witnesses authoring
  hygiene, never acceptance. Proven offline by `gate-as-proof.test.ts` (a real scaffold → complete
  record red→green through the gate to a signed verdict) + `adr-completeness.test.ts`.

**Bad / costs & open forks (surfaced, not unilaterally decided — owner calls).**
- **Human-flip semantics (decided as the conservative default):** the completeness check asserts a
  complete PROPOSED record and never `status: accepted`, keeping "no machine writes status" intact.
  The alternative — let the leaf write `accepted` and treat the human PR-merge as the acceptance
  ceremony — erodes the human-flip wall and is **left to the owner** if wanted.
- **Whole-corpus suite coupling:** if a node uses `pnpm --filter @storytree/cli test` as the proof
  command, an unrelated pre-existing corpus red would spuriously fail the proof. Mitigation: a
  builtins-only completeness test (no package import) keeps the proof a node:test on the single file —
  the offline walk uses exactly this. A node that imports `adrCompleteness` needs `install:true`.
- **Per-ADR test accumulation:** one frozen completeness test per authored ADR accrues in
  `packages/cli/src`; it stays trivially green forever (a finished ADR does not un-complete) — inert,
  not rotting — but whether these are pruned post-verdict is an open owner call (the same family as
  ADR-0057's deferred over-declared-scope question).
- **This ADR itself was authored outer-loop** (the founding decision is authored directly, not via a
  leaf completing a scaffold) — the bootstrap caveat, like A–D.

## References

- [ADR-0057](0057-dogfood-the-inner-loop-as-the-default-node-borne-proof-confi.md) — the staged plan; §5 named + deferred E (this ADR amends it).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate ladder + honesty walls this reuses unchanged.
- [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — REAL promotion (the landing rail).
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — decision binding + `adr-health`; the human-flip / green-flip gate acceptance rides on.
- [ADR-0044](0044-per-uat-test-human-attestation.md) — attest-as-proof, the alternative E weighed against (ADR-0057 §5).
- [`stories/drive-machinery/gate-as-proof-authoring.md`](../../stories/drive-machinery/gate-as-proof-authoring.md) — the capability node.
- `packages/cli/src/adr-completeness.ts` (+ `.test.ts`), `packages/cli/src/gate-as-proof.test.ts` — the checker + the offline composition proof.
