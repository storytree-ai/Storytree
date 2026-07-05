import type { Store } from "@storytree/storage-protocol";
import { KIND_SPECS } from "../knowledge.js";
import { renderStoredDoc } from "./render-doc.js";

/**
 * The agent renderer (ADR-0051): assemble a Library `agent` artifact into a system prompt by
 * INJECTING the content its typed `asset:` refs point at — `context` / `rules` / `antiPatterns`
 * (ADR-0029 §7, reference-don't-restate). Offline by construction: it reads whatever `Store` it is
 * handed (the in-memory seed by default, the live pg store under `--pg`), so it runs in CI and in
 * the ephemeral web container with no DB.
 *
 * This is the single mechanism every runtime surface reuses: `storytree agents <name>` prints it,
 * the CLAUDE.md generator embeds the orchestrator agent's prompt, and the SDK leaf prompt renders
 * its leaf agents through the same function. It lives in `@storytree/library` (the organism that
 * owns the artifact schema it reads) so every consumer — the CLI commands, the build drivers, the
 * generators — assembles prompts from one place (ADR: the drive extraction).
 */

/** The labelled ref-list fields, in prompt order, with the section heading each renders under. */
const REF_SECTIONS: { field: "context" | "rules" | "antiPatterns"; heading: string }[] = [
  { field: "context", heading: "Context — load this before you start" },
  { field: "rules", heading: "Rules — your behavioural floor; follow these" },
  { field: "antiPatterns", heading: "Anti-patterns — failure modes you must refuse" },
];

/** The `asset:<id>` ids of a ref-list field on a raw agent doc (empty for an absent/odd field). */
function refIds(doc: Record<string, unknown>, field: string): string[] {
  const v = doc[field];
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((s) => s.replace(/^asset:/, ""));
}

export interface AgentPrompt {
  name: string;
  title: string;
  /** The agent's one-line description (the `.claude/agents` frontmatter / delegation hint). */
  description: string;
  /** The assembled system prompt (the agent's own body + the injected ref content). */
  prompt: string;
  /** Refs that pointed at a missing artifact — a dangling agent manifest (flagged, never silent). */
  missingRefs: string[];
}

export type RenderAgentResult =
  | { ok: true; agent: AgentPrompt }
  | { ok: false; reason: string; available: string[] };

/** The ids of every `agent` artifact in the store, sorted — the "which agents exist" list. */
async function agentIds(store: Store): Promise<string[]> {
  const docs = await store.queryDocs({ kind: "agent" });
  return docs.map((d) => d.id).sort();
}

/**
 * Assemble `name`'s system prompt, or fail-closed with the list of agents that DO exist. A dangling
 * `asset:` ref is surfaced inline (`> MISSING REF …`) AND collected in `missingRefs` — a broken
 * manifest must never render as a silently-thinner prompt.
 */
export async function renderAgentPrompt(store: Store, name: string | undefined): Promise<RenderAgentResult> {
  const available = await agentIds(store);
  if (name === undefined) {
    return { ok: false, reason: "agents needs a name: storytree agents <name>", available };
  }
  const stored = await store.getDoc(name);
  if (!stored || stored.kind !== "agent") {
    return { ok: false, reason: `no agent "${name}" in the Library.`, available };
  }
  const doc = stored.doc as Record<string, unknown>;
  const str = (k: string): string => (typeof doc[k] === "string" ? (doc[k] as string).trim() : "");
  const title = str("title") || stored.id;
  const missingRefs: string[] = [];

  // The agent's own PROSE, from KIND_SPECS (skip the ref-list fields — their CONTENT is injected
  // below, so the assembled prompt carries guidance, not a list of asset ids).
  const parts: string[] = [`# ${title}   (agent: ${stored.id})`, ""];
  const description = str("description");
  if (description) parts.push(description, "");
  for (const spec of KIND_SPECS.agent) {
    if (spec.refList === true) continue;
    const value = str(spec.field);
    if (!value) continue;
    if (spec.lead === true) parts.push(`${spec.heading} ${value}`, "");
    else parts.push(`## ${spec.heading}`, "", value, "");
  }

  for (const { field, heading } of REF_SECTIONS) {
    const ids = refIds(doc, field);
    if (ids.length === 0) continue;
    parts.push("", `## ${heading}`);
    for (const id of ids) {
      const refStored = await store.getDoc(id);
      if (!refStored) {
        missingRefs.push(`asset:${id}`);
        parts.push("", `> MISSING REF: asset:${id} — dangling in ${stored.id}'s ${field}; fix the agent artifact.`);
        continue;
      }
      const r = renderStoredDoc(refStored);
      parts.push("", `### ${r.title}  [${refStored.kind}]`, r.body);
    }
  }

  return {
    ok: true,
    agent: { name: stored.id, title, description, prompt: parts.join("\n"), missingRefs },
  };
}

// ── step→refs retrieval (ADR-0156 §4 / ADR-0161: the agent-step node of the context DAG) ─────────
// The structured association `workflow step → the ordered asset: refs that step pulls` lives on the
// agent artifact (`stepRefs`, knowledge.ts). This is the schema-aware EXTRACTOR: it resolves one
// step's refs, or fails closed with the agent's declared step keys. Shaping those refs into the
// ADR-0023 `next:` envelope is the CLI's job (via the shared `emitNodeEnvelope`) — the library
// organism owns the schema, not the envelope (which lives one layer up, in @storytree/drive).

/** The step→refs entries on a raw agent doc, tolerant of an absent/odd field (like {@link refIds}). */
function stepRefsOf(doc: Record<string, unknown>): { step: string; refs: string[] }[] {
  const v = doc["stepRefs"];
  if (!Array.isArray(v)) return [];
  const out: { step: string; refs: string[] }[] = [];
  for (const entry of v) {
    if (entry === null || typeof entry !== "object") continue;
    const e = entry as Record<string, unknown>;
    const step = typeof e["step"] === "string" ? e["step"] : "";
    if (step === "") continue;
    // Refs are returned VERBATIM (`asset:<id>`); the emitter is the single place that maps a ref to
    // its `storytree library artifact <id>` pull command.
    const refs = Array.isArray(e["refs"])
      ? e["refs"].filter((r): r is string => typeof r === "string")
      : [];
    out.push({ step, refs });
  }
  return out;
}

export type RenderAgentStepResult =
  | { ok: true; agent: string; step: string; refs: string[] }
  | { ok: false; reason: string; steps: string[]; available: string[] };

/**
 * Resolve ONE workflow step's outbound refs on `name` (the ADR-0156 §4 step→refs association). This
 * is the retrieval path `storytree agents <name> --step <step>` serves. Fail-closed: an unknown
 * agent returns the agent list (`available`); a missing/unknown step returns the agent's declared
 * step keys (`steps`) so the caller can suggest the valid branches. An agent with no `stepRefs`
 * authored yet resolves every step to "unknown step" with an empty `steps` list.
 */
export async function renderAgentStep(
  store: Store,
  name: string | undefined,
  step: string | undefined,
): Promise<RenderAgentStepResult> {
  const available = await agentIds(store);
  if (name === undefined) {
    return {
      ok: false,
      reason: "agents --step needs an agent: storytree agents <name> --step <step>",
      steps: [],
      available,
    };
  }
  const stored = await store.getDoc(name);
  if (!stored || stored.kind !== "agent") {
    return { ok: false, reason: `no agent "${name}" in the Library.`, steps: [], available };
  }
  const entries = stepRefsOf(stored.doc as Record<string, unknown>);
  const steps = entries.map((e) => e.step);
  if (step === undefined || step === "") {
    return {
      ok: false,
      reason: `agents ${stored.id} --step needs a step key.`,
      steps,
      available: [],
    };
  }
  const match = entries.find((e) => e.step === step);
  if (!match) {
    return {
      ok: false,
      reason: `agent "${stored.id}" has no workflow step "${step}".`,
      steps,
      available: [],
    };
  }
  return { ok: true, agent: stored.id, step: match.step, refs: match.refs };
}

/** The compact manifest labels for a digest (shorter than the full prompt's section headings). */
const DIGEST_REFS: { field: "context" | "rules" | "antiPatterns"; label: string }[] = [
  { field: "context", label: "Ceremonies & context" },
  { field: "rules", label: "Rules" },
  { field: "antiPatterns", label: "Refuse" },
];

export interface AgentDigest {
  name: string;
  title: string;
  /** A CONCISE markdown block — the agent's prose + a manifest pointer, NOT the injected bodies. */
  digest: string;
  missingRefs: string[];
}

export type RenderDigestResult =
  | { ok: true; agent: AgentDigest }
  | { ok: false; reason: string; available: string[] };

/**
 * A CONCISE digest of an agent — its own prose (role / outcome / workflow / escalation) plus a
 * manifest of the artifacts it stands on, pointing at `storytree agents <name>` for the full
 * assembled text. This is what shapes CLAUDE.md's operating-discipline region (ADR-0051 §3): the
 * thin cheat-sheet the friction audit asked for, NOT a dump of every referenced body.
 */
export async function renderAgentDigest(store: Store, name: string): Promise<RenderDigestResult> {
  const available = await agentIds(store);
  const stored = await store.getDoc(name);
  if (!stored || stored.kind !== "agent") {
    return { ok: false, reason: `no agent "${name}" in the Library.`, available };
  }
  const doc = stored.doc as Record<string, unknown>;
  const str = (k: string): string => (typeof doc[k] === "string" ? (doc[k] as string).trim() : "");
  const missingRefs: string[] = [];

  const lines: string[] = [];
  const oneLine = str("oneLine");
  if (oneLine) lines.push(oneLine, "");
  for (const [field, label] of [
    ["role", "Role"],
    ["outcome", "Outcome"],
    ["workflow", "Workflow"],
    ["escalation", "Escalation"],
  ] as const) {
    const value = str(field);
    if (value) lines.push(`**${label}.** ${value}`, "");
  }

  const groups: string[] = [];
  for (const { field, label } of DIGEST_REFS) {
    const ids = refIds(doc, field);
    if (ids.length === 0) continue;
    for (const id of ids) {
      if (!(await store.getDoc(id))) missingRefs.push(`asset:${id}`);
    }
    groups.push(`- **${label}:** ${ids.join(", ")}`);
  }
  if (groups.length > 0) {
    lines.push(
      `**Stands on** — assembled from these library artifacts; run \`storytree agents ${stored.id}\` for their full text:`,
      ...groups,
    );
  }

  return {
    ok: true,
    agent: { name: stored.id, title: str("title") || stored.id, digest: lines.join("\n").trim(), missingRefs },
  };
}

// ── .claude/agents push surface (ADR-0052) ──────────────────────────────────────────────────────
// The same library agents, rendered as Claude Code subagent FILES so a session can DELEGATE to the
// authored story-writers (the harness only auto-binds an agent type from `.claude/agents/<id>.md`;
// the pull `storytree agents <name>` doesn't). One source (the library), another generated surface.

/**
 * Agents that already own a dedicated runtime surface, so they are NOT also emitted as `.claude/agents`
 * subagent files: `session-orchestrator` shapes CLAUDE.md (ADR-0051 §3); `red-builder` / `green-builder`
 * ARE the SDK leaf prompt (§4). The REST are delegatable subagent roles.
 */
export const DEDICATED_SURFACE_AGENTS: ReadonlySet<string> = new Set([
  "session-orchestrator",
  "red-builder",
  "green-builder",
]);

/** Stamped into every generated `.claude/agents` file so an editor knows not to hand-edit it. */
export const GENERATED_AGENT_MARKER =
  "<!-- GENERATED from the library `agent` tier (ADR-0052) — do NOT hand-edit. Regenerate: `pnpm build:agents`. -->";

/** Quote a one-line string as a YAML double-quoted scalar (escape `\` and `"`, fold newlines). */
function yamlDoubleQuoted(s: string): string {
  return '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\r?\n/g, " ") + '"';
}

export type RenderAgentFileResult =
  | { ok: true; name: string; content: string; missingRefs: string[] }
  | { ok: false; reason: string; available: string[] };

/**
 * Render the committed `.claude/agents/<id>.md` view of an agent: Claude Code subagent frontmatter
 * (`name` / `description`) + the generated marker + the assembled system prompt (via the shared
 * {@link renderAgentPrompt}). One trailing newline, for deterministic on-disk content. `tools` is
 * intentionally OMITTED — the subagent inherits the full surface and the prose Tools section carries
 * the guidance; mapping the prose grant to a structured allow-list is future work (ADR-0052).
 */
export async function renderAgentFile(store: Store, name: string): Promise<RenderAgentFileResult> {
  const res = await renderAgentPrompt(store, name);
  if (!res.ok) return res;
  const { agent } = res;
  const frontmatter = [
    "---",
    `name: ${agent.name}`,
    `description: ${yamlDoubleQuoted(agent.description)}`,
    "---",
  ].join("\n");
  return {
    ok: true,
    name: agent.name,
    content: `${frontmatter}\n\n${GENERATED_AGENT_MARKER}\n\n${agent.prompt}\n`,
    missingRefs: agent.missingRefs,
  };
}

/** The ids that render to `.claude/agents` — every `agent` artifact minus the dedicated-surface roles. */
export async function delegatableAgentIds(store: Store): Promise<string[]> {
  const docs = await store.queryDocs({ kind: "agent" });
  return docs
    .map((d) => d.id)
    .filter((id) => !DEDICATED_SURFACE_AGENTS.has(id))
    .sort();
}
