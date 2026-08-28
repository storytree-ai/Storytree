/**
 * The pure judge behind `pnpm check:desktop-route-coverage` (`traversal-panel-arc`, increment
 * `desktop-route-coverage-is-unasked`): what does the shared frontend CALL, what does each backend
 * SERVE, and which called route does the desktop not serve?
 *
 * ## THE QUESTION THIS ASKS, AND WHY IT IS NOT THE ONE WE ALREADY ASKED
 *
 * `mirrored-route-conformance` (`check:mirror-conformance`) states its outcome as *"every `/api/*`
 * payload the desktop RE-COMPOSES is proven equal to the studio's reference payload"*. Read the
 * quantifier: it ranges over the routes the desktop ALREADY SERVES, and proves their payloads equal.
 * A studio route the desktop never mirrored has no desktop payload, so there is nothing to be
 * unequal, so there is no finding. **It is vacuously green on exactly the case that bites** — and it
 * was: the Traversal tab shipped in the compiled bundle the desktop serves and answered
 * `unknown endpoint` for weeks with a green gate throughout. `/api/arcs` (#1191) and
 * `/api/floor-health` (#1228) are the same class, found the same way, by a human looking at the app.
 *
 * So the question here is ABSENCE, never inequality: **does the desktop serve every route the shared
 * frontend can call?** A conformance check comparing what both sides HAVE is structurally blind to
 * what one side LACKS, and rebuilding this in that shape would have produced a second permanently
 * green rung.
 *
 * ## THE ROUTE LIST IS DERIVED, NEVER HAND-KEPT
 *
 * A hand-kept list of "what the frontend calls" is the same defect one level up: complete on the day
 * it is written and silently incomplete forever after — which is precisely how the check that should
 * have caught this came to be vacuous. Both sides are read off the source:
 *
 *   · CALLED — every `/api/*` literal in the studio frontend's ONE API client
 *     (`apps/studio/src/api.ts`). Measured 2026-08-28: every path there is a plain string literal or
 *     a template whose LITERAL PREFIX is the path, with no base-URL variable, no concatenation and
 *     no path held in a variable. That is a property of today's source, not a law — so
 *     {@link parseCalledRoutes} REFUSES rather than under-reporting when it meets a call site it
 *     cannot resolve, and {@link findForeignApiLiterals} refuses when a SECOND client appears.
 *   · SERVED — every `/api/*` path a backend's source DISPATCHES on
 *     ({@link parseDispatchedRoutes}), the enumeration `check:verification-decay`'s
 *     `mirror-pair-drift` already runs. It is defined HERE and imported there, so the two readers
 *     cannot come to disagree about what a surface serves.
 *
 * ## EVERY DERIVATION HERE FAILS LOUD, NEVER EMPTY
 *
 * The whole fault class this increment belongs to is an instrument that reports health because it
 * measured nothing. Two empty route tables have an empty difference, so a broken scan would report a
 * perfect sweep. Accordingly: an unreadable file, a client that yields no routes, a call site whose
 * path cannot be resolved to a literal, and an `/api/` literal in a file that is not the client are
 * all REFUSALS — never a quiet zero. The caller turns a refusal into a red.
 *
 * ## AND THE EXCEPTIONS ARE SELF-PRUNING
 *
 * Not every studio route belongs on the desktop: the hosted admin and DB-control surfaces do not.
 * That divergence is legitimate, so this cannot be a naive "everything must be mirrored" assertion —
 * it needs a declared list, and an exception that carries no reason becomes the hole. So an
 * exception is `{ route, reason }`, and {@link findUnservedRoutes} reports a STALE one — an exception
 * for a route the frontend no longer calls, or one the desktop now DOES serve — as its own finding.
 * That is `referenceOnlyFields`'s discipline: an allowlist nobody prunes eventually covers something
 * it was never meant to.
 */

// `typescript5` is this repo's alias for the classic TypeScript 5 API (`npm:typescript@5.7.3`).
// The plain `typescript` dependency is pinned at the 7.x preview, whose Node surface exposes a
// handful of symbols and no scanner — measured 2026-08-29: 3 exported keys, no `ts.ScriptTarget`.
import * as ts from "typescript5";

/** A route the frontend can call, with where it was found. */
export interface CalledRoute {
  /**
   * The path, normalised for comparison against a dispatch table: the literal prefix up to the first
   * `?` or `${`. An interpolated PATH SEGMENT (`/api/arcs/${id}`) keeps its trailing slash and is
   * matched against prefix dispatch (`startsWith("/api/arcs/")`).
   */
  readonly route: string;
  /** 1-indexed line in the client, so a finding points at the call rather than at the file. */
  readonly line: number;
  /** True when the path ends in an interpolated segment and must be matched as a PREFIX. */
  readonly isPrefix: boolean;
}

/** What one backend's source dispatches on. */
export interface DispatchedRoutes {
  /** Exact-match dispatch: `pathname === "/api/x"` (or `!==`, the fall-through mount idiom). */
  readonly exact: ReadonlyMap<string, string>;
  /** Prefix dispatch: `pathname.startsWith("/api/x/")`. */
  readonly prefix: ReadonlyMap<string, string>;
}

/** A route the desktop deliberately does not serve, and why. */
export interface RouteException {
  readonly route: string;
  /** REQUIRED. An exception with no reason is indistinguishable from an oversight. */
  readonly reason: string;
}

export type CoverageFinding =
  | {
      readonly kind: "unserved";
      readonly route: string;
      readonly line: number;
      readonly detail: string;
    }
  | { readonly kind: "stale-exception"; readonly route: string; readonly detail: string };

/**
 * Blank the comments out of TypeScript/TSX source, leaving every other character — and every line
 * number — exactly where it was.
 *
 * ⚠ IT IS THE LOAD-BEARING HALF OF THE DERIVATION, not a tidy-up. Measured 2026-08-28: `apps/studio`
 * holds 57 `/api/*` literals outside the API client and EVERY ONE of them is prose in a comment —
 * including `/api/presence`, `/api/build` and `/api/adopt`, three routes nothing calls any more. A
 * scan that read comments would report those as called, and the false findings would then be
 * "silenced" by exception entries, which is how an exception list stops meaning anything. It would
 * also break {@link findForeignApiLiterals} outright: every one of those 57 would look like a second
 * API client.
 *
 * ## IT USES THE COMPILER'S OWN SCANNER, AND THAT IS THE SECOND ANSWER HERE
 *
 * The first was a hand-written character walk: ~75 lines tracking string, template, escape and regex
 * state, with a `prevSignificant` heuristic to tell `/` -as-division from `/` -as-regex-start whose
 * own comment conceded it was "an approximation". It worked on every input this repo contains, and
 * it was still the wrong shape twice over. It carried a stated residual exposure (a `[//]` character
 * class truncating its line). And it was ~100 lines of mutable branch-and-index arithmetic that no
 * test could discriminate — loop guards whose mutants hang rather than fail, accumulator arms that
 * differ only in an unreachable index — which is a lot of unprovable surface under a module whose
 * whole subject is instruments that cannot fail.
 *
 * `ts.createScanner` is the scanner the compiler uses on these same files. It is exact by
 * construction on strings, templates, escapes and JSX, it needs no heuristic, and it leaves this
 * function with one loop and one branch. The dependency is not new to the repo — every package here
 * already builds with it.
 *
 * AND THE RESIDUAL EXPOSURE IS GONE RATHER THAN DOCUMENTED. Both earlier drafts truncated a line
 * holding a regex whose body contains two adjacent slashes (`/[//]/`, reachable only inside a
 * character class) and carried that as a stated caveat. The parse has no such gap — it resolves
 * regex literals, templates with substitutions, and JSX — so the caveat is retired and pinned by
 * test instead, where a return to a cheaper scan reds.
 *
 * ⚠ TWO THINGS THE IMPLEMENTATION MUST GET RIGHT, both of them measured on this repo rather than
 * anticipated, and both of them silent when wrong:
 *   · THE LANGUAGE VARIANT FOLLOWS THE EXTENSION. `apps/studio/src/api.ts` is full of `http<T>(…)`
 *     generics; parsed as JSX those open a tag and take the rest of the file with them, and a JSDoc
 *     block eighty lines later gets scanned as CODE — its backtick-quoted prose then reported a
 *     called route `"/"`. In isolation the same comment blanked correctly, which is how a desync
 *     hides: the failure is never near its cause.
 *   · TRAILING COMMENT RANGES ARE TAKEN AS WELL AS LEADING. A JSX comment-only expression container
 *     (a brace pair wrapping nothing but a block comment) has only its two braces as children, and
 *     the comment between them is neither token's LEADING
 *     trivia. A leading-only sweep left `apps/studio/src/App.tsx:293` intact and reported its prose
 *     mention of `/api/assets` as a SECOND API client.
 *
 * COMMENTS ARE BLANKED RATHER THAN DELETED, preserving both the byte offsets and the newlines. Line
 * numbers are what every finding is reported at, and an offset shift would move each one silently.
 */
// Stryker disable next-line StringLiteral: EQUIVALENT — the default is only ever consulted by
// `.endsWith(".tsx")`, and EVERY string that is not that suffix selects the same variant. It exists
// so a caller with no filename to hand still gets the commoner reading, not to carry a value.
export function stripComments(source: string, file = ""): string {
  // A FULL PARSE, not a bare token scan, and the difference is not academic. `ts.createScanner`
  // alone desyncs on a template with a substitution: the closing `}` of `${…}` is only re-read as a
  // template MIDDLE/TAIL when a parser calls `reScanTemplateToken`, so a lone scanner emits a
  // CloseBraceToken and then treats the following backtick as opening a NEW template — which runs on
  // until the next backtick, swallowing whatever lies between. Measured 2026-08-29 on
  // `apps/studio/src/api.ts`, whose `/api/docs/content?id=${q(id)}` template did exactly that and
  // left a JSDoc block eighty lines later being scanned as CODE, so its backtick-quoted prose
  // reported a called route `"/"`. In ISOLATION the same comment blanked correctly — which is how a
  // desync hides: the failure is never near its cause.
  //
  // The parser resolves templates, regex literals and JSX for us, so its comment ranges are exact.
  const sourceFile = ts.createSourceFile(
    // The extension is what selects the language variant, so a `.tsx` file is parsed as JSX and a
    // `.ts` file's generics (`http<T>(…)`) are not read as JSX tags.
    // Stryker disable next-line StringLiteral: only the EXTENSION is read (it selects the language
    // variant); the stem is a placeholder this function never reports and no caller sees.
    file.endsWith(".tsx") ? "s.tsx" : "s.ts",
    source,
    ts.ScriptTarget.Latest,
    // Stryker disable next-line BooleanLiteral: EQUIVALENT for this walk — `getChildren(sourceFile)`
    // is passed the source file explicitly, so it needs no parent pointers. Kept `true` because a
    // reader reaching for `node.parent` while debugging should find it there.
    /* setParentNodes */ true,
  );

  // Every comment is leading trivia of SOME token, including the end-of-file token, so walking the
  // token tree reaches all of them. Collected as ranges rather than removed in place: the blanking
  // below must preserve byte offsets, because every finding is reported at a LINE number.
  const ranges: { pos: number; end: number }[] = [];
  const seen = new Set<number>();
  const take = (found: readonly ts.CommentRange[] | undefined): void => {
    for (const range of found ?? []) {
      if (seen.has(range.pos)) continue;
      seen.add(range.pos);
      ranges.push({ pos: range.pos, end: range.end });
    }
  };
  const collect = (node: ts.Node): void => {
    take(ts.getLeadingCommentRanges(source, node.pos));
    // TRAILING as well as leading, and the JSX case is why. A `{/* … */}` expression container with
    // no expression has only its two braces as children, and the comment between them is neither
    // token's LEADING trivia — measured 2026-08-29, `apps/studio/src/App.tsx:293`, whose JSX comment
    // mentioning `/api/assets` survived a leading-only sweep and was reported as a SECOND API
    // client. Every comment is one or the other of some token, so taking both reaches all of them.
    take(ts.getTrailingCommentRanges(source, node.end));
    for (const child of node.getChildren(sourceFile)) collect(child);
  };
  collect(sourceFile);

  let out = source;
  // Latest-first, so an earlier splice cannot move a later range's offsets.
  for (const range of ranges.sort((a, b) => b.pos - a.pos)) {
    const blanked = source.slice(range.pos, range.end).replace(/[^\n]/g, "");
    out = out.slice(0, range.pos) + blanked + out.slice(range.end);
  }
  return out;
}

/**
 * The prefix that claims no route. Only `/api/` is reachable: {@link parseDispatchedRoutes}'s PREFIX
 * pattern requires the trailing slash, so a `startsWith("/api")` written one character shorter never
 * captures anything for this set to reject. An earlier draft listed both and the `"/api"` entry was
 * a branch nothing could enter.
 */
const API_REQUEST_GUARD: ReadonlySet<string> = new Set(["/api/"]);

export function parseDispatchedRoutes(source: string, file: string): DispatchedRoutes {
  const text = stripComments(source, file);
  const exact = new Map<string, string>();
  const prefix = new Map<string, string>();
  // ⚠ THE LEFT BOUNDARY IS LOAD-BEARING, and it was missing until a near-miss test caught it. Without
  // `(?<![\w$])`, an identifier merely ENDING in `pathname` — `requestPathname === "/api/x"` — reads
  // as a dispatch, so a comparison against some other string would register a route the surface does
  // not serve. A route wrongly believed served is a gap this check can never report: it is the
  // false-NEGATIVE direction, and the only one that matters here. `url.pathname` still matches,
  // because `.` is neither a word character nor `$`.
  const EXACT = /(?<![\w$])pathname\s*(?:===|!==)\s*["'](\/api\/[^"']*)["']/g;
  // ⚠ THE `!` IS NOT OPTIONAL, AND NEITHER IS {@link API_REQUEST_GUARD} BELOW. `startsWith` has two
  // completely different jobs in these route tables, and reading them alike makes this whole check
  // vacuous rather than merely imprecise. `pathname.startsWith("/api/arcs/")` CLAIMS a family of
  // routes; `if (!url.pathname.startsWith("/api/"))` asks "is this an API request at all?" before
  // 404-ing everything else, and `local-backend.ts:355` is exactly that. Read as a dispatch, the
  // second one registers the prefix `/api/` — which every called route starts with, so the desktop
  // would appear to serve EVERYTHING and this check would find nothing, forever. It was caught here
  // by its own symptom: four hand-written exceptions all reported STALE because "the desktop now
  // serves them".
  const PREFIX = /(?<![!\w$])pathname\s*\.\s*startsWith\s*\(\s*["'](\/api\/[^"']*)["']/g;
  for (const m of text.matchAll(EXACT)) {
    const route = m[1];
    // Stryker disable next-line ConditionalExpression,LogicalOperator: EQUIVALENT — group 1 is
    // inside no optional branch of the pattern, so a match ALWAYS captures it. The check is
    // `noUncheckedIndexedAccess` satisfying the compiler, not a runtime possibility.
    // First dispatcher wins: a report needs ONE place to look, and a route claimed twice is still
    // one route.
    if (route !== undefined && !exact.has(route)) exact.set(route, file);
  }
  for (const m of text.matchAll(PREFIX)) {
    const route = m[1];
    // The bare `/api/` prefix claims no route — see the note on PREFIX. Dropped rather than refused
    // because it is a legitimate and permanent idiom in both route tables.
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — `route === undefined` cannot
    // hold (group 1 is unconditional in the pattern), so the disjunction is decided entirely by the
    // guard set, whose own effect IS asserted (an un-negated `startsWith("/api/")` must claim no
    // route).
    if (route === undefined || API_REQUEST_GUARD.has(route)) continue;
    // Stryker disable next-line ConditionalExpression: EQUIVALENT WITHIN ONE FILE — every route this
    // loop records is attributed to the SAME `file`, so first-wins and last-wins store an identical
    // value. First-wins is observable only ACROSS files, where `mergeDispatchedRoutes` decides it,
    // and that is asserted there.
    if (!prefix.has(route)) prefix.set(route, file);
  }
  return { exact, prefix };
}

/** Merge per-file dispatch tables into one surface's table. */
export function mergeDispatchedRoutes(tables: readonly DispatchedRoutes[]): DispatchedRoutes {
  const exact = new Map<string, string>();
  const prefix = new Map<string, string>();
  for (const t of tables) {
    for (const [route, file] of t.exact) if (!exact.has(route)) exact.set(route, file);
    for (const [route, file] of t.prefix) if (!prefix.has(route)) prefix.set(route, file);
  }
  return { exact, prefix };
}

/** Thrown when a derivation cannot see what it claims to see. The caller turns it into a RED. */
export class RouteDerivationError extends Error {}

/**
 * Every `/api/*` path the frontend's API client can issue, read off its source.
 *
 * ## COLLECTING THE LITERALS IS THE EASY HALF — KNOWING THE COLLECTION IS COMPLETE IS THE POINT
 *
 * A derivation that silently under-reports is the same defect as the hand-kept list it replaces, one
 * level down, so three shapes are REFUSED rather than skipped. Each is a way a path could reach
 * `fetch` without passing through a literal this scan can see:
 *
 *   1. AN ASSEMBLED PATH — a bare `"/api/"` literal, which only ever exists to be concatenated with
 *      something. The pieces are invisible; the route is unknowable.
 *   2. A PREFIXED PATH — `` `${base}/api/x` ``, where `/api/` is not at the literal's start. This is
 *      the base-URL shape, and it is how one config change would take every route out of view at
 *      once.
 *   3. A NON-`/api/` REQUEST PATH — any `/`-leading path literal that is not `/api/…`. Today the
 *      client issues nothing else; if it starts to, this scan is classifying routes by a prefix that
 *      no longer describes the surface, and somebody must decide what that means before it is
 *      silently excluded.
 *
 * ## AND THE BLIND SPOT THAT REMAINS, STATED RATHER THAN IMPLIED
 *
 * A path held in a local constant (`const P = "/api/x"; http(P)`) is still COVERED — the literal is
 * in this file and this scan reads literals, not call graphs. What is genuinely not covered is a path
 * assembled in a HELPER that this file calls and that lives elsewhere. That shape is caught one door
 * along rather than here: {@link findForeignApiLiterals} refuses an `/api/*` literal anywhere else in
 * the frontend trees, so the helper cannot hold the string either. The uncovered residue is a path
 * built from fragments that are individually not `/api/`-shaped — and guard 1 is what makes that
 * expensive to write by accident.
 *
 * An earlier draft guarded this differently: every `http(`/`fetch(` call site had to carry an
 * `/api/` literal in its own argument list. It refused on the client's own transport primitive
 * (`api.ts:33`, `fetch(url, init)` — the one indirection every route legitimately passes through),
 * which is a false alarm rather than a finding, and a check whose first act is to red on correct code
 * teaches its reader to reach for the exception list.
 */
export function parseCalledRoutes(source: string, file: string): CalledRoute[] {
  const text = stripComments(source, file);
  const lineOf = (index: number): number => text.slice(0, index).split("\n").length;
  const refuse = (index: number, what: string, why: string): never => {
    // Stryker disable StringLiteral: NOT DISCRIMINABLE, and deliberately not labelled EQUIVALENT.
    // Every string from here to the matching `restore` is HUMAN-FACING REMEDY PROSE — what a red
    // tells the person reading it to go and do. Mutating a fragment of it changes what that person
    // reads, so these mutants are not equivalent; they are simply not killable by any test that is
    // not a transcription of the message. A suite asserting each sentence verbatim would be the
    // message written twice, and the copy in the test would drift from the copy in the code the
    // first time anyone improved the wording — the two-lists-of-one-fact class this whole module
    // exists to fence. What IS asserted is the part that carries meaning: every refusal's own test
    // matches the phrase that identifies WHICH refusal fired, so a branch that threw the wrong one
    // still reds.
    throw new RouteDerivationError(
      `${file}:${lineOf(index)} — ${what}\n  ${why}\n  The called-route set is DERIVED from this ` +
        "file's path literals, so a path this scan cannot read is a route it cannot check. Write the " +
        "path as a whole `/api/…` literal, or teach parseCalledRoutes the new shape " +
        "(packages/cli/src/route-tables.ts).",
    );
    // Stryker restore StringLiteral
  };

  const routes = new Map<string, CalledRoute>();
  // Any `/`-leading path literal (string OR template). Not just `/api/` ones: a request path at some
  // other prefix is guard 3, and it has to be SEEN to be refused.
  const PATH_LITERAL = /["'`](\/[^"'`]*)/g;
  for (const m of text.matchAll(PATH_LITERAL)) {
    const raw = m[1];
    const at = m.index ?? 0;
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — see the note on the EXACT loop
    // above; group 1 is unconditional in this pattern too.
    if (raw === undefined) continue;

    if (!raw.startsWith("/api/")) {
      // Guard 3. `//` is a protocol-relative URL or the remains of one, not a request path.
      if (raw.startsWith("//")) continue;
      // Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
      refuse(
        at,
        `the client issues the path "${raw}", which is not an \`/api/…\` route.`,
        "This scan classifies the frontend's calls by that prefix; a request path outside it is " +
          "either a route served somewhere this check does not look, or a static asset that should " +
          "not be reached through the API client.",
      );
      // Stryker restore StringLiteral
    }

    // TWO EQUIVALENCES ON THE NEXT LINE, both worth naming because both look like real branches.
    // `>= 0` vs `> 0`: index 0 is unreachable — `raw` begins with `/` (the pattern anchors on it), so
    // neither `?` nor `${` can be its first character; `-1` (absent) is what the filter drops.
    // `[raw.length]` vs `[]`: that fallback is consulted only when NEITHER marker is present, and
    // `Math.min()` of nothing is `Infinity`, which slices to exactly the same whole string.
    const cutAt = Math.min(
      // Stryker disable next-line EqualityOperator,ArrayDeclaration: see the two equivalences above.
      ...[raw.indexOf("?"), raw.indexOf("${")].filter((i) => i >= 0).concat([raw.length]),
    );
    const route = raw.slice(0, cutAt);
    const tail = raw.slice(cutAt);
    // An interpolated TRAILING segment (`/api/arcs/${id}`) resolves to a prefix; a query
    // (`/api/traversal?session=${id}`) resolves to an exact pathname. Anything else — an
    // interpolation in the MIDDLE (`/api/${kind}/list`, `/api/foo/${x}/bar`) — resolves to neither,
    // so the tail must be the WHOLE of what remains or the path names no single route.
    // The `^` is NOT redundant: when the cut fell on a `?`, the tail is a QUERY and may still end in
    // an interpolation (`?q=${v}`), which an unanchored pattern would match — turning a path like
    // `/api/x/?q=${v}` into a family prefix it never asked for.
    const isPrefix = /^\$\{[^}]*\}$/.test(tail) && route.endsWith("/");

    // ⚠ GUARD 1 IS CHECKED ON THE RESOLVED ROUTE, NOT ON THE RAW LITERAL, and that distinction is
    // load-bearing. `"/api/" + kind` and `` `/api/${kind}/list` `` both resolve to the bare `/api/`,
    // and a bare `/api/` accepted as a called PREFIX matches every served route there is — the same
    // vacuity as the `startsWith("/api/")` guard on the dispatch side. Checking `raw` alone caught
    // only the first of the two, and the second went green.
    // Only `/api/` is reachable: a literal spelled exactly `"/api"` is refused above by guard 3, as
    // a path that is not an `/api/…` route. An earlier draft also tested `route === "/api"` here; it
    // was a branch nothing could enter, which is one more unprovable line under a module whose whole
    // subject is instruments that cannot fail.
    if (route === "/api/") {
      // Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
      refuse(
        at,
        tail.startsWith("${")
          ? `the path "${raw}" interpolates at the ROOT, so it names no single route.`
          : "a bare `/api/` literal — a path being ASSEMBLED rather than written.",
        "It resolves to the bare prefix `/api/`, which every route in the app starts with: accepted, " +
          "it would match every dispatch table and this check would never find a gap again.",
      );
      // Stryker restore StringLiteral
    }
    if (tail.startsWith("${") && !isPrefix) {
      // Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
      refuse(
        at,
        `the path "${raw}" interpolates INSIDE a segment, so it names no single route.`,
        "A dispatch table matches whole pathnames; this scan can resolve an interpolated TRAILING " +
          "segment (matched as a prefix) and a query string, but not a computed segment name.",
      );
      // Stryker restore StringLiteral
    }
    if (!routes.has(route)) routes.set(route, { route, line: lineOf(at), isPrefix });
  }

  // Guard 2: `/api/` reached only after an interpolation — the base-URL shape, which would take
  // every route out of view at once. Checked over the raw text because the literal scan above,
  // anchored at the quote, cannot see it by construction.
  const PREFIXED = /["'`][^"'`\n]*\$\{[^}]*\}\/api\//g;
  for (const m of text.matchAll(PREFIXED)) {
    // Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
    refuse(
      // Stryker disable next-line LogicalOperator: EQUIVALENT — `matchAll` always sets `index`; the
      // `?? 0` is the DOM type's optional field, not a case that occurs.
      m.index ?? 0,
      "an `/api/…` path reached through an interpolated PREFIX (a base URL).",
      "Every route would leave this scan's view together, and nothing would go red.",
    );
    // Stryker restore StringLiteral
  }

  if (routes.size === 0) {
    // Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
    throw new RouteDerivationError(
      `${file} — no \`/api/*\` literal found. The frontend certainly calls routes, so an empty ` +
        "answer means this derivation broke, not that nothing is called: an empty called-set has an " +
        "empty difference against any route table and would report a perfect sweep.",
    );
    // Stryker restore StringLiteral
  }
  // Stryker disable next-line EqualityOperator: EQUIVALENT — the values come from a Map keyed BY
  // route, so no two entries share one and `<` and `<=` can never be asked about a tie.
  return [...routes.values()].sort((a, b) => (a.route < b.route ? -1 : 1));
}

/**
 * Refuse when an `/api/*` literal appears in frontend code OUTSIDE the one API client.
 *
 * The derivation above rests on a measured property — that `apps/studio/src/api.ts` is the frontend's
 * only API client — and a property that holds today is not a law. `packages/app-surface` is fenced by
 * its own suites (two tests refuse `fetch` / `EventSource` / `WebSocket` in its source), but nothing
 * fenced the studio. This is that fence: a second client, or a path constant somewhere else, makes
 * the derivation incomplete, and incomplete is the one thing it may not be silently.
 *
 * Comments are stripped first — all 57 of the studio's non-client `/api/*` mentions are prose.
 */
export function findForeignApiLiterals(
  files: readonly { file: string; source: string }[],
): { file: string; line: number; text: string }[] {
  const found: { file: string; line: number; text: string }[] = [];
  for (const { file, source } of files) {
    const text = stripComments(source, file);
    for (const m of text.matchAll(/["'`](\/api\/[^"'`]*)/g)) {
      const raw = m[1];
      // Stryker disable next-line ConditionalExpression: EQUIVALENT — group 1 is unconditional.
      if (raw === undefined) continue;
      found.push({ file, line: text.slice(0, m.index ?? 0).split("\n").length, text: raw });
    }
  }
  return found;
}

/** True when `route` is served by an exact or a prefix dispatch in `served`. */
function isServed(route: CalledRoute, served: DispatchedRoutes): boolean {
  if (!route.isPrefix && served.exact.has(route.route)) return true;
  for (const p of served.prefix.keys()) {
    // A prefix dispatch `startsWith("/api/arcs/")` serves `/api/arcs/<id>`; a dispatch on
    // `startsWith("/api/docs")` also serves `/api/docs/content`.
    if (route.route.startsWith(p)) return true;
    // …and a called PREFIX (`/api/arcs/`) is served by a dispatch at or below it.
    if (route.isPrefix && p.startsWith(route.route)) return true;
  }
  return false;
}

/**
 * The judgement: which called route does the mirror not serve, and which exception no longer covers
 * anything.
 *
 * BOTH halves are findings, and the second is what keeps the first honest over time. An exception is
 * how a legitimate divergence is declared, so nothing stops an exception being added to silence a
 * REAL gap — except that an exception which stops matching a called route, or whose route the mirror
 * has since started serving, is reported here and must be deleted. An allowlist nobody prunes
 * eventually covers something it was never meant to (`referenceOnlyFields`'s own lesson).
 */
export function findUnservedRoutes(input: {
  readonly called: readonly CalledRoute[];
  readonly served: DispatchedRoutes;
  readonly exceptions: readonly RouteException[];
}): CoverageFinding[] {
  const { called, served, exceptions } = input;
  const excepted = new Map(exceptions.map((e) => [e.route, e]));
  const findings: CoverageFinding[] = [];

  for (const route of called) {
    if (isServed(route, served)) continue;
    if (excepted.has(route.route)) continue;
    findings.push({
      kind: "unserved",
      route: route.route,
      line: route.line,
// Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
      detail:
        `the shared frontend calls ${route.route} and the desktop backend dispatches no such path, ` +
        "so the desktop serves its catch-all `404 {\"error\":\"unknown endpoint\"}` for a surface " +
        "that works in the studio. Mirror the route into the desktop backend (re-composed verbatim, " +
        "never importing apps/studio/server — ADR-0176), or declare the divergence WITH ITS REASON " +
        "in DESKTOP_ROUTE_EXCEPTIONS.",
// Stryker restore StringLiteral
    });
  }

  const calledRoutes = new Set(called.map((c) => c.route));
  for (const exception of exceptions) {
    if (!calledRoutes.has(exception.route)) {
      findings.push({
        kind: "stale-exception",
        route: exception.route,
// Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
        detail:
          `the frontend no longer calls ${exception.route}, so this exception covers nothing. Delete ` +
          "it — an exception left standing eventually covers a route it was never reasoned about.",
// Stryker restore StringLiteral
      });
      continue;
    }
    const call = called.find((c) => c.route === exception.route);
    // Stryker disable next-line ConditionalExpression: EQUIVALENT — the `calledRoutes` membership
    // test immediately above already returned for anything not in `called`, so the find always hits.
    if (call !== undefined && isServed(call, served)) {
      findings.push({
        kind: "stale-exception",
        route: exception.route,
// Stryker disable StringLiteral: human-facing remedy prose — see the note in `refuse` above.
        detail:
          `the desktop now SERVES ${exception.route}, so this exception is exempting a route that ` +
          "needs no exemption. Delete it, and let the route be covered.",
// Stryker restore StringLiteral
      });
    }
  }
  return findings;
}

/**
 * The routes the shared frontend can call that the desktop backend deliberately does NOT serve.
 *
 * ⚠ THIS LIST IS THE HOLE IF IT IS NOT KEPT HONEST, and two things hold it. Every entry carries a
 * REASON — an exception without one is indistinguishable from an oversight, and reads to a later
 * session as settled when it was only unexamined. And every entry is SELF-PRUNING: an exception for
 * a route the frontend no longer calls, or one the desktop has since started serving, is reported by
 * {@link findUnservedRoutes} as its own finding and must be deleted.
 *
 * ADDING AN ENTRY IS A DECISION, NOT A SILENCER. The question to answer is not "does this red annoy
 * me?" but "is the desktop CORRECT to answer 404 here, and would a member notice?". Every route
 * below is one the desktop was built without on purpose — hosted-only identity and admin surfaces,
 * DB control the desktop is not permitted to drive, and a review seam whose frontend was replaced.
 * A route whose absence leaves a mounted panel broken is a DEFECT and belongs in the desktop's route
 * table instead; that is what this whole check exists to say out loud.
 */
// Stryker disable StringLiteral: the `reason` prose is human-facing REVIEW material — a reviewer
// reads it to judge whether a divergence is legitimate, and no test can discriminate a sentence of
// it. What IS asserted is that every entry HAS a route-shaped `route` and a reason long enough to
// be an argument rather than a label (route-tables.test.ts), and that a stale entry reds.
export const DESKTOP_ROUTE_EXCEPTIONS: readonly RouteException[] = [
  {
    route: "/api/users",
    reason:
      "HOSTED-ONLY, by ADR-0043's members model. Membership is an IAP-authenticated admin surface on " +
      "Cloud Run; the desktop operator is a local MEMBER and never an admin (`LOCAL_ME` in " +
      "boot-read-routes.ts pins `role: 'member'`), so the studio's own `me.role === 'admin'` gates " +
      "hide the Members UI and a direct visit to #/members lands on MembersPanel's honest 'Admins " +
      "only' state rather than a broken panel. Mirroring this would be granting an authority the " +
      "desktop is deliberately not given.",
  },
  {
    route: "/api/db/status",
    reason:
      "DB CONTROL IS HOSTED-ONLY. `LOCAL_ME.canWakeDb` is false on the desktop, so the Start-DB " +
      "affordance never renders and this read has no caller here. The desktop sidecar holds a live " +
      "pool rather than driving the instance's lifecycle.",
  },
  {
    route: "/api/db/start",
    reason: "DB control is hosted-only — see /api/db/status.",
  },
  {
    route: "/api/db/wake",
    reason: "DB control is hosted-only — see /api/db/status.",
  },
  {
    route: "/api/suggestions",
    reason:
      "NO LIVE CALLER on either surface. `api.createSuggestion` is reached only from " +
      "`ReviewBlocks.tsx`, which nothing in the production tree imports — its live replacement " +
      "`ReviewEditor.tsx` (the one `AssetView` mounts) states in its own header that it dropped this " +
      "seam under ADR-0425 dec 1. So the desktop's 404 is unreachable, not broken. ⚠ THE HAZARD THIS " +
      "EXCEPTION CARRIES, stated rather than left implicit: it rests on the CALLER being dead, and " +
      "nothing here re-checks that. Re-mounting ReviewBlocks would make the route reachable again and " +
      "this exception would keep it silently uncovered — the check derives what the CLIENT can issue, " +
      "not what a mounted component reaches. The durable remedy is to delete the dead client methods " +
      "and their island, which retires the routes from the called set outright and needs no exception; " +
      "that is a separate unit (deleting UI code can force a story retirement) and is why this is an " +
      "exception today rather than an edit.",
  },
  {
    route: "/api/suggestions/decision",
    reason: "No live caller — `api.decideSuggestion`'s only reader is the unmounted ReviewBlocks island; see /api/suggestions.",
  },
  {
    route: "/api/review/feed",
    reason: "No live caller — `api.reviewFeed`'s only reader is the unmounted ReviewBlocks island; see /api/suggestions.",
  },
];
// Stryker restore StringLiteral
