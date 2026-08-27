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
  return LATTICE_CALL.test(stripComments(source).join("\n"));
}

/**
 * Blank out comment bodies line by line, preserving line COUNT and column-ish shape so line numbers
 * survive. Handles `//` and block comments, and does not treat a `//` inside a string literal as a
 * comment start — which matters here because the repo's own prose about this rule quotes the marker
 * syntax, and a scanner that read its own documentation as a marker would be the
 * `source-text-check-trips-on-its-own-rationale` fault.
 */
function stripComments(source: string): string[] {
  const lines = source.split(/\r?\n/);
  const out: string[] = [];
  let inBlock = false;
  for (const line of lines) {
    let result = "";
    let i = 0;
    let quote: string | undefined;
    while (i < line.length) {
      const two = line.slice(i, i + 2);
      if (inBlock) {
        if (two === "*/") {
          inBlock = false;
          i += 2;
        } else i += 1;
        continue;
      }
      const ch = line[i] as string;
      if (quote !== undefined) {
        result += ch;
        if (ch === "\\") {
          result += line[i + 1] ?? "";
          i += 2;
          continue;
        }
        if (ch === quote) quote = undefined;
        i += 1;
        continue;
      }
      if (ch === '"' || ch === "'" || ch === "`") {
        quote = ch;
        result += ch;
        i += 1;
        continue;
      }
      if (two === "//") break;
      if (two === "/*") {
        inBlock = true;
        i += 2;
        continue;
      }
      result += ch;
      i += 1;
    }
    out.push(result);
  }
  return out;
}

/** The comment text on a line, or `""`. Mirrors {@link stripComments}'s string handling. */
function commentOf(line: string): string {
  let i = 0;
  let quote: string | undefined;
  while (i < line.length) {
    const ch = line[i] as string;
    if (quote !== undefined) {
      if (ch === "\\") {
        i += 2;
        continue;
      }
      if (ch === quote) quote = undefined;
      i += 1;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      i += 1;
      continue;
    }
    if (line.slice(i, i + 2) === "//") return line.slice(i + 2);
    i += 1;
  }
  // A `*`-prefixed JSDoc/block-comment continuation carries a marker too — the repo writes plenty of
  // its explanation in block comments above the code.
  const starred = /^\s*\*(?!\/)(.*)$/.exec(line);
  return starred?.[1] ?? "";
}

/**
 * Read the balanced argument text of the `Math.hypot(` starting at `from` in `text`, or `undefined`
 * if the parentheses never close (a truncated or malformed file).
 */
function balancedArgs(text: string, from: number): string | undefined {
  let depth = 0;
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
function splitTopLevel(args: string): string[] {
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
function parseMarker(comment: string): { marker: SpaceMarker; reason: string } | undefined {
  for (const name of MARKER_NAMES) {
    // `screen-space` is a prefix of `screen-space-defect`, so anchor on the colon: the loop tries
    // the longest-lived name first only by accident of order, and an accident is not a rule.
    const re = new RegExp(`(?:^|\\s)${name}:(.*)$`);
    const m = re.exec(comment);
    if (m) return { marker: name, reason: (m[1] ?? "").trim() };
  }
  return undefined;
}

/**
 * Scan one file. Returns `undefined` when the file does not call the lattice verbs — the file is
 * out of this rung's scope, which is a different thing from being clean.
 */
export function scanGroundSpace(filePath: string, source: string): FileVerdict | undefined {
  if (!callsLattice(source)) return undefined;

  const rawLines = source.split(/\r?\n/);
  const code = stripComments(source);

  const markers: MarkerComment[] = [];
  rawLines.forEach((line, i) => {
    const parsed = parseMarker(commentOf(line));
    if (parsed) markers.push({ line: i + 1, marker: parsed.marker, reason: parsed.reason, claimed: false });
  });

  const sites: DistanceSite[] = [];
  const joined = code.join("\n");
  const offsets: number[] = [];
  {
    let acc = 0;
    for (const l of code) {
      offsets.push(acc);
      acc += l.length + 1;
    }
  }
  const lineOf = (offset: number): number => {
    let lo = 0;
    let hi = offsets.length - 1;
    while (lo < hi) {
      const mid = Math.ceil((lo + hi) / 2);
      if ((offsets[mid] as number) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo + 1;
  };

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

/** Bind the nearest marker at or above `line`, within the lookback, and mark it consumed. */
function claimMarker(markers: MarkerComment[], line: number): MarkerComment | undefined {
  for (let l = line; l >= line - MARKER_LOOKBACK_LINES; l--) {
    const found = markers.find((mk) => mk.line === l);
    if (found) {
      found.claimed = true;
      return found;
    }
  }
  return undefined;
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
