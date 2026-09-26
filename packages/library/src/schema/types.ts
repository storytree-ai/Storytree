/**
 * Capability 3 · Data schema (stories/library.md): every record has a declared type with a fixed
 * set of fields, and is stamped with the schema version it was written on.
 *
 * This file declares the types, all at version 1. It describes field SHAPES only: whether the id
 * in a `story`, `capability`, `node`, `stories`, `dependsOn`, `links` or `frontCoverOf` field names
 * a record that exists is for capabilities 4, 5, 6 and 9 to check.
 *
 * Changing a type so that a record written on the old one no longer fits it is a new version of
 * it: raise its number in SCHEMA_VERSIONS and add an upgrade step to UPGRADES (./upgrades.ts) for
 * the records written on the old one. A new optional field is not, since every record written
 * before it still fits: the decision's `frontCoverOf` (capability 9) was added that way, at
 * version 1.
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
      /** The one story or capability this decision is a front cover of (capability 9). */
      frontCoverOf: z.string().optional(),
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

/**
 * One step that brings a record of `type` from version `from` to `from + 1`: it takes the fields as
 * they were written on `from` and returns them as they are on `from + 1`. Pure: it returns new
 * fields and never changes the ones it is given.
 */
export interface UpgradeStep {
  readonly type: string;
  readonly from: number;
  /** A short, stable name for the change, for the error that says a step is missing. */
  readonly name: string;
  up(fields: Record<string, unknown>): Record<string, unknown>;
}

/**
 * A whole schema: each type's version, its fields at that version, and the steps that bring a
 * record written on an older version up to it. The library runs on LIBRARY_SCHEMA; a test can run
 * it on a later one, to see how records written today are read tomorrow.
 */
export interface LibrarySchema {
  readonly versions: Readonly<Record<string, number>>;
  readonly schemas: Readonly<Record<string, z.ZodType>>;
  readonly upgrades: readonly UpgradeStep[];
}
