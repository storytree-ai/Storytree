/**
 * `storytree node walls [<unit-id>]` — the write-scope wall READING (ADR-0446).
 *
 * ## The question this exists to answer
 *
 * "Does the spine's phase write-fence ever actually fire?" The spine keeps a leaf's writes inside the
 * phase it is in; better models may have made that fence less necessary than it was when it was
 * built. Deciding that needs evidence, and until ADR-0446 there was none to have: the owned loop's
 * `WriteScopedToolExecutor` kept its refusals on the executor INSTANCE and `ClaudeAgentAuthor`'s
 * PreToolUse hook returned its refusal TO THE MODEL. Both died with the run.
 *
 * This is the READER half. It exists in the same change as the producer deliberately: a counter
 * that is written but never read is the same shipped-zero as one that is read but never written, and
 * this repo's most-recorded fault class is a green check that verified nothing.
 *
 * ## AN ABSENCE AND A ZERO ARE RENDERED AS DIFFERENT SENTENCES
 *
 * The load-bearing property, and the reason the emitter writes a row per ARMED SLICE rather than per
 * refusal. "No rows at all" means NOBODY RECORDED ANYTHING — the sink was never written to, and
 * nothing about the fence has been observed. "M rows, 0 refusals" means THE WALL WAS ARMED M TIMES
 * AND NEVER FIRED, which is a genuine finding and a legitimate answer. Collapsing the two into "0
 * refusals" would convert an unverified state into an authoritative one, so the two branches below
 * share no wording.
 *
 * ## A COUNT WITHOUT ITS DENOMINATOR ANSWERS NOTHING
 *
 * Every total here is printed against the slices it was measured over, split by runtime and by phase.
 * "3 refusals" is not an answer to "is the fence earning its keep"; "3 refusals across 240 armed
 * slices on sdk-leaf between two dates" is the beginning of one.
 *
 * ## `noPathCalls` IS NEVER ADDED IN
 *
 * A write-shaped call whose target path could not be read is PASSED THROUGH by the owned loop and
 * REFUSED fail-closed by the SDK hook. One of the two is wrong. It is reported on its own line, with
 * each runtime's disposition named, because the disagreement is one of the things counting was meant
 * to settle.
 *
 * ## OBSERVABILITY ONLY
 *
 * Nothing here decides anything. It renders text for a human; no status is derived, no verdict moves,
 * and this arc explicitly does NOT adjudicate what the number means — that is an owner fork on the
 * evidence, not a conclusion this command is allowed to reach.
 *
 * Pure: it takes events and returns text. The store read lives at the callsite.
 */
import { SCOPE_EVENT_KIND, ScopeEventDoc } from "@storytree/proof-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";

/** One armed authoring slice, as the append-only stream recorded it. */
export interface ScopeSliceEntry {
  readonly at: string;
  readonly doc: ScopeEventDoc;
}

/**
 * Fold the raw merged event stream into the armed-slice log, oldest first.
 *
 * Non-scope events are dropped, as is any row whose doc does not parse — a malformed row describes
 * no slice and is not evidence that a wall was armed.
 */
export function foldScopeSlices(
  events: readonly StoreEvent[],
  unitId?: string,
): readonly ScopeSliceEntry[] {
  const entries: ScopeSliceEntry[] = [];
  for (const e of events) {
    if (e.kind !== SCOPE_EVENT_KIND) continue;
    const parsed = ScopeEventDoc.safeParse(e.doc);
    if (!parsed.success) continue;
    if (unitId !== undefined && parsed.data.unitId !== unitId) continue;
    entries.push({ at: e.at ?? "", doc: parsed.data });
  }
  return entries;
}

/** The totals one grouping key accumulated. */
export interface ScopeTotals {
  slices: number;
  refusals: number;
  noPathCalls: number;
  /** Every disposition seen under this key — more than one means the group mixes mechanisms. */
  dispositions: Set<string>;
}

function accumulate(into: Map<string, ScopeTotals>, key: string, entry: ScopeSliceEntry): void {
  let totals = into.get(key);
  if (totals === undefined) {
    totals = { slices: 0, refusals: 0, noPathCalls: 0, dispositions: new Set<string>() };
    into.set(key, totals);
  }
  totals.slices += 1;
  totals.refusals += entry.doc.refusals.length;
  totals.noPathCalls += entry.doc.noPathCalls;
  totals.dispositions.add(entry.doc.noPathDisposition);
}

/** The whole reading, already reduced. Exported so a test asserts on numbers, not on prose. */
export interface ScopeReading {
  /** Armed slices — THE DENOMINATOR. Zero here means the sink is empty, not that the wall held. */
  readonly slices: number;
  readonly refusals: number;
  readonly noPathCalls: number;
  /** ISO bounds of the period measured; absent when nothing was recorded. */
  readonly from?: string;
  readonly to?: string;
  readonly byRuntime: ReadonlyMap<string, ScopeTotals>;
  readonly byPhase: ReadonlyMap<string, ScopeTotals>;
}

/**
 * The mutable build-up of a {@link ScopeReading}. Named rather than inlined: the period bounds are
 * present only when something was recorded, and an ABSENT bound must stay absent rather than become
 * an empty string a renderer would print as a real date.
 */
interface ScopeReadingDraft {
  slices: number;
  refusals: number;
  noPathCalls: number;
  from?: string;
  to?: string;
  byRuntime: Map<string, ScopeTotals>;
  byPhase: Map<string, ScopeTotals>;
}

/** Reduce the armed-slice log to the reading. Pure. */
export function scopeReading(entries: readonly ScopeSliceEntry[]): ScopeReading {
  const byRuntime = new Map<string, ScopeTotals>();
  const byPhase = new Map<string, ScopeTotals>();
  let refusals = 0;
  let noPathCalls = 0;
  const times: string[] = [];
  for (const entry of entries) {
    refusals += entry.doc.refusals.length;
    noPathCalls += entry.doc.noPathCalls;
    if (entry.at !== "") times.push(entry.at);
    accumulate(byRuntime, entry.doc.source, entry);
    accumulate(byPhase, entry.doc.phase, entry);
  }
  times.sort();
  const reading: ScopeReadingDraft = {
    slices: entries.length,
    refusals,
    noPathCalls,
    byRuntime,
    byPhase,
  };
  const first = times[0];
  const last = times[times.length - 1];
  if (first !== undefined) reading.from = first;
  if (last !== undefined) reading.to = last;
  return reading;
}

function shortTime(iso: string): string {
  return iso === "" ? "(no time)" : iso.replace("T", " ").replace(/\.\d+Z$/, "Z");
}

function pad(text: string, width: number): string {
  return text.length >= width ? text : text + " ".repeat(width - text.length);
}

function groupLines(label: string, groups: ReadonlyMap<string, ScopeTotals>): string[] {
  if (groups.size === 0) return [];
  const width = Math.max(...[...groups.keys()].map((k) => k.length));
  const lines = ["", `${label}:`];
  for (const [key, totals] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const dispositions = [...totals.dispositions].sort().join("/");
    lines.push(
      `  ${pad(key, width)}  ${totals.slices} armed slice(s) · ${totals.refusals} refusal(s) · ` +
        `${totals.noPathCalls} no-path (${dispositions})`,
    );
  }
  return lines;
}

/**
 * Render the reading for a human.
 *
 * The empty branch and the armed-but-silent branch deliberately share no sentence: one reports that
 * nothing was measured, the other reports a measurement whose value is zero. A reader who cannot tell
 * those apart cannot use either.
 */
export function renderScopeReading(input: {
  readonly unitId?: string;
  readonly entries: readonly ScopeSliceEntry[];
}): string {
  const { unitId, entries } = input;
  const scope = unitId === undefined ? "every unit" : `"${unitId}"`;
  const reading = scopeReading(entries);

  if (reading.slices === 0) {
    return [
      `NOTHING RECORDED for ${scope} — the write-scope sink holds no armed slice.`,
      "",
      "This is an ABSENCE, not a zero. It does not say the wall never fired; it says nobody",
      "observed it. events.scope_event is written by a `--real`/`--live` build with `--store pg`",
      "(a dry run's record is in-memory and dies with the run, by design), so an empty reading",
      "before any such build has run is expected and settles nothing.",
    ].join("\n");
  }

  const lines: string[] = [
    `write-scope wall reading for ${scope} (ADR-0446).`,
    "",
    `  armed slices:   ${reading.slices}   ← the denominator: authoring slices a fence was in place for`,
    `  refusals:       ${reading.refusals}   ← scoped-path writes the wall refused`,
    `  no-path calls:  ${reading.noPathCalls}   ← counted APART; the mechanisms disagree about these`,
  ];
  if (reading.from !== undefined && reading.to !== undefined) {
    lines.push(`  period:         ${shortTime(reading.from)} → ${shortTime(reading.to)}`);
  }
  lines.push(...groupLines("by runtime", reading.byRuntime));
  lines.push(...groupLines("by phase", reading.byPhase));

  const fired = entries.filter((e) => e.doc.refusals.length > 0);
  if (fired.length > 0) {
    lines.push("", "refusals, oldest first:");
    for (const entry of fired) {
      for (const refusal of entry.doc.refusals) {
        lines.push(
          `  ${shortTime(entry.at)}  ${entry.doc.unitId}  ${entry.doc.phase}  ` +
            `${entry.doc.source}  [${refusal.kind}]  ${refusal.tool} → ${refusal.path}`,
        );
        if (refusal.reason !== undefined) lines.push(`      ${refusal.reason}`);
      }
    }
  } else {
    lines.push(
      "",
      `THE WALL WAS ARMED ${reading.slices} TIME(S) AND NEVER FIRED.`,
      "",
      "That is a measurement, not an empty result — every slice above recorded that a fence was in",
      "place and that no write hit it. It is also NOT a verdict on whether the fence should stay:",
      "this reading is evidence for that decision (ADR-0446), never the decision itself.",
    );
  }

  lines.push(
    "",
    "no-path calls are NEVER added into the refusal count: a write-shaped call whose target path",
    "cannot be read is passed through by the owned loop and refused fail-closed by the SDK hook, so",
    "one of the two is wrong. Each runtime's disposition is named above; that disagreement is one of",
    "the things counting these was meant to settle.",
  );
  return lines.join("\n");
}
