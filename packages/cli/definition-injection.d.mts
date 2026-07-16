// Type declarations for the pure helpers definition-injection.mjs exports, so a TS test (and
// `tsc --noEmit`) can import them without `allowJs`. The injector itself stays plain Node ESM
// (no tsx/deps) by design — it runs as a blocking UserPromptSubmit hook where a tsx boot costs
// ~1 s and bare node ~150 ms. (Mirrors provision-worktree.d.mts.)

/** The subset of a knowledge doc the injector reads; extra corpus fields pass through untouched. */
export interface DefinitionDoc {
  kind?: string;
  id: string;
  title?: string;
  oneLine?: string;
  [key: string]: unknown;
}

/** Cap on injected definitions per prompt. */
export const MAX_MATCHES: number;

/**
 * Match `prompt` against the definitions' surfaces (id, title, slash-separated title parts) —
 * word-boundary, case-insensitive, hyphen/space-equivalent, plural-tolerant. Returns at most
 * `opts.max` (default MAX_MATCHES) docs, most-specific (longest matched surface) first.
 */
export function matchDefinitions(
  prompt: string,
  docs: readonly DefinitionDoc[],
  opts?: { max?: number },
): DefinitionDoc[];

/** Render the injection block: one `- id: oneLine` per match + one shared pull-pointer line. */
export function renderInjection(matches: readonly DefinitionDoc[]): string;

/**
 * prompt + corpus docs in → injection text out ("" when nothing matches). Filters to
 * kind=definition docs with a non-empty oneLine; never renders body fields (ADR-0156).
 */
export function buildInjection(
  prompt: string,
  docs: readonly DefinitionDoc[],
  opts?: { max?: number },
): string;
