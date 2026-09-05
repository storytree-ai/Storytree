// The `--set` VALUE BOUNDARY — what `library artifact edit --set <field>=<value>` is allowed to
// persist (`cli-write-fidelity-arc`, parked entry `artifact-edit-set-refuses-a-type-mismatched-value`).
//
// The sibling of `at-path.ts`, and the same shape of decision: a flag value passes through ONE place
// where it is judged, instead of each write path judging for itself. `at-path.ts` answers "where do
// the bytes come from"; this answers "may those bytes be stored in THIS field".
//
// WHY IT EXISTS, measured rather than reasoned about. A `--set` value is always a STRING, so a JSON
// array sent to a prose field validates perfectly and persists as literal JSON text. On 2026-08-06,
// `asset:library-edit-ceremony`'s `steps` — a KIND_SPECS prose field — read back as 8 newline-
// separated numbered lines, which is array-SHAPED. `--set steps=@steps.json` with a JSON array
// answered "updated library-edit-ceremony (set steps)" at exit 0, and the artifact then rendered its
// Steps section as a raw JSON blob until a second newline-joined write restored it byte-identically.
//
// THE TRAP PRIMES ITSELF, which is why a convention could not have prevented it: the verb's own
// documented array ergonomics (`--set references='["a","b"]'`) licenses inferring that a list-shaped
// render means an array field. And ADR-0302 D4 deleted the seed-reconciliation checks that were the
// last machinery able to notice such a divergence after the fact.
//
// Pure: no I/O, no store. The caller supplies the field's declared type.

/** What a `--set` value's JSON shape is, for the one question this module answers. */
export type ParsedShape = "array" | "object" | "scalar-or-prose";

/**
 * The JSON shape of a raw `--set` value.
 *
 * A value that is not JSON at all is `scalar-or-prose`, and so is JSON that parses to a number,
 * boolean, null or string: `--set title=42` means the two characters, and always did. Only an ARRAY
 * or an OBJECT is a structured payload that a prose field cannot honestly hold.
 */
export function parsedShapeOf(value: string): ParsedShape {
  const trimmed = value.trim();
  // Cheap gate before the parse: only these two can open a structured payload, and skipping the
  // try/catch for every ordinary prose value keeps this off the hot path of a multi-`--set` edit.
  if (!trimmed.startsWith("[") && !trimmed.startsWith("{")) return "scalar-or-prose";
  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return "scalar-or-prose";
  }
  if (Array.isArray(parsed)) return "array";
  if (typeof parsed === "object" && parsed !== null) return "object";
  return "scalar-or-prose";
}

/**
 * The refusal body for a structured payload headed at a STRING-declared field, or `null` when the
 * write is honest.
 *
 * `stringFields` is the kind's schema-derived string set (`stringFieldsForKind`) — `null` for a
 * non-Knowledge kind, where nothing is known about the field's type and nothing is refused. A field
 * that is not string-declared is left alone: an array field is already handled by the caller's
 * JSON-array path, and every other mismatch is refused loudly by the strict schema on validate.
 *
 * The message names the three things the measured failure needed and did not get: the field, what
 * its declared type actually is, and the form to send instead.
 */
export function typeMismatchRefusal(input: {
  readonly kind: string;
  readonly field: string;
  readonly value: string;
  readonly stringFields: ReadonlySet<string> | null;
}): string | null {
  const { kind, field, value, stringFields } = input;
  if (stringFields === null || !stringFields.has(field)) return null;
  const shape = parsedShapeOf(value);
  if (shape === "scalar-or-prose") return null;
  return [
    `"${field}" on a ${kind} is a PROSE field (a string), and this value is a JSON ${shape}.`,
    "",
    "Stored as-is it would validate — a JSON array IS a valid string — and the artifact would render",
    "its section as a raw JSON blob at exit 0, with nothing else to tell you. So it is refused here.",
    "",
    shape === "array"
      ? "Send the newline-joined prose instead: one line per entry, exactly as the section renders."
      : "Send the prose the section should render, not its structured source.",
    "",
    "A list-shaped RENDER does not mean an array-typed FIELD — the renderer emits prose lines. Read",
    `the stored value first:  storytree library artifact <id> --raw ${field} --pg`,
    "",
    "If this artifact genuinely needs a structured body for this field, that is a schema change, not",
    "an edit — and a whole-doc replace (--json / --file) is the surface that would carry it.",
  ].join("\n");
}

/**
 * PURE: coerce a `--set <field>=<value>` value headed at a BOOLEAN-declared field into a real
 * boolean, or return a REFUSAL STRING naming what is accepted.
 *
 * The sibling of the caller's JSON-array path, and it exists for the same reason in a different
 * type: a `--set` value is always a string, so `--set loadBearing=true` stores the four characters
 * `true` and the strict schema throws `loadBearing: Expected boolean, received string`. That message
 * names the mismatch and not the remedy, and there IS no remedy from this surface — the field was
 * simply unwritable on an existing row, leaving only a whole-doc `--json`/`--file` replace, which
 * means hand-reconstructing the entire document to flip one flag (ADR-0352 made `--set`
 * field-scoped precisely to avoid that). Measured 2026-09-06 against `adr-0526`: a librarian pass
 * judged an already-written decision belonged in the calibrate-to-these set and could not say so,
 * because `adr new --load-bearing` is a CREATION-time flag.
 *
 * Lenient on the two literals a caller actually types, case- and space-insensitively, and STRICT on
 * everything else. Deliberately NOT truthiness: `1`, `yes`, `on` and a non-empty string are all
 * plausible to a shell-shaped reader and all silently ambiguous, and `--set loadBearing=false` under
 * a truthiness rule would set the flag TRUE — the one failure mode that must not be reachable, since
 * the value would validate and persist at exit 0 with only the render to reveal it. An EMPTY value
 * is refused here rather than treated as a clear: unlike `arcRef`, a defaulted boolean's "absent" is
 * indistinguishable from `false` to every reader, so `=false` says the same thing unambiguously.
 */
export function booleanFromSetValue(field: string, value: string): boolean | string {
  const wanted = value.trim().toLowerCase();
  if (wanted === "true") return true;
  if (wanted === "false") return false;
  return [
    `"${field}" is a BOOLEAN field — pass true or false, and nothing else.`,
    `got: ${value.trim() === "" ? "(empty)" : `"${value.trim()}"`}`,
    "",
    `  storytree library artifact edit <id> --set ${field}=true --pg`,
    `  storytree library artifact edit <id> --set ${field}=false --pg`,
    "",
    "Only those two literals are read (case-insensitively). A truthy-looking value — 1, yes, on — is",
    "refused rather than guessed at, because the guess that matters is the wrong one: under a",
    "truthiness rule the string \"false\" is TRUE, and it would validate and persist at exit 0.",
  ].join("\n");
}
