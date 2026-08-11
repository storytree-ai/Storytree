import type { Store, StoredDoc } from "@storytree/storage-protocol";
import { Agent, KIND_SPECS, type KnowledgeKind } from "../knowledge.js";
import { explainDocValidationError } from "../library-doc.js";
import { upcast } from "../migrations.js";
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

// ── the fail-closed read (projection-ownership-arc, condition 1) ──────────────────────────────────
// A generated projection is a function of (STORE, GENERATOR), not of the store alone — and until this
// seam existed only one half of that pair was checked. The WRITE boundary is strict
// (`buildKindSchema(...).strict()` via `upcastAndValidate`): an unknown field is refused with the
// legal fields named. The READ path validated NOTHING — every field came through a raw
// `as Record<string, unknown>` cast — so a generator meeting a field it had never heard of silently
// ignored it and emitted confident, plausible, WRONG bytes.
//
// That asymmetry is what turned a version skew into divergent OUTPUT instead of an error message
// naming the skew. Measured 2026-08-08: a session added the `aliases` field to the `explorer` agent
// and to the renderer on ONE branch; a sibling holding the older generator was pushed red by
// `check:agents` (which compares the committed views against the LIVE store), regenerated to get
// green, and produced a third variant that existed on no branch — the right artifact, rendered
// wrong. Both commits were individually correct, which is why it surfaced only as an add/add
// conflict at merge time rather than as a failure anyone could act on.
//
// Fail-closed is this codebase's house style everywhere else (the phase machine, the gate,
// `resolveAgentAlias`'s own miss branch); this was the exception.

/** A `getDoc` + kind + SCHEMA check, or the reason the artifact must not be rendered. */
type LoadedAgent = { ok: true; stored: StoredDoc } | { ok: false; reason: string };

/**
 * The `agent` schema as a READ check: `.strict()` kept, required-ness dropped. `.partial()` preserves
 * the `.strict()` from `buildKindSchema`, and it keeps SHAPE-checking every field that IS present
 * (nested keys included) — see {@link agentSchemaRefusal} for which of those issues actually refuse.
 */
const AgentReadShape = Agent.partial();

/**
 * The refusal reason for an agent artifact this checkout's schema cannot account for — or `null` when
 * it validates and rendering may proceed.
 *
 * THE RULE, in one line: **absence never refuses; a PRESENT value this checkout cannot interpret
 * always does.** That is the exact boundary between the write path's obligations and the read path's,
 * and getting it wrong in either direction costs something real.
 *
 * REFUSED — the two ways a render goes silently wrong:
 *   - an UNRECOGNIZED KEY. The measured defect: the generator ignores the field and emits a
 *     confident, plausible, wrong file. This is the incident of 2026-08-08 (`aliases`).
 *   - a KNOWN field carrying an UNRECOGNISED SHAPE. The same defect wearing a name we recognise: were
 *     `aliases` widened from `string[]` to objects, {@link agentAliases}' defensive filter would quietly
 *     reduce it to `[]` and the frontmatter would thin with no error anywhere.
 *
 * NOT REFUSED — absence, in every form (a missing field, or an empty required ref-list):
 *   - Required-ness is the WRITE boundary's business, and it already enforces it. The fields a total
 *     parse would additionally demand are ones the write path STAMPS (`id`, `createdAt`, `updatedAt`)
 *     or ones it already refuses a doc for missing (`role`, `outcome`, …).
 *   - Absence cannot produce wrong bytes. An absent field renders as an absent section, which is
 *     honest — the failure mode this seam exists to stop is confident output from unread input.
 *   - Enforcing it here would import the write boundary's COMPLETENESS obligation into a check that
 *     needs only its RECOGNITION obligation, and would refuse every legitimately partial in-memory
 *     fixture in the repo: collateral with no defect behind it.
 *   - `.partial()` ALONE does not get you there, which is why the issue filter below exists:
 *     {@link upcast} INJECTS `context: []` into an agent doc that lacks it, so the field is PRESENT
 *     and trips its own `.min(1)` even after the schema stops requiring it. An injected empty list is
 *     absence wearing a value, and has to be read as absence.
 *
 * Measured 2026-08-08: a total upcast+parse on the READ path failed on 0 of 1,211 live artifacts
 * across all 12 structured kinds. Nothing in the live store needed the relaxation — the fixtures did,
 * which is precisely why the relaxation must be principled rather than tuned until the suite is green.
 */
export function agentSchemaRefusal(stored: StoredDoc): string | null {
  const doc = stored.doc as Record<string, unknown>;
  // Mirror the write boundary (`upcastAndValidate`): forward-migrate an old-shape doc, THEN validate.
  // Skipping the upcast would refuse a doc for lagging BEHIND this checkout — the opposite skew, and
  // not a defect at all (migrate-on-write already handles it). An upcast that throws is not itself a
  // shape verdict, so fall through and let the parse below name the real problem.
  let candidate: unknown = doc;
  try {
    candidate = upcast(doc);
  } catch {
    candidate = doc;
  }
  const parsed = AgentReadShape.safeParse(candidate);
  if (parsed.success) return null;
  // `received: "undefined"` is zod's way of saying the value is ABSENT; every other invalid_type is a
  // value that is THERE and unreadable. Size floors (`too_small` on the ref-lists) are absence too.
  const blocking = parsed.error.issues.filter(
    (issue) =>
      issue.code === "unrecognized_keys" ||
      (issue.code === "invalid_type" && issue.received !== "undefined"),
  );
  if (blocking.length === 0) return null;
  // Every key here came from the STORE, never from a caller — so `storedKeys` charges each unknown
  // field to SCHEMA SKEW and prints the merge-`main` remedy, instead of "this kind does not have it"
  // and an invitation to delete another session's landed work. That is the same authorship split
  // ADR-0290 made for `check:corpus-content`, and it is the whole difference between a refusal a
  // session can act on and one that reads as "you passed a bad field".
  //
  // One seam: this helper diagnoses against the TOTAL arm, so for a doc that is both skewed AND
  // missing required fields it also lists the absences — which are not why we refused. A doc that
  // reached the live store cannot be in that state (the write path enforces them), so this shows up
  // only for a hand-built in-memory fixture, below a headline that is already correct.
  return (
    `agent "${stored.id}" does not validate against this checkout's schema — refusing to render it ` +
    `rather than emit a partial view of it.\n\n` +
    explainDocValidationError(doc, parsed.error, { storedKeys: Object.keys(doc) })
  );
}

/**
 * Resolve `name` to a VALIDATED agent artifact. The one seam every render mode reads its raw fields
 * through, so the fail-closed check cannot be forgotten at one entry point while the others hold it.
 * Callers own the `available` list their own result shape carries.
 */
async function loadAgentDoc(store: Store, name: string): Promise<LoadedAgent> {
  const stored = await store.getDoc(name);
  if (!stored || stored.kind !== "agent") {
    return { ok: false, reason: `no agent "${name}" in the Library.` };
  }
  const refusal = agentSchemaRefusal(stored);
  return refusal === null ? { ok: true, stored } : { ok: false, reason: refusal };
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
  const loaded = await loadAgentDoc(store, name);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, available };
  const { stored } = loaded;
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
 * (never the full Why/How body). The doors are generated from `stepRefs`: an agent WITH a step map (the
 * four well-behaved agents, increment 5) renders per-step doors; an agent WITHOUT one surfaces its
 * `context` refs as a just-in-time pointer MANIFEST instead — never inlined bodies.
 */
export async function renderAgentEssentials(
  store: Store,
  name: string | undefined,
): Promise<RenderAgentResult> {
  const available = await agentIds(store);
  if (name === undefined) {
    return { ok: false, reason: "agents needs a name: storytree agents <name>", available };
  }
  const loaded = await loadAgentDoc(store, name);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, available };
  const { stored } = loaded;
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
  // already past knowing it should). Belt-and-suspenders (ADR-0156 §3, increment 5): this fixed block
  // is the required-inline FULL treatment ("MUST be inline, never a pull"), AND the
  // `escalate-up-when-blocked-or-out-of-scope` guardrail is now cited in every delegatable agent's
  // floor above, so its one-line assertion also renders under rule 2. The block stays a renderer
  // CONSTANT, never rendered from the guardrail body — injecting that body would trip the essentials
  // gate's no-full-body-inline check.
  parts.push("", ...ESCAPE_HATCH);

  // (d) Per-step DOORS from `stepRefs` (inc 2 / ADR-0161). The four well-behaved agents now carry a
  // step map (inc 5), so their doors render; an agent WITHOUT one still surfaces its `context` refs as
  // a just-in-time pointer MANIFEST (never full bodies — ADR-0156 §5), mirroring the digest. Every
  // context ref is validated into missingRefs so the drift guard stays fail-closed on either branch.
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
  const loaded = await loadAgentDoc(store, name);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, steps: [], available };
  const { stored } = loaded;
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
 * Checks 3 (STEP→REFS INTEGRITY) + 4 (NO UNATTACHED CONTEXT) of the essentials gate — the WIRING
 * half, factored out because it needs only the STORED DOC, never a rendered `content` string (unlike
 * checks 1/2 below, which are about the size/shape of a `.claude/agents/*.md` FILE specifically).
 * This split is what lets {@link dedicatedSurfaceAgentGateViolations} hold session-orchestrator /
 * red-builder / green-builder to the SAME wiring invariant every delegatable agent is held to,
 * without also holding their (deliberately un-budgeted — session-orchestrator's own prose alone
 * renders ~8.5k tokens, well over {@link ESSENTIALS_TOKEN_BUDGET}) projection surface to a token
 * budget and body-inline shape that were measured against, and only ever meant for, the delegatable
 * `.claude/agents/*.md` file surface (session-orchestrator-context-integrity-arc).
 *
 * Fail-closed like {@link essentialsGateViolations}: a non-agent / missing id, or one this
 * checkout's schema cannot account for, is itself the one violation returned.
 */
async function wiringIntegrityViolations(store: Store, id: string): Promise<string[]> {
  const violations: string[] = [];
  const stored = await store.getDoc(id);
  if (!stored || stored.kind !== "agent") {
    violations.push(`${id}: not an agent artifact — the essentials gate cannot resolve its step map.`);
    return violations;
  }
  // Fail-closed like every other read (the seam above): an agent this checkout's schema cannot
  // account for is a VIOLATION, not something the gate waves through. Without it the gate would go on
  // checking a file rendered from fields it never saw — measuring the wrong bytes and calling them
  // clean.
  const schemaRefusal = agentSchemaRefusal(stored);
  if (schemaRefusal !== null) {
    violations.push(`${id}: ${schemaRefusal}`);
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

  // 3 + 4 — the WIRING half (see {@link wiringIntegrityViolations}). If the doc itself doesn't
  // resolve/validate, that single violation replaces the two size/shape checks above having anything
  // further to say about a doc that was never read.
  violations.push(...(await wiringIntegrityViolations(store, id)));

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
 * manifest of the artifacts it stands on, pointing at `storytree agents <name>` for the ESSENTIALS
 * render (one-line assertions + per-artifact pull commands since ADR-0156 §6ii — never the full
 * bodies; those come from `storytree library artifact <id>`). This shapes the root main-session
 * projections: CLAUDE.md's region and Codex AGENTS.md (ADR-0051 §3 / ADR-0291).
 */
export async function renderAgentDigest(store: Store, name: string): Promise<RenderDigestResult> {
  const available = await agentIds(store);
  const loaded = await loadAgentDoc(store, name);
  if (!loaded.ok) return { ok: false, reason: loaded.reason, available };
  const { stored } = loaded;
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
      `**Stands on** — assembled from these library artifacts; \`storytree agents ${stored.id}\` renders their one-line assertions + a \`storytree library artifact <id>\` pull command each (bodies stay pull-based, ADR-0156):`,
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
 * subagent files: `session-orchestrator` shapes the root main-session projections (ADR-0051/0291);
 * `red-builder` / `green-builder`
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

/** Quote a one-line string as a TOML basic string. JSON's string grammar is a TOML subset here. */
function tomlBasicString(s: string): string {
  return JSON.stringify(s.replace(/\r?\n/g, " "));
}

/**
 * Render a TOML multiline basic string without letting an agent prompt terminate its own value.
 * Backslashes are escaped first so the prompt reaches Codex byte-for-byte after TOML parsing.
 */
function tomlMultilineBasicString(s: string): string {
  return `"""\n${s.replace(/\\/g, "\\\\").replace(/"""/g, '\\"""')}\n"""`;
}

export type RenderAgentFileResult =
  | { ok: true; name: string; content: string; missingRefs: string[] }
  | { ok: false; reason: string; available: string[] };

/**
 * The `model:` frontmatter value a harness subagent file pins (ADR-0182, amending ADR-0178 §3). The
 * agent's `model` TIER is authoritative; absent → `inherit` (the ADR-0178 default: the spawning
 * session's model). `sonnet`/`opus` are the workhorse/judgment split, and both harness frontmatter
 * contracts (`.claude/agents`, `.cursor/agents`) accept these literal `model:` values, so one resolved
 * string serves both renderers.
 */
export function agentModelFrontmatter(stored: StoredDoc): string {
  const raw = (stored.doc as Record<string, unknown>)["model"];
  return typeof raw === "string" && (raw === "sonnet" || raw === "opus") ? raw : "inherit";
}

/**
 * The agent's DISCOVERY synonyms (ADR-0325 D4), read defensively: a missing field, a null doc, or a
 * non-array value all read as "no aliases" so a malformed doc thins the description rather than
 * throwing mid-render. Mirrors {@link agentModelFrontmatter}'s tolerance of an absent tier.
 */
export function agentAliases(stored: StoredDoc | null | undefined): string[] {
  const raw = stored ? (stored.doc as Record<string, unknown>)["aliases"] : undefined;
  return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === "string" && x.length > 0) : [];
}

/**
 * Resolve a name that may be an ALIAS to the canonical agent id (ADR-0325 D4).
 *
 * A real id always wins and is returned untouched — an alias can never shadow an agent that actually
 * exists, so adding one to some artifact cannot silently re-point a caller at a different agent.
 * Only when no agent carries the name is the `aliases` field consulted; ties resolve to the
 * lowest-sorting id so the mapping is deterministic rather than store-order dependent. An unknown
 * name is returned UNCHANGED (never null), so every caller's existing fail-closed path — which
 * reports the name it was given and lists the agents that do exist — keeps reporting what the user
 * actually typed.
 *
 * This is the CLI-side half of D4. It does NOT make an alias spawnable as a harness `subagent_type`:
 * that resolution is the harness's, keyed on the `name:` frontmatter alone.
 *
 * Deliberately NOT routed through `loadAgentDoc`: this is a NAME LOOKUP, not a render, and it reads
 * only `kind`/`aliases` — fields no skew can silently thin. Refusing here would make an unrelated
 * agent's schema skew break the resolution of every OTHER name, and the refusal has nowhere honest to
 * go (this returns a name, not a result type). The doc it resolves TO is validated at render, which
 * is the moment a field actually gets read.
 */
export async function resolveAgentAlias(
  store: Store,
  name: string | undefined,
): Promise<string | undefined> {
  if (name === undefined) return undefined;
  const direct = await store.getDoc(name);
  if (direct && (direct.doc as Record<string, unknown>)["kind"] === "agent") return name;
  const docs = await store.queryDocs({ kind: "agent" });
  const match = docs
    .filter((d) => agentAliases(d).includes(name))
    .map((d) => d.id)
    .sort()[0];
  return match ?? name;
}

/**
 * The `description:` value every harness subagent file carries. The agent's own one-line description,
 * with its {@link agentAliases} appended as `(aliases: a, b)` when it has any — so a session reaching
 * for "a scout" finds `explorer` in the harness's agent listing.
 *
 * The alias list rides the DESCRIPTION rather than minting a second agent file per alias, and that is
 * the whole of ADR-0325 D4's mechanism: the harness resolves `subagent_type` by the `name:` line
 * alone, so an alias is a synonym in the index, never a second spawnable door. Duplicating the file
 * would buy that second door at the price of another full agent entry in EVERY session's system
 * prompt — the preamble weight ADR-0323 D3 exists to hold down.
 */
export function agentDescriptionFrontmatter(
  stored: StoredDoc | null | undefined,
  description: string,
): string {
  const aliases = agentAliases(stored);
  return aliases.length > 0 ? `${description} (aliases: ${aliases.join(", ")})` : description;
}

/**
 * Render the committed `.claude/agents/<id>.md` view of an agent: Claude Code subagent frontmatter
 * (`name` / `description` / `model`) + the generated marker + the ESSENTIALS system prompt (via
 * {@link renderAgentEssentials} — ADR-0156 §6ii re-decided this off the full-inline `renderAgentPrompt`
 * so the machine-only subagent files stay thin, DRY, and fresh). One trailing newline, for
 * deterministic on-disk content. The `model:` line is the ADR-0182 tier pin (workhorse/judgment split);
 * absent tier renders `inherit`, the prior ADR-0052/0178 behaviour. `tools` is intentionally OMITTED —
 * the subagent inherits the full surface and the prose Tools section carries the guidance; mapping the
 * prose grant to a structured allow-list is future work (ADR-0052).
 */
async function renderHarnessAgentFile(
  store: Store,
  name: string,
  extraFrontmatter: (stored: StoredDoc) => string[] = () => [],
): Promise<RenderAgentFileResult> {
  const res = await renderAgentEssentials(store, name);
  if (!res.ok) return res;
  const { agent } = res;
  // re-fetch the stored doc for the structured `model` tier (essentials returns the assembled prompt,
  // not the raw doc); the agent is known to exist here since renderAgentEssentials resolved it — and
  // to VALIDATE against this checkout's schema, since that resolution went through `loadAgentDoc`. So
  // the raw reads below (`agentModelFrontmatter` / `agentAliases`) are reads of a checked doc.
  const stored = await store.getDoc(name);
  const frontmatter = [
    "---",
    `name: ${agent.name}`,
    `description: ${yamlDoubleQuoted(agentDescriptionFrontmatter(stored, agent.description))}`,
    ...(stored ? extraFrontmatter(stored) : []),
    "---",
  ].join("\n");
  return {
    ok: true,
    name: agent.name,
    content: `${frontmatter}\n\n${GENERATED_AGENT_MARKER}\n\n${agent.prompt}\n`,
    missingRefs: agent.missingRefs,
  };
}

export async function renderAgentFile(store: Store, name: string): Promise<RenderAgentFileResult> {
  return renderHarnessAgentFile(store, name, (stored) => [`model: ${agentModelFrontmatter(stored)}`]);
}

/**
 * Render the committed `.cursor/agents/<id>.md` view of the same Library agent. Cursor receives the
 * identical essentials prompt plus the explicit `model` tier (ADR-0182, amending ADR-0178 §3's
 * `inherit`-only minimum — the same tier the Claude view pins, both harnesses accept the value);
 * readonly/background policy remains absent until the Library carries those grants structurally.
 */
export async function renderCursorAgentFile(
  store: Store,
  name: string,
): Promise<RenderAgentFileResult> {
  return renderHarnessAgentFile(store, name, (stored) => [`model: ${agentModelFrontmatter(stored)}`]);
}

/**
 * Render the committed `.gemini/agents/<id>.md` view consumed by Gemini CLI custom subagents.
 * Gemini receives the same essentials prompt but deliberately inherits the spawning session model:
 * the Library's `sonnet` / `opus` tiers are Claude-specific labels, not Gemini model identifiers.
 * Optional execution policy (`tools`, turn/time limits) stays absent until the Library can express
 * those grants structurally.
 */
export async function renderGeminiAgentFile(
  store: Store,
  name: string,
): Promise<RenderAgentFileResult> {
  return renderHarnessAgentFile(store, name);
}

/**
 * Render the committed `.opencode/agent/<id>.md` view consumed by OpenCode subagents (the
 * onboard-non-claude-models arc: Kimi K3 drives the outer loop through OpenCode). OpenCode agent
 * files are Markdown with YAML frontmatter; `mode: subagent` makes the agent delegatable through
 * the harness's task tool without letting it take over the primary session. No `model` key: the
 * Library's `sonnet`/`opus` tiers are Claude-specific labels, not OpenCode model identifiers, so
 * the subagent inherits the spawning session's model — the session pins its model in
 * `opencode.json` and the fan-out follows it (the Gemini-target rationale).
 */
export async function renderOpencodeAgentFile(
  store: Store,
  name: string,
): Promise<RenderAgentFileResult> {
  return renderHarnessAgentFile(store, name, () => ["mode: subagent"]);
}

/**
 * Render the committed `.codex/agents/<id>.toml` view of a Library agent. Codex custom agents
 * require a name, description, and developer instructions; model selection deliberately inherits
 * from the spawning session because the Library's Claude-oriented sonnet/opus tiers are not Codex
 * model identifiers.
 */
export async function renderCodexAgentFile(
  store: Store,
  name: string,
): Promise<RenderAgentFileResult> {
  const res = await renderAgentEssentials(store, name);
  if (!res.ok) return res;
  const { agent } = res;
  // the stored doc carries the structured `aliases` (the essentials render returns only the prompt);
  // the agent is known to exist AND to validate against this checkout's schema here, since
  // renderAgentEssentials resolved it through `loadAgentDoc` (the renderHarnessAgentFile note).
  const stored = await store.getDoc(name);
  return {
    ok: true,
    name: agent.name,
    content: [
      `name = ${tomlBasicString(agent.name)}`,
      `description = ${tomlBasicString(agentDescriptionFrontmatter(stored, agent.description))}`,
      `developer_instructions = ${tomlMultilineBasicString(`${GENERATED_AGENT_MARKER}\n\n${agent.prompt}`)}`,
      "",
    ].join("\n"),
    missingRefs: agent.missingRefs,
  };
}

/** The ids that render to harness subagent files — every agent minus the dedicated-surface roles. */
export async function delegatableAgentIds(store: Store): Promise<string[]> {
  const docs = await store.queryDocs({ kind: "agent" });
  return docs
    .map((d) => d.id)
    .filter((id) => !DEDICATED_SURFACE_AGENTS.has(id))
    .sort();
}

// ── closing the DEDICATED_SURFACE_AGENTS gate hole (session-orchestrator-context-integrity-arc) ───
// `delegatableAgentIds()` correctly excludes DEDICATED_SURFACE_AGENTS from the per-harness FILE
// render loop (they own a different projection surface — CLAUDE.md/AGENTS.md for session-orchestrator,
// the SDK-leaf prompt for red-builder/green-builder — not a `.claude/agents/*.md` file). But
// `check:agents` (build-agents.ts) discovers which ids to run the essentials gate against by walking
// that SAME delegatable list, so the file-render exclusion silently also opted these three agents out
// of the WIRING invariant every other agent is held to (ADR-0156 §5 / ADR-0161 decision 5) —
// measured: session-orchestrator carried 6 unattached context refs and a stepRefs target absent from
// context, and `pnpm gate` never saw it.
//
// The fix runs {@link wiringIntegrityViolations} (checks 3+4 only — see its own doc comment for why
// NOT the full {@link essentialsGateViolations}) over the fixed DEDICATED_SURFACE_AGENTS set, BESIDE
// the delegatable-agent loop — it does not touch `delegatableAgentIds()` or the per-harness file
// render, so the correct file-render exclusion is unchanged, and no `.claude/agents/<id>.md` is ever
// rendered or read for these three ids.

/**
 * The WIRING-gate violations (step→refs integrity + no-unattached-context) for every
 * DEDICATED_SURFACE_AGENT (session-orchestrator, red-builder, green-builder) — the invariant
 * `check:agents` already enforces on every OTHER agent, extended to the three that own a dedicated
 * projection surface instead of a `.claude/agents/*.md` file. Deliberately does NOT run the
 * size/body-inline checks ({@link essentialsGateViolations}'s 1/2) — those are budgeted against the
 * delegatable-subagent FILE surface specifically and do not apply to session-orchestrator's own,
 * much larger, CLAUDE.md/AGENTS.md prose (see {@link wiringIntegrityViolations}).
 */
export async function dedicatedSurfaceAgentGateViolations(store: Store): Promise<string[]> {
  const violations: string[] = [];
  for (const id of DEDICATED_SURFACE_AGENTS) {
    violations.push(...(await wiringIntegrityViolations(store, id)));
  }
  return violations;
}
