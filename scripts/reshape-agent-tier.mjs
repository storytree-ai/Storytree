// Reshape the library's `agent` tier (owner calls, 2026-06-14).
//
// Idempotent corpus patcher: UPSERTs new/evolved units by id and REMOVEs retired ids in
// apps/studio/data/knowledge.json (the git-reviewable seed where the agent tier was
// originally authored). Re-runnable — same input, same output. After running, regenerate
// the derived views: `pnpm --filter studio exec tsx data/build-corpus.mjs`.
//
// The reshape (3 increments, one script):
//   - LEAF SPLIT: two leaf agents (separate test-authoring vs flip-to-green prompts the
//     owner expects), captured from the LIVE leaf prompt in packages/agent/src/sdk-author.ts.
//   - THREE CURATORS: story-author (work hierarchy) · guidance-curator (behavioural floor +
//     guardrail promotion + agent-guardrail proposals + tool grants) · librarian-curator
//     (corpus structure: dedupe / cross-link / reference tier / prune).
//   - EVOLVE: library-investigator -> corpus-investigator; friction-analyst; and
//     agent-signal-synthesis -> graduation-synthesist (deferred).
//   - GRADUATE the guidance inputs these agents need from
//     docs/research/agent-guidance-candidates.json (evolved to current vocabulary).
//   - RETIRE the 3 spine-phases-as-agents drafts + the 2 duplicate curator drafts.
//
// Constraint honoured: an `agent` unit's injected ref-lists (context/rules/antiPatterns) AND
// its `references` bibliography are `asset:`-only — NO ADRs as agent inputs (a normalization
// pass strips any `doc:` ref from every agent at the end). ADR lineage lives in `provenance`
// prose. Graduated GUIDANCE units keep their ADR `doc:` sources — they are not agents.

import { readFileSync, writeFileSync } from "node:fs";

const KNOWLEDGE = new URL("../apps/studio/data/knowledge.json", import.meta.url);
const CANDIDATES = new URL("../docs/research/agent-guidance-candidates.json", import.meta.url);

const corpus = JSON.parse(readFileSync(KNOWLEDGE, "utf8"));
const candidates = JSON.parse(readFileSync(CANDIDATES, "utf8"));

const NOW = "2026-06-14T00:00:00.000Z";
const byId = (arr, id) => arr.find((u) => u.id === id);
const schemaVersionFor = (kind) => {
  const peer = corpus.find((u) => (u.kind ?? u.category) === kind && "schemaVersion" in u);
  return peer ? peer.schemaVersion : 2;
};

function upsert(unit) {
  const i = corpus.findIndex((u) => u.id === unit.id);
  if (i >= 0) corpus[i] = unit;
  else corpus.push(unit);
}
function remove(id) {
  const i = corpus.findIndex((u) => u.id === id);
  if (i >= 0) corpus.splice(i, 1);
}

/** Graduate a candidate guidance unit into the live corpus, lightly evolved. */
function graduate(id, { provenance, references } = {}) {
  const c = byId(candidates, id);
  if (!c) throw new Error(`candidate not found: ${id}`);
  upsert({
    ...c,
    schemaVersion: schemaVersionFor(c.kind),
    ...(references ? { references } : {}),
    ...(provenance ? { provenance } : {}),
    updatedAt: NOW,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Graduated guidance inputs (evolved provenance → current roster).
// ─────────────────────────────────────────────────────────────────────────────
graduate("slow-growth-minimum-to-green", {
  provenance:
    "Harvested from V1 `build-rust` 'slow growth' guidance; graduated for v2 (owner call, 2026-06-14). " +
    "Consumers: leaf-implementer.",
});
graduate("baseline-preservation", {
  provenance:
    "Harvested from V1 `build-rust` (baseline preservation) + `test-builder` (preserve-existing); " +
    "graduated for v2 (owner call, 2026-06-14). Consumers: leaf-implementer, leaf-test-author.",
});
graduate("right-kind-red", {
  provenance:
    "Harvested from V1 `test-builder` (right-kind red); graduated for v2 (owner call, 2026-06-14). " +
    "Its enforcement (defaultClassifyKind + nextPhase) is live spine code. Consumers: leaf-test-author.",
});
graduate("journey-principle", {
  provenance:
    "Harvested from V1 `story-writer` (journey-principle), re-tiered to the v2 story (ADR-0002/0010); " +
    "graduated for v2 (owner call, 2026-06-14). Consumers: story-author.",
});
graduate("splitting-rule", {
  provenance:
    "Harvested from V1 `story-writer` (splitting-rule); graduated for v2 (owner call, 2026-06-14). " +
    "Consumers: story-author.",
});
graduate("proof-walkthrough-first", {
  provenance:
    "Harvested from V1 `story-writer` (proof-walkthrough-as-sizing-test); graduated for v2 " +
    "(owner call, 2026-06-14). Consumers: story-author.",
});
graduate("survival-test-for-adrs", {
  provenance:
    "Harvested from V1 `story-writer` (survival test for ADRs); graduated for v2 (owner call, 2026-06-14). " +
    "Consumers: guidance-curator.",
});
graduate("stateless-vs-stateful-graduation", {
  // Drop the dangling `asset:oq-feedback-graduation-mechanism` (that OQ was retired by ADR-0032).
  references: [
    "doc:decisions/0008-ui-drives-agents-approvals.md",
    "asset:human-owns-the-outer-loop",
    "asset:signal-and-noise",
  ],
  provenance:
    "Harvested from V1 `memory-curator` (stateless-vs-stateful discriminator + preservation bias); " +
    "graduated for v2 (owner call, 2026-06-14). Consumers: guidance-curator, graduation-synthesist.",
});
graduate("reference-dont-restate", {
  provenance:
    "The v2 form of V1's `inputs.yml required_reading` + `assets/` mechanism; graduated for v2 " +
    "(owner call, 2026-06-14). Consumers: every authored agent + curator (cite, don't restate).",
});
graduate("two-consumer-extraction", {
  provenance:
    "Harvested from V1 `guidance-writer` (2+-consumer extraction); graduated for v2 (owner call, 2026-06-14). " +
    "Consumers: librarian-curator, guidance-curator.",
});
graduate("least-authority-tool-grants", {
  provenance:
    "Harvested from V1 `guidance-writer` (minimal-tool-grants); graduated for v2 (owner call, 2026-06-14). " +
    "Owns tool-grant discipline under guidance-curator (owner boundary call, 2026-06-14). " +
    "Consumers: guidance-curator, and every authored agent's Tools field.",
});
graduate("live-store-is-the-edit-surface", {
  provenance:
    "Harvested from the CLAUDE.md library-iteration rules + ADR-0023 §11; graduated for v2 " +
    "(owner call, 2026-06-14). Consumers: story-author, guidance-curator, librarian-curator.",
});
graduate("authoritative-source-beats-derived", {
  provenance:
    "Harvested from V1 `system-investigator` (authoritative-source-beats-derived), re-pointed to the v2 " +
    "source map; graduated for v2 (owner call, 2026-06-14). Consumers: corpus-investigator.",
});
graduate("no-claim-without-evidence", {
  provenance:
    "Harvested from V1 `build-rust` (the f53caac lesson) + `system-investigator` + `trace-explorer`; " +
    "graduated for v2 (owner call, 2026-06-14). Consumers: corpus-investigator, friction-analyst, leaf-* (escalation).",
});

// ─────────────────────────────────────────────────────────────────────────────
// Leaf agents — captured from the live sdk-author prompt, split by phase.
// ─────────────────────────────────────────────────────────────────────────────
const LEAF_CAPTURE =
  "Captured from the LIVE leaf system prompt — `leafSystemPrompt()` / `SYSTEM_PROMPT_BASE` plus the " +
  "no-feedback / feedback closings in packages/agent/src/sdk-author.ts — and split by phase per the " +
  "owner's call (2026-06-14) that test-authoring and flipping-to-green want separate prompts. The " +
  "runtime still injects ONE phase-agnostic prompt today; making sdk-author select the per-phase " +
  "prompt is the injection step, deferred until the owner is ready (ADR-0030 territory). ";

upsert({
  kind: "agent",
  id: "leaf-test-author",
  title: "leaf-test-author",
  description:
    "The red-state author time-sliced into the prove-it gate's AUTHOR_TEST phase: it writes the " +
    "single failing test that pins the new behaviour and stops — it never records or claims the " +
    "red, because the spine observes it.",
  schemaVersion: 2,
  oneLine:
    "The red-state author time-sliced into the prove-it gate's AUTHOR_TEST phase: it writes the " +
    "single failing test that pins the new behaviour and stops — the spine, not the leaf, observes the red.",
  role:
    "Time-sliced by the spine into the prove-it gate's AUTHOR_TEST phase, `leaf-test-author` writes " +
    "the ONE failing test that pins the phase brief's new behaviour, then stops. It works only inside " +
    "the workspace and writes ONLY the test file(s) the brief allows — an out-of-scope write is refused " +
    "by the fail-closed `PreToolUse` scope hook, and that refusal is final for the phase. It does not " +
    "implement, and it never records or claims the red: RED is data the spine derives from the test " +
    "process's own exit, not a thing the leaf asserts.",
  outcome:
    "The test file the brief names is written within scope and fails for the RIGHT reason — the missing " +
    "symbol or the assertion the new behaviour requires, never a syntax error or an unrelated breakage. " +
    "The spine's own out-of-band run is the red; the leaf's claim is never the proof. The leaf stops when " +
    "the test is written — no implementation, no claim of red, no spawning.",
  context: ["asset:prove-it-gate", "asset:red-green", "asset:spine-sequences-leaf-judges"],
  tools:
    "Read / Write / Edit / Glob / Grep — NO Bash, by design: the leaf cannot run the suite; the spine " +
    "observes the result itself. Writes are scope-gated by a fail-closed `PreToolUse` hook (only the " +
    "brief's allowed file(s) are writable). When feedback tools are wired (`mcp__spine__*`), their output " +
    "is FEEDBACK ONLY — the spine re-runs the command after the leaf stops, and only that observation counts.",
  workflow:
    "**session_start:** read the phase brief — the behaviour to pin and the exact test file(s) in scope.\n\n" +
    "1. Write the single failing test that pins that behaviour, and nothing more.\n" +
    "2. (If feedback tools exist) check that it fails for the right KIND of red; do not try to make it pass.\n" +
    "3. Stop when the test is written — no implementation, no claim of red, no spawning.",
  rules: [
    "asset:test-creation-principles",
    "asset:test-fixtures-mirror-production-failure-modes",
    "asset:baseline-preservation",
    "asset:dogfood-fix-the-source",
  ],
  antiPatterns: [
    "asset:right-kind-red",
    "asset:reward-hacking",
    "asset:implementer-shortcut-patterns",
    "asset:faked-uat-theatre",
    "asset:agent-never-self-exempts",
  ],
  escalation:
    "If a frozen input is itself wrong — the contract you must pin is incoherent, or a fixture you may " +
    "not edit forces a wrong-kind red — stop and say so plainly instead of working around it. The spine " +
    "routes the fix to the owning surface (story-author / a curator), never to the leaf.",
  references: [],
  provenance:
    LEAF_CAPTURE +
    "Supersedes the retired `agent-owned-loop-test-author` draft, which cited ungraduated candidate refs. " +
    "No ADRs are injected: this role searches ADRs just-in-time via the library.",
  createdAt: NOW,
  updatedAt: NOW,
});

upsert({
  kind: "agent",
  id: "leaf-implementer",
  title: "leaf-implementer",
  description:
    "The implementer leaf time-sliced into the prove-it gate's IMPLEMENT phase: it writes the minimum " +
    "source that turns the red test green without regression, and never edits the test it must satisfy.",
  schemaVersion: 2,
  oneLine:
    "The implementer leaf time-sliced into the prove-it gate's IMPLEMENT phase: it writes the minimum " +
    "source that turns the red test green without regression, and never claims its own green.",
  role:
    "Time-sliced by the spine into the prove-it gate's IMPLEMENT phase, `leaf-implementer` writes the " +
    "minimum source that turns the brief's red test green without breaking anything already green. It " +
    "works only inside the workspace and writes ONLY the source file(s) the brief allows — out-of-scope " +
    "writes (including the test it must satisfy) are refused by the fail-closed `PreToolUse` scope hook, " +
    "final for the phase. GREEN is the spine's observation, not the leaf's assertion.",
  outcome:
    "The brief's deliverable source is written within scope; the spine's own out-of-band re-run is green " +
    "with no regression against the session baseline. The leaf's claim of green is never the proof. The " +
    "leaf stops when the deliverable is written (and checked, if feedback tools exist).",
  context: ["asset:prove-it-gate", "asset:red-green", "asset:spine-sequences-leaf-judges"],
  tools:
    "Read / Write / Edit / Glob / Grep — NO Bash, by design: the leaf cannot run the suite; the spine " +
    "observes green itself. Writes are scope-gated by a fail-closed `PreToolUse` hook (the brief's source " +
    "file(s) only — never the test). When feedback tools are wired (`mcp__spine__*`), their output is " +
    "FEEDBACK ONLY — the spine re-runs the command after the leaf stops, and only that observation counts.",
  workflow:
    "**session_start:** read the phase brief — the red test to satisfy and the exact source file(s) in scope.\n\n" +
    "1. Write the SMALLEST source change that turns that one test green — no speculative abstraction, " +
    "dependency, or refactor.\n" +
    "2. (If feedback tools exist) check your work and iterate within scope — never edit the test, never widen scope.\n" +
    "3. Stop when the deliverable is written — no claim of green, no spawning.",
  rules: [
    "asset:slow-growth-minimum-to-green",
    "asset:baseline-preservation",
    "asset:dogfood-fix-the-source",
    "asset:verify-edit-write-persisted-or-escalate",
  ],
  antiPatterns: [
    "asset:reward-hacking",
    "asset:implementer-shortcut-patterns",
    "asset:faked-uat-theatre",
    "asset:agent-never-self-exempts",
  ],
  escalation:
    "If you conclude a frozen input is itself wrong — e.g. the test you must satisfy but may not edit is " +
    "wrong — stop and say so plainly instead of working around it. The spine routes the fix to the owning " +
    "surface, never to the leaf.",
  references: [],
  provenance:
    LEAF_CAPTURE +
    "Supersedes the retired `agent-owned-loop-builder` draft, which cited ungraduated candidate refs. " +
    "No ADRs are injected: this role searches ADRs just-in-time via the library.",
  createdAt: NOW,
  updatedAt: NOW,
});

// ─────────────────────────────────────────────────────────────────────────────
// The three curators (owner's 3-way split, 2026-06-14).
// ─────────────────────────────────────────────────────────────────────────────
upsert({
  kind: "agent",
  id: "story-author",
  title: "story-author",
  description:
    "The dedicated author of the work hierarchy (story › capability › contract): it bounds one provable " +
    "journey per story and wires the dependency graph, through the live Library write boundary — the role " +
    "that keeps stories from being improvised by the leaf mechanics or the orchestrator session.",
  schemaVersion: 2,
  oneLine:
    "The dedicated author of the work hierarchy (story › capability › contract): one provable journey per " +
    "story, the dependency graph between them, authored through the live Library write boundary.",
  role:
    "story-author owns WHAT gets built: the work DAG of stories, capabilities, and contracts. It bounds " +
    "each story to one complete user journey, decides whether and how to split, drafts the proof-walkthrough " +
    "that sizes a unit before its prose, and wires the `depends_on` graph from real prerequisites — authoring " +
    "zod-validated units through the `storytree story` / `library` CLI against the live store. It does NOT " +
    "implement, prove, or promote: a unit EXISTS when authored; green-ness is the gate's later, separate verdict.",
  outcome:
    "Each authored story states one journey whose outcome needs no conjunctions and whose proof is a single " +
    "coherent UAT walkthrough; every capability/contract under it has a writable proof at its tier; the " +
    "dependency graph is acyclic and re-derivable from real prerequisites. The write persists through the CLI " +
    "boundary (`--pg`) or the author escalates — a silent no-op is a failure.",
  context: ["asset:recursive-decomposition-patterns", "asset:standalone-resilient-library", "asset:deep-modules"],
  tools:
    "Read / Grep / Glob; the `storytree story` and `storytree library artifact new|edit --pg` write surface " +
    "(validated at the boundary; `--pg` required — bring the DB up first). Least-authority: no gate, no " +
    "promotion verb, no implementation.",
  workflow:
    "**session_start:** read the target story/brief and the LIVE tier state (`--pg`); the tier rules are " +
    "searched just-in-time, not preloaded.\n\n" +
    "1. Bound the journey (one journey per story); apply the splitting-rule only on its two falsifiable triggers.\n" +
    "2. Draft the proof-walkthrough FIRST at each tier — if no coherent walkthrough exists, re-tier before authoring.\n" +
    "3. Author the units through the CLI write boundary; wire `depends_on` from real prerequisites only.\n" +
    "4. Verify each write persisted; escalate story-shape calls that need an owner decision. Stop — never implement or prove.",
  rules: [
    "asset:journey-principle",
    "asset:splitting-rule",
    "asset:proof-walkthrough-first",
    "asset:edit-first-curation",
    "asset:defects-amend-the-owning-story",
    "asset:verify-edit-write-persisted-or-escalate",
  ],
  antiPatterns: ["asset:live-store-is-the-edit-surface", "asset:never-bypass-the-gate", "asset:agent-never-self-exempts"],
  escalation:
    "Story-shape calls that outlive the unit (a new tier boundary, a cross-cutting split, a decision worth an " +
    "ADR) are surfaced to the human outer loop, never decided unilaterally; a write that won't persist is " +
    "reported, not worked around.",
  references: [],
  provenance:
    "Evolved from V1 `legacy/Agentic/agents/planner/story-writer` (disposition: evolve). The dedicated story " +
    "author the owner asked for (2026-06-14) after seeing stories improvised by the leaf mechanics or the " +
    "orchestrator session. Re-tiered to v2's story › capability › contract and the live Cloud SQL write " +
    "boundary. Distinct from guidance-curator (rule content) and librarian-curator (corpus structure). " +
    "No ADRs injected — searched just-in-time.",
  createdAt: NOW,
  updatedAt: NOW,
});

upsert({
  kind: "agent",
  id: "guidance-curator",
  title: "guidance-curator",
  description:
    "The author of the behavioural floor — principles, guardrails, and patterns — and of guardrail-promotion " +
    "and agent-guardrail proposals and tool grants; it decides whether a rule is true, durable, and well-stated " +
    "before it enters the corpus.",
  schemaVersion: 2,
  oneLine:
    "The author of the behavioural floor (principle / guardrail / pattern), of guardrail promotion and " +
    "agent-guardrail proposals, and of minimal tool grants — guidance content, not corpus structure.",
  role:
    "guidance-curator owns HOW the system is built: the durable guidance units (principle / guardrail / " +
    "pattern). It judges whether a candidate rule survives (would it outlive the unit that prompted it), " +
    "whether it is stateless enough to graduate, and states it ONCE so consumers cite rather than restate. " +
    "It owns the promotion of softer guidance INTO guardrails, the authoring of agent-guardrail proposals " +
    "(the failure modes a role must refuse), and tool-grant discipline (least-authority). It authors through " +
    "the live Library write boundary. It does NOT author the work hierarchy (story-author) or maintain corpus " +
    "structure (librarian-curator).",
  outcome:
    "Each authored guidance unit is true, falsifiable, and reconstructible-tested (not generic craft); a " +
    "guardrail names its deterministic enforcer or it is a pattern, not a guardrail; an agent-guardrail proposal " +
    "names the failure mode AND the role that must refuse it; a tool grant names the workflow step that demands " +
    "each tool. The write persists through the CLI boundary or the curator escalates.",
  context: ["asset:signal-and-noise", "asset:guidance-quality", "asset:deep-modules"],
  tools:
    "Read / Grep / Glob; `storytree library artifact new|edit --pg` (validated boundary; `--pg` required). " +
    "Least-authority: no gate, no promotion of a unit to proven, no story authoring.",
  workflow:
    "**session_start:** read the candidate guidance + the live corpus neighbourhood (`--pg`); ADRs searched " +
    "just-in-time.\n\n" +
    "1. Survival test — would the decision outlive its prompting unit? Fail → it belongs in that unit's guidance, not here.\n" +
    "2. Stateless test — only stateless rules graduate; uncertain WITHHOLDS (preservation bias).\n" +
    "3. Author once, well, by the right kind; a guardrail MUST name its enforcer or it is a pattern.\n" +
    "4. For a hardening call, draft the guardrail-promotion or agent-guardrail proposal and surface it.\n" +
    "5. Verify the write persisted. Stop.",
  rules: [
    "asset:survival-test-for-adrs",
    "asset:stateless-vs-stateful-graduation",
    "asset:reference-dont-restate",
    "asset:least-authority-tool-grants",
    "asset:two-consumer-extraction",
    "asset:edit-first-curation",
  ],
  antiPatterns: ["asset:live-store-is-the-edit-surface", "asset:never-bypass-the-gate", "asset:agent-never-self-exempts"],
  escalation:
    "Promotion of guidance into a guardrail, a new agent-guardrail, or any decision worth an ADR is a proposal " +
    "to the human outer loop, never enacted unilaterally; ratification stays owner-held.",
  references: [],
  provenance:
    "Evolved from V1 `legacy/Agentic/agents/teacher/guidance-writer` (guidance/assets half). Split out from the " +
    "merged `library-curator` per the owner's 3-way call (2026-06-14): it authors guidance CONTENT + guardrail " +
    "promotion + agent-guardrail proposals + tool-grant discipline (the owner moved tool grants here, 2026-06-14), " +
    "distinct from story-author (work hierarchy) and librarian-curator (corpus structure). No ADRs injected.",
  createdAt: NOW,
  updatedAt: NOW,
});

upsert({
  kind: "agent",
  id: "librarian-curator",
  title: "librarian-curator",
  description:
    "The keeper of the Library as a library: it dedupes new material against the existing corpus, maintains " +
    "cross-references and the reference tier (definitions / glossary / techstack), and prunes reconstructible " +
    "guidance — structure, not rule content.",
  schemaVersion: 2,
  oneLine:
    "The keeper of the Library as a library: dedupe against the corpus, maintain cross-references and the " +
    "reference tier, prune reconstructible guidance — structure and health, not rule content or work units.",
  role:
    "librarian-curator keeps the corpus coherent. Before anything new lands it checks novelty against the " +
    "existing corpus (the anti-slop dedupe), folds duplicates via edit-first, and extracts a shared unit only " +
    "when two-or-more CURRENT consumers share it. It owns the reference tier — definitions, the generated " +
    "glossary view, techstack — and structural health: cross-links resolve, reconstructible generic-craft " +
    "guidance is pruned, the Library stays standalone-resilient. It does NOT author the work hierarchy " +
    "(story-author) or the behavioural rule content (guidance-curator); it curates where things sit and whether " +
    "they belong.",
  outcome:
    "New material is either a genuinely novel unit or an edit to the existing one — never a near-duplicate; " +
    "every extracted unit names its 2+ consumers; the reference tier is internally consistent and the glossary " +
    "view regenerates clean; pruning proposals cite the blind-reconstruction test. Writes persist through the " +
    "CLI boundary or the librarian escalates.",
  context: ["asset:standalone-resilient-library", "asset:pull-based-context-architecture", "asset:signal-and-noise"],
  tools:
    "Read / Grep / Glob; `storytree library` read + `artifact edit|new --pg` (validated boundary); the " +
    "corpus-build view regeneration. Least-authority: no story authoring, no gate.",
  workflow:
    "**session_start:** read the live corpus index (`--pg`) and the area in question.\n\n" +
    "1. Novelty check — does an existing unit already cover this? Dedupe against the corpus before any new write.\n" +
    "2. If covered, edit-first; if shared by 2+ consumers, extract a unit naming them; below two, leave it in place.\n" +
    "3. Maintain the reference tier + cross-links; flag reconstructible guidance for pruning (blind-reconstruction test).\n" +
    "4. Verify writes persisted and the glossary view regenerates. Stop — rule content is guidance-curator's, work units are story-author's.",
  rules: [
    "asset:edit-first-curation",
    "asset:two-consumer-extraction",
    "asset:reference-dont-restate",
    "asset:glossary-wins",
    "asset:doc-vs-implementation-precedence",
    "asset:guidance-quality",
  ],
  antiPatterns: ["asset:live-store-is-the-edit-surface", "asset:never-bypass-the-gate"],
  escalation:
    "A prune that removes a unit other units cite, a structural change to the reference tier, or a dedupe " +
    "judgement the owner should ratify is surfaced, not enacted; structural integrity vetoes deletion.",
  references: [],
  provenance:
    "Evolved from V1 `legacy/Agentic/agents/teacher/guidance-writer` (corpus-structure half) + the curator " +
    "drafts. Split out per the owner's 3-way call (2026-06-14): the librarian keeps the catalog (dedupe, " +
    "cross-link, reference tier, prune) and does NOT own rule content (guidance-curator) or work units " +
    "(story-author); tool-grant discipline moved to guidance-curator per the owner's boundary correction " +
    "(2026-06-14). No ADRs injected.",
  createdAt: NOW,
  updatedAt: NOW,
});

// ─────────────────────────────────────────────────────────────────────────────
// Evolve: library-investigator → corpus-investigator (rename + graduate its refs).
// ─────────────────────────────────────────────────────────────────────────────
{
  const inv = structuredClone(byId(corpus, "library-investigator"));
  inv.id = "corpus-investigator";
  inv.title = "corpus-investigator";
  inv.updatedAt = NOW;
  inv.provenance =
    "Renamed library-investigator → corpus-investigator (owner call, 2026-06-14) and its inputs graduated " +
    "(authoritative-source-beats-derived, no-claim-without-evidence now live). " +
    inv.provenance;
  upsert(inv);
  remove("library-investigator");
}

// ─────────────────────────────────────────────────────────────────────────────
// Evolve: friction-analyst (add observability-first context + reward-hacking anti-pattern).
// ─────────────────────────────────────────────────────────────────────────────
{
  const fa = structuredClone(byId(corpus, "friction-analyst"));
  fa.context = ["asset:signal-and-noise", "asset:observability-first"];
  fa.rules = [
    "asset:no-claim-without-evidence",
    "asset:exploration-principles",
    "asset:human-owns-the-outer-loop",
    "asset:reference-dont-restate",
  ];
  fa.antiPatterns = ["asset:reward-hacking"];
  fa.updatedAt = NOW;
  upsert(fa);
}

// ─────────────────────────────────────────────────────────────────────────────
// Evolve: agent-signal-synthesis → graduation-synthesist (rename, re-input; deferred).
// ─────────────────────────────────────────────────────────────────────────────
{
  const gs = structuredClone(byId(corpus, "agent-signal-synthesis"));
  gs.id = "graduation-synthesist";
  gs.title = "graduation-synthesist (deferred) — graduates durable guidance out of the signal-graph";
  gs.context = ["asset:signal-and-noise"];
  gs.rules = [
    "asset:human-owns-the-outer-loop",
    "asset:guidance-quality",
    "asset:stale-prerequisite-links-are-phantoms",
    "asset:reference-dont-restate",
    "asset:stateless-vs-stateful-graduation",
  ];
  gs.antiPatterns = ["asset:never-bypass-the-gate"];
  gs.updatedAt = NOW;
  gs.provenance = "Renamed agent-signal-synthesis → graduation-synthesist (owner call, 2026-06-14). " + gs.provenance;
  upsert(gs);
  remove("agent-signal-synthesis");
}

// ─────────────────────────────────────────────────────────────────────────────
// Retire the broken drafts: 3 spine-phases-as-agents + 2 duplicate curators.
// ─────────────────────────────────────────────────────────────────────────────
remove("agent-owned-loop-builder"); // folded into leaf-implementer
remove("agent-owned-loop-test-author"); // folded into leaf-test-author
remove("agent-prove-it-gate-verdict"); // deleted: the verdict/GATE is spine logic, not an agent
remove("library-curator"); // split into story-author + guidance-curator + librarian-curator
remove("library-curator-agent-spec-half"); // the duplicate "half" — folded into the split above

// ─────────────────────────────────────────────────────────────────────────────
// Normalize: an `agent` unit's `references` (Sources view) is a clean asset-only mirror
// of its injected inputs — context + rules + antiPatterns. This enforces "no ADRs as
// agent inputs" across the whole tier (ADR lineage stays in `provenance` prose).
// ─────────────────────────────────────────────────────────────────────────────
for (const u of corpus) {
  if ((u.kind ?? u.category) === "agent") {
    u.references = [...new Set([...(u.context ?? []), ...(u.rules ?? []), ...(u.antiPatterns ?? [])])];
  }
}

writeFileSync(KNOWLEDGE, JSON.stringify(corpus, null, 2) + "\n", "utf8");
const agents = corpus.filter((u) => (u.kind ?? u.category) === "agent");
console.log(`knowledge.json now holds ${corpus.length} units; ${agents.length} agents:`);
console.log("  " + agents.map((u) => u.id).join(", "));
