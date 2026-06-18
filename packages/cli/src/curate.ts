import { randomUUID } from "node:crypto";

import { runSdkCurator } from "@storytree/agent";
import type { SdkCuratorArgs, SdkCuratorResult } from "@storytree/agent";
import type { AdrMeta, Store, StoredDoc } from "@storytree/core";
import { InMemoryStore } from "@storytree/core";
import { upcastAndValidate } from "@storytree/library";
import type { Comment, CommentAnchor } from "@storytree/store";
import { loadCorpus } from "@storytree/store";

import { renderAgentPrompt } from "./agents.js";

/**
 * The curation pass that runs at the END of a green story build (ADR-0065): a librarian-curator,
 * scoped to the story nodes just built, judges the open-questions / proposals in that neighbourhood
 * and CLEANS UP — it auto-retires a clearly-overtaken open-question (with a recorded rationale),
 * raises or reframes one, raises/edits a proposal, and on any OTHER artifact kind it can only
 * COMMENT + ESCALATE, never silently edit. This is the inverse of ADR-0032's graduation loop
 * (pruning open-questions instead of growing them), and like it the JUDGMENT is the agent's
 * intelligence — never a deterministic scan ("graduation is intelligence, not arithmetic").
 *
 * Two halves, split for honesty + offline-testability (mirrors the leaf's scripted/live split):
 *   - the {@link CuratorRunner} produces structured {@link CurationAction}s (a scripted runner here;
 *     the live SDK-spawned librarian-curator lands in a follow-up). The runner only JUDGES.
 *   - {@link enactCuration} APPLIES the actions, kind-fenced SPINE-SIDE: the runner can ask to
 *     retire any id, but enactment verifies the target really is an open-question (resp. a proposal)
 *     before any write, and a write to any OTHER kind has no path at all. So the fence holds even if
 *     the agent misbehaves — judgment is the leaf's, the wall is the spine's (ADR-0020 posture).
 */

/** The library kinds the curator may WRITE. Every other kind is read + comment + escalate only. */
export const WRITABLE_KINDS = { openQuestion: "open-question", proposal: "proposal" } as const;

/** The event/comment actor a curator write is attributed to. */
export const CURATOR_ACTOR = "librarian-curator";

/**
 * One intent the curator emits. The union is deliberately kind-specific: there is NO
 * `edit-definition` / `retire-guardrail` variant, so the authority table (open-question +
 * proposal writable; everything else comment/escalate only) is encoded in the type itself, and
 * {@link enactCuration} additionally verifies the live target kind before mutating.
 */
export type CurationAction =
  | { type: "retire-open-question"; id: string; reason: string; supersededBy?: string }
  | { type: "raise-open-question"; doc: Record<string, unknown> }
  | { type: "reframe-open-question"; id: string; set: Record<string, unknown> }
  | { type: "create-proposal"; doc: Record<string, unknown> }
  | { type: "edit-proposal"; id: string; set: Record<string, unknown> }
  | { type: "comment"; artifactId: string; body: string }
  | { type: "escalate"; artifactId: string; body: string };

/**
 * What the curator judges over (ADR-0065 scope = the story nodes being iterated). The runner is
 * handed the built story's id + node ids + deciding ADRs, the open-questions / proposals already
 * loaded from the live store, and the parsed ADR metas — enough to work out which artifacts are
 * relevant and whether any open-question is overtaken, without roaming the whole corpus.
 */
export interface CurationContext {
  storyId: string;
  nodeIds: string[];
  decisions: number[];
  openQuestions: StoredDoc[];
  proposals: StoredDoc[];
  adrs: AdrMeta[];
}

/** The judging half: given the story neighbourhood, return the curation intents (no writes). */
export interface CuratorRunner {
  run(ctx: CurationContext): Promise<CurationAction[]>;
}

/**
 * A deterministic {@link CuratorRunner} for the offline/dry-run path and unit tests: it returns a
 * fixed action list (or one computed from the context), with NO model call — the analogue of the
 * scripted leaf the dry-run gate uses. The live SDK-spawned librarian-curator is the follow-up.
 */
export class ScriptedCuratorRunner implements CuratorRunner {
  readonly #actions: CurationAction[] | ((ctx: CurationContext) => CurationAction[]);
  constructor(actions: CurationAction[] | ((ctx: CurationContext) => CurationAction[]) = []) {
    this.#actions = actions;
  }
  async run(ctx: CurationContext): Promise<CurationAction[]> {
    return typeof this.#actions === "function" ? this.#actions(ctx) : this.#actions;
  }
}

/** The comment surface the curator writes through (satisfied by `PgCommentStore`; faked in tests). */
export interface CommentSink {
  create(comment: Comment, actor?: string): Promise<Comment>;
}

export interface EnactDeps {
  store: Store;
  /** The live comment store when `--pg`; null offline — comments/escalations then record as report lines only. */
  comments?: CommentSink | null;
  /** Event/comment actor; defaults to {@link CURATOR_ACTOR}. */
  actor?: string;
  /** Clock seam for comment timestamps/ids (tests inject a fixed clock). */
  now?: () => Date;
}

/** The outcome of enacting a curator's intents — what landed, what was refused, and report lines. */
export interface CurationOutcome {
  enacted: string[];
  refused: string[];
  /** Comments + escalations recorded only in the report (no live comment store). */
  unsent: string[];
  /** Escalations surfaced for the owner (the build report repeats these prominently). */
  escalations: string[];
  /** Human-readable report lines for the build header. */
  lines: string[];
}

/** A topic-level anchor (a comment on the whole artifact, not a section/quote). */
function topicAnchor(): CommentAnchor {
  return {
    kind: "topic",
    headingSlug: null,
    headingText: null,
    quote: null,
    prefix: null,
    suffix: null,
    startOffset: null,
    color: null,
  };
}

/**
 * Apply a curator's {@link CurationAction}s to the store, KIND-FENCED. Each write verifies the live
 * target kind first (retire / reframe → open-question; edit → proposal; raise/create refuse an
 * existing id, edit-first-curation); a mismatch is REFUSED, never forced. Comments + escalations go
 * to the live comment store when present, else they are recorded as report lines. Never throws on a
 * single bad action — it collects refusals so the enclosing build is never failed by curation.
 */
export async function enactCuration(
  deps: EnactDeps,
  actions: readonly CurationAction[],
): Promise<CurationOutcome> {
  const actor = deps.actor ?? CURATOR_ACTOR;
  const now = deps.now ?? (() => new Date());
  const out: CurationOutcome = { enacted: [], refused: [], unsent: [], escalations: [], lines: [] };

  const isKind = async (id: string, kind: string): Promise<StoredDoc | null> => {
    const doc = await deps.store.getDoc(id);
    return doc !== null && doc.kind === kind ? doc : null;
  };

  const writeComment = async (artifactId: string, body: string, prefix: string): Promise<boolean> => {
    if (deps.comments === undefined || deps.comments === null) return false;
    const comment: Comment = {
      id: randomUUID(),
      topicKind: "asset",
      topicId: artifactId,
      anchor: topicAnchor(),
      body: `${prefix} ${body}`,
      author: actor,
      createdAt: now().toISOString(),
      resolved: false,
      resolvedAt: null,
    };
    await deps.comments.create(comment, actor);
    return true;
  };

  for (const action of actions) {
    try {
      switch (action.type) {
        case "retire-open-question": {
          const existing = await isKind(action.id, WRITABLE_KINDS.openQuestion);
          if (existing === null) {
            out.refused.push(
              `retire ${action.id}: not an open-question (absent or a different kind) — the curator may only retire open-questions`,
            );
            break;
          }
          await deps.store.deleteDoc(action.id, {
            actor,
            reason: action.reason,
            ...(action.supersededBy !== undefined ? { supersededBy: action.supersededBy } : {}),
          });
          out.enacted.push(`retired open-question ${action.id} — ${action.reason}`);
          break;
        }
        case "raise-open-question": {
          const result = await createDoc(deps.store, action.doc, WRITABLE_KINDS.openQuestion, actor);
          record(out, result, "raised open-question");
          break;
        }
        case "reframe-open-question": {
          const result = await patchDoc(
            deps.store,
            action.id,
            action.set,
            WRITABLE_KINDS.openQuestion,
            actor,
          );
          record(out, result, "reframed open-question");
          break;
        }
        case "create-proposal": {
          const result = await createDoc(deps.store, action.doc, WRITABLE_KINDS.proposal, actor);
          record(out, result, "created proposal");
          break;
        }
        case "edit-proposal": {
          const result = await patchDoc(deps.store, action.id, action.set, WRITABLE_KINDS.proposal, actor);
          record(out, result, "edited proposal");
          break;
        }
        case "comment": {
          const sent = await writeComment(action.artifactId, action.body, "[curator]");
          if (sent) out.enacted.push(`commented on ${action.artifactId}`);
          else out.unsent.push(`comment on ${action.artifactId}: ${action.body}`);
          break;
        }
        case "escalate": {
          out.escalations.push(`${action.artifactId}: ${action.body}`);
          const sent = await writeComment(action.artifactId, action.body, "[curator · ESCALATION]");
          out.enacted.push(
            `escalated ${action.artifactId}${sent ? "" : " (comment store offline — report-only)"}`,
          );
          break;
        }
      }
    } catch (e) {
      out.refused.push(`${action.type} failed: ${(e as Error).message}`);
    }
  }

  out.lines.push(...summaryLines(out));
  return out;
}

type DocResult = { ok: true; id: string } | { ok: false; reason: string };

/** Create a new writable-kind doc, refusing an existing id (edit-first-curation) and validating it. */
async function createDoc(
  store: Store,
  doc: Record<string, unknown>,
  kind: string,
  actor: string,
): Promise<DocResult> {
  const id = typeof doc.id === "string" ? doc.id : "";
  if (id === "") return { ok: false, reason: "doc has no id" };
  if ((doc.kind ?? kind) !== kind) {
    return { ok: false, reason: `kind must be "${kind}" (got "${String(doc.kind)}")` };
  }
  if (await store.getDoc(id)) {
    return { ok: false, reason: `"${id}" already exists — reframe/edit it, don't recreate it` };
  }
  let valid: unknown;
  try {
    valid = upcastAndValidate({ ...doc, kind });
  } catch (e) {
    return { ok: false, reason: `invalid doc: ${(e as Error).message}` };
  }
  await store.upsertDoc({ id, kind, doc: valid, actor });
  return { ok: true, id };
}

/** Patch an existing doc, verifying it IS the expected writable kind first (the kind fence). */
async function patchDoc(
  store: Store,
  id: string,
  set: Record<string, unknown>,
  kind: string,
  actor: string,
): Promise<DocResult> {
  const existing = await store.getDoc(id);
  if (existing === null) return { ok: false, reason: `"${id}" does not exist` };
  if (existing.kind !== kind) {
    return {
      ok: false,
      reason: `"${id}" is a ${existing.kind}, not a ${kind} — the curator may not edit it (comment + escalate instead)`,
    };
  }
  const base: Record<string, unknown> =
    typeof existing.doc === "object" && existing.doc !== null
      ? { ...(existing.doc as Record<string, unknown>) }
      : {};
  let valid: unknown;
  try {
    valid = upcastAndValidate({ ...base, ...set, kind });
  } catch (e) {
    return { ok: false, reason: `edit would make "${id}" invalid: ${(e as Error).message}` };
  }
  await store.upsertDoc({ id, kind, doc: valid, actor });
  return { ok: true, id };
}

function record(out: CurationOutcome, result: DocResult, verb: string): void {
  if (result.ok) out.enacted.push(`${verb} ${result.id}`);
  else out.refused.push(`${verb}: ${result.reason}`);
}

/**
 * Run the whole curation pass and return its build-header report lines — NEVER throwing (curation
 * is advisory and must never fail the enclosing build, ADR-0067). It loads the open-questions +
 * proposals from the library store, assembles the {@link CurationContext} for the story nodes built,
 * lets the {@link CuratorRunner} judge, and enacts the result kind-fenced. A null `library` means
 * the live curator is not wired for this run (e.g. an offline dry-run with no store injected) — it
 * reports a one-line deferral and does nothing.
 */
export interface CurationPassInput {
  runner: CuratorRunner;
  /** The library store to read OQs/proposals from + enact against; null = deferred (nothing to run). */
  library: Store | null;
  comments?: CommentSink | null;
  context: { storyId: string; nodeIds: string[]; decisions: number[]; adrs: AdrMeta[] };
  actor?: string;
  now?: () => Date;
}

export async function runCurationPass(input: CurationPassInput): Promise<string[]> {
  if (input.library === null) {
    return [
      "curation:    deferred — the live librarian-curator runs on --live/--real (ADR-0067 follow-up)",
    ];
  }
  try {
    const library = input.library;
    const [openQuestions, proposals] = await Promise.all([
      library.queryDocs({ kind: WRITABLE_KINDS.openQuestion }),
      library.queryDocs({ kind: WRITABLE_KINDS.proposal }),
    ]);
    const ctx: CurationContext = {
      storyId: input.context.storyId,
      nodeIds: input.context.nodeIds,
      decisions: input.context.decisions,
      openQuestions,
      proposals,
      adrs: input.context.adrs,
    };
    const actions = await input.runner.run(ctx);
    const outcome = await enactCuration(
      {
        store: library,
        comments: input.comments ?? null,
        ...(input.actor !== undefined ? { actor: input.actor } : {}),
        ...(input.now !== undefined ? { now: input.now } : {}),
      },
      actions,
    );
    return outcome.lines;
  } catch (e) {
    return [
      `curation:    skipped — ${(e as Error).message} (best-effort; the build is unaffected, ADR-0067)`,
    ];
  }
}

// ----------------------------------------------------------------------------------------------
// The live SDK-spawned librarian-curator (ADR-0067): renders the agent, serializes the
// neighbourhood, runs one read-only SDK session, and parses its structured output into intents.
// The judgment is the agent's; enactment + the kind-fence stay the spine's (enactCuration above).
// ----------------------------------------------------------------------------------------------

/** The Library agent rendered as the curator's system prompt (agent-kind = seed-canonical, ADR-0055). */
export const CURATOR_AGENT_ID = "librarian-curator";

/**
 * The structured-output contract appended to the rendered agent body — the curator emits ONLY a
 * JSON array of intents (no write tools exist), and the spine enacts them kind-fenced. The retire
 * discipline (confident-only, with a cited reason) and the write fence (OQ + proposal only) are
 * stated here so the prompt and {@link enactCuration} agree.
 */
const CURATOR_OUTPUT_CONTRACT = [
  "## How you run (the post-build curation pass)",
  "",
  "You are spawned once, after a story's build goes green, to clean up the open-questions and",
  "proposals connected to that story. The user message gives you the neighbourhood: the story's",
  "nodes, its deciding ADRs (with current status), and the open-questions + proposals around it.",
  "Judge ONLY that neighbourhood.",
  "",
  "Emit your decisions as a SINGLE fenced ```json block containing an array of action objects, and",
  "NOTHING else (no prose before or after). Each object is one of:",
  '  { "type": "retire-open-question", "id": "<oq-id>", "reason": "<why it is clearly overtaken — cite what landed>", "supersededBy": "<doc:decisions/NNNN-... | optional>" }',
  '  { "type": "reframe-open-question", "id": "<oq-id>", "set": { "<field>": "<new value>" } }',
  '  { "type": "raise-open-question", "doc": { "id": "...", "kind": "open-question", "title": "...", "description": "...", "stakes": "...", "statement": "...", "context": "...", "options": "...", "createdAt": "<iso>", "updatedAt": "<iso>" } }',
  '  { "type": "create-proposal", "doc": { "id": "...", "kind": "proposal", "title": "...", "description": "...", "summary": "...", "motivation": "...", "change": "...", "scope": "...", "migration": "...", "readiness": "...", "createdAt": "<iso>", "updatedAt": "<iso>" } }',
  '  { "type": "edit-proposal", "id": "<id>", "set": { "<field>": "<new value>" } }',
  '  { "type": "comment", "artifactId": "<id>", "body": "<observation>" }',
  '  { "type": "escalate", "artifactId": "<id>", "body": "<discrepancy the owner should decide>" }',
  "",
  "Rules:",
  "- RETIRE only an open-question you are CONFIDENT is overtaken — its blocking premise has been",
  "  settled by a landed decision. Give a concrete reason naming what overtook it. When unsure,",
  "  REFRAME or COMMENT instead; never retire on a hunch.",
  "- You may WRITE only open-question and proposal artifacts. Any concern about a definition /",
  "  principle / guardrail / techstack / process / agent is a COMMENT, and an ESCALATE if it needs an",
  "  owner decision — never an edit.",
  "- If nothing needs doing, emit an empty array: []",
].join("\n");

/** Compose the curator system prompt: the rendered Library agent body + the output contract. */
export function composeCuratorSystemPrompt(agentBody: string): string {
  return `${agentBody.trim()}\n\n${CURATOR_OUTPUT_CONTRACT}`;
}

/**
 * Render the `librarian-curator` system prompt from the Library seed (offline, agent-kind is
 * seed-canonical — ADR-0055), mirroring the leaf's renderLeafPhasePrompts. Fail-soft: a render
 * problem returns `{ ok: false, reason }` so the caller can skip curation with a line, never throw.
 */
export async function renderCuratorPrompt(): Promise<
  { ok: true; systemPrompt: string } | { ok: false; reason: string }
> {
  try {
    const store = new InMemoryStore();
    await loadCorpus(store);
    const res = await renderAgentPrompt(store, CURATOR_AGENT_ID);
    if (!res.ok) return { ok: false, reason: res.reason };
    if (res.agent.missingRefs.length > 0) {
      return { ok: false, reason: `dangling refs: ${res.agent.missingRefs.join(", ")}` };
    }
    return { ok: true, systemPrompt: composeCuratorSystemPrompt(res.agent.prompt) };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

function bodyField(doc: unknown, key: string): string {
  if (typeof doc === "object" && doc !== null) {
    const v = (doc as Record<string, unknown>)[key];
    if (typeof v === "string") return v;
  }
  return "";
}

/** Serialize the story neighbourhood into the curator's user prompt — everything it judges over. */
export function serializeCurationContext(ctx: CurationContext): string {
  const lines: string[] = [
    `# Story just built: ${ctx.storyId}`,
    `nodes: ${ctx.nodeIds.join(", ") || "(none)"}`,
  ];
  const byNumber = new Map(ctx.adrs.map((a) => [a.number, a]));
  const decisionLines = ctx.decisions.map((n) => {
    const a = byNumber.get(n);
    return `  - ADR-${String(n).padStart(4, "0")}: ${a ? a.status : "(not found on disk)"}`;
  });
  lines.push(
    "deciding ADRs (current status):",
    ...(decisionLines.length > 0 ? decisionLines : ["  (none declared)"]),
    "",
    `## Open-questions in this neighbourhood (${ctx.openQuestions.length})`,
  );
  if (ctx.openQuestions.length === 0) lines.push("  (none)");
  for (const oq of ctx.openQuestions) {
    lines.push(
      `### ${oq.id}`,
      `title: ${bodyField(oq.doc, "title")}`,
      `stakes: ${bodyField(oq.doc, "stakes")}`,
      `statement: ${bodyField(oq.doc, "statement")}`,
      `context: ${bodyField(oq.doc, "context")}`,
      `options: ${bodyField(oq.doc, "options")}`,
      `recommendation: ${bodyField(oq.doc, "recommendation")}`,
      `references: ${(Array.isArray((oq.doc as Record<string, unknown>)?.references) ? ((oq.doc as Record<string, unknown>).references as unknown[]) : []).join(", ")}`,
      "",
    );
  }
  lines.push(`## Proposals in this neighbourhood (${ctx.proposals.length})`);
  if (ctx.proposals.length === 0) lines.push("  (none)");
  for (const p of ctx.proposals) {
    lines.push(`### ${p.id}`, `title: ${bodyField(p.doc, "title")}`, `summary: ${bodyField(p.doc, "summary")}`, "");
  }
  lines.push("Now emit your JSON array of curation actions (or [] if nothing needs doing).");
  return lines.join("\n");
}

const ACTION_TYPES = new Set<CurationAction["type"]>([
  "retire-open-question",
  "raise-open-question",
  "reframe-open-question",
  "create-proposal",
  "edit-proposal",
  "comment",
  "escalate",
]);

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}
function obj(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

/** Validate ONE raw action object into a {@link CurationAction}, or null if malformed (dropped). */
function coerceAction(raw: unknown): CurationAction | null {
  const o = obj(raw);
  if (o === null) return null;
  const type = o.type;
  if (typeof type !== "string" || !ACTION_TYPES.has(type as CurationAction["type"])) return null;
  switch (type) {
    case "retire-open-question": {
      const id = str(o.id);
      const reason = str(o.reason);
      if (id === null || reason === null) return null;
      const supersededBy = str(o.supersededBy);
      return { type, id, reason, ...(supersededBy !== null ? { supersededBy } : {}) };
    }
    case "raise-open-question":
    case "create-proposal": {
      const doc = obj(o.doc);
      return doc === null ? null : { type, doc };
    }
    case "reframe-open-question":
    case "edit-proposal": {
      const id = str(o.id);
      const set = obj(o.set);
      return id === null || set === null ? null : { type, id, set };
    }
    case "comment":
    case "escalate": {
      const artifactId = str(o.artifactId);
      const body = str(o.body);
      return artifactId === null || body === null ? null : { type, artifactId, body };
    }
    default:
      return null;
  }
}

/**
 * Parse the curator's final message into curation actions. Tolerant + never throws: it pulls the
 * JSON array out of a ```json fence (or the first bracketed array), parses it, and keeps only the
 * well-formed action objects (a malformed entry is dropped, not fatal). Malformed/empty → [].
 */
export function parseCuratorActions(text: string): CurationAction[] {
  if (typeof text !== "string" || text.trim() === "") return [];
  let jsonText = text;
  const fenced = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  if (fenced?.[1] !== undefined) {
    jsonText = fenced[1];
  } else {
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start !== -1 && end > start) jsonText = text.slice(start, end + 1);
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText.trim());
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  return parsed.map(coerceAction).filter((a): a is CurationAction => a !== null);
}

/**
 * A live {@link CuratorRunner} backed by the SDK librarian-curator: serialize the neighbourhood,
 * run ONE read-only SDK session, parse its structured output into intents. The SDK call is injectable
 * (`runSdk`) so the runner is offline-testable; `onResult` surfaces the session's cost for the build
 * report. A failed/empty session yields no actions (best-effort — curation never fails the build).
 */
export interface SdkCuratorRunnerArgs {
  systemPrompt: string;
  model?: string;
  cwd?: string;
  maxBudgetUsd?: number;
  /** Injected for offline tests; defaults to the real {@link runSdkCurator}. */
  runSdk?: (args: SdkCuratorArgs) => Promise<SdkCuratorResult>;
  /** Observe the SDK run (cost/turns/ok) so the build can report curator spend. */
  onResult?: (result: SdkCuratorResult) => void;
}

export class SdkCuratorRunner implements CuratorRunner {
  readonly #args: SdkCuratorRunnerArgs;
  readonly #runSdk: (args: SdkCuratorArgs) => Promise<SdkCuratorResult>;
  constructor(args: SdkCuratorRunnerArgs) {
    this.#args = args;
    this.#runSdk = args.runSdk ?? runSdkCurator;
  }
  async run(ctx: CurationContext): Promise<CurationAction[]> {
    const result = await this.#runSdk({
      systemPrompt: this.#args.systemPrompt,
      userPrompt: serializeCurationContext(ctx),
      ...(this.#args.model !== undefined ? { model: this.#args.model } : {}),
      ...(this.#args.cwd !== undefined ? { cwd: this.#args.cwd } : {}),
      ...(this.#args.maxBudgetUsd !== undefined ? { maxBudgetUsd: this.#args.maxBudgetUsd } : {}),
    });
    this.#args.onResult?.(result);
    return result.ok ? parseCuratorActions(result.text) : [];
  }
}

/** The build-header report block: a one-line summary + each enacted / refused / escalated line. */
function summaryLines(out: CurationOutcome): string[] {
  const enacted = out.enacted.filter((l) => l !== "");
  if (
    enacted.length === 0 &&
    out.refused.length === 0 &&
    out.unsent.length === 0 &&
    out.escalations.length === 0
  ) {
    return ["curation:    clean — the curator found nothing to clean up in this story's neighbourhood"];
  }
  const lines: string[] = [
    `curation:    ${enacted.length} enacted, ${out.refused.length} refused, ${out.escalations.length} escalated`,
  ];
  for (const l of enacted) lines.push(`             ✓ ${l}`);
  for (const l of out.refused) lines.push(`             ✗ ${l}`);
  for (const l of out.unsent) lines.push(`             … ${l} (no live comment store — report only)`);
  for (const l of out.escalations) lines.push(`             ⚑ ESCALATION ${l}`);
  return lines;
}
