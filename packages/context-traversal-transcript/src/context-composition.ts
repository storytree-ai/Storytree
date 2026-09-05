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
 */
import fs from "node:fs";

import { isCountedObservation } from "./context-windows.js";
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
  /** Lines that were not JSON. Reported, never silently dropped. */
  readonly unparseableLines: number;
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

function classifyMessage(tally: Tally, record: Record<string, unknown>): void {
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
        break;
      case "tool_use":
        tally.add("tool-calls", block);
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
      unclassifiedLabels: [],
      bookkeeping: { bytes: 0, records: 0, kinds: [] },
      sidechainLinesExcluded: 0,
      unparseableLines: 0,
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
  let bookkeepingBytes = 0;
  let bookkeepingRecords = 0;
  const bookkeepingKinds = new Set<string>();
  let sidechainLinesExcluded = 0;
  let unparseableLines = 0;
  // The residual's visible half: the composition total as it stood when the first counted request's
  // line was reached. Tracked as "the total at the last line before it closed" so that a window whose
  // first request is never reached (nothing to close it) reports everything it saw — the honest
  // direction, since more visible bytes can only shrink the residual — without a second code path.
  let visibleClosed = false;
  let visibleBytesBeforeFirstRequest = 0;

  for (const line of raw.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    // A line that is not JSON and a line that is JSON but not a record (`null`, `[1,2]`, `7`) are
    // the same defect to this fold — nothing to classify — so they share one count and one path.
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      parsed = undefined;
    }
    if (!isPlainObject(parsed)) {
      unparseableLines++;
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
        classifyMessage(tally, parsed);
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
    unclassifiedLabels: [...tally.unclassifiedLabels].sort(),
    bookkeeping: {
      bytes: bookkeepingBytes,
      records: bookkeepingRecords,
      kinds: [...bookkeepingKinds].sort(),
    },
    sidechainLinesExcluded,
    unparseableLines,
    residual,
    residualAbsence,
  };
}
