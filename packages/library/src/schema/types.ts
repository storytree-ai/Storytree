/**
 * Capability 3 · Data schema (stories/library.md): every record has a declared type with a fixed
 * set of fields, and is stamped with the schema version it was written on.
 *
 * This file declares the types, all at version 1. It describes field SHAPES only: whether the id
 * in a `story`, `capability`, `node`, `stories`, `dependsOn` or `links` field names a record that
 * exists is for capabilities 4, 5 and 6 to check.
 *
 * Changing a type is a new version of it: raise its number in SCHEMA_VERSIONS and add an upgrade
 * step for the records written on the old one. 0.3 starts at version 1 and has no upgrade step
 * until the first real change needs one.
 */
import { z } from "zod";

/** The declared record types. */
export type RecordType =
  | "arc"
  | "story"
  | "capability"
  | "contract"
  | "health"
  | "memory"
  | "decision"
  | "definition";

/** A string that may not be empty: a title, a text, a term or a meaning. */
const nonEmpty = z.string().min(1);

/** Ids of other records. */
const ids = z.array(z.string());

/**
 * Each type's fields at the version SCHEMA_VERSIONS gives it (version 1 for all of them today).
 * Every object is `.strict()`, so a field it does not declare is refused rather than stored.
 */
export const RECORD_SCHEMAS = {
  arc: z
    .object({
      title: nonEmpty,
      description: z.string().optional(),
      stories: ids.optional(),
    })
    .strict(),
  story: z
    .object({
      title: nonEmpty,
      description: z.string().optional(),
    })
    .strict(),
  capability: z
    .object({
      title: nonEmpty,
      story: z.string(),
      description: z.string().optional(),
      dependsOn: ids.optional(),
    })
    .strict(),
  contract: z
    .object({
      title: nonEmpty,
      capability: z.string(),
      description: z.string().optional(),
    })
    .strict(),
  health: z
    .object({
      node: z.string(),
      column: z.enum(["reported", "verified"]),
      state: z.enum(["passing", "failing", "not-checked"]),
      by: z.string().optional(),
      note: z.string().optional(),
    })
    .strict(),
  memory: z
    .object({
      text: nonEmpty,
      links: ids.optional(),
    })
    .strict(),
  decision: z
    .object({
      title: nonEmpty,
      text: nonEmpty,
      links: ids.optional(),
    })
    .strict(),
  definition: z
    .object({
      term: nonEmpty,
      meaning: nonEmpty,
      links: ids.optional(),
    })
    .strict(),
} as const satisfies Record<RecordType, z.ZodType>;

/** The schema version of each type: every record of the type is written on it. */
export const SCHEMA_VERSIONS: Readonly<Record<RecordType, number>> = {
  arc: 1,
  story: 1,
  capability: 1,
  contract: 1,
  health: 1,
  memory: 1,
  decision: 1,
  definition: 1,
};

/** The fields of a record of type `T`, as its schema declares them. */
export type FieldsOf<T extends RecordType> = z.infer<(typeof RECORD_SCHEMAS)[T]>;
