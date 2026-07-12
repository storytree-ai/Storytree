// A pure, tolerant flat-scan of an ADR's leading YAML frontmatter block that surfaces two studio-wire
// signals: the `load_bearing` boolean, and the deduped UNION of outbound decision-lineage edges (ADR
// NUMBERS ONLY) drawn from `supersedes` / `supersedes_in_part` / `amends`. Mirrors the `parseDocStatus`
// idiom in apiRouter.ts — dependency-free (no yaml parser, no zod), NEVER throws, and returns the safe
// empty result on anything it doesn't recognise. The ADR frontmatter is CI-validated (`adr-health`), so
// a flat line scan is sufficient here too.
//
// This is INVISIBLE PLUMBING (library-adr-wire-signals): the number→doc-id resolution and the fold into
// DocMeta are later, separate work — this module reads only its two arguments and returns numbers.

const ADR_FILENAME = /^\d{4}-.*\.md$/;

const EMPTY_RESULT: { loadBearing: boolean; edges: number[] } = { loadBearing: false, edges: [] };

function emptyResult(): { loadBearing: boolean; edges: number[] } {
  return { loadBearing: EMPTY_RESULT.loadBearing, edges: [] };
}

/** Pull the ADR numbers out of a `field: [n, m, ...]` frontmatter array line; `[]` if absent/empty. */
function extractNumbers(block: string, field: string): number[] {
  const re = new RegExp(`^${field}:[ \\t]*\\[([^\\]]*)\\]`, 'm');
  const match = block.match(re);
  const list = match?.[1];
  if (!list) return [];
  return list
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n));
}

/**
 * The studio-wire ADR signals (library-adr-wire-signals): `loadBearing` reads the frontmatter's
 * `load_bearing: true` tag (missing tag or an explicit `false` both read as `false`); `edges` is the
 * deduped UNION of the ADR NUMBERS listed in `supersedes` / `supersedes_in_part` / `amends` (no `doc:`
 * prefix, no slug — number→id resolution is later glue). TOLERANT: a non-ADR filename, a missing or
 * unterminated frontmatter block, or absent fields all yield `{ loadBearing: false, edges: [] }` and
 * this function never throws.
 */
export function parseAdrWireSignals(filename: string, raw: string): { loadBearing: boolean; edges: number[] } {
  if (!ADR_FILENAME.test(filename)) return emptyResult();
  if (!raw.startsWith('---\n')) return emptyResult();
  const end = raw.indexOf('\n---', 4);
  if (end === -1) return emptyResult();
  const block = raw.slice(4, end);

  const loadBearingMatch = block.match(/^load_bearing:[ \t]*["']?(true|false)["']?[ \t]*$/m);
  const loadBearing = loadBearingMatch?.[1] === 'true';

  const edgeSet = new Set<number>();
  for (const field of ['supersedes', 'supersedes_in_part', 'amends']) {
    for (const n of extractNumbers(block, field)) edgeSet.add(n);
  }

  return { loadBearing, edges: [...edgeSet] };
}
