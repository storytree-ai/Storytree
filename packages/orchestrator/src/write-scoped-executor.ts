/**
 * ADR-0020 §2 enforcement: re-create V1's process-isolation walls as ONE agent's time-sliced
 * write-ownership.
 *
 * ADR-0011 collapses the per-node runtime to ONE owned loop, which removes V1's separate crates that
 * each authored the test, the code, and signed the verdict. The honesty property those walls bought —
 * the author of the test is not, at that moment, the author of the code — is re-established here as a
 * single agent's WRITE tool being gated by the current {@link Phase} and a {@link WriteScope},
 * FAIL-CLOSED: a denied write never reaches the inner executor, the model is told which wall it hit,
 * and the violation is recorded so the gate (ADR-0020 §4) can assert the wall held.
 */

import type { ToolExecutor } from "@storytree/agent";
import type { ToolResultBlock, ToolUseBlock } from "@storytree/agent";

import type { Phase, WriteScope } from "./phase-machine.js";

/**
 * A path-extractor for one write tool: given the tool's `input`, return the target path(s) it would
 * write. Return `null` when the input carries no scoped path (e.g. a malformed call or a write whose
 * target this layer can't read) — that is treated as "no path", which passes through (it is not a
 * scoped write) but is noted on {@link WriteScopedToolExecutor.noPathCalls}.
 *
 * A tool name absent from the {@link WriteToolSpec} map is a NON-write (read/list/etc.) and bypasses
 * scope-checking entirely.
 */
export type WriteToolSpec = Record<
  string,
  (input: unknown) => string | string[] | null
>;

/** A recorded fail-closed refusal: the wall a write hit. */
export interface WriteViolation {
  phase: Phase;
  tool: string;
  path: string;
}

/** Constructor args for {@link WriteScopedToolExecutor}. */
export interface WriteScopedToolExecutorArgs {
  /** The real executor a permitted (or non-write) call is delegated to. */
  inner: ToolExecutor;
  /** The per-phase write-ownership predicate (ADR-0020 §2). */
  scope: WriteScope;
  /** Maps a WRITE tool name to a path-extractor; absent names are non-writes. */
  writeTools: WriteToolSpec;
  /** The phase the spine starts this slice in; flipped per phase via {@link WriteScopedToolExecutor.setPhase}. */
  phase: Phase;
}

/**
 * A {@link ToolExecutor} decorator that gates the owned loop's WRITE tools by the current
 * {@link Phase} + a {@link WriteScope} (ADR-0020 §2), FAIL-CLOSED.
 *
 * For each call:
 *  - a tool NOT in {@link WriteToolSpec} is a non-write and is delegated straight to `inner`;
 *  - a write tool's path(s) are extracted and EACH is checked against `scope.isWriteAllowed`. If ANY
 *    path is denied, `inner.execute` is NOT called: an `is_error` result naming the refused path and
 *    phase is returned (the model sees the wall and can adapt) and the violation is recorded;
 *  - an extractor returning `null` (no scoped path) passes through and is noted.
 */
export class WriteScopedToolExecutor implements ToolExecutor {
  readonly #inner: ToolExecutor;
  readonly #scope: WriteScope;
  readonly #writeTools: WriteToolSpec;
  #phase: Phase;

  /** Every fail-closed refusal, in order, so a test (and the gate) can assert the wall held. */
  readonly violations: WriteViolation[] = [];

  /** Calls to a write tool whose extractor returned `null` (no scoped path) — passed through. */
  readonly noPathCalls: { phase: Phase; tool: string }[] = [];

  constructor(args: WriteScopedToolExecutorArgs) {
    this.#inner = args.inner;
    this.#scope = args.scope;
    this.#writeTools = args.writeTools;
    this.#phase = args.phase;
  }

  /** The phase this slice is currently in (the spine flips it via {@link setPhase}). */
  get phase(): Phase {
    return this.#phase;
  }

  /** Flip the current phase — the spine calls this as it advances the owned loop's phase. */
  setPhase(phase: Phase): void {
    this.#phase = phase;
  }

  async execute(call: ToolUseBlock): Promise<ToolResultBlock> {
    const extractor = this.#writeTools[call.name];

    // Not a write tool (read/list/etc.): straight through, no scope check.
    if (extractor === undefined) {
      return this.#inner.execute(call);
    }

    const extracted = extractor(call.input);

    // No scoped path: not a scoped write — allow, but note it.
    if (extracted === null) {
      this.noPathCalls.push({ phase: this.#phase, tool: call.name });
      return this.#inner.execute(call);
    }

    const paths = Array.isArray(extracted) ? extracted : [extracted];
    const denied = paths.filter(
      (path) => !this.#scope.isWriteAllowed(this.#phase, path),
    );

    if (denied.length > 0) {
      // FAIL-CLOSED: record every wall hit and refuse WITHOUT touching inner.
      for (const path of denied) {
        this.violations.push({ phase: this.#phase, tool: call.name, path });
      }
      const refused = denied.join(", ");
      return {
        type: "tool_result",
        tool_use_id: call.id,
        content: `write refused by phase scope: '${call.name}' may not write ${refused} in phase ${this.#phase}`,
        is_error: true,
      };
    }

    // Every path is allowed: delegate to the real executor.
    return this.#inner.execute(call);
  }
}
