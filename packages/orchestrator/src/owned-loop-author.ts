/**
 * The owned loop as a {@link PhaseAuthor} (ADR-0030 §2/§4): the original ADR-0011 runtime —
 * Model + ToolExecutor + the write-scoped decorator — adapted onto the executor seam. This is the
 * OFFLINE/deterministic implementation (ScriptedModel tests run the whole gate at zero cost) and
 * the pivot-out fallback if the rented runtime bites.
 */

import { runStep } from "@storytree/agent";
import type { Model, PhaseAuthor, AuthoringPhase, AuthorResult, ToolExecutor } from "@storytree/agent";

import type { Phase, WriteScope } from "./phase-machine.js";
import {
  WriteScopedToolExecutor,
  type WriteToolSpec,
  type WriteViolation,
} from "./write-scoped-executor.js";

/** The model string handed to {@link runStep}; the leaf brief is the request's user message. */
const STEP_MODEL = "spine-leaf";

/** Constructor args: exactly the four seams the gate used to take directly (pre-ADR-0030). */
export interface OwnedLoopAuthorArgs {
  model: Model;
  /** The leaf's tool surface; wrapped in a {@link WriteScopedToolExecutor} this author flips. */
  tools: ToolExecutor;
  /** The per-phase write-ownership predicate (ADR-0020 §2). */
  scope: WriteScope;
  /** Maps the leaf's WRITE tools to path-extractors so the scope can gate them. */
  writeTools: WriteToolSpec;
}

/** The owned-loop {@link PhaseAuthor}: one fail-closed `runStep` per authoring slice. */
export class OwnedLoopAuthor implements PhaseAuthor {
  readonly #model: Model;
  readonly #scoped: WriteScopedToolExecutor;

  constructor(args: OwnedLoopAuthorArgs) {
    this.#model = args.model;
    this.#scoped = new WriteScopedToolExecutor({
      inner: args.tools,
      scope: args.scope,
      writeTools: args.writeTools,
      phase: "AUTHOR_TEST",
    });
  }

  /**
   * Every authoring slice this leaf ARMED the wall for, in order — the DENOMINATOR half of the
   * ADR-0446 reading. `violations` alone cannot answer "how often does the wall fire?": an empty
   * list means "armed and never fired" or "never ran", and those are different facts. Recorded at
   * the top of {@link author}, so a slice whose model then dies still counts as armed.
   */
  readonly slices: { phase: AuthoringPhase }[] = [];

  /** Every fail-closed refusal the write wall made (so the tests/the scope sink can assert it held). */
  get violations(): readonly WriteViolation[] {
    return this.#scoped.violations;
  }

  /**
   * Write-shaped calls this wall let through because their path could not be read (ADR-0446).
   *
   * Surfaced separately from {@link violations} and never merged into it: the SDK hook FAILS CLOSED
   * on the same input where this executor passes through, so one of the two is wrong — and folding
   * the counts together would hide exactly the disagreement counting them was meant to settle.
   */
  get noPathCalls(): readonly { phase: Phase; tool: string }[] {
    return this.#scoped.noPathCalls;
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
    this.slices.push({ phase });
    this.#scoped.setPhase(phase);
    const step = await runStep({
      model: this.#model,
      tools: this.#scoped,
      request: { model: STEP_MODEL, messages: [{ role: "user", content: prompt }] },
    });
    if (!step.ok) {
      return { ok: false, error: step.error };
    }
    return { ok: true };
  }
}
