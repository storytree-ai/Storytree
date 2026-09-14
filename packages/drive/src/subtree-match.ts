/**
 * THE SUBTREE MATCHER — does this source file fall under this declared subtree? (ADR-0317 D2.)
 *
 * PURE: no I/O, no `fs`, no `process`, no clock, and no imports. Lives HERE, in `drive`, rather than
 * beside the ownership judge in `cli`, because two surfaces now ask the same question and must get
 * the same answer:
 *
 *  - `storytree ownership` (`packages/cli/src/source-ownership.ts`, which re-exports this) reports
 *    which files fall under no declaration — the totality check.
 *  - the CLAIM NAMESPACE (`claim-namespace.ts`) answers "you named a FILE; the declared subtree over
 *    it is X" when a session claims a path instead of a subtree id (ADR-0317 D3).
 *  - the manifest COMPOSER (`manifest-fragments.ts`) asks the question one level up — does one
 *    declaration claim every file another does? — and refuses the pair ({@link subtreeCovers}).
 *
 * A second copy would let "who owns this file" diverge between the report and the claim resolver —
 * silently, and in exactly the direction this arc exists to close. So the semantics are defined once.
 *
 * THE COST, STATED. `source-ownership.ts` previously carried this and advertised itself as having no
 * imports at all "so the suite proves offline in a bare worktree". Importing this module by package
 * name costs that (module resolution wants `node_modules`). The invariant that carries the weight —
 * no I/O, no `fs`, no `process`, no clock — is untouched on both sides, and one shared matcher was
 * judged worth more than a bare-worktree property no test asserts and `pnpm -r test` cannot exercise.
 */

/** Regex metacharacters to escape when compiling a subtree pattern — `*` is handled separately. */
const REGEX_SPECIALS = /[.+^${}()|[\]\\?]/g;

/**
 * Compile one subtree pattern to an anchored matcher.
 *
 * `**` spans path segments, `*` stays within one, and `/**​/` collapses to "zero or more directories"
 * so `packages/cli/src/**​/*.ts` matches `packages/cli/src/a.ts` as well as `packages/cli/src/x/a.ts`.
 * A pattern with no `*` at all is NOT compiled here — {@link matchesSubtree} handles it as an exact
 * file or a directory prefix, which is the form a hand-written map reaches for most.
 */
function compile(pattern: string): RegExp {
  let out = "";
  let i = 0;
  while (i < pattern.length) {
    const ch = pattern[i] ?? "";
    if (ch !== "*") {
      out += ch.replace(REGEX_SPECIALS, "\\$&");
      i += 1;
      continue;
    }
    const doubled = pattern[i + 1] === "*";
    if (!doubled) {
      out += "[^/]*";
      i += 1;
      continue;
    }
    // `/**/` — zero or more whole directories, so the glob also matches the flat case.
    if (pattern[i + 2] === "/" && out.endsWith("/")) {
      out += "(?:[^/]+/)*";
      i += 3;
      continue;
    }
    out += ".*";
    i += 2;
  }
  return new RegExp(`^${out}$`);
}

/**
 * Does `file` fall under `pattern`?
 *
 * Three accepted forms, chosen so a hand-authored map needs no glob syntax to say the common things:
 * an exact file (`packages/cli/src/boundaries.ts`), a bare directory claiming everything beneath it
 * (`packages/library/src/store`), and a glob (`packages/cli/src/adr*.ts`).
 */
export function matchesSubtree(pattern: string, file: string): boolean {
  if (!pattern.includes("*")) return file === pattern || file.startsWith(`${pattern}/`);
  return compile(pattern).test(file);
}

// ---------------------------------------------------------------------------
// Covering — the one overlap a declared map may not carry
// ---------------------------------------------------------------------------

/**
 * Everything in `pattern` before its first `*` — every path the pattern matches begins with it.
 *
 * It bounds which pairs {@link subtreeCovers} is worth asking about: `broad` can cover `specific` only
 * when `specific`'s literal prefix begins with `broad`'s, because the first wildcard `specific` reaches
 * can put a character there that `broad` does not have.
 */
export function literalPrefix(pattern: string): string {
  const star = pattern.indexOf("*");
  return star === -1 ? pattern : pattern.slice(0, star);
}

/**
 * Does `broad` claim every path `specific` claims?
 *
 * This is the overlap the manifest's authoring rule (2) forbids — "never a specific entry plus a
 * broader one covering it" — and the one a FRAGMENTED map cannot carry. The ownership judge credits a
 * file matched twice to whichever declaration comes first, so a covered declaration is decided by
 * order alone, and fragments have no order. Measured on the live manifest (2026-09-14): exactly three
 * declarations are covered, and they are exactly the three files `storytree ownership` reports
 * CONTESTED.
 *
 * INTERSECTING IS NOT COVERING, and the difference is load-bearing. 434 pairs of live declarations
 * could both match SOME path — `packages/cli/src/*boundaries*.ts` and `packages/cli/src/gate*.ts` both
 * match a `gate-boundaries.ts` nobody has written — so refusing an intersection would refuse the map.
 * A file that really does land in one is still the ownership judge's to report.
 *
 * A PATTERN WITH NO `*` HAS TWO READINGS. {@link matchesSubtree} reads one as an exact file or as a
 * directory claiming everything beneath it, and only the disk can say which. So:
 *
 *  - a LITERAL `specific` is covered when `broad` matches its own path. That is the file reading, and
 *    it is what a hand-written map means by `packages/cli/src/uat-revision-continuity.ts`. The price,
 *    stated: a directory declared beside a glob that matches its NAME (`src/store` beside `src/*`) is
 *    reported too, although no file sits under both.
 *  - a GLOB `specific` is covered when `broad` matches every WELL-FORMED path it can match — no empty
 *    segment, no leading or trailing `/`. A doubled slash is a string the matcher accepts and never a
 *    path on disk, and counting it would let a one-directory star escape a many-directory one on a
 *    technicality.
 */
export function subtreeCovers(broad: string, specific: string): boolean {
  if (!specific.includes("*")) return matchesSubtree(broad, specific);
  if (!broad.includes("*")) return specific.startsWith(`${broad}/`);
  return coversEveryPath(tokenise(broad), tokenise(specific));
}

/** One step of a pattern, read exactly as {@link compile} reads it. */
type PatternStep =
  | { readonly kind: "char"; readonly char: string }
  /** `*` — any run of characters that holds no `/`, the empty run included. */
  | { readonly kind: "name" }
  /** `**` — any run of characters at all. */
  | { readonly kind: "any" }
  /** `**` between two slashes — any number of whole directories, none included. */
  | { readonly kind: "dirs" };

const SLASH: PatternStep = { kind: "char", char: "/" };
const NAME: PatternStep = { kind: "name" };
const ANY: PatternStep = { kind: "any" };
const DIRS: PatternStep = { kind: "dirs" };

/**
 * The steps of `pattern`. The alternation is ordered so a slash-star-star-slash run is taken whole —
 * {@link compile}'s "zero or more directories" — before a bare `**` or `*` can claim its stars.
 */
function tokenise(pattern: string): PatternStep[] {
  return [...pattern.matchAll(/\/\*\*\/|\*\*|\*|[^*]/g)].flatMap(([piece]): PatternStep[] => {
    if (piece === "/**/") return [SLASH, DIRS];
    if (piece === "**") return [ANY];
    return piece === "*" ? [NAME] : [{ kind: "char", char: piece }];
  });
}

/*
 * A POSITION in a pattern is one number. At step `index` with no directory name open it is
 * `position(index)`; inside a `dirs` step whose directory name has begun but not yet reached its `/`,
 * it is `namePosition(index)`. The position one past the last step is the accepting one. Both sides of
 * the search below read and write positions only through these four functions, so neither side can
 * mean by a position something the other does not.
 */

function position(index: number): number {
  return index * 2;
}

function namePosition(index: number): number {
  return index * 2 + 1;
}

function stepAt(at: number): number {
  return Math.floor(at / 2);
}

function nameOpen(at: number): boolean {
  return at % 2 === 1;
}

/** Add `at`, and every position reachable from it without reading: a star or a `dirs` may match nothing. */
function reach(steps: readonly PatternStep[], at: number, into: Set<number>): void {
  into.add(at);
  const step = steps[stepAt(at)];
  if (step !== undefined && step.kind !== "char" && !nameOpen(at)) reach(steps, position(stepAt(at) + 1), into);
}

function closure(steps: readonly PatternStep[], at: number): Set<number> {
  const into = new Set<number>();
  reach(steps, at, into);
  return into;
}

/**
 * Where the positions `from` go on reading `char` — the BROAD pattern's side of the search, which
 * follows every position at once. `null` is a name character no pattern spells (see {@link moves}).
 */
function advance(steps: readonly PatternStep[], from: ReadonlySet<number>, char: string | null): Set<number> {
  const to = new Set<number>();
  for (const at of from) {
    const index = stepAt(at);
    const step = steps[index];
    // The accepting position reads nothing further.
    if (step === undefined) continue;
    if (step.kind === "char") {
      if (step.char === char) reach(steps, position(index + 1), to);
    } else if (step.kind === "any") reach(steps, at, to);
    else if (char !== "/") reach(steps, step.kind === "dirs" ? namePosition(index) : at, to);
    // A `/` closes a directory name a `dirs` step has begun, and is refused by a one-name star.
    else if (nameOpen(at)) reach(steps, position(index), to);
  }
  return to;
}

/**
 * What the SPECIFIC pattern may read at `at`, and where each character takes it — the other side of the
 * search, which follows one position at a time so it never wanders down a path `specific` could not
 * have produced.
 *
 * It does not produce every path `specific` matches — only enough of them to be exact. Its wildcards
 * produce one name character, `null`, which no pattern spells, and at most one of it per name. A path
 * `broad` misses stays missed when every character a wildcard of `specific` produced is swapped for one
 * no pattern spells — only a wildcard of `broad` could have read the original, and a wildcard reads the
 * swap just as well — and it stays missed when each run of swapped characters is cut to one, because a
 * wildcard of `broad` reads such a run the same at every length from one up. A `*` may still produce
 * nothing, which is a different path. A `**` keeps its loop: it has to cross `/`, and those it cannot cut.
 */
function moves(step: PatternStep, at: number): (readonly [string | null, number])[] {
  const index = stepAt(at);
  if (step.kind === "char") return [[step.char, position(index + 1)]];
  if (step.kind === "name") return [[null, position(index + 1)]];
  if (step.kind === "any") return [[null, at], ["/", at]];
  // `dirs`: a directory name of one character, then the `/` that closes it.
  return nameOpen(at) ? [["/", position(index)]] : [[null, namePosition(index)]];
}

/**
 * Whether the path read so far ends inside a name. It does not at the start, and it does not straight
 * after a `/` — one value for both, so the start and the separator cannot drift apart.
 */
const AFTER_SEPARATOR = false;

/**
 * Is every well-formed path `specific` matches also matched by `broad`? Both are globs.
 *
 * A depth-first search that walks `specific` one position at a time while carrying every position
 * `broad` could be in after the same characters. It answers false the moment `specific` accepts a
 * well-formed path that `broad` does not, and it terminates because a reading — a position, a position
 * set, and whether a name is open — repeats, and a repeated one is not searched twice. Depth-first on
 * purpose: a search that stopped remembering recurses without end at once, instead of widening until
 * it runs out of memory.
 *
 * Walking `specific`'s own moves, and giving its wildcards one character to produce, is what keeps it
 * cheap. Measured over the live manifest's 620 glob pairs that could cover each other, a version that
 * tried every character on both patterns took 3.5 s.
 */
function coversEveryPath(broad: readonly PatternStep[], specific: readonly PatternStep[]): boolean {
  const accepting = position(specific.length);
  const searched = new Set<string>();
  const visit = (at: number, from: ReadonlySet<number>, inName: boolean): boolean => {
    // The sort only canonicalises the memo key of a SET: an unsorted key revisits a reading already
    // searched, which is finitely many revisits and the same verdict.
    // Stryker disable next-line MethodExpression: EQUIVALENT — see the note above.
    const key = `${at}|${[...from].sort()}|${inName}`;
    if (searched.has(key)) return true;
    searched.add(key);
    // A path ends inside a name: `specific` ending on a `/` has produced no path for `broad` to miss.
    if (at === accepting) return !inName || from.has(position(broad.length));
    return moves(specific[stepAt(at)] ?? ANY, at).every(([char, next]) => {
      // A `/` where no name is open is an empty segment or a leading slash — never a path.
      if (char === "/" && !inName) return true;
      const after = advance(broad, from, char);
      const named = char === "/" ? AFTER_SEPARATOR : !AFTER_SEPARATOR;
      return [...closure(specific, next)].every((to) => visit(to, after, named));
    });
  };
  return [...closure(specific, position(0))].every((at) => visit(at, closure(broad, position(0)), AFTER_SEPARATOR));
}
