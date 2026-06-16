import { randomUUID } from "node:crypto";

import type { AdrMeta, Store, StoredDoc } from "@storytree/core";
import { upcastAndValidate } from "@storytree/core";
import type { Comment, CommentAnchor } from "@storytree/store";

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
