/**
 * Extracts DECISION-RECORD READS out of a host Claude Code transcript (JSONL), story
 * `context-traversal-transcript`, capability `transcript-decision-read-extraction`
 * (ADR-0403 / `adrs-into-the-dag-arc-inc-07`).
 *
 * ## WHY THIS EXISTS
 *
 * `observeCliInvocation` is an allowlist over `storytree` argv, and for most of this module's life
 * `adr` was not on it — nor could it be, because there was no read verb for a decision record: an
 * agent that wanted ADR-0223 opened `docs/decisions/0223-….md` with the ordinary file tool. So ZERO
 * decision reads had ever reached a traversal trace, while roughly a third of every reading list the
 * corpus hands an agent points into the decision log. The harness has nonetheless been writing all
 * of those reads down the whole time, in the same transcript files `correlate-transcripts.ts`
 * already scans for occupancy. This module is the missing extractor, and nothing more.
 *
 * ## A DECISION IS NOW READ OUT OF THE STORE, AND THIS MODULE HAD TO CATCH UP
 *
 * ADR-0403 dec 1 made a decision an ordinary Library row and `docs/decisions/` was deleted whole
 * (2026-08-22). A file-path matcher is therefore a matcher whose SUBJECT MOVED: from that commit on
 * it can only ever return zero, and a zero from an extractor reads exactly like a session that
 * consulted no decision. That is the third instance of one fault class on this migration — the three
 * ADR probes and the curator's decision context were the first two — and it is why the blindness
 * counter below exists rather than being left to the next reader to notice.
 *
 * Two shapes reach a decision now, and BOTH are recognised by ARGV SHAPE rather than by an id
 * appearing somewhere in the text:
 *
 *   - `storytree library artifact adr-NNNN`  — the row, read the way every artifact is read.
 *   - `storytree adr pull <n>`               — the whole document, written out for ordinary editing.
 *
 * ## WHY NOT SIMPLY MATCH `adr-NNNN` ANYWHERE — IT WAS MEASURED, AND IT IS 66:1 WRONG
 *
 * The obvious fix is to match the id token wherever it appears. Measured over 3,346 transcripts on
 * this disk (2026-08-01 →), a bare `adr-NNNN` / `ADR-NNNN` substring appears in **2,580 commands
 * that read no decision at all** — `echo "=== ADR-0404 increments ==="`, an `arc increment close
 * --note "Dropped: ADR-0306 D3 …"`, a commit message, a memory file being appended — against **39**
 * commands that actually read one. A loose matcher would have recorded sixty-six false reads for
 * every true one and called the result a recovery. So the id token alone is NEVER a read here: it is
 * a MENTION, counted as such below, and only the two argv shapes above mint a read.
 *
 * ## THE NODE ID IS THE WHOLE POINT
 *
 * A file read mints `doc:decisions/NNNN-slug.md` and a store read mints `adr-NNNN` — in both cases
 * the corpus's OWN pointer form, byte-identical to what `offerIdOf()` prints in an artifact's
 * Sources block for that spelling (`doc:` refs pass through; `asset:adr-NNNN` is printed with the
 * scheme stripped). That is load-bearing rather than cosmetic: the caveat this work exists to retire
 * (`doc-refs-are-offered-but-follows-are-unobservable`, `offer-candidate-sets.ts`) says a `doc:`
 * ref is offered and a follow of one can never be seen. A read recorded under ANY other id form —
 * an absolute path, a bare number, a `decisions/` relpath — records a read that still does not join
 * to the offer, and closes nothing.
 *
 * The two spellings are deliberately NOT unified here. `parseDecisionPointer` (`@storytree/library`)
 * resolves either to a decision NUMBER for any reader that wants them merged, and rewriting the
 * historical ids would re-append every already-ingested event under a new key, breaking the
 * idempotence the whole ingest rests on. Two id spellings of one decision is the honest record of a
 * corpus that carries three live pointer spellings and rewrites none of them (ADR-0403 dec 7).
 *
 * ## IT OVERLAPS THE LIVE OBSERVER, AND THAT IS DECLARED RATHER THAN HIDDEN
 *
 * `observeCliInvocation` DOES now see `library artifact adr-NNNN`, because a decision is an ordinary
 * artifact and that verb is allowlisted — it mints the same `adr-NNNN` node on the `library-artifact`
 * surface as the command runs. This module reads the same invocation back out of the transcript and
 * mints its own event on a `host-transcript-*` surface. They are separate events by construction
 * (different surface, different event id), so a consumer counting DISTINCT reads must discriminate
 * on surface. The overlap is bounded on one side only: the live observer fires solely when terminal
 * capture is active, and never for `adr pull`, which is on no allowlist.
 *
 * ## THIS IS A FLOOR, NEVER A CENSUS
 *
 * Four read shapes are recovered and they are not equally strong evidence, which is why each gets
 * its own surface id rather than being flattened into one:
 *
 *   - `Read`  → an EXACT absolute `file_path`. Unambiguous. HISTORICAL only, now that the files are
 *               gone — a replay of a pre-migration session, which is still legitimate input.
 *   - `Grep`  → an exact `path`, when it names a FILE. A grep over a directory names no file and is
 *               invisible here. Historical, as above.
 *   - shell   → SCRAPED out of an opaque command string. Recoverable only when the command names
 *               the path literally AND leads with a verb this module recognises as a read.
 *               Historical, as above.
 *   - cli     → the STORE route: a `storytree` read verb naming a decision, scraped from the same
 *               opaque command string. The only shape a post-migration session can produce.
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
import { adrDocId, adrNumberOfArtifactId } from "@storytree/library";
import fs from "node:fs";

/** Which tool shape a read was recovered from — its own surface, because they differ in strength. */
export type DecisionReadShape = "read" | "grep" | "shell" | "cli";

/**
 * How much of the decision the read actually put in front of the caller.
 *
 * MIRRORS the axis `observeCliInvocation` already records for an artifact read, for the same reason
 * it does: `--raw <field>` hands back ONE stored field, and recording that as a whole-document read
 * inflates every re-read ratio taken from the trace (`linked-session-context-arc-inc-30`, defect 2).
 * The file shapes are all whole-document by construction and carry the full strength.
 */
export type DecisionReadStrength = "front_matter_read" | "full_payload_read";

/** The surface id each shape's visit carries. Distinct per shape (see the header): a scraped shell
 * read and an exact `Read` are not the same quality of observation and must stay distinguishable. */
export const DECISION_READ_SURFACES = {
  read: "host-transcript-file-read",
  grep: "host-transcript-grep",
  shell: "host-transcript-shell",
  cli: "host-transcript-cli-read",
} satisfies Readonly<Record<DecisionReadShape, string>>;

export interface DecisionRead {
  /** The storytree session the read belongs to, derived from the line's own `cwd`. */
  readonly sessionId: string;
  /**
   * THE HOST CONTEXT WINDOW this read happened in — the line's own `sessionId`, carried through
   * verbatim — or undefined when the line did not record one.
   *
   * IT IS A SECOND, FINER IDENTITY BESIDE {@link sessionId}, NOT A REPLACEMENT FOR IT, and the two
   * answer different questions. {@link sessionId} is the pooled WORKTREE SLOT
   * ({@link sessionIdFromCwd} mirrors `deriveIdentity()` rule 1), which is the right key for
   * `ingestDecisionReads` because it is the key the trace sink and the live CLI observer already
   * share — an ingest that keyed by window would write into traces no offer could ever join to.
   *
   * But a slot is not a sitting. Slots are POOLED, and `session-identity.ts` measured what that
   * costs a per-session ratio taken over one: the median slot holds 2 windows, the p90 holds 8, and
   * one holds 137 — enough to move the re-read share x2.39 and the re-read COST share x5.7, and
   * enough to have published "one document pulled 28 times in one session" for what was eleven-plus
   * sessions over 15 days. Any measurement phrased as "what ONE SESSION did in one sitting" — which
   * is exactly `decision-read-measurement-arc`'s chain-depth number — is inflated by that pooling in
   * a direction nothing downstream can correct for, because the trace store does not record which
   * window wrote which line and it is not retrofittable.
   *
   * The transcript line does record it, on the same line every other field here already comes from,
   * so it is carried rather than derived. It is the id `readCorrelatingLines` already treats as
   * window identity for occupancy, so the two halves of this package agree on what a window is.
   *
   * A SUBAGENT LINE STAMPS ITS PARENT'S ID, and that is the answer we want here for the same reason
   * the header gives for reading sidechain lines at all: the subagent read that decision on the
   * parent window's behalf, inside the parent window's sitting.
   */
  readonly windowId: string | undefined;
  /** The host tool-call id (`toolu_…`) — stable, and this read's identity seed. */
  readonly toolUseId: string;
  /** The corpus's own pointer form for the spelling that reached it: `doc:decisions/NNNN-slug.md`
   * for a file read, `adr-NNNN` for a store read. See the header — they are not unified on purpose. */
  readonly nodeId: string;
  /** The tool call's ISO-8601 timestamp, carried through verbatim. */
  readonly at: string;
  readonly shape: DecisionReadShape;
  /** How much of the document was read — see {@link DecisionReadStrength}. */
  readonly strength: DecisionReadStrength;
  /** True when a SUBAGENT made the call. Kept, never dropped — it is most of the answer. */
  readonly sidechain: boolean;
}

/** One verb this module declined to treat as a decision read, with how many segments it declined.
 * The size of a named blind spot, so it can be reported rather than discovered. */
export interface DeclinedVerb {
  readonly verb: string;
  readonly segments: number;
}

/** @deprecated Use {@link DeclinedVerb} — the same shape, named for both routes rather than one. */
export type DeclinedShellVerb = DeclinedVerb;

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
  readonly declinedShellVerbs: readonly DeclinedVerb[];
  /**
   * `storytree` invocations that reached the decision log and minted no read, by verb.
   *
   * KEPT SEPARATE from {@link declinedShellVerbs} rather than folded in with it, because the two
   * declines mean different things and one line covering both would have to overstate one of them.
   * A declined SHELL segment named a specific decision record and was refused on its verb; most of
   * these named NO single decision at all — `adr list` is a search over the log, and 559 of them on
   * this disk have no decision to record. Reporting those under "named a decision record" would be a
   * false claim of the exact kind this module exists to stop making.
   */
  readonly declinedCliVerbs: readonly DeclinedVerb[];
  /** Shell paths dropped because they sat immediately after a `>`/`>>` — a WRITE target, not a read. */
  readonly redirectTargets: number;
  /**
   * THE BLINDNESS DENOMINATOR: tool calls that NAMED a decision — by file path, by `adr-NNNN` id, or
   * by an `adr` verb — and from which this module recovered no read at all.
   *
   * It exists because a zero is ambiguous and that ambiguity is what hid this module's own defect for
   * the whole `docs/decisions/` migration. `reads: []` alone cannot distinguish a session that
   * consulted no decision from an extractor that can no longer SEE a decision being consulted. Paired
   * with the read count it can: zero reads against zero mentions is a real, quiet answer, while zero
   * reads against a large mention count is an instrument reporting on a world it no longer matches.
   * {@link import("./ingest-decision-reads.js").ingestDecisionReads} turns exactly that pair into a
   * verdict, and `probe:decision-reads` turns the verdict into a non-zero exit.
   *
   * It is a MENTION count and never a missed-read count: most mentions are prose, and the measurement
   * in the header is what says so. It is not a target to drive to zero.
   */
  readonly decisionMentions: number;
}

const EMPTY_SCAN: DecisionReadScan = {
  reads: [],
  uncorrelatedReads: 0,
  unidentifiedCalls: 0,
  declinedShellVerbs: [],
  declinedCliVerbs: [],
  redirectTargets: 0,
  decisionMentions: 0,
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

/**
 * The cheap pre-filter: naming a decision is impossible without one of these, so a file (or a
 * command) lacking all of them can be skipped without reading it more closely. Exact, not heuristic.
 *
 * ⚠ IT MUST COVER EVERY SHAPE THE SCANNER BELOW CAN RECOVER, AND IT IS THE EASIEST PLACE IN THIS
 * MODULE TO REINTRODUCE THE ORIGINAL DEFECT. While it read `decisions[/\\]` alone it was a second,
 * invisible copy of the very assumption this module got wrong: a store read
 * (`storytree library artifact adr-0403`) contains no `decisions/` anywhere, so the whole transcript
 * was skipped before a single tool call was examined. A pre-filter narrower than the matcher it
 * guards does not make the scan cheaper, it makes it wrong — and silently, because a skipped file
 * and a file with nothing in it produce the same empty result.
 *
 * It caught this a second time during its own increment: keying the CLI branch on `storytree adr`
 * skipped `node packages/cli/launch.mjs adr pull 1`, which is the same invocation launched another
 * way. So the verb alternation is spelled WITHOUT the launcher. WIDEN THIS FREELY — every extra
 * match costs one cheap scan and at worst inflates a mention count that is explicitly a denominator
 * and not a target; every missing match is a silent zero.
 */
const DECISION_HINT = /decisions[/\\]|adr-\d{4}|\badr\s+(?:pull|push|list|new|next)\b/i;

/**
 * A decision named by its ARTIFACT ID or its human label — `adr-0403`, `ADR-0403`.
 *
 * Used for MENTION detection only, never to mint a read: the header's measurement is that 2,580 of
 * the 2,619 commands carrying this token read no decision whatever. The boundaries are strict on
 * both sides so `adr-04031` and `x-adr-0403` are not decisions, matching the collision guard
 * {@link adrNumberOfArtifactId} applies to a stored id.
 *
 * NO `g` FLAG, deliberately: this is only ever `.test()`ed, and a global regex carries `lastIndex`
 * between calls — so the second call against an identical string answers differently from the first.
 * A stateful predicate whose answer depends on how often it has been asked is a bug waiting for a
 * loop to find it.
 */
const DECISION_ID_MENTION = /(?<![A-Za-z0-9._-])adr-\d{4}(?![0-9])/i;

/** True when this text names a decision in ANY way this module recognises — path, id, or `adr` verb.
 * The denominator behind {@link DecisionReadScan.decisionMentions}; deliberately WIDER than what
 * mints a read, because its whole job is to notice a world the read rules no longer match. */
function namesADecision(text: string): boolean {
  return DECISION_HINT.test(text);
}

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

/** One recovered store-route read: which decision, and how much of it was put in front of the caller. */
export interface CliDecisionRead {
  readonly nodeId: string;
  readonly strength: DecisionReadStrength;
}

export interface CliScrape {
  readonly reads: readonly CliDecisionRead[];
  /** Segments that named a decision under a `storytree` shape this module does not read, by verb. */
  readonly declinedVerbs: readonly string[];
}

/** The token that identifies a storytree CLI invocation, however it was launched. `pnpm storytree`,
 * a bare `storytree`, and the two in-repo entry points all reduce to one of these. */
function isStorytreeLauncher(token: string): boolean {
  const normalised = token.replace(/\\/g, "/").toLowerCase();
  const base = normalised.split("/").pop() ?? "";
  return base === "storytree" || normalised.endsWith("cli/src/main.ts") || normalised.endsWith("cli/launch.mjs");
}

/** A flag token's NAME, so `--raw body` and `--raw=body` classify identically. */
function flagName(token: string): string {
  const equals = token.indexOf("=");
  return equals === -1 ? token : token.slice(0, equals);
}

/**
 * Scrape the decisions a shell command read THROUGH THE STORE. Total and non-throwing.
 *
 * ## RECOGNISED BY ARGV SHAPE, NEVER BY A LOOSE ID
 *
 * A read is minted only for `storytree library artifact adr-NNNN` and `storytree adr pull <n>` —
 * the two verbs that put a decision document in front of the caller. The id token appearing anywhere
 * else is a mention, for the measured reason in the header: matching it loosely is 66:1 wrong.
 *
 * ## AND DELIBERATELY NOT THESE
 *
 *   - `adr list`  — a SEARCH over the log. It names no single decision, and minting a read per
 *                   invocation would have manufactured 391 phantom reads out of this disk's history.
 *   - `adr new` / `adr next` / `adr push` — allocations and writes, not reads.
 *   - `library artifact adr-NNNN --set …`   — a write wearing a read's shape.
 *   - `library artifact history adr-NNNN`   — a read of the CHANGE LOG, not of the document.
 *
 * Each of those is counted in {@link CliScrape.declinedVerbs} rather than swallowed, on the same
 * rule the shell scraper already follows: an omission is acceptable only while it carries its size.
 *
 * ## SHELL NOISE IS NOT A FLAG, WHICH IS WHY THIS DOES NOT REUSE THE LIVE OBSERVER'S ALLOWLIST
 *
 * `observeCliInvocation` classifies a tokenised argv and REFUSES any token its flag table does not
 * name. That is right for argv and wrong here: a transcript command carries `2>&1`, a `| head -30`,
 * a trailing `;` — shell punctuation that never reaches argv. Six of the eight real store reads
 * measured on this disk carry exactly that noise, so borrowing the argv allowlist verbatim would
 * have declined most of the reads it was imported to find. This reads the two shapes positively and
 * treats an unrecognised trailing token as noise, EXCEPT for the write flags named above.
 */
export function scrapeCliDecisionReads(command: string): CliScrape {
  if (!DECISION_HINT.test(command)) return { reads: [], declinedVerbs: [] };

  const byNode = new Map<string, DecisionReadStrength>();
  const declinedVerbs: string[] = [];

  for (const segment of shellSegments(command)) {
    const tokens = segment.split(/\s+/).filter((token) => token.length > 0);
    const launcher = tokens.findIndex(isStorytreeLauncher);
    if (launcher === -1) continue;
    const argv = tokens.slice(launcher + 1);
    const [area, sub, third] = argv;
    if (area === undefined) continue;

    // ── the store route: `library artifact adr-NNNN` ──────────────────────────────────────────
    if (area === "library" && sub === "artifact" && third !== undefined) {
      if (adrNumberOfArtifactId(third) === null) {
        // A non-decision artifact, or a sub-verb (`history adr-0403`, `edit`, `new`). Declined only
        // when a decision was nonetheless named, so an ordinary artifact read stays out of this
        // record entirely rather than inflating the blind-spot count with unrelated traffic.
        if (DECISION_ID_MENTION.test(segment)) declinedVerbs.push(`library artifact ${third}`);
        continue;
      }
      const rest = argv.slice(3).map(flagName);
      if (rest.includes("--set")) {
        declinedVerbs.push("library artifact --set");
        continue;
      }
      // Weakest strength wins, matching the live observer: `--raw <field>` hands back one field.
      const strength: DecisionReadStrength = rest.includes("--raw") ? "front_matter_read" : "full_payload_read";
      const existing = byNode.get(third);
      if (existing === undefined || existing === "full_payload_read") byNode.set(third, strength);
      continue;
    }

    // ── the document route: `adr pull <n>` ────────────────────────────────────────────────────
    if (area === "adr") {
      if (sub === "pull" && third !== undefined && /^\d{1,4}$/.test(third)) {
        const nodeId = adrDocId(Number(third));
        if (!byNode.has(nodeId)) byNode.set(nodeId, "full_payload_read");
        continue;
      }
      declinedVerbs.push(`adr ${sub ?? "(bare)"}`);
      continue;
    }
  }

  return {
    reads: [...byNode.entries()].map(([nodeId, strength]) => ({ nodeId, strength })),
    declinedVerbs,
  };
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

/** One decision this tool call reached, with the shape that recovered it and how much it read. */
interface ToolUseHit {
  readonly shape: DecisionReadShape;
  readonly nodeId: string;
  readonly strength: DecisionReadStrength;
}

/** What one `tool_use` block yielded: the reads, the sized declines, and whether it named a decision
 * at all — the last of which is recorded EVEN WHEN no read was recovered, because that pair is the
 * only thing that can tell a quiet answer from a blind instrument. */
interface ToolUseReads {
  readonly hits: readonly ToolUseHit[];
  readonly scrape?: ShellScrape;
  readonly cliDeclined: readonly string[];
  readonly mentioned: boolean;
}

/** A whole-document read of every decision an exact path names — the `Read`/`Grep` route. */
function fileHits(shape: "read" | "grep", pathish: string): ToolUseHit[] {
  return decisionNodeIdsInPath(pathish).map((nodeId) => ({
    shape,
    nodeId,
    strength: "full_payload_read" as const,
  }));
}

/** The decisions one `tool_use` block reached, by every route this module recognises. */
function readsFromToolUse(name: string, input: Record<string, unknown>): ToolUseReads | undefined {
  if (name === "Read") {
    const filePath = input.file_path;
    if (typeof filePath !== "string") return undefined;
    return { hits: fileHits("read", filePath), cliDeclined: [], mentioned: namesADecision(filePath) };
  }
  if (name === "Grep") {
    // `path` may name a DIRECTORY, which names no file and therefore yields nothing — the declared
    // `Grep`-over-a-directory omission, which falls out of the id rule rather than needing a branch.
    const target = input.path;
    if (typeof target !== "string") return undefined;
    return { hits: fileHits("grep", target), cliDeclined: [], mentioned: namesADecision(target) };
  }
  // Everything else that carries a raw command string: `Bash`, and any sibling shell tool. Matched
  // on the INPUT shape rather than the tool name so a renamed shell tool is not silently dropped.
  const command = input.command;
  if (typeof command !== "string") return undefined;

  // BOTH routes are scraped from the same command, and a command may genuinely carry both — a
  // session that pulls a decision and then cats the file it pulled it into reads it twice, by two
  // different means. Taking only the first would drop whichever route happened to lose the race.
  const scrape = scrapeShellDecisionReads(command);
  const cli = scrapeCliDecisionReads(command);
  return {
    hits: [
      ...scrape.nodeIds.map((nodeId) => ({
        shape: "shell" as const,
        nodeId,
        strength: "full_payload_read" as const,
      })),
      ...cli.reads.map((read) => ({ shape: "cli" as const, nodeId: read.nodeId, strength: read.strength })),
    ],
    scrape,
    cliDeclined: cli.declinedVerbs,
    mentioned: namesADecision(command),
  };
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
  const declinedByCliVerb = new Map<string, number>();
  let uncorrelatedReads = 0;
  let unidentifiedCalls = 0;
  let redirectTargets = 0;
  let decisionMentions = 0;

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
    // The line's OWN id is the host context window ({@link DecisionRead.windowId}) — the same field
    // `readCorrelatingLines` reads as window identity. A blank one is undefined rather than "", so a
    // caller grouping by window cannot silently collect every unlabelled read into one giant sitting.
    const rawWindowId = parsed.sessionId;
    const windowId =
      typeof rawWindowId === "string" && rawWindowId.trim().length > 0 ? rawWindowId : undefined;
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
      for (const verb of found.cliDeclined) {
        declinedByCliVerb.set(verb, (declinedByCliVerb.get(verb) ?? 0) + 1);
      }

      // Counted BEFORE the early return below, and counted per CALL rather than per match: a tool
      // call that named a decision and yielded no read is the entire evidence that this extractor
      // may have stopped matching the world. Losing it to a `continue` is how the defect hid.
      if (found.hits.length === 0) {
        if (found.mentioned) decisionMentions++;
        continue;
      }

      // No usable tool-call id: this read could never be deduped, so appending it would break
      // idempotence on the next run. Always its own skip, never a silent drop.
      const toolUseId = typeof block.id === "string" && block.id.length > 0 ? block.id : undefined;
      if (toolUseId === undefined) {
        unidentifiedCalls += found.hits.length;
        continue;
      }

      if (sessionId === undefined) {
        uncorrelatedReads += found.hits.length;
        continue;
      }

      for (const hit of found.hits) {
        reads.push({
          sessionId,
          windowId,
          toolUseId,
          nodeId: hit.nodeId,
          at: timestamp,
          shape: hit.shape,
          strength: hit.strength,
          sidechain,
        });
      }
    }
  }

  const bySize = (counts: Map<string, number>): DeclinedVerb[] =>
    [...counts.entries()]
      .map(([verb, segments]) => ({ verb, segments }))
      .sort((a, b) => b.segments - a.segments || a.verb.localeCompare(b.verb));

  return {
    reads,
    uncorrelatedReads,
    unidentifiedCalls,
    declinedShellVerbs: bySize(declinedByVerb),
    declinedCliVerbs: bySize(declinedByCliVerb),
    redirectTargets,
    decisionMentions,
  };
}
