import type { StoredDoc } from "@storytree/storage-protocol";
import { CURRENT_SCHEMA_VERSION } from "../migrations.js";
import {
  KIND_SPECS,
  type Knowledge,
  type KnowledgeKind,
} from "../knowledge.js";
import { renderBody } from "../knowledge-render.js";

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
 *  - EXCEPT when this code cannot faithfully parse the structured doc (a kind with no KIND_SPECS
 *    entry, or a `schemaVersion` newer than the code's CURRENT_SCHEMA_VERSION — a long-running
 *    server older than the data): the doc DEGRADES to a raw-field fallback body flagged via
 *    `degraded`, never a throw — one unrenderable doc must not 500 the whole listing.
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
  /**
   * Present when the stored doc could NOT be faithfully rendered — its kind is unknown to this
   * code, or its `schemaVersion` is newer than {@link CURRENT_SCHEMA_VERSION} (a long-running
   * server older than the data). `body` is then a raw-field fallback view carrying the reason
   * and the remedy, and `fields` is omitted so the editor never re-shapes a doc it can't parse.
   */
  degraded?: string;
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

/** Common envelope/metadata keys — everything else on a doc is a per-kind content field. */
const ENVELOPE_FIELDS = new Set([
  "id",
  "kind",
  "category",
  "title",
  "description",
  "references",
  "provenance",
  "schemaVersion",
  "createdAt",
  "updatedAt",
]);

/**
 * The fallback body for a doc this code cannot faithfully render (unknown kind, or a
 * `schemaVersion` newer than {@link CURRENT_SCHEMA_VERSION}): a leading diagnosis-plus-remedy
 * note, then every non-envelope field rendered raw (`## field` + the value; a string array as
 * bullets; anything else as fenced JSON). No KIND_SPECS involved, so it can never throw on
 * shapes the schema doesn't know yet — the listing degrades instead of 500ing (the
 * studio-version-skew incident, 2026-06-11).
 */
function renderDegradedBody(doc: Record<string, unknown>, reason: string): string {
  const blocks: string[] = [
    `> ⚠️ ${reason}. This server's code is older than the stored doc — showing the raw stored ` +
      `fields. Update the checkout and restart the studio (\`git pull\`, then ` +
      `\`pnpm studio:down\` / \`pnpm studio:up\`).`,
  ];
  for (const [key, value] of Object.entries(doc)) {
    if (ENVELOPE_FIELDS.has(key) || value == null) continue;
    if (typeof value === "string") {
      blocks.push(`## ${key}\n\n${value}`);
    } else if (Array.isArray(value) && value.every((v) => typeof v === "string")) {
      if (value.length > 0) blocks.push(`## ${key}\n\n${value.map((v) => `- ${v}`).join("\n")}`);
    } else {
      blocks.push(`## ${key}\n\n\`\`\`json\n${JSON.stringify(value, null, 2)}\n\`\`\``);
    }
  }
  return blocks.join("\n\n");
}

/**
 * The reason a structured doc cannot be faithfully rendered by THIS code, or `null` when it can:
 * its kind has no KIND_SPECS entry, or its per-row `schemaVersion` pin is newer than the code's
 * {@link CURRENT_SCHEMA_VERSION} (renderBody would silently drop fields it doesn't know).
 */
function degradeReason(doc: Record<string, unknown>, kind: string): string | null {
  if (!isStructuredKind(kind)) {
    return `This unit's kind "${kind}" is unknown to this server's schema`;
  }
  const version = typeof doc["schemaVersion"] === "number" ? doc["schemaVersion"] : 0;
  if (version > CURRENT_SCHEMA_VERSION) {
    return `This unit's schemaVersion ${version} is newer than this server's schema (version ${CURRENT_SCHEMA_VERSION})`;
  }
  return null;
}

/**
 * Extract the present per-kind structured field values from a structured Knowledge doc. A typed
 * ref-list field (KIND_SPECS `refList`: a `string[]` of `asset:` refs) rides the wire as a
 * newline-joined string — the editor edits it as one-ref-per-line text and {@link buildLibraryDoc}
 * splits it back into the array on write.
 */
function extractFields(doc: Knowledge): Record<string, string> {
  const specs = KIND_SPECS[doc.kind as KnowledgeKind] ?? [];
  const fields: Record<string, string> = {};
  const bag = doc as unknown as Record<string, unknown>;
  for (const spec of specs) {
    const value = bag[spec.field];
    if (typeof value === "string") fields[spec.field] = value;
    else if (Array.isArray(value)) {
      fields[spec.field] = value.filter((v): v is string => typeof v === "string").join("\n");
    }
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

  // A doc this code can't faithfully parse (unknown kind / newer schemaVersion) degrades to a
  // raw-field view + a `degraded` flag instead of throwing the WHOLE listing (the stale-server
  // failure mode). No `fields` either — the editor must not re-shape a doc it can't parse.
  const bag = doc as Record<string, unknown>;
  const docKind = typeof bag["kind"] === "string" ? bag["kind"] : stored.kind;
  const reason = degradeReason(bag, docKind);
  if (reason !== null) {
    return {
      id: asString(bag["id"]) || stored.id,
      category: stored.kind,
      title: asString(bag["title"]),
      description: asString(bag["description"]),
      body: renderDegradedBody(bag, reason),
      references: asStringArray(bag["references"]),
      ...(typeof bag["provenance"] === "string" && bag["provenance"]
        ? { provenance: bag["provenance"] }
        : {}),
      degraded: reason,
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
 * the editor never sees — the doc-level createdAt, schemaVersion — is preserved across edits rather
 * than dropped. Empty per-kind fields are OMITTED
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
      if (typeof value === "string" && value.trim() !== "") {
        // A typed ref-list field rides the wire newline-joined (see extractFields) — split it
        // back into the `asset:` ref array the schema expects.
        doc[spec.field] =
          spec.refList === true ? value.split(/[\s,]+/).filter((v) => v !== "") : value;
      } else delete doc[spec.field];
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
