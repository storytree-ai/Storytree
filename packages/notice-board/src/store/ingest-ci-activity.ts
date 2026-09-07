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
  const runs = (payload as { workflow_runs?: unknown } | null | undefined)?.workflow_runs;
  if (!Array.isArray(runs)) return [];
  const observations: CorroborationObservation[] = [];
  for (const run of runs) {
    const branch = (run as { head_branch?: unknown } | null | undefined)?.head_branch;
    // The trim is load-bearing: a whitespace-only `head_branch` is not a branch, and admitting it
    // would push a reading the planner can only refuse — a refusal in the report about nothing.
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
  // Absent and blank are collapsed on purpose: a workflow expression that evaluates to nothing
  // renders as an EMPTY STRING rather than going unset, so an `undefined`-only guard would let a
  // `Bearer ` with no token reach GitHub and read the 401 as an outage.
  const apiUrl = env.apiUrl ?? "";
  const repository = env.repository ?? "";
  const token = env.token ?? "";
  if (apiUrl.length === 0 || repository.length === 0 || token.length === 0) {
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

/** The store, plus how to let it go — the one seam only a real run fills with a live pool. */
export interface OpenedStore {
  readonly store: BranchActivityStore;
  readonly close: () => Promise<void>;
}

/**
 * Everything {@link runCorroboration} touches outside itself.
 *
 * The whole run is behind this seam rather than inside an entry-guarded `main`, because a `main`
 * nothing can call is a region nothing can prove: the first draft of this file put the pool
 * lifecycle, the exit code and the failure message there, and `check:mutation-diff` reported 29
 * mutants that NO TEST REACHED. A silent writer is the defect this whole arc exists to end, so its
 * own failure path is the last place to leave unwitnessed.
 */
export interface CorroborateDeps {
  readonly env: CorroborateEnv;
  readonly now: () => Date;
  readonly fetchRuns: (env: CorroborateEnv, log: (msg: string) => void) => Promise<unknown>;
  readonly openStore: () => Promise<OpenedStore>;
  readonly log: (msg: string) => void;
}

/** Where the corroborator looks when the workflow could not say what the default branch is. */
export const DEFAULT_BRANCH_FALLBACK = "main";

/**
 * The branch never to corroborate. Falls back rather than refusing: an unset value would otherwise
 * make the default branch corroborable, and being wrong about WHICH branch is the trunk is the one
 * error that lets a merge read as a session working.
 */
export function resolveDefaultBranch(env: CorroborateEnv): string {
  const declared = env.defaultBranch ?? "";
  return declared.length > 0 ? declared : DEFAULT_BRANCH_FALLBACK;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * One whole run: observe, plan, stamp, report. Returns the PROCESS EXIT CODE rather than setting
 * it, so the decision is a value a test can read.
 *
 * 0 — the ledger was told, or had nothing to hear.
 * 1 — the STORE failed. Loud on purpose, and unlike `ingest-merge.ts`, which is fail-soft because it
 *     runs on the merge path and must never redden a merge that already landed. This gates nothing,
 *     so a swallowed failure would buy nothing and would rebuild the silent-writer defect exactly.
 *     A GITHUB failure is NOT this: {@link fetchInProgressRuns} answers null, the push half still
 *     lands, and someone else's outage never reddens a run of ours.
 */
export async function runCorroboration(deps: CorroborateDeps): Promise<number> {
  const now = deps.now();
  const observedAt = now.toISOString();

  const runs = await deps.fetchRuns(deps.env, deps.log);
  const observations = [
    ...observeInProgressRuns(runs, observedAt),
    ...observeRef(deps.env, observedAt),
  ];

  let opened: OpenedStore | undefined;
  try {
    opened = await deps.openStore();
    const { report } = await corroborateClaims(
      opened.store,
      observations,
      now,
      resolveDefaultBranch(deps.env),
    );
    deps.log(report);
    return 0;
  } catch (err) {
    deps.log(
      `::error::[ci-corroborate] the ledger was NOT told (${errorMessage(err)}). Claims on the ` +
        `observed branches keep their old heartbeat and may read as unknown on the board until ` +
        `the next push. Re-run this workflow, or investigate the store.`,
    );
    return 1;
  } finally {
    if (opened !== undefined) {
      try {
        await opened.close();
      } catch (err) {
        // A pool that will not close cannot un-write what already committed, so this is noise, not
        // a fault — but it is SAID, because the alternative is a swallowed error in a writer whose
        // whole subject is swallowed errors.
        deps.log(`[ci-corroborate] pool teardown error (ignored): ${errorMessage(err)}`);
      }
    }
  }
}

/**
 * The production wiring — the only place a live Cloud SQL pool is opened.
 *
 * Exported so a test can prove every field of it EXCEPT `openStore`, which by construction dials the
 * real database. That is the honest boundary: what can be witnessed offline is, and the one thing
 * that cannot is the smallest closure this file could reduce it to.
 */
export function nodeCorroborateDeps(
  openPool: () => Promise<PoolHandle> = createPool,
): CorroborateDeps {
  return {
    env: readCorroborateEnv(process.env),
    now: () => new Date(),
    fetchRuns: fetchInProgressRuns,
    openStore: async () => {
      const handle = await openPool();
      return {
        store: new PgClaimStore(handle.pool),
        close: () => closePool(handle.pool, handle.connector),
      };
    },
    log: console.log,
  };
}

/**
 * Is this module being RUN as a script, rather than imported?
 *
 * Its own function so the guard is a thing a test can drive. The alternative is a condition only the
 * real process can satisfy, which is a condition nothing can prove.
 */
export function isScriptEntry(argv1: string | undefined, moduleUrl: string): boolean {
  if (argv1 === undefined) return false;
  return moduleUrl === pathToFileURL(argv1).href;
}

/**
 * The script entry, AS A FUNCTION — what `.github/workflows/claim-corroborate.yml` reaches through:
 *
 *   STORYTREE_DB_USER=<iam-email> STORYTREE_CORROBORATE_REF=refs/heads/<branch>
 *   pnpm --filter @storytree/notice-board exec tsx src/store/ingest-ci-activity.ts
 *
 * Sets `process.exitCode` and returns it, or returns null when this module was merely IMPORTED —
 * which every test does, so the guard has to hold.
 *
 * The catch here is the OUTER one: {@link runCorroboration} already converts every KNOWN failure
 * into an exit code, so anything reaching this one is an unknown — and an unknown that vanished
 * silently would be the very defect this writer exists to end.
 */
export async function runAsScript(
  argv1: string | undefined,
  moduleUrl: string,
  deps: CorroborateDeps = nodeCorroborateDeps(),
  log: (msg: string) => void = console.log,
): Promise<number | null> {
  if (!isScriptEntry(argv1, moduleUrl)) return null;
  try {
    const code = await runCorroboration(deps);
    process.exitCode = code;
    return code;
  } catch (err) {
    log(`::error::[ci-corroborate] unexpected error: ${errorMessage(err)}`);
    process.exitCode = 1;
    return 1;
  }
}

// Stryker disable next-line all: UNREACHABLE OFFLINE, and deliberately NOT claimed as equivalent —
// deleting this call makes the module inert AS A SCRIPT, which is precisely what every test in this
// package relies on it already being when imported. No test can tell the two apart, because a test
// that could would be one that runs this writer against the production ledger on import. Everything
// the call DOES is proven through `runAsScript` above; this is the single irreducible statement that
// says "this module is also a script", and shrinking the unwitnessed region to it is the whole
// reason `runAsScript` takes its argv, its deps and its log as parameters.
void runAsScript(process.argv[1], import.meta.url);
