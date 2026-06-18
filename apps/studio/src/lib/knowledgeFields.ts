// The per-kind structured field set the editor renders for a structured Knowledge unit
// (option C of oq-library-doc-shape). The single source of truth is KIND_SPECS in
// packages/library — imported via the `@storytree/library/knowledge` subpath so the browser bundle
// never pulls a node:-laden root barrel (the same reason AssetView uses `@storytree/library/sources`).
// renderBody (the `@storytree/library/knowledge-render` subpath) gives the editor a byte-identical
// preview / derived body without re-implementing the layout. (The knowledge schema MOVED from
// `@storytree/core` to `@storytree/library` in ADR-0068 step 4.)

import { KIND_SPECS, type KnowledgeKind } from '@storytree/library/knowledge';
import { renderBody } from '@storytree/library/knowledge-render';
import type { AssetCategory } from '../types';

/** One editable per-kind field, as the editor renders it. */
export interface EditorFieldSpec {
  field: string;
  heading: string;
  placeholder: string;
  required: boolean;
  lead: boolean;
  /** Typed `asset:` ref-list field — edited as one-ref-per-line text, stored as a string[]. */
  refList?: boolean;
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
    if (typeof value === 'string' && value.trim() !== '') {
      // A ref-list field is edited as one-ref-per-line text but stored (and rendered) as a
      // string[] — split it so the preview matches the store's read render byte-for-byte.
      doc[spec.field] =
        spec.refList === true ? value.split(/[\s,]+/).filter((v) => v !== '') : value;
    }
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
