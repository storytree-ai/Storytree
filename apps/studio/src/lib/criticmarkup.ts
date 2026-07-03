/**
 * CriticMarkup — the markdown-native editorial-markup standard adopted for Review-mode
 * comments + tracked changes (ADR-0146). This module is a PURE, deterministic parser:
 * a markdown string carrying CriticMarkup spans → a flat list of typed segments the
 * preview renders as tracked changes. No React, no DOM, no wall-clock, no randomness —
 * a pure function of the input, so it is unit-testable in isolation (the Stage-1 proof).
 *
 * The five CriticMarkup forms:
 *   • Insert       {++ text ++}          → an addition (green, underline)
 *   • Delete       {-- text --}          → a removal (red, strikethrough)
 *   • Substitute   {~~ old ~> new ~~}    → old struck + new added
 *   • Comment      {>> note <<}          → an editorial note (bubble)
 *   • Highlight    {== text ==}          → a highlighted span (yellow)
 *
 * Everything outside a marker is a `text` segment carrying raw markdown (rendered by
 * <Markdown> in the preview). A malformed / unclosed marker DEGRADES GRACEFULLY: the
 * opening token is emitted as literal text and parsing continues — it never throws and
 * never swallows the rest of the document.
 */

export type CriticSegment =
  | { kind: 'text'; text: string }
  | { kind: 'insert'; text: string }
  | { kind: 'delete'; text: string }
  | { kind: 'highlight'; text: string }
  | { kind: 'comment'; text: string }
  | { kind: 'substitute'; oldText: string; newText: string };

/** One CriticMarkup form: its open/close tokens and the segment kind it produces. */
interface MarkerSpec {
  open: string;
  close: string;
  kind: 'insert' | 'delete' | 'highlight' | 'comment';
}

// Order matters only in that each open token is distinct; we probe all four at each position.
const MARKERS: readonly MarkerSpec[] = [
  { open: '{++', close: '++}', kind: 'insert' },
  { open: '{--', close: '--}', kind: 'delete' },
  { open: '{==', close: '==}', kind: 'highlight' },
  { open: '{>>', close: '<<}', kind: 'comment' },
];

const SUB_OPEN = '{~~';
const SUB_CLOSE = '~~}';
const SUB_ARROW = '~>';

/**
 * Parse a CriticMarkup string into a flat list of typed segments. Deterministic and
 * total — every input yields a value, malformed markers fall back to literal text.
 */
export function parseCriticMarkup(input: string): CriticSegment[] {
  const segments: CriticSegment[] = [];
  let text = ''; // the accumulating literal-text run
  let i = 0;

  const flushText = (): void => {
    if (text.length > 0) {
      segments.push({ kind: 'text', text });
      text = '';
    }
  };

  while (i < input.length) {
    // A CriticMarkup marker always opens with '{'; cheap-skip everything else.
    if (input[i] !== '{') {
      text += input[i];
      i += 1;
      continue;
    }

    // Substitution first (its open token '{~~' is distinct from the four simple forms).
    if (input.startsWith(SUB_OPEN, i)) {
      const close = input.indexOf(SUB_CLOSE, i + SUB_OPEN.length);
      if (close !== -1) {
        const body = input.slice(i + SUB_OPEN.length, close);
        const arrow = body.indexOf(SUB_ARROW);
        flushText();
        if (arrow !== -1) {
          segments.push({
            kind: 'substitute',
            oldText: body.slice(0, arrow).trim(),
            newText: body.slice(arrow + SUB_ARROW.length).trim(),
          });
        } else {
          // No '~>' inside {~~ … ~~}: treat the whole body as a replacement of nothing
          // (an insert-flavoured substitution) rather than dropping it.
          segments.push({ kind: 'substitute', oldText: '', newText: body.trim() });
        }
        i = close + SUB_CLOSE.length;
        continue;
      }
      // Unclosed {~~ — degrade: emit '{' as literal text, advance one char, keep scanning.
      text += input[i];
      i += 1;
      continue;
    }

    // The four simple forms.
    let matched = false;
    for (const marker of MARKERS) {
      if (!input.startsWith(marker.open, i)) continue;
      const close = input.indexOf(marker.close, i + marker.open.length);
      if (close === -1) break; // unclosed — fall through to the literal-'{' path below
      const body = input.slice(i + marker.open.length, close);
      flushText();
      segments.push({ kind: marker.kind, text: body.trim() });
      i = close + marker.close.length;
      matched = true;
      break;
    }
    if (matched) continue;

    // A '{' that opens no valid, closed marker: emit it as literal text and move on.
    text += input[i];
    i += 1;
  }

  flushText();
  return segments;
}

/** True when the string carries at least one recognised CriticMarkup span. */
export function hasCriticMarkup(input: string): boolean {
  return parseCriticMarkup(input).some((s) => s.kind !== 'text');
}

/**
 * Strip CriticMarkup to CLEAN markdown, applying every change as if accepted — insertions
 * and substituted-new text stay, deletions and substituted-old text and comments go.
 * (The follow-on per-change accept/reject persistence builds on this; here it powers a
 * "clean" view and is the honest round-trip of the source.)
 */
export function acceptAllCriticMarkup(input: string): string {
  return parseCriticMarkup(input)
    .map((s) => {
      switch (s.kind) {
        case 'text':
        case 'insert':
        case 'highlight':
          return s.text;
        case 'substitute':
          return s.newText;
        case 'delete':
        case 'comment':
          return '';
      }
    })
    .join('');
}
