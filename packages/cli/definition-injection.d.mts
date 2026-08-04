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

/** Options shared by the selection helpers. */
export interface SelectOptions {
  max?: number;
  /** Ids this session has already been given; dropped AFTER matching so the cap covers fresh terms. */
  exclude?: ReadonlySet<string>;
}

/**
 * prompt + corpus docs in → the definitions to inject. Filters to kind=definition docs with a
 * non-empty oneLine, then drops anything in `opts.exclude`.
 */
export function selectDefinitions(
  prompt: string,
  docs: readonly DefinitionDoc[],
  opts?: SelectOptions,
): DefinitionDoc[];

/**
 * prompt + corpus docs in → injection text out ("" when nothing matches). Filters to
 * kind=definition docs with a non-empty oneLine; never renders body fields (ADR-0156).
 */
export function buildInjection(
  prompt: string,
  docs: readonly DefinitionDoc[],
  opts?: SelectOptions,
): string;

/**
 * Whether `prompt` reads as operator-typed rather than a harness-generated turn (a background task
 * notification, a system reminder). Machine turns are not scanned — see the module header for the
 * measurement that motivated it.
 */
export function isOperatorPrompt(prompt: string): boolean;

/**
 * Where a session's already-injected ids are remembered (OS temp dir), or `null` when the session
 * id is absent or not path-safe — in which case dedup is simply disabled.
 */
export function injectedStatePath(sessionId: unknown): string | null;
