import type { Store } from "@storytree/storage-protocol";
import { renderAgentPrompt, renderAgentStep } from "@storytree/library/store";

import { emitNodeEnvelope, type Envelope } from "./envelope.js";

/**
 * The `agents` command shells (ADR-0051): the Envelope-returning CLI surface over the agent renderer.
 * The renderer itself (`renderAgentPrompt` / `renderAgentDigest` / `renderAgentFile` /
 * `delegatableAgentIds`) lives in `@storytree/library` (the organism that owns the artifact schema it
 * reads) — the drive extraction moved it there so the CLI commands, the build drivers, and the
 * generators all assemble prompts from one place. These shells stay in the CLI because they speak the
 * CLI's `Envelope`.
 */

/** `storytree agents <name>` — print one agent's assembled system prompt (ADR-0051). */
export async function agentsCommand(store: Store, name: string | undefined): Promise<Envelope> {
  const result = await renderAgentPrompt(store, name);
  if (!result.ok) {
    return {
      ok: false,
      body: result.reason,
      next: result.available.map((id) => `storytree agents ${id}`),
    };
  }
  const { agent } = result;
  return {
    // A dangling ref is a real defect in the manifest — fail the envelope so a `--check`-style
    // caller (or a human) notices, while still printing the (degraded) prompt for inspection.
    ok: agent.missingRefs.length === 0,
    body:
      agent.prompt +
      (agent.missingRefs.length > 0
        ? `\n\n--- ${agent.missingRefs.length} dangling ref(s): ${agent.missingRefs.join(", ")} ---`
        : ""),
    next: [`storytree library artifact ${agent.name}   (the raw agent artifact)`],
  };
}

/**
 * `storytree agents <name> --step <step>` — serve ONE workflow step's just-in-time context as an
 * ADR-0023 `next:` envelope (ADR-0156 §4 / ADR-0161). The agent-step is a NODE of the Library
 * context DAG; its `stepRefs` are the node's outbound edges, rendered through the shared
 * {@link emitNodeEnvelope}. Fail-closed: an unknown agent lists the agents that exist; a missing or
 * unknown step lists the agent's declared step keys as the branches to try.
 */
export async function agentStepCommand(
  store: Store,
  name: string | undefined,
  step: string | undefined,
): Promise<Envelope> {
  const result = await renderAgentStep(store, name, step);
  if (!result.ok) {
    const next =
      result.steps.length > 0
        ? result.steps.map((s) => `storytree agents ${name} --step ${s}`)
        : result.available.map((id) => `storytree agents ${id} --step <step>`);
    return { ok: false, body: result.reason, next };
  }
  return emitNodeEnvelope({
    id: `${result.agent}#${result.step}`,
    headline:
      `${result.agent} — step "${result.step}"\n\n` +
      (result.refs.length > 0
        ? "Pull just what this step needs, then follow each ceremony's own `next:` onward (ADR-0156 §4)."
        : "This step has no attached refs yet — proceed on the agent's own prose."),
    edges: result.refs.map((ref) => ({ ref })),
  });
}

/** `storytree agents` help. */
export function agentsHelp(): Envelope {
  return {
    ok: true,
    body: [
      "storytree agents <name> — assemble an agent's system prompt from the Library (ADR-0051).",
      "",
      "Reads the `agent` artifact and INJECTS the content its context/rules/antiPatterns refs point",
      "at (reference-don't-restate, ADR-0029 §7). Offline by default; --pg reads the live store.",
      "",
      "  storytree agents <name>               print the assembled system prompt",
      "  storytree agents <name> --step <s>    serve ONE workflow step's just-in-time refs (ADR-0156)",
    ].join("\n"),
    next: [
      "storytree agents orchestrator",
      "storytree agents orchestrator --step session_start",
      "storytree library artifact list agent",
    ],
  };
}
