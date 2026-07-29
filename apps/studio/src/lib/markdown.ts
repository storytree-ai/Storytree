// Markdown helpers shared by the renderer and the comment system.
//
// The SAME `slugify` produces both a rendered heading's `id` and a section
// comment's `headingSlug`, so a comment reliably targets the heading it was
// attached to (the task's "stable section/heading anchors").

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[`*_~]/g, '') // markdown emphasis marks
    .replace(/[^\w\s-]/g, '') // punctuation, smart quotes, parens
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export interface Heading {
  depth: number;
  text: string;
  slug: string;
}

/** Parse ATX headings (`#`..`####`) from markdown, skipping fenced code blocks. */
export function parseHeadings(markdown: string): Heading[] {
  const out: Heading[] = [];
  let inFence = false;
  for (const line of markdown.split(/\r?\n/)) {
    if (/^\s*(```|~~~)/.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const m = line.match(/^(#{1,4})\s+(.+?)\s*#*\s*$/);
    if (m && m[1] && m[2]) {
      out.push({ depth: m[1].length, text: m[2].trim(), slug: slugify(m[2].trim()) });
    }
  }
  return out;
}

/**
 * If a `<pre>`'s child is a ```` ```mermaid ```` fenced code block, return its raw source
 * (so the renderer can draw it as an SVG diagram instead of a code listing); else `null`.
 *
 * Reads the hast `node` react-markdown passes to the `pre` component — the only place the
 * fenced block's language class (`language-mermaid`) and its verbatim text are both still
 * available. Pure (no DOM), so the routing it drives is unit-testable; every other fenced
 * block returns `null` and renders exactly as before.
 */
export function mermaidSource(node: unknown): string | null {
  const pre = node as { children?: unknown[] } | undefined;
  const code = pre?.children?.find(
    (c): c is { properties?: { className?: unknown }; children?: unknown[] } =>
      typeof c === 'object' && c !== null && (c as { tagName?: unknown }).tagName === 'code',
  );
  if (!code) return null;
  const cls = code.properties?.className;
  const classes = Array.isArray(cls)
    ? cls.map(String)
    : typeof cls === 'string'
      ? cls.split(/\s+/)
      : [];
  if (!classes.includes('language-mermaid')) return null;
  const text = (code.children ?? [])
    .map((c) =>
      typeof c === 'object' && c !== null && (c as { type?: unknown }).type === 'text'
        ? String((c as { value?: unknown }).value ?? '')
        : '',
    )
    .join('');
  return text.replace(/\n+$/, '');
}

function normalizePosix(p: string): string {
  const stack: string[] = [];
  for (const part of p.split('/')) {
    if (part === '' || part === '.') continue;
    if (part === '..') stack.pop();
    else stack.push(part);
  }
  return stack.join('/');
}

/**
 * Whether `href` is SHAPED like an in-corpus doc link — a relative path, rather than an external
 * URL, a same-page anchor, or a mailto. Says nothing about whether the target exists: answering
 * THAT needs the doc index, and keeping the two questions apart is what lets a caller tell "this
 * link points outside the corpus" from "the index hasn't loaded, so I can't resolve it yet".
 */
export function isInCorpusDocHref(href: string): boolean {
  if (/^[a-z]+:\/\//i.test(href) || href.startsWith('#') || href.startsWith('mailto:')) {
    return false;
  }
  return (href.split('#')[0] ?? '') !== '';
}

/**
 * Resolve a markdown link href to a known doc id (so in-corpus cross-links
 * navigate inside the studio), or null if it isn't an in-corpus doc.
 * Tries the link relative to the current doc's dir, then docs-root-relative.
 */
export function resolveDocHref(
  href: string,
  baseDocId: string,
  knownIds: Set<string>,
): string | null {
  if (!isInCorpusDocHref(href)) return null;
  const h = href.split('#')[0] ?? '';
  if (!h) return null;
  const baseDir = baseDocId.includes('/') ? baseDocId.slice(0, baseDocId.lastIndexOf('/')) : '';
  const candidates = [
    normalizePosix(baseDir ? `${baseDir}/${h}` : h),
    normalizePosix(h.replace(/^docs\//, '')),
    normalizePosix(h),
  ];
  for (const c of candidates) {
    if (knownIds.has(c)) return c;
  }
  return null;
}
