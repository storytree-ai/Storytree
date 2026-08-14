/**
 * `storytree library query` — the ad-hoc predicate read of the corpus (`tool-signal-gaps-arc`, from
 * friction `no-verb-answers-an-ad-hoc-question-of-the-live-store`, filed 2026-08-08 and reinforced
 * 2026-08-12 by an independent branch).
 *
 * WHAT IT REPLACES. "How many rows of kind K satisfy predicate P" — the shape an ADR's blast-radius
 * section or a librarian curation pass routinely needs — had no CLI surface, so both filed
 * occurrences hand-rolled a throwaway `tsx` script and hit the same four traps before their first
 * datum: a scratchpad script cannot resolve `@storytree/*` workspace imports; `pnpm --filter <pkg>
 * exec tsx <path>` resolves the path relative to the PACKAGE, not the repo root; `createPool()`
 * returns a `PoolHandle {pool, connector}` while `closePool` takes `(pool, connector)` positionally;
 * and `createPool` refuses without `STORYTREE_DB_USER` unless the caller also calls
 * `loadLocalSecrets()`. All four now sit INSIDE the CLI's composition root, which is the same
 * promotion `pnpm db:probe` made for the connection probe.
 *
 * This module holds only the CLI-shaped half — flag validation, store call, rendering. The predicate
 * language itself is `@storytree/library`'s `query.js`, pure and proved without a store.
 */

import type { Store } from "@storytree/storage-protocol";
import {
  isClauseError,
  KIND_SPECS,
  matchesAll,
  parseQueryClause,
  readPath,
  renderValue,
  type QueryClause,
} from "@storytree/library";

import type { Envelope } from "@storytree/drive";

/** How many rows the default (unbounded) render will print before it truncates and says so. */
const DEFAULT_LIMIT = 50;

export interface QueryOptions {
  kind: string | undefined;
  where: readonly string[];
  /** `--field <path>` — print this value beside each id instead of the title. */
  field: string | undefined;
  /** `--count` — print the number ONLY, for the "how many" question this verb exists to answer. */
  count: boolean;
  /** `--limit <n>` — cap the printed rows. The COUNT line always reflects the full match set. */
  limit: string | undefined;
}

/**
 * Run the query and render an envelope.
 *
 * `--kind` is required: the store filters by kind server-side, and an unfiltered scan of the whole
 * corpus is both slow and almost never the question. The refusal LISTS the available kinds rather
 * than just naming the flag, so a caller who guessed the wrong kind is one read from the right one.
 */
export async function libraryQuery(store: Store, opts: QueryOptions): Promise<Envelope> {
  // TWO kind sets, and conflating them is the defect this verb exists to avoid. `populated` is what
  // the store currently holds; `declared` is what the SCHEMA allows. A kind that is declared but
  // empty is a legitimate query with the answer ZERO — reporting it as "unknown kind" tells the
  // caller they typed it wrong, which is a misdirected signal about stored state and this arc's own
  // fence. Measured on `open-question`: a real kind, zero rows, refused as a typo.
  const populated = [...new Set((await store.queryDocs()).map((d) => d.kind))].sort();
  const declared = new Set<string>(Object.keys(KIND_SPECS));
  const offer = [...new Set([...declared, ...populated])].sort();

  if (opts.kind === undefined) {
    return {
      ok: false,
      body: `library query needs --kind. available kinds: ${offer.join(", ")}.`,
      next: [`storytree library query --kind ${offer[0] ?? "<kind>"} --pg`],
    };
  }
  if (!declared.has(opts.kind) && !populated.includes(opts.kind)) {
    return {
      ok: false,
      body: `unknown kind "${opts.kind}". available kinds: ${offer.join(", ")}.`,
      next: [`storytree library query --kind ${offer[0] ?? "<kind>"} --pg`],
    };
  }

  // Parse EVERY clause before running any of them, and report all the bad ones at once — a caller
  // fixing a three-clause query should not have to re-run it three times to find all the typos.
  const clauses: QueryClause[] = [];
  const bad: string[] = [];
  for (const expr of opts.where) {
    const parsed = parseQueryClause(expr);
    if (isClauseError(parsed)) bad.push(`  --where ${parsed.clause}   ${parsed.reason}`);
    else clauses.push(parsed);
  }
  if (bad.length > 0) {
    return {
      ok: false,
      body: [
        `${bad.length} malformed --where clause${bad.length === 1 ? "" : "s"}:`,
        ...bad,
        "",
        "operators:  field=value (equals)  field!=value (not)  field~value (contains, any case)",
        "            field? (present, non-empty)  field!? (absent or empty)",
        "paths are dotted and walk arrays element-wise, e.g. --where outcome.pr=1234",
      ].join("\n"),
      next: [`storytree library query --kind ${opts.kind} --pg`],
    };
  }

  const limit = parseLimit(opts.limit);
  if (limit instanceof Error) {
    return { ok: false, body: limit.message, next: [`storytree library query --kind ${opts.kind} --pg`] };
  }

  const all = await store.queryDocs({ kind: opts.kind });
  const matched = all.filter((row) => matchesAll(row.doc, clauses));

  const predicate =
    clauses.length === 0 ? "" : ` matching ${opts.where.map((w) => `\`${w}\``).join(" AND ")}`;

  if (opts.count) {
    return {
      ok: true,
      body: `${matched.length}`,
      next: [`storytree library query --kind ${opts.kind} --pg   (drop --count for the rows)`],
    };
  }

  const shown = matched.slice(0, limit);
  const rows = shown.map((row) => {
    const detail =
      opts.field === undefined
        ? titleOf(row.doc)
        : readPath(row.doc, opts.field).map(renderValue).join(", ");
    return detail === "" ? `  ${row.id}` : `  ${row.id}   ${detail}`;
  });

  // A declared kind holding NO rows at all: say so, so a zero cannot be misread as a bad query. The
  // caller's next move differs — an empty TIER is a fact about the corpus, while zero MATCHES is a
  // fact about the predicate — and only the command knows which it just reported.
  const emptyTier =
    all.length === 0
      ? [``, `  (the ${opts.kind} tier is declared by the schema and currently holds no rows at all —`, `   this zero is the corpus, not the predicate.)`]
      : [];

  const header = `${matched.length} of ${all.length} ${opts.kind}${predicate}`;
  const truncated =
    matched.length > shown.length
      ? [``, `  … ${matched.length - shown.length} more (raise --limit, or --count for the number alone)`]
      : [];

  return {
    ok: true,
    body: [header, ...rows, ...emptyTier, ...truncated].join("\n"),
    next: [
      `storytree library artifact <id> --pg`,
      `storytree library query --kind ${opts.kind} --count --pg`,
    ],
  };
}

/** `storytree library query --help`. */
export function libraryQueryHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library query --kind <kind> [--where <clause>]… [--field <path>] [--count] [--limit <n>]",
      "",
      "  An ad-hoc predicate read of the corpus: kind + predicate in, matching rows out.",
      "  A READ — it needs no --pg to be current.",
      "",
      "operators",
      "  field=value    equals (exact, case-sensitive)",
      "  field!=value   not equals — a row MISSING the field counts as not-equal",
      "  field~value    contains (substring, any case)",
      "  field?         present and non-empty",
      "  field!?        absent, null, empty string, or empty array",
      "",
      "  Paths are dotted and walk arrays element-wise: --where cites.id=story:cli means",
      "  `any cited ref is that story`. Repeated --where clauses AND together.",
      "",
      "examples",
      "  storytree library query --kind arc --where lifecycle=active --count",
      "  storytree library query --kind increment --where anchor!? --where status=proposal",
      "  storytree library query --kind adr --where title~drift --field status",
    ].join("\n"),
    next: ["storytree library query --kind arc --where lifecycle=active"],
  };
}

function parseLimit(raw: string | undefined): number | Error {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    return new Error(`--limit expects a positive whole number, got "${raw}".`);
  }
  return n;
}

/** The human handle for a row: whatever short label the kind happens to carry. */
function titleOf(doc: unknown): string {
  if (typeof doc !== "object" || doc === null) return "";
  const d = doc as Record<string, unknown>;
  for (const key of ["title", "description", "outcome", "name"]) {
    const v = d[key];
    if (typeof v === "string" && v !== "") return v.split("\n")[0]!.slice(0, 100);
  }
  return "";
}
