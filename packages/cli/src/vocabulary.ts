// `storytree vocabulary` — which words are in heavy use here, and which of them resolve to nothing?
//
// THE QUESTION IT ANSWERS (`self-sustaining-sessions-arc`, increment
// `vocabulary-pass-becomes-a-verb`). The prompt-keyed injector (`definition-injection.mjs`) resolves
// a term at the moment of use, so a word with no `definition` behind it costs a reader either a full
// tool round-trip or, more often, a guess. Nothing measured which words those were. Measured by hand
// on 2026-08-30, 447 of 774 substantive owner prompts (57.8%) matched no definition at all — and the
// pass that fixed it was a throwaway script. This is that script made addressable, so the corpus can
// absorb vocabulary without the owner noticing a gap first.
//
// ★ IT RANKS BY DOCUMENT FREQUENCY, NEVER BY RAW COUNT. The unit is "distinct sessions in which the
// term appears", so one session repeating itself cannot promote a word. That is not a tuning choice:
// raw counts are dominated by whichever session happened to be verbose, and the whole point of the
// ranking is to find words the SYSTEM uses rather than words one transcript used.
//
// ★★ THE HEADLINE IS THE HIT RATE, NOT THE CANDIDATE LIST. The figure the definition tier is
// actually trying to move is the share of owner prompts that resolve at least one definition, so
// every run reports it — which makes each run a before/after against the same instrument, and makes
// a claim like "this pass improved things" checkable rather than asserted.
//
// ★★★ IT IS NOT A TRACE READER, AND THAT IS DELIBERATE. Traces record artifact READS: a `search`
// event carries `operation` and `resultNodeIds` and NO query text, so asking traces for vocabulary
// returns nothing, correctly. Vocabulary is measured from transcripts. Traces answer the other
// question — which artifacts are consulted — and joining the two is a later increment's job, not a
// reason to point this at the wrong source.
//
// ★ IT REPORTS, IT DOES NOT AUTHOR. Frequency SELECTS candidates; it never licenses writing one.
// A definition earns its place when the word names an object or an act the system treats as one
// thing and a reader who mis-resolves it does the wrong work — a judgment this cannot make. It also
// never proposes a NEW artifact where widening an existing title would do: `edit-first-curation`
// governs the disposition, and the render says so.
//
// WHERE THE WORK IS. Transcript discovery is `@storytree/context-traversal-transcript`'s
// (`resolveTranscriptDir` / `collectTranscriptFiles`) — never a second walk beside it. Surface
// matching is `definition-injection.mjs`'s `matchDefinitions`, imported rather than re-implemented,
// because a second matcher would let this report candidates the hook would in fact have resolved.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectTranscriptFiles,
  resolveTranscriptDir,
} from "@storytree/context-traversal-transcript";

import { matchDefinitions } from "../definition-injection.mjs";
import type { DefinitionDoc } from "../definition-injection.mjs";
import { DEFINITIONS_PROJECTION_BASENAME } from "./definitions-projection.js";
import type { Envelope } from "./envelope.js";

/** Longest n-gram considered. Three covers the multi-word terms of art here ("cut a fresh session"). */
export const MAX_GRAM = 3;

/** A term must appear in at least this many DISTINCT sessions to be reported. */
export const DEFAULT_MIN_SESSIONS = 6;

/** How many ranked candidates the render shows. The tail is long and uninformative. */
export const DEFAULT_LIMIT = 30;

/**
 * Words that carry no domain meaning on their own. A gram made ENTIRELY of these (or of very short
 * tokens) is dropped, which is what keeps grammatical fragments — "and drive", "session to" — out of
 * the ranking without also dropping a real compound term that merely contains a common word.
 */
const STOPWORDS: ReadonlySet<string> = new Set(
  (
    "the a an and or but if then than that this these those there here it its is are was were be " +
    "been being have has had do does did not no yes so as at by for from in into of on to with " +
    "you your we our i me my they them their what which who when where why how all any both each " +
    "few more most other some such only own same too very can will just should now about after " +
    "again against also because before between during down further less like make made many much " +
    "never off once out over through under up while would could may might must shall let get got " +
    "go going one two three four five first second next last new old good great best better big " +
    "small long short high low right left different thing things way ways lot bit part case point " +
    "time times day days week weeks month months year years need needs needed want wants wanted " +
    "see seen look looks looking say says said tell told ask asks asked think thought know knows " +
    "take takes took give gives gave use uses used find finds found try tried keep keeps kept put " +
    "leave leaves run runs ran come comes came back still yet even ever already actually really " +
    "quite pretty maybe probably perhaps sure ok okay well thanks please sorry lets dont doesnt " +
    "didnt isnt arent wasnt werent wont cant couldnt shouldnt wouldnt ive id ill youre theyre its " +
    "via per vs etc ie eg something someone anything nothing everything"
  ).split(" "),
);

/** One session's text, split by who produced it. */
export interface SessionText {
  /** What the operator typed — the highest-value vocabulary signal. */
  readonly owner: readonly string[];
  /** What the session wrote back — the system's own working vocabulary. */
  readonly session: readonly string[];
}

export interface VocabularyCandidate {
  readonly term: string;
  /** Distinct sessions in which the OWNER used it. */
  readonly ownerSessions: number;
  /** Distinct sessions in which the SESSION used it. */
  readonly sessionSessions: number;
  readonly ownerUses: number;
  readonly sessionUses: number;
}

export interface VocabularyRead {
  readonly sessionsScanned: number;
  readonly definitions: number;
  /** Owner prompts long enough to carry a term (the hit-rate denominator). */
  readonly promptsScored: number;
  /** …of which resolved at least one definition through the shipped matcher. */
  readonly promptsResolved: number;
  readonly candidates: readonly VocabularyCandidate[];
  readonly minSessions: number;
}

/** Lowercase, collapse hyphen/underscore to space — the same normalisation the injector applies. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ");
}

const WORD = /[a-z][a-z0-9']+/g;

function tokenize(text: string): string[] {
  return normalize(text).match(WORD) ?? [];
}

/** A gram is generic when every token in it is a stopword or too short to mean anything. */
function isGeneric(gram: string): boolean {
  return gram.split(" ").every((w) => STOPWORDS.has(w) || w.length <= 2);
}

/**
 * The set of definition surfaces, as the injector recognises them — asked of the injector rather
 * than reconstructed, so a term this reports as unresolvable is one the hook would also have missed.
 */
function isCovered(term: string, defs: readonly DefinitionDoc[]): boolean {
  return matchDefinitions(term, defs, { max: 1 }).length > 0;
}

/** One text's n-grams: how many times each occurred, and the set of the ones that occurred. */
interface GramCount {
  readonly total: Map<string, number>;
  readonly distinct: Set<string>;
}

/** Count n-grams in one text, returning both the multiset and the distinct set. */
function grams(texts: readonly string[]): GramCount {
  const total = new Map<string, number>();
  const distinct = new Set<string>();
  for (const text of texts) {
    const toks = tokenize(text);
    for (let n = 1; n <= MAX_GRAM; n++) {
      for (let i = 0; i + n <= toks.length; i++) {
        const g = toks.slice(i, i + n).join(" ");
        total.set(g, (total.get(g) ?? 0) + 1);
        distinct.add(g);
      }
    }
  }
  return { total, distinct };
}

/**
 * The pure core: sessions in, ranked promotion candidates out.
 *
 * Ordered by owner document-frequency first — his vocabulary is the signal the tier exists to serve
 * — then by session document-frequency, then alphabetically so a run is reproducible.
 */
/** How a caller narrows a run: the session threshold, and how many rows to show. */
export interface VocabularyOptions {
  readonly minSessions?: number;
  readonly limit?: number;
}

export function rankVocabulary(
  sessions: readonly SessionText[],
  defs: readonly DefinitionDoc[],
  opts: VocabularyOptions = {},
): VocabularyRead {
  const minSessions = opts.minSessions ?? DEFAULT_MIN_SESSIONS;
  const limit = opts.limit ?? DEFAULT_LIMIT;

  const ownerDf = new Map<string, number>();
  const sessDf = new Map<string, number>();
  const ownerTf = new Map<string, number>();
  const sessTf = new Map<string, number>();
  const bump = (m: Map<string, number>, k: string, by: number): void => {
    m.set(k, (m.get(k) ?? 0) + by);
  };

  let promptsScored = 0;
  let promptsResolved = 0;

  // ★★★ ONE PROMPT TEXT COUNTS ONCE, HOWEVER MANY SESSIONS CARRY IT.
  //
  // A prompt repeated VERBATIM across sessions is a template — a scripted invocation or a test
  // fixture — not evidence that a word is in wide use. Measured 2026-08-30 over this repo's
  // transcripts, one fixture prompt (`# Story just built: fix-story nodes: cap-a, cap-b …`)
  // appeared in 1,367 of them, and its words — `emit`, `json array`, `declared`, `open questions
  // in` — took every top slot in the ranking, above every word the owner has ever typed. The
  // harness marks those entries as genuinely submitted prompts, which they are; they are simply a
  // program's prompts, and no field distinguishes them.
  //
  // The cost is named rather than hidden: a phrase the owner really does retype word-for-word
  // across sessions is also counted once. That errs toward UNDER-counting, which is the safe
  // direction for a list whose only job is to nominate candidates for a human judgment.
  const seenPrompts = new Set<string>();

  for (const s of sessions) {
    const fresh: string[] = [];
    for (const prompt of s.owner) {
      const key = prompt.trim();
      if (seenPrompts.has(key)) continue;
      seenPrompts.add(key);
      fresh.push(prompt);
      if (key.length <= 25) continue;
      promptsScored++;
      if (matchDefinitions(prompt, defs, { max: 1 }).length > 0) promptsResolved++;
    }
    const o = grams(fresh);
    const c = grams(s.session);
    for (const g of o.distinct) bump(ownerDf, g, 1);
    for (const g of c.distinct) bump(sessDf, g, 1);
    for (const [g, n] of o.total) bump(ownerTf, g, n);
    for (const [g, n] of c.total) bump(sessTf, g, n);
  }

  const seen = new Set<string>([...ownerDf.keys(), ...sessDf.keys()]);
  const candidates: VocabularyCandidate[] = [];
  for (const term of seen) {
    const ownerSessions = ownerDf.get(term) ?? 0;
    const sessionSessions = sessDf.get(term) ?? 0;
    if (Math.max(ownerSessions, sessionSessions) < minSessions) continue;
    if (term.length < 4 || isGeneric(term)) continue;
    if (isCovered(term, defs)) continue;
    candidates.push({
      term,
      ownerSessions,
      sessionSessions,
      ownerUses: ownerTf.get(term) ?? 0,
      sessionUses: sessTf.get(term) ?? 0,
    });
  }

  candidates.sort(
    (a, b) =>
      b.ownerSessions - a.ownerSessions ||
      b.sessionSessions - a.sessionSessions ||
      a.term.localeCompare(b.term),
  );

  return {
    sessionsScanned: sessions.length,
    definitions: defs.length,
    promptsScored,
    promptsResolved,
    candidates: candidates.slice(0, limit),
    minSessions,
  };
}

/**
 * Machine-generated text that arrives in the `user` slot but that the operator never typed —
 * hook output, task notifications, harness reminders. The injector's own `isOperatorPrompt` drops
 * the same class for the same reason: 20 of 30 measured injections were triggered by them.
 */
const NON_OPERATOR =
  /^(<task-notification>|<system-reminder|<command-name|<local-command|\[storytree\]|\[worktree|Caveat:|<bash-)/i;

/**
 * ★★ WHAT MAKES A `user` ENTRY THE OPERATOR'S, and why the obvious reading is wrong.
 *
 * Most entries with `type: "user"` were never typed by anyone: tool results land in the same slot
 * (385 of 416 in one measured file), and a SUBAGENT's transcript records its task brief there too.
 * Counting them as operator vocabulary is not a small error — it inverts the ranking. Measured
 * 2026-08-30 across this repo's 504 transcript directories, the unfiltered top terms were `open`,
 * `status`, `json`, `declared`, `emit`, `just built`: agent briefs and tool output, ranked above
 * every word the owner has ever typed.
 *
 * Two harness-supplied fields separate them exactly, and both are checked:
 *   - `promptSource` is present ONLY on a genuinely submitted prompt (136 of 3,067 `user` entries
 *     in a 20-file sample), so its absence marks a tool result.
 *   - `isSidechain` is true for a subagent's own conversation, whose "user" turn is a brief this
 *     session wrote — real text, but the system talking to itself, not vocabulary the owner chose.
 *
 * The prose filter above stays as the third guard, because a task notification arrives as a
 * genuinely submitted prompt and is machine text all the same.
 */
function isOperatorEntry(rec: Record<string, unknown>): boolean {
  if (rec["type"] !== "user") return false;
  if (rec["isSidechain"] === true) return false;
  return rec["promptSource"] !== undefined;
}

/** Pull one transcript apart into what the operator typed and what the session wrote. */
export function splitTranscript(raw: string): SessionText {
  const owner: string[] = [];
  const session: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.trim().length === 0) continue;
    let entry: unknown;
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    if (typeof entry !== "object" || entry === null) continue;
    const rec = entry as Record<string, unknown>;
    const message = rec["message"];
    if (typeof message !== "object" || message === null) continue;
    const content = (message as Record<string, unknown>)["content"];

    const texts: string[] = [];
    if (typeof content === "string") texts.push(content);
    else if (Array.isArray(content)) {
      for (const part of content) {
        if (typeof part !== "object" || part === null) continue;
        const p = part as Record<string, unknown>;
        if (p["type"] === "text" && typeof p["text"] === "string") texts.push(p["text"]);
      }
    }

    for (const text of texts) {
      const trimmed = text.trim();
      if (trimmed.length === 0) continue;
      if (isOperatorEntry(rec)) {
        if (NON_OPERATOR.test(trimmed) || trimmed.length > 3000) continue;
        owner.push(trimmed);
      } else if (rec["type"] === "assistant") {
        session.push(trimmed);
      }
    }
  }
  return { owner, session };
}

/**
 * The harness names each transcript directory after the cwd the session started in, with EACH
 * non-alphanumeric character replaced by `-` — per character, NOT per run, which is why the primary
 * checkout is `C--code-storytree` (two dashes, for the `:` and the `\`) and not `C-code-storytree`.
 * Collapsing runs instead yields a prefix that matches no directory at all, and the scan then finds
 * nothing while looking exactly like a repo with no history (`C:\code\storytree` becomes `C--code-storytree`). Every
 * worktree of this repo gets its OWN directory sharing that prefix, so the prefix is exactly "this
 * repo, every session, worktrees included" — 504 of the 590 directories on this box.
 *
 * SCOPING MATTERS, and not only for speed. Unscoped, the scan reads every project's transcripts and
 * ranks THEIR vocabulary against THIS corpus's definitions, which is a category error: a term
 * another project uses heavily is not a gap in this Library.
 */
export function repoTranscriptPrefix(repoRoot: string): string {
  return repoRoot.replace(/[^a-zA-Z0-9]/g, "-");
}

/**
 * The repo root above a worktree, so the scope is the REPO rather than whatever directory the verb
 * was invoked from — a worktree's transcripts live under their own slug and share the repo prefix.
 */
export function repoRootOf(cwd: string): string {
  const marker = `${path.sep}.claude${path.sep}worktrees${path.sep}`;
  const at = cwd.indexOf(marker);
  return at === -1 ? cwd : cwd.slice(0, at);
}

export interface VocabularyDeps {
  readonly transcriptDir: () => string;
  /** The transcript files under the root that belong to THIS repo. */
  readonly collect: (dir: string) => readonly string[];
  readonly readFile: (file: string) => string;
  readonly definitions: () => readonly DefinitionDoc[];
}

/**
 * The committed projection, beside `definition-injection.mjs` in `packages/cli/` — resolved from
 * this module rather than from the cwd, exactly as `build-claude-md.ts` resolves it, so the verb
 * reads the same bytes the hook does whatever directory it is run from.
 */
function definitionsProjectionPath(): string {
  return path.resolve(fileURLToPath(import.meta.url), "..", "..", DEFINITIONS_PROJECTION_BASENAME);
}

export function defaultVocabularyDeps(
  definitionsPath: string = definitionsProjectionPath(),
  cwd: string = process.cwd(),
): VocabularyDeps {
  const prefix = repoTranscriptPrefix(repoRootOf(cwd));
  return {
    transcriptDir: resolveTranscriptDir,
    collect: (root) => {
      let entries: string[];
      try {
        entries = fs.readdirSync(root);
      } catch {
        return [];
      }
      return entries
        .filter((name) => name.startsWith(prefix))
        .flatMap((name) => collectTranscriptFiles(path.join(root, name)));
    },
    readFile: (file) => fs.readFileSync(file, "utf8"),
    definitions: () => JSON.parse(fs.readFileSync(definitionsPath, "utf8")) as DefinitionDoc[],
  };
}

function pct(part: number, whole: number): string {
  if (whole === 0) return "n/a";
  return `${((part / whole) * 100).toFixed(1)}%`;
}

/**
 * `--limit` as a positive whole number, or a refusal string naming what was wrong.
 *
 * PURE and exported so the dispatch arm carries no branch of its own: the arm reads a flag and calls
 * this, which is what makes the refusal reachable from a test at all. An arm that parsed inline
 * would be covered only by running the real command against the real filesystem.
 */
/** `--limit` read: the number, or the refusal naming what was wrong. Never both, never neither. */
export interface LimitFlagRead {
  readonly limit?: number;
  readonly refusal?: string;
}

export function parseLimitFlag(raw: unknown): LimitFlagRead {
  if (typeof raw !== "string") return {};
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { refusal: `--limit must be a positive whole number, got ${JSON.stringify(raw)}.` };
  }
  return { limit: parsed };
}

export function vocabularyHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree vocabulary",
      "",
      "Which words are in heavy use here, and which of them resolve to no `definition`?",
      "",
      "  storytree vocabulary [--limit <n>]",
      "",
      "Reads the local session transcripts, ranks terms by DOCUMENT frequency (distinct sessions,",
      "so one verbose session cannot promote a word), drops everything the shipped injector already",
      "resolves, and prints the residue. Offline: no store, no credentials.",
      "",
      "The headline is the injector's HIT RATE over the owner-prompt corpus — the figure the",
      "definition tier is trying to move — so every run is a before/after against one instrument.",
      "",
      "It REPORTS; it never authors. Frequency selects candidates and never licenses writing one,",
      "and widening an existing definition's title is usually cheaper than minting a new artifact",
      "(`edit-first-curation`) — the matcher reads slash-separated title parts as surfaces, so",
      "`arc / epic` gives one artifact two.",
      "",
      `A term must appear in ${DEFAULT_MIN_SESSIONS}+ distinct sessions to be reported. That floor is fixed rather than a`,
      "flag: it is what stops one verbose transcript promoting its own vocabulary, so loosening it",
      "per-run would quietly undo the ranking's whole guarantee.",
    ].join("\n"),
    next: ["storytree library artifact list definition", "storytree vocabulary --limit 50"],
  };
}

export function vocabularyCommand(deps: VocabularyDeps, opts: VocabularyOptions = {}): Envelope {
  const defs = deps.definitions();
  const dir = deps.transcriptDir();
  const files = deps.collect(dir);
  const sessions: SessionText[] = [];
  for (const file of files) {
    let raw: string;
    try {
      raw = deps.readFile(file);
    } catch {
      continue;
    }
    const split = splitTranscript(raw);
    if (split.owner.length === 0 && split.session.length === 0) continue;
    sessions.push(split);
  }

  const read = rankVocabulary(sessions, defs, opts);
  const lines: string[] = [];
  lines.push(
    `  hit rate:   ${read.promptsResolved} of ${read.promptsScored} owner prompts ` +
      `(${pct(read.promptsResolved, read.promptsScored)}) resolve at least one definition`,
  );
  lines.push(
    `  corpus:     ${read.definitions} definitions · ${read.sessionsScanned} transcripts read` +
      " (this repo only, worktrees included)",
  );
  lines.push(`  threshold:  a term must appear in ${read.minSessions}+ distinct sessions`);
  lines.push("");

  if (read.candidates.length === 0) {
    lines.push("  No unresolved term clears the threshold — nothing to promote on this reading.");
  } else {
    lines.push("  term                            ownerSess  sessSess  ownerN  sessN");
    for (const c of read.candidates) {
      lines.push(
        `  ${c.term.padEnd(30)}  ${String(c.ownerSessions).padStart(8)}  ` +
          `${String(c.sessionSessions).padStart(8)}  ${String(c.ownerUses).padStart(6)}  ` +
          `${String(c.sessionUses).padStart(5)}`,
      );
    }
    lines.push("");
    lines.push("  Frequency SELECTS; it does not license authoring. Promote a term only when it names");
    lines.push("  an object or an act the system treats as one thing, and a reader who mis-resolves it");
    lines.push("  does the wrong work. Prefer widening an existing definition's title (`arc / epic`)");
    lines.push("  to minting a twin — the matcher reads slash-separated title parts as surfaces.");
  }

  const heading = `storytree vocabulary — ${read.candidates.length} candidate(s) above the threshold`;
  return {
    ok: true,
    body: [heading, "", ...lines].join("\n"),
    next: ["storytree library artifact list definition", "storytree library search \"<term>\""],
  };
}
