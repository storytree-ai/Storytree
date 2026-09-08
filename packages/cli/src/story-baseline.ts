import type {
  StoryBaselineBackfillCandidate,
  StoryBaselineBackfillReport,
  StoryBaselineStore,
} from "@storytree/orchestrator";
import { backfillStoryBaselines } from "@storytree/orchestrator";

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
  if (git === null || !git.clean) {
    return {
      ok: false,
      body: "story baseline backfill needs a clean committed HEAD whose hierarchy it can bind.",
      next: ["git status", "storytree story baseline backfill --pg"],
    };
  }
  const signer = deps.resolveSigner();
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
  const at = deps.now().toISOString();
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

function renderBackfill(reports: readonly StoryBaselineBackfillReport[]): Envelope {
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
