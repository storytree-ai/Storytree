import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { KIND_SPECS, type KnowledgeKind } from "../knowledge.js";
import { renderStoredDoc } from "./render-doc.js";

/**
 * The agent renderer (ADR-0051): assemble a Library `agent` artifact into a system prompt from its
 * own prose + its typed `asset:` refs — `context` / `rules` / `antiPatterns` (ADR-0029 §7,
 * reference-don't-restate). Offline by construction: it reads whatever `Store` it is handed (the
 * in-memory seed by default, the live pg store under `--pg`), so it runs in CI and in the ephemeral
 * web container with no DB.
 *
 * ONE renderer, THREE modes over the same artifact (ADR-0051 §3/§4; ADR-0156 §6ii added essentials):
 *   - {@link renderAgentPrompt} — FULL: injects every ref's full body inline. The SDK-leaf / spawn
 *     drivers (`@storytree/drive`) still use this fat path.
 *   - {@link renderAgentEssentials} — ESSENTIALS: own prose + a floor of one-line assertions +
 *     per-step doors, NEVER the full bodies. This is what `storytree agents <name>` and the on-disk
 *     `.claude/agents/*.md` files render (ADR-0156 repointed both here); the CLI serves the bodies
 *     just-in-time.
 *   - {@link renderAgentDigest} — DIGEST: the thin CLAUDE.md cheat-sheet (own prose + a pointer manifest).
 * It lives in `@storytree/library` (the organism that owns the artifact schema it reads) so every
 * consumer — the CLI commands, the build drivers, the generators — assembles prompts from one place.
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
 * The agent's OWN prose — the header + description + every NON-refList KIND_SPECS field
 * (oneLine / role / outcome / tools / workflow / escalation), verbatim. This is the shared spine of
 * BOTH render modes: the full prompt ({@link renderAgentPrompt}) appends the injected ref bodies to
 * it, the essentials view ({@link renderAgentEssentials}) appends the floor/escape-hatch/doors — so
 * the agent's own prose is identical across surfaces (ADR-0156 §1a: "kept verbatim; this is the
 * signal"). The ref-list fields (context / rules / antiPatterns) are skipped here — each surface
 * renders their targets its own way.
 */
function agentOwnProseParts(stored: StoredDoc): string[] {
  const doc = stored.doc as Record<string, unknown>;
  const str = (k: string): string => (typeof doc[k] === "string" ? (doc[k] as string).trim() : "");
  const title = str("title") || stored.id;
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
  return parts;
}

/**
 * The ONE-LINE ASSERTION of a ref artifact — its KIND_SPECS lead field (the `**The principle.**` /
 * `**The boundary.**` / `**The pattern.**` imperative), folded to a single line. This is what the
 * essentials floor renders in place of the full Why/How body (ADR-0156 §2: "the imperative itself …
 * resident and unmissable"). Falls back to the doc's one-line `description` for a body-bearing asset
 * with no structured lead field, so a ref always yields SOMETHING resident + a pointer.
 */
function leadAssertion(stored: StoredDoc): string {
  const doc = stored.doc as Record<string, unknown>;
  const oneLine = (s: string): string => s.trim().replace(/\s*\n+\s*/g, " ");
  if (Object.hasOwn(KIND_SPECS, stored.kind)) {
    const leadSpec = KIND_SPECS[stored.kind as KnowledgeKind].find((s) => s.lead === true);
    if (leadSpec) {
      const v = doc[leadSpec.field];
      if (typeof v === "string" && v.trim() !== "") return oneLine(v);
    }
  }
  const desc = typeof doc["description"] === "string" ? (doc["description"] as string) : "";
  return desc.trim() !== "" ? oneLine(desc) : "(pull the id for this ref's assertion)";
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
  const description = str("description");
  const missingRefs: string[] = [];

  // The agent's own PROSE (shared spine), then INJECT each ref-list field's full body below — so the
  // assembled prompt carries guidance, not a list of asset ids. This is the FAT path the SDK leaf /
  // spawn drivers still use; the agent-file surface + `storytree agents <name>` render essentials.
  const parts = agentOwnProseParts(stored);

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

// ── essentials render (ADR-0156 §1 / ADR-0161: the thin, DRY, fresh delegation surface) ───────────
// The THIRD render mode alongside the full prompt (SDK leaf / spawn) and the digest (CLAUDE.md). It
// carries only (a) the agent's own prose, (b) a FLOOR CHECKLIST of one-line assertions + pull-hints
// (never the full ref bodies), (c) the specialist→manager ESCAPE HATCH inline, and (d) per-step DOORS
// generated from `stepRefs`. This is what the `.claude/agents/*.md` surface + `storytree agents
// <name>` render (ADR-0156 §6ii repoints them here off the full-inline path); the CLI is the
// just-in-time retrieval surface for everything the assertions point at.

/**
 * The floor sections of the essentials view (ADR-0156 §2): the behavioural floor + refusals as
 * one-line ASSERTIONS, not injected bodies. `context` is NOT a floor section — it renders as per-step
 * doors / a pointer manifest (§1d/§5), so it is handled separately below.
 */
const FLOOR_SECTIONS: { field: "rules" | "antiPatterns"; heading: string }[] = [
  { field: "rules", heading: "Floor — your behavioural floor; each line is the assertion, pull the id for the rationale" },
  { field: "antiPatterns", heading: "Refuse — failure modes you must refuse" },
];

/** The fixed inline escape-hatch block (ADR-0156 §3) — the specialist → manager escalation rung. */
const ESCAPE_HATCH: readonly string[] = [
  "## Escalate UP when blocked or out of scope",
  "",
  "You are a specialist. When you hit one of these, STOP and hand the situation UP to the " +
    "**session-orchestrator** (your manager) in your return message, with the reason — do NOT " +
    "force-fit the work into a hollow proof, and do NOT silently skip it:",
  "",
  '- **"This isn\'t my job"** — the work falls outside your role or authority.',
  '- **"I have no process for this"** — no workflow step or ceremony covers it, and a just-in-time pull did not surface one.',
  '- **"A capability gap blocks me"** — you are blocked until some infrastructure is built.',
  "",
  "This is the specialist → manager rung of the escalation ladder (specialist → orchestrator → owner).",
];

/**
 * Assemble `name`'s ESSENTIALS prompt (ADR-0156 §1): own prose + floor checklist + escape hatch +
 * per-step doors. Same fail-closed shape as {@link renderAgentPrompt} (unknown agent → the agent
 * list). A dangling `rules`/`antiPatterns`/`context` ref is surfaced AND collected in `missingRefs`
 * (the drift guard `build:agents` fails closed on) — a broken manifest never renders silently thinner.
 *
 * The floor renders each ref as its ONE-LINE assertion + a `storytree library artifact <id>` pull-hint
 * (never the full Why/How body). The doors are generated from `stepRefs`; until an agent's step map is
 * authored (increment 5) the doors are empty and the `context` refs surface as a just-in-time pointer
 * MANIFEST instead — never inlined bodies.
 */
export async function renderAgentEssentials(
  store: Store,
  name: string | undefined,
): Promise<RenderAgentResult> {
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
  const description = str("description");
  const missingRefs: string[] = [];

  // (a) The agent's OWN prose — role / outcome / tools / workflow / escalation, verbatim.
  const parts = agentOwnProseParts(stored);

  // (b) The FLOOR CHECKLIST — every rules + antiPatterns ref as its ONE-LINE assertion + a pull-hint.
  // Safety rests on assertion + code fence (the gate spine, the write-scope hook), not the body.
  for (const { field, heading } of FLOOR_SECTIONS) {
    const ids = refIds(doc, field);
    if (ids.length === 0) continue;
    parts.push("", `## ${heading}`, "");
    for (const id of ids) {
      const refStored = await store.getDoc(id);
      if (!refStored) {
        missingRefs.push(`asset:${id}`);
        parts.push(`- > MISSING REF: asset:${id} — dangling in ${stored.id}'s ${field}; fix the agent artifact.`);
        continue;
      }
      parts.push(`- ${leadAssertion(refStored)}  — \`storytree library artifact ${id}\``);
    }
  }

  // (c) The ESCAPE HATCH — always inline (an agent cannot pull the instruction to stop once it is
  // already past knowing it should). Increment 5 wires the `escalate-up-when-blocked-or-out-of-scope`
  // guardrail into the floor above; until then it is this fixed structural block.
  parts.push("", ...ESCAPE_HATCH);

  // (d) Per-step DOORS from `stepRefs` (inc 2). Real agents have no step map yet (inc 5 populates it),
  // so the doors are empty today and the `context` refs surface as a just-in-time pointer MANIFEST
  // (never full bodies — ADR-0156 §5), mirroring the digest. Every context ref is validated into
  // missingRefs so the drift guard stays fail-closed even when the manifest branch isn't taken.
  const steps = stepRefsOf(doc);
  const contextIds = refIds(doc, "context");
  for (const id of contextIds) {
    if (!(await store.getDoc(id))) missingRefs.push(`asset:${id}`);
  }
  parts.push("", "## Doors — pull a step's context just-in-time", "");
  if (steps.length > 0) {
    parts.push("Each workflow step opens onto just the refs it needs — pull them when you reach the step:");
    for (const s of steps) {
      parts.push(`- **${s.step}** — \`storytree agents ${stored.id} --step ${s.step}\``);
    }
  } else if (contextIds.length > 0) {
    parts.push("No per-step map yet — pull these context ceremonies just-in-time, at the step that needs each:");
    for (const id of contextIds) parts.push(`- \`storytree library artifact ${id}\``);
  } else {
    parts.push("No attached context — proceed on your own prose above.");
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

// ── the essentials size/structure gate (ADR-0156 §5 / ADR-0161 decision 5) ────────────────────────
// The fence the delegation surface never had (ADR-0156 §Context: "nothing keeps it lean"). check:agents
// (build-agents.ts) runs this over every rendered `.claude/agents/*.md` so the thinned prompts cannot
// silently re-bloat back toward the full-inline path ADR-0052 originally pointed them at. It asserts,
// fail-closed:
//   1. TOKEN BUDGET — the rendered file stays under ESSENTIALS_TOKEN_BUDGET (a chars/4 proxy; no
//      offline tokenizer). Catches gross bloat, incl. a repoint to renderAgentPrompt's fat path.
//   2. NO FULL REF BODY INLINE — the file carries assertions + pointers only, never an injected ref
//      body. Detected STRUCTURALLY by the `### <title>  [<kind>]` injection header renderAgentPrompt
//      emits (see line ~145) and renderAgentEssentials never does. This sidesteps the fragile
//      "does a ref's lead assertion overlap its body prose" content-diff — the header is unambiguous.
//   3. STEP→REFS INTEGRITY (ADR-0161 decision 5) — every stepRefs entry names a real workflow step
//      (its key appears in the agent's `workflow` prose, per the AgentStepRef schema contract) and
//      every ref key resolves (no dangling edge — the dangling-ref fence extended to structured edges).
//   4. NO UNATTACHED CONTEXT (ADR-0156 §5), SCOPED to agents that HAVE a step map — every `context`
//      ref is attached to some workflow step (no "just-in-case" riders). A NO-OP until increment 5
//      populates stepRefs on the well-behaved agents: today every agent's context surfaces as the
//      "No per-step map yet" manifest, so an unscoped check would red the whole green corpus (the
//      inc-4 sequencing trap — ADR-0161).

/**
 * The per-file essentials budget (ADR-0156 §5), in tokens. Measured essentials renders sit at
 * ~1.5k–4.1k tokens (chars/4), librarian-curator the outlier at ~4.1k — its own prose kept verbatim
 * (ADR-0156 §1a), not a leaked body. 6000 leaves the largest ~47% headroom for honest prose growth
 * while still tripping on a repoint to the full-inline path (whose ref bodies restored the 3–7k-token
 * spawns this ADR removed). The sharp regression guard is the body-injection check; this is the coarse
 * belt-and-suspenders ceiling.
 */
export const ESSENTIALS_TOKEN_BUDGET = 6000;

/** A cheap, offline token estimate for the budget gate — a chars/4 proxy (no tokenizer in gate/CI). */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * The `### <title>  [<kind>]` header {@link renderAgentPrompt} emits above each INJECTED ref body — the
 * structural signal that a full body leaked into an essentials file. The kinds are derived from
 * {@link KIND_SPECS} so a newly-added kind can never slip past the check.
 */
const BODY_INJECTION_HEADER = new RegExp(
  `^###\\s.*\\[(?:${Object.keys(KIND_SPECS).join("|")})\\]\\s*$`,
  "m",
);

/**
 * The essentials size/structure + step→refs integrity gate (ADR-0156 §5 / ADR-0161 decision 5).
 * Returns the list of VIOLATIONS for one agent's rendered file (empty ⇒ passes); `build-agents.ts
 * --check` (`check:agents`, in `pnpm gate`) fails the build on any. `content` is the rendered
 * `.claude/agents/<id>.md` (frontmatter + marker + essentials prompt); `store`/`id` resolve the
 * artifact for the structured checks. Fail-closed: a non-agent / missing id is itself a violation.
 */
export async function essentialsGateViolations(
  store: Store,
  id: string,
  content: string,
): Promise<string[]> {
  const violations: string[] = [];

  // 1. TOKEN BUDGET.
  const tokens = estimateTokens(content);
  if (tokens > ESSENTIALS_TOKEN_BUDGET) {
    violations.push(
      `${id}.md is ~${tokens} tokens (est., chars/4), over the ${ESSENTIALS_TOKEN_BUDGET}-token ` +
        `essentials budget — a full ref body may have been inlined, or the own prose has bloated.`,
    );
  }

  // 2. NO FULL REF BODY INLINE.
  if (BODY_INJECTION_HEADER.test(content)) {
    violations.push(
      `${id}.md inlines a full ref BODY (a "### <title>  [<kind>]" injection header is present) — the ` +
        `essentials surface renders assertions + pointers only; was renderAgentFile repointed to the ` +
        `full-inline path?`,
    );
  }

  const stored = await store.getDoc(id);
  if (!stored || stored.kind !== "agent") {
    violations.push(`${id}: not an agent artifact — the essentials gate cannot resolve its step map.`);
    return violations;
  }
  const doc = stored.doc as Record<string, unknown>;
  const stepRefs = stepRefsOf(doc);

  // 3. STEP→REFS INTEGRITY — a no-op until an agent's stepRefs are authored (increment 5).
  const workflow = (typeof doc["workflow"] === "string" ? (doc["workflow"] as string) : "").toLowerCase();
  for (const { step, refs } of stepRefs) {
    if (!workflow.includes(step.toLowerCase())) {
      violations.push(
        `${id}: stepRefs step "${step}" is not named in the agent's \`workflow\` prose — a step→refs ` +
          `key must map to a real workflow step.`,
      );
    }
    for (const ref of refs) {
      const refId = ref.replace(/^asset:/, "");
      if (!(await store.getDoc(refId))) {
        violations.push(
          `${id}: stepRefs step "${step}" has a dangling ref ${ref} — it resolves to no artifact.`,
        );
      }
    }
  }

  // 4. NO UNATTACHED CONTEXT — SCOPED to agents with a step map (the inc-4 sequencing trap).
  if (stepRefs.length > 0) {
    const attached = new Set(stepRefs.flatMap((s) => s.refs.map((r) => r.replace(/^asset:/, ""))));
    for (const ctxId of refIds(doc, "context")) {
      if (!attached.has(ctxId)) {
        violations.push(
          `${id}: context ref asset:${ctxId} is attached to no workflow step (no "just-in-case" ` +
            `riders — attach it to the step that pulls it).`,
        );
      }
    }
  }

  return violations;
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
 * (`name` / `description`) + the generated marker + the ESSENTIALS system prompt (via
 * {@link renderAgentEssentials} — ADR-0156 §6ii re-decided this off the full-inline `renderAgentPrompt`
 * so the machine-only subagent files stay thin, DRY, and fresh). One trailing newline, for
 * deterministic on-disk content. `tools` is intentionally OMITTED — the subagent inherits the full
 * surface and the prose Tools section carries the guidance; mapping the prose grant to a structured
 * allow-list is future work (ADR-0052).
 */
export async function renderAgentFile(store: Store, name: string): Promise<RenderAgentFileResult> {
  const res = await renderAgentEssentials(store, name);
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
