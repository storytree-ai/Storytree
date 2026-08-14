/**
 * Pure region-splice for the generated CLAUDE.md operating-discipline region (ADR-0051). Extracted
 * from build-claude-md.ts so the line-ending-robust comparison is unit-testable with no filesystem
 * and no store.
 *
 * The bug this guards against: the regenerated region is built with LF (`\n`), but a Windows
 * checkout carries CLAUDE.md as CRLF (core.autocrlf converts on checkout; `.gitattributes`
 * `eol=lf` only normalizes git's INDEX, not the working tree). A naive `next === md` then reported
 * the region STALE on every Windows gate run even when the content was byte-identical modulo the
 * line endings — today's `pnpm check:guidance` (`check:claude` compatibility alias) went spuriously
 * RED on Windows while CI
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

/** The fully-generated Codex root guidance view (ADR-0291). */
export function renderCodexGuidance(agent: string, digest: string): string {
  return [
    "<!-- GENERATED from the Library `agent` tier by `pnpm build:guidance` (ADR-0291) — do NOT hand-edit. -->",
    "# Storytree — agent onboarding",
    "",
    `This is Codex's root projection of the canonical Library \`${agent}\` agent.`,
    "Edit the Library artifact, then regenerate; this file is not an independent guidance source.",
    "",
    // Keep the canonical digest byte-for-byte shared with Claude (ADR-0291 D2). Codex does not get
    // CLAUDE.md's hand-authored repository tour, so its generated wrapper must supply the one local
    // invocation fact needed to execute the digest's harness-neutral `storytree …` commands.
    "When this guidance says `storytree …`, invoke it as `pnpm storytree …` from the repository root;",
    "this repository does not install a standalone `storytree` executable on PATH.",
    "",
    digest.trim(),
    "",
  ].join("\n");
}

export type GeneratedGuidanceResult = {
  /** True when a file exists and already matches the expected generated content modulo EOL. */
  inSync: boolean;
  /** The full generated file to write, preserving an existing file's EOL style. */
  next: string;
};

/** Compare a fully-generated guidance file modulo EOL and preserve its existing EOL on rewrite. */
export function syncGeneratedGuidance(
  rawMd: string | null,
  expected: string,
): GeneratedGuidanceResult {
  const expectedLf = toLf(expected).replace(/\n*$/, "\n");
  const inSync = rawMd !== null && toLf(rawMd) === expectedLf;
  const next = rawMd !== null && /\r\n/.test(rawMd)
    ? expectedLf.replace(/\n/g, "\r\n")
    : expectedLf;
  return { inSync, next };
}

/**
 * The generated region's current content, in LF space — or `null` when the markers are absent.
 *
 * Exists so two CHECKOUTS of CLAUDE.md can be compared on the generated region ALONE. A whole-file
 * compare answers a different question: this file is mostly a hand-authored repository tour, so a
 * branch that edited a paragraph of the tour would read as having moved the generated projection
 * when it did not (diagnosis-honesty-arc — the diagnosis has to be about the thing that drifted).
 */
export function regionOf(rawMd: string, agent: string): string | null {
  const md = toLf(rawMd);
  const startIdx = md.indexOf(`<!-- AGENT:${agent} START`);
  const endIdx = md.indexOf(`<!-- AGENT:${agent} END -->`);
  if (startIdx === -1 || endIdx === -1 || endIdx < startIdx) return null;
  const startLineEnd = md.indexOf("\n", startIdx);
  if (startLineEnd === -1 || startLineEnd > endIdx) return null;
  return md.slice(startLineEnd + 1, endIdx);
}

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
