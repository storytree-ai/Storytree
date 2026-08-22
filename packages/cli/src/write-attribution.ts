// The ATTRIBUTION FENCE — every CLI store-write call site must stamp an actor that resolves through
// `defaultCliActor()` (`cli-write-fidelity-arc`, parked entry
// `cli-write-paths-carry-branch-attribution`).
//
// WHY THIS EXISTS. `cli-actor.ts` records WHO a live library write is recorded as, and every write
// verb is supposed to call `defaultCliActor()` so the event carries `cli@<branch>`. That convention
// lives in a helper a new write path is free not to call, and opting out is invisible: an
// unattributed write still succeeds, still typechecks, and still passes its own tests. It happened —
// `storytree proposal new --pg` shipped writing `actor: deps.actor ?? "cli"` while every sibling
// passed `defaultCliActor()`, and it was caught only by the luck of a count matching what the
// authoring session had written minutes earlier.
//
// AND THE SILENT OPT-OUT IS WIDER THAN A WRONG LITERAL: `actor` is OPTIONAL on all three `Store`
// write verbs (`storage-protocol/src/store.ts` — `input.actor ?? DEFAULT_ACTOR`), so a call site that
// simply never mentions `actor` is stamped by the store and reads back exactly like the bare `"cli"`.
// Both shapes are refused here.
//
// WHAT STILL DEPENDS ON IT. The parked entry's stated consumer was `check:corpus-content`, which
// ADR-0302 D4 has since DELETED — but the consequence did not go with it. `branchOfActor` is
// load-bearing TODAY in the friction foreign-overwrite guard (`friction.ts`, ADR-0298 / PR #1115):
// it refuses a `friction route` that would replace another adjudicator's `routeReason`, and it
// fail-closes on an actor it cannot attribute. So an unattributed write path does not merely
// mis-report — it makes a session unable to re-route its OWN item, while a peer's ~22,000-character
// justification record is exactly what the guard exists to protect.
//
// WHY A TEST AND NOT A `check:*` GATE RUNG. The parked entry (2026-08-03) asked for a rung "beside
// the existing `check:*` family and inside `pnpm gate`", and explicitly left the choice of
// instrument to the authoring session. ADR-0311 (2026-08-05) then decided the gate holds EXACTLY
// nine evidence-backed rungs and retired sixteen that policed bookkeeping without a production
// catch — a brand-new rung with a zero-drain ceiling and no post-introduction catch is precisely
// that category. So the fence lands as a unit test inside `pnpm -r test`, which IS a retained rung,
// costs no additional merge time, and runs in CI. This is the same call `gate-order.ts` makes about
// its own invariant, for the same reason. Nothing about the enforcement is weaker: a violation is a
// red `pnpm -r test`, and ADR-0304's affected-scope narrowing always runs `packages/cli` when a file
// this scan covers moves.
//
// SCOPE — `packages/cli/src/**` AND `packages/arc/src/**`, non-test. It was one root until
// `arc-tier-extraction-arc` moved the arc / increment / question verbs into `@storytree/arc`: those
// verbs still write to the live Library under the same `cli@<branch>` identity, so the fence follows
// the WRITE PATHS, not the package that happened to host them. See `FENCED_ROOTS` in the suite —
// a fence that stayed put would have gone green while covering strictly less.
//
// `packages/drive` writes under a deliberate non-branch identity (`CURATOR_ACTOR`, the in-build
// curator) and is out of scope on purpose rather than by omission: widening the fence there is a
// judgement about whose identity a build-time write carries, not this fence's business.
//
// Pure: no I/O. The caller supplies the file text.

/** The `Store` write verbs (`storage-protocol/src/store.ts`) — the three that stamp an `actor`. */
export const STORE_WRITE_METHODS: readonly string[] = ["upsertDoc", "deleteDoc", "appendEvent"];

/** The helper every CLI store write must resolve its actor through. */
export const ACTOR_HELPER = "defaultCliActor()";

/** How a call site supplies (or fails to supply) its actor. */
export type ActorShape =
  /** The actor expression resolves through {@link ACTOR_HELPER}, directly or via a local const. */
  | "attributed"
  /** An actor expression that does NOT resolve through the helper (a literal, a foreign identity). */
  | "unresolved"
  /** No `actor:` property at all — the store stamps its own `DEFAULT_ACTOR`. */
  | "absent"
  /**
   * The call forwards its arguments verbatim (`upsertDoc(input)`) rather than constructing them, so
   * it carries whatever its caller stamped and authors no attribution of its own.
   */
  | "forwarded";

/** One store-write call site found by {@link scanWriteAttribution}. */
export interface WriteSite {
  /** The file label the caller passed, verbatim (repo-relative by convention). */
  readonly file: string;
  /** 1-indexed line of the call's method name. */
  readonly line: number;
  /** The `Store` method called (`upsertDoc` / `deleteDoc` / `appendEvent`). */
  readonly method: string;
  /** The `actor:` value expression, trimmed — `null` when the call supplies none. */
  readonly actor: string | null;
  readonly shape: ActorShape;
}

/**
 * A site that is neither `attributed` nor covered by a {@link DeclaredException} — the fence's red.
 */
export interface AttributionViolation extends WriteSite {
  /** One line: what is wrong and what to write instead. */
  readonly why: string;
}

/**
 * A site allowed to opt out, declared with its reason.
 *
 * DECLARED DATA, not a pattern. A path-shaped or regex-shaped exclusion would silently grow to cover
 * the next offender; a named pair has to be edited deliberately, and {@link scanWriteAttribution}
 * reports the ones that matched nothing so a stale entry prunes itself (the same self-pruning
 * property the boundary judge's grandfather register has).
 */
export interface DeclaredException {
  /** Repo-relative file, matched exactly against {@link WriteSite.file}. */
  readonly file: string;
  /**
   * The actor expression this exception covers, VERBATIM as the source writes it — or `""` to cover
   * that file's `forwarded` adapter calls, which construct nothing and stamp nothing.
   */
  readonly actor: string;
  /** WHY this site is not a defect. */
  readonly reason: string;
}

/**
 * The complete set of CLI store-write sites that do not resolve through {@link ACTOR_HELPER}.
 *
 * Two entries, both deliberate, and neither is a fidelity hole:
 *  - the operator's own signature on a UAT attestation, which is the whole point of that event;
 *  - `main.ts`'s lazy store adapter, which forwards its caller's already-stamped input.
 */
export const DECLARED_EXCEPTIONS: readonly DeclaredException[] = [
  {
    file: "packages/cli/src/uat.ts",
    actor: "signer",
    reason:
      "an operator-attested signing event records the SIGNER's identity (ADR-0070 stage 2) — the " +
      "human who looked, not the branch that ran the command. Branch-stamping it would erase the " +
      "one fact the attestation exists to carry.",
  },
  {
    file: "packages/cli/src/main.ts",
    actor: "",
    reason:
      "the lazy `--pg` store adapter forwards each write verb's arguments verbatim to the opened " +
      "store, so it authors no attribution — the verb that built the input already stamped it.",
  },
  {
    file: "packages/arc/src/decision.test-helpers.ts",
    actor: "actor",
    reason:
      "a TEST FIXTURE, seeding two decision rows into an in-memory store for four suites. It is " +
      "DECLARED rather than excluded by filename suffix, deliberately: widening the scan's " +
      "`.test.ts` exclusion to cover `.test-helpers.ts` would make every future file with that " +
      "suffix invisible to the fence, which is the silent-shrink failure this table's own header " +
      "warns about. Named here, the site stays visible and the carve-out has a reason attached.",
  },
];

/** The result of scanning one or more files. */
export interface AttributionScan {
  /** Every store-write call site found, in file then source order. */
  readonly sites: readonly WriteSite[];
  /** The sites that must be fixed. Empty is the fence's green. */
  readonly violations: readonly AttributionViolation[];
  /**
   * Declared exceptions that matched no site in the scanned files — a stale entry, which is a defect
   * of its own: it reads as a live carve-out for a call site that no longer exists.
   */
  readonly unmatchedExceptions: readonly DeclaredException[];
}

/**
 * Replace every comment's characters with spaces, preserving offsets and line breaks.
 *
 * Load-bearing rather than tidy: this module's own header names `upsertDoc` several times, and a
 * scanner that read prose as code would report a violation in every file that documents the
 * convention it enforces. Strings and template literals are tracked so a `"//"` inside one is not
 * mistaken for a comment.
 */
export function stripComments(source: string): string {
  const out = [...source];
  let i = 0;
  const n = source.length;
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k += 1) if (out[k] !== "\n") out[k] = " ";
  };
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (c === "/" && next === "/") {
      let j = i + 2;
      while (j < n && source[j] !== "\n") j += 1;
      blank(i, j);
      i = j;
    } else if (c === "/" && next === "*") {
      let j = i + 2;
      while (j < n && !(source[j] === "*" && source[j + 1] === "/")) j += 1;
      blank(i, Math.min(j + 2, n));
      i = j + 2;
    } else if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < n) {
        if (source[j] === "\\") {
          j += 2;
          continue;
        }
        if (source[j] === c) break;
        j += 1;
      }
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return out.join("");
}

/** From the `(` at `open`, the index just past its matching `)` — string- and nesting-aware. */
function matchingParen(src: string, open: number): number {
  let depth = 0;
  let i = open;
  while (i < src.length) {
    const c = src[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < src.length) {
        if (src[j] === "\\") {
          j += 2;
          continue;
        }
        if (src[j] === c) break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      depth -= 1;
      if (depth === 0) return i + 1;
    }
    i += 1;
  }
  return src.length;
}

/**
 * The `actor:` value expression inside a call's argument text, or `null` when it declares none.
 *
 * Reads the value up to the next `,` or `}` at the depth the property was opened at, so a nested
 * object or a `?:` chain survives intact. Deliberately finds the property ANYWHERE in the argument
 * text rather than only at the top level: a conditional spread that buries `actor` one level down
 * (`...(x !== undefined ? { actor: x } : {})`) is still an attribution decision, and reading it is
 * how it gets judged rather than skipped.
 *
 * The SHORTHAND form (`{ id, kind, doc, actor }`) reads as the expression `actor` — that is the
 * friction route guard's own shape, and treating it as "declares no actor" would report the one
 * write path that stamps the same actor it just compared against.
 */
export function actorExpression(argsText: string): string | null {
  const at = /(?:^|[\s,{(])actor\s*(:|,|\}|$)/.exec(argsText);
  if (at === null) return null;
  if (at[1] !== ":") return "actor";
  const start = at.index + at[0].length;
  let depth = 0;
  let i = start;
  while (i < argsText.length) {
    const c = argsText[i];
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < argsText.length) {
        if (argsText[j] === "\\") {
          j += 2;
          continue;
        }
        if (argsText[j] === c) break;
        j += 1;
      }
      i = j + 1;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") depth += 1;
    else if (c === ")" || c === "]" || c === "}") {
      if (depth === 0) break;
      depth -= 1;
    } else if (c === "," && depth === 0) break;
    i += 1;
  }
  // Whitespace-normalised so a formatter's line break inside the expression cannot change what a
  // DeclaredException has to be written as.
  return argsText.slice(start, i).trim().replace(/\s+/g, " ");
}

/** A bare identifier — the only actor expression worth chasing to a local declaration. */
const BARE_IDENTIFIER = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

/**
 * Does `expression` resolve through {@link ACTOR_HELPER} in this file?
 *
 * Direct when the expression names the helper itself (`deps.actor ?? defaultCliActor()`), and one
 * hop further for a bare identifier bound to it by a `const` in the same file — which is how the
 * friction route guard stamps the SAME actor it compared against.
 */
export function resolvesToHelper(expression: string, strippedSource: string): boolean {
  if (expression.includes(ACTOR_HELPER)) return true;
  if (!BARE_IDENTIFIER.test(expression)) return false;
  const decl = new RegExp(`\\b(?:const|let|var)\\s+${expression}\\s*(?::[^=]+)?=([^;]*);`).exec(
    strippedSource,
  );
  return decl?.[1]?.includes(ACTOR_HELPER) === true;
}

/** True when every argument is a bare reference — a forwarding adapter, not an authoring site. */
function isForwarding(argsText: string): boolean {
  const inner = argsText.trim();
  if (inner === "") return false;
  return inner.split(",").every((a) => /^[A-Za-z_$][A-Za-z0-9_$.?]*$/.test(a.trim()));
}

/** One file's worth of {@link WriteSite}s, unjudged. */
export function findWriteSites(file: string, source: string): WriteSite[] {
  const stripped = stripComments(source);
  const sites: WriteSite[] = [];
  const call = new RegExp(`\\.(${STORE_WRITE_METHODS.join("|")})\\s*\\(`, "g");
  for (const m of stripped.matchAll(call)) {
    const method = m[1];
    if (method === undefined) continue;
    const open = m.index + m[0].length - 1;
    const argsText = stripped.slice(open + 1, matchingParen(stripped, open) - 1);
    const line = stripped.slice(0, m.index).split("\n").length;
    // `stripComments` blanks only comments — string and template bodies survive verbatim — so the
    // expression read here is the one the author wrote, minus any comment sitting inside it.
    const actor = actorExpression(argsText);
    const shape: ActorShape =
      actor !== null
        ? resolvesToHelper(actor, stripped)
          ? "attributed"
          : "unresolved"
        : isForwarding(argsText)
          ? "forwarded"
          : "absent";
    sites.push({ file, line, method, actor, shape });
  }
  return sites;
}

/** Does `exception` cover `site`? */
function covers(exception: DeclaredException, site: WriteSite): boolean {
  if (exception.file !== site.file) return false;
  if (exception.actor === "") return site.shape === "forwarded";
  return site.actor === exception.actor;
}

/**
 * Scan CLI sources for store-write call sites and judge each one's attribution.
 *
 * `files` is `{ file, source }` pairs — the caller reads the disk, so this stays pure and its unit
 * tests never touch the filesystem.
 */
export function scanWriteAttribution(
  files: readonly { readonly file: string; readonly source: string }[],
  exceptions: readonly DeclaredException[] = DECLARED_EXCEPTIONS,
): AttributionScan {
  const sites = files.flatMap((f) => findWriteSites(f.file, f.source));
  const violations: AttributionViolation[] = [];
  for (const site of sites) {
    if (site.shape === "attributed") continue;
    if (exceptions.some((e) => covers(e, site))) continue;
    violations.push({ ...site, why: whyViolation(site) });
  }
  const unmatchedExceptions = exceptions.filter((e) => !sites.some((s) => covers(e, s)));
  return { sites, violations, unmatchedExceptions };
}

function whyViolation(site: WriteSite): string {
  if (site.shape === "absent") {
    return (
      `${site.method} declares no \`actor:\` — \`actor\` is OPTIONAL on the Store port, so this write ` +
      `is stamped with the store's DEFAULT_ACTOR and reads back as UNATTRIBUTED. Add ` +
      `\`actor: deps.actor ?? ${ACTOR_HELPER}\`.`
    );
  }
  if (site.shape === "forwarded") {
    return (
      `${site.method} forwards its arguments rather than stamping an actor. That is legitimate only ` +
      `for an adapter — declare it in DECLARED_EXCEPTIONS with its reason, or stamp ` +
      `\`actor: deps.actor ?? ${ACTOR_HELPER}\`.`
    );
  }
  return (
    `${site.method} stamps \`actor: ${site.actor}\`, which does not resolve through ${ACTOR_HELPER} — ` +
    `the write records the tool, not the branch, so \`branchOfActor\` reads it as UNATTRIBUTED and ` +
    `the friction route guard can no longer tell this session's own adjudication from a peer's. ` +
    `Write \`actor: deps.actor ?? ${ACTOR_HELPER}\`, or declare the site in DECLARED_EXCEPTIONS.`
  );
}

/** Render a scan's reds as the body of a failure message — one line per site, path:line first. */
export function formatViolations(violations: readonly AttributionViolation[]): string {
  return violations.map((v) => `${v.file}:${v.line} — ${v.why}`).join("\n\n");
}
