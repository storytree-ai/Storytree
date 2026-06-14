/**
 * Pure region-splice for the generated CLAUDE.md operating-discipline region (ADR-0051). Extracted
 * from build-claude-md.ts so the line-ending-robust comparison is unit-testable with no filesystem
 * and no store.
 *
 * The bug this guards against: the regenerated region is built with LF (`\n`), but a Windows
 * checkout carries CLAUDE.md as CRLF (core.autocrlf converts on checkout; `.gitattributes`
 * `eol=lf` only normalizes git's INDEX, not the working tree). A naive `next === md` then reported
 * the region STALE on every Windows gate run even when the content was byte-identical modulo the
 * line endings — `pnpm check:claude` (and `pnpm gate`) went spuriously RED on Windows while CI
 * (Linux/LF) stayed green. The fix: do all marker math and the in-sync comparison in LF space, and
 * re-apply the file's existing EOL on write — so the comparison is EOL-agnostic and a write never
 * leaves mixed endings.
 */

/** The outcome of splicing the agent region: a marker error, or the would-be file + whether it changed. */
export type ClaudeRegionResult =
  | { ok: false; error: string }
  | {
      ok: true;
      /** True when the on-disk region already matches the digest modulo EOL — no write, not stale. */
      inSync: boolean;
      /** The full file to write, with the source file's EOL re-applied (equals input when in sync). */
      next: string;
    };

/** LF-space view of a string (CRLF → LF), so all index math and comparison ignore line endings. */
const toLf = (s: string): string => s.replace(/\r\n/g, "\n");

/**
 * Splice the rendered `digest` into the `<!-- AGENT:<agent> START … -->` / `<!-- AGENT:<agent> END -->`
 * region of `rawMd`. The START marker line is preserved verbatim (it carries the rest of the comment).
 * Returns `inSync` (the region already matches, modulo EOL) and the EOL-preserving `next` to write.
 */
export function syncClaudeRegion(
  rawMd: string,
  agent: string,
  digest: string,
): ClaudeRegionResult {
  const START = `<!-- AGENT:${agent} START`; // the rest of the marker line is preserved verbatim
  const END = `<!-- AGENT:${agent} END -->`;

  const usesCrlf = /\r\n/.test(rawMd);
  const md = toLf(rawMd); // work in LF space — EOL-agnostic marker math + comparison

  const startIdx = md.indexOf(START);
  const endIdx = md.indexOf(END);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) {
    return {
      ok: false,
      error: `markers not found in CLAUDE.md — expected a "${START} … -->" line and "${END}".`,
    };
  }
  const startLineEnd = md.indexOf("\n", startIdx);
  const startMarkerLine = md.slice(startIdx, startLineEnd === -1 ? md.length : startLineEnd);
  const nextLf =
    md.slice(0, startIdx) +
    `${startMarkerLine}\n\n${digest}\n\n${END}` +
    md.slice(endIdx + END.length);

  const inSync = nextLf === md;
  // Re-apply the source file's EOL so a Windows (CRLF) checkout stays CRLF and we never write mixed
  // endings; on LF checkouts/CI this is a no-op.
  const next = usesCrlf ? nextLf.replace(/\n/g, "\r\n") : nextLf;
  return { ok: true, inSync, next };
}
