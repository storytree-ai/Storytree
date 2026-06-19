import { z } from "zod";
import { Knowledge } from "./knowledge.js";
import { upcast } from "./migrations.js";

/**
 * The library write-boundary schema (ADR-0017: JSONB docs, zod-validated at write). Split out of
 * `store.ts` (ADR-0068 step 0) so the narrow {@link import("./store.js").Store} seam carries no
 * dependency on the library schema (`knowledge.ts` / `migrations.ts`); these symbols are exported
 * from `@storytree/library`'s entry (`index.ts`).
 */

/**
 * A rendered (markdown-`body`) library artifact at the write boundary — the GuidanceAsset shape the
 * studio persists when it edits ANY non-structured-source unit. Unlike a structured {@link Knowledge}
 * unit (whose body is DERIVED from per-kind fields), a LibraryAsset carries the markdown `body`
 * directly and its `category` is a free string (the asset taxonomy: definition / principle / pattern /
 * guardrail / techstack / template / adr / open-question). This is how the studio stores an edited
 * unit (one-way rendered) and the generated `template-*` artifacts (which have no structured source).
 */
export const LibraryAsset = z
  .object({
    id: z.string(),
    category: z.string(),
    title: z.string(),
    description: z.string(),
    body: z.string(),
    references: z.array(z.string()).default([]),
    createdAt: z.string().optional(),
    updatedAt: z.string().optional(),
  })
  .strict();
export type LibraryAsset = z.infer<typeof LibraryAsset>;

/**
 * Back-compat alias: a `template` artifact is just a {@link LibraryAsset} with `category: 'template'`.
 * Kept so existing importers of `LibraryTemplate` keep working after the generalisation.
 */
export const LibraryTemplate = LibraryAsset;
export type LibraryTemplate = LibraryAsset;

/**
 * A library artifact at the write boundary: a structured {@link Knowledge} unit (definition /
 * principle / pattern / guardrail / techstack / open-question) OR a rendered {@link LibraryAsset}
 * (markdown-`body`, any category — templates and previously-edited assets). Together these are every
 * artifact the studio Library shows.
 */
export const LibraryDoc = z.union([Knowledge, LibraryAsset]);
export type LibraryDoc = z.infer<typeof LibraryDoc>;

/**
 * The zod write-boundary validator for library documents (ADR-0017: zod-validated at write). Accepts
 * a structured {@link Knowledge} unit or a rendered {@link LibraryAsset} (any category). Throws on
 * malformed input (loud write boundary). (ADR-0019's Knowledge->Library rename is deferred, so the
 * structured type name stays `Knowledge`.)
 */
export function validateLibraryDoc(input: unknown): LibraryDoc {
  return LibraryDoc.parse(input);
}

/**
 * The single write-boundary helper (design §3 "migrate-on-write":
 * docs/research/library-schema-migrations-and-health-checks.md): forward-migrate an old-shape doc
 * with {@link upcast}, THEN validate. A doc authored against an old schema is upcast-and-stamped
 * rather than rejected; a current-shape doc validates unchanged. Use this (not bare
 * {@link validateLibraryDoc}) at any write boundary that may receive lagging-version docs.
 */
export function upcastAndValidate(input: unknown): LibraryDoc {
  return validateLibraryDoc(upcast(input as Record<string, unknown>));
}
