/**
 * The `storytree` CLI areas — the top-level positional the {@link import("./commands.js").run}
 * dispatch branches on (the first `argv` word). This is the SINGLE SOURCE for that set: the
 * dispatch's `unknown area` error message and the `check:surface-coverage` gate (ADR-0154) both read
 * it, so the enumerated CLI surface can never drift from what the dispatch actually accepts.
 *
 * "Areas", not every nested subcommand: the surface-coverage gate resolves a `storytree <…>` surface
 * at AREA granularity (a process naming `storytree library artifact new` resolves iff `library` is a
 * real area). Sub-verbs are a deliberate judgement the gate does not adjudicate (ADR-0154: the gate
 * gates the bijection, never whether a command *should* exist).
 */
export const CLI_AREAS = [
  "library",
  "agents",
  "orchestrate",
  "noticeboard",
  "branch",
  "tree",
  "worktree",
  "witness",
  "attest",
  "uat",
  "gate",
  "adopt",
  "build",
  "coverage",
  "ownership",
  "node",
  "story",
  "drift",
  "adr",
  "arc",
  "question",
  "increment",
  "proposal",
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
] as const;

export type CliArea = (typeof CLI_AREAS)[number];
