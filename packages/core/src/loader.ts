import { Unit } from "./schema.js";

/**
 * Validate already-parsed data (e.g. from the studio) against the work-hierarchy schema.
 * (The YAML-file unit loader is gone — the pure-YAML unit representation is retired,
 * ADR-0039; units are frontmatter-markdown, loaded by the orchestrator's node-spec loader.)
 */
export function parseUnit(data: unknown) {
  return Unit.parse(data);
}
