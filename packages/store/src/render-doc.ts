import type { StoredDoc } from "@storytree/core";
import { KIND_SPECS, renderBody, type Knowledge, type KnowledgeKind } from "@storytree/core";

/**
 * The READ + WRITE adapter pair between the runtime store's {@link StoredDoc} and the GuidanceAsset
 * wire shape the studio client consumes (apps/studio/src/types.ts `GuidanceAsset`).
 *
 * READ ({@link renderStoredDoc}): a stored Library doc → the GuidanceAsset shape. Two doc shapes flow
 * through the store:
 *  - A doc that already carries a string `body` — a generated `template-*` artifact or a body-only
 *    asset — is passed THROUGH verbatim (no `fields`). Its `category` is the doc's own `category`
 *    (falling back to the stored `kind` if absent).
 *  - Otherwise the doc is a structured {@link Knowledge} unit (definition / principle / …): its body
 *    is DERIVED via {@link renderBody}, its `category` is the stored `kind`, AND its per-kind
 *    structured `fields` (oneLine / whatItIs / options / …) ride along on the wire so the studio
 *    editor can edit them directly.
 *
 * WRITE ({@link buildLibraryDoc}): the inverse — option C of oq-library-doc-shape. A structured-kind
 * write that carries `fields` persists a STRUCTURED Knowledge doc (no rendered `body`), so editing a
 * unit in the studio no longer collapses it to a one-way rendered body (ADR-0013/0017/0023). A
 * non-structured category, or a write without `fields`, persists a rendered body-bearing asset as
 * before (templates / adr).
 *
 * `createdAt` / `updatedAt` on the READ side always come from the {@link StoredDoc} envelope (the
 * store's clock), not from inside the doc. Pure + offline.
 */

/** The GuidanceAsset-shaped object the studio `/api/assets` endpoint returns. */
export interface RenderedAsset {
  id: string;
  category: string;
  title: string;
  description: string;
  body: string;
  references: string[];
  provenance?: string;
  /**
   * Per-kind structured fields (KIND_SPECS), present only for a structured Knowledge unit. The
   * studio editor edits these directly (option C); `body` is the DERIVED render of them.
   */
  fields?: Record<string, string>;
  createdAt: string;
  updatedAt: string;
}

/** A rendered (body-bearing) asset doc — template or previously-edited unit. */
interface AssetDocLike {
  id?: unknown;
  category?: unknown;
  title?: unknown;
  description?: unknown;
  body?: unknown;
  references?: unknown;
  provenance?: unknown;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
}

/** True when the stored doc already carries a rendered string `body` (template / edited asset). */
function hasStringBody(doc: unknown): doc is AssetDocLike & { body: string } {
  return (
    typeof doc === "object" &&
    doc !== null &&
    typeof (doc as { body?: unknown }).body === "string"
  );
}

/** True when `category` is one of the structured Knowledge kinds (a KIND_SPECS key). */
export function isStructuredKind(category: string): category is KnowledgeKind {
  return Object.hasOwn(KIND_SPECS, category);
}

/** Extract the present per-kind structured field values from a structured Knowledge doc. */
function extractFields(doc: Knowledge): Record<string, string> {
  const specs = KIND_SPECS[doc.kind as KnowledgeKind] ?? [];
  const fields: Record<string, string> = {};
  const bag = doc as unknown as Record<string, unknown>;
  for (const spec of specs) {
    const value = bag[spec.field];
    if (typeof value === "string") fields[spec.field] = value;
  }
  return fields;
}

export function renderStoredDoc(stored: StoredDoc): RenderedAsset {
  const doc = stored.doc;

  if (hasStringBody(doc)) {
    // Pass-through: the body is authoritative; category is the doc's own, else the stored kind.
    const category = typeof doc.category === "string" ? doc.category : stored.kind;
    return {
      id: asString(doc.id) || stored.id,
      category,
      title: asString(doc.title),
      description: asString(doc.description),
      body: doc.body,
      references: asStringArray(doc.references),
      ...(typeof doc.provenance === "string" && doc.provenance
        ? { provenance: doc.provenance }
        : {}),
      createdAt: stored.createdAt,
      updatedAt: stored.updatedAt,
    };
  }

  // Structured Knowledge unit: derive the body from its per-kind fields; category = the kind; and
  // carry the structured fields on the wire so the studio editor can edit them directly (option C).
  const knowledge = doc as Knowledge;
  return {
    id: knowledge.id ?? stored.id,
    category: stored.kind,
    title: asString(knowledge.title),
    description: asString(knowledge.description),
    body: renderBody(knowledge),
    references: asStringArray(knowledge.references),
    ...(typeof knowledge.provenance === "string" && knowledge.provenance
      ? { provenance: knowledge.provenance }
      : {}),
    fields: extractFields(knowledge),
    createdAt: stored.createdAt,
    updatedAt: stored.updatedAt,
  };
}

/** The fields a Library write supplies (the validated `/api/assets` body; no store timestamps). */
export interface AssetWriteInput {
  id: string;
  category: string;
  title: string;
  description: string;
  body: string;
  references: string[];
  provenance?: string;
  /** Per-kind structured fields (KIND_SPECS); present when editing a structured Knowledge unit. */
  fields?: Record<string, string>;
}

/**
 * Build the `doc` to persist for a Library write — the inverse of {@link renderStoredDoc}, and the
 * heart of option C (oq-library-doc-shape).
 *
 * A structured-kind write that carries `fields` persists a STRUCTURED Knowledge doc: no rendered
 * `body`, so it round-trips through {@link renderStoredDoc} without lossy collapse. Any other write
 * (a non-structured category — template / adr — or a write with no `fields`) persists a body-bearing
 * asset exactly as before.
 *
 * `existing` (the current stored doc, if any) is merged UNDER the new values so write-only metadata
 * the editor never sees — glossarySection / glossaryTerm / glossaryBody, the doc-level createdAt,
 * schemaVersion — is preserved across edits rather than dropped. Empty per-kind fields are OMITTED
 * (Markdown is non-empty, and renderBody skips absent optional fields — so clearing an optional
 * field cleanly drops its section).
 */
export function buildLibraryDoc(
  input: AssetWriteInput,
  existing?: StoredDoc | null,
): Record<string, unknown> {
  const existingDoc =
    existing && typeof existing.doc === "object" && existing.doc !== null
      ? (existing.doc as Record<string, unknown>)
      : {};

  if (input.fields && isStructuredKind(input.category)) {
    // Preserve existing metadata, then strip anything that does not belong on a structured doc
    // (a prior rendered edit, or a not-yet-restructured unit, may have left a `body`/`category`).
    const doc: Record<string, unknown> = { ...existingDoc };
    delete doc["body"];
    delete doc["category"];

    doc["kind"] = input.category;
    doc["id"] = input.id;
    doc["title"] = input.title;
    doc["description"] = input.description;
    doc["references"] = input.references;
    if (input.provenance && input.provenance.trim() !== "") doc["provenance"] = input.provenance;
    else delete doc["provenance"];

    for (const spec of KIND_SPECS[input.category]) {
      const value = input.fields[spec.field];
      if (typeof value === "string" && value.trim() !== "") doc[spec.field] = value;
      else delete doc[spec.field];
    }

    // The Knowledge schema requires createdAt/updatedAt on the doc (the envelope is the real clock,
    // but the strings must be present + valid). Preserve createdAt; refresh updatedAt.
    const now = new Date().toISOString();
    if (typeof doc["createdAt"] !== "string") doc["createdAt"] = now;
    doc["updatedAt"] = now;
    return doc;
  }

  // Body-bearing LibraryAsset (template / adr, or a write without structured fields).
  const doc: Record<string, unknown> = {
    id: input.id,
    category: input.category,
    title: input.title,
    description: input.description,
    body: input.body,
    references: input.references,
  };
  if (input.provenance && input.provenance.trim() !== "") doc["provenance"] = input.provenance;
  if (typeof existingDoc["createdAt"] === "string") doc["createdAt"] = existingDoc["createdAt"];
  return doc;
}
