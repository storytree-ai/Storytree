import { pathToFileURL } from "node:url";
import { createPool, closePool } from "@storytree/library/store";
import type { PoolHandle } from "@storytree/library/store";
import {
  planCorroboration,
  renderCorroboration,
  type CorroborationObservation,
} from "../ci-corroboration.js";
import type { BranchActivityStamp } from "../claim.js";
import { PgClaimStore } from "./claim-store.js";

/**
 * CI corroboration writer (ADR-0535 D2, the narrow half) — invoked by
 * `.github/workflows/claim-corroborate.yml`. The sibling of {@link file://./ingest-merge.ts}, and
 * its opposite number: that one records that a branch's work is OVER, this one that it CONTINUES.
 *
 * WHY IT LIVES IN CI RATHER THAN IN THE HOSTED STUDIO. ADR-0535 D2 names a standing cost —
 * "something must poll GitHub and own the credentials, the rate limit and the refresh loop" — and
 * placing it here is what makes that cost approximately zero rather than merely small:
 *   - CREDENTIALS. Nothing new. GitHub mints `github.token` per run, so there is nothing to rotate
 *     and nothing to leak; the store write reuses the SAME keyless WIF pool / provider / service
 *     account `claim-release.yml` has used on every merged branch since ADR-0033
 *     (`infra/ci-presence.tf`). The studio alternative needs a LONG-LIVED GitHub credential in
 *     Cloud Run — a PAT or an App key, the only such secret in that deployment.
 *   - RATE LIMIT. One request per run against a per-run token. There is no budget to exhaust and
 *     none to own. A studio poll loop would own a fixed shared limit.
 *   - THE REFRESH LOOP. GitHub owns it: the TRIGGERS are the loop. Nothing here has to stay alive,
 *     and a workflow that stops firing is visible in the Actions tab — where the mechanism this
 *     replaces was invisible for three weeks precisely because it was a silent background writer.
 *     Cloud Run scales to zero, so a loop there is dark exactly when nobody is watching, and
 *     keeping it awake is a standing bill for a signal that costs nothing here.
 *
 * ⚠⚠ THE BROAD FORM IS REFUSED AND THE REFUSAL IS STRUCTURAL, NOT A COMMENT. Only ONE GitHub query
 * exists in this file — {@link inProgressRunsUrl}, workflow runs with `status=in_progress` — and
 * the workflow is granted `actions: read` while `pull-requests` is WITHHELD, so the token this runs
 * under cannot read a pull request at all. Adding "has an open PR, therefore alive" would take a
 * permissions change, not an accident. That matters because every open PR on this repo is a
 * long-abandoned draft (~940 h on 2026-09-08) and three of them sit on the three oldest dead claims
 * on the board: broadly implemented, this signal would make corpse-fencing permanent.
 *
 * FAILURE POSTURE, DELIBERATELY UNLIKE `ingest-merge.ts`. That writer is fail-soft because it runs
 * on the merge path and must never redden a merge that already landed. This workflow gates NOTHING,
 * so a swallowed failure would buy nothing and would rebuild the exact class ADR-0535 was chartered
 * on — a liveness writer that quietly stops. So a STORE failure is LOUD (exit 1). A GITHUB failure
 * is not: ADR-0535 already records that this signal "goes dark when GitHub does", the push
 * observation needs no API call, and reddening a run for someone else's outage teaches the one
 * lesson a gate must never teach.
 */

/** Env the workflow fills; every read goes through here so the contract is one object. */
export interface CorroborateEnv {
  /** The branch acted on right now — a push ref, or a `workflow_dispatch` branch. May be absent. */
  readonly ref?: string | undefined;
  /** `"true"` when the push DELETED the ref. */
  readonly deleted?: string | undefined;
  /** The repository default branch; `main` when the workflow could not say. */
  readonly defaultBranch?: string | undefined;
  readonly apiUrl?: string | undefined;
  readonly repository?: string | undefined;
  readonly token?: string | undefined;
}

/** Read {@link CorroborateEnv} out of a process environment. */
export function readCorroborateEnv(env: NodeJS.ProcessEnv): CorroborateEnv {
  return {
    ref: env["STORYTREE_CORROBORATE_REF"],
    deleted: env["STORYTREE_CORROBORATE_DELETED"],
    defaultBranch: env["STORYTREE_DEFAULT_BRANCH"],
    apiUrl: env["GITHUB_API_URL"],
    repository: env["GITHUB_REPOSITORY"],
    token: env["GITHUB_TOKEN"],
  };
}

/**
 * THE ONLY GITHUB QUERY THIS WRITER MAKES: the workflow runs executing RIGHT NOW.
 *
 * `status=in_progress` is the narrow clause spelled as a request parameter. `queued` is
 * deliberately NOT included — a run can sit queued for a long time when runners are saturated, so
 * "queued" answers "was requested at some point", which is a weaker claim than the one being made.
 * And no pull-request endpoint appears anywhere in this file, which is the property
 * `ingest-ci-activity.test.ts` pins directly.
 */
export function inProgressRunsUrl(apiUrl: string, repository: string): string {
  const base = apiUrl.replace(/\/+$/, "");
  return `${base}/repos/${repository}/actions/runs?status=in_progress&per_page=100`;
}

/**
 * PURE: the branches GitHub says are being checked right now, from the runs payload.
 *
 * Total over a malformed body — an unexpected shape yields NO observations rather than throwing,
 * because the push observation beside it is still worth writing and a parse fault must not cost it.
 */
export function observeInProgressRuns(
  payload: unknown,
  observedAt: string,
): CorroborationObservation[] {
  if (typeof payload !== "object" || payload === null) return [];
  const runs = (payload as Record<string, unknown>)["workflow_runs"];
  if (!Array.isArray(runs)) return [];
  const observations: CorroborationObservation[] = [];
  for (const run of runs) {
    if (typeof run !== "object" || run === null) continue;
    const branch = (run as Record<string, unknown>)["head_branch"];
    if (typeof branch !== "string" || branch.trim().length === 0) continue;
    observations.push({ ref: branch, kind: "check-running", observedAt });
  }
  return observations;
}

/**
 * PURE: the branch this run was fired ABOUT, if any.
 *
 * One env var carries both the push ref and the `workflow_dispatch` input, because they make the
 * same claim — something acted on this branch just now — and the ledger stores one timestamp, not a
 * provenance. The deleted flag is the one thing a push can say that is evidence of ABSENCE; it is
 * carried through rather than dropped so {@link planCorroboration} can refuse it BY NAME.
 */
export function observeRef(env: CorroborateEnv, observedAt: string): CorroborationObservation[] {
  const ref = env.ref ?? "";
  if (ref.trim().length === 0) return [];
  const observation: CorroborationObservation = { ref, kind: "push", observedAt };
  if (env.deleted !== "true") return [observation];
  return [{ ...observation, deleted: true }];
}

/** Fetch the in-progress runs; `null` on any failure (GitHub's outage is not our red run). */
export async function fetchInProgressRuns(
  env: CorroborateEnv,
  log: (msg: string) => void = console.log,
): Promise<unknown | null> {
  const { apiUrl, repository, token } = env;
  if (
    apiUrl === undefined ||
    repository === undefined ||
    token === undefined ||
    apiUrl.length === 0 ||
    repository.length === 0 ||
    token.length === 0
  ) {
    log("[ci-corroborate] no GitHub API context — the check-running half is dark this run.");
    return null;
  }
  try {
    const response = await fetch(inProgressRunsUrl(apiUrl, repository), {
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "x-github-api-version": "2022-11-28",
      },
    });
    if (!response.ok) {
      log(`[ci-corroborate] GitHub answered ${response.status} — check-running half is dark.`);
      return null;
    }
    return await response.json();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    log(`[ci-corroborate] GitHub unreachable (${message}) — check-running half is dark.`);
    return null;
  }
}

/** The store slice this writer needs — keeps the unit test offline. */
export interface BranchActivityStore {
  stampBranchActivity(stamps: readonly BranchActivityStamp[]): Promise<number>;
}

/**
 * Plan from the observations, stamp the ledger, and return the loud report.
 *
 * Rethrows a store failure on purpose — see this module's failure-posture note. The report is built
 * for BOTH outcomes by the caller, so a run that could not write still says what it saw.
 */
export async function corroborateClaims(
  store: BranchActivityStore,
  observations: readonly CorroborationObservation[],
  now: Date,
  defaultBranch: string,
): Promise<{ report: string; written: number }> {
  const plan = planCorroboration(observations, { now, defaultBranch });
  const written = plan.stamps.length === 0 ? 0 : await store.stampBranchActivity(plan.stamps);
  return { report: renderCorroboration(plan, written), written };
}

/**
 * Script entry: observe, plan, stamp, report. NEVER invoked during tests (entry-guarded).
 *
 *   STORYTREE_DB_USER=<iam-email> STORYTREE_CORROBORATE_REF=refs/heads/<branch> \
 *   npx tsx packages/notice-board/src/store/ingest-ci-activity.ts
 *
 * Exit 0 when the ledger was told (or had nothing to hear); exit 1 ONLY when the store itself
 * failed, which is the fault worth a red run.
 */
async function main(): Promise<void> {
  const env = readCorroborateEnv(process.env);
  const now = new Date();
  const observedAt = now.toISOString();

  const runs = await fetchInProgressRuns(env);
  const observations = [
    ...observeInProgressRuns(runs, observedAt),
    ...observeRef(env, observedAt),
  ];

  const defaultBranch =
    env.defaultBranch !== undefined && env.defaultBranch.length > 0 ? env.defaultBranch : "main";

  let handle: PoolHandle | undefined;
  try {
    handle = await createPool();
    const store = new PgClaimStore(handle.pool);
    const { report } = await corroborateClaims(store, observations, now, defaultBranch);
    console.log(report);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.log(
      `::error::[ci-corroborate] the ledger was NOT told (${message}). Claims on the observed ` +
        `branches keep their old heartbeat and may read as unknown on the board until the next ` +
        `push. Re-run this workflow, or investigate the store.`,
    );
    process.exitCode = 1;
  } finally {
    if (handle !== undefined) {
      try {
        await closePool(handle.pool, handle.connector);
      } catch (err) {
        console.log(`[ci-corroborate] pool teardown error (ignored): ${String(err)}`);
      }
    }
  }
}

const entry = process.argv[1];
if (entry !== undefined && import.meta.url === pathToFileURL(entry).href) {
  main().catch((err: unknown) => {
    console.log(`::error::[ci-corroborate] unexpected error: ${String(err)}`);
    process.exitCode = 1;
  });
}
