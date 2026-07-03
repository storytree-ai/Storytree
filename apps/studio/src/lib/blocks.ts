/**
 * The block model (ADR-0140): one deterministic split of a topic's markdown into
 * top-level blocks, shared by BOTH sides of the review surface —
 *
 *  • the client mount renders per-block comment threads / suggestion views keyed
 *    by `id` (the stable block handle comment + suggestion anchors carry), and
 *  • the server's suggestion accept-apply locates the target block in the CURRENT
 *    asset body by the same `id` and splices `[start, end)` with the proposed text
 *    (apps/studio/server — imported the way server code already imports ../src/types).
 *
 * The handle is a content hash (FNV-1a over the normalized block text), not a
 * position: it survives blocks moving or new blocks appearing around it, and an
 * EDITED block deliberately gets a new handle — an anchor to the old handle is
 * honest drift (the block it pointed at no longer exists), which the accept-apply
 * refuses rather than splicing the wrong prose. Identical blocks disambiguate by
 * occurrence index (`-2`, `-3`, …), so ids are unique within a doc.
 *
 * Splitting is blank-line paragraph splitting, fence-aware: a ``` / ~~~ fenced code
 * block is ONE block regardless of blank lines inside it. Deterministic — a pure
 * function of the text, no randomness, no wall-clock.
 */

export interface DocBlock {
  /** Stable content-derived handle — the `blockId` anchors carry. */
  id: string;
  /** The block's source text (without the surrounding blank lines). */
  text: string;
  /** Character offset of the block's first character in the source. */
  start: number;
  /** Character offset just past the block's last character (splice as [start, end)). */
  end: number;
}

/** FNV-1a 32-bit over a string, hex-encoded — tiny, deterministic, browser-safe. */
function fnv1a(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    // 32-bit FNV prime multiply, kept in uint32 space.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

/** Whitespace-insensitive normalization so trailing spaces / CRLF don't change a handle. */
function normalize(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/[ \t]+$/gm, '').trim();
}

const FENCE = /^(```|~~~)/;

/**
 * Split markdown into top-level blocks (blank-line separated, fences kept whole)
 * with stable content-hash ids and source offsets.
 */
export function splitBlocks(markdown: string): DocBlock[] {
  // Work line-wise, tracking offsets into the ORIGINAL string so [start, end) splices cleanly.
  const lines = markdown.split('\n');
  const rawBlocks: Array<{ start: number; end: number }> = [];
  let offset = 0;
  let current: { start: number; end: number } | null = null;
  let fence: string | null = null;

  for (const line of lines) {
    const lineStart = offset;
    const lineEnd = offset + line.length; // exclusive of the '\n'
    offset = lineEnd + 1;

    const isBlank = line.trim() === '';
    const fenceMatch = FENCE.exec(line.trim());

    if (fence !== null) {
      // Inside a fenced block: everything (including blanks) extends the block.
      current!.end = lineEnd;
      if (fenceMatch !== null && fenceMatch[1] === fence) fence = null;
      continue;
    }

    if (isBlank) {
      if (current !== null) {
        rawBlocks.push(current);
        current = null;
      }
      continue;
    }

    if (current === null) current = { start: lineStart, end: lineEnd };
    else current.end = lineEnd;

    if (fenceMatch !== null) fence = fenceMatch[1] ?? null;
  }
  if (current !== null) rawBlocks.push(current);

  // Content-hash handles, disambiguated by occurrence order for identical blocks.
  const seen = new Map<string, number>();
  return rawBlocks.map(({ start, end }) => {
    const text = markdown.slice(start, end);
    const hash = fnv1a(normalize(text));
    const n = (seen.get(hash) ?? 0) + 1;
    seen.set(hash, n);
    return { id: n === 1 ? `b-${hash}` : `b-${hash}-${n}`, text, start, end };
  });
}

/**
 * The accept-apply splice (the honesty wall the 501 guarded): locate `blockId` in
 * the CURRENT body, verify the suggestion's recorded `original` still matches the
 * block (the drift witness), and return the body with the block replaced by
 * `proposed`. Returns a typed refusal instead of a wrong-prose splice.
 */
export function applySuggestionToBody(
  body: string,
  input: { blockId: string; original: string; proposed: string },
): { ok: true; body: string } | { ok: false; reason: 'block-not-found' | 'original-drifted' } {
  const block = splitBlocks(body).find((b) => b.id === input.blockId);
  if (block === undefined) return { ok: false, reason: 'block-not-found' };
  if (normalize(block.text) !== normalize(input.original)) {
    return { ok: false, reason: 'original-drifted' };
  }
  return {
    ok: true,
    body: body.slice(0, block.start) + input.proposed + body.slice(block.end),
  };
}
