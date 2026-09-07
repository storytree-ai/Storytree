import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

import {
  corroborateClaims,
  fetchInProgressRuns,
  inProgressRunsUrl,
  observeInProgressRuns,
  observeRef,
  readCorroborateEnv,
  type BranchActivityStore,
  type CorroborateEnv,
} from "./ingest-ci-activity.js";
import type { BranchActivityStamp } from "../claim.js";

/**
 * Offline: the CI corroboration writer (ADR-0535 D2, the narrow half) through a FAKE store and a
 * stubbed `fetch`. Never touches the live DB, never reaches GitHub — the `main()` entry is
 * entry-guarded and never runs here.
 *
 * The load-bearing assertions are the two that hold the BROAD FORM out: the only network call this
 * writer makes is for workflow runs `in_progress`, and the workflow's token is not granted
 * `pull-requests` at all. Everything else is ordinary wiring.
 */

const NOW = new Date("2026-09-08T12:00:00.000Z");
const NOW_ISO = NOW.toISOString();

/** Records every batch it is handed; returns a canned moved-forward count. */
class RecordingBranchStore implements BranchActivityStore {
  readonly batches: (readonly BranchActivityStamp[])[] = [];
  constructor(private readonly moved: number = 1) {}
  async stampBranchActivity(stamps: readonly BranchActivityStamp[]): Promise<number> {
    this.batches.push(stamps);
    return this.moved;
  }
}

// ── The ONE admitted GitHub query ────────────────────────────────────────────

test("inProgressRunsUrl: asks for workflow runs IN PROGRESS, and nothing else", () => {
  const url = inProgressRunsUrl("https://api.github.com", "storytree-ai/storytree");

  assert.equal(
    url,
    "https://api.github.com/repos/storytree-ai/storytree/actions/runs?status=in_progress&per_page=100",
  );
  // `queued` is deliberately absent: a run can sit queued for a long time when runners are
  // saturated, so it answers "was requested at some point" rather than "is running now".
  assert.ok(!url.includes("queued"), "a queued run is not a running one");
});

test("inProgressRunsUrl: tolerates a trailing slash on the API base", () => {
  assert.equal(
    inProgressRunsUrl("https://api.github.com/", "o/r"),
    "https://api.github.com/repos/o/r/actions/runs?status=in_progress&per_page=100",
  );
});

test("fetchInProgressRuns: the ONLY request made is the runs query — never a pull-request one", async () => {
  // THE BROAD FORM'S RUNTIME FENCE. "Has an open PR, therefore alive" would resurrect the three
  // deadest claims on the board (every open PR here is a ~940 h draft, three of them on the three
  // oldest abandoned claims), so this pins that no such request exists to be widened by accident.
  const requested: string[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => {
    requested.push(String(input));
    return { ok: true, status: 200, json: async () => ({ workflow_runs: [] }) } as Response;
  }) as typeof fetch;

  try {
    await fetchInProgressRuns(
      { apiUrl: "https://api.github.com", repository: "o/r", token: "t" },
      () => {},
    );
  } finally {
    globalThis.fetch = original;
  }

  assert.equal(requested.length, 1, "exactly one GitHub request per run");
  assert.match(requested[0] ?? "", /\/actions\/runs\?status=in_progress\b/);
  assert.ok(
    !/\/pulls?\b/.test(requested[0] ?? ""),
    "no pull-request endpoint is reachable from this writer",
  );
});

test("fetchInProgressRuns: a GitHub failure is DARK, not a throw — the push half still lands", async () => {
  // ADR-0535 already records that this signal goes dark when GitHub does. The push observation
  // needs no API call, so an outage must not cost it.
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    throw new Error("simulated: GitHub unreachable");
  }) as typeof fetch;

  try {
    const lines: string[] = [];
    const runs = await fetchInProgressRuns(
      { apiUrl: "https://api.github.com", repository: "o/r", token: "t" },
      (m) => lines.push(m),
    );
    assert.equal(runs, null, "resolved null, did not reject");
    assert.ok(lines.some((l) => l.includes("dark")), "said so out loud");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchInProgressRuns: a non-2xx answer is DARK too", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () =>
    ({ ok: false, status: 403, json: async () => ({}) }) as Response) as typeof fetch;
  try {
    const lines: string[] = [];
    assert.equal(
      await fetchInProgressRuns(
        { apiUrl: "https://api.github.com", repository: "o/r", token: "t" },
        (m) => lines.push(m),
      ),
      null,
    );
    assert.ok(lines.some((l) => l.includes("403")), "named the status");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchInProgressRuns: no API context → dark, and no request attempted", async () => {
  let called = false;
  const original = globalThis.fetch;
  globalThis.fetch = (async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof fetch;
  try {
    assert.equal(await fetchInProgressRuns({ apiUrl: "", repository: "o/r" }, () => {}), null);
    assert.equal(called, false, "a missing token is not a request worth making");
  } finally {
    globalThis.fetch = original;
  }
});

// ── The observers ────────────────────────────────────────────────────────────

test("observeInProgressRuns: every running run's head branch becomes a check-running reading", () => {
  assert.deepEqual(
    observeInProgressRuns(
      { workflow_runs: [{ head_branch: "claude/alpha" }, { head_branch: "claude/beta" }] },
      NOW_ISO,
    ),
    [
      { ref: "claude/alpha", kind: "check-running", observedAt: NOW_ISO },
      { ref: "claude/beta", kind: "check-running", observedAt: NOW_ISO },
    ],
  );
});

test("observeInProgressRuns: TOTAL over a malformed body — a parse fault costs the push half nothing", () => {
  for (const payload of [null, undefined, 42, "no", {}, { workflow_runs: "no" }]) {
    assert.deepEqual(observeInProgressRuns(payload, NOW_ISO), [], `payload ${String(payload)}`);
  }
  assert.deepEqual(
    observeInProgressRuns({ workflow_runs: [null, { head_branch: "" }, { head_branch: 7 }] }, NOW_ISO),
    [],
    "unusable entries are skipped, not guessed at",
  );
});

test("observeRef: the pushed ref is one push reading, stamped with OUR clock", () => {
  // Deliberately not the commit's own timestamp: a commit authored hours ago and pushed just now
  // would then read as hours old, and the evidence is the PUSH.
  assert.deepEqual(observeRef({ ref: "refs/heads/claude/alpha" }, NOW_ISO), [
    { ref: "refs/heads/claude/alpha", kind: "push", observedAt: NOW_ISO },
  ]);
});

test("observeRef: a DELETED push carries its flag through, so the planner can refuse it BY NAME", () => {
  assert.deepEqual(observeRef({ ref: "refs/heads/claude/gone", deleted: "true" }, NOW_ISO), [
    { ref: "refs/heads/claude/gone", kind: "push", observedAt: NOW_ISO, deleted: true },
  ]);
});

test("observeRef: no ref (or a blank one) observes nothing", () => {
  assert.deepEqual(observeRef({}, NOW_ISO), []);
  assert.deepEqual(observeRef({ ref: "   " }, NOW_ISO), []);
});

test("readCorroborateEnv: reads the workflow's contract off the environment", () => {
  const env = readCorroborateEnv({
    STORYTREE_CORROBORATE_REF: "refs/heads/claude/alpha",
    STORYTREE_CORROBORATE_DELETED: "false",
    STORYTREE_DEFAULT_BRANCH: "main",
    GITHUB_API_URL: "https://api.github.com",
    GITHUB_REPOSITORY: "storytree-ai/storytree",
    GITHUB_TOKEN: "t",
  } as NodeJS.ProcessEnv);

  assert.deepEqual(env, {
    ref: "refs/heads/claude/alpha",
    deleted: "false",
    defaultBranch: "main",
    apiUrl: "https://api.github.com",
    repository: "storytree-ai/storytree",
    token: "t",
  } satisfies CorroborateEnv);
});

// ── The write ────────────────────────────────────────────────────────────────

test("corroborateClaims: plans, stamps and reports what the ledger actually took", () => {
  const store = new RecordingBranchStore(2);
  return corroborateClaims(
    store,
    [
      { ref: "refs/heads/claude/alpha", kind: "push", observedAt: NOW_ISO },
      { ref: "claude/beta", kind: "check-running", observedAt: NOW_ISO },
      { ref: "refs/heads/main", kind: "push", observedAt: NOW_ISO },
    ],
    NOW,
    "main",
  ).then(({ report, written }) => {
    assert.deepEqual(
      store.batches,
      [
        [
          { branch: "claude/alpha", observedAt: NOW_ISO, kind: "push" },
          { branch: "claude/beta", observedAt: NOW_ISO, kind: "check-running" },
        ],
      ],
      "one batched write, main fenced out",
    );
    assert.equal(written, 2);
    assert.ok(report.includes("2 branch(es) corroborated, 1 refused, 2 claim(s) moved forward"));
  });
});

test("corroborateClaims: nothing to say → the store is never asked", async () => {
  const store = new RecordingBranchStore(1);
  const { written } = await corroborateClaims(
    store,
    [{ ref: "refs/heads/main", kind: "push", observedAt: NOW_ISO }],
    NOW,
    "main",
  );
  assert.equal(store.batches.length, 0, "no pool work for a run with nothing to write");
  assert.equal(written, 0);
});

test("corroborateClaims: a STORE failure propagates — this writer is loud, unlike ingest-merge", async () => {
  // ingest-merge.ts is fail-soft because it runs on the merge path. This workflow gates NOTHING,
  // so a swallowed failure would rebuild the exact defect ADR-0535 was chartered on: a liveness
  // writer that quietly stops, invisible until an owner misreads the board months later.
  const store: BranchActivityStore = {
    async stampBranchActivity(): Promise<number> {
      throw new Error("simulated: DB idle-stopped");
    },
  };
  await assert.rejects(
    () =>
      corroborateClaims(
        store,
        [{ ref: "refs/heads/claude/alpha", kind: "push", observedAt: NOW_ISO }],
        NOW,
        "main",
      ),
    /DB idle-stopped/,
  );
});

// ── The CI wiring: the YAML that invokes this writer ─────────────────────────

const WORKFLOW_URL = new URL(
  "../../../../.github/workflows/claim-corroborate.yml",
  import.meta.url,
);

test("claim-corroborate.yml: WITHHOLDS pull-requests — the broad form is not merely unwritten, it is unauthorised", () => {
  const yaml = readFileSync(WORKFLOW_URL, "utf8");

  assert.ok(yaml.includes("actions: read"), "granted the ONE read it makes: in-progress runs");
  // A declared `permissions:` block sets every unlisted scope to `none`, so this is enforcement
  // rather than documentation: widening to "has an open PR, therefore alive" requires a deliberate
  // permissions change. Three of the seven ~940 h draft PRs sit on the three oldest dead claims.
  assert.ok(
    !/^\s*pull-requests:/m.test(yaml),
    "no pull-requests scope — the token cannot read a PR at all",
  );
});

test("claim-corroborate.yml: invokes this writer, on a push to any branch but main", () => {
  const yaml = readFileSync(WORKFLOW_URL, "utf8");

  assert.ok(yaml.includes("src/store/ingest-ci-activity.ts"), "invokes the corroboration writer");
  assert.match(
    yaml,
    /on:[\s\S]*?push:\s*\n\s*branches-ignore:\s*\[main\]/,
    "a push to any branch but main — main's push is a MERGE, which claim-release.yml handles",
  );
  assert.ok(yaml.includes("workflow_dispatch:"), "keeps the manual verification lever");
  assert.ok(!/^\s*schedule:/m.test(yaml), "no cron — the triggers ARE the refresh loop");
});

test("claim-corroborate.yml: a superseded corroboration IS cancelled — the inverse of claim-release", () => {
  // There, a cancelled release is a LOST release. Here, a cancelled corroboration leaves an OLDER
  // heartbeat, which is the cheap direction: too old costs nothing new, too fresh fences a node
  // nobody can reclaim. Pinned because the two workflows must not be "made consistent" by mistake.
  const yaml = readFileSync(WORKFLOW_URL, "utf8");
  assert.ok(yaml.includes("cancel-in-progress: true"), "a newer push supersedes an older one");
});

test("claim-corroborate.yml: keyless WIF, and the writer runs from main's tree", () => {
  const yaml = readFileSync(WORKFLOW_URL, "utf8");

  assert.ok(
    yaml.includes("storytree-ci-presence@storytree-498613.iam.gserviceaccount.com"),
    "the same service account claim-release.yml uses — no new IAM",
  );
  assert.ok(!yaml.includes("credentials_json"), "keyless (ADR-0021) — no JSON key in a secret");
  assert.match(
    yaml,
    /uses: actions\/checkout@v6\s*\n\s*with:\s*\n\s*ref: main/,
    "runs main's writer, never the pushed branch's — a branch must not choose what runs with a store credential",
  );
});

test("EVERY workflow's `pnpm --filter <pkg> exec <bin>` names a bin that <pkg> can actually resolve", () => {
  // WRITTEN BECAUSE THIS WAS ALREADY BROKEN, IN THE EXACT SILENT WAY ADR-0535 EXISTS TO STOP.
  // `ci.yml`'s automerge job has invoked `pnpm --filter @storytree/notice-board exec tsx
  // src/store/ingest-merge.ts` since ADR-0077 — the GUARANTEED machine clear of a merged branch's
  // claims — and `tsx` was never a dependency of that package. On the real merge of 2026-09-07 the
  // step printed `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "tsx" not found` and exited 254, and
  // the job went green anyway because every release step is `continue-on-error: true`. So the merge
  // clear had NEVER run, and the workflow's own comment asserted the opposite in prose ("a
  // @storytree/notice-board devDep") — an assertion in a comment, which is the one place nothing
  // checks. The corpses that opened this arc are downstream of exactly that.
  //
  // Repo-wide rather than scoped to the two writers: the next instance will be a different
  // workflow, and the failure is invisible wherever a step is fail-soft.
  const workflowDir = new URL("../../../../.github/workflows/", import.meta.url);
  const manifests = new Map<string, { deps: Record<string, unknown> }>();
  for (const group of ["packages", "apps"]) {
    const groupDir = new URL(`../../../../${group}/`, import.meta.url);
    for (const entry of readdirSync(groupDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      let raw: string;
      try {
        raw = readFileSync(new URL(`${entry.name}/package.json`, groupDir), "utf8");
      } catch {
        continue; // a directory without a manifest is not a workspace package
      }
      const pkg = JSON.parse(raw) as Record<string, Record<string, unknown> | undefined>;
      if (typeof pkg["name"] !== "string") continue;
      manifests.set(pkg["name"], {
        deps: { ...pkg["dependencies"], ...pkg["devDependencies"] },
      });
    }
  }
  assert.ok(manifests.size > 10, "precondition: the workspace scan found the packages");

  const invocation = /pnpm\s+--filter\s+(\S+)\s+exec\s+(\S+)/g;
  let checked = 0;
  for (const file of readdirSync(workflowDir)) {
    if (!file.endsWith(".yml") && !file.endsWith(".yaml")) continue;
    // COMMENT LINES ARE SKIPPED, and that is not incidental tidiness: the fix for this very defect
    // put the phrase `pnpm --filter <pkg> exec <bin>` into two workflows' comments, and a scan that
    // read them would fail on a placeholder while proving nothing about a real invocation.
    const yaml = readFileSync(new URL(file, workflowDir), "utf8")
      .split("\n")
      .filter((line) => !line.trimStart().startsWith("#"))
      .join("\n");
    for (const [, pkgName, bin] of yaml.matchAll(invocation)) {
      if (pkgName === undefined || bin === undefined) continue;
      const manifest = manifests.get(pkgName);
      assert.ok(manifest !== undefined, `${file}: --filter ${pkgName} names no workspace package`);
      assert.ok(
        bin in manifest.deps,
        `${file}: \`pnpm --filter ${pkgName} exec ${bin}\` — but ${pkgName} declares no ` +
          `"${bin}" dependency, so pnpm cannot resolve it and the step dies with ` +
          `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL. Add it to that package's devDependencies.`,
      );
      checked += 1;
    }
  }
  assert.ok(checked >= 3, `precondition: found ${checked} package-scoped exec invocations, expected 3+`);
});

test("claim-corroborate.yml: no branch-shape gate — any shape can hold a claim", () => {
  // The `claude/*` prefix gate on the sibling writer is what cost PR #1024's claim its machine
  // clear; claims are keyed on the FULL branch.
  const yaml = readFileSync(WORKFLOW_URL, "utf8");
  assert.ok(!yaml.includes("claude/*"), "no shape filter on the trigger");
});
