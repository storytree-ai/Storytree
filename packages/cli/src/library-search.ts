/**
 * `storytree library search` and `storytree library related` — the CLI half of whole-corpus ranked
 * search and the unlinked-neighbour verb (`decision-read-measurement-arc` increment 16).
 *
 * WHY THESE EXIST. The owner directed the retirement of the `amends` edge and attached a condition:
 * *"we need to make sure theres a mechanism for models to search the corpus and find adrs that are
 * not linked to what they are currently looking at."* Every traversal this repo owns — `library tree
 * focus`, the depth walk, `adr list`'s back-edges, `loadBearingReach`'s closure — follows authored
 * edges, so all four are blind to the same set: the artifact that is about your subject and that
 * nobody connected. `related --unlinked` is the verb that sees it.
 *
 * THE SPLIT, which mirrors `library-query.ts` exactly. The ranking itself is
 * `@storytree/library`'s `search.ts` — pure, browser-safe, proved against a literal fixture with no
 * store. This module holds only the CLI-shaped half: flag validation, the store read, the adapter
 * from `StoredDoc` onto the ranker's structural view, and rendering. Keeping the two apart is what
 * lets BM25 be proved offline and what would let a future store-backed index replace the ranking
 * without touching a flag.
 *
 * BOTH ARE READS. Neither needs `--pg` to be current — a bare `storytree library …` already dials
 * the live store.
 */

import type { Store, StoredDoc } from "@storytree/storage-protocol";
import {
  adrDocId,
  buildSearchIndex,
  relatedArtifacts,
  searchCorpus,
  type DocRef,
  type LibrarySearchDoc,
  type RelatedHit,
  type SearchHit,
} from "@storytree/library";

import type { Envelope } from "@storytree/drive";

/** How many hits a bare invocation prints. */
const DEFAULT_LIMIT = 20;

/**
 * The fields that hold an outbound pointer AS A STRING, across every kind.
 *
 * Enumerated rather than discovered, and that is a deliberate floor: a field added later is INVISIBLE
 * here until somebody adds it, which under-reports links and therefore over-reports UNLINKED. That
 * is the safe direction to be wrong — a false "unlinked" costs a reader one redundant look, while a
 * false "linked" hides the very neighbour this verb exists to surface.
 */
const STRING_REF_FIELDS = ["dependsOn", "cites", "references"] as const;

/**
 * The decision-number fields on the `adr` kind, rendered into the pointer spelling everything else
 * uses so one resolver handles both.
 *
 * `supersedes` is included HERE and nowhere else in this arc, and the distinction is worth stating:
 * the depth walk excludes it because it is archaeology rather than support (`decision-amends-seam.ts`
 * has no `supersedesOf` by construction). This is not the depth walk. The question here is only "does
 * the corpus already connect these two artifacts?", and a supersession connects them as firmly as
 * anything can. Nothing is summed; the fields are reported by name.
 */
const NUMBER_REF_FIELDS = ["amends", "supersedes"] as const;

function stringField(doc: Record<string, unknown>, key: string): string | undefined {
  const v = doc[key];
  return typeof v === "string" && v !== "" ? v : undefined;
}

/** Collect every outbound pointer on one stored document, tagged with the field that authored it. */
function refsOf(doc: Record<string, unknown>): DocRef[] {
  const refs: DocRef[] = [];
  for (const field of STRING_REF_FIELDS) {
    const v = doc[field];
    if (!Array.isArray(v)) continue;
    for (const entry of v) if (typeof entry === "string" && entry !== "") refs.push({ field, ref: entry });
  }
  for (const field of NUMBER_REF_FIELDS) {
    const v = doc[field];
    if (!Array.isArray(v)) continue;
    for (const entry of v) {
      if (typeof entry === "number" && Number.isFinite(entry)) {
        refs.push({ field, ref: `asset:${adrDocId(entry)}` });
      }
    }
  }
  return refs;
}

/** Adapt one stored row onto the ranker's structural view. */
export function toSearchDoc(row: StoredDoc): LibrarySearchDoc {
  const doc = (typeof row.doc === "object" && row.doc !== null ? row.doc : {}) as Record<string, unknown>;
  return {
    id: row.id,
    kind: row.kind,
    title: stringField(doc, "title"),
    description: stringField(doc, "description"),
    body: stringField(doc, "body"),
    refs: refsOf(doc),
  };
}

function parseLimit(raw: string | undefined): number | Error {
  if (raw === undefined) return DEFAULT_LIMIT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) return new Error(`--limit must be a positive integer, got "${raw}"`);
  return n;
}

/** `  adr-0139   Consolidating the decision log   [adr]` plus its excerpt line. */
function renderHit(hit: SearchHit, mark = ""): string[] {
  const head = `  ${mark}${hit.id}   ${hit.title}   [${hit.kind}]`;
  return hit.excerpt === "" ? [head] : [head, `        ${hit.excerpt}`];
}

export interface SearchOptions {
  readonly kind: string | undefined;
  readonly limit: string | undefined;
}

/**
 * `storytree library search "<terms>" [--kind <k>] [--limit <n>]`.
 *
 * An empty result says so PLAINLY and prints its denominator. It never falls back to listing the
 * corpus — a ranker that did would be indistinguishable from a working one on every query a
 * reviewer would think to try.
 */
export async function librarySearch(store: Store, query: string | undefined, opts: SearchOptions): Promise<Envelope> {
  if (query === undefined || query.trim() === "") {
    return {
      ok: false,
      body: 'library search needs a query, e.g. storytree library search "amends annotation".',
      next: ['storytree library search "<terms>"'],
    };
  }
  const limit = parseLimit(opts.limit);
  if (limit instanceof Error) {
    return { ok: false, body: limit.message, next: [`storytree library search "${query}"`] };
  }

  const rows = await store.queryDocs();
  const docs = rows.map(toSearchDoc);
  const index = buildSearchIndex(docs);
  const result = searchCorpus(index, query, { kind: opts.kind, limit });

  const scope = opts.kind === undefined ? "artifacts" : `${opts.kind} artifacts`;
  if (result.terms.length === 0) {
    return {
      ok: true,
      body: [
        `no searchable terms in "${query}" — every word is a stop word or too short.`,
        `  (${result.scanned} ${scope} were available to rank.)`,
      ].join("\n"),
      next: ['storytree library search "<a more specific term>"'],
    };
  }
  if (result.matchCount === 0) {
    return {
      ok: true,
      body: [
        `0 of ${result.scanned} ${scope} match any of ${result.terms.map((t) => `\`${t}\``).join(" ")}.`,
        `  Nothing in the corpus uses these words. This is a real zero, not a narrowed view —`,
        `  every ${opts.kind === undefined ? "artifact" : opts.kind} was ranked.`,
      ].join("\n"),
      next: ['storytree library search "<other terms>"', "storytree library"],
    };
  }

  const shown = result.hits.flatMap((h) => renderHit(h));
  const truncated =
    result.matchCount > result.hits.length
      ? [``, `  … ${result.matchCount - result.hits.length} more (raise --limit)`]
      : [];
  return {
    ok: true,
    body: [
      `${result.matchCount} of ${result.scanned} ${scope} match at least one of ` +
        `${result.terms.map((t) => `\`${t}\``).join(" ")} — best first`,
      ...shown,
      ...truncated,
    ].join("\n"),
    next: [
      `storytree library artifact ${result.hits[0]?.id ?? "<id>"}`,
      `storytree library related ${result.hits[0]?.id ?? "<id>"} --unlinked`,
    ],
  };
}

export interface RelatedOptions {
  readonly kind: string | undefined;
  readonly limit: string | undefined;
  readonly unlinked: boolean;
}

/** `  adr-0271   …   [adr]  linked via amends → this` */
function renderRelated(hit: RelatedHit): string[] {
  const lines = renderHit(hit, hit.linked ? "" : "");
  const first = lines[0] ?? "";
  const head = hit.linked ? `${first}   ← linked via ${hit.linkVia.join(", ")}` : first;
  return [head, ...lines.slice(1)];
}

/**
 * `storytree library related <id> [--unlinked] [--kind <k>] [--limit <n>]`.
 *
 * THE VERB THE OWNER ASKED FOR. It ranks the whole corpus by textual similarity to one artifact and
 * says of each neighbour whether an edge already reaches it, in either direction. `--unlinked`
 * filters to the set no traversal can reach.
 *
 * The linked count always describes the FULL ranking, never the printed page, so it doubles as a
 * check on the link extraction: a count of zero on an artifact you know is well connected means the
 * pointer fields are being read wrongly, and that is visible without opening anything.
 */
export async function libraryRelated(
  store: Store,
  id: string | undefined,
  opts: RelatedOptions,
): Promise<Envelope> {
  if (id === undefined || id === "") {
    return {
      ok: false,
      body: "library related needs an artifact id, e.g. storytree library related adr-0139 --unlinked.",
      next: ["storytree library related <id> --unlinked"],
    };
  }
  const limit = parseLimit(opts.limit);
  if (limit instanceof Error) {
    return { ok: false, body: limit.message, next: [`storytree library related ${id}`] };
  }

  const rows = await store.queryDocs();
  const docs = rows.map(toSearchDoc);
  const source = docs.find((d) => d.id === id);
  if (source === undefined) {
    return {
      ok: false,
      body: `no artifact "${id}" in the corpus (${docs.length} read). ids are exact and case-sensitive.`,
      next: [`storytree library search "${id}"`, "storytree library"],
    };
  }

  const index = buildSearchIndex(docs);
  const result = relatedArtifacts(index, docs, id, {
    kind: opts.kind,
    limit,
    unlinkedOnly: opts.unlinked,
  });

  const header = [
    `${source.id} — ${source.title ?? source.id}   [${source.kind}]`,
    `ranked ${result.scanned} other artifacts${opts.kind === undefined ? "" : ` of kind ${opts.kind}`}` +
      ` against its ${result.terms.length} most distinctive terms.`,
    `terms: ${result.terms.join(", ")}`,
  ];

  if (result.hits.length === 0) {
    const why = opts.unlinked
      ? `every ranked neighbour is ALREADY linked (${result.linkedCount} of them), so nothing is missing here.`
      : `nothing in the corpus shares this artifact's distinctive vocabulary.`;
    return {
      ok: true,
      body: [...header, ``, why].join("\n"),
      next: [`storytree library related ${id}`, "storytree library"],
    };
  }

  const label = opts.unlinked
    ? `UNLINKED neighbours — no edge joins these to ${id} in either direction ` +
      `(${result.linkedCount} further neighbour${result.linkedCount === 1 ? " is" : "s are"} already linked and hidden):`
    : `neighbours, most similar first (${result.linkedCount} already linked):`;

  return {
    ok: true,
    body: [...header, ``, label, ...result.hits.flatMap(renderRelated)].join("\n"),
    next: [
      `storytree library artifact ${result.hits[0]?.id ?? "<id>"}`,
      opts.unlinked
        ? `storytree library related ${id}   (show the linked ones too)`
        : `storytree library related ${id} --unlinked   (only what nothing points at)`,
    ],
  };
}

/** `storytree library search --help`. */
export function librarySearchHelp(): Envelope {
  return {
    ok: true,
    body: [
      'storytree library search "<terms>" [--kind <kind>] [--limit <n>]',
      "",
      "  Ranked search across every artifact's title, description and body.",
      "  A READ — it needs no --pg to be current.",
      "",
      "  Ranking is BM25 with the title weighted heaviest. Hyphenated ids are searchable whole",
      "  (`adr-0139`, `session-orchestrator`) and by their parts.",
      "",
      "  A query that matches nothing says so and prints how many artifacts were ranked — an empty",
      "  answer is never a narrowed view.",
      "",
      "examples",
      '  storytree library search "amends annotation"',
      '  storytree library search "worktree provisioning" --kind adr --limit 5',
    ].join("\n"),
    next: ['storytree library search "amends annotation"'],
  };
}

/** `storytree library related --help`. */
export function libraryRelatedHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree library related <id> [--unlinked] [--kind <kind>] [--limit <n>]",
      "",
      "  What else in the corpus is about this — and whether anything already links the two.",
      "",
      "  Every other way of finding neighbours follows an authored edge, so all of them are blind to",
      "  the artifact that is about your subject and that nobody connected. --unlinked is that set.",
      "",
      "  The `already linked` count always describes the whole ranking, not the printed page.",
      "",
      "examples",
      "  storytree library related adr-0139 --unlinked",
      "  storytree library related merge-ceremony --kind adr --limit 10",
    ].join("\n"),
    next: ["storytree library related adr-0139 --unlinked"],
  };
}
