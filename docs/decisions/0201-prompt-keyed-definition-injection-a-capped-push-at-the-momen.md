---
status: proposed
---
# ADR-0201: Prompt-keyed definition injection — a capped push at the moment of use

## Status

proposed — direction decided in the 2026-07-16 token-efficiency investigation (the owner asked
for this unit); awaiting owner ratification of the mechanism as landed.

## Context

The Library's knowledge architecture is pull-based (ADR-0023): agents look terms up just-in-time
with `storytree library artifact <id>`, and the always-present glossary view was deliberately
retired (ADR-0135). The pull architecture is right for BODIES — but the 2026-07-16 trace mining
(host transcripts under `~/.claude/projects`) quantified what a single mid-session pull costs in
an interactive session: every tool round-trip re-bills the whole accumulated context as
cache-read, so one term lookup runs ~52k tokens of fixed overhead plus ~180–210k cache-read in a
mature main session — roughly 200k tokens to fetch a ~220-token definition body. The `oneLine`
field of that same definition is ~40–60 tokens. When an agent hits an unfamiliar term in a
prompt, it either spends that round-trip or (worse) guesses.

There are 48 `definition` artifacts; title == id == the term (`verdict`, `arc`, `proof-mode`).
ADR-0156's trace study (2,231 runs) already established that one-line assertions beat inlined
bodies for agent guidance.

`UserPromptSubmit` hooks were unused in this repo; hook stdout is prepended to the model's
context (the same channel `ambient-presence-entry.ts` relies on at SessionStart). The
ambient-presence audit (`auditHookConfig`, `packages/drive`) bars PRESENCE hooks from blocking
events including `UserPromptSubmit`; a content-injecting hook is outside its scope and the audit
is unchanged.

## Decision

A `UserPromptSubmit` hook (`.claude/settings.json`) runs `packages/cli/definition-injection.mjs`
on every prompt submit. The script:

1. reads the hook stdin JSON, takes `prompt`;
2. matches the prompt text against every definition's surfaces — id, title, and each
   slash-separated title part — word-boundary, case-insensitive, hyphen/space-equivalent,
   plural-tolerant;
3. injects, for the matched definitions only, the `oneLine` field (never `whatItIs` /
   `whatItIsNot` — ADR-0156) plus one shared pull-pointer line
   (`storytree library artifact <id>`) for the full body;
4. caps the injection at **5 matches**, most-specific (longest matched surface) first, so a
   term-dense prompt cannot front-load the corpus;
5. no match ⇒ empty output — most prompts pay zero.

Implementation constraints (load-bearing, not incidental):

- **Bare Node, zero non-builtin deps** (the `provision-worktree.mjs` pattern): the hook blocks
  the model's response on every prompt; measured on the dev box, a tsx boot is ~1 s where bare
  node including the seed-corpus parse is ~150–200 ms (a ~246 KB pasted-log prompt still runs
  ~170 ms). It also keeps working in a fresh worktree that has no node_modules yet.
- **Offline, seed-corpus data source**: reads `apps/studio/data/knowledge.json`, never the live
  DB. A seed `oneLine` can lag a live CLI edit until the next export (ADR-0120); a slightly
  stale one-liner still beats a 200k-token lookup, and the pointer always pulls the live body.
- **Fail-safe hook contract** (the `presence-hook.sh` contract): always exit 0, silent on every
  failure path — malformed stdin, missing seed, anything.

The matcher/renderer are pure functions with a red→green contract
(`packages/cli/src/definition-injection.test.ts`), typed for TS consumers via a sibling
`.d.mts` (the `provision-worktree` pattern).

### Why this is not the retired glossary

ADR-0135 retired `docs/glossary.md` — an unconditional, full-corpus, standing preload — because
the pull model makes a standing glossary dead weight. This mechanism is the opposite shape on
every axis that made the glossary wrong:

- **keyed, not standing**: nothing is injected unless the term appears in the prompt just
  submitted — it fires at the moment of use, as term disambiguation;
- **subset, not corpus**: only matched terms, hard-capped at 5 of 48;
- **one line, not bodies**: ~40–60 tokens per match (ADR-0156 applied); the full body stays
  pull-based behind the pointer;
- **the push replaces a pull that was about to happen anyway**: the injection substitutes a
  ~200k-token round-trip with ~50 tokens, rather than adding standing context on the bet it
  might be used.

This is the first push layer over the pull architecture, and deliberately the narrowest one
possible.

### Alternatives rejected

- **Stay pull-only** — the quantified cost above, paid per lookup, forever.
- **Inject matched bodies** — directly against ADR-0156's evidence.
- **DB-backed matching** — a per-prompt blocking hook cannot afford connector latency or require
  the DB to be up; the offline seed wins.
- **tsx entry** — ~1 s of added latency on every prompt submit for zero functional gain.

## Consequences

- Terms ubiquitous in this repo's prompts (`story`, `gate`, `run`) will match often; the cap
  plus longest-first ranking keeps them from crowding out specific terms. If they prove noisy, a
  stoplist is a one-line follow-up, not a redesign.
- The seed corpus is now read on every prompt submit, which slightly raises the value of keeping
  the seed export current (`library export-corpus --pg`, ADR-0120).
- The ambient-presence audit stays as-is; presence hooks remain barred from `UserPromptSubmit`.
- This sets the precedent that push injections over the pull architecture must be prompt-keyed,
  capped, and one-line — any future push layer should be measured against this ADR's bar.

## References

- ADR-0023 (pull-based library), ADR-0135 (glossary retired), ADR-0156 (one-line assertions
  beat inlined bodies), ADR-0120 (live→seed export).
- `packages/cli/definition-injection.mjs` (+ `.d.mts`, `src/definition-injection.test.ts`),
  `.claude/settings.json` (`UserPromptSubmit`).
- Precedents: `packages/cli/provision-worktree.mjs` (bare-node hook entry),
  `packages/drive/src/ambient-presence-entry.ts` (hook stdout → model context).
