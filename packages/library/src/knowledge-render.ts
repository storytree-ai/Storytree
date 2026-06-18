import { KIND_SPECS, type Knowledge, type KnowledgeKind } from "./knowledge.js";

/**
 * Render a knowledge unit's markdown `body` from its structured fields, EXACTLY in the
 * round-1 layout. Driven entirely by {@link KIND_SPECS} so it cannot drift from the schema
 * or the template generator.
 *
 * Layout: the lead field renders as `${heading} ${value}` (e.g. `**In one line.** ...`),
 * then each present non-lead field renders as `## ${heading}\n\n${value}`. Blocks are joined
 * by a blank line (`\n\n`). Optional fields that are absent emit nothing — never an empty
 * heading. Citations are NOT part of the body: there is no `## See also` section — related
 * material is the structured `references` field, rendered separately as a grouped "Sources"
 * view (see `groupSources` in knowledge-sources.ts).
 *
 * A `refList` field (a `string[]` of `asset:` refs, ADR-0029 owner reshape) renders as one
 * `- asset:<id>` bullet per entry; an empty list emits nothing — never an empty heading.
 *
 * This is the inverse of the per-kind parse rules and reproduces the stored bodies
 * byte-for-byte for round-trip fidelity.
 */
export function renderBody(doc: Knowledge): string {
  const specs = KIND_SPECS[doc.kind as KnowledgeKind];
  if (specs === undefined) {
    // Named loudly: the bare `specs is not iterable` this used to throw sent operators chasing
    // DB/API failures when the real cause was a stale long-running server (code older than the
    // data). Soft-rendering callers (renderStoredDoc) guard BEFORE calling; anyone else gets
    // the diagnosis in the message.
    throw new Error(
      `renderBody: unknown knowledge kind "${doc.kind}" — this code has no KIND_SPECS entry for it. ` +
        `The running code is likely older than the stored doc; pull the latest and restart.`,
    );
  }
  const fields = doc as unknown as Record<string, string | readonly string[] | undefined>;
  const blocks: string[] = [];
  for (const spec of specs) {
    const value = fields[spec.field];
    if (value == null) continue; // optional + absent -> emit nothing
    if (Array.isArray(value) && value.length === 0) continue; // empty ref-list -> emit nothing
    const text = Array.isArray(value) ? value.map((ref) => `- ${ref}`).join("\n") : value;
    if (spec.lead) {
      blocks.push(`${spec.heading} ${text}`);
    } else {
      blocks.push(`## ${spec.heading}\n\n${text}`);
    }
  }
  return blocks.join("\n\n");
}

/**
 * Generate the BLANK template body for a kind — the lead marker + every heading, each
 * filled with its italic placeholder — from the SAME {@link KIND_SPECS}. This is the
 * ADR-0017 deliverable: templates become a generated view of the schema, not a parallel
 * hand-authored artifact. Reproduces the canonical `template-<kind>` bodies byte-for-byte.
 *
 * Unlike `renderBody`, the template emits ALL fields (including optional ones) so an author
 * sees every available section. A `refList` field's placeholder is emitted as a single `- `
 * bullet, matching how a one-entry list renders.
 */
export function generateTemplate(kind: KnowledgeKind): string {
  const specs = KIND_SPECS[kind];
  const blocks: string[] = [];
  for (const spec of specs) {
    const text = spec.refList === true ? `- ${spec.placeholder}` : spec.placeholder;
    if (spec.lead) {
      blocks.push(`${spec.heading} ${text}`);
    } else {
      blocks.push(`## ${spec.heading}\n\n${text}`);
    }
  }
  return blocks.join("\n\n");
}
