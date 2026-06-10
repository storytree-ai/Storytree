// The per-kind structured field set the editor renders for a structured Knowledge unit
// (option C of oq-library-doc-shape). The single source of truth is KIND_SPECS in
// packages/core — imported via the `@storytree/core/knowledge` subpath so the browser bundle
// never pulls the node:test-laden core root barrel (the same reason AssetView uses
// `@storytree/core/sources`). renderBody (the `@storytree/core/knowledge-render` subpath) gives
// the editor a byte-identical preview / derived body without re-implementing the layout.

import { KIND_SPECS, type KnowledgeKind } from '@storytree/core/knowledge';
import { renderBody } from '@storytree/core/knowledge-render';
import type { AssetCategory } from '../types';

/** One editable per-kind field, as the editor renders it. */
export interface EditorFieldSpec {
  field: string;
  heading: string;
  placeholder: string;
  required: boolean;
  lead: boolean;
}

/** The six structured Knowledge kinds (the KIND_SPECS keys). The other categories are body-only. */
const STRUCTURED_KINDS = new Set<string>(Object.keys(KIND_SPECS));

/** True when a category is a structured Knowledge kind (edited as per-kind fields, not a body). */
export function isStructuredCategory(category: AssetCategory): boolean {
  return STRUCTURED_KINDS.has(category);
}

/** The ordered per-kind field specs for a category, or `[]` for a body-only category. */
export function fieldSpecsFor(category: AssetCategory): readonly EditorFieldSpec[] {
  return isStructuredCategory(category) ? KIND_SPECS[category as KnowledgeKind] : [];
}

/**
 * Derive the markdown body from a structured unit's fields — byte-identical to the store's read
 * render, so the editor preview and the body sent on the wire match what readers see. The fields
 * map is shaped into the minimal Knowledge object renderBody needs (`kind` + the per-kind fields);
 * empty fields are dropped so optional sections don't render as empty headings.
 */
export function renderFieldsPreview(
  category: AssetCategory,
  fields: Record<string, string>,
): string {
  if (!isStructuredCategory(category)) return '';
  const doc: Record<string, unknown> = { kind: category };
  for (const spec of fieldSpecsFor(category)) {
    const value = fields[spec.field];
    if (typeof value === 'string' && value.trim() !== '') doc[spec.field] = value;
  }
  return renderBody(doc as never);
}

/** Required per-kind fields that are empty — the editor blocks save until they're filled. */
export function missingRequiredFields(
  category: AssetCategory,
  fields: Record<string, string>,
): EditorFieldSpec[] {
  return fieldSpecsFor(category).filter(
    (spec) => spec.required && !(fields[spec.field] ?? '').trim(),
  );
}
