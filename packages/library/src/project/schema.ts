/**
 * A project library's tables, as an ORDERED list of idempotent statements. Every openProject
 * applies the whole list, in order, in one transaction, so a new project gets every table and an
 * existing one gets whatever was added since it was last opened.
 *
 * Later capabilities APPEND to this list. A statement already here is never edited or reordered,
 * because existing projects have already run it: to change a table, append an idempotent ALTER.
 */
export const PROJECT_SCHEMA: readonly string[] = [
  // Facts about the library itself. Key 'project' holds the project's name.
  `CREATE TABLE IF NOT EXISTS library_meta (
    key   text PRIMARY KEY,
    value text NOT NULL
  )`,
];
