/**
 * The PURE half of `pnpm check:ground-space` — the ADR-0367 screen-space-distance guard
 * (`ground-space-truth-arc-inc-01`).
 *
 * ── THE FAULT CLASS THIS EXISTS FOR ────────────────────────────────────────────────────────────
 *
 * ADR-0367 D1 gave the land a declared camera, and a declared camera FORESHORTENS: a ground-plane
 * separation running away from the camera covers `sin 20° ≈ 0.342` of the screen it covered in plan
 * view. So any decision taken by measuring a distance between PROJECTED points — a proximity test, a
 * keep-out radius, a nearest-of argmin, a vertex-interning tolerance — silently changes its answer
 * the moment the camera exists, and changes it again on any future camera move. The camera EXPOSED
 * these defects; it did not cause them.
 *
 * The failure has ONE direction, which is what makes it hard to see: `groundGap >= hypot` always
 * holds, so a screen-space threshold OVER-enforces on the vertical axis. Nothing wrong is ever
 * ADMITTED — things are only ever starved out, and a count quietly drops. Measured instances:
 * decor conifers 17 → 11 on the public site, an island re-decomposing 50 → 52 cells, the studio's
 * own hero-tree tile disagreeing with its ground-space choice on 26.8% of islands.
 *
 * ── WHY A GUARD, AND WHY THIS ONE ──────────────────────────────────────────────────────────────
 *
 * The class has already been declared closed once and was not. PR #1356 fixed every instance inside
 * `packages/forest-world/src`; one survived it OUTSIDE that core, in the website's own hand-edited
 * surface, because that surface reaches the engine through a wholesale sync and was never swept. So
 * "we fixed them all" has been wrong here before, and prose is not what stops it happening again.
 *
 * THE RULE. In any non-test source file that CALLS the projecting lattice verbs — `hexCenter`,
 * `hexCorners`, `pixelToHex`, `hexPath`, the four functions that hand back screen coordinates — every
 * distance measured BETWEEN TWO POINTS must declare which space it is measured in:
 *
 *   `// ground-space: <why>`          the distance is a ground-plane distance (the points were
 *                                     unprojected first, or this whole computation runs plan-view)
 *   `// screen-space: <why>`          it is deliberately a screen quantity — pointer slop, painter
 *                                     order, a nameplate band, chrome measured in CSS pixels
 *   `// screen-space-defect: <ref> — <why>`
 *                                     a KNOWN, OPEN instance of the class, cited to the increment
 *                                     that will fix it. Accepted, and REPORTED, so the remaining
 *                                     work stays visible in the gate's own output rather than only
 *                                     in an arc nobody opened.
 *
 * WHY THE SCOPE IS "FILES THAT CALL THE LATTICE VERBS" rather than every file touching a point. The
 * bug is BORN where projected coordinates are minted; downstream consumers inherit whatever space
 * their caller handed them, and asking them to re-declare it would tax every honest routing and
 * layout module in the repo for no new information. `routing.ts` and `laneLayout.ts` are the
 * canonical honest cases: both measure isotropic distances, both are correct, and both are correct
 * BECAUSE of what their callers pass them — a fact neither file can state about itself.
 *
 * WHY A MARKER AND NOT A BAN. A ban is unenforceable (a ground distance is a `Math.hypot` too, taken
 * on unprojected points) and an automatic rewrite would be wrong (some of these genuinely ARE screen
 * quantities). What the class actually costs is that the question never gets ASKED. The marker makes
 * the answer explicit at the site, visible in review, and mechanically present — and it is the ask,
 * not the answer, that the four measured instances all skipped.
 *
 * ⚠ WHAT THIS DOES NOT PROVE, stated so nobody reads it as more than it is. A marker records a
 * CLAIM about which space a distance is measured in; it does not verify the claim. The verification
 * is behavioural and lives per surface, as camera-sweep invariance suites in the style of
 * `packages/forest-world/src/scatter-camera.test.ts` — "the same ground island places the same marks
 * at the same ground spots at every elevation". This rung's job is the half those suites cannot do:
 * they fence the surfaces someone thought of, and this fences the arrival of one nobody did.
 *
 * Pure: no I/O, no process, no clock. The runner supplies the files.
 */

/** Which space a site declares itself to be measured in. */
export type SpaceMarker = "ground-space" | "screen-space" | "screen-space-defect";

const MARKER_NAMES: readonly SpaceMarker[] = ["ground-space", "screen-space", "screen-space-defect"];

/**
 * The four lattice verbs that PROJECT — the functions that mint screen coordinates out of the
 * ground plane. A file that calls one of these is a file where the class can be born.
 *
 * `groundFlattening` / `projectGround` / `unprojectGround` are deliberately NOT here. A file
 * reaching for those is already reasoning about the projection explicitly, which is the behaviour
 * this rung is trying to produce, not the behaviour it is trying to catch.
 */
const LATTICE_CALL = /\b(?:hexCenter|hexCorners|pixelToHex|hexPath)\s*\(/;

/** How far above a site a marker comment may sit and still bind to it. */
export const MARKER_LOOKBACK_LINES = 3;

/** One point-to-point distance found in a lattice-calling file. */
export interface DistanceSite {
  /** 1-indexed line of the `Math.hypot(` token. */
  readonly line: number;
  /** The trimmed source line, for the report. */
  readonly text: string;
  /** The declared space, or `undefined` when the site carries no marker at all. */
  readonly marker: SpaceMarker | undefined;
  /** Everything after the marker's colon, trimmed. Empty when the author wrote no reason. */
  readonly reason: string;
}

/** A marker comment found in the file, and whether a site claimed it. */
interface MarkerComment {
  readonly line: number;
  readonly marker: SpaceMarker;
  readonly reason: string;
  claimed: boolean;
}

/** What one scanned file amounts to. */
export interface FileVerdict {
  readonly path: string;
  readonly sites: readonly DistanceSite[];
  /** Sites carrying no marker at all — the class's own signature. RED. */
  readonly unmarked: readonly DistanceSite[];
  /** Sites whose marker carries no reason (or, for a defect, no increment reference). RED. */
  readonly reasonless: readonly DistanceSite[];
  /** Known open instances, cited to an increment. Reported, never red. */
  readonly knownDefects: readonly DistanceSite[];
  /** Marker comments no site claimed — a marker that drifted off its subject. RED. */
  readonly orphanedMarkers: readonly { readonly line: number; readonly marker: SpaceMarker }[];
}

/** Does this file mint projected coordinates from the lattice? */
export function callsLattice(source: string): boolean {
  return LATTICE_CALL.test(codeOf(source));
}

/** The file's code half as one string — comments gone, quoted bodies blanked, line count intact. */
function codeOf(source: string): string {
  return splitSource(source)
    .map((l) => l.code)
    .join("\n");
}

/** One source line, split into the two things this rung reads it for. */
export interface SourceLine {
  /**
   * The line with every comment removed AND the body of every `'`/`"` string blanked to spaces —
   * what is left is code, and it is what the `Math.hypot(` search runs over.
   *
   * WHY THE STRING BODIES GO, for the mirror of the reason the comments do: this rule is DOCUMENTED
   * IN SOURCE — `check-ground-space.ts` prints `Math.hypot`-shaped prose in its own failure message —
   * and a scanner that reported its own explanation as an undeclared distance would fire on the file
   * that exists to explain it. That is `source-text-check-trips-on-its-own-rationale`, and a false
   * positive is worse here than a miss: it is what gets a rung excluded rather than answered.
   *
   * ⚠ BACKTICK TEMPLATES ARE DELIBERATELY KEPT VERBATIM, and the asymmetry is not an oversight. A
   * `${...}` inside a template is REAL CODE — `scene.ts` computes most of its SVG path geometry that
   * way — so blanking template bodies would hand this rung a blind spot in the single file the class
   * was born in. A quoted string cannot interpolate, so blanking one loses no coverage at all.
   *
   * Line COUNT is preserved across the whole file (one entry in, one out) because every line number
   * this rung reports comes from this array.
   */
  readonly code: string;
  /**
   * Every character of comment text on this line — `//` bodies and block-comment interiors alike,
   * with the delimiters removed. This is what a marker is parsed out of.
   */
  readonly comment: string;
}

/**
 * Split a whole file into {@link SourceLine}s, tracking block-comment state across line boundaries.
 *
 * ONE MACHINE, not two. This replaces a pair that scanned the same characters for opposite halves of
 * the same answer — one blanking comments to find code, one hunting comments and ignoring code, each
 * with its own copy of the quote and escape handling and a doc comment saying it "mirrors" the other.
 * Two implementations of one rule drift, and a marker the code half and the comment half disagreed
 * about would silently bind to nothing.
 *
 * Tracking the block state also DELETES a special case: the old comment scanner had no idea it was
 * inside a block comment at all, and recognised a JSDoc continuation by pattern-matching a leading
 * star, which is a guess about layout rather than a fact about the file. Here a line inside a block
 * comment IS comment, because the machine knows it is.
 *
 * Pure. Exported because it is this module's primitive: every line number, every site and every
 * marker is downstream of it, so it is the one place worth pinning character by character.
 */
export function splitSource(source: string): SourceLine[] {
  const out: SourceLine[] = [];
  let inBlock = false;
  for (const line of source.split(/\r?\n/)) {
    let code = "";
    let comment = "";
    let i = 0;
    let quote: string | undefined;
    // ⚠ THE CURSOR BELOW IS SUPPRESSED FOR TERMINATION ONLY, and the distinction is the whole point.
    //
    // `i` has to be driven by hand here: the machine needs a two-character lookahead (the comment
    // openers and the block closer) and an escape that consumes two characters at once, and neither
    // fits a `for…of` over the string. Every mutation that stops or reverses that cursor produces a loop that never ends —
    // Stryker records a Timeout, and `check:mutation-diff` declines to credit a hang to a named
    // test. It is right to: no assertion can be written about a program that does not return, so a
    // timeout says nothing at all about the strength of the tests, which is the only thing the rung
    // measures.
    //
    // What is NOT suppressed is anything this loop DOES. `ground-space.test.ts` §7 pins the output
    // of this function character by character — the blanking, the escape pairing, the quote kinds,
    // the block-comment interior, the line count — so a mutant that changes the answer instead of
    // hanging is caught there. Two neighbours that COULD have been written without a cursor were:
    // `lineAtOffset` and `claimMarker` are loop-free for exactly this reason.
    // Stryker disable next-line all: NON-TERMINATING — see above; behaviour is pinned by §7.
    while (i < line.length) {
      const two = line.slice(i, i + 2);
      const ch = line[i] as string;
      if (inBlock) {
        if (two === "*/") {
          inBlock = false;
          i += 2;
          continue;
        }
        comment += ch;
        // Stryker disable next-line all: NON-TERMINATING — see the cursor note above.
        i += 1;
        continue;
      }
      if (quote !== undefined) {
        // The delimiters stay so the shape is readable; a quoted BODY is blanked a space at a time.
        const keep = quote === "`" || ch === quote;
        if (ch === "\\") {
          code += keep ? ch : " ";
          code += keep ? (line[i + 1] ?? "") : " ";
          i += 2;
          continue;
        }
        code += keep ? ch : " ";
        if (ch === quote) quote = undefined;
        // Stryker disable next-line all: NON-TERMINATING — see the cursor note above.
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        code += ch;
        i += 1;
        continue;
      }
      if (two === "//") {
        comment += line.slice(i + 2);
        break;
      }
      if (two === "/*") {
        inBlock = true;
        i += 2;
        continue;
      }
      code += ch;
      // Stryker disable next-line all: NON-TERMINATING — see the cursor note above.
      i += 1;
    }
    out.push({ code, comment });
  }
  return out;
}

/**
 * Read the balanced argument text of the `Math.hypot(` starting at `from` in `text`, or `undefined`
 * if the parentheses never close (a truncated or malformed file).
 */
export function balancedArgs(text: string, from: number): string | undefined {
  let depth = 0;
  // Stryker disable next-line all: NON-TERMINATING or EQUIVALENT — `i--` never returns (a timeout
  // credits no test, see `splitSource`), and `i <= text.length` reads one index past the end, where
  // the character is `undefined` and matches neither paren, so the walk ends exactly as before. What
  // this scan DOES — nesting, the starting offset, the unclosed case, the empty list — is pinned in
  // `ground-space.test.ts` §8.
  for (let i = from; i < text.length; i++) {
    const ch = text[i];
    if (ch === "(") depth += 1;
    else if (ch === ")") {
      depth -= 1;
      if (depth === 0) return text.slice(from + 1, i);
    }
  }
  return undefined;
}

/**
 * Is this argument text a distance BETWEEN TWO POINTS on the land plane?
 *
 * Two accepted shapes, and one deliberate exclusion:
 *   · member form  — the arguments name both a `.x` and a `.y`
 *   · delta form   — exactly two identifier arguments ending in x/X and y/Y (`dx, dy`, `lx, ly`)
 *   · EXCLUDED     — anything naming a `.z` or a third identifier: that is a 3D vector length in the
 *                    r3f harness's own (x, z) ground space, which the land camera never touched.
 *
 * `Math.sqrt(3) * HEX_R` and `Math.sqrt(rand()) * spread` match neither, which is the point: a
 * matcher that flagged every square root would be noise, and noise is how a guard gets disabled.
 */
export function isPointDistance(args: string): boolean {
  if (/\.\s*z\b/.test(args)) return false;
  const parts = splitTopLevel(args);
  if (parts.length !== 2) return false;
  const hasX = /\.\s*x\b/.test(args);
  const hasY = /\.\s*y\b/.test(args);
  if (hasX && hasY) return true;
  const [a, b] = parts as [string, string];
  return /^[A-Za-z_$][\w$]*[xX]$/.test(a.trim()) && /^[A-Za-z_$][\w$]*[yY]$/.test(b.trim());
}

/** Split an argument list on top-level commas (parens/brackets/braces respected). */
export function splitTopLevel(args: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let cur = "";
  for (const ch of args) {
    if (ch === "(" || ch === "[" || ch === "{") depth += 1;
    else if (ch === ")" || ch === "]" || ch === "}") depth -= 1;
    if (ch === "," && depth === 0) {
      out.push(cur);
      cur = "";
      continue;
    }
    cur += ch;
  }
  if (cur.trim().length > 0) out.push(cur);
  return out;
}

/** Parse a marker out of one comment body, or `undefined`. */
export function parseMarker(comment: string): { marker: SpaceMarker; reason: string } | undefined {
  for (const name of MARKER_NAMES) {
    // `screen-space` is a prefix of `screen-space-defect`, so anchor on the colon: the loop tries
    // the longest-lived name first only by accident of order, and an accident is not a rule.
    const re = new RegExp(`(?:^|\\s)${name}:(.*)$`);
    const m = re.exec(comment);
    // Stryker disable next-line all: UNREACHABLE — group 1 is `(.*)`, which always participates in
    // a match, so `m[1]` is never undefined. The fallback is `noUncheckedIndexedAccess` again.
    if (m) return { marker: name, reason: (m[1] ?? "").trim() };
  }
  return undefined;
}

/**
 * The character offset each line starts at, in the `\n`-joined text. Exported with its reader below
 * because the pair is what turns a regex match position back into the line number a human is told to
 * go and look at, and a rung that names the WRONG line is worse than one that names none.
 */
export function lineStartOffsets(lines: readonly string[]): number[] {
  const offsets: number[] = [];
  let acc = 0;
  for (const l of lines) {
    offsets.push(acc);
    acc += l.length + 1;
  }
  return offsets;
}

/**
 * The 1-indexed line containing `offset` — the LAST line that starts at or before it.
 *
 * A linear scan, deliberately, where a binary search would do. It runs a handful of times per file
 * over a few hundred entries, so the difference is unmeasurable; what it buys is that the function
 * has no cursor to advance. Every mutation of a hand-written binary search's midpoint or bounds
 * fails to terminate, and a hang is the one defect no assertion can be written about — it is
 * detected by a timeout and credited to no test. Written this way, every way it can be broken is a
 * way a test can see.
 */
export function lineAtOffset(offsets: readonly number[], offset: number): number {
  let line = 1;
  for (const [i, start] of offsets.entries()) {
    if (start <= offset) line = i + 1;
  }
  return line;
}

/**
 * Scan one file. Returns `undefined` when the file does not call the lattice verbs — the file is
 * out of this rung's scope, which is a different thing from being clean.
 */
export function scanGroundSpace(filePath: string, source: string): FileVerdict | undefined {
  if (!callsLattice(source)) return undefined;

  const rawLines = source.split(/\r?\n/);
  const split = splitSource(source);

  const markers: MarkerComment[] = [];
  split.forEach((l, i) => {
    const parsed = parseMarker(l.comment);
    if (parsed) markers.push({ line: i + 1, marker: parsed.marker, reason: parsed.reason, claimed: false });
  });

  const sites: DistanceSite[] = [];
  const joined = split.map((l) => l.code).join("\n");
  const offsets = lineStartOffsets(split.map((l) => l.code));
  const lineOf = (offset: number): number => lineAtOffset(offsets, offset);

  const CALL = /Math\.hypot\s*\(/g;
  let m: RegExpExecArray | null;
  while ((m = CALL.exec(joined)) !== null) {
    const open = joined.indexOf("(", m.index);
    const args = balancedArgs(joined, open);
    if (args === undefined || !isPointDistance(args)) continue;
    const line = lineOf(m.index);
    const found = claimMarker(markers, line);
    sites.push({
      line,
      // Stryker disable next-line all: UNREACHABLE — `line` comes from `lineAtOffset` over this
      // file's own lines, so the index is always in range. The fallback exists because
      // `noUncheckedIndexedAccess` types the access as possibly-undefined, not because a file can
      // produce it, so no fixture can take this branch.
      text: (rawLines[line - 1] ?? "").trim(),
      marker: found?.marker,
      reason: found?.reason ?? "",
    });
  }

  const unmarked = sites.filter((s) => s.marker === undefined);
  const reasonless = sites.filter((s) => s.marker !== undefined && !hasReason(s));
  const knownDefects = sites.filter((s) => s.marker === "screen-space-defect" && hasReason(s));
  const orphanedMarkers = markers
    .filter((mk) => !mk.claimed)
    .map((mk) => ({ line: mk.line, marker: mk.marker }));

  return { path: filePath, sites, unmarked, reasonless, knownDefects, orphanedMarkers };
}

/**
 * A marker must say something. For a `screen-space-defect` that something must NAME the increment —
 * an unreferenced "known defect" is indistinguishable from a shrug, and this rung's whole value is
 * that the remaining work stays findable.
 */
function hasReason(site: DistanceSite): boolean {
  if (site.reason.length === 0) return false;
  if (site.marker !== "screen-space-defect") return true;
  return /[a-z0-9][a-z0-9-]{6,}/i.test(site.reason);
}

/**
 * Bind the NEAREST marker at or above `line`, within the lookback, and mark it consumed.
 *
 * `markers` is built in line order, so the last one still in range is the nearest one above — which
 * is the whole rule, expressed without a countdown whose direction could be reversed into a loop
 * that never ends (see {@link lineAtOffset} for the same reasoning).
 */
function claimMarker(markers: MarkerComment[], line: number): MarkerComment | undefined {
  const found = markers.filter((mk) => isWithinLookback(mk.line, line)).at(-1);
  if (found) found.claimed = true;
  return found;
}

/**
 * Does a marker written on `markerLine` bind to a distance on `siteLine`?
 *
 * AT OR ABOVE, within {@link MARKER_LOOKBACK_LINES}. A marker BELOW its subject never binds — a
 * comment after the line it describes reads as being about the NEXT one, and letting it bind
 * backwards would silently let one marker answer for two distances that mean different things.
 *
 * Named and exported rather than written inline in the filter above, because it is the rule: the
 * whole "how close does a marker have to be" question lives in this one expression, and a reader
 * checking it should not have to reconstruct it out of a predicate inside a fold.
 */
export function isWithinLookback(markerLine: number, siteLine: number): boolean {
  return markerLine <= siteLine && markerLine >= siteLine - MARKER_LOOKBACK_LINES;
}

/** The whole-run verdict. */
export interface GroundSpaceReport {
  readonly scanned: readonly FileVerdict[];
  readonly failures: readonly string[];
  readonly knownDefects: readonly string[];
  readonly siteCount: number;
}

/** Fold a set of scanned files into the report the runner prints. */
export function groundSpaceReport(files: readonly { path: string; source: string }[]): GroundSpaceReport {
  const scanned: FileVerdict[] = [];
  for (const f of files) {
    const v = scanGroundSpace(f.path, f.source);
    if (v) scanned.push(v);
  }
  const failures: string[] = [];
  const knownDefects: string[] = [];
  for (const v of scanned) {
    for (const s of v.unmarked) {
      failures.push(
        `${v.path}:${s.line} — a point-to-point distance with NO space marker\n` +
          `      ${s.text}`,
      );
    }
    for (const s of v.reasonless) {
      failures.push(
        `${v.path}:${s.line} — \`${s.marker}\` marker with no ${
          s.marker === "screen-space-defect" ? "increment reference" : "reason"
        }\n      ${s.text}`,
      );
    }
    for (const o of v.orphanedMarkers) {
      failures.push(
        `${v.path}:${o.line} — a \`${o.marker}\` marker no distance claims; it has drifted off its subject`,
      );
    }
    for (const s of v.knownDefects) {
      knownDefects.push(`${v.path}:${s.line} — ${s.reason}`);
    }
  }
  const siteCount = scanned.reduce((n, v) => n + v.sites.length, 0);
  return { scanned, failures, knownDefects, siteCount };
}
