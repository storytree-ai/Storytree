import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import { activeReliabilityGates, crownObligations } from "@storytree/library";
import type {
  StoryBaselineBackfillCandidate,
  StoryBaselineBackfillReport,
  StoryBaselineProvenance,
  StoryBaselineStore,
} from "@storytree/orchestrator";
import {
  advanceStoryBaseline,
  backfillStoryBaselines,
  findNodeSpecFile,
  loadNodeSpec,
} from "@storytree/orchestrator";

import type { Envelope } from "./envelope.js";
import type { GitState } from "./uat.js";

const DEFAULT_BACKFILL_LIMIT = 100;

export interface StoryBaselineBackfillDeps {
  readonly store: StoryBaselineStore | null;
  readonly candidates: () => StoryBaselineBackfillCandidate[];
  readonly gitState: () => GitState | null;
  readonly resolveSigner: () => { ok: true; signer: string } | { ok: false; error: string };
  readonly now: () => Date;
}

/** Load one exact current story declaration for baseline resolution or backfill. */
export function loadStoryBaselineCandidate(
  storiesDir: string,
  storyId: string,
): StoryBaselineBackfillCandidate {
  const file = path.join(storiesDir, storyId, "story.md");
  if (!existsSync(file)) return { storyId, error: "story.md not found" };
  try {
    const spec = loadNodeSpec(file);
    if (spec.tier !== "story") return { storyId, error: "the declaration is not a story" };
    let unresolvedHealthIssue = false;
    const capabilities = spec.capabilities.map((id) => {
      try {
        // A missing file and an unreadable file have the same health consequence here. Passing the
        // nullable lookup through the loader makes both take this one catch path.
        return { id, status: loadNodeSpec(findNodeSpecFile(storiesDir, id)!).status };
      } catch {
        unresolvedHealthIssue = true;
        return { id };
      }
    });
    return {
      storyId,
      declaration: {
        capabilities,
        obligations: crownObligations(spec.uatTestCriteria, spec.reliabilityGates),
      },
      coverage: activeReliabilityGates(spec.reliabilityGates),
      unresolvedHealthIssue,
    };
  } catch (error) {
    return {
      storyId,
      error: (error as Error).message,
    };
  }
}

/** Deterministic corpus inventory for the bounded backfill. Files beside story directories are ignored. */
export function loadAllStoryBaselineCandidates(storiesDir: string): StoryBaselineBackfillCandidate[] {
  if (!existsSync(storiesDir)) return [];
  return readdirSync(storiesDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadStoryBaselineCandidate(storiesDir, entry.name));
}

/** One production composition used by every CLI proof writer that can complete a story. */
export function makeStoryBaselineAdvancer(
  storiesDir: string,
  store: StoryBaselineStore | null,
): ((storyId: string, provenance: StoryBaselineProvenance) => Promise<unknown>) | undefined {
  if (store === null) return undefined;
  return async (storyId, provenance) => {
    const candidate = loadStoryBaselineCandidate(storiesDir, storyId);
    if (candidate.declaration === undefined) {
      throw new Error(candidate.error);
    }
    return advanceStoryBaseline({
      storyId,
      declaration: candidate.declaration,
      store,
      provenance,
      coverage: candidate.coverage!,
      unresolvedHealthIssue: candidate.unresolvedHealthIssue!,
    });
  };
}

/** `storytree story baseline backfill [story-id…] --pg` — bounded, evidence-only migration. */
export async function storyBaselineBackfillCommand(
  requestedIds: readonly string[],
  deps: StoryBaselineBackfillDeps,
): Promise<Envelope> {
  if (deps.store === null) {
    return {
      ok: false,
      body: "story baseline backfill reads and writes signed proof in the live store — rerun with --pg.",
      next: ["pnpm db:up", "storytree story baseline backfill --pg"],
    };
  }
  const git = deps.gitState();
  const signer = deps.resolveSigner();
  const at = deps.now().toISOString();
  if (git === null || !git.clean) {
    return {
      ok: false,
      body: "story baseline backfill needs a clean committed HEAD whose hierarchy it can bind.",
      next: ["git status", "storytree story baseline backfill --pg"],
    };
  }
  if (!signer.ok) {
    return { ok: false, body: signer.error, next: ["git config user.email"] };
  }

  const available = deps.candidates();
  const requested = [...new Set(requestedIds.map((id) => id.trim()).filter(Boolean))];
  const candidates =
    requested.length === 0
      ? available
      : requested.map(
          (storyId) =>
            available.find((candidate) => candidate.storyId === storyId) ?? {
              storyId,
              error: "story declaration not found or unreadable",
            },
        );
  const reports = await backfillStoryBaselines({
    candidates,
    store: deps.store,
    provenance: {
      commitSha: git.commitSha,
      signer: signer.signer,
      runIdPrefix: `story-baseline-backfill:${at}`,
      at,
    },
    limit: DEFAULT_BACKFILL_LIMIT,
  });
  return renderBackfill(reports);
}

export function renderBackfill(reports: readonly StoryBaselineBackfillReport[]): Envelope {
  const recorded = reports.filter((report) => report.state === "recorded").length;
  const declined = reports.filter((report) => report.state === "declined").length;
  const deferred = reports.filter((report) => report.state === "deferred").length;
  const glyph = (state: StoryBaselineBackfillReport["state"]): string =>
    state === "recorded" ? "✓" : state === "declined" ? "–" : "·";
  return {
    ok: true,
    body: [
      `story baseline backfill: ${recorded} recorded, ${declined} declined, ${deferred} deferred (limit ${DEFAULT_BACKFILL_LIMIT}).`,
      "",
      ...reports.map(
        (report) =>
          `  ${glyph(report.state)} ${report.storyId}: ${report.state} — ${report.reason}` +
          (report.fingerprint === undefined ? "" : ` (${report.fingerprint})`),
      ),
      "",
      "Every story was reported. Authored status was not consulted; only complete current signed proof recorded a baseline.",
    ].join("\n"),
    next: ["storytree tree --pg"],
  };
}
