// Per-category authoring templates: the fillable scaffold a new artifact starts
// from, and the sections its body MUST contain before the editor will save it.
//
// The load-bearing rule is the guardrail one: a guardrail must name its
// deterministic enforcement (a gate / schema / DB constraint / code path) — that
// "Enforced by" line is exactly what separates a guardrail from a mere `pattern`
// (ADR-0007 / ADR-0008). So `guardrail` requires an "Enforced by" section and the
// editor blocks save without it. One `template-<category>` artifact per category is
// the starting scaffold, generated from `@storytree/library` `KIND_SPECS` via `libraryTemplates()`
// (ADR-0210; the old data/build-corpus.mjs + data/seed.assets.mjs generators are retired).

import type { AssetCategory } from '../types';

/**
 * Sections a category's body must contain to be saveable. Matched case-insensitively
 * as a substring of the body (see `missingSections`), so either a `## Enforced by`
 * heading or an inline `**Enforced by.**` sentence satisfies it. A category absent
 * from this map enforces nothing — its template still suggests a shape, but save is
 * not blocked.
 */
const REQUIRED_SECTIONS: Partial<Record<AssetCategory, string[]>> = {
  guardrail: ['Enforced by'],
};

/** The section headings the given category's body must contain before saving. */
export function requiredSections(category: AssetCategory): string[] {
  return REQUIRED_SECTIONS[category] ?? [];
}

/** Which of `required` are absent from `body` (case-insensitive substring check). */
export function missingSections(body: string, required: string[]): string[] {
  const hay = body.toLowerCase();
  return required.filter((section) => !hay.includes(section.toLowerCase()));
}

/** The seeded template artifact id that scaffolds a new artifact of this category. */
export function templateIdFor(category: AssetCategory): string {
  return `template-${category}`;
}
