// The doc INDEX's readiness vocabulary, shared by the context that carries it (`lib/appData.ts`)
// and by every consumer that resolves an id against it.
//
// Why this exists: map-boot-independence (ADR-0240 decision 2 stage 4) removed the shared `status`
// state that used to gate the whole content area — correctly, because blanking the map for a
// Library-corpus payload the map never reads is exactly the coupling that stage exists to remove.
// But the docs half lost its error surface with it: a failed `/api/docs` became a bare
// `console.error`, and every consumer degraded to a fallback that reads as the TRUTH — an ADR
// rendered as "no doc found" when the honest answer is "the index never loaded". That is decision
// 3's failure mode (a plausible-looking degradation presented as the answer) relocated from
// staleness to absence, and it is what `docsStatus`/`docsError` close.
//
// It lives in its own module rather than in `lib/appData.ts` so a component test that mocks the
// whole `../lib/appData` module (Markdown.test.tsx, relevantAdrs.test.tsx both do) doesn't have to
// re-stub this pure copy helper to keep rendering.

/** Whether `docs` reflects a resolved `/api/docs` response yet. See {@link unresolvedDocReason}. */
export type DocsStatus = 'loading' | 'ready' | 'error';

/**
 * Whether `assets` reflects a resolved `/api/assets` response yet — structurally the same triad as
 * {@link DocsStatus}, over the OTHER boot payload. See {@link unresolvedAssetReason}.
 */
export type AssetsStatus = 'loading' | 'ready' | 'error';

/**
 * Why an id that is absent from the doc index may not be genuinely absent — or `null` when the
 * index IS resolved and "not in the index" is itself the honest answer.
 *
 * The single place the not-yet-loaded / genuinely-absent distinction is worded, so the three
 * surfaces that resolve against the index (`RelevantAdrs`, `AssetView`'s `RefLink`, `Markdown`'s
 * in-corpus links) can never drift into saying different things about the same state.
 */
export function unresolvedDocReason(status: DocsStatus): string | null {
  switch (status) {
    case 'loading':
      return 'the document index is still loading';
    case 'error':
      return 'the document index failed to load';
    case 'ready':
      return null;
  }
}

/**
 * The {@link unresolvedDocReason} sibling for the LIBRARY index — why an id absent from `assets`
 * may not be genuinely absent, or `null` when the index IS resolved and "not in the corpus" is
 * itself the honest answer.
 *
 * It exists because the distinction MOVED rather than disappeared. `RelevantAdrs` (TreeView)
 * resolved a story's deciding ADRs against the doc index until ADR-0403 dec 1 made decisions
 * ordinary Library artifacts; it resolves them against `assets` now, and it would be the same
 * confidently-wrong surface — "(no decision found)" said over an index that never loaded — if the
 * repoint had dropped the distinction on the way. Worded here rather than inline for the reason the
 * doc sibling is: one place, so two surfaces cannot drift into saying different things about the
 * same state.
 */
export function unresolvedAssetReason(status: AssetsStatus): string | null {
  switch (status) {
    case 'loading':
      return 'the library index is still loading';
    case 'error':
      return 'the library index failed to load';
    case 'ready':
      return null;
  }
}
