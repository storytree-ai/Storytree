---
status: accepted
decided: 2026-06-27
---
# ADR-0116: The storytree adopt command surface: adoption actions nest under a first-class adopt area

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation on 2026-06-27. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

ADOPTION — bringing a brownfield (`mapped`) story into the fold — is a proving process entered by a
deliberate human decision (ADR-0097: observe-and-sign the story's `observe` reliability gates +
machine UAT legs to `adopted` verdicts, then flip `mapped → proposed`; ADR-0106 classifies/routes the
UAT legs by witness). The engine for it (`adoptStory` / the pure-by-injection `runAdopt`) lives in
`@storytree/drive`, but until now it had only ONE driver: the studio's UI Adopt button. The terminal
CLI exposed only the *primitives* around it —

- `storytree gate run <story>#gate-<n> --pg` observe-and-signs ONE `observe` gate, and
- `storytree story adopt-plan <story>` was the read-only adoption-plan classification (ADR-0097 Layer 2),

— so an agent could not drive the WHOLE adoption flow from the CLI the way the studio worker can. The
`adopt.ts` engine comment had long anticipated "a future `storytree adopt` CLI command"; this is it.

Two forces had to be balanced. (1) The CLI proof surface had drifted and needed a coherent sweep:
the area rosters were inconsistent (the unknown-area guidance omitted `drift`), a JSDoc still pointed
at a CLI-local `./adr-frontmatter.js` that ADR-0112 moved into `@storytree/drive`, and `adopt-plan`
was filed under `story` even though it is an *adoption* action, not a build. (2) The `gate` area must
NOT be blanket-absorbed under `adopt`: an `observe` gate is earned BY adoption (observe-and-sign), but
a `build-tests` gate is earned by a real red→green BUILD (ADR-0098), not adoption — so `gate` spans
both the adoption and the build surface and cannot live wholly under `adopt`.

## Decision

Make `adopt` a first-class CLI area and nest the two genuinely-adoption actions under it:

- `storytree adopt <story-id> --pg` — RUN the full adoption: it drives the same `runAdopt` engine the
  studio's Adopt button drives (an ADDITIONAL driver, never a replacement), honouring every honesty
  wall already in `runAdopt`/`gate` (only a brownfield `mapped`/`proposed` story is adoptable; an
  `observe` gate must exist to sign; a fail-closed approver chain `--signer`/`--actor` →
  `STORYTREE_SIGNER` → git email; the live `--pg` store is required, refused offline with a
  `pnpm db:up` pointer; a clean committed HEAD is required because an `adopted` verdict pins the commit
  it observed — the `mapped → proposed` flip is the LAST step, dirtying the tree with one `status:`
  line for the operator to commit).
- `storytree adopt plan <story-id>` — the read-only, offline adoption-plan classification (the report
  formerly at `storytree story adopt-plan`).

`gate` stays its own area (it spans adoption + build). The CLI `adopt` driver is a thin
pure-by-injection DISPATCHER (`packages/cli/src/adopt.ts`) over `runAdopt` + `adoptPlanCommand`,
mirroring `gate`/`uat` so the routing is offline-testable; `commands.ts` wires the live seams (the
verdict store is the same `PgWorkStore` the sibling proof commands use under `--pg`). The studio's
`POST /api/adopt` is unchanged — it still imports `adoptStory` from `@storytree/drive/build`.

As part of the same unit, the CLI proof surface was swept for coherence: `adopt` (and the previously
missing `drift`) added to the top-help and unknown-area rosters; `story adopt-plan` removed and
replaced by an explicit redirect to `storytree adopt plan` (no silent breakage); `storyHelp` updated
to drop the adopt-plan block and point at the `adopt` area; the stale post-ADR-0112 `adr-frontmatter`
JSDoc fixed.

## Consequences

- Agents drive the COMPLETE adoption flow from the terminal with the same engine and honesty walls as
  the studio — closing the "studio-only Adopt" gap — and the proof surface reads as a coherent ladder
  (`attest` · `uat` · `gate` · `adopt` · `node` · `story`).
- The adoption-plan report is discoverable under its conceptual home (`adopt plan`), and the
  gate-vs-adopt boundary is now recorded here so it is not re-litigated (the recurring temptation is to
  fold `gate` under `adopt`).
- COST: `storytree adopt plan` is a guided breaking move from `storytree story adopt-plan` — the old
  path now returns a redirecting refusal, and any muscle-memory/script must update. One more area to
  keep consistent across the rosters.
- DELIBERATE LIMITATION: the CLI `adopt` run uses the session's `--pg` pool like `gate`/`uat` (no
  auto-`db:up`), so it needs `pnpm db:up` first — unlike the studio's long-running `adoptStory`, which
  self-wires `ensureLiveDb`. This is a consistency choice with the sibling proof commands, not an
  oversight; a future enhancement could add a preflight bring-up if it proves friction.

## References

- ADR-0097 (Adopt = the brownfield `mapped → proposed` proving-process entry), ADR-0106 (adopt
  classifies/routes UAT legs by witness), ADR-0085 (reliability gates / observe-and-sign), ADR-0098
  (build-tests gates earned by a real build — the gate-vs-adopt nuance), ADR-0094 (go-green status
  transitions), ADR-0023 (the library/CLI choose-your-own-adventure surface), ADR-0112 (the drive
  extraction — why the CLI keeps thin shims), ADR-0110 (owner-directed → born accepted).
- Code: `packages/cli/src/adopt.ts` (the dispatcher + help), the `adopt` area in
  `packages/cli/src/commands.ts`, `packages/drive/src/adopt.ts` (`runAdopt`/`adoptStory`),
  `packages/cli/src/adopt-plan.ts` (the classification, now under `adopt plan`).
