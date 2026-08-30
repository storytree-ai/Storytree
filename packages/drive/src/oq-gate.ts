import type { StoredDoc } from "@storytree/storage-protocol";
import type { NodeSpec } from "@storytree/orchestrator";
import type { Comment } from "@storytree/library/store";
import { PgCommentStore, PgLibraryStore, closePool, createPool } from "@storytree/library/store";
import { parseDecisionPointer } from "@storytree/library";

import type { Envelope } from "./envelope.js";

/**
 * The open-question hygiene gate (ADR-0037 §5) — OQs sit on the GATE side of the advisory/gate
 * line. A LIVE story build resolves the story's deciding ADRs (`decisions`, ADR-0037 §2), finds
 * open-questions whose `references` point at those ADR docs, and:
 *
 *   - an UNPROCESSED operator answer (an unresolved operator comment with no later follow-up)
 *     REFUSES the build — the session must process it: implement/record + retire the OQ, or post
 *     a follow-up comment where the answer is unclear (engagement unblocks);
 *   - an OQ still AWAITING an answer is a loud WARN — the session cannot force the owner;
 *   - dry-runs and an unreachable live store print what they could not check and never refuse —
 *     the gate needs the live comment store to have an opinion.
 *
 * Pure classification over injected rows; the thin live loader composes the existing stores.
 */

export type OqState = "unprocessed-answer" | "awaiting-answer" | "engaged";

export interface OqHygieneRow {
  id: string;
  title: string;
  /** The deciding ADR numbers this OQ touches (the intersection that pulled it in). */
  adrs: number[];
  state: OqState;
}

/**
 * The deciding-ADR number a reference names, or null for any other reference shape.
 *
 * BOTH LIVE SPELLINGS, VIA THE ONE PARSER. This used to carry its own
 * `/^doc:decisions\/(\d{4})-/`, which matched the bare spelling only — and the field it reads is
 * an open-question's `references`, which is exactly where the repo-relative `doc:docs/decisions/…`
 * pointers live. An OQ authored in that spelling was silently not pulled into the intersection
 * below, so this gate FAILED OPEN: it reported a clean story while having checked less than it
 * claimed, on the LIVE build path. That is ADR-0403 dec 7's confident-plausible-wrong answer, and
 * the reason resolution lives in exactly one place ({@link parseDecisionPointer}) rather than being
 * re-derived by each reader that needs it.
 */
function adrNumberOfRef(ref: string): number | null {
  return parseDecisionPointer(ref)?.number ?? null;
}

function referencesOf(d: StoredDoc): string[] {
  const body = typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {};
  const refs = body["references"];
  return Array.isArray(refs) ? refs.filter((r): r is string => typeof r === "string") : [];
}

function titleOf(d: StoredDoc): string {
  const body = typeof d.doc === "object" && d.doc !== null ? (d.doc as Record<string, unknown>) : {};
  return typeof body["title"] === "string" ? body["title"] : d.id;
}

/**
 * Classify every open-question that references one of the deciding ADRs. Engagement rule: a
 * non-operator comment posted AFTER the latest unresolved operator answer counts as the session
 * engaging the answer (the follow-up path) — the gate warns instead of refusing.
 */
export function classifyOpenQuestions(
  openQuestions: StoredDoc[],
  comments: Comment[],
  decidingAdrs: number[],
): OqHygieneRow[] {
  const deciding = new Set(decidingAdrs);
  const rows: OqHygieneRow[] = [];
  for (const d of openQuestions) {
    const adrs = [
      ...new Set(
        referencesOf(d)
          .map(adrNumberOfRef)
          .filter((n): n is number => n !== null && deciding.has(n)),
      ),
    ].sort((a, b) => a - b);
    if (adrs.length === 0) continue;

    const own = comments.filter((c) => c.topicId === d.id);
    const operator = own.filter((c) => c.author === "operator");
    let state: OqState;
    if (operator.length === 0) {
      state = "awaiting-answer";
    } else {
      const unresolved = operator.filter((c) => c.resolved !== true);
      if (unresolved.length === 0) {
        state = "engaged";
      } else {
        const latestUnresolvedAt = unresolved
          .map((c) => c.createdAt)
          .sort()
          .at(-1) as string;
        const followedUp = own.some(
          (c) => c.author !== "operator" && c.createdAt > latestUnresolvedAt,
        );
        state = followedUp ? "engaged" : "unprocessed-answer";
      }
    }
    rows.push({ id: d.id, title: titleOf(d), adrs, state });
  }
  return rows;
}

export interface OqGateDeps {
  /** Injectable row loader (tests); the default reads the live store. */
  load?: () => Promise<{ openQuestions: StoredDoc[]; comments: Comment[] }>;
}

export interface OqGateOutcome {
  /** Non-null = the build is refused (ADR-0037 §5); the envelope explains the three paths out. */
  refusal: Envelope | null;
  /** Report lines for the build header (always present, including the could-not-check cases). */
  lines: string[];
}

async function loadLive(): Promise<{ openQuestions: StoredDoc[]; comments: Comment[] }> {
  const { pool, connector } = await createPool();
  try {
    const openQuestions = await new PgLibraryStore(pool).queryDocs({ kind: "open-question" });
    const comments = await new PgCommentStore(pool).list({ topicKind: "asset" });
    return { openQuestions, comments };
  } finally {
    await closePool(pool, connector);
  }
}

function pad(n: number): string {
  return String(n).padStart(4, "0");
}

export async function oqHygieneGate(
  story: NodeSpec,
  live: boolean,
  deps: OqGateDeps = {},
): Promise<OqGateOutcome> {
  if (story.decisions.length === 0) {
    return {
      refusal: null,
      lines: ["oq-hygiene:  no deciding ADRs declared on this story — nothing to check (ADR-0037 §2)"],
    };
  }
  if (!live) {
    return {
      refusal: null,
      lines: ["oq-hygiene:  unchecked — a dry-run is offline; the gate needs the live comment store"],
    };
  }

  // ADR-0477 D1 — THE ATTACHMENT IS UNREPRESENTABLE, SO THIS GATE STOPS CLAIMING.
  //
  // The link that pulled an open question into this gate was a `doc:decisions/NNNN` pointer in the
  // question's `references`. That field is retired, and `open-question` is an EDGE_FREE_KIND
  // (ADR-0223 D1) so it carries no `dependsOn` for the pointer to move to — there is nowhere in the
  // schema left to say "this question is about that decision".
  //
  // The alternative was to run the classifier anyway. It would not have thrown: it would have
  // intersected an empty set and printed `clean — 0 linked open question(s), no unprocessed answers`
  // on every live story build, forever. That is the ADR-0477 D5 silent-shrink fault in its purest
  // form — a permanently vacuous PASS wearing the words of an audit — and it is worse than a gate
  // that says outright it can no longer check. So it says that.
  //
  // MEASURED BEFORE IT WAS TOUCHED, not assumed: on 2026-08-30 ZERO live open-questions carried a
  // decisions pointer, so this gate had no input on the day it was retired and refuses nothing it
  // would otherwise have refused. `classifyOpenQuestions` below is unchanged and still unit-true;
  // what is gone is its live INPUT, not its logic. Deleting the module outright would retire
  // `stories/drive-machinery/oq-hygiene-gate.md` and the eight contracts bound to it — a story-tier
  // change that has no business riding inside a one-way schema landing — so that is parked as its
  // own increment on `citation-tier-retirement-arc`.
  return {
    refusal: null,
    lines: [
      "oq-hygiene:  RETIRED — the open-question → deciding-ADR link was a `references` citation, and",
      "             ADR-0477 D1 retired that field. This gate checks nothing and refuses nothing;",
      "             it reports so rather than printing a clean answer it cannot stand behind.",
    ],
  };

  let rows: OqHygieneRow[];
  try {
    const { openQuestions, comments } = await (deps.load ?? loadLive)();
    rows = classifyOpenQuestions(openQuestions, comments, story.decisions);
  } catch (e) {
    return {
      refusal: null,
      lines: [
        `oq-hygiene:  UNCHECKED — live store unreachable (${(e as Error).message}); never refusing blind`,
      ],
    };
  }

  const unprocessed = rows.filter((r) => r.state === "unprocessed-answer");
  const awaiting = rows.filter((r) => r.state === "awaiting-answer");

  if (unprocessed.length > 0) {
    const list = unprocessed
      .map((r) => `  - ${r.id}  (touches ADR ${r.adrs.map(pad).join(", ")})\n      ${r.title}`)
      .join("\n");
    return {
      refusal: {
        ok: false,
        body: [
          `story build ${story.id} — REFUSED by the open-question hygiene gate (ADR-0037 §5).`,
          "",
          "the owner answered these open questions and nothing has processed the answers:",
          list,
          "",
          "resolve by ONE of:",
          "  1. process it — implement/record the decision in an ADR, mark the comment resolved,",
          "     retire the open-question (the ADR-0018 §6 lifecycle)",
          "  2. answer unclear — post a follow-up comment on the OQ; engagement unblocks the gate",
          "  3. wrong link — fix the OQ's references or this story's decisions list",
        ].join("\n"),
        next: [
          ...unprocessed.map((r) => `storytree library artifact ${r.id} --pg`),
          `storytree story build ${story.id} --live`,
        ],
      },
      lines: [],
    };
  }

  const lines: string[] = [];
  if (awaiting.length > 0) {
    lines.push(
      `oq-hygiene:  WARN — ${awaiting.length} open question(s) on this story's ADRs still await an owner answer:`,
      ...awaiting.map((r) => `             - ${r.id} (ADR ${r.adrs.map(pad).join(", ")})`),
    );
  } else {
    lines.push(
      `oq-hygiene:  clean — ${rows.length} linked open question(s), no unprocessed answers`,
    );
  }
  return { refusal: null, lines };
}
