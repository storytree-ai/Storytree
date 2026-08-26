/**
 * THE PURE JUDGE behind `check:hierarchy-camps` (ADR-0445 D1, `map-freshness-arc` inc-04) — does
 * every module that reads the work hierarchy say WHICH CLOCK it reads it on, and does it then read
 * the one it said?
 *
 * The gatherer/judge split `check-boundaries.ts` / `boundaries.ts`,
 * `check-ownership-totality.ts` / `ownership-totality.ts` and `check-hierarchy-drift.ts` /
 * `hierarchy-drift.ts` already use: every rule lives here and is exhaustively unit-testable against
 * literals, while the rung next door only walks the disk, reads the manifest, prints, and sets an
 * exit code.
 *
 * ## THE CONDITION THIS FENCES
 *
 * ADR-0445 D1 gave the work hierarchy two readers with different currencies, permanently: a story is
 * **disk-canonical for proving** and **live-canonical for rendering**. The decision's own
 * Consequences name the failure mode — *"a THIRD reader added later without asking which camp it is
 * in"* — and until this rung nothing mechanical asked.
 *
 * The question a new reader must answer is not "which is THE source": that question is malformed.
 * It is *which clock do I have to agree with?*
 *
 *  - **prove** — "I must agree with the commit under test." Reads `stories/**` off the checkout, so
 *    a proof taken on a branch describes that branch. CI validating a live tree would validate the
 *    wrong thing.
 *  - **render** — "I must agree with NOW." Reads the store's projection, so the map's QUESTION and
 *    its PROOF cannot sit at different commits — the exact skew ADR-0445 was written about.
 *  - **bridge** — "the gap between the two IS my subject." The loader that writes the checkout into
 *    the store, and the drift rung that compares them. It must read BOTH, which is what stops it
 *    being the label a reader reaches for to avoid answering.
 *
 * ## WHY THIS IS NOT THE PRESENCE CHECK ADR-0427 DELETED
 *
 * ADR-0427 deleted a rung that asked only whether a target's body MENTIONED its amender's number —
 * a string the renderer already printed, so the cheapest possible compliance satisfied it. This one
 * never consults a string the subject authors about itself. It computes, from the module's own code,
 * WHICH SOURCE THE MODULE ACTUALLY NAMES, and holds that computed fact against an independent
 * declaration in `repo-manifest.json`. Neither half can be satisfied by writing prose: to pass, a
 * module has to read the source it says it reads. That two-sided shape is `check:boundaries`'s, and
 * it is the reason this rung can go RED under mutation (see `hierarchy-camps.test.ts`, and the
 * increment's own mutation proof).
 *
 * ## THE MODULE THAT NAMES THE SOURCE IS THE ONE WITH A CAMP
 *
 * A module that is HANDED a folded hierarchy chose no clock, and giving it a camp would be inventing
 * an answer to a question it never faced. So the readers this judge enumerates are the modules that
 * NAME a source: they construct the checkout's `stories` directory, or they open the store's
 * projection. `apps/studio/server/hierarchySource.ts` deliberately appears in neither list — it is
 * the SEAM that picks between two callbacks and performs no read of its own; its callers name the
 * sources and carry the camps.
 *
 * That line is also what keeps the enumeration finite and honest. There are exactly two ways to
 * obtain the work hierarchy — it is on the disk or it is in the store — so the seed patterns below
 * are a closed set rather than a list that has to be chased.
 *
 * ## IT FAILS WIDE, AND A BLINDED SWEEP IS NEVER A PASS
 *
 * `parseSourceOwnershipMap`'s neighbour treats an unreadable manifest as a reason to STAND DOWN,
 * because a false refusal there blocks a session from claiming work it owns. The asymmetry here runs
 * the other way and deliberately so: this is a FENCE, and a fence that goes quiet when it cannot see
 * certifies exactly the thing it was added to catch. An unreadable manifest, an empty declaration
 * map and a sweep that walked no modules are all {@link VacuousCampSweep} — reported as a BLIND
 * CHECK, never as a verdict, in the `check:ownership-totality` posture.
 */

/**
 * Which clock a reader has to agree with.
 *
 * There are TWO clocks and there is no "either". `bridge` is not a third clock: it is the role of
 * MEASURING THE GAP between the two, and it is the only honest answer for the loader that writes the
 * checkout into the store and the drift rung that compares them. It is fenced rather than trusted —
 * a `bridge` must read BOTH sources, so a module reading only one cannot wear the label to dodge the
 * question.
 */
export type HierarchyCamp = "prove" | "render" | "bridge";

/** Where a module actually reads the hierarchy from — computed from its code, never declared. */
export type HierarchySource = "checkout" | "live";

/** One module the sweep read, as text. Pure input: this judge never touches the filesystem. */
export interface HierarchyModuleSource {
  /** Repo-relative, POSIX-separated. */
  readonly path: string;
  readonly text: string;
}

/** What one module's own code says about the source it reads. */
export interface HierarchyAccess {
  readonly path: string;
  /** Non-empty by construction — a module with no access is not an access. */
  readonly reads: readonly HierarchySource[];
  /** The fragments that classified it, so a reader can see WHY without re-deriving the rule. */
  readonly evidence: readonly string[];
  /** Value-imported binding names — the input to the cross-camp helper rule. */
  readonly imports: readonly string[];
  /** Names this module exports as values — what a helper-reaching importer would name. */
  readonly exports: readonly string[];
}

/** One `repo-manifest.json` → `hierarchyCamps.readers` entry. */
export interface HierarchyCampDeclaration {
  /** Repo-relative, POSIX-separated. EXACT paths only — this map is total in both directions. */
  readonly path: string;
  readonly camp: HierarchyCamp;
  /** The sources this module is declared to read. Held to the computed set, both ways. */
  readonly reads: readonly HierarchySource[];
  /**
   * Why a `render` reader touches the checkout at all. REQUIRED in that case and only that case:
   * ADR-0445 D2 permits the fallback and requires it to be STATED, and this is where it is stated.
   */
  readonly fallback?: string | undefined;
  /** Free prose. Never read by a rule — it is for the next author, not for this judge. */
  readonly because?: string | undefined;
}

export interface HierarchyCampMapRead {
  readonly readers: readonly HierarchyCampDeclaration[];
  /** Non-empty ⇒ the map did not read in full ⇒ BLIND CHECK, never a verdict. */
  readonly unread: readonly string[];
}

export type CampBreachKind =
  | "undeclared-reader"
  | "declared-file-is-absent"
  | "declared-file-reads-nothing"
  | "source-not-declared"
  | "declared-source-not-performed"
  | "live-read-in-the-prove-camp"
  | "bridge-that-spans-nothing"
  | "unstated-checkout-fallback"
  | "render-reaches-a-prove-reader";

export interface CampBreach {
  readonly kind: CampBreachKind;
  readonly path: string;
  /** One line, naming the camp question rather than pointing at a rule number. */
  readonly detail: string;
}

export interface HierarchyCampVerdict {
  readonly verdict: "ok" | "fail";
  readonly readers: number;
  readonly declarations: number;
  readonly proveReaders: number;
  readonly renderReaders: number;
  readonly bridgeReaders: number;
  readonly breaches: readonly CampBreach[];
}

export interface HierarchyCampInputs {
  /** Every module the sweep classified as naming a source. */
  readonly accesses: readonly HierarchyAccess[];
  readonly declarations: readonly HierarchyCampDeclaration[];
  /** How many modules the sweep WALKED — zero is a blinded sweep, not a clean repo. */
  readonly walked: number;
  /** Every module path the sweep saw, so a declaration can be told absent from merely silent. */
  readonly seen: ReadonlySet<string>;
}

/**
 * The sweep could not be consulted — distinct from "the sweep found nothing wrong".
 *
 * Thrown rather than returned so no call site can accidentally format it as a verdict; the shell
 * catches it and prints BLIND CHECK. Same posture, same reason, as {@link VacuousOwnershipSweep} in
 * `ownership-totality.ts`.
 */
export class VacuousCampSweep extends Error {}

// ── the two primitive ways to obtain the work hierarchy ──────────────────────
//
// A closed set, not a list to be chased: the hierarchy is either on the disk or in the store.

/**
 * The checkout's stories directory named as a PATH SEGMENT — `join(root, "stories")`,
 * `"stories/foo/story.md"`. The leading guard keeps `x.stories` and `obj["stories"]`-shaped
 * property access from classifying a module that is talking about something else entirely.
 */
const CHECKOUT_PATH_LITERAL = /(?<![\w.])["'`]stories(?:[/\\][^"'`]*)?["'`]/;

/**
 * ...or named by the identifier every walker in this repo uses for it. This is what catches the
 * PARAMETERISED walker — `loadWorkHierarchyIndex(storiesDir)` constructs no literal and would
 * otherwise be invisible — and the COMPOSITION ROOT that names the directory and hands it on.
 * `\b` after the suffix keeps `storiesDirty` (a git predicate, not a directory) out.
 */
const CHECKOUT_IDENTIFIER = /\bstories(?:Dir|Root|Path)\b/;

/**
 * ...and it must be able to REACH the checkout, which in this repo means importing a `node:`
 * builtin.
 *
 * Naming the tree is not reading it. `stories/**` appears as a write-scope glob, as a path inside an
 * error message, as a label in a browser component, as a doc-root name — and a module that cannot
 * touch a filesystem cannot be reading any of them. Two structural facts make this exact rather than
 * a heuristic: the pure judges here (this module included) import nothing at all, and the studio's
 * browser bundle is held to `@storytree/library`'s browser-safe barrel, so a `node:` import in it
 * would not build.
 *
 * It is also what stops this judge classifying ITSELF. The patterns above are the one place the
 * vocabulary is written down, so the module that defines them matches its own signals — and an
 * instrument that has to name-exempt itself is one nobody can trust about anything else. It is
 * excluded here by the same rule that excludes every other pure module, on its merits.
 *
 * The aperture that buys, stated rather than implied: a module naming the tree and reading it
 * through an INJECTED filesystem, with no `node:` import of its own, is invisible here. No such
 * module exists today (measured across 782 modules, 2026-08-26).
 */
const REACHES_THE_FILESYSTEM = /from\s*["']node:[a-z_/]+["']/;

/** The one door to the stored projection (ADR-0445 D1) — its class, and its table. */
const LIVE_STORE = /\bPgWorkHierarchyStore\b|\bwork_hierarchy\b/;

/**
 * Drop comments and regex literals; keep string literals intact.
 *
 * ## Why a character scanner and not a regex
 *
 * Deleting real code by mis-reading a `/*` inside a string would make this rung UNDER-detect, and
 * under-detection is the one direction a fence may not fail in — it would report a clean repo while
 * an undeclared reader sat in the file it mis-parsed. So this is a state machine that knows strings
 * from comments. The only thing it approximates is the regex-literal/division ambiguity, and it
 * resolves that by looking at the preceding significant character, which is exactly the position
 * where division is impossible.
 *
 * ## Why regex literals go with the comments
 *
 * A pattern is not a path. `/^stories\//` MATCHES paths; it reads nothing. Keeping them would also
 * make this judge classify ITSELF — the patterns below are the one place the vocabulary is written
 * down — and an instrument that has to name-exempt itself is one nobody can trust about anything
 * else. Dropping patterns excludes it on the same rule that excludes every other matcher, which is
 * a reason rather than an exception.
 */
export function stripCommentsAndPatterns(source: string): string {
  const out: string[] = [];
  let i = 0;
  let lastSignificant = "";
  while (i < source.length) {
    const ch = source[i] ?? "";
    const next = source[i + 1] ?? "";
    if (ch === "/" && next === "/") {
      while (i < source.length && source[i] !== "\n") i += 1;
      continue;
    }
    if (ch === "/" && next === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i += 1;
      i += 2;
      out.push(" ");
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") {
      const quote = ch;
      out.push(ch);
      i += 1;
      while (i < source.length) {
        const c = source[i] ?? "";
        out.push(c);
        i += 1;
        if (c === "\\") {
          out.push(source[i] ?? "");
          i += 1;
          continue;
        }
        if (c === quote) break;
      }
      lastSignificant = quote;
      continue;
    }
    if (ch === "/" && REGEX_PRECEDES.has(lastSignificant)) {
      i += 1;
      // A `/` inside a CHARACTER CLASS does not close the literal. Missing this is not cosmetic:
      // `/[/\\]/` would end here, the remainder would be scanned as code, and the first backtick in
      // it would open a template string that swallowed the next comment whole — which is exactly how
      // this judge came to classify itself on its own doc prose (caught 2026-08-26).
      let charClass = false;
      while (i < source.length) {
        const c = source[i] ?? "";
        i += 1;
        if (c === "\\") {
          i += 1;
          continue;
        }
        if (c === "[") charClass = true;
        else if (c === "]") charClass = false;
        else if (c === "\n") break;
        else if (c === "/" && !charClass) break;
      }
      out.push(" ");
      lastSignificant = "x";
      continue;
    }
    out.push(ch);
    if (ch.trim() !== "") lastSignificant = ch;
    i += 1;
  }
  return out.join("");
}

/** Characters after which a `/` opens a regex literal rather than dividing. */
const REGEX_PRECEDES: ReadonlySet<string> = new Set([
  "",
  "(",
  ",",
  "=",
  ":",
  "[",
  "!",
  "&",
  "|",
  "?",
  "{",
  "}",
  ";",
  "+",
  "-",
  "*",
  "%",
  "^",
  "<",
  ">",
  "~",
  "\n",
]);

/**
 * Re-export lines, removed before classification.
 *
 * A barrel that writes `export { PgWorkHierarchyStore } from "./pg-work-hierarchy-store.js"` obtains
 * nothing and chose no clock; it is a conduit. Classifying it would put an entry in the registry
 * that can never answer the camp question, which is how a total map starts filling with noise and
 * stops being read.
 */
const RE_EXPORT = /export\s*(?:\*(?:\s+as\s+[A-Za-z_$][\w$]*)?|\{[^}]*\})\s*from\s*["'][^"']+["']\s*;?/g;

/** Value-imported binding names — `import type` and inline `type` specifiers excluded. */
export function valueImportedNames(code: string): string[] {
  const names = new Set<string>();
  const statement = /import\s+(?!type[\s{])([^;]*?)\s+from\s*["'][^"']+["']/g;
  for (const match of code.matchAll(statement)) {
    const clause = match[1] ?? "";
    const braced = /\{([\s\S]*?)\}/.exec(clause);
    if (braced) {
      for (const part of (braced[1] ?? "").split(",")) {
        const trimmed = part.trim();
        if (trimmed === "" || trimmed.startsWith("type ")) continue;
        names.add((trimmed.split(/\s+as\s+/)[0] ?? "").trim());
      }
    }
    const bare = /^\s*([A-Za-z_$][\w$]*)\s*(?:,|$)/.exec(clause.replace(/\{[\s\S]*?\}/g, ""));
    if (bare?.[1] !== undefined) names.add(bare[1]);
  }
  // `const { a, b } = await import("...")` — the desktop backend reaches the orchestrator this way,
  // and a rule blind to it would let a render surface pick up a prove reader's walker unremarked.
  for (const match of code.matchAll(/\{([^}]*)\}\s*=\s*await\s+import\(/g)) {
    for (const part of (match[1] ?? "").split(",")) {
      const trimmed = part.trim();
      if (trimmed !== "") names.add((trimmed.split(/\s*:\s*/)[0] ?? "").trim());
    }
  }
  names.delete("");
  return [...names].sort();
}

/** Names a module exports as values — functions, classes and bindings. */
export function valueExportedNames(code: string): string[] {
  const names = new Set<string>();
  const declared = /export\s+(?:async\s+)?(?:function|class|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of code.matchAll(declared)) {
    if (match[1] !== undefined) names.add(match[1]);
  }
  return [...names].sort();
}

/**
 * Classify one module: which sources does its own code NAME?
 *
 * `null` when it names none — the common case, and the reason the registry stays the size of the
 * problem rather than the size of the repo.
 */
export function readHierarchyAccess(module: HierarchyModuleSource): HierarchyAccess | null {
  const code = stripCommentsAndPatterns(module.text);
  const classifiable = code.replace(RE_EXPORT, " ");
  const reads: HierarchySource[] = [];
  const evidence: string[] = [];

  const literal = REACHES_THE_FILESYSTEM.test(classifiable)
    ? CHECKOUT_PATH_LITERAL.exec(classifiable)
    : null;
  const identifier = CHECKOUT_IDENTIFIER.exec(classifiable);
  if (literal !== null || identifier !== null) {
    reads.push("checkout");
    if (literal !== null) evidence.push(`names the checkout's stories path: ${literal[0]}`);
    if (identifier !== null) evidence.push(`names the checkout's stories directory: ${identifier[0]}`);
  }

  const live = LIVE_STORE.exec(classifiable);
  if (live !== null) {
    reads.push("live");
    evidence.push(`opens the store's projection: ${live[0]}`);
  }

  if (reads.length === 0) return null;
  return {
    path: module.path,
    reads,
    evidence,
    imports: valueImportedNames(code),
    exports: valueExportedNames(code),
  };
}

const CAMPS: ReadonlySet<string> = new Set<HierarchyCamp>(["prove", "render", "bridge"]);
const SOURCES: ReadonlySet<string> = new Set<HierarchySource>(["checkout", "live"]);

/** Narrow a validated camp string. The set above is the gate; this only re-states it to the type. */
function readCamp(camp: string): HierarchyCamp {
  if (camp === "render") return "render";
  if (camp === "bridge") return "bridge";
  return "prove";
}

/**
 * The PURE half of the manifest read — the declared map out of manifest TEXT.
 *
 * Every refusal is worded as its own repair. A malformed entry is never dropped quietly: a dropped
 * entry reads downstream as an UNDECLARED reader, which sends the author to write a declaration that
 * is already there and merely mistyped.
 */
export function parseHierarchyCampMap(text: string, source: string): HierarchyCampMapRead {
  let manifest: Record<string, unknown>;
  try {
    manifest = JSON.parse(text) as Record<string, unknown>;
  } catch (err) {
    return { readers: [], unread: [`${source} is not valid JSON: ${String(err)}`] };
  }
  const block = manifest["hierarchyCamps"];
  if (block === undefined || block === null || typeof block !== "object") {
    return { readers: [], unread: [`${source} declares no \`hierarchyCamps\` block`] };
  }
  const rawReaders = (block as Record<string, unknown>)["readers"];
  if (rawReaders === undefined || rawReaders === null || typeof rawReaders !== "object") {
    return { readers: [], unread: [`${source} declares no \`hierarchyCamps.readers\` object`] };
  }

  const readers: HierarchyCampDeclaration[] = [];
  const unread: string[] = [];
  for (const [path, value] of Object.entries(rawReaders as Record<string, unknown>)) {
    if (path.startsWith("$")) continue;
    if (value === null || typeof value !== "object" || Array.isArray(value)) {
      unread.push(`${source}: \`${path}\` is not an object`);
      continue;
    }
    const entry = value as Record<string, unknown>;
    const camp = entry["camp"];
    if (typeof camp !== "string" || !CAMPS.has(camp)) {
      unread.push(
        `${source}: \`${path}\` declares camp ${JSON.stringify(camp)} — it must be "prove", "render" or "bridge"`,
      );
      continue;
    }
    const rawReads = entry["reads"];
    if (!Array.isArray(rawReads) || rawReads.length === 0) {
      unread.push(`${source}: \`${path}\` declares no \`reads\` — say which source it actually reads`);
      continue;
    }
    const bad = rawReads.find((r) => typeof r !== "string" || !SOURCES.has(r));
    if (bad !== undefined) {
      unread.push(`${source}: \`${path}\` declares read ${JSON.stringify(bad)} — it must be "checkout" or "live"`);
      continue;
    }
    const fallback = entry["fallback"];
    if (fallback !== undefined && typeof fallback !== "string") {
      unread.push(`${source}: \`${path}\` declares a non-string \`fallback\``);
      continue;
    }
    const because = entry["because"];
    readers.push({
      path,
      camp: readCamp(camp),
      reads: rawReads.filter((r): r is HierarchySource => r === "checkout" || r === "live"),
      fallback: typeof fallback === "string" ? fallback : undefined,
      because: typeof because === "string" ? because : undefined,
    });
  }
  return { readers, unread };
}

/**
 * Judge the camps.
 *
 * @throws {VacuousCampSweep} when an input makes the answer unknowable — a sweep that walked
 * nothing, or a declaration map with no entries. Both would otherwise present as a spotless repo.
 */
export function judgeHierarchyCamps(inputs: HierarchyCampInputs): HierarchyCampVerdict {
  if (inputs.walked === 0) {
    throw new VacuousCampSweep(
      "the module sweep walked ZERO files, so every reader would read as absent and this check would pass having examined nothing",
    );
  }
  if (inputs.declarations.length === 0) {
    throw new VacuousCampSweep(
      "the declared camp map is EMPTY, so every reader below would be reported undeclared and the real defect (an unreadable map) would be buried under them",
    );
  }

  const declared = new Map(inputs.declarations.map((d) => [d.path, d]));
  const accessOf = new Map(inputs.accesses.map((a) => [a.path, a]));
  const breaches: CampBreach[] = [];

  for (const access of inputs.accesses) {
    const decl = declared.get(access.path);
    if (decl === undefined) {
      breaches.push({
        kind: "undeclared-reader",
        path: access.path,
        detail:
          `reads the work hierarchy (${access.evidence.join("; ")}) and declares no camp. ` +
          `Which clock must it agree with — the commit under test (prove), or now (render)?`,
      });
      continue;
    }

    const computed = new Set(access.reads);
    const stated = new Set(decl.reads);

    if (decl.camp === "bridge" && !(computed.has("checkout") && computed.has("live"))) {
      breaches.push({
        kind: "bridge-that-spans-nothing",
        path: access.path,
        detail:
          `is declared \`bridge\` — the role reserved for a module whose SUBJECT is the gap between ` +
          `the two clocks — and reads only \`${access.reads.join(", ")}\`. A module that reads one ` +
          `source is in that source's camp; say which.`,
      });
    }

    if (decl.camp === "prove" && computed.has("live")) {
      breaches.push({
        kind: "live-read-in-the-prove-camp",
        path: access.path,
        detail:
          `is declared \`prove\` — it must agree with the commit under test — but it opens the LIVE ` +
          `store's projection. A proof taken against a tree the branch is not at proves the wrong tree.`,
      });
    }

    for (const source of computed) {
      if (stated.has(source)) continue;
      if (source === "live" && decl.camp === "prove") continue;
      breaches.push({
        kind: "source-not-declared",
        path: access.path,
        detail: `reads \`${source}\` but its declaration says it reads ${JSON.stringify(decl.reads)}.`,
      });
    }
    for (const source of stated) {
      if (computed.has(source)) continue;
      breaches.push({
        kind: "declared-source-not-performed",
        path: access.path,
        detail:
          `declares it reads \`${source}\`, and its code names no such read (found: ` +
          `${access.reads.join(", ")}). Either the reader moved camps without saying so, or the ` +
          `declaration is describing a read that has gone.`,
      });
    }

    if (decl.camp === "render" && computed.has("checkout") && (decl.fallback ?? "") === "") {
      breaches.push({
        kind: "unstated-checkout-fallback",
        path: access.path,
        detail:
          `is declared \`render\` — it must agree with NOW — and reads the CHECKOUT. ADR-0445 D2 ` +
          `permits that fallback and requires it to be STATED: add \`fallback\` saying why, or move ` +
          `the read onto the live projection.`,
      });
    }
  }

  const proveExports = new Map<string, string>();
  for (const decl of inputs.declarations) {
    if (decl.camp !== "prove") continue;
    const access = accessOf.get(decl.path);
    if (access === undefined) continue;
    for (const name of access.exports) proveExports.set(name, decl.path);
  }
  for (const decl of inputs.declarations) {
    if (decl.camp !== "render" || (decl.fallback ?? "") !== "") continue;
    const access = accessOf.get(decl.path);
    if (access === undefined) continue;
    for (const name of access.imports) {
      const from = proveExports.get(name);
      if (from === undefined || from === decl.path) continue;
      breaches.push({
        kind: "render-reaches-a-prove-reader",
        path: decl.path,
        detail:
          `is declared \`render\` with no stated fallback, and imports \`${name}\` from ${from}, ` +
          `which reads the CHECKOUT. Reaching the wrong clock through a helper is still reaching it.`,
      });
    }
  }

  for (const decl of inputs.declarations) {
    if (accessOf.has(decl.path)) continue;
    breaches.push(
      inputs.seen.has(decl.path)
        ? {
            kind: "declared-file-reads-nothing",
            path: decl.path,
            detail:
              `is declared a \`${decl.camp}\` reader and its code names no hierarchy source at all. ` +
              `Drop the entry — or, if it still reads one, the sweep can no longer see how, which is ` +
              `the more urgent of the two.`,
          }
        : {
            kind: "declared-file-is-absent",
            path: decl.path,
            detail: `is declared a \`${decl.camp}\` reader and no such file was swept. Drop the entry.`,
          },
    );
  }

  const camped = inputs.accesses.filter((a) => declared.has(a.path));
  return {
    verdict: breaches.length === 0 ? "ok" : "fail",
    readers: inputs.accesses.length,
    declarations: inputs.declarations.length,
    proveReaders: camped.filter((a) => declared.get(a.path)?.camp === "prove").length,
    renderReaders: camped.filter((a) => declared.get(a.path)?.camp === "render").length,
    bridgeReaders: camped.filter((a) => declared.get(a.path)?.camp === "bridge").length,
    breaches,
  };
}

const TAG = "[check:hierarchy-camps]";

/**
 * The camp question, in the words a reader has to answer it in.
 *
 * Stated at the head of every failure rather than a rule number, because the increment's whole point
 * is that "which is THE source" is malformed: a proof must agree with the commit it was taken at, and
 * a map must agree with now.
 */
const CAMP_QUESTION = [
  `${TAG} the work hierarchy has TWO readers with different currencies (ADR-0445 D1), and each one`,
  `${TAG} has to say WHICH CLOCK it must agree with. "Which is the source" is the wrong question.`,
  `${TAG}`,
  `${TAG}   prove   — "I must agree with the commit under test."  reads stories/** off the checkout`,
  `${TAG}   render  — "I must agree with NOW."                    reads the store's projection`,
  `${TAG}   bridge  — "the gap between them IS my subject."        reads BOTH, or it is not a bridge`,
  `${TAG}`,
  `${TAG} Declare it in repo-manifest.json → hierarchyCamps.readers, keyed by the module's path.`,
].join("\n");

export function formatHierarchyCamps(verdict: HierarchyCampVerdict): string {
  const counted =
    `${TAG} ${verdict.readers} module(s) read the work hierarchy — ` +
    `${verdict.proveReaders} prove, ${verdict.renderReaders} render, ${verdict.bridgeReaders} bridge, ` +
    `${verdict.declarations} declared.`;
  if (verdict.verdict === "ok") {
    return `${counted}\n${TAG} every reader declares a camp and reads the source it declares.`;
  }
  const lines = verdict.breaches.map((b) => `${TAG}   ${b.path}\n${TAG}     ${b.kind} — ${b.detail}`);
  return [
    counted,
    `${TAG} ${verdict.breaches.length} breach(es):`,
    ...lines,
    "",
    CAMP_QUESTION,
  ].join("\n");
}
