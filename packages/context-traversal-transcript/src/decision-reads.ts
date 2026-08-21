/**
 * Extracts DECISION-RECORD READS out of a host Claude Code transcript (JSONL), story
 * `context-traversal-transcript`, capability `transcript-decision-read-extraction`
 * (ADR-0403 / `adrs-into-the-dag-arc-inc-07`).
 *
 * ## WHY THIS EXISTS
 *
 * `observeCliInvocation` is an allowlist over `storytree` argv, and `adr` is not on it — nor could
 * it be, because there is no read verb for a decision record: an agent that wants ADR-0223 opens
 * `docs/decisions/0223-….md` with the ordinary file tool. So ZERO decision reads have ever reached
 * a traversal trace, while roughly a third of every reading list the corpus hands an agent points
 * into the decision log. The harness has nonetheless been writing all of those reads down the whole
 * time, in the same transcript files `correlate-transcripts.ts` already scans for occupancy. This
 * module is the missing extractor, and nothing more.
 *
 * ## THE NODE ID IS THE WHOLE POINT
 *
 * Every read mints `doc:decisions/NNNN-slug.md` — the corpus's OWN pointer form, byte-identical to
 * what `offerIdOf()` prints in an artifact's Sources block. That is load-bearing rather than
 * cosmetic: the caveat this work exists to retire
 * (`doc-refs-are-offered-but-follows-are-unobservable`, `offer-candidate-sets.ts`) says a `doc:`
 * ref is offered and a follow of one can never be seen. A read recorded under ANY other id form —
 * an absolute path, a bare number, a `decisions/` relpath — records a read that still does not join
 * to the offer, and closes nothing.
 *
 * ## THIS IS A FLOOR, NEVER A CENSUS
 *
 * Three read shapes are recovered and they are not equally strong evidence, which is why each gets
 * its own surface id rather than being flattened into one:
 *
 *   - `Read`  → an EXACT absolute `file_path`. Unambiguous.
 *   - `Grep`  → an exact `path`, when it names a FILE. A grep over a directory names no file and is
 *               invisible here.
 *   - shell   → SCRAPED out of an opaque command string. Recoverable only when the command names
 *               the path literally AND leads with a verb this module recognises as a read.
 *
 * The shell scraper is deliberately conservative and every decline is COUNTED BY VERB rather than
 * swallowed, because "we saw 920 shell reads" and "we saw 920 and declined 938 more segments, 479
 * of them `git`" are different claims and only the second one is honest. Under-reporting is this
 * arc's accepted failure mode; it is only acceptable when it is declared with its size.
 *
 * ## SIDECHAIN LINES ARE READ HERE, ON PURPOSE
 *
 * `readCorrelatingLines` (`correlate-transcripts.ts`) EXCLUDES sidechain lines from window
 * identity, and that exclusion is correct and must not be "fixed": a subagent transcript stamps its
 * PARENT's `sessionId` on every line, so admitting them there would mint duplicate occupancy
 * windows. For TOOL-CALL attribution the parent id is exactly the answer we want — the subagent
 * read that file on the parent session's behalf, inside the parent session's worktree. 58-68% of
 * the decision reads on this disk are sidechain reads, so a scan that dropped them would return
 * roughly half the answer and look complete doing it.
 */
import fs from "node:fs";

/** Which tool shape a read was recovered from — its own surface, because they differ in strength. */
export type DecisionReadShape = "read" | "grep" | "shell";

/** The surface id each shape's visit carries. Distinct per shape (see the header): a scraped shell
 * read and an exact `Read` are not the same quality of observation and must stay distinguishable. */
export const DECISION_READ_SURFACES: Readonly<Record<DecisionReadShape, string>> = {
  read: "host-transcript-file-read",
  grep: "host-transcript-grep",
  shell: "host-transcript-shell",
};

export interface DecisionRead {
  /** The storytree session the read belongs to, derived from the line's own `cwd`. */
  readonly sessionId: string;
  /** The host tool-call id (`toolu_…`) — stable, and this read's identity seed. */
  readonly toolUseId: string;
  /** `doc:decisions/NNNN-slug.md`, the corpus's own pointer form. */
  readonly nodeId: string;
  /** The tool call's ISO-8601 timestamp, carried through verbatim. */
  readonly at: string;
  readonly shape: DecisionReadShape;
  /** True when a SUBAGENT made the call. Kept, never dropped — it is most of the answer. */
  readonly sidechain: boolean;
}

/** One shell verb this module declined to treat as a read, with how many decision-naming segments
 * it declined. The size of a named blind spot, so it can be reported rather than discovered. */
export interface DeclinedShellVerb {
  readonly verb: string;
  readonly segments: number;
}

export interface DecisionReadScan {
  readonly reads: readonly DecisionRead[];
  /**
   * Tool calls that named a decision record but whose line recorded a `cwd` no storytree session
   * can be derived from — overwhelmingly the PRIMARY CHECKOUT, whose lobby `deriveIdentity()` rule
   * 3 refuses by design. Reached and not attributable, counted rather than silently dropped.
   */
  readonly uncorrelatedReads: number;
  /** Tool calls naming a decision record that carried no usable `id`, so no idempotent event could
   * ever be keyed on them. Always its own skip — see `readTranscriptWindow`'s identical rule. */
  readonly unidentifiedCalls: number;
  /** Shell segments that NAMED a decision record under a verb this module does not read, by verb. */
  readonly declinedShellVerbs: readonly DeclinedShellVerb[];
  /** Shell paths dropped because they sat immediately after a `>`/`>>` — a WRITE target, not a read. */
  readonly redirectTargets: number;
}

const EMPTY_SCAN: DecisionReadScan = {
  reads: [],
  uncorrelatedReads: 0,
  unidentifiedCalls: 0,
  declinedShellVerbs: [],
  redirectTargets: 0,
};

/**
 * A decision-record path, anywhere inside a larger string.
 *
 * The lookbehind refuses `…xdecisions/0001-a.md` while still accepting every real spelling —
 * `docs/decisions/…`, a Windows absolute `C:\…\docs\decisions\…`, and a bare `decisions/…` at a
 * token boundary. Both separators are accepted because transcripts on this platform record either.
 * The slug is lazy up to `.md` so a trailing `.md` inside a longer token cannot be swallowed.
 */
const DECISION_PATH = /(?<![A-Za-z0-9._-])decisions[/\\](\d{4})-([A-Za-z0-9_.-]*?)\.md/g;

/** The cheap pre-filter: a decision path is impossible without this substring, so a file (or a
 * command) lacking it can be skipped without reading it more closely. Exact, not heuristic. */
const DECISION_HINT = /decisions[/\\]/;

interface PathHit {
  readonly nodeId: string;
  /** Index of the `decisions` segment within the searched string — NOT of the whole path token. */
  readonly index: number;
}

/** Every decision record named in `text`, in order, as `doc:decisions/NNNN-slug.md` node ids. */
function decisionHitsIn(text: string): PathHit[] {
  const hits: PathHit[] = [];
  DECISION_PATH.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = DECISION_PATH.exec(text)) !== null) {
    hits.push({ nodeId: `doc:decisions/${match[1]}-${match[2]}.md`, index: match.index });
  }
  return hits;
}

/**
 * The node ids a single exact path names — the `Read`/`Grep` route. A path that names no decision
 * record returns `[]`, which is how a read of ordinary source stays out of this record entirely.
 */
export function decisionNodeIdsInPath(pathish: string): readonly string[] {
  return [...new Set(decisionHitsIn(pathish).map((hit) => hit.nodeId))];
}

/**
 * Shell verbs whose whole job is to put a file's CONTENT in front of the caller.
 *
 * Deliberately narrow. `git` is the largest single exclusion and it is excluded on purpose: one
 * verb spans `git show` (a read) and `git add` / `git checkout --` (not reads), and this arc would
 * rather miss 479 segments than record a staged file as a read. `ls`/`find` name a file without
 * reading it. `node`/`python` take a heredoc script whose body may write. Each decline is counted
 * by verb in {@link DecisionReadScan.declinedShellVerbs}, so the omission carries its own size.
 */
const SHELL_READ_VERBS: ReadonlySet<string> = new Set([
  "cat",
  "head",
  "tail",
  "less",
  "more",
  "nl",
  "od",
  "strings",
  "diff",
  "grep",
  "egrep",
  "fgrep",
  "rg",
  "awk",
  "wc",
  "sed",
  "get-content",
  "gc",
  "type",
]);

/**
 * Drops heredoc BODIES, keeping the line that opens them.
 *
 * The opening line still carries the command and its redirect (`cat > docs/decisions/X.md <<'EOF'`)
 * and must be classified; the body is arbitrary text — an ADR being WRITTEN, a PR description, a
 * Python program — and scraping it would record authored prose as a read. This is the single
 * largest false-positive source in the corpus, and it is structural rather than rare.
 */
function stripHeredocBodies(command: string): string {
  const kept: string[] = [];
  let terminator: string | null = null;
  for (const line of command.split(/\r?\n/)) {
    if (terminator !== null) {
      if (line.trim() === terminator) terminator = null;
      continue;
    }
    kept.push(line);
    const opener = /<<-?\s*(?:'([^']+)'|"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*))/.exec(line);
    if (opener !== null) terminator = opener[1] ?? opener[2] ?? opener[3] ?? null;
  }
  return kept.join("\n");
}

/**
 * Splits a command into segments, each of which is classified by its OWN leading verb.
 *
 * This is what makes the commonest real shape work: `cd <worktree> && cat docs/decisions/X.md`
 * leads with `cd` (1,173 of the decision-naming commands on this disk do), and a scraper reading
 * only the first verb would decline every one of them.
 */
function shellSegments(command: string): string[] {
  return stripHeredocBodies(command).split(/\|\||&&|;|\||\r?\n/);
}

/** The leading verb of a segment, lowercased and stripped of any directory prefix, after removing
 * leading `VAR=value` assignments and subshell punctuation. */
function verbOf(segment: string): string {
  let rest = segment.trim();
  for (;;) {
    const assignment = /^\(?\s*[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s+/.exec(rest);
    if (assignment === null) break;
    rest = rest.slice(assignment[0].length);
  }
  rest = rest.replace(/^[({\s]+/, "");
  const token = rest.split(/\s+/)[0] ?? "";
  const base = token.replace(/\\/g, "/").split("/").pop() ?? "";
  return base.toLowerCase();
}

/** `sed` is a read verb EXCEPT in place — `sed -i` rewrites the file it names. */
function isInPlaceEdit(segment: string): boolean {
  return /(?:^|\s)(?:-i(?:\.\S+)?|--in-place)(?:\s|$)/.test(segment);
}

/** Walk back from a match to the start of its whole path token, so a redirect immediately before
 * the token is visible even when the match itself sits mid-path (`> docs/decisions/X.md`). */
function pathTokenStart(segment: string, matchIndex: number): number {
  let index = matchIndex;
  while (index > 0 && !/[\s"'`;|&<>()]/.test(segment.charAt(index - 1))) index--;
  return index;
}

/** True when this path is the TARGET of a `>`/`>>` redirect — a file being written, never read. */
function isRedirectTarget(segment: string, matchIndex: number): boolean {
  return />>?\s*$/.test(segment.slice(0, pathTokenStart(segment, matchIndex)));
}

export interface ShellScrape {
  readonly nodeIds: readonly string[];
  readonly declinedVerbs: readonly string[];
  readonly redirectTargets: number;
}

/**
 * Scrape the decision records a shell command READ. Total and non-throwing.
 *
 * Everything about this is a floor: it recovers a read only when the command names the path
 * literally under a recognised read verb outside a heredoc body and not as a redirect target.
 * `$VAR` paths, globs, `find -exec cat`, and `git show <rev>:<path>` all name a file this returns
 * nothing for — that is the declared omission, not a defect to be widened later without saying so.
 */
export function scrapeShellDecisionReads(command: string): ShellScrape {
  if (!DECISION_HINT.test(command)) return { nodeIds: [], declinedVerbs: [], redirectTargets: 0 };

  const nodeIds = new Set<string>();
  const declinedVerbs: string[] = [];
  let redirectTargets = 0;

  for (const segment of shellSegments(command)) {
    const hits = decisionHitsIn(segment);
    if (hits.length === 0) continue;

    const verb = verbOf(segment);
    if (!SHELL_READ_VERBS.has(verb) || (verb === "sed" && isInPlaceEdit(segment))) {
      declinedVerbs.push(verb === "" ? "(none)" : verb);
      continue;
    }

    for (const hit of hits) {
      if (isRedirectTarget(segment, hit.index)) {
        redirectTargets++;
        continue;
      }
      nodeIds.add(hit.nodeId);
    }
  }

  return { nodeIds: [...nodeIds], declinedVerbs, redirectTargets };
}

/**
 * The storytree session a transcript line belongs to, from its own recorded `cwd`.
 *
 * MIRRORS `deriveIdentity()` RULE 1 (`packages/drive/src/noticeboard.ts`) and only rule 1, because
 * that is the only rule expressible from a path string: rule 2 asks git which linked worktrees it
 * has REGISTERED, which no transcript line records, and rule 3 deliberately returns null for the
 * primary checkout. Rule 1 is also the rule `correlatesTo()` already applies here, so a session id
 * minted by this function joins to the trace `observeCliInvocation` writes for the same worktree —
 * the join inc-01 measured as byte-identical.
 */
export function sessionIdFromCwd(cwd: string): string | undefined {
  const segments = cwd
    .replace(/\\/g, "/")
    .split("/")
    .filter((segment) => segment.length > 0);
  for (let i = 0; i + 2 < segments.length; i++) {
    if (segments[i] === ".claude" && segments[i + 1] === "worktrees") {
      const name = segments[i + 2];
      if (name !== undefined && name.length > 0) return name;
    }
  }
  return undefined;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The node ids one `tool_use` block names, and which shape recovered them. */
function readsFromToolUse(
  name: string,
  input: Record<string, unknown>,
): { shape: DecisionReadShape; nodeIds: readonly string[]; scrape?: ShellScrape } | undefined {
  if (name === "Read") {
    const filePath = input.file_path;
    if (typeof filePath !== "string") return undefined;
    return { shape: "read", nodeIds: decisionNodeIdsInPath(filePath) };
  }
  if (name === "Grep") {
    // `path` may name a DIRECTORY, which names no file and therefore yields nothing — the declared
    // `Grep`-over-a-directory omission, which falls out of the id rule rather than needing a branch.
    const target = input.path;
    if (typeof target !== "string") return undefined;
    return { shape: "grep", nodeIds: decisionNodeIdsInPath(target) };
  }
  // Everything else that carries a raw command string: `Bash`, and any sibling shell tool. Matched
  // on the INPUT shape rather than the tool name so a renamed shell tool is not silently dropped.
  const command = input.command;
  if (typeof command !== "string") return undefined;
  const scrape = scrapeShellDecisionReads(command);
  return { shape: "shell", nodeIds: scrape.nodeIds, scrape };
}

/**
 * Every decision-record read in one transcript file. Never throws: an unreadable file, a non-JSON
 * line, or a line missing `cwd`/`timestamp` simply contributes nothing.
 *
 * Reads SIDECHAIN and parent lines alike — see the header for why that is correct here and wrong in
 * `readCorrelatingLines`.
 */
export function scanTranscriptDecisionReads(filePath: string): DecisionReadScan {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath, "utf8");
  } catch {
    return EMPTY_SCAN;
  }
  if (!DECISION_HINT.test(raw)) return EMPTY_SCAN;

  const reads: DecisionRead[] = [];
  const declinedByVerb = new Map<string, number>();
  let uncorrelatedReads = 0;
  let unidentifiedCalls = 0;
  let redirectTargets = 0;

  for (const rawLine of raw.split(/\r?\n/)) {
    if (rawLine.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(rawLine);
    } catch {
      continue;
    }
    if (!isPlainObject(parsed)) continue;

    const message = isPlainObject(parsed.message) ? parsed.message : undefined;
    const content = message?.content;
    if (!Array.isArray(content)) continue;

    const cwd = parsed.cwd;
    const timestamp = parsed.timestamp;
    if (typeof cwd !== "string" || typeof timestamp !== "string") continue;
    const sessionId = sessionIdFromCwd(cwd);
    const sidechain = parsed.isSidechain === true;

    for (const block of content) {
      if (!isPlainObject(block) || block.type !== "tool_use") continue;
      const name = typeof block.name === "string" ? block.name : "";
      const input = isPlainObject(block.input) ? block.input : undefined;
      if (input === undefined) continue;

      const found = readsFromToolUse(name, input);
      if (found === undefined) continue;

      if (found.scrape !== undefined) {
        for (const verb of found.scrape.declinedVerbs) {
          declinedByVerb.set(verb, (declinedByVerb.get(verb) ?? 0) + 1);
        }
        redirectTargets += found.scrape.redirectTargets;
      }
      if (found.nodeIds.length === 0) continue;

      // No usable tool-call id: this read could never be deduped, so appending it would break
      // idempotence on the next run. Always its own skip, never a silent drop.
      const toolUseId = typeof block.id === "string" && block.id.length > 0 ? block.id : undefined;
      if (toolUseId === undefined) {
        unidentifiedCalls += found.nodeIds.length;
        continue;
      }

      if (sessionId === undefined) {
        uncorrelatedReads += found.nodeIds.length;
        continue;
      }

      for (const nodeId of found.nodeIds) {
        reads.push({ sessionId, toolUseId, nodeId, at: timestamp, shape: found.shape, sidechain });
      }
    }
  }

  const declinedShellVerbs = [...declinedByVerb.entries()]
    .map(([verb, segments]) => ({ verb, segments }))
    .sort((a, b) => b.segments - a.segments || a.verb.localeCompare(b.verb));

  return { reads, uncorrelatedReads, unidentifiedCalls, declinedShellVerbs, redirectTargets };
}
