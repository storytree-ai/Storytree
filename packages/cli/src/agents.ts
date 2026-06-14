import type { Store } from "@storytree/core";
import { KIND_SPECS } from "@storytree/core";
import { renderStoredDoc } from "@storytree/store";

import type { Envelope } from "./envelope.js";

/**
 * The agent renderer (ADR-0051): assemble a Library `agent` artifact into a system prompt by
 * INJECTING the content its typed `asset:` refs point at — `context` / `rules` / `antiPatterns`
 * (ADR-0029 §7, reference-don't-restate). Offline by construction: it reads whatever `Store` it is
 * handed (the in-memory seed by default, the live pg store under `--pg`), so it runs in CI and in
 * the ephemeral web container with no DB.
 *
 * This is the single mechanism every runtime surface reuses: `storytree agents <name>` prints it,
 * the CLAUDE.md generator embeds the orchestrator agent's prompt, and the SDK leaf prompt (later)
 * renders its leaf agents through the same function.
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
    agent: { name: stored.id, title, prompt: parts.join("\n"), missingRefs },
  };
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
      "  storytree agents <name>        print the assembled system prompt",
    ].join("\n"),
    next: ["storytree agents orchestrator", "storytree library artifact list agent"],
  };
}
