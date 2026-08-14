/**
 * The `storytree` CLI areas — the top-level positional the {@link import("./commands.js").run}
 * dispatch branches on (the first `argv` word). This is the SINGLE SOURCE for that set: the
 * dispatch's `unknown area` error message and `surface-coverage-gate.ts`'s area-granularity
 * resolution (ADR-0154) both read it.
 *
 * BEING READ IS NOT BEING ENFORCED, and this header used to claim otherwise — it asserted the
 * enumerated surface "can never drift from what the dispatch actually accepts", which nothing
 * checked. It had drifted in BOTH directions at once, and each direction rotted on its own schedule:
 *
 *   • `write-authority` (ADR-0257/0284) was DISPATCHED and never enumerated — a working, documented
 *     command (CLAUDE.md instructs it) that the repo's own list of its CLI surface did not contain.
 *   • `proposal` was ENUMERATED and no longer dispatched — a real area added by ADR-0287 whose arm
 *     ADR-0298 deleted (commit `e010e042`) without touching this file, so the list went on promising
 *     a command that had been deliberately removed.
 *
 * That second shape is the one worth naming: a stale entry is not merely untidy. `resolveCommandPath`
 * judges a prescribed `storytree <area> …` against this tuple, so an area listed here resolves as
 * REAL — the enumeration vouches for a command that answers `unknown area` when an operator runs it.
 *
 * WHAT ENFORCES IT NOW: `cli-areas.test.ts` (rides `pnpm -r test`), binding this tuple to the
 * dispatch in both directions — a source scan of the dispatch's own `area === "…"` / `area !== "…"`
 * branches for exact set equality, and a behavioural probe that drives `run([area, "--help"])` for
 * every member and rejects the `unknown area` envelope. Add an area to the dispatch without adding
 * it here (or leave one here after deleting its arm) and that test reds, naming the direction.
 *
 * "Areas", not every nested subcommand: surface-coverage resolves a `storytree <…>` surface at AREA
 * granularity (a process naming `storytree library artifact new` resolves iff `library` is a real
 * area). Sub-verbs are a deliberate judgement it does not adjudicate (ADR-0154: it gates the
 * bijection, never whether a command *should* exist).
 */
export const CLI_AREAS = [
  "library",
  "agents",
  "orchestrate",
  "noticeboard",
  "branch",
  "tree",
  "worktree",
  // `storytree write-authority [install|codex]` — install/inspect the session-isolation write wall
  // (ADR-0257 D1/D6, narrowed to the static deny block by ADR-0284; `codex` is ADR-0355). Offline,
  // no store. Administrator-facing rather than day-to-day, which is how it stayed dispatched but
  // unenumerated: nothing that reads this tuple is reached by the people who run it.
  "write-authority",
  "witness",
  "attest",
  "uat",
  "gate",
  "adopt",
  "build",
  "coverage",
  "ownership",
  // `storytree own` — this session's inventory of the background work it is still running, and the
  // verified reclaim of it (`shared-box-session-ownership-arc` inc 1-2). Offline, no store: both the
  // question and the cleanup are asked at the END of a session, exactly when a session must not
  // depend on a database being up in order to finish honestly. `stop` writes only to the registry,
  // and only for rows this session owns.
  "own",
  "node",
  "story",
  "drift",
  "adr",
  "arc",
  "question",
  "increment",
  // (`proposal` sat here until ADR-0298 retired the kind and folded deferred work into arcs. Its
  // dispatch arm went in `e010e042`; the entry outlived it by eleven days. Parked work is an
  // `increment` doc now — `storytree arc increment new`.)
  "desktop",
  "onboarding",
  "friction",
  // `storytree factory health` — the report-only factory-floor health instrument (ADR-0316).
  "factory",
  // `storytree session-cost` — the repeatable session-cost measurement (ADR-0323 D4). Report-only
  // and deliberately NOT a gate rung; it reads host transcripts, never the store.
  "session-cost",
  "doctor",
  "guide",
  "traversal",
  // `storytree dispatch <handle>` — the caller's half of the ADR-0328 D3 handback: read a
  // backgrounded job's verdict ONCE, and report RUNNING / UNVERIFIED as non-verdicts rather than
  // folding them into a pass. Read-only, offline, no store.
  "dispatch",
] as const;

export type CliArea = (typeof CLI_AREAS)[number];
