---
status: accepted
decided: 2026-06-13
---

# ADR-0039: JSON is the structured corpus source format — the pure-YAML unit migration is retired

## Status

accepted (2026-06-13, owner) — **reverses [ADR-0013](0013-structured-corpus-markdown-as-view.md)'s
format call to JSON**: the "YAML is the source of truth" format call (Decision #1's encoding choice
and §5's corpus-wide YAML ambition) is overtaken; ADR-0013's substance — structure over prose,
schema-enforced discipline, markdown as a rendered view, validatable `covers` — stands unchanged,
carried by JSON.
**Processes and retires** the open-question `oq-corpus-source-format` (owner studio comment
**"Go with A"**, 2026-06-09; format clarified by the owner 2026-06-13: **JSON everywhere**) — the
fifth application of [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) §6's lifecycle
(after ADR-0018, [ADR-0027](0027-supersede-adr-0014-notice-board.md),
[ADR-0032](0032-cite-graduation-mechanism.md), [ADR-0037](0037-decision-binding-and-hygiene-gates.md)),
and the first forced through [ADR-0037](0037-decision-binding-and-hygiene-gates.md) §5's hygiene
gate, which refused every live `story build library` until this answer was processed — the system
working as designed.

## Date

2026-06-13

## Context

ADR-0013 (amended 2026-06-06) resolved the structured-corpus format to **YAML**: "One structured
format — YAML is the source of truth", corpus-wide in principle, work-hierarchy units converting
first. Reality went the other way on both fronts:

- **The library tier was built on JSON.** The structured seed is `apps/studio/data/knowledge.json`
  (ADR-0018); the live source of truth is the shared store's **JSONB** rows, zod-validated at write
  (ADR-0017, [ADR-0023](0023-library-cli-choose-your-own-adventure.md)). The whole pipeline —
  `build-corpus.mjs`, `load-corpus.ts`, the studio, the CLI — speaks JSON end to end. No YAML
  anywhere.
- **The work-hierarchy units stayed frontmatter-markdown.** `stories/README.md` records the
  deliberate change ("pure-YAML → frontmatter-markdown"); the studio renders the markdown bodies;
  the orchestrator's `node-spec.ts` loads the frontmatter. ADR-0013's "required migration" produced
  exactly **one** converted unit — `stories/studio/browse-library.yaml`, a pure-YAML duplicate of
  the live `browse-library.md`, opening with "THIS yaml is the source of truth" — and stalled.
  `packages/core`'s `validate-corpus.ts` *(now `packages/cli/scripts/validate-corpus.ts` —
  `packages/core` dissolved by ADR-0068)* walked `stories/` for `.yaml`/`.yml` files and found only
  that straggler.

The open-question `oq-corpus-source-format` named the drift. An earlier session leaned toward
option B (document the split — ADR-0013's library-tier scope note was that patch), but the owner's
answer is **A**: commit to ONE structured source format and make the claims literally true. The
2026-06-13 clarification fixes the format: **JSON**.

## Decision

1. **JSON is the single structured source format for the corpus.** Live artifact state is JSONB in
   the shared store (ADR-0017/0023); the on-disk seed/export is `knowledge.json` (ADR-0018); both
   zod-validated at write. Where a future corpus document needs a standalone structured source
   (exports, drafts like `docs/research/agent-artifacts-draft.json`), it is JSON. ADR-0013's
   structured-source / markdown-as-view principle is unchanged — only the encoding wording flips.

2. **The pure-YAML work-unit migration is retired, not finished.** Story and capability files stay
   **frontmatter-markdown** — that is the work-hierarchy surface, deliberately so
   (`stories/README.md`; out of this question's scope and not reopened here). YAML survives only as
   **embedded frontmatter syntax** inside markdown files (story/capability frontmatter, ADR
   frontmatter per ADR-0037 §1) — never as a standalone corpus document format.

3. **The straggler is removed and the gate flips polarity.** `stories/studio/browse-library.yaml`
   (the one ADR-0013-era conversion; its `.md` sibling is the live representation) is deleted.
   `packages/core/scripts/validate-corpus.ts` *(now `packages/cli/scripts/validate-corpus.ts`,
   ADR-0068)* inverts from "validate every YAML unit" into a
   fail-closed guard: any standalone `.yaml`/`.yml` under `stories/` fails CI, citing this ADR.
   `loadUnit` (the YAML-file unit loader, whose only consumer was that walker) is removed; the
   `Unit` zod schema and `parseUnit` stay — the schema validates structured data, not a file
   format.

4. **Lifecycle bookkeeping recorded here:** `oq-corpus-source-format` is retired from the live
   store, its operator answer marked resolved, and the seed (`knowledge.json` + generated
   `assets.json`) updated to match — the same ceremony as ADR-0037 §6's retirements.

## What this does NOT decide

- **No DB→seed export pipeline.** `knowledge.json` remains the migration seed; exporting live state
  back to it is separate, later work (ADR-0023's posture unchanged).
- **The stories' format is not reopened.** Frontmatter-markdown for work units is reaffirmed as
  deliberate, not decided anew — this ADR only retires the never-executed plan to convert them to
  pure YAML.
- **ADRs stay git markdown** with YAML frontmatter (ADR-0037; reaffirming "ADRs = source" from
  ADR-0017).

## Consequences

- The stale claims sweep lands with this ADR: `packages/core/src/schema.ts`'s header ("a unit is
  structured YAML"), `packages/orchestrator/src/node-spec.ts`'s `loadUnit` contrast comment,
  `validate-corpus.ts`'s purpose line, and ADR-0013's Status section (incoming supersession note).
- `pnpm --filter @storytree/core validate` / `test` keep their wiring; the script now guards the
  no-pure-YAML-units invariant instead of validating one dead file.
- The open-question count in the live store drops to zero — the first time since the library
  migrated (ADR-0021). The ADR-0037 §5 gate on `story build library --live` unblocks.
