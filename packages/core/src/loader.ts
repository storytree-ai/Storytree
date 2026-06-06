import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { Unit } from "./schema.js";

/** Parse a YAML corpus-unit file and validate it against the work-hierarchy schema. */
export function loadUnit(path: string) {
  const data: unknown = parse(readFileSync(path, "utf8"));
  return Unit.parse(data);
}

/** Validate already-parsed data (e.g. from the studio) against the schema. */
export function parseUnit(data: unknown) {
  return Unit.parse(data);
}
