// palette-transcription.ts — THE THREE COPIES OF THE STATUS PALETTE, HELD TOGETHER.
//
// THE DEFECT THIS EXISTS BECAUSE OF, and it is the third time the same one landed. The land's
// colour IS a capability's proof state (ADR-0392 D5 / ADR-0398 D7, as amended by ADR-0461), and
// that colour is written down in THREE places:
//
//   1. `apps/studio/src/index.css` — the `.hex-territory.st-<status>` blocks and the
//      `--crown-<status>-lo` custom properties. CANONICAL: this is the authoring surface, and
//      every decision about the vocabulary (ADR-0462, ADR-0470) was made by editing it.
//   2. `packages/forest-world-r3f/harness/palette-band.ts` — `STATUS_TOKENS` / `TREE_TOKENS`, a
//      DECLARED transcription of (1) for the live-render experiment.
//   3. `packages/forest-world-r3f/src/ForestWorldCanvas.tsx` — `GROUND_COLOUR` / `CROWN_COLOUR`,
//      what the SHIPPED canvas draws, and since 2026-08-28 what a visitor to the public site's
//      chapter 2 actually sees.
//
// Until this module existed, NOTHING compared any pair of them. The CSS said so in as many words
// — "Nothing mechanical compares the two copies — if you retune a token here, move it there in
// the same landing" — and (3) had drifted so far that it disagreed with the other two on ALL SIX
// states: `mapped` was blue where the decision said clay, `unhealthy` brown where it said charred
// near-black, and `building` still owned a colour ADR-0462 had merged away.
//
// ⚠ THERE IS A FOURTH COPY AND IT IS DELIBERATELY NOT READ HERE. `pnpm sync:web-engine` mirrors
// `src/` into the public website repo, so `web/src/lib/forest-world-r3f/ForestWorldCanvas.tsx`
// carries the same two maps — and `check:web-engine` already holds that mirror BYTE-IDENTICAL to
// its source and reds on any drift. Reading it here would add a second, weaker guard over a
// property another rung already proves exactly, and it would go vacuously green in the common case
// where the submodule is not checked out. The mirror is covered transitively, by construction.
//
// ⚠ THE FAILURE MODE IS NOT "THE MAP LOOKS DATED". A palette no decision authorises is the map
// REPORTING STATES IT WAS NEVER TOLD TO REPORT. A treatment that reads beautifully and misreports
// proof state is a REGRESSION, which is the one way this arc can do real harm.
//
// ⚠ WHY A CHECK AND NOT AN IMPORT. (3) cannot simply import (2): `pnpm sync:web-engine` mirrors
// `src/` into the public website repo and copies nothing from `harness/`, so an import across
// that line would dangle in the published tree (`scope-fence.test.ts` fences it). And (1) is in
// `apps/studio`, which does not depend on this package at all — no import in either direction can
// see both. So the comparison is made by READING ALL THREE OFF DISK, which needs no dependency
// edge in any direction and is the only placement that can see the whole chain.
//
// ⚠ THE EXPECTED SET IS HAND-AUTHORED UPSTREAM ({@link DECIDED_STATUSES}), never derived from any
// of the three subjects. An expectation computed from the thing it checks vanishes at exactly the
// moment the thing it guards does, and the check then passes for the reason it exists to catch: a
// canvas that dropped `unhealthy` entirely would agree perfectly with a CSS parse that had been
// asked only about the statuses the canvas still held.
//
// PURE AND BROWSER-FREE: it takes file TEXT and returns a verdict, so both the `node:test` suite
// and the `pnpm check:palette-transcription` rung run exactly the same comparison over exactly
// the same parsers.

/** The six states the semantic layer can produce, authored HERE rather than read off any of the
 *  three subjects — see the header. A parse that yields anything other than these six is a
 *  refusal, not a narrowing. */
export const DECIDED_STATUSES: readonly string[] = [
  'healthy',
  'mapped',
  'proposed',
  'building',
  'unhealthy',
  'unknown',
];

/** One status's authored GROUND family, in the shape all three copies express it in: the three
 *  `--hex-top-*` variants a cell hash-picks between, the wheat-accent override, and the flank a
 *  wall face wears. */
export interface GroundFamily {
  top: readonly string[];
  wheat: string;
  side: string;
}

/** One disagreement between two copies, named so a reader can act on it without opening
 *  either file: WHICH token, in WHICH two sources, holding WHICH two values. */
export interface Disagreement {
  /** e.g. `mapped.top[0]` or `building.crown`. */
  token: string;
  /** The source treated as canonical for this comparison. */
  expectedFrom: string;
  expected: string;
  /** The source under test. */
  actualFrom: string;
  actual: string;
}

/** CSS comments hold hex literals — the `.hex-territory.st-mapped` block alone quotes four — so
 *  every parser below strips them FIRST. A parser that read a hex out of a comment would report a
 *  token the browser never resolves. */
export function stripCssComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Line and block comments in a TypeScript source. Same reason: `ForestWorldCanvas.tsx`'s own
 *  header quotes the retired spike palette's six hexes, and a parser that swept them up would
 *  compare the decision against the very values it replaced. */
export function stripTsComments(ts: string): string {
  return ts.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

/** The GROUND families the app authors: every `.hex-territory.st-<status>` rule block.
 *
 *  ⚠ ONE BLOCK CAN CARRY SEVERAL SELECTORS, and that is load-bearing rather than incidental
 *  formatting. `proposed` and `building` share a single block (ADR-0462: five colours over six
 *  states), so a parser keyed on one selector per block would find five families and silently
 *  report `building` as having no ground colour at all.
 *
 *  `wheat` falls through to the `:root` default unless the block overrides it — `unhealthy` is
 *  the one family that does, because a bright wheat accent on charred ground would pop. */
export function parseCssGroundFamilies(css: string): Map<string, GroundFamily> {
  const clean = stripCssComments(css);
  const rootWheat = /--hex-wheat:\s*(#[0-9a-fA-F]{6})/.exec(clean)?.[1];
  const out = new Map<string, GroundFamily>();
  const block = /((?:\.hex-territory\.st-[a-z]+\s*,?\s*)+)\{([^}]*)\}/g;
  for (const m of clean.matchAll(block)) {
    const statuses = [...m[1]!.matchAll(/\.hex-territory\.st-([a-z]+)/g)].map((s) => s[1]!);
    const body = m[2]!;
    const decl = (name: string): string | undefined =>
      new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(body)?.[1];
    const top = [decl('hex-top-0'), decl('hex-top-1'), decl('hex-top-2')];
    const side = decl('hex-side');
    if (top.some((t) => t === undefined) || side === undefined) continue;
    const wheat = decl('hex-wheat') ?? rootWheat;
    if (wheat === undefined) continue;
    for (const status of statuses) {
      out.set(status, { top: top as string[], wheat, side });
    }
  }
  return out;
}

/** The CROWN token the app fills `.story-tree .crown-lo circle` with, per status.
 *
 *  ⚠ A STATUS WITH NO RULE OF ITS OWN IS NOT MISSING — IT INHERITS. `building` has no
 *  `.story-tree.st-building` rule and no `--crown-building-*` pair, so it resolves to the
 *  UNQUALIFIED `.story-tree .crown-lo circle` default. That fall-through is the cascade doing what
 *  it is for, and it is why the crowns did NOT merge when the ground families did: this file
 *  transcribes what the app DELIVERS, it does not harmonise. Resolving the default here rather
 *  than hard-coding `unknown` is what keeps that a fact read off the CSS instead of a belief. */
export function parseCssCrowns(css: string): Map<string, string> {
  const clean = stripCssComments(css);
  const vars = new Map<string, string>();
  for (const m of clean.matchAll(/--crown-([a-z]+)-lo:\s*(#[0-9a-fA-F]{6})/g)) {
    vars.set(m[1]!, m[2]!);
  }
  const fallbackVar = /\.story-tree\s+\.crown-lo\s+circle\s*\{\s*fill:\s*var\(--crown-([a-z]+)-lo\)/.exec(clean)?.[1];
  const out = new Map<string, string>();
  for (const status of DECIDED_STATUSES) {
    const own = vars.get(status);
    const resolved = own ?? (fallbackVar === undefined ? undefined : vars.get(fallbackVar));
    if (resolved !== undefined) out.set(status, resolved);
  }
  return out;
}

/** One `ReadonlyMap<string, string>` literal out of the shipped canvas, by binding name.
 *
 *  It parses the SOURCE TEXT rather than importing the module because the module is a `.tsx` that
 *  imports React, three and drei — unloadable outside a browser build, which is exactly why this
 *  file's palette went three decisions without anyone comparing it to anything. */
export function parseCanvasPalette(source: string, binding: string): Map<string, string> {
  const clean = stripTsComments(source);
  const block = new RegExp(`${binding}[^=]*=\\s*new Map\\(\\[([\\s\\S]*?)\\]\\)`).exec(clean);
  const out = new Map<string, string>();
  if (!block) return out;
  for (const m of block[1]!.matchAll(/\[\s*'([a-z]+)'\s*,\s*'(#[0-9a-fA-F]{6})'\s*\]/g)) {
    out.set(m[1]!, m[2]!);
  }
  return out;
}

/** Every source the verdict reads, already parsed. Passed in rather than read here so the pure
 *  comparison can be driven from a hand-written table in a test — which is how "can this check
 *  actually refuse?" gets answered without editing a shipped file. */
export interface TranscriptionInputs {
  /** (1) the authoring surface. */
  cssGround: ReadonlyMap<string, GroundFamily>;
  cssCrown: ReadonlyMap<string, string>;
  /** (2) the harness's declared transcription. */
  bandGround: ReadonlyMap<string, GroundFamily>;
  bandCrown: ReadonlyMap<string, string>;
  /** (3) what the shipped canvas draws. */
  canvasGround: ReadonlyMap<string, string>;
  canvasCrown: ReadonlyMap<string, string>;
}

const CSS = 'apps/studio/src/index.css';
const BAND = 'harness/palette-band.ts';
const CANVAS = 'src/ForestWorldCanvas.tsx';

/** THE VERDICT. Every disagreement between the three copies, over the hand-authored six statuses.
 *
 *  Each copy is compared to the CANONICAL one (the CSS) rather than to its neighbour in a chain,
 *  so a landing that moved two copies and forgot the third is reported against the decision
 *  itself and not against whichever copy happened to move first.
 *
 *  A MISSING token is a disagreement, not a skip: the statuses come from {@link DECIDED_STATUSES},
 *  so a copy that simply stopped holding one is reported rather than passed over. */
export function transcriptionDisagreements(input: TranscriptionInputs): Disagreement[] {
  const out: Disagreement[] = [];
  const absent = '(absent)';
  const compare = (token: string, expected: string | undefined, actualFrom: string, actual: string | undefined) => {
    const e = expected ?? absent;
    const a = actual ?? absent;
    if (e !== a) out.push({ token, expectedFrom: CSS, expected: e, actualFrom, actual: a });
  };
  for (const status of DECIDED_STATUSES) {
    const css = input.cssGround.get(status);
    const band = input.bandGround.get(status);
    // (2) against (1): the WHOLE family, because that is the granularity the two hold it at and
    // the flank/wheat are where a retune is most likely to be half-applied.
    for (let i = 0; i < 3; i += 1) {
      compare(`${status}.top[${i}]`, css?.top[i], BAND, band?.top[i]);
    }
    compare(`${status}.wheat`, css?.wheat, BAND, band?.wheat);
    compare(`${status}.side`, css?.side, BAND, band?.side);
    compare(`${status}.crown`, input.cssCrown.get(status), BAND, input.bandCrown.get(status));
    // (3) against (1): the shipped canvas draws ONE colour per parcel and has no per-cell variant
    // hash, so it holds `top[0]` alone — the family's first authored variant. Comparing it to
    // `top[1]` or the flank would demand a colour the canvas has no way to draw.
    compare(`${status}.ground (canvas)`, css?.top[0], CANVAS, input.canvasGround.get(status));
    compare(`${status}.crown (canvas)`, input.cssCrown.get(status), CANVAS, input.canvasCrown.get(status));
  }
  return out;
}

/** Human-readable one line per disagreement — the message the gate rung prints and the test's
 *  assertion carries, so a red says what to edit without anyone re-running it by hand. */
export function formatDisagreements(rows: readonly Disagreement[]): string {
  return rows
    .map((d) => `  ${d.token}: ${d.expectedFrom} says ${d.expected}, ${d.actualFrom} says ${d.actual}`)
    .join('\n');
}

/* ── reading the three copies off disk ─────────────────────────────────────────────────────── */

/** WHERE THE THREE COPIES ARE, resolved from this file rather than from a working directory.
 *  `pnpm check:palette-transcription` runs with the CWD at the package; the `node:test` suite runs
 *  with it wherever bun was invoked. Anchoring on `import.meta.url` is what makes the two runs the
 *  same run. */
export interface TranscriptionSources {
  cssPath: string;
  canvasPath: string;
}

/** THE WHOLE ANSWER, in two independent halves that must both be empty.
 *
 *  They are separate fields rather than one list because they fail for different reasons and a
 *  reader acts on them differently: a `fault` means a SOURCE could not be read as a palette at
 *  all — the file moved, or a binding was renamed — and until it is fixed the `disagreements`
 *  below are a comparison against silence. A named contract rather than an inline shape, so the
 *  rung and the test suite are provably reading the same two things. */
export interface TranscriptionVerdict {
  /** A source that yielded no palette. Never an empty agreement — see {@link checkTranscriptions}. */
  faults: string[];
  /** Every token on which two copies say different things. */
  disagreements: Disagreement[];
}

/** Read, parse and compare all three. Shared verbatim by the gate rung and by the test suite, so
 *  a green test cannot mean something different from a green rung.
 *
 *  ⚠ A SOURCE THAT PARSED TO NOTHING IS A HARD FAULT, NOT AN EMPTY AGREEMENT. A moved CSS file or
 *  a renamed binding would otherwise leave every map empty, every comparison `(absent)` against
 *  `(absent)`, and the check reporting perfect agreement between three things it never read. That
 *  is the single most likely way this rung would come to certify nothing, so it is refused
 *  explicitly rather than left to the token comparison. */
export function checkTranscriptions(
  read: (path: string) => string,
  sources: TranscriptionSources,
  bandGround: ReadonlyMap<string, GroundFamily>,
  bandCrownTokens: ReadonlyMap<string, { crown: string }>,
): TranscriptionVerdict {
  const css = read(sources.cssPath);
  const canvas = read(sources.canvasPath);
  const cssGround = parseCssGroundFamilies(css);
  const cssCrown = parseCssCrowns(css);
  const canvasGround = parseCanvasPalette(canvas, 'GROUND_COLOUR');
  const canvasCrown = parseCanvasPalette(canvas, 'CROWN_COLOUR');
  const bandCrown = new Map([...bandCrownTokens].map(([s, t]) => [s, t.crown] as const));

  const faults: string[] = [];
  const floor = (label: string, got: ReadonlyMap<string, unknown>) => {
    const missing = DECIDED_STATUSES.filter((s) => !got.has(s));
    if (missing.length) {
      faults.push(`${label} yielded no entry for ${missing.join(', ')} — the source moved, or a binding was renamed`);
    }
  };
  floor(`${CSS} ground families`, cssGround);
  floor(`${CSS} crown tokens`, cssCrown);
  floor(`${CANVAS} GROUND_COLOUR`, canvasGround);
  floor(`${CANVAS} CROWN_COLOUR`, canvasCrown);
  floor(`${BAND} STATUS_TOKENS`, bandGround);
  floor(`${BAND} TREE_TOKENS`, bandCrown);

  return {
    faults,
    disagreements: transcriptionDisagreements({
      cssGround,
      cssCrown,
      bandGround,
      bandCrown,
      canvasGround,
      canvasCrown,
    }),
  };
}
