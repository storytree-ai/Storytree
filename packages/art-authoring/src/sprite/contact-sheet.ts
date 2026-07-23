// contact-sheet — render the author-time REVIEW page for one generated style sheet: the raw whole-sheet
// generation, every sliced master NUMBERED with its assigned roster name (so the fragile blob→roster
// assignment is eyeball-verifiable), the five crown-recoloured per-status trees, and the unhealthy
// red-crown-vs-withered-form comparison (the owner's open sub-question). Pure string building (no
// node/network deps), so it is unit-testable offline. AUTHOR-TIME ONLY.
//
// `renderContactSheet` returns BODY CONTENT (no <html>/<head>/<body>) so it can be published directly as a
// claude.ai Artifact; `wrapContactSheetDoc` wraps it into a standalone .html document for local viewing.

export interface ContactSheetSlice {
  /** the roster name this blob was assigned to (by reading-order position). */
  name: string;
  /** the roster role ('base-tree' | 'comparison' | 'object'). */
  role: string;
  /** a `data:image/png;base64,…` URI of the sliced, transparent sprite. */
  dataUri: string;
  /** trimmed native px box (informational). */
  w: number;
  h: number;
}

export interface ContactStatusTree {
  status: string;
  hex: string;
  /** a `data:image/png;base64,…` URI of the recoloured tree. */
  dataUri: string;
}

export interface ContactSheetInput {
  styleName: string;
  styleLabel: string;
  /** a `data:image/(png|jpeg);base64,…` URI of the whole-sheet generation (may be downscaled for preview). */
  rawDataUri: string;
  /** how many blobs the slicer detected vs how many the roster expected — a mismatch is called out loudly. */
  blobCount: number;
  rosterCount: number;
  slices: ContactSheetSlice[];
  statusTrees: ContactStatusTree[];
  /** the withered unhealthy FORM master (comparison only). */
  witheredDataUri?: string;
  /** the recoloured unhealthy tree (red crown, same shape as healthy) — shown beside the withered form. */
  unhealthyRecolorDataUri?: string;
  /** a short free-text note (e.g. generation timestamp / model) shown in the footer. */
  generatedNote?: string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const STYLE = `
:root { color-scheme: light dark; }
* { box-sizing: border-box; }
.cs-root {
  font: 15px/1.5 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  max-width: 1100px; margin: 0 auto; padding: 24px 20px 64px;
  --fg: #1a1a1a; --muted: #666; --line: #e2e2e2; --card: #fafafa; --warn: #b4522f;
  color: var(--fg);
}
@media (prefers-color-scheme: dark) {
  .cs-root { --fg: #ededed; --muted: #9a9a9a; --line: #333; --card: #1c1c1c; --warn: #e0895f; }
}
:root[data-theme="dark"] .cs-root { --fg: #ededed; --muted: #9a9a9a; --line: #333; --card: #1c1c1c; --warn: #e0895f; }
:root[data-theme="light"] .cs-root { --fg: #1a1a1a; --muted: #666; --line: #e2e2e2; --card: #fafafa; --warn: #b4522f; }
.cs-root h1 { font-size: 26px; margin: 0 0 4px; }
.cs-root h2 { font-size: 18px; margin: 40px 0 12px; padding-bottom: 6px; border-bottom: 1px solid var(--line); }
.cs-sub { color: var(--muted); margin: 0 0 8px; }
.cs-raw { width: 100%; max-width: 100%; border: 1px solid var(--line); border-radius: 8px; display: block; }
.cs-note { color: var(--muted); font-size: 13px; margin-top: 6px; }
.cs-warn { color: var(--warn); font-weight: 600; }
.cs-ok { color: #3a8a4f; font-weight: 600; }
@media (prefers-color-scheme: dark) { .cs-ok { color: #6fce87; } }
.cs-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 14px; }
.cs-cell {
  border: 1px solid var(--line); border-radius: 8px; background: var(--card);
  padding: 10px; text-align: center;
}
/* checkerboard so transparent sprite alpha is visible in either theme */
.cs-swatch {
  display: flex; align-items: flex-end; justify-content: center;
  height: 128px; border-radius: 6px; overflow: hidden;
  background-color: #cfcfcf;
  background-image:
    linear-gradient(45deg, #b9b9b9 25%, transparent 25%),
    linear-gradient(-45deg, #b9b9b9 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #b9b9b9 75%),
    linear-gradient(-45deg, transparent 75%, #b9b9b9 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.cs-swatch img { max-height: 118px; max-width: 92%; object-fit: contain; image-rendering: auto; }
.cs-cap { margin-top: 8px; font-size: 13px; }
.cs-cap b { display: block; }
.cs-cap span { color: var(--muted); font-size: 12px; }
.cs-num {
  display: inline-block; min-width: 20px; padding: 0 5px; margin-right: 4px;
  border-radius: 10px; background: var(--line); font-size: 12px; font-weight: 700;
}
.cs-hex { display: inline-block; width: 11px; height: 11px; border-radius: 2px; vertical-align: middle;
  margin-right: 5px; border: 1px solid rgba(128,128,128,.4); }
.cs-compare { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; max-width: 560px; }
.cs-foot { margin-top: 48px; padding-top: 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; }
`;

/** Render the review page BODY CONTENT for one style sheet (publishable directly as an Artifact). */
export function renderContactSheet(input: ContactSheetInput): string {
  const {
    styleName,
    styleLabel,
    rawDataUri,
    blobCount,
    rosterCount,
    slices,
    statusTrees,
    witheredDataUri,
    unhealthyRecolorDataUri,
    generatedNote,
  } = input;

  const countLine =
    blobCount === rosterCount
      ? `<span class="cs-ok">✓ ${blobCount} blobs detected = ${rosterCount} roster objects</span> — assignment below is 1:1.`
      : `<span class="cs-warn">⚠ ${blobCount} blobs detected but ${rosterCount} roster objects expected</span> — the assignment below is off; re-tune <code>mergeGap</code> or do a per-object touch-up.`;

  const sliceCells = slices
    .map(
      (s, i) => `
    <div class="cs-cell">
      <div class="cs-swatch"><img src="${s.dataUri}" alt="${esc(s.name)}"></div>
      <div class="cs-cap"><b><span class="cs-num">${i + 1}</span>${esc(s.name)}</b>
        <span>${esc(s.role)} · ${s.w}×${s.h}px</span></div>
    </div>`,
    )
    .join('');

  const treeCells = statusTrees
    .map(
      (t) => `
    <div class="cs-cell">
      <div class="cs-swatch"><img src="${t.dataUri}" alt="tree ${esc(t.status)}"></div>
      <div class="cs-cap"><b>${esc(t.status)}</b>
        <span><span class="cs-hex" style="background:${esc(t.hex)}"></span>${esc(t.hex)}</span></div>
    </div>`,
    )
    .join('');

  const compareSection =
    witheredDataUri && unhealthyRecolorDataUri
      ? `
  <h2>Open question — <code>unhealthy</code>: red crown, or withered form?</h2>
  <p class="cs-sub">Status colour comes from CODE (left). But an unhealthy tree could also carry a withered
    SHAPE (right, a separate generation). Which reads better as "failing" on the map? Your call.</p>
  <div class="cs-compare">
    <div class="cs-cell">
      <div class="cs-swatch"><img src="${unhealthyRecolorDataUri}" alt="unhealthy recolour"></div>
      <div class="cs-cap"><b>A · red crown, same shape</b><span>crown recolour of the healthy master (default)</span></div>
    </div>
    <div class="cs-cell">
      <div class="cs-swatch"><img src="${witheredDataUri}" alt="withered form"></div>
      <div class="cs-cap"><b>B · withered form</b><span>a distinct generated master</span></div>
    </div>
  </div>`
      : '';

  return `
<div class="cs-root">
  <style>${STYLE}</style>
  <h1>${esc(styleLabel)}</h1>
  <p class="cs-sub">Style id <code>${esc(styleName)}</code> · one nano-banana call → content-aware slice → crown recolour.</p>

  <h2>1 · Raw generation — ONE whole-sheet call</h2>
  <p class="cs-sub">All master objects authored in a single image, so the model holds one angle, one light and one palette across the whole roster.</p>
  <img class="cs-raw" src="${rawDataUri}" alt="whole-sheet generation for ${esc(styleName)}">

  <h2>2 · Sliced masters — cut &amp; assignment check</h2>
  <p class="cs-sub">${countLine}</p>
  <div class="cs-grid">${sliceCells}</div>

  <h2>3 · Per-status trees — crown recolour from ONE master</h2>
  <p class="cs-sub">The five statuses share an EXACT silhouette; only the crown hue changes (ADR-0227 palette), deterministic and free.</p>
  <div class="cs-grid">${treeCells}</div>
${compareSection}
  <div class="cs-foot">Sprite-art-sheets pipeline · whole-sheet gen + content-aware slice + crown recolour.${
    generatedNote ? ' ' + esc(generatedNote) : ''
  }</div>
</div>`;
}

/** Wrap the body content into a standalone .html document (for local viewing / SendUserFile). */
export function wrapContactSheetDoc(bodyContent: string, title: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
</head>
<body>
${bodyContent}
</body>
</html>`;
}
