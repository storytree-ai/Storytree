/**
 * The owned loop as a {@link PhaseAuthor} (ADR-0030 §2/§4): the original ADR-0011 runtime —
 * Model + ToolExecutor + the write-scoped decorator — adapted onto the executor seam. This is the
 * OFFLINE/deterministic implementation (ScriptedModel tests run the whole gate at zero cost) and
 * the pivot-out fallback if the rented runtime bites.
 */

import { runStep } from "@storytree/agent";
import type { Model, PhaseAuthor, AuthoringPhase, AuthorResult, ToolExecutor } from "@storytree/agent";

import type { WriteScope } from "./phase-machine.js";
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

  /** Every fail-closed refusal the write wall made (so the gate/tests can assert it held). */
  get violations(): readonly WriteViolation[] {
    return this.#scoped.violations;
  }

  async author(phase: AuthoringPhase, prompt: string): Promise<AuthorResult> {
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
