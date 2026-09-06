/**
 * THE SECOND CUT — what a window's tool output was ABOUT, beside what record type carried it
 * (ADR-0524; `context-window-composition-arc`).
 *
 * The composition fold next door classifies a window by RECORD TYPE: tool output ~56%, thinking
 * ~22%, tool calls ~13%, and so on. That cut is right for `storytree context`, whose remedy line
 * rests on it, and it cannot answer the question the replay panel's bar has to answer — because
 * **knowledge-graph reads are not a category in it. They are inside `tool-output`.** This module is
 * the SUBJECT axis of that one slice, so the panel can highlight the share of the window the
 * traversal below it is drawing. It is a second CUT on one reader, never a second reader: the fold
 * makes one pass and asks this module about each `tool_use` it meets.
 *
 * ★ A LABEL AND A SHAPE, NEVER A BODY. The tool NAME is a label. For a command-carrying tool the
 * argv SHAPE is read — a launcher token, an area, a verb — and the command is neither stored nor
 * forwarded, exactly as `decision-reads.ts` already reads shell segments to recover decision reads.
 * What leaves here is a category and, for a knowledge-graph read, the surface's name. ADR-0235
 * clause 6's metadata-only rule is satisfied the same way it is there.
 *
 * ★★ RECOGNISED POSITIVELY, TOLERATING SHELL NOISE — and that is why it does not import
 * `observeCliInvocation`'s allowlist. That allowlist classifies a tokenised argv and REFUSES any
 * token its flag table does not name, which is right for argv and wrong for a transcript: a real
 * command carries `2>&1`, a `| head -30`, a trailing `;`. `scrapeCliDecisionReads` measured that
 * six of eight real store reads on this disk carry exactly that noise, so borrowing the argv
 * allowlist verbatim would decline most of the reads it was imported to find. This reads `(area,
 * verb)` pairs positively and ignores unrecognised trailing tokens, EXCEPT the write sub-verbs named
 * in {@link WRITE_SUB_VERBS} — a `library artifact <id> edit` is a write wearing a read's shape.
 *
 * ★★★ THE KNOWLEDGE-GRAPH SHARE IS AN UPPER BOUND ON WHAT THE PANEL DRAWS, never an estimate of it.
 * The traversal's marks come from `observeCliInvocation`, a strictly narrower allowlist that emits
 * no visit for some of these invocations. So a bar built on this over-states the picture below it
 * slightly, which is the safe direction for a surface whose whole purpose is to stop the picture
 * over-claiming. `docs/research/context-window-composition-2026-09-05.md` §2 measured the same
 * bound at 10.40% of tool output; this cut answers 9.0% over 559 window-keyed transcripts.
 */

/** What a tool call was ABOUT. Four subjects and an honest fifth for a result nothing claimed. */
export type ToolSubject =
  /** A `storytree` CLI read — the knowledge graph, which is what the traversal picture draws. */
  | "knowledge-graph"
  /** `Read`, `Grep`, `Glob`, `NotebookRead` — the repository's own files. */
  | "file-read"
  /** A command-carrying tool that was not a knowledge-graph read. */
  | "shell"
  /** Every other tool: web, browser, editors, agents. Named in the fold's `otherToolNames`. */
  | "other-tool"
  /** A `tool_result` whose `tool_use` was never seen — counted, never distributed into a subject. */
  | "unattributed";

const SUBJECT_LABEL = {
  "knowledge-graph": "knowledge graph",
  "file-read": "file reads",
  shell: "shell",
  "other-tool": "other tools",
  unattributed: "unattributed tool output",
} satisfies Readonly<Record<ToolSubject, string>>;

/** The plain-language name of a subject, for any surface that renders one. */
export function toolSubjectLabel(subject: ToolSubject): string {
  return SUBJECT_LABEL[subject];
}

/** The tools whose output IS a file. `Glob` returns paths rather than contents and still counts:
 * the subject is the repository's own files either way, which is what the segment names. */
const FILE_TOOLS = new Set(["Read", "Grep", "Glob", "NotebookRead"]);

/**
 * The sub-verbs of `library artifact` that make it a WRITE.
 *
 * ⚠ THREE, AND THE SHORTNESS IS THE POINT. This started as fifteen — `declare`, `done`, `settle`,
 * `close`, `push`, `origin`, `claim` and the rest — and the mutation rung showed twelve of them were
 * UNREACHABLE: this set is consulted at exactly one position, the third positional token of
 * `library artifact`, and no other verb in the CLI can appear there. Every unreachable entry was an
 * unkillable mutant, which is what an unreachable guard looks like from the outside. The write verbs
 * of OTHER areas are already excluded by those areas' own branches, which accept read sub-verbs by
 * name; `--set` anywhere is caught separately. `history` is deliberately absent — it reads the
 * artifact's change log, which is knowledge-graph content whatever else it is.
 */
const WRITE_SUB_VERBS: ReadonlySet<string | undefined> = new Set(["new", "edit", "retire"]);

/**
 * The token that identifies a storytree CLI invocation, however it was launched.
 *
 * Deliberately the same rule as `decision-reads.ts`'s `isStorytreeLauncher`, and deliberately NOT
 * imported from it: that module is the decision-log reader and this one is the composition's, so
 * sharing a private helper across them would couple two folds that answer different questions. The
 * rule is four lines wide and both are asserted against `pnpm storytree`, a bare `storytree`, and
 * the two in-repo entry points.
 */
function isStorytreeLauncher(token: string): boolean {
  const normalised = token.replace(/\\/g, "/").toLowerCase();
  // `slice(lastIndexOf + 1)` rather than `split("/").pop() ?? ""`: the fallback there was
  // unreachable (a split never yields an empty array), which the mutation rung reports as a mutant
  // no test can kill — the shape an unreachable branch takes when seen from outside.
  const base = normalised.slice(normalised.lastIndexOf("/") + 1);
  return (
    base === "storytree" ||
    normalised.endsWith("cli/src/main.ts") ||
    normalised.endsWith("cli/launch.mjs")
  );
}

/** Split a command on the separators that begin a new command — a pipeline's stages included, since
 * `pnpm storytree library artifact x | head -40` is a read whichever stage the launcher sits in. */
function shellSegments(command: string): string[] {
  return command.split(/(?:\|\||&&|[|;\n])/g);
}

/**
 * The storytree knowledge-graph READ surface a command reaches, or `null` when it reaches none.
 *
 * Returns the surface's own name (`library-artifact`, `arc`, `adr`, …) rather than a boolean, so a
 * caller can say WHICH part of the graph was read without a second parse. A command naming several
 * segments answers with the first read it finds: the fold counts BYTES per call, and one call's
 * output cannot be split between two surfaces without inventing a division.
 */
export function storytreeReadSurface(command: string): string | null {
  for (const segment of shellSegments(command)) {
    // `match(/\S+/g)` rather than `split(/\s+/).filter(…)`: one expression that cannot produce an
    // empty token, where the split-then-filter pair spread the same rule across two places and left
    // the `\s+` half unkillable (filtering empties makes `\s+` and `\s` identical). An empty token
    // is not cosmetic — it takes a POSITIONAL slot, so `storytree library ` with a trailing space
    // would read `sub` as `""` and decline the dashboard. `matchAll` rather than `match(…) ?? []`
    // because a no-match yields an empty iterator rather than `null`: no fallback to spell, and so
    // no fallback whose contents no test could ever distinguish.
    const tokens = [...segment.matchAll(/\S+/g)].map((match) => match[0]);
    const launcher = tokens.findIndex(isStorytreeLauncher);
    if (launcher === -1) continue;
    // Flags are dropped rather than parsed: `--pg`, `--json`, `2>&1` and a `--set` VALUE all sit in
    // positions this table never reads. `--set` itself is caught as a write sub-verb below.
    const argv = tokens.slice(launcher + 1);
    const positional = argv.filter((token) => !token.startsWith("-"));
    // No `area === undefined` guard: with no positional token every comparison below is false and
    // the loop falls through to the same `continue`. The rung reported it as an unkillable mutant,
    // which is what a guard with no effect looks like from outside.
    const [area, sub, third] = positional;

    // A write flag anywhere in the invocation disqualifies it, however read-shaped the verbs are.
    if (argv.some((token) => token === "--set" || token.startsWith("--set="))) continue;

    if (area === "library") {
      if (sub === undefined) return "library-dashboard";
      if (sub === "artifact") {
        // The set ACCEPTS `undefined` (see its declaration), so there is no guard and no `?? ""`
        // fallback here. Both spellings left a mutant nothing could kill — a missing third token can
        // never be IN the set however the check is written — and the type is where that belongs.
        if (WRITE_SUB_VERBS.has(third)) continue;
        return "library-artifact";
      }
      if (sub === "search") return "library-search";
      if (sub === "related" || sub === "query") return "library-query";
      if (sub === "tree") return "library-tree-focus";
      if (sub === "inbound") return "library-inbound";
      continue;
    }
    if (area === "arc") {
      if (sub === undefined || sub === "show" || sub === "list") return "arc";
      continue;
    }
    if (area === "adr") {
      if (sub === "list" || sub === "pull" || sub === "show") return "adr";
      continue;
    }
    // Every row below was OBSERVED in this machine's transcripts (the counts are in
    // `docs/research/knowledge-graph-phase-hypothesis-2026-09-06.md` §3). Two speculative rows —
    // `increment` and `resteer` — were removed: they scored ZERO across 4,232 window-keyed
    // transcripts, so they were a table entry nothing could kill and nothing could confirm. An
    // unevidenced row is not free: it is a claim about traffic, and a wrong one silently moves bytes
    // out of `shell` into a named segment.
    if (area === "question" && (sub === "list" || sub === "show")) return "open-question";
    if (area === "friction" && (sub === "list" || sub === "show")) return "friction";
    if (area === "agents") return "agents";
    if (area === "tree") return "tree";
  }
  return null;
}

/** What one `tool_use` block was about. */
export interface ToolSubjectRead {
  readonly subject: ToolSubject;
  /** The knowledge-graph surface's name, or `null` for every other subject. */
  readonly surface: string | null;
}

/**
 * Classify one `tool_use` by SUBJECT, from its name and the shape of its input.
 *
 * Command-carrying tools are matched on the INPUT shape rather than the tool NAME — the same choice
 * `readsFromToolUse` makes next door — so a renamed or a second shell tool is still read as shell
 * rather than silently becoming `other-tool`.
 */
export function classifyToolSubject(
  name: string,
  input: Record<string, unknown>,
): ToolSubjectRead {
  if (FILE_TOOLS.has(name)) return { subject: "file-read", surface: null };

  const command = input.command;
  if (typeof command === "string") {
    const surface = storytreeReadSurface(command);
    if (surface !== null) return { subject: "knowledge-graph", surface };
    return { subject: "shell", surface: null };
  }

  return { subject: "other-tool", surface: null };
}
