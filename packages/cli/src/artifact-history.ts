/**
 * `storytree library artifact history <id>` — what each write DID to an artifact's fields, read from
 * the append-only history rather than from current state (`guidance-write-path-integrity-arc`
 * end-state 3, ADR-0361 D6).
 *
 * ## The question this exists to answer
 *
 * "Did an edit LOSE content?" had no instrument. Every surface that could have answered it consults
 * the CURRENT doc — the drift checks compare a projection against the live store, a `--raw` read
 * returns what the store holds now — so when a write is the thing that lost the content, every
 * available answer is computed from the damage. Both of this arc's incidents were caught by a human
 * reading prose and noticing an absence, which is the one thing nobody greps for.
 *
 * `events.library_event` is the reference point that is NOT the post-write state: `upsertDoc` /
 * `patchDoc` append the whole doc as it stood after each write, so the sizes below are a second
 * opinion the damaged row cannot contaminate. The technique is not new — the adjudication of
 * `regen-mid-edit-truncates-guidance-silently` established what happened by hand-querying exactly
 * this table, watching `session-orchestrator`'s workflow go 16,791 → 9,733 → 18,488 characters
 * across three sequence numbers and reading the middle one as a sibling's stale whole-doc write.
 * That query is what becomes a verb here, so the next reader does not need SQL and a hypothesis.
 *
 * ## What it reports, and what it deliberately does not
 *
 * Sizes and losses, per field, per write, with the writer and the timestamp — the mechanical facts.
 * It renders no verdict: a shrink is ordinary curation far more often than it is damage (which is
 * why a shrink GUARD was refused, ADR-0361 D4), so calling one "suspicious" would train the reader
 * to skim past the word. A LOST column and the actor beside it are enough to decide, and deciding
 * is the reader's job.
 *
 * Pure: it takes the events and returns text. The store read lives at the callsite.
 */
import type { StoreEvent } from "@storytree/storage-protocol";

/** One field's size at one write, and what changed since the previous one. */
export interface FieldSizeRow {
  readonly field: string;
  readonly length: number;
  /** Characters gained (+) or lost (−) since the previous write. `null` at the first appearance. */
  readonly delta: number | null;
  /** True when this value is a proper prefix of the previous one — the truncation signature. */
  readonly prefixOfPrevious: boolean;
}

/** One write, as the history log recorded it. */
export interface HistoryEntry {
  readonly seq: number;
  readonly at: string;
  readonly actor: string;
  readonly type: StoreEvent["type"];
  /** The string fields this write CHANGED, with their sizes. Unchanged fields are omitted. */
  readonly changed: readonly FieldSizeRow[];
  /** Total characters across every string field, as a one-number shape of the doc. */
  readonly total: number;
}

/** The string-valued fields of an event's doc — the ones with a length worth comparing. */
function stringFieldsOf(doc: unknown): Map<string, string> {
  const out = new Map<string, string>();
  if (typeof doc !== "object" || doc === null) return out;
  for (const [k, v] of Object.entries(doc as Record<string, unknown>)) {
    if (typeof v === "string") out.set(k, v);
  }
  return out;
}

/**
 * Fold the raw history into one entry per write.
 *
 * `field` narrows every entry to a single field AND keeps writes that did not touch it, so the
 * sequence reads as that field's own life rather than a filtered list with holes. Without it, a
 * write reports only the fields it changed — an artifact carries dozens, and listing the untouched
 * ones every time would bury the one line that matters.
 */
export function foldHistory(
  events: readonly StoreEvent[],
  field?: string,
): readonly HistoryEntry[] {
  const entries: HistoryEntry[] = [];
  let previous = new Map<string, string>();
  for (const e of events) {
    const current = stringFieldsOf(e.doc);
    const changed: FieldSizeRow[] = [];
    for (const [name, value] of current) {
      if (field !== undefined && name !== field) continue;
      const before = previous.get(name);
      if (before === value) continue;
      changed.push({
        field: name,
        length: value.length,
        delta: before === undefined ? null : value.length - before.length,
        prefixOfPrevious:
          before !== undefined && before.length > value.length && before.startsWith(value),
      });
    }
    let total = 0;
    for (const [, v] of current) total += v.length;
    entries.push({
      seq: e.seq,
      at: e.at,
      actor: e.actor,
      type: e.type,
      changed: changed.sort((a, b) => a.field.localeCompare(b.field)),
      total,
    });
    previous = current;
  }
  return entries;
}

/** `2026-08-13T04:12:55.123Z` → `08-13 04:12` — the column is for ordering, not for forensics. */
function shortTime(at: string): string {
  const m = /^\d{4}-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(at);
  return m ? `${m[1]}-${m[2]} ${m[3]}:${m[4]}` : at.slice(0, 16);
}

function signed(n: number): string {
  return n > 0 ? `+${n}` : String(n);
}

/** Render one field row: `workflow  9,733  -7,058  (prefix of the previous value)`. */
function renderRow(r: FieldSizeRow): string {
  const size = r.length.toLocaleString("en-US");
  const delta = r.delta === null ? "new" : signed(r.delta);
  const flag = r.prefixOfPrevious ? "   ← a prefix of the previous value" : "";
  return `      ${r.field}  ${size} chars  ${delta}${flag}`;
}

/**
 * The rendered history.
 *
 * Oldest first, because the question is always "when did it change" and a reader scanning for a
 * loss is scanning a sequence, not looking up a single row.
 */
export function renderHistory(input: {
  readonly id: string;
  readonly field?: string;
  readonly entries: readonly HistoryEntry[];
}): string {
  const { id, field, entries } = input;
  if (entries.length === 0) {
    return `no history for "${id}" — the append-only log holds no write of that id.`;
  }
  const lines: string[] = [
    field === undefined
      ? `${entries.length} write(s) to "${id}", oldest first.`
      : `${entries.length} write(s) to "${id}", oldest first — showing "${field}" only.`,
    "",
  ];
  for (const e of entries) {
    const total = e.total.toLocaleString("en-US");
    lines.push(`  seq ${e.seq}  ${shortTime(e.at)}  ${e.type}  by ${e.actor}   (${total} chars total)`);
    if (e.changed.length === 0) {
      lines.push(field === undefined ? "      (no string field changed)" : `      (${field} unchanged)`);
    } else {
      for (const r of e.changed) lines.push(renderRow(r));
    }
  }
  const prefixes = entries.flatMap((e) => e.changed.filter((r) => r.prefixOfPrevious));
  if (prefixes.length > 0) {
    lines.push(
      "",
      `${prefixes.length} write(s) above stored a value that is a PREFIX of what stood before it. That is`,
      "the shape a value cut in transit leaves, and also the shape of a deliberately deleted tail —",
      "the log cannot tell them apart, which is why this names them rather than judging them. The",
      "actor and the sequence beside each one are what decide it.",
    );
  }
  return lines.join("\n");
}
