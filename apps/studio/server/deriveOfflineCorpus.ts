// Derive the offline studio corpus from the structured knowledge seed — the in-memory replacement
// for the retired `apps/studio/data/build-corpus.mjs` (ADR-0210). Each `knowledge.json` unit renders
// to a GuidanceAsset via the library's `renderBody`; the `template` artifacts come from
// `libraryTemplates()`. The offline `JsonBackend` seeds its GITIGNORED runtime store from this on
// first run, so no committed generated file (the retired `assets.json`) has to stand in for the
// DB-backed corpus. The hosted/default studio reads the live Postgres store and never touches this.

import type { GuidanceAsset } from '../src/types';

/**
 * The offline sandbox's seed units: the library's committed FIXTURE corpus (ADR-0302 D1 deleted
 * `apps/studio/data/knowledge.json`, which this used to read).
 *
 * Read what this makes the `STORYTREE_STUDIO_STORE=json` backend honestly IS: a small local sandbox
 * with a handful of artifacts in it, not a browsable copy of the Library. That was already true in
 * substance — the offline seed had been a frozen, drifting export for some time, and CLAUDE.md said
 * so — this makes it true in SIZE as well, which is the part that stops a reader mistaking it for
 * current. The studio's default backend is the live store; anyone wanting the real corpus wants that.
 *
 * DYNAMIC import for the same reason {@link deriveOfflineAssets} uses one: `@storytree/library`'s
 * subpaths are raw TS with `.js` specifiers, which Node's ESM resolver cannot resolve at vite
 * CONFIG-LOAD time. esbuild leaves a dynamic import of an EXTERNAL package as a runtime `import()`.
 */
export async function loadFixtureSeedUnits(): Promise<KnowledgeUnitLike[]> {
  const { FIXTURE_CORPUS_UNITS } = await import('@storytree/library/fixture');
  return FIXTURE_CORPUS_UNITS as KnowledgeUnitLike[];
}

/** A raw structured knowledge unit (validated downstream at the render boundary). */
export interface KnowledgeUnitLike {
  id: string;
  kind: string;
  title: string;
  description: string;
  references?: string[];
  /** The authored `dependsOn` dependency edge (ADR-0223) — absent for an edge-free kind or an
   *  un-curated doc; carried so the offline focus graph walks the same substrate as the live one. */
  dependsOn?: string[];
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
  const { renderBody, libraryTemplates, hasDependsOnKey, readDependsOnPointers } = await import('@storytree/library');

  // renderBody is driven by KIND_SPECS off the structured fields — the same render build-corpus used.
  const renderKnowledgeAsset = (doc: KnowledgeUnitLike): GuidanceAsset => ({
    id: doc.id,
    category: doc.kind as GuidanceAsset['category'],
    title: doc.title,
    description: doc.description,
    body: renderBody(doc as Parameters<typeof renderBody>[0]),
    references: doc.references ?? [],
    // Absent-by-default, never `?? []` — an empty array would claim "authored, and it stands on
    // nothing", which is a different fact from "carries no authored edge" (ADR-0223's optional rule).
    ...(hasDependsOnKey(doc) ? { dependsOn: readDependsOnPointers(doc) } : {}),
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
