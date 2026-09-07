import test from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

import {
  corroborateClaims,
  fetchInProgressRuns,
  inProgressRunsUrl,
  observeInProgressRuns,
  observeRef,
  readCorroborateEnv,
  runCorroboration,
  runAsScript,
  isScriptEntry,
  resolveDefaultBranch,
  nodeCorroborateDeps,
  DEFAULT_BRANCH_FALLBACK,
  type BranchActivityStore,
  type CorroborateEnv,
  type CorroborateDeps,
  type OpenedStore,
} from "./ingest-ci-activity.js";
import type { BranchActivityStamp } from "../claim.js";
import { planCorroboration } from "../ci-corroboration.js";
import { PgClaimStore } from "./claim-store.js";
import type { PoolHandle } from "@storytree/library/store";

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

test("inProgressRunsUrl: trims ANY run of trailing slashes, not just one", () => {
  const want = "https://api.github.com/repos/o/r/actions/runs?status=in_progress&per_page=100";
  assert.equal(inProgressRunsUrl("https://api.github.com/", "o/r"), want, "one");
  assert.equal(inProgressRunsUrl("https://api.github.com///", "o/r"), want, "several");
  assert.equal(inProgressRunsUrl("https://api.github.com", "o/r"), want, "none");
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

test("fetchInProgressRuns: EVERY missing OR blank field is dark, and none of them attempts a request", async () => {
  // Each field is checked on its own. Absent and blank are collapsed deliberately: a GitHub Actions
  // expression that evaluates to nothing renders as an EMPTY STRING rather than going unset, so an
  // `undefined`-only guard would let a `Bearer ` with no token reach GitHub, and the 401 would read
  // as an outage — the check-running half silently dark with a plausible reason.
  const full = { apiUrl: "https://api.github.com", repository: "o/r", token: "t" } as const;
  const cases: [string, CorroborateEnv][] = [
    ["apiUrl absent", { ...full, apiUrl: undefined }],
    ["apiUrl blank", { ...full, apiUrl: "" }],
    ["repository absent", { ...full, repository: undefined }],
    ["repository blank", { ...full, repository: "" }],
    ["token absent", { ...full, token: undefined }],
    ["token blank", { ...full, token: "" }],
  ];

  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    return { ok: true, status: 200, json: async () => ({}) } as Response;
  }) as typeof fetch;
  try {
    for (const [name, env] of cases) {
      const lines: string[] = [];
      assert.equal(await fetchInProgressRuns(env, (m) => lines.push(m)), null, name);
      assert.deepEqual(
        lines,
        ["[ci-corroborate] no GitHub API context — the check-running half is dark this run."],
        `${name}: says so, in one line, naming which half went dark`,
      );
    }
    assert.equal(called, 0, "an incomplete context is not a request worth making");
  } finally {
    globalThis.fetch = original;
  }
});

test("fetchInProgressRuns: a complete context DOES request, and hands back GitHub's body verbatim", async () => {
  const body = { workflow_runs: [{ head_branch: "claude/alpha" }] };
  const seen: RequestInit[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (_input: unknown, init?: RequestInit) => {
    seen.push(init ?? {});
    return { ok: true, status: 200, json: async () => body } as Response;
  }) as typeof fetch;

  try {
    assert.deepEqual(
      await fetchInProgressRuns(
        { apiUrl: "https://api.github.com", repository: "o/r", token: "shhh" },
        () => {},
      ),
      body,
      "the payload reaches the observer unchanged — nothing here interprets it",
    );
  } finally {
    globalThis.fetch = original;
  }

  // The headers are the request: without them GitHub answers a different shape, or refuses.
  assert.deepEqual(seen[0]?.headers, {
    accept: "application/vnd.github+json",
    authorization: "Bearer shhh",
    "x-github-api-version": "2022-11-28",
  });
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
    observeInProgressRuns(
      { workflow_runs: [null, 7, "no", { head_branch: "" }, { head_branch: "   " }, { head_branch: 7 }] },
      NOW_ISO,
    ),
    [],
    "unusable entries are skipped, not guessed at — a whitespace-only branch included",
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

// ── resolveDefaultBranch: the branch never to corroborate ────────────────────

test("resolveDefaultBranch: takes what the workflow said, and falls back to main when it said nothing", () => {
  assert.equal(resolveDefaultBranch({ defaultBranch: "trunk" }), "trunk");
  assert.equal(resolveDefaultBranch({}), DEFAULT_BRANCH_FALLBACK);
  assert.equal(resolveDefaultBranch({ defaultBranch: "" }), DEFAULT_BRANCH_FALLBACK);
  assert.equal(DEFAULT_BRANCH_FALLBACK, "main");
});

test("resolveDefaultBranch: falls BACK rather than refusing — an unset value must not make the trunk corroborable", () => {
  // The failure this shape prevents: with no fallback, an empty `STORYTREE_DEFAULT_BRANCH` would
  // leave `main` matching no fence, so a push to the trunk — which IS a merge, and which
  // claim-release.yml is releasing at that very moment — would read as a session working.
  const plan = planCorroboration([{ ref: "refs/heads/main", kind: "push", observedAt: NOW_ISO }], {
    now: NOW,
    defaultBranch: resolveDefaultBranch({ defaultBranch: undefined }),
  });
  assert.deepEqual(plan.stamps, [], "main still vouches for nothing when the workflow said nothing");
});

// ── runCorroboration: the WHOLE run, including its failure path ──────────────
// This lives behind a seam rather than inside an entry-guarded `main` precisely so these tests can
// exist: the first draft put the pool lifecycle, the exit code and the failure message in a `main`
// nothing could call, and `check:mutation-diff` reported 29 mutants NO TEST REACHED. A silent writer
// is the defect this whole arc exists to end, so its own failure path is the last thing to leave
// unwitnessed.

interface Recorded {
  readonly lines: string[];
  readonly closed: { count: number };
  readonly store: RecordingBranchStore;
}

function depsFor(over: Partial<CorroborateDeps> = {}) {
  const lines: string[] = [];
  const closed = { count: 0 };
  const store = new RecordingBranchStore(2);
  const opened: OpenedStore = {
    store,
    close: async () => {
      closed.count += 1;
    },
  };
  const deps: CorroborateDeps = {
    env: { ref: "refs/heads/claude/alpha", defaultBranch: "main" },
    now: () => NOW,
    fetchRuns: async () => ({ workflow_runs: [{ head_branch: "claude/beta" }] }),
    openStore: async () => opened,
    log: (m: string) => lines.push(m),
    ...over,
  };
  return { deps, rec: { lines, closed, store } satisfies Recorded };
}

test("runCorroboration: observes both halves, stamps once, reports, exits 0, releases the pool", async () => {
  const { deps, rec } = depsFor();

  assert.equal(await runCorroboration(deps), 0, "the ledger was told");
  assert.deepEqual(
    rec.store.batches,
    [
      [
        { branch: "claude/alpha", observedAt: NOW_ISO, kind: "push" },
        { branch: "claude/beta", observedAt: NOW_ISO, kind: "check-running" },
      ],
    ],
    "the pushed ref and the running check both reach the ledger, in one write",
  );
  assert.ok(
    rec.lines.some((l) =>
      l.includes("2 branch(es) corroborated, 0 refused, 2 claim(s) moved forward"),
    ),
    "the report is printed, carrying what the LEDGER took rather than what was planned",
  );
  assert.equal(rec.closed.count, 1, "the pool is released");
});

test("runCorroboration: a STORE failure exits 1 and says what it costs — loud, unlike ingest-merge", async () => {
  const { deps, rec } = depsFor({
    openStore: async () => {
      throw new Error("simulated: DB idle-stopped");
    },
  });

  assert.equal(await runCorroboration(deps), 1, "a store failure is worth a red run");
  // Pinned whole: this line is the ONLY thing a person sees when the signal stops, so what it says
  // is the contract. `::error::` is what makes the Actions UI surface it instead of burying it.
  assert.deepEqual(rec.lines, [
    "::error::[ci-corroborate] the ledger was NOT told (simulated: DB idle-stopped). Claims on " +
      "the observed branches keep their old heartbeat and may read as unknown on the board until " +
      "the next push. Re-run this workflow, or investigate the store.",
  ]);
  assert.equal(rec.closed.count, 0, "nothing to release when the pool never opened");
  assert.ok(
    !rec.lines.some((l) => l.includes("teardown")),
    "and nothing is said about releasing a pool that was never opened",
  );
});

// ── The script entry, which is a FUNCTION here so that it can be proven at all ──

test("isScriptEntry: true only when argv[1] IS this module, whatever the path spelling", () => {
  const here = new URL(import.meta.url);
  const asPath = fileURLToPath(here);
  assert.equal(isScriptEntry(asPath, import.meta.url), true, "run directly");
  assert.equal(isScriptEntry(undefined, import.meta.url), false, "no argv[1] at all");
  assert.equal(isScriptEntry(asPath, "file:///somewhere/else.ts"), false, "a DIFFERENT module");
  assert.equal(
    isScriptEntry(fileURLToPath(new URL("./ingest-merge.ts", here)), import.meta.url),
    false,
    "its sibling writer, run as a script, must not start this one",
  );
});

test("runAsScript: IMPORTED — does nothing at all, which is what every test in this file relies on", async () => {
  const { deps, rec } = depsFor();
  const before = process.exitCode;

  assert.equal(await runAsScript("/not/this/module.ts", import.meta.url, deps), null);

  assert.equal(rec.store.batches.length, 0, "no write");
  assert.deepEqual(rec.lines, [], "no output");
  assert.equal(process.exitCode, before, "and no exit code claimed");
});

test("runAsScript: RUN — corroborates and reports its exit code through process.exitCode", async () => {
  const { deps, rec } = depsFor();
  const before = process.exitCode;
  try {
    assert.equal(await runAsScript("/x/y.ts", pathToFileURL("/x/y.ts").href, deps), 0);
    assert.equal(process.exitCode, 0);
    assert.equal(rec.store.batches.length, 1, "the run happened");
  } finally {
    process.exitCode = before;
  }
});

test("runAsScript: an UNKNOWN failure is still exit 1 and still says so — never a silent vanish", async () => {
  // runCorroboration already converts every KNOWN failure into an exit code, so anything reaching
  // this catch is an unknown. An unknown that disappeared quietly would be the exact defect this
  // writer exists to end.
  const lines: string[] = [];
  const { deps } = depsFor({
    now: () => {
      throw new Error("simulated: the clock itself failed");
    },
  });
  const before = process.exitCode;
  try {
    assert.equal(
      await runAsScript("/x/y.ts", pathToFileURL("/x/y.ts").href, deps, (m) => lines.push(m)),
      1,
    );
    assert.equal(process.exitCode, 1);
    assert.deepEqual(lines, [
      "::error::[ci-corroborate] unexpected error: simulated: the clock itself failed",
    ]);
  } finally {
    process.exitCode = before;
  }
});

test("nodeCorroborateDeps: openStore builds a real claim store over the pool, and releases BOTH halves", async () => {
  // The pool factory is a parameter so this closure can be driven offline — it is the one part of
  // the production wiring that would otherwise dial Cloud SQL, and therefore the one part nothing
  // could witness.
  const ended: string[] = [];
  // A single assertion, and it is legal rather than smuggled: a real `PoolHandle` is structurally
  // assignable to this literal's type, because `end` and `close` are the only members this wiring
  // touches. The two of them ARE what releasing a pool means here.
  const fakeHandle = {
    pool: { end: async () => void ended.push("pool") },
    connector: { close: () => void ended.push("connector") },
  } as PoolHandle;
  const deps = nodeCorroborateDeps(async () => fakeHandle);

  const opened = await deps.openStore();
  assert.ok(opened.store instanceof PgClaimStore, "a real store, over the pool it was handed");

  await opened.close();
  assert.deepEqual(ended, ["pool", "connector"], "the pool AND the connector are released");
});

test("runCorroboration: a failure INSIDE the write still exits 1 and still releases the pool", async () => {
  const closed = { count: 0 };
  const { deps } = depsFor({
    openStore: async () => ({
      store: {
        async stampBranchActivity(): Promise<number> {
          throw new Error("simulated: statement refused");
        },
      },
      close: async () => {
        closed.count += 1;
      },
    }),
  });

  assert.equal(await runCorroboration(deps), 1);
  assert.equal(closed.count, 1, "the finally runs on the failure path too");
});

test("runCorroboration: a pool that will not CLOSE is noise, not a fault — exits 0, and still says so", async () => {
  // It cannot un-write what already committed. But it IS said, because the alternative is a
  // swallowed error inside a writer whose whole subject is swallowed errors.
  const { deps, rec } = depsFor({
    openStore: async () => ({
      store: new RecordingBranchStore(1),
      close: async () => {
        throw new Error("simulated: teardown hung");
      },
    }),
  });

  assert.equal(await runCorroboration(deps), 0, "the write landed; teardown does not undo it");
  assert.ok(
    rec.lines.some((l) => l.includes("pool teardown error (ignored): simulated: teardown hung")),
  );
});

test("runCorroboration: a GITHUB outage is NOT a red run — the push half still lands", async () => {
  // ADR-0535 already records that this signal goes dark when GitHub does. Reddening a run for
  // someone else's outage teaches the one lesson a check must never teach.
  const { deps, rec } = depsFor({ fetchRuns: async () => null });

  assert.equal(await runCorroboration(deps), 0);
  assert.deepEqual(
    rec.store.batches,
    [[{ branch: "claude/alpha", observedAt: NOW_ISO, kind: "push" }]],
    "only the half that needed no API call",
  );
});

test("runCorroboration: nothing to say — the store is told nothing, and it still exits 0", async () => {
  const { deps, rec } = depsFor({
    env: { ref: "refs/heads/main", defaultBranch: "main" },
    fetchRuns: async () => null,
  });

  assert.equal(await runCorroboration(deps), 0);
  assert.equal(rec.store.batches.length, 0, "a fenced-out branch is not a write");
  assert.ok(
    rec.lines.some((l) =>
      l.includes("0 branch(es) corroborated, 1 refused, 0 claim(s) moved forward"),
    ),
  );
  assert.equal(rec.closed.count, 1);
});

test("runCorroboration: ONE clock reading is shared by every branch in the run", async () => {
  // Two readings would let the report and the ledger disagree about when this run observed, and a
  // per-branch clock read is a difference nothing downstream could explain.
  const { deps, rec } = depsFor({
    fetchRuns: async () => ({
      workflow_runs: [{ head_branch: "claude/beta" }, { head_branch: "claude/gamma" }],
    }),
  });

  await runCorroboration(deps);
  const stamped = rec.store.batches[0] ?? [];
  assert.equal(stamped.length, 3);
  assert.equal(new Set(stamped.map((s) => s.observedAt)).size, 1, "one instant for the whole run");
});

test("nodeCorroborateDeps: the production wiring, proven field by field except the live pool", async () => {
  // `openStore` dials Cloud SQL by construction, so it is the one thing no offline test can drive —
  // and reducing the unwitnessed region to that single closure is why it is its own field.
  const deps = nodeCorroborateDeps();

  assert.equal(deps.fetchRuns, fetchInProgressRuns, "the ONE admitted GitHub query, not another");
  assert.equal(deps.log, console.log);
  assert.ok(deps.now() instanceof Date, "a real clock, read per run");
  assert.equal(typeof deps.openStore, "function");

  const previous = process.env["STORYTREE_CORROBORATE_REF"];
  process.env["STORYTREE_CORROBORATE_REF"] = "refs/heads/claude/wired";
  try {
    assert.equal(
      nodeCorroborateDeps().env.ref,
      "refs/heads/claude/wired",
      "env is read from the real process environment, at call time",
    );
  } finally {
    if (previous === undefined) delete process.env["STORYTREE_CORROBORATE_REF"];
    else process.env["STORYTREE_CORROBORATE_REF"] = previous;
  }
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
