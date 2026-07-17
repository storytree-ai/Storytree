// Tree verdict-overlay — the desktop's re-composition of the studio's GET /api/tree proof fold
// (apps/studio/server/apiRouter.ts: readTree + applyUatCrowns/applyCapCoverage/applyOpenQuestionGate).
// It turns the bare authored tree into the SAME verdict-enriched payload the studio frontend folds into
// island/plant hue (apps/studio/src/lib/worldStatus.ts `provenStatus`): a story/cap goes GREEN only when
// it carries a signed `verdict.outcome === 'pass'`. Without this fold every island falls back to its
// authored `status` and paints BROWN — the gap this module closes (ADR-0119 deferred activity overlay).
//
// THE BOUNDARY CALL (the desktop story's "Local-backend boundary call" + ADR-0119): this does NOT import
// apps/studio/server — that is a forbidden surface→surface coupling. It RE-COMPOSES the same algorithm
// over the SAME shared organism primitives the studio handler is built from — `@storytree/orchestrator`'s
// `loadNodeSpec`/`rollupStoryGreen`/`rollupCapStatus`/`gateStoryGreenOnOpenQuestions` and
// `@storytree/library`'s `openQuestionsGatingNode` — exactly as local-backend.ts / boot-read-routes.ts
// reproduce the studio's HTTP helpers + docs walk rather than importing them. Extracting a SHARED
// read-route organism both surfaces mount is the clean consolidation ADR-0119 names as the follow-on
// (it touches the `studio` story); the duplication here is its accepted cost, kept pg-free so the
// desktop's brokered-only write boundary (ADR-0117) holds.
//
// PURE + pg-FREE: no `electron`, no `pg`, no `@storytree/library/store`. The verdict DATA arrives through
// an injected {@link VerdictOverlay} seam (the live pg SQL lives in electron/backend-entry.ts, where the
// `@storytree/library/store` import is sanctioned); the orchestrator/library COMPUTE it folds with is
// browser-safe (raw-TS, loaded lazily — the `.js` re-export trap local-backend.ts already navigates).

import { existsSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

// The raw-TS workspace packages re-export through `.js` specifiers that don't resolve under a non-tsx
// loader; load the runtime VALUES lazily, on first use — the SAME discipline local-backend.ts follows.
let orchestratorModule: Promise<typeof import("@storytree/orchestrator")> | null = null;
const loadOrchestrator = (): Promise<typeof import("@storytree/orchestrator")> =>
  (orchestratorModule ??= import("@storytree/orchestrator"));
let libraryModule: Promise<typeof import("@storytree/library")> | null = null;
const loadLibrary = (): Promise<typeof import("@storytree/library")> =>
  (libraryModule ??= import("@storytree/library"));

// ---------- local wire types (mirror apps/studio/src/types — NOT imported, the surface boundary) ----------

/** The latest signed verdict for a unit (mirrors the studio's `TreeVerdict`). The frontend's
 *  `provenStatus` greens a unit iff `outcome === 'pass'`; `at` drives the recently-landed bloom. */
export interface DTVerdict {
  outcome: "pass" | "fail";
  at: string;
}

/** A capability node in the desktop tree (mirrors the studio's `TreeCapability`). */
export interface DTCapability {
  id: string;
  title: string;
  outcome: string;
  status: string | null;
  proofMode: string;
  dependsOn: string[];
  /**
   * The number of declared leaf contracts (the spec's `## Contracts` section, parsed via
   * `parseContracts` — already folded into `spec.contracts` by `loadNodeSpec`) — 0 when the spec
   * declares no `## Contracts` section. Mirrors the studio's `TreeCapability.testCount`.
   */
  testCount: number;
  buildable?: boolean;
  verdict?: DTVerdict;
  error?: string;
}

/** A story node in the desktop tree (mirrors the studio's `TreeStory`, the read-overlay subset). */
export interface DTStory {
  id: string;
  title: string;
  outcome: string;
  status: string | null;
  proofMode: string;
  uatWitness: "human" | "machine";
  dependsOn: string[];
  consumedBy: string[];
  building?: boolean;
  decisions?: number[];
  verdict?: DTVerdict;
  capabilities: DTCapability[];
  error?: string;
}

/** A raw signed-verdict event (mirrors the orchestrator's `RollupEvent` = Pick<StoreEvent,'kind'|'seq'|'doc'>). */
export interface DTVerdictEvent {
  kind: string;
  seq: number;
  doc: unknown;
}

/** The verdict-read seam folded into the tree — the live pg drivers (electron/backend-entry.ts) or a
 *  test double. Each leg is advisory (ADR-0033): `null` means "proof layer absent" → the tree
 *  under-claims (renders authored hue), never over-claims. Mirrors the studio's tree-handler reads. */
export interface VerdictOverlay {
  /** Latest signed verdict per unit id (events.verdict DISTINCT ON unit_id). */
  latestVerdicts: Record<string, DTVerdict> | null;
  /** The RAW signed-verdict event stream (events.verdict ORDER BY seq) for the per-test crown roll-up. */
  verdictEvents: readonly DTVerdictEvent[] | null;
  /** Open-question artifacts (category 'open-question') — the OQ green-gate reads their `references`. */
  openQuestions: readonly { id: string; references?: readonly string[] }[];
}

const isWorkStatus = (s: string): boolean =>
  ["proposed", "building", "healthy", "unhealthy", "mapped", "retired"].includes(s);

// ---------- tree read with full capabilities (re-composes the studio's readTree) ----------

type LoadNodeSpec = (file: string) => {
  title: string;
  outcome: string;
  status: string;
  proofMode: string;
  uatWitness?: "human" | "machine" | "either" | undefined;
  dependsOn: string[];
  consumedBy: string[];
  capabilities: string[];
  decisions: number[];
  render?: string | undefined;
  uatTestCriteria: { id: string; wouldBe?: boolean }[];
  reliabilityGates: { id: string; covers?: readonly string[] }[];
  // ADR-0020 coverage-honesty follow-on: the capability's declared `## Contracts`, parsed via
  // `parseContracts` and already folded in by `loadNodeSpec` — the count feeds `DTCapability.testCount`.
  contracts: { id: string; title: string }[];
};
type ResolveBuildConfig = (spec: unknown) => unknown;

/** Load one capability spec into a {@link DTCapability} (re-composes the studio's `loadTreeCapability`).
 *  Tolerant: a missing/malformed spec still renders the node with `error` (like `storytree tree`). */
function loadCapability(
  loadNodeSpec: LoadNodeSpec,
  resolveBuildConfig: ResolveBuildConfig,
  storyDir: string,
  capId: string,
): DTCapability {
  const node: DTCapability = {
    id: capId,
    title: capId,
    outcome: "",
    status: null,
    proofMode: "",
    dependsOn: [],
    testCount: 0,
  };
  const file = path.join(storyDir, `${capId}.md`);
  if (!existsSync(file)) return { ...node, error: "spec file missing" };
  try {
    const spec = loadNodeSpec(file);
    return {
      ...node,
      title: spec.title,
      outcome: spec.outcome,
      status: isWorkStatus(spec.status) ? spec.status : null,
      proofMode: spec.proofMode,
      dependsOn: spec.dependsOn,
      buildable: resolveBuildConfig(spec) != null,
      // The declared leaf-contract count (already parsed by `loadNodeSpec` via `parseContracts`).
      testCount: spec.contracts.length,
    };
  } catch (err) {
    return { ...node, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Read the story tree with FULL capabilities + the per-story proof obligations — the desktop analogue
 * of the studio's `readTree` (apiRouter.ts). Returns the bare authored tree (no verdicts yet — that is
 * {@link foldVerdicts}'s job) PLUS the `uatTestCriteriaByStory` / `coverageByStory` maps the crown roll-up needs.
 * Returns `{ stories: [] }` gracefully for a missing/empty dir (the CI test drives that path).
 *
 * Loaded LAZILY via the orchestrator (the raw-TS `.js` re-export trap local-backend.ts already navigates).
 */
export async function readTreeWithCaps(storiesDir: string): Promise<{
  stories: DTStory[];
  uatTestCriteriaByStory: Map<string, { id: string }[]>;
  coverageByStory: Map<string, { id: string; covers?: readonly string[] }[]>;
}> {
  const stories: DTStory[] = [];
  const uatTestCriteriaByStory = new Map<string, { id: string }[]>();
  const coverageByStory = new Map<string, { id: string; covers?: readonly string[] }[]>();
  if (!existsSync(storiesDir)) return { stories, uatTestCriteriaByStory, coverageByStory };

  const { loadNodeSpec, effectiveUatWitness, resolveBuildConfig } = (await loadOrchestrator()) as unknown as {
    loadNodeSpec: LoadNodeSpec;
    effectiveUatWitness: (declared: "human" | "machine" | "either" | undefined) => "human" | "machine";
    resolveBuildConfig: ResolveBuildConfig;
  };

  for (const ent of await fs.readdir(storiesDir, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    const dir = path.join(storiesDir, ent.name);
    const storyFile = path.join(dir, "story.md");
    if (!existsSync(storyFile)) continue;
    // The fail-closed defaults (ADR-0040) — hold even when the spec fails to load.
    const story: DTStory = {
      id: ent.name,
      title: ent.name,
      outcome: "",
      status: null,
      proofMode: "",
      uatWitness: "human",
      dependsOn: [],
      consumedBy: [],
      capabilities: [],
    };
    try {
      const spec = loadNodeSpec(storyFile);
      story.title = spec.title;
      story.outcome = spec.outcome;
      story.status = isWorkStatus(spec.status) ? spec.status : null;
      story.proofMode = spec.proofMode;
      story.uatWitness = effectiveUatWitness(spec.uatWitness);
      story.dependsOn = spec.dependsOn;
      story.consumedBy = spec.consumedBy;
      story.decisions = spec.decisions;
      if (spec.render === "building") story.building = true;
      story.capabilities = spec.capabilities.map((capId) =>
        loadCapability(loadNodeSpec, resolveBuildConfig, dir, capId),
      );
      // The per-story OWN-PROOF obligations: the WITNESSABLE per-test UAT test criteria (would-be legs filtered
      // out, ADR-0097) UNION the `## Reliability Gates` — both addressable `{ id }` units the crown
      // rolls up (ADR-0085 / ADR-0082). Mirrors the studio's readTree collection verbatim.
      const ownObligations = [
        ...spec.uatTestCriteria.filter((t) => !t.wouldBe),
        ...spec.reliabilityGates,
      ];
      if (ownObligations.length > 0) uatTestCriteriaByStory.set(ent.name, ownObligations);
      if (spec.reliabilityGates.length > 0) {
        coverageByStory.set(
          ent.name,
          spec.reliabilityGates.map((g) =>
            g.covers !== undefined ? { id: g.id, covers: g.covers } : { id: g.id },
          ),
        );
      }
    } catch (err) {
      story.error = err instanceof Error ? err.message : String(err);
    }
    stories.push(story);
  }
  return { stories, uatTestCriteriaByStory, coverageByStory };
}

// ---------- verdict fold (re-composes the studio's tree-handler enrichment) ----------

/** The latest `at` among the verdict events for a set of unit ids (ISO strings sort lexically). */
function latestVerdictAt(
  events: readonly DTVerdictEvent[],
  ids: ReadonlySet<string>,
): string | undefined {
  let latest: string | undefined;
  for (const e of events) {
    const doc = e.doc as { unitId?: unknown; at?: unknown } | null;
    if (
      doc !== null &&
      typeof doc.unitId === "string" &&
      ids.has(doc.unitId) &&
      typeof doc.at === "string" &&
      (latest === undefined || doc.at > latest)
    ) {
      latest = doc.at;
    }
  }
  return latest;
}

/** The ids of the gates that `(covers:)` a capability — the covered cap's synthetic verdict `at`. */
function coveringGateIds(
  coverage: readonly { id: string; covers?: readonly string[] }[],
  capId: string,
): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const gate of coverage) {
    if (gate.covers?.includes(capId)) ids.add(gate.id);
  }
  return ids;
}

/**
 * Apply ADR-0097 per-capability COVERAGE: a brownfield cap with no own driven verdict greens via a
 * healthy reliability gate that `(covers:)` it, so plants tell the same story as the crown. Synthesizes
 * a `pass` verdict stamped with the covering gate's time — green through a SIGNED verdict, never authored
 * paint (ADR-0040). Never touches a cap with its own signed verdict. Mirrors the studio's `applyCapCoverage`.
 */
export function applyCapCoverage(
  stories: DTStory[],
  coverageByStory: ReadonlyMap<string, readonly { id: string; covers?: readonly string[] }[]>,
  events: readonly DTVerdictEvent[],
  capRollup: (
    capId: string,
    events: readonly DTVerdictEvent[],
    coverage?: readonly { id: string; covers?: readonly string[] }[],
  ) => string | null,
): void {
  for (const story of stories) {
    const coverage = coverageByStory.get(story.id);
    if (!coverage || coverage.length === 0) continue;
    for (const cap of story.capabilities) {
      if (cap.verdict) continue; // a cap with its own signed verdict already wears the right hue
      if (capRollup(cap.id, events, coverage) === "healthy") {
        const at = latestVerdictAt(events, coveringGateIds(coverage, cap.id));
        cap.verdict = { outcome: "pass", at: at ?? "" };
      }
    }
  }
}

/**
 * Apply the story-green crown roll-up (ADR-0083 Fork A): a story declaring per-test UAT test criteria has its
 * crown set from `rollupStoryGreen` — the AND of (every capability proven healthy) AND (the per-test UAT
 * roll-up). healthy ⇒ a pass crown, unhealthy ⇒ a fail crown, unproven ⇒ NO verdict (the crown
 * under-claims to `mapped`, never a stale green). Mirrors the studio's `applyUatCrowns`.
 */
export function applyUatCrowns(
  stories: DTStory[],
  uatTestCriteriaByStory: ReadonlyMap<string, readonly { id: string }[]>,
  coverageByStory: ReadonlyMap<string, readonly { id: string; covers?: readonly string[] }[]>,
  events: readonly DTVerdictEvent[],
  rollup: (
    capabilityIds: readonly string[],
    tests: readonly { id: string }[],
    events: readonly DTVerdictEvent[],
    coverage?: readonly { id: string; covers?: readonly string[] }[],
  ) => string | null,
): void {
  for (const story of stories) {
    const tests = uatTestCriteriaByStory.get(story.id);
    if (!tests || tests.length === 0) continue;
    const capabilityIds = story.capabilities.map((c) => c.id);
    const coverage = coverageByStory.get(story.id) ?? [];
    const rolled = rollup(capabilityIds, tests, events, coverage);
    if (rolled === "healthy" || rolled === "unhealthy") {
      const at = latestVerdictAt(events, new Set([...tests.map((t) => t.id), ...capabilityIds]));
      story.verdict = { outcome: rolled === "healthy" ? "pass" : "fail", at: at ?? "" };
    } else {
      delete story.verdict; // unproven: never paint a crown the proof doesn't support
    }
  }
}

/**
 * Apply the ADR-0107 proving-process OQ gate: an OPEN question attached to a story's proving process
 * (a `node:<storyId>` reference) WITHHOLDS that story's green until resolved. STRICTLY a withholding — it
 * only ever drops a would-be `pass` crown to no-verdict, never paints red. Mirrors `applyOpenQuestionGate`.
 */
export function applyOpenQuestionGate(
  stories: DTStory[],
  gatingCountByStory: ReadonlyMap<string, number>,
  gate: (base: "healthy" | "unhealthy" | null, count: number) => string | null,
): void {
  for (const story of stories) {
    const count = gatingCountByStory.get(story.id) ?? 0;
    if (count === 0) continue;
    const base =
      story.verdict?.outcome === "pass"
        ? "healthy"
        : story.verdict?.outcome === "fail"
          ? "unhealthy"
          : null;
    if (base === "healthy" && gate(base, count) !== "healthy") {
      delete story.verdict;
    }
  }
}

/**
 * Fold the signed-verdict overlay into the bare authored tree — the desktop's re-composition of the
 * studio tree-handler's enrichment block (apiRouter.ts ~1659-1707), in the SAME order so the desktop
 * forest paints proof-health identically and never over-claims relative to hosted:
 *   1. attach each unit's OWN latest verdict (`latestVerdicts[id]` → story/cap `.verdict`),
 *   2. ADR-0097 cap coverage (a covered brownfield plant greens via its gate),
 *   3. ADR-0083 per-test crown roll-up (a UAT story's island greens from the AND of its per-test verdicts),
 *   4. ADR-0107 OQ gate (an open fork WITHHOLDS a would-be green).
 * Skips the go-green AFFORDANCE pass (apiRouter's `applyStoryGoGreenProof`) — that drives Build/Adopt
 * buttons, not the read-overlay hue this increment owns. Every leg is advisory: a `null` verdict source
 * leaves the authored hue (under-claims), per the presence-block discipline (ADR-0033). Mutates `stories`.
 */
export async function foldVerdicts(
  stories: DTStory[],
  uatTestCriteriaByStory: ReadonlyMap<string, readonly { id: string }[]>,
  coverageByStory: ReadonlyMap<string, readonly { id: string; covers?: readonly string[] }[]>,
  overlay: VerdictOverlay,
): Promise<void> {
  // 1. each unit's OWN latest verdict (a capability/legacy story's own unit verdict, never a roll-up).
  if (overlay.latestVerdicts) {
    for (const story of stories) {
      const sv = overlay.latestVerdicts[story.id];
      if (sv) story.verdict = sv;
      for (const cap of story.capabilities) {
        const cv = overlay.latestVerdicts[cap.id];
        if (cv) cap.verdict = cv;
      }
    }
  }

  // 2-4 need the RAW event stream + the proof compute — skipped when the backend can't answer (the json
  // backend / a down DB), so the tree renders the own-verdict layer alone rather than failing.
  const events = overlay.verdictEvents;
  if (events) {
    const { rollupStoryGreen, rollupCapStatus, gateStoryGreenOnOpenQuestions } = (await loadOrchestrator()) as unknown as {
      rollupStoryGreen: (
        capabilityIds: readonly string[],
        tests: readonly { id: string }[],
        events: readonly DTVerdictEvent[],
        coverage?: readonly { id: string; covers?: readonly string[] }[],
      ) => string | null;
      rollupCapStatus: (
        capId: string,
        events: readonly DTVerdictEvent[],
        coverage?: readonly { id: string; covers?: readonly string[] }[],
      ) => string | null;
      gateStoryGreenOnOpenQuestions: (base: "healthy" | "unhealthy" | null, count: number) => string | null;
    };

    // ADR-0097: covered brownfield plants greens BEFORE the crown so plants and crown agree.
    applyCapCoverage(stories, coverageByStory, events, rollupCapStatus);
    if (uatTestCriteriaByStory.size > 0) {
      applyUatCrowns(stories, uatTestCriteriaByStory, coverageByStory, events, rollupStoryGreen);
    }
    // ADR-0107: an open gating question WITHHOLDS a would-be green crown — run AFTER the crown.
    if (overlay.openQuestions.length > 0) {
      const { openQuestionsGatingNode } = (await loadLibrary()) as unknown as {
        openQuestionsGatingNode: (
          openQuestions: readonly { id: string; references?: readonly string[] }[],
          nodeId: string,
        ) => readonly unknown[];
      };
      const gatingCountByStory = new Map<string, number>();
      for (const story of stories) {
        const n = openQuestionsGatingNode(overlay.openQuestions, story.id).length;
        if (n > 0) gatingCountByStory.set(story.id, n);
      }
      if (gatingCountByStory.size > 0) {
        applyOpenQuestionGate(stories, gatingCountByStory, gateStoryGreenOnOpenQuestions);
      }
    }
  }
}
