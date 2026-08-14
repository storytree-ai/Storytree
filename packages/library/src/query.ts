/**
 * The ad-hoc corpus query — "how many rows of kind K satisfy predicate P" (`tool-signal-gaps-arc`,
 * from friction `no-verb-answers-an-ad-hoc-question-of-the-live-store`).
 *
 * `library artifact <id>` reads ONE artifact and `arc show` reads ONE arc, but the shape an ADR's
 * blast-radius section or a librarian curation pass routinely needs — a predicate over a whole kind
 * — had no CLI surface at all. Both filed occurrences hand-rolled a throwaway `tsx` script and paid
 * the same four connection traps before their first datum.
 *
 * This module is the PURE half: predicate parsing and evaluation over already-fetched documents.
 * It holds no connection and no `node:` import, so it is browser-safe and testable without a store
 * — the CLI supplies the rows from `Store.queryDocs({ kind })`, which is the only part that needs a
 * database. Keeping the two apart is what lets the predicate language be proved offline.
 */

/** The comparison a single `--where` clause applies. */
export type QueryOp = "eq" | "ne" | "contains" | "present" | "absent";

/** One parsed `--where` clause: a dotted field path, an operator, and (except for present/absent) a value. */
export interface QueryClause {
  /** Dot-separated path into the document, e.g. `outcome.pr` or `lifecycle`. */
  path: string;
  op: QueryOp;
  /** The right-hand side. Empty for `present`/`absent`, which take no value. */
  value: string;
}

export interface QueryClauseError {
  clause: string;
  reason: string;
}

/**
 * Parse one `--where` expression.
 *
 * The operator set is deliberately small and shell-safe — no quoting games, no expression grammar
 * to learn. Longest operator wins, so `!=` is never read as `=` with a stray `!`.
 *
 * - `field=value`   equals (exact, case-sensitive)
 * - `field!=value`  not equals
 * - `field~value`   contains (case-INsensitive substring — the one a prose search actually wants)
 * - `field?`        present and non-empty
 * - `field!?`       absent, null, empty string, or empty array
 */
export function parseQueryClause(expr: string): QueryClause | QueryClauseError {
  const trimmed = expr.trim();
  if (trimmed === "") return { clause: expr, reason: "empty clause" };

  if (trimmed.endsWith("!?")) {
    const path = trimmed.slice(0, -2).trim();
    if (path === "") return { clause: expr, reason: "no field name before `!?`" };
    return { path, op: "absent", value: "" };
  }
  if (trimmed.endsWith("?") && !trimmed.includes("=") && !trimmed.includes("~")) {
    const path = trimmed.slice(0, -1).trim();
    if (path === "") return { clause: expr, reason: "no field name before `?`" };
    return { path, op: "present", value: "" };
  }

  // The EARLIEST operator separates path from value, with a longer token winning a tie — so
  // `status!=accepted` reads `!=` at index 6 rather than `=` at 7, and `body~a=b` reads the `~` at 4
  // rather than the `=` at 6. Scanning in declaration order instead would split either one wrongly:
  // whichever operator happened to be listed first would claim a value that merely CONTAINS it.
  let best: { at: number; token: string; op: QueryOp } | undefined;
  for (const [token, op] of [
    ["!=", "ne"],
    ["=", "eq"],
    ["~", "contains"],
  ] as const) {
    const at = trimmed.indexOf(token);
    if (at <= 0) continue;
    if (best === undefined || at < best.at || (at === best.at && token.length > best.token.length)) {
      best = { at, token, op };
    }
  }
  if (best !== undefined) {
    const path = trimmed.slice(0, best.at).trim();
    if (path === "") return { clause: expr, reason: `no field name before \`${best.token}\`` };
    return { path, op: best.op, value: trimmed.slice(best.at + best.token.length) };
  }

  return {
    clause: expr,
    reason: "no operator — expected `field=value`, `field!=value`, `field~value`, `field?` or `field!?`",
  };
}

/** A parse result is an error when it carries a `reason` rather than an `op`. */
export function isClauseError(v: QueryClause | QueryClauseError): v is QueryClauseError {
  return "reason" in v;
}

/**
 * Read a dotted path out of a document.
 *
 * Arrays are traversed ELEMENT-WISE rather than by index: `cites.id` over a list of refs yields
 * every `id`, so `--where cites.id=story:cli` means "any cited ref is that story". Index access
 * would be the rarer need and the more surprising default — a predicate over a list almost always
 * means "any member", which is also how the `=`/`~` evaluation below reads a multi-valued result.
 */
export function readPath(doc: unknown, path: string): unknown[] {
  let frontier: unknown[] = [doc];
  for (const segment of path.split(".")) {
    const next: unknown[] = [];
    for (const node of frontier) {
      if (node === null || node === undefined) continue;
      if (Array.isArray(node)) {
        for (const item of node) {
          const v = readMember(item, segment);
          if (v !== undefined) next.push(v);
        }
        continue;
      }
      const v = readMember(node, segment);
      if (v !== undefined) next.push(v);
    }
    frontier = next;
    if (frontier.length === 0) return [];
  }
  // Flatten a terminal array so `--where cites=story:cli` matches any member.
  return frontier.flatMap((v) => (Array.isArray(v) ? (v as unknown[]) : [v]));
}

function readMember(node: unknown, segment: string): unknown {
  if (typeof node !== "object" || node === null) return undefined;
  return (node as Record<string, unknown>)[segment];
}

/** Render a leaf value for comparison and for display. Objects stringify, so a predicate never throws. */
export function renderValue(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "string") return v;
  if (typeof v === "number" || typeof v === "boolean") return String(v);
  return JSON.stringify(v);
}

/** Does one clause hold for one document? */
export function matchesClause(doc: unknown, clause: QueryClause): boolean {
  const found = readPath(doc, clause.path);
  const nonEmpty = found.filter((v) => renderValue(v) !== "");

  switch (clause.op) {
    case "present":
      return nonEmpty.length > 0;
    case "absent":
      return nonEmpty.length === 0;
    case "eq":
      return found.some((v) => renderValue(v) === clause.value);
    case "ne":
      // A missing field IS "not equal" — otherwise `--where lifecycle!=closed` would silently drop
      // every row that has no lifecycle at all, which is the opposite of what the caller asked.
      return !found.some((v) => renderValue(v) === clause.value);
    case "contains": {
      const needle = clause.value.toLowerCase();
      return found.some((v) => renderValue(v).toLowerCase().includes(needle));
    }
  }
}

/** Every clause must hold — clauses AND together. */
export function matchesAll(doc: unknown, clauses: readonly QueryClause[]): boolean {
  return clauses.every((c) => matchesClause(doc, c));
}
