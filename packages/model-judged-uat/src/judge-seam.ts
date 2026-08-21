import type { JudgeResult } from "./judge-result.js";
import { parseJudgeResult } from "./judge-result.js";

/**
 * The `independent-judge-seam` capability (ADR-0209 D3): a judge port runs
 * separately from the builder as a fresh read-only call that returns only a
 * structured result. Live Fable plugs in later behind this port; leaf proofs use
 * {@link ScriptedJudge}.
 */

/** Context arguments for one independent judgment call — no shared builder scratch. */
export interface JudgeContext {
  readonly criterionId: string;
  readonly revisionId: string;
  readonly title: string;
  readonly detailBody: string;
  readonly detailHash: string;
  readonly requiredTier: "advanced" | "frontier";
  readonly judgeId: string;
}

/**
 * The judge port: accept a full fresh context and return only a structured
 * {@link JudgeResult}. Deliberately has NO write/edit/delete/tool-exec methods.
 */
export interface JudgePort {
  judge(context: JudgeContext): JudgeResult;
}

/**
 * Offline scripted impl for proofs: maps criterionId → canned structured result.
 * Retains no prior-call builder scratch — each `judge` call only sees its args.
 */
export class ScriptedJudge implements JudgePort {
  readonly #scripts: ReadonlyMap<string, unknown>;

  constructor(scripts: Readonly<Record<string, unknown>>) {
    this.#scripts = new Map(Object.entries(scripts));
  }

  judge(context: JudgeContext): JudgeResult {
    const raw = this.#scripts.get(context.criterionId);
    if (raw === undefined) {
      throw new Error(`ScriptedJudge has no script for criterion "${context.criterionId}"`);
    }
    // Independence: only the script keyed by this call's criterionId is read;
    // context fields are required args (fresh per call) but the script is the
    // canned judgment — we still validate shape through parseJudgeResult.
    void context.title;
    void context.revisionId;
    void context.detailBody;
    void context.detailHash;
    void context.requiredTier;
    void context.judgeId;
    return parseJudgeResult(raw);
  }
}

/**
 * Runtime/type fence: a value claiming to be a JudgePort must expose `judge` and
 * must NOT expose write-shaped methods. Used by tests to pin the read-only seam.
 */
const BANNED_WRITE_METHODS = ["write", "edit", "delete", "exec", "runTool", "applyPatch"] as const;

export function assertReadOnlyJudgePort(port: JudgePort): void {
  // Probed through an OPTIONAL view of just the banned names, not an `as unknown as Record<string,
  // unknown>` chain (anti-slop-adoption-arc inc-03). A JudgePort is assignable to this without any
  // assertion — it declares none of these keys — and property access still walks the prototype
  // chain, which `Object.entries` would not: a class-based port carrying `write()` on its prototype
  // has to stay catchable, since that is the whole fence.
  const probe: Pick<JudgePort, "judge"> &
    Partial<Record<(typeof BANNED_WRITE_METHODS)[number], unknown>> = port;
  for (const banned of BANNED_WRITE_METHODS) {
    if (typeof probe[banned] === "function") {
      throw new Error(`judge port refuses write surface method "${banned}" (ADR-0209 D3)`);
    }
  }
  if (typeof port.judge !== "function") {
    throw new Error("judge port must expose judge(context)");
  }
}
