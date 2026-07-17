// Derive the offline studio corpus from the structured knowledge seed — the in-memory replacement
// for the retired `apps/studio/data/build-corpus.mjs` (ADR-0210). Each `knowledge.json` unit renders
// to a GuidanceAsset via the library's `renderBody`; the `template` artifacts come from
// `libraryTemplates()`. The offline `JsonBackend` seeds its GITIGNORED runtime store from this on
// first run, so no committed generated file (the retired `assets.json`) has to stand in for the
// DB-backed corpus. The hosted/default studio reads the live Postgres store and never touches this.

import type { GuidanceAsset } from '../src/types';

/** A raw knowledge unit as read from knowledge.json (validated downstream at the render boundary). */
export interface KnowledgeUnitLike {
  id: string;
  kind: string;
  title: string;
  description: string;
  references?: string[];
  provenance?: string;
  createdAt?: string;
  updatedAt?: string;
  [k: string]: unknown;
}

/**
 * The offline corpus: every structured knowledge unit rendered to a GuidanceAsset, then the generated
 * `template` artifacts. Ordering is knowledge.json order followed by the templates — the offline
 * browse UI sorts and filters, so exact historical ordering is not load-bearing.
 *
 * ASYNC on purpose: `@storytree/library` is imported DYNAMICALLY (the `loadOrchestrator` pattern in
 * apiRouter). Its root barrel does `export * from "./schema.js"` (raw TS with `.js` specifiers) which
 * Node's ESM resolver at vite CONFIG-LOAD cannot resolve. esbuild leaves a dynamic import of an
 * EXTERNAL package as a runtime `import()` (a static import — or a dynamic import of a LOCAL file — it
 * follows and bundles instead), so this keeps `vite build` green while tsx resolves it at runtime.
 */
export async function deriveOfflineAssets(units: KnowledgeUnitLike[]): Promise<GuidanceAsset[]> {
  const { renderBody, libraryTemplates } = await import('@storytree/library');

  // renderBody is driven by KIND_SPECS off the structured fields — the same render build-corpus used.
  const renderKnowledgeAsset = (doc: KnowledgeUnitLike): GuidanceAsset => ({
    id: doc.id,
    category: doc.kind as GuidanceAsset['category'],
    title: doc.title,
    description: doc.description,
    body: renderBody(doc as unknown as Parameters<typeof renderBody>[0]),
    references: doc.references ?? [],
    ...(doc.provenance !== undefined ? { provenance: doc.provenance } : {}),
    createdAt: doc.createdAt ?? '',
    updatedAt: doc.updatedAt ?? '',
  });

  const knowledge = units.map(renderKnowledgeAsset);
  const templates: GuidanceAsset[] = libraryTemplates().map((t) => ({
    id: t.id,
    category: t.category,
    title: t.title,
    description: t.description,
    body: t.body,
    references: [...t.references],
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  }));
  return [...knowledge, ...templates];
}
