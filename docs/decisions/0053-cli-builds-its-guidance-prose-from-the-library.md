---
status: accepted
decided: 2026-06-14
amends: [23]
---
# ADR-0053: CLI builds its guidance prose from the library

## Status

accepted (2026-06-14; flipped from proposed 2026-06-21 under [ADR-0084](0084-agents-may-flip-an-adr-green.md)) — owner steer in conversation: *"CLI guidance is the end-state of most prose
where possible, injected on demand like a choose-your-own-adventure story"* — because the more static
instruction we carry, the less reliably sessions follow it. This generalises
[ADR-0023](0023-library-cli-choose-your-own-adventure.md) from *"the Library commands pull from the
Library"* to *"**all** CLI guidance prose is library-sourced and pulled on demand"*, and reuses the
render-from-the-library mechanism [ADR-0051](0051-agent-renderer-shapes-claude-md.md) built for agent
prompts.

**Amends** [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — extends its choose-your-own-
adventure / pull-on-demand stance from the Library CLI's *own* commands to the CLI's *doctrine prose*
generally; it does not overturn anything in ADR-0023 (the envelope contract, explore-to-earn-the-context,
and the Library-CLI surface all stand). ADR-0023 stays `accepted`.

## Context

The CLI is the agent's primary interface to the project. ADR-0023 made the **Library** commands an
exploratory, just-in-time surface: every command returns an envelope (`result` + applicable
**doctrine** as pointers INTO the Library + `next`), "explore to earn the context." But the CLI's own
guidance prose — the doctrine it surfaces, the help bodies — was still **hard-copied** into TypeScript
string literals. The clearest case: `EDIT_FIRST` in `packages/cli/src/commands.ts` literally restated
the [`edit-first-curation`](../../apps/studio/data/knowledge.json) artifact's gloss.

That is exactly the failure [`reference-dont-restate`](0029-agents-as-library-artifact-category.md)
(ADR-0029 §7) names: durable discipline copied into N bodies means an edit to the source leaves N−1
stale copies, and no consumer knows which copy is canonical. Two more forces:

- **Static instruction is followed less reliably than pulled context.** The owner's standing
  observation: the more fixed prose we push at a session up front, the less of it actually shapes
  behaviour ([`pull-based-context-architecture`](0011-own-the-agent-loop-and-context-engineering.md)).
  Guidance the agent *pulls* at the step that needs it lands; guidance dumped in a help string does not.
- **[ADR-0051](0051-agent-renderer-shapes-claude-md.md) already proved the mechanism.** The agent
  renderer assembles an agent's system prompt by INJECTING the content its library refs point at, and
  CLAUDE.md's operating-discipline region is a *generated view* of a library artifact. The same
  render-from-the-library primitive (`renderStoredDoc`) should source the CLI's doctrine prose.

## Decision

**Durable behavioural / doctrine prose in the CLI is sourced from the Library and rendered on demand;
the command grammar stays in code.** Concretely:

1. A small `renderDoctrine(store, id)` helper (`packages/cli/src/doctrine.ts`) pulls a unit's one-line
   gloss from the store and appends the canonical explore command —
   `<id> — <gloss>  (storytree library artifact <id>)`. It is **offline by construction** (reads
   whatever `Store` it is handed — the in-memory seed by default, the live `--pg` store otherwise, the
   `agents.ts` pattern) and **fail-soft** (a missing id or a store error yields a bare pointer line,
   never blank, never a throw). It preserves the ADR-0023 §4 envelope contract: doctrine is a *pointer*
   the agent drills into, never the body inlined.
2. Envelope `doctrine` that restated a Library unit now renders it on demand. Editing the artifact
   updates the CLI; there is no hard-copied literal to drift.

### The line: doctrine prose vs command grammar (in / out of scope)

| Sourced from the Library (doctrine prose) | Stays hard-coded (command grammar) |
|---|---|
| The *why/how* an envelope surfaces as `doctrine` (e.g. edit-first, the live store is the edit surface) | Usage syntax: `storytree library artifact edit <id> --set <field>=<value>` |
| The "explore just-in-time, drill in to earn the detail" stance (pull-based / choose-your-own-adventure) | Subcommand lists and one-line "what each command does" |
| A standing behavioural rule a consumer must follow | Flag descriptions, `(coming soon: …)` markers, mode-pickers |
| | Error messages naming a specific bad input (`unknown category "x"`) |
| | Command-specific *operational* output (e.g. the `--dry-run`/`--live`/`--real` honest-framing blocks: what THIS run actually proved) |

The discriminator: **if the sentence is durable cross-cutting doctrine that also belongs in a Library
unit, render it from the Library; if it is the command's own grammar or a description of what this
specific invocation did, it stays in code.**

### The dedupe map (the audit behind this ADR)

Inventory of hard-coded prose in `packages/cli/src/` against the Library:

- **Deduped → now rendered from the Library:**
  - `EDIT_FIRST` const → [`edit-first-curation`](0023-library-cli-choose-your-own-adventure.md)
    (`listCategory`, `newArtifact` ×2).
  - `topHelp` / `libraryHelp` / `dashboard` "choose-your-own-adventure / context is just-in-time"
    doctrine → [`pull-based-context-architecture`](0011-own-the-agent-loop-and-context-engineering.md).
  - `notWritable` write-refusal *why* → `live-store-is-the-edit-surface`.
- **Kept hard-coded (command grammar):** every help body's subcommand list + usage + flag prose
  (`artifactHelp`, `treeHelp`, `treeViewHelp`, `noticeboardHelp`, `nodeHelp`, `storyHelp`, `adrHelp`,
  `attestHelp`, `agentsHelp`); error/usage strings; the `notWritable` mechanical how-to (`--pg`, `pnpm db:up`).
- **Command-specific operational prose (kept; not corpus doctrine):** the `HONEST_FRAMING_*` blocks in
  `node-build.ts` / `story-build.ts` describe what a given dry-run / live / real build *actually
  proved* — output about one execution, governed by `observability-first`, not cross-cutting doctrine
  to restate elsewhere.
- **Graduation candidate (flagged, not acted):** the "honest framing — a command states what it
  actually proved, never more" discipline has no Library home; if it recurs it is a candidate `pattern`.

## Consequences

- **One source of truth.** Edit a doctrine artifact and every CLI surface that cites it updates — no
  hand-copy to drift, the [`reference-dont-restate`](0029-agents-as-library-artifact-category.md) win.
- **Offline stays whole.** `renderDoctrine` reads the in-memory seed by default, so every doctrine
  pointer resolves in CI and the ephemeral web container with no DB; `--pg` reads the live store.
- **Fail-soft, never a new failure mode.** A stale/renamed id degrades to a bare pointer line; it
  never blanks a doctrine line or crashes a command. (Trade-off: a genuinely wrong id is silent rather
  than loud — acceptable for a *pointer* whose worst case is a less-helpful nudge.)
- **A small extra store read per doctrine line** (one `getDoc`), negligible against the offline seed.
- **Follow-up — the principle + the guidance-writers.** This decision should also live as a first-class
  citable Library `principle` (working id `cli-is-the-guidance-surface`: *the CLI is the guidance
  surface — build prose from the Library, don't restate it; the end-state of durable prose is a Library
  artifact the CLI renders on demand*), referenced from the guidance-writer agents (`guidance-curator`,
  `librarian-curator`, `graduation-synthesist`) alongside `pull-based-context-architecture` and
  `reference-dont-restate`. **Blocked / owner call:** those agents currently exist only in the seed
  (`knowledge.json`), not in the live store — the live agent tier still carries the pre-reshape ids
  (`library-curator`, `library-investigator`, `agent-signal-synthesis`), so the live `--pg` edit ADR-0023
  §11 prescribes has no live target. The new principle's exact wording and the seed↔live reconciliation
  are owner-held (see the open seed→live agent-tier reconciliation).

## References

- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the Library CLI as a choose-your-own-
  adventure, just-in-time interface (amended here).
- [ADR-0029](0029-agents-as-library-artifact-category.md) §7 — reference-don't-restate.
- [ADR-0051](0051-agent-renderer-shapes-claude-md.md) — the agent renderer; render-from-the-library
  for prompts (the precedent generalised here).
- [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) — pull-based, just-in-time context.
- [ADR-0017](0017-cross-cutting-knowledge-tier.md) — the Library tier as the durable DRY layer.
- Code: `packages/cli/src/doctrine.ts` (`renderDoctrine`), `packages/cli/src/commands.ts`,
  `packages/store/src/render-doc.ts` (`renderStoredDoc`), `packages/cli/src/agents.ts` (the precedent).
- Library: `edit-first-curation`, `pull-based-context-architecture`, `reference-dont-restate`,
  `live-store-is-the-edit-surface`.
