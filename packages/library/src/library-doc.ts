import { z } from "zod";
import { Knowledge, type KnowledgeKind } from "./knowledge.js";
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

/**
 * A plain-language account of WHY `input` failed {@link upcastAndValidate}, written against the ONE
 * arm the author meant.
 *
 * {@link LibraryDoc} is a `z.union` of the structured {@link Knowledge} discriminated union and the
 * rendered {@link LibraryAsset}, so a doc that misses its own arm throws an `invalid_union` carrying
 * BOTH arms' issues. The LibraryAsset arm's `.strict()` then reports every structured field —
 * `kind`, `provenance`, `statement`, `evidence`, `impact`, `schemaVersion` — as an "unrecognized
 * key", so the caller is told to remove the fields its kind REQUIRES and the fields the write
 * surface STAMPED for it, while the real defect (one wrong or missing field) is never named. That is
 * the `friction-capture-surface-is-itself-high-friction` trap, and it is the same `.strict()` dump
 * {@link import("./knowledge.js").knownFieldsForKind} already defuses for `artifact edit --set`.
 *
 * This picks the intended arm from the doc itself — `kind` for a structured unit, `category` for a
 * rendered one — re-parses against THAT arm alone, and reports its issues as missing / unknown /
 * other, followed by the arm's field list. TOTAL and non-lying: any input it cannot place (no
 * discriminator, an unknown kind, an arm that actually parses, a non-zod error) falls back to the
 * raw message, so it can never hide a real failure behind a confident-sounding summary.
 *
 * The write surface's own hints (which fields it stamps, which verb to use instead) belong to the
 * CALLER — the `artifact edit --set` precedent, where `commands.ts` owns the unsettable-field set.
 *
 * SCHEMA SKEW is reported separately, and that distinction is the point of `opts.storedKeys`. Pass
 * the keys the doc had AS READ FROM THE STORE and an unknown key is charged BY AUTHORSHIP — the
 * same move ADR-0290 made for `check:corpus-content`. A key the caller introduced is a typo; a key
 * that was ALREADY IN THE STORED DOC is not the caller's at all: the library tier is live-canonical
 * (ADR-0023), so a `--pg` write can add a doc field BEFORE the schema that validates it reaches
 * `main`, and every session on main-derived code is then hard-refused on an artifact it never
 * touched. Measured 2026-08-03: ADR-0298's sweep wrote `proposals` onto four arcs (including
 * `verification-integrity-arc`, the busiest in the tree) about 1h40m before PR #1128 landed the
 * schema half. For that window `arc increment add` refused with a bare zod dump naming the KEY, so
 * the refusal read as "you passed a bad field" — and it arrived at the merge ceremony's residue
 * step, after automerge, when the branch is dead and there is nothing left to fix it with. Four
 * tool-calls went into establishing that the blocker was neither the session's data nor a bug.
 * Without `storedKeys` the behaviour is unchanged, so every existing caller keeps its current text.
 */
export function explainDocValidationError(
  input: unknown,
  err: unknown,
  opts?: { storedKeys?: readonly string[] },
): string {
  const raw = err instanceof Error ? err.message : String(err);

  // Mirror upcastAndValidate: the doc that FAILED is the upcast one, so diagnose that shape.
  let doc: unknown = input;
  try {
    doc = upcast(input as Record<string, unknown>);
  } catch {
    // An upcast failure is not a shape failure — fall through and diagnose the input as given.
  }
  if (doc === null || typeof doc !== "object") return raw;
  const o = doc as Record<string, unknown>;

  let label: string;
  let schema: z.ZodObject<z.ZodRawShape>;
  const kind = typeof o["kind"] === "string" ? o["kind"] : undefined;
  if (kind !== undefined) {
    // Same lookup `knownFieldsForKind` does — derived from the live schema, never a hand-kept list.
    const arm = Knowledge.optionsMap.get(kind as KnowledgeKind) as z.ZodObject<z.ZodRawShape> | undefined;
    if (arm === undefined) {
      const kinds = [...Knowledge.optionsMap.keys()].sort().join(", ");
      return `unknown artifact kind "${kind}" — a structured artifact's kind is one of: ${kinds}.`;
    }
    label = `${kind} artifact`;
    schema = arm;
  } else if (typeof o["category"] === "string") {
    label = `rendered artifact (category "${o["category"]}")`;
    schema = LibraryAsset;
  } else {
    return `${raw}\n\n(this doc carries neither a \`kind\` (structured artifact) nor a \`category\` (rendered artifact), so there is no single schema to check it against.)`;
  }

  const result = schema.safeParse(doc);
  if (result.success) return raw; // we mispicked the arm — report what actually threw, never a guess.

  const missing: string[] = [];
  const unknownKeys: string[] = [];
  const other: string[] = [];
  for (const issue of result.error.issues) {
    if (issue.code === "unrecognized_keys") {
      unknownKeys.push(...issue.keys);
    } else if (issue.code === "invalid_type" && issue.received === "undefined") {
      missing.push(issue.path.join("."));
    } else {
      other.push(`${issue.path.length > 0 ? issue.path.join(".") : "(the doc)"}: ${issue.message}`);
    }
  }

  // Charge each unknown key by AUTHORSHIP. A key already present in the doc as READ FROM THE STORE
  // was not introduced by this write, so "this kind does not have it" is the wrong diagnosis and
  // "remove it" is the wrong remedy — the field is another session's landed work.
  const storedKeys = new Set(opts?.storedKeys ?? []);
  const skewed = unknownKeys.filter((k) => storedKeys.has(k));
  const authored = unknownKeys.filter((k) => !storedKeys.has(k));

  const lines: string[] = [];

  if (skewed.length > 0) {
    lines.push(
      `SCHEMA SKEW — the STORED document already carries field(s) this checkout's schema does not know: ${skewed.join(", ")}`,
      "",
      "Your write did not introduce them. The library tier is live-canonical (ADR-0023), so a `--pg`",
      "write can add a doc field before the code that validates it reaches `main` — this checkout",
      "predates that landing.",
      "",
      "  Fix:  git fetch origin && git merge origin/main     (then re-run this command)",
      "",
      "  Do NOT strip the field to get past this. It is another session's landed work, and removing",
      "  it destroys that work — the write would persist the stripped doc back to the live store.",
      "",
      "If `main` genuinely does not carry the field yet, the schema half is still in flight on another",
      "branch. No ref-scoped search can see that (a `git grep origin/main` correctly reports it absent,",
      "which reads as `never authored` rather than `authored and not yet landed`). Wait for it to land.",
    );
    if (authored.length > 0 || missing.length > 0 || other.length > 0) lines.push("");
  }

  if (authored.length > 0 || missing.length > 0 || other.length > 0) {
    lines.push(`checked against the ${label} schema — what is actually wrong:`);
    if (missing.length > 0) lines.push(`  ✗ missing required field(s): ${missing.join(", ")}`);
    if (authored.length > 0) lines.push(`  ✗ field(s) this kind does not have: ${authored.join(", ")}`);
    for (const line of other) lines.push(`  ✗ ${line}`);
    lines.push(`a ${label} takes: ${Object.keys(schema.shape).sort().join(", ")}.`);
  }

  return lines.join("\n");
}
