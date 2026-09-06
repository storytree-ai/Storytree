/**
 * THE COMPOSITION FOLD — what a context window is MADE OF, as far as its host transcript can see
 * (`context-window-composition-arc` increment 1; ADR-0516 D3 / D4).
 *
 * `storytree context` already says how FULL a window is. This says what it is FULL OF: one pass over
 * the same host transcript, every record classified by the label the harness itself put on it, and
 * the answer given in bytes. It is the reader-with-tests that the 2026-09-05 review
 * (`docs/research/context-window-composition-2026-09-05.md`) said should replace its own one-shot
 * scripts if the number was ever wanted as a series.
 *
 * ★ CLASSIFIED FROM LABELS, NEVER FROM CONTENT (ADR-0516 D3). The harness types its own injections:
 * every non-message record carries `attachment.type`, and every message block carries `type`. This
 * fold reads those labels and a length. It never inspects, stores or forwards a body, so ADR-0235
 * clause 6's metadata-only rule is satisfied by construction. A label the table does not know is
 * reported under its own name as UNCLASSIFIED — never distributed into a named category and never
 * dropped, because 8.4% of the review's bytes sat there and silently redistributing them would
 * inflate whichever category the guess favoured.
 *
 * ★★ THE LARGEST SLICE AT SESSION START IS INVISIBLE, AND IT IS REPORTED AS A RESIDUAL, NEVER
 * OMITTED (ADR-0516 D4). The harness's system prompt and tool definitions are sent to the API and
 * never written to the transcript — zero lines carry a tool schema. The only way to show them is
 * `first request's resident tokens − what the transcript accounts for before that request`, which
 * is why this fold REUSES `readTranscriptWindow` for the resident figure and derives no second copy
 * of what counts as resident: two definitions of that total is how two honest readings come to
 * disagree, and this arc exists partly because that already happened. When no first request can be
 * read, the residual is an ABSENCE with its reason, never a zero — a zero would say the harness
 * costs nothing.
 *
 * ★★★ MEASURED ON THIS MACHINE, 2026-09-05: `nested_memory` does not appear in any of the 40 newest
 * transcripts here, and the first user message carries no guidance either. On this harness version
 * `CLAUDE.md` / `MEMORY.md` travel INSIDE the residual — so a `project-guidance` slice of zero bytes
 * means "not labelled by this harness", never "no guidance was loaded". The render says so.
 *
 * WHAT THE BYTES ARE. The UTF-8 length of each block or attachment as the transcript serialised it —
 * `wc -c` on the record, ADR-0330 D1's reason: this repo carries no tokenizer, and a figure whose
 * measurement drifts with an estimator is not comparable across two readings. JSON wrapping inflates
 * every category by the same mechanism, so shares are honest; absolute bytes are an upper bound on
 * the text. Tokens appear in exactly one place, the residual, where they are read off a request's own
 * `usage` and the visible half is converted ONCE at the calibration ADR-0330 D1 records.
 *
 * WHAT IS DELIBERATELY NOT IN THE COMPOSITION. Records that are the harness's own bookkeeping about
 * the window rather than content sent to the model — the queue's enqueue/dequeue log, `last-prompt`,
 * `pr-link`, and their kin. They are reported beside the composition, with their kinds named, so a
 * reader can see what was set aside; counting them would double-count the prompt they log. And a
 * SIDECHAIN line belongs to a helper's window, not this one (ADR-0413 D2, permanent), so it is
 * excluded and the exclusion counted.
 *
 * WHAT THE COMPOSITION MEASURES. Everything that has ENTERED the window over its life — the
 * transcript is append-only and keeps what a compaction later dropped. It is therefore a composition
 * of the window's INTAKE, not of what is resident after a compaction; `residentTokens` next door is
 * the resident figure, and the two are read together.
 *
 * ★★★★ THERE ARE TWO CUTS HERE AND ONE READER (ADR-0524). The record-type cut above is the original
 * and is untouched — `storytree context`'s remedy line rests on it. Beside it, {@link
 * WindowComposition.toolSubjects} re-cuts the `tool-output` slice alone by SUBJECT: knowledge graph,
 * file reads, shell, other tools. It exists because knowledge-graph reads are NOT a category in the
 * record-type cut — they are inside `tool-output` — and the replay panel's composition bar has to
 * highlight the share of the window the traversal below it draws. The two cuts are taken in ONE pass
 * over ONE file: a second reader over the same transcript is how two honest readings come to
 * disagree, which is the failure this arc already exists to remove. `tool-subjects.ts` owns the
 * classification; this fold owns the tally, and the subject slices SUM to the `tool-output` slice.
 */
import fs from "node:fs";

import {
  isCountedObservation,
  readWindowOccupancySeries,
  type WindowSeriesArgs,
  type WindowSeriesRead,
} from "./context-windows.js";
import { classifyToolSubject, toolSubjectLabel, type ToolSubject } from "./tool-subjects.js";
import { readTranscriptWindow } from "./transcript-occupancy.js";

/**
 * The categories a window is split into. Each one is a fold over harness LABELS; the table that
 * maps a label to its category is {@link ATTACHMENT_CATEGORY} for attachments and the block
 * `type` switch in {@link classifyMessage} for messages.
 */
export type CompositionCategory =
  /** `tool_result` blocks — what the tools the session called handed back. */
  | "tool-output"
  /** `tool_use` blocks — the calls the session authored, payloads included. */
  | "tool-calls"
  /** The session's own prose to the user. */
  | "assistant-text"
  /**
   * Thinking blocks. READ THIS SLICE LOOSELY: whether a transcript carries them redacted or in full
   * is the harness version's call (the 2026-09-05 review saw them redacted; this machine records
   * them whole), and how much of a PRIOR turn's thinking the API keeps resident is its call, not the
   * transcript's. The bytes are what was recorded, which bounds what was resident from above.
   */
  | "assistant-thinking"
  /** The human's own words, and prompts they queued while the session worked. */
  | "human-prompt"
  /** A user-role message the harness authored (`isMeta`), not the human. */
  | "harness-message"
  /** `nested_memory` — `CLAUDE.md` and its kin, when this harness labels them. */
  | "project-guidance"
  /** Skill, agent, deferred-tool, MCP and permission listings. */
  | "harness-catalogue"
  /** Hook stdout/stderr and hook-supplied context. */
  | "hook-injection"
  /** Token-count, batching, silence, date and mode reminders. */
  | "harness-reminder"
  /** `edited_text_file` — snippets of files changed outside the session. */
  | "file-change-notice"
  /** A label this table does not know. Named in {@link WindowComposition.unclassifiedLabels}. */
  | "unclassified";

/**
 * The declared attachment vocabulary, as measured on this machine and in the review. A type absent
 * here lands in `unclassified` under its own name — adding a row is the whole remedy.
 */
const ATTACHMENT_CATEGORY = {
  nested_memory: "project-guidance",
  skill_listing: "harness-catalogue",
  agent_listing_delta: "harness-catalogue",
  deferred_tools_delta: "harness-catalogue",
  mcp_instructions_delta: "harness-catalogue",
  command_permissions: "harness-catalogue",
  hook_success: "hook-injection",
  hook_additional_context: "hook-injection",
  hook_non_blocking_error: "hook-injection",
  total_tokens_reminder: "harness-reminder",
  batching_reminder_sent: "harness-reminder",
  silent_turn_reminder: "harness-reminder",
  date_change: "harness-reminder",
  auto_mode: "harness-reminder",
  edited_text_file: "file-change-notice",
  queued_command: "human-prompt",
} satisfies Readonly<Record<string, CompositionCategory>>;

/** Is `label` one of the declared attachment types above? A lookup, so an unknown label is `undefined`. */
function attachmentCategory(label: string): CompositionCategory | undefined {
  return Object.hasOwn(ATTACHMENT_CATEGORY, label)
    ? ATTACHMENT_CATEGORY[label as keyof typeof ATTACHMENT_CATEGORY]
    : undefined;
}

/**
 * Characters per token for the ONE conversion this fold makes — the visible pre-request bytes,
 * subtracted from the first request's resident tokens to expose the residual. ADR-0330 D1's
 * calibration on this corpus's markdown; carried as a named constant so a reading states the
 * assumption it rests on rather than hiding it in arithmetic.
 */
export const CHARS_PER_TOKEN = 3.8;

export interface CompositionSlice {
  readonly category: CompositionCategory;
  /** UTF-8 bytes of every record in this category, as the transcript serialised them. */
  readonly bytes: number;
  /** Records (blocks or attachments) that contributed. */
  readonly records: number;
}

/**
 * One subject's share of the `tool-output` slice (ADR-0524's second cut).
 *
 * The slices SUM to the `tool-output` category's bytes exactly — this is a re-cut of that one slice,
 * never an additional quantity, so a bar drawing both cuts at once would double-count.
 */
export interface ToolSubjectSlice {
  readonly subject: ToolSubject;
  readonly bytes: number;
  /** `tool_result` blocks that contributed. */
  readonly records: number;
}

/** The harness floor — what was resident at the first request that no transcript line accounts for. */
export interface ResidualEstimate {
  /** `residentInputTokens` of the first counted request, straight from `readTranscriptWindow`. */
  readonly firstRequestResidentTokens: number;
  /** Composition bytes recorded BEFORE that request — the half the transcript can see. */
  readonly visibleBytesBeforeFirstRequest: number;
  /** Those bytes at {@link CHARS_PER_TOKEN} — the one estimate here, and it is named as one. */
  readonly visibleTokensEstimate: number;
  /** `firstRequestResidentTokens − visibleTokensEstimate`, floored at zero. */
  readonly residualTokens: number;
  readonly charsPerToken: number;
}

/** Why there is no residual. Each sends a reader somewhere different, so they are not merged. */
export type ResidualAbsence =
  /** The file could not be read at all — nothing below is a reading. */
  | "unreadable-file"
  /** The transcript was read and holds no counted model request to take a resident figure from. */
  | "no-readable-request";

export interface WindowComposition {
  readonly file: string;
  /** The window every usable line agreed on, or `undefined` — `readTranscriptWindow`'s own answer. */
  readonly windowId: string | undefined;
  /** Every category with bytes, largest first. Empty when nothing was classified. */
  readonly slices: readonly CompositionSlice[];
  /** The sum of {@link slices} — the denominator a share is read against. */
  readonly accountedBytes: number;
  /**
   * The `tool-output` slice re-cut by SUBJECT, largest first (ADR-0524). Sums to that slice's
   * bytes; empty exactly when the window recorded no tool output.
   */
  readonly toolSubjects: readonly ToolSubjectSlice[];
  /**
   * The tool NAMES behind the `other-tool` subject, so that residual is nameable rather than
   * anonymous — the same remedy `unclassifiedLabels` offers for an unknown attachment type.
   */
  readonly otherToolNames: readonly string[];
  /**
   * Knowledge-graph reads by the SURFACE they reached (`library-artifact`, `arc`, `adr`, …), bytes
   * descending.
   *
   * Carried because it is the one sub-breakdown of the knowledge-graph segment that the transcripts
   * support EXACTLY — it is a label, not a threshold. ADR-0524 D5's proposed sub-breakdown was by
   * PHASE, and that hypothesis was tested and did not hold; see
   * `docs/research/knowledge-graph-phase-hypothesis-2026-09-06.md`. Nothing draws this today.
   */
  readonly knowledgeSurfaces: readonly { readonly surface: string; readonly bytes: number; readonly records: number }[];
  /** The labels behind the `unclassified` slice, so the remedy (a table row) is nameable. */
  readonly unclassifiedLabels: readonly string[];
  /** Records set aside as the harness's bookkeeping rather than window content. */
  readonly bookkeeping: {
    readonly bytes: number;
    readonly records: number;
    readonly kinds: readonly string[];
  };
  /** Helper-window lines excluded (ADR-0413 D2). Reported, never silently dropped. */
  readonly sidechainLinesExcluded: number;
  /** Lines that were not JSON at all. Reported, never silently dropped. */
  readonly unparseableLines: number;
  /** Lines that were JSON but not a record (`null`, an array, a number). Reported, never dropped. */
  readonly nonRecordLines: number;
  /** The harness floor, or `null` exactly when {@link residualAbsence} is set. */
  readonly residual: ResidualEstimate | null;
  readonly residualAbsence: ResidualAbsence | null;
}

/** The categories a session cannot trim — they arrive whether it asks or not. */
export const MANDATORY_CATEGORIES: readonly CompositionCategory[] = [
  "project-guidance",
  "harness-catalogue",
  "hook-injection",
  "harness-reminder",
  "file-change-notice",
];

const CATEGORY_LABEL = {
  "tool-output": "tool output",
  "tool-calls": "tool calls the session authored",
  "assistant-text": "the session's own prose",
  "assistant-thinking": "thinking (as recorded — not all of it stays resident)",
  "human-prompt": "the human's own words",
  "harness-message": "harness-authored user messages",
  "project-guidance": "project guidance (CLAUDE.md, when labelled)",
  "harness-catalogue": "harness catalogues (skills, agents, tools, MCP)",
  "hook-injection": "hook injections",
  "harness-reminder": "harness reminders",
  "file-change-notice": "file-change notices",
  unclassified: "unclassified",
} satisfies Readonly<Record<CompositionCategory, string>>;

/** The plain-language name of a category, for any surface that renders a slice. */
export function categoryLabel(category: CompositionCategory): string {
  return CATEGORY_LABEL[category];
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function bytesOf(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value) ?? "");
}

/** A running tally per category, plus the labels that fell through the table. */
class Tally {
  readonly bytes = new Map<CompositionCategory, number>();
  readonly records = new Map<CompositionCategory, number>();
  readonly unclassifiedLabels = new Set<string>();
  total = 0;

  add(category: CompositionCategory, value: unknown): void {
    const size = bytesOf(value);
    this.bytes.set(category, (this.bytes.get(category) ?? 0) + size);
    this.records.set(category, (this.records.get(category) ?? 0) + 1);
    this.total += size;
  }

  addUnclassified(label: string, value: unknown): void {
    this.unclassifiedLabels.add(label);
    this.add("unclassified", value);
  }

  slices(): CompositionSlice[] {
    const out: CompositionSlice[] = [];
    for (const [category, bytes] of this.bytes) {
      out.push({ category, bytes, records: this.records.get(category) ?? 0 });
    }
    // Largest first; ties by label so a render is stable across runs.
    out.sort((a, b) => b.bytes - a.bytes || a.category.localeCompare(b.category));
    return out;
  }
}

/**
 * The SUBJECT tally, riding the same pass (ADR-0524).
 *
 * A `tool_result` names only its `tool_use_id`, so the subject comes from the CALL that produced it
 * — remembered here as the pass meets each `tool_use`. A result whose call was never seen lands
 * under `unattributed` rather than being distributed into a named subject: the same posture the
 * record-type cut takes with an unknown attachment label, and for the same reason, since silently
 * redistributing would inflate whichever subject the guess favoured.
 */
class SubjectTally {
  /**
   * `tool_use_id` → what that call was about. Filled as calls are met, read as results arrive.
   *
   * Keyed by `unknown` ON PURPOSE, so the LOOKUP needs no guard of its own: a non-string key simply
   * misses. That leaves exactly one guard, in {@link observeCall}, and makes it load-bearing —
   * without it a call with no id would be stored under `undefined` and the next result with no
   * `tool_use_id` would MATCH it, joining two unrelated malformed records. Two guards spread the
   * same rule across two places where neither could be shown to matter.
   */
  private readonly byCallId = new Map<unknown, { subject: ToolSubject; surface: string | null }>();
  private readonly bytes = new Map<ToolSubject, number>();
  private readonly records = new Map<ToolSubject, number>();
  private readonly surfaceBytes = new Map<string, number>();
  private readonly surfaceRecords = new Map<string, number>();
  private readonly otherToolNames = new Set<string>();

  /** Remember one `tool_use`'s subject against its id. */
  observeCall(block: Record<string, unknown>): void {
    // Narrowed straight to the map's own key type — no `string | null` intermediate. The `=== null`
    // step it replaces was an unkillable mutant: a nulled id and a missing one both end at the same
    // `return`, so the extra comparison could never take a different value.
    const id = block.id;
    if (typeof id !== "string") return;
    const name = typeof block.name === "string" ? block.name : "<unnamed>";
    const input = isPlainObject(block.input) ? block.input : {};
    const read = classifyToolSubject(name, input);
    if (read.subject === "other-tool") this.otherToolNames.add(name);
    this.byCallId.set(id, { subject: read.subject, surface: read.surface });
  }

  /** Charge one `tool_result`'s bytes to the subject of the call it answers. */
  observeResult(block: Record<string, unknown>): void {
    // No guard: the map holds string keys only, so a missing or non-string `tool_use_id` misses and
    // lands under `unattributed` — which is the same answer a result naming an UNKNOWN call gets.
    const known = this.byCallId.get(block.tool_use_id);
    const subject: ToolSubject = known?.subject ?? "unattributed";
    const size = bytesOf(block);
    this.bytes.set(subject, (this.bytes.get(subject) ?? 0) + size);
    this.records.set(subject, (this.records.get(subject) ?? 0) + 1);
    // ONE condition, not three. `classifyToolSubject` returns a surface for exactly one subject, so
    // `surface !== null` already implies `subject === "knowledge-graph"` — the mutation rung is what
    // showed the other two branches could never take a different value.
    const surface = known?.surface ?? null;
    if (surface !== null) {
      this.surfaceBytes.set(surface, (this.surfaceBytes.get(surface) ?? 0) + size);
      this.surfaceRecords.set(surface, (this.surfaceRecords.get(surface) ?? 0) + 1);
    }
  }

  slices(): ToolSubjectSlice[] {
    const out: ToolSubjectSlice[] = [];
    for (const [subject, bytes] of this.bytes) {
      out.push({ subject, bytes, records: this.records.get(subject) ?? 0 });
    }
    out.sort((a, b) => b.bytes - a.bytes || a.subject.localeCompare(b.subject));
    return out;
  }

  surfaces(): { surface: string; bytes: number; records: number }[] {
    const out: { surface: string; bytes: number; records: number }[] = [];
    for (const [surface, bytes] of this.surfaceBytes) {
      out.push({ surface, bytes, records: this.surfaceRecords.get(surface) ?? 0 });
    }
    out.sort((a, b) => b.bytes - a.bytes || a.surface.localeCompare(b.surface));
    return out;
  }

  names(): string[] {
    return [...this.otherToolNames].sort();
  }
}

function classifyAttachment(tally: Tally, attachment: unknown): void {
  if (!isPlainObject(attachment) || typeof attachment.type !== "string") {
    tally.addUnclassified("attachment:<untyped>", attachment);
    return;
  }
  const category = attachmentCategory(attachment.type);
  if (category === undefined) {
    tally.addUnclassified(`attachment:${attachment.type}`, attachment);
    return;
  }
  tally.add(category, attachment);
}

function classifyMessage(tally: Tally, subjects: SubjectTally, record: Record<string, unknown>): void {
  const message = isPlainObject(record.message) ? record.message : undefined;
  const content = message?.content;
  const role = record.type;

  // A user message may be one plain string — the human's turn, or the harness's when `isMeta`.
  if (typeof content === "string") {
    tally.add(record.isMeta === true ? "harness-message" : "human-prompt", content);
    return;
  }
  if (!Array.isArray(content)) return;

  for (const block of content) {
    const kind = isPlainObject(block) && typeof block.type === "string" ? block.type : "<untyped>";
    switch (kind) {
      case "tool_result":
        tally.add("tool-output", block);
        // The SECOND cut rides the same block (ADR-0524): the record type is `tool-output` and the
        // subject comes from the call this result answers. No `isPlainObject` guard — reaching this
        // case means `kind` came off `block.type`, which already proved it.
        subjects.observeResult(block);
        break;
      case "tool_use":
        tally.add("tool-calls", block);
        // Remembered, never tallied here — a call's own bytes belong to `tool-calls`. What this
        // records is WHAT IT WAS ABOUT, so the result arriving later can be charged to a subject.
        subjects.observeCall(block);
        break;
      case "thinking":
      case "redacted_thinking":
        tally.add("assistant-thinking", block);
        break;
      case "text":
        if (role === "assistant") tally.add("assistant-text", block);
        else tally.add(record.isMeta === true ? "harness-message" : "human-prompt", block);
        break;
      default:
        tally.addUnclassified(`block:${kind}`, block);
    }
  }
}

/**
 * What one window is made of. Never throws: an unreadable file is an empty composition carrying
 * `residualAbsence: "unreadable-file"`, and an unusable line within a good file is counted, not
 * fatal — the same posture every reader on this seam keeps.
 */
export function readWindowComposition(file: string): WindowComposition {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return {
      file,
      windowId: undefined,
      slices: [],
      accountedBytes: 0,
      toolSubjects: [],
      otherToolNames: [],
      knowledgeSurfaces: [],
      unclassifiedLabels: [],
      bookkeeping: { bytes: 0, records: 0, kinds: [] },
      sidechainLinesExcluded: 0,
      unparseableLines: 0,
      nonRecordLines: 0,
      residual: null,
      residualAbsence: "unreadable-file",
    };
  }

  // The resident figure is `readTranscriptWindow`'s and nobody else's — the first request this
  // reader COUNTS (a `<synthetic>` opener carries an all-zero usage and would read as a free floor).
  const occupancy = readTranscriptWindow(file);
  const firstRequest = occupancy.observations.find(isCountedObservation);
  const firstRequestId: string | null = firstRequest?.requestId ?? null;

  const tally = new Tally();
  const subjects = new SubjectTally();
  let bookkeepingBytes = 0;
  let bookkeepingRecords = 0;
  const bookkeepingKinds = new Set<string>();
  let sidechainLinesExcluded = 0;
  let unparseableLines = 0;
  let nonRecordLines = 0;
  // The residual's visible half: the composition total as it stood when the first counted request's
  // line was reached. Tracked as "the total at the last line before it closed" so that a window whose
  // first request is never reached (nothing to close it) reports everything it saw — the honest
  // direction, since more visible bytes can only shrink the residual — without a second code path.
  let visibleClosed = false;
  let visibleBytesBeforeFirstRequest = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    // Two different defects, counted apart: a line that is not JSON, and a line that is JSON but not
    // a record (`null`, `[1,2]`, `7`). Neither has anything to classify; a reader repairing a
    // transcript wants to know which it is looking at.
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      unparseableLines++;
      continue;
    }
    if (!isPlainObject(parsed)) {
      nonRecordLines++;
      continue;
    }

    if (parsed.isSidechain === true) {
      sidechainLinesExcluded++;
      continue;
    }

    const kind = typeof parsed.type === "string" ? parsed.type : "<untyped>";

    // The residual's visible half closes at the first counted request: everything the transcript
    // recorded up to that line is what the harness had to send alongside its own preamble.
    if (kind === "assistant" && isPlainObject(parsed.message) && parsed.message.id === firstRequestId) {
      visibleClosed = true;
    }

    switch (kind) {
      case "attachment":
        classifyAttachment(tally, parsed.attachment);
        break;
      case "user":
      case "assistant":
        classifyMessage(tally, subjects, parsed);
        break;
      default:
        bookkeepingBytes += bytesOf(parsed);
        bookkeepingRecords++;
        bookkeepingKinds.add(kind);
    }

    if (!visibleClosed) visibleBytesBeforeFirstRequest = tally.total;
  }

  let residual: ResidualEstimate | null = null;
  let residualAbsence: ResidualAbsence | null = null;
  if (firstRequest === undefined) {
    residualAbsence = "no-readable-request";
  } else {
    const visibleTokensEstimate = Math.ceil(visibleBytesBeforeFirstRequest / CHARS_PER_TOKEN);
    residual = {
      firstRequestResidentTokens: firstRequest.residentInputTokens,
      visibleBytesBeforeFirstRequest,
      visibleTokensEstimate,
      residualTokens: Math.max(0, firstRequest.residentInputTokens - visibleTokensEstimate),
      charsPerToken: CHARS_PER_TOKEN,
    };
  }

  return {
    file,
    windowId: occupancy.windowId,
    slices: tally.slices(),
    accountedBytes: tally.total,
    toolSubjects: subjects.slices(),
    otherToolNames: subjects.names(),
    knowledgeSurfaces: subjects.surfaces(),
    unclassifiedLabels: [...tally.unclassifiedLabels].sort(),
    bookkeeping: {
      bytes: bookkeepingBytes,
      records: bookkeepingRecords,
      kinds: [...bookkeepingKinds].sort(),
    },
    sidechainLinesExcluded,
    unparseableLines,
    nonRecordLines,
    residual,
    residualAbsence,
  };
}

// ── THE BAR (ADR-0524 D1/D2) ─────────────────────────────────────────────────────────────────────

/**
 * One segment of the replay panel's composition bar.
 *
 * The keys are the record-type categories with `tool-output` REPLACED by its subject slices, plus
 * the harness floor. That substitution is the whole point: `tool-output` is 56% of a window and says
 * nothing, while its four subjects say which 56%.
 */
export type CompositionSegmentKey =
  | Exclude<CompositionCategory, "tool-output">
  | ToolSubject
  | "harness-floor";

export interface CompositionSegment {
  readonly key: CompositionSegmentKey;
  readonly label: string;
  /** The segment's width, in estimated tokens — the ONE unit the bar is drawn in. */
  readonly tokens: number;
  /** The measured bytes behind {@link tokens}, or `null` for the harness floor, which has none. */
  readonly bytes: number | null;
  /** Records that contributed, or `null` for the harness floor, which is a subtraction. */
  readonly records: number | null;
}

/**
 * The composition bar: the window as one row of segments summing to {@link totalTokens}.
 *
 * ★ ONE UNIT, AND IT IS AN ESTIMATE EXCEPT IN ONE PLACE. The categories are measured in BYTES and
 * converted at {@link CHARS_PER_TOKEN}; the harness floor is read off a request's own `usage` and is
 * the only exact figure here. They are summed because a bar cannot draw two units, and the
 * conversion is named on the result so a reader can see what the width rests on. This is ADR-0330
 * D1's calibration, the same one `readWindowComposition`'s residual already uses — not a second
 * estimator, which is how two honest readings come to disagree.
 *
 * ★★ THE BAR IS THE WINDOW'S INTAKE, NOT WHAT IS RESIDENT NOW. The categories cover everything that
 * ever entered the window (the transcript is append-only and keeps what a compaction dropped); the
 * floor is what was resident at the FIRST request. A surface drawing this must not label it
 * "resident" — `residentInputTokens` next door is that quantity, and conflating them is exactly the
 * duplication ADR-0524 removed the vertical bar to avoid.
 *
 * ★★★ THE ORDER IS DECLARED, NEVER SIZE-SORTED. A size-sorted bar reshuffles between windows, which
 * destroys the one reading a bar is good at: comparing two of them. The knowledge graph leads
 * because it is what the traversal below the bar draws (ADR-0524 D2) and because leading with it is
 * what makes its size legible at a glance. The harness floor is last: it is the largest fixed block
 * and trailing it keeps the variable part left-aligned across windows.
 *
 * ★★★★ A ZERO SEGMENT IS OMITTED, AND THAT IS NOT THE SAME AS HIDING IT. A category with no bytes
 * contributed nothing to this window; drawing a zero-width segment would add a name to the bar that
 * answers nothing. What is never omitted is the harness FLOOR — when it cannot be read it is absent
 * with its reason ({@link CompositionBar.residualAbsence}), never zero, because a zero would say the
 * harness's preamble is free.
 */
export interface CompositionBar {
  /** Non-empty segments in the declared order. */
  readonly segments: readonly CompositionSegment[];
  /** The sum of {@link segments} — the bar's full width, and the denominator every share reads against. */
  readonly totalTokens: number;
  /** The harness floor, or `null` exactly when {@link residualAbsence} is set. */
  readonly residualTokens: number | null;
  readonly residualAbsence: ResidualAbsence | null;
  readonly charsPerToken: number;
}

/** The declared draw order. Exported so a render cannot invent its own and drift from the reasoning
 * above; every key appears exactly once, which `context-composition.test.ts` pins. */
export const COMPOSITION_SEGMENT_ORDER: readonly CompositionSegmentKey[] = [
  // Tool output, re-cut by subject — the knowledge graph first (ADR-0524 D2).
  "knowledge-graph",
  "file-read",
  "shell",
  "other-tool",
  "unattributed",
  // What the session itself put in the window.
  "tool-calls",
  "assistant-thinking",
  "assistant-text",
  "human-prompt",
  // What arrived whether the session asked or not.
  "harness-message",
  "project-guidance",
  "harness-catalogue",
  "hook-injection",
  "harness-reminder",
  "file-change-notice",
  "unclassified",
  // The floor, last.
  "harness-floor",
];

const HARNESS_FLOOR_LABEL = "harness floor (system prompt and tool definitions)";

/** The plain-language name of a segment, whichever of the three vocabularies its key came from. */
export function segmentLabel(key: CompositionSegmentKey): string {
  if (key === "harness-floor") return HARNESS_FLOOR_LABEL;
  if (
    key === "knowledge-graph" ||
    key === "file-read" ||
    key === "shell" ||
    key === "other-tool" ||
    key === "unattributed"
  ) {
    return toolSubjectLabel(key);
  }
  return categoryLabel(key);
}

/**
 * Assemble one window's composition bar.
 *
 * Pure over a {@link WindowComposition}: it reads no file and takes no second reading, so the bar
 * and `storytree context` can never disagree about what this window held.
 */
export function buildCompositionBar(composition: WindowComposition): CompositionBar {
  const tokensOf = (bytes: number): number => Math.round(bytes / CHARS_PER_TOKEN);

  // Keyed by plain string so `tool-output` needs no special case: it is simply absent from
  // {@link COMPOSITION_SEGMENT_ORDER}, so nothing ever looks it up. The ORDER is the filter, and one
  // filter is better than two — a `continue` here was a branch no test could distinguish, because
  // skipping the entry and never reading it produce the same bar.
  const byKey = new Map<string, { bytes: number; records: number }>();
  for (const slice of composition.slices) {
    byKey.set(slice.category, { bytes: slice.bytes, records: slice.records });
  }
  for (const slice of composition.toolSubjects) {
    byKey.set(slice.subject, { bytes: slice.bytes, records: slice.records });
  }

  const segments: CompositionSegment[] = [];
  for (const key of COMPOSITION_SEGMENT_ORDER) {
    if (key === "harness-floor") {
      const floor = composition.residual?.residualTokens ?? 0;
      if (floor > 0) {
        segments.push({ key, label: HARNESS_FLOOR_LABEL, tokens: floor, bytes: null, records: null });
      }
      continue;
    }
    // `=== 0` is not tested for: every tallied record contributes at least the two bytes of an empty
    // JSON string, so a present category can never measure zero. Absence is the only empty.
    const measured = byKey.get(key);
    if (measured === undefined) continue;
    segments.push({
      key,
      label: segmentLabel(key),
      tokens: tokensOf(measured.bytes),
      bytes: measured.bytes,
      records: measured.records,
    });
  }

  return {
    segments,
    totalTokens: segments.reduce((sum, segment) => sum + segment.tokens, 0),
    residualTokens: composition.residual?.residualTokens ?? null,
    residualAbsence: composition.residualAbsence,
    charsPerToken: CHARS_PER_TOKEN,
  };
}

// ── THE WIRE (ADR-0524 D1) ───────────────────────────────────────────────────────────────────────

/**
 * The composition as it crosses an HTTP boundary — flat, JSON-safe, and derived HERE rather than in
 * a route.
 *
 * ⚠ IT LIVES IN THE PACKAGE BECAUSE TWO SURFACES SERVE IT. The studio's `/api/context-windows` and
 * the desktop backend's copy of the same route are held to byte-identical answers by
 * `check:mirror-conformance`, and a payload assembled independently in each is exactly how they come
 * to disagree — which that check caught on this increment's first gate run. One function, two
 * callers, no room for drift.
 */
export interface WindowCompositionWire {
  readonly segments: readonly {
    readonly key: CompositionSegmentKey;
    readonly label: string;
    readonly tokens: number;
    readonly bytes: number | null;
    readonly records: number | null;
  }[];
  readonly totalTokens: number;
  readonly residualTokens: number | null;
  readonly residualAbsence: ResidualAbsence | null;
  readonly charsPerToken: number;
  readonly otherToolNames: readonly string[];
  readonly unclassifiedLabels: readonly string[];
  readonly knowledgeSurfaces: readonly {
    readonly surface: string;
    readonly bytes: number;
    readonly records: number;
  }[];
}

/** One window's occupancy series and its composition, from ONE resolution of the window. */
export type WindowSeriesWithComposition = WindowSeriesRead & {
  readonly composition: WindowCompositionWire | null;
};

/**
 * The replay panel's whole read: how full the window got, and what it was made of.
 *
 * ★ ONE WINDOW RESOLUTION, NOT TWO. `readWindowOccupancySeries` resolves a window id to a transcript
 * by walking every transcript on the machine — the expensive half. The composition then reuses the
 * file that walk already named, so serving both costs one walk. A second route for the composition
 * would have paid the walk twice AND given two readers of one transcript a way to disagree, which is
 * the failure `context-window-composition-arc` exists to remove.
 *
 * ★★ `composition: null` WHEN NO TRANSCRIPT WAS MATCHED, never an empty bar. There is then nothing
 * to compose, and a bar of zero-width segments would assert an empty window — a claim about the
 * session rather than about the observation, and the same posture the occupancy half takes with its
 * own `absence`.
 */
export function readWindowSeriesWithComposition(args: WindowSeriesArgs): WindowSeriesWithComposition {
  const series = readWindowOccupancySeries(args);
  const file = series.scan.file;
  if (file === null) return { ...series, composition: null };

  const composition = readWindowComposition(file);
  const bar = buildCompositionBar(composition);
  return {
    ...series,
    composition: {
      segments: bar.segments.map((segment) => ({
        key: segment.key,
        label: segment.label,
        tokens: segment.tokens,
        bytes: segment.bytes,
        records: segment.records,
      })),
      totalTokens: bar.totalTokens,
      residualTokens: bar.residualTokens,
      residualAbsence: bar.residualAbsence,
      charsPerToken: bar.charsPerToken,
      otherToolNames: [...composition.otherToolNames],
      unclassifiedLabels: [...composition.unclassifiedLabels],
      knowledgeSurfaces: composition.knowledgeSurfaces.map((row) => ({ ...row })),
    },
  };
}
