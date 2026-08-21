---
id: "transcript-session-correlation"
tier: capability
story: context-traversal-transcript
arc: linked-session-context-arc
title: "A storytree session resolves to the host windows written inside its worktree"
outcome: "A storytree session id resolves to the host transcript windows written inside its worktree, each named separately."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [235, 241, 248]
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/context-traversal-transcript", "test"]
  scope:
    testGlobs: ["packages/context-traversal-transcript/src/correlate-transcripts.test.ts"]
    sourceGlobs: ["packages/context-traversal-transcript/src/correlate-transcripts.ts"]
  real:
    testFile: "packages/context-traversal-transcript/src/correlate-transcripts.test.ts"
    sourceFile: "packages/context-traversal-transcript/src/correlate-transcripts.ts"
    scope:
      testGlobs: ["packages/context-traversal-transcript/src/correlate-transcripts.test.ts"]
      sourceGlobs: ["packages/context-traversal-transcript/src/correlate-transcripts.ts"]
    install: true
    proofCommand:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "test"]
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/context-traversal-transcript", "typecheck"]
---

# A storytree session resolves to the host windows written inside its worktree

## Guidance

Author the four contracts below under these ids, VERBATIM — the leaf's test titles must START with
the contract id:
`correlation-is-the-exact-worktree-final-segment`,
`a-prefix-or-a-parent-checkout-never-correlates`,
`an-uncorrelated-session-is-empty-and-says-so`,
`every-correlated-window-is-named-and-ordered-separately`.

**The problem this solves.** A host transcript session id is a harness-minted UUID; a storytree
`sessionId` is the basename of a `.claude/worktrees/<name>` git toplevel (`deriveIdentity()` in
`@storytree/drive`). Nothing joins them directly. What DOES join them is the one fact both records
carry: the working directory. Every transcript line records the `cwd` it was written under, so a
transcript belongs to storytree session `S` exactly when it was written inside `S`'s worktree. That
join is deterministic and needs no new state, and it is precisely as strong as the identity rule it
mirrors — no stronger, which is why every clause below is asserted rather than assumed.

**Shape.** Export from `correlate-transcripts.ts`:

```ts
export interface CorrelatedWindow {
  /** The host session id recorded on the transcript's lines — this window's identity. */
  readonly windowId: string;
  /** Absolute path to the transcript file. */
  readonly file: string;
  /** The earliest `timestamp` seen on a correlating line, used only for ordering. */
  readonly firstObservedAt: string;
}

export interface TranscriptCorrelation {
  /** The storytree session id that was asked about, echoed back. */
  readonly sessionId: string;
  /** Every correlated window, oldest first. Empty is a normal result, never an error. */
  readonly windows: readonly CorrelatedWindow[];
  /** Every `*.jsonl` file considered — the honest denominator for "0 correlated". */
  readonly scannedFiles: number;
  /** Files that correlated but named only SUBAGENT windows, so they are absent from `windows`. */
  readonly sidechainFiles: number;
}

/** The host transcript root: `STORYTREE_TRANSCRIPT_DIR` when set, else `~/.claude/projects`. */
export function resolveTranscriptDir(): string;

export function correlateTranscripts(
  sessionId: string,
  location: { readonly dir: string },
): TranscriptCorrelation;
```

`resolveTranscriptDir()` mirrors `resolveTraversalDir()` in `@storytree/context-traversal-capture`
exactly — env always wins, a blank or whitespace-only override is ignored — and is NOT called by
`correlateTranscripts`, which takes an explicit `dir`. That split is what keeps every test in this
package HOME-independent.

**The scan.** `dir` holds one sub-directory per project, and a project holds transcripts at THREE
depths, not one — measured on disk 2026-08-21 across 631 project directories and 4,044 `*.jsonl`
files, counting directories descended below `dir`:

| depth | shape                                                      | files |
| ----- | ---------------------------------------------------------- | ----- |
| 1     | `<project>/<window>.jsonl`                                 | 2,970 |
| 3     | `<project>/<window>/subagents/<agent>.jsonl`               |   771 |
| 5     | `<project>/<window>/subagents/workflows/<wf>/<agent>.jsonl` |   303 |

Walk `dir` itself and its sub-directories to a bounded depth set ABOVE the deepest shape above, and
consider every `*.jsonl` found. A bound at one level reached the parent windows and none of the
1,074 subagent transcripts — it spent its level on `<window>/`, which holds no transcript at all,
and stopped one short of `subagents/`; a bound at three would still have missed the 303 workflow
files. Keep a bound (an unbounded walk of the transcript root is a real cost, and the scan reads
every file it finds), but keep it with headroom, so one further nesting level cannot silently
re-blind the scan. Do not follow anything that is not a real directory — recursing only on a true
directory entry already excludes a symlink or a Windows junction — and never infer a session from
the sub-directory NAME: the harness mangles a path into that name, and a mangled string is a
convention we do not own. The recorded `cwd` is the data; the directory name is decoration.

**Subagent transcripts are reached, counted, and never promoted to windows.** A subagent stamps its
PARENT's `sessionId` on every line (188/188 measured), carrying its own identity in `agentId` — which
is neither the filename nor reliably single-valued, so it is a marker and not an id. Admitting those
lines as window lines would mint a SECOND `CorrelatedWindow` bearing an id the parent's transcript
already claims, making `windows.length` count transcript FILES rather than windows. Build windows
from non-sidechain lines only, and report the rest in `sidechainFiles` so the omission is visible
rather than silent. Widening the scan is safe for attribution: of 1,074 subagent transcripts, ZERO
record a cwd inside a real storytree worktree other than their parent's. Two shapes correlate to
nobody and are omitted rather than guessed at — a subagent whose cwd pinned to the main checkout at
spawn (176 files), and a worktree-ISOLATED subagent, which gets its own `.claude/worktrees/agent-<id>`
and derives its own identity (57 files).

**The match rule, exactly.** A line correlates when its `cwd` is, or is inside, a directory whose
path ends with the segments `.claude`, `worktrees`, `<sessionId>` — accepting `/` and `\`
separators interchangeably (transcripts written on Windows record backslashes), tolerating a
trailing separator, and comparing the session segment for EXACT equality. `…/worktrees/foo-bar`
never correlates to `foo`, and a `cwd` in the main checkout never correlates to anything. A file
correlates when at least one of its lines does; `windowId` is the `sessionId` those lines recorded,
and a file whose correlating lines disagree about it is not correlated at all (the same
refuse-don't-guess rule `transcript-occupancy-extraction` applies to an ambiguous window).

**Never throws.** An unreadable directory, an unreadable file, a non-JSON line, a line with no
`cwd` — all are simply not matches. `scannedFiles` still counts every `*.jsonl` considered, so
"0 correlated out of 46 scanned" is a reportable fact rather than an indistinguishable silence.

**Metadata only (ADR-0235 clause 6).** A `CorrelatedWindow` carries the three fields above and
nothing else. The `cwd` itself is NOT carried out: it is a real filesystem path and this arc's
telemetry does not export paths. The `file` field is the path of the transcript we were pointed at,
which the caller already knows about, and it exists so the ingest can re-open it.

**Fences.** Read-only: this module never writes a file. No `@storytree/drive` import — in
particular, do NOT import or re-implement `deriveIdentity()`; this capability is handed a session id
and mirrors the SHAPE of that rule against a recorded `cwd`, which is a different operation from
deriving one from git. No occupancy arithmetic (that is
`transcript-occupancy-extraction`), no writing to a trace (that is `transcript-occupancy-ingest`),
no clock, no id generation, no retention or pruning.

**Files.** `packages/context-traversal-transcript/src/correlate-transcripts.ts` and
`correlate-transcripts.test.ts`. The package scaffold already exists — add nothing to
`package.json`, and do not touch `src/index.ts`.

## Contracts

1. **`correlation-is-the-exact-worktree-final-segment`**
   - **asserts —** over a temporary transcript root holding one project directory, a transcript whose
     lines record `cwd` `<tmp>/.claude/worktrees/target-session` correlates to session
     `target-session`; a sibling transcript recording the same path with BACKSLASH separators
     correlates identically; a transcript recording a path one level DEEPER
     (`…/worktrees/target-session/packages/cli`) also correlates; and each returned `windowId` is the
     host `sessionId` its own lines recorded, read off the returned value.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that only accepts forward slashes, against one
     that requires the `cwd` to equal the worktree root exactly (the deeper case would vanish), and
     against one that takes `windowId` from the file's BASENAME instead of the recorded `sessionId` —
     so the fixture's filename must deliberately differ from the session id it records.
2. **`a-prefix-or-a-parent-checkout-never-correlates`**
   - **asserts —** three negatives in the same root, each returning zero windows for session
     `target`: a transcript recording `<tmp>/.claude/worktrees/target-extra` (the session id is a
     strict PREFIX of the real segment), one recording the main checkout `<tmp>` with no
     `.claude/worktrees` segment at all, and one recording
     `<tmp>/.claude/worktrees/other/target` (the id appears, but not as the worktree segment).
     `scannedFiles` still counts all three.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation matching with `includes()` or `startsWith()` on
     the raw path (all three would correlate), and against one that matches the LAST path segment
     wherever it appears rather than the segment immediately after `.claude/worktrees`. A false
     correlation writes another session's window into this session's trace, which is the worst
     failure this capability has.
3. **`an-uncorrelated-session-is-empty-and-says-so`**
   - **asserts —** a session id with no matching transcript returns `windows: []` with
     `scannedFiles` equal to the real number of `*.jsonl` files present AT EVERY DEPTH THE HOST
     WRITES — including a file nested at the deepest `subagents/workflows/<wf>/` shape — and
     `sessionId` echoed back, without throwing; `sidechainFiles` is 0, so "nothing correlated" and
     "reached but omitted" stay distinguishable; a transcript root that does not exist at all
     returns `windows: []` and `scannedFiles: 0` — also without throwing; a DIRECTORY named like a
     transcript file is neither followed nor counted.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that throws on a missing root, against one that
     falls back to the newest or the largest transcript when nothing matches (a fallback would make
     every uncorrelated session silently adopt a stranger's window), and against one that reports
     `scannedFiles: 0` when files were in fact scanned — the denominator is what makes "0 correlated"
     honest rather than indistinguishable from "nothing to scan".
4. **`every-correlated-window-is-named-and-ordered-separately`**
   - **asserts —** two transcripts written under the SAME worktree `cwd`, recording two different
     host `sessionId`s and different first timestamps, return TWO `CorrelatedWindow` entries with
     distinct `windowId`s, oldest `firstObservedAt` first; and `JSON.stringify` of the whole
     `TranscriptCorrelation` contains no `cwd` value and no canary prose placed in the fixtures'
     message content; and a SUBAGENT transcript nested at the real `<window>/subagents/` depth, whose
     every line is a sidechain line stamped with the parent's session id, is scanned and counted in
     `sidechainFiles` while contributing NO second window bearing that parent's id.
   - **falsifiability —** a first run that comes back green is the diagnosis, not the result: this
     assertion must fail against an implementation that returns one merged entry, that de-duplicates
     by worktree instead of by host session, that returns them in readdir order (assert the ordering
     with fixtures whose FILENAMES sort opposite to their timestamps), against one that carries
     the recorded `cwd` out in the result, and against one that widens the scan WITHOUT excluding
     sidechain lines from window identity — which would surface the parent's id twice and inflate
     `windows.length` into a count of files. A storytree session id is worktree-derived and outlives any
     single runtime window, so merging two windows into one series would draw a bar that resets
     without explanation.

## Integration evidence

`packages/context-traversal-transcript/src/correlate-transcripts.test.ts` builds each transcript root
inside a fresh `fs.mkdtempSync(path.join(os.tmpdir(), …))` directory and removes it afterwards, so
the suite never reads the developer's real `~/.claude/projects` and is deterministic in CI. Every
assertion reads the `TranscriptCorrelation` the function RETURNED, and the negative contract asserts
`windows.length === 0` for each bad shape independently rather than over a single combined fixture,
so one over-broad match cannot hide behind another's absence.
