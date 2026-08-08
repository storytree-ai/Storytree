import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import type { StoreEvent } from "@storytree/storage-protocol";
import type { CommitRec } from "@storytree/drive";

import { run } from "./commands.js";
import { CLI_AREAS } from "./cli-areas.js";

/**
 * `storytree factory health` — the RENDER contract (ADR-0316). The figures themselves are proven in
 * `@storytree/drive` (`factory-health.test.ts`, `coupling-churn.calibration.test.ts`); what is at
 * stake here is that the surface prints the window, the sample and the stated rules — and that where
 * a figure is refused the refusal reaches the reader instead of a number.
 */

const NOW = "2026-08-08T00:00:00.000Z";

/**
 * `InMemoryStore` stamps every event with the real clock, so a doc written now can never carry a
 * route that PRE-dates its own reinforcements — which is the only interesting shape here. This
 * overrides the event log with a fixed one; the projection half stays the real store's.
 */
class FixedLogStore extends InMemoryStore {
  readonly #log: StoreEvent[];

  constructor(log: StoreEvent[]) {
    super();
    this.#log = log;
  }

  override async readEvents(filter?: { id?: string }): Promise<StoreEvent[]> {
    return filter?.id === undefined ? this.#log : this.#log.filter((e) => e.id === filter.id);
  }
}

const GUARDRAIL_ID = "a-guardrail-that-kept-firing";
const TOOL_ID = "an-unbuilt-tool-gap";

async function seeded(): Promise<FixedLogStore> {
  const store = new FixedLogStore([
    { seq: 1, id: GUARDRAIL_ID, kind: "friction", type: "created", doc: {}, actor: "cli", at: "2026-07-10T00:00:00.000Z" },
    {
      seq: 2,
      id: GUARDRAIL_ID,
      kind: "friction",
      type: "updated",
      doc: { route: "guardrail" },
      actor: "cli",
      at: "2026-07-11T00:00:00.000Z",
    },
    { seq: 3, id: TOOL_ID, kind: "friction", type: "created", doc: {}, actor: "cli", at: "2026-07-10T00:00:00.000Z" },
  ]);
  await store.upsertDoc({
    id: GUARDRAIL_ID,
    kind: "friction",
    doc: {
      title: "a guardrail that kept firing",
      route: "guardrail",
      reinforcedBy: [
        { branch: "claude/a", date: "2026-07-12", evidence: "`x`" },
        { branch: "claude/b", date: "2026-07-16", evidence: "`y`" },
      ],
    },
  });
  // Routed `tool` but never adjudicated in the log — it is in the live population and carries no
  // recurrence, which is the ordinary shape most of the board is in.
  await store.upsertDoc({
    id: TOOL_ID,
    kind: "friction",
    doc: { title: "an unbuilt tool gap", route: "tool" },
  });
  return store;
}

/** A window at exactly the reference dispatch rate, so the churn leg renders rather than refuses. */
function busyCommits(): CommitRec[] {
  const t0 = Date.parse("2026-08-01T00:00:00Z") / 1000;
  const landings: CommitRec[] = Array.from({ length: 34 }, (_, i) => ({
    sha: `l${i}`,
    at: t0 + i * 1800,
    parents: [`p${i}`, `h${i}`],
    subject: `Merge pull request #${i} from storytree-ai/claude/branch-${i}`,
  }));
  return [
    {
      sha: "r1",
      at: t0 + 100,
      parents: ["own", "main"],
      subject: "Merge remote-tracking branch 'origin/main' into claude/x",
    },
    ...landings,
  ];
}

const CHURN_DEPS = {
  factory: {
    now: NOW,
    repoRoot: "/nowhere",
    commits: () => busyCommits(),
    absorbed: () => ["packages/cli/src/a.ts", "docs/research/dump.json", "stories/x/story.md"],
  },
};

test("`factory` is a declared CLI area, so the dispatch and the surface list agree", () => {
  assert.ok(CLI_AREAS.includes("factory"));
});

test("factory health prints the window, the sample and the attribution rule for question 1", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "recurrence"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /IS RECURRENCE BEING EXTINGUISHED\?/);
  assert.match(env.body, /window: \(all history\) -> \(now\)/);
  assert.match(env.body, /sample: 2 friction item\(s\), 1 routed, over 3 library event\(s\)/);
  assert.match(env.body, /attribution rule:/);
  assert.match(env.body, /day-granular/);
});

test("question 1 splits the tripwire route from the expected one and never blends them", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "recurrence"], { store });
  assert.match(env.body, /guardrail\s+\[TRIPWIRE\]\s+2 post-route reinforcement\(s\)/);
  assert.match(env.body, /guidance that renders into every session landed/);
  assert.match(env.body, /a-guardrail-that-kept-firing/);
  // The `tool` item never reached the event log's route, so it opens no span and is NOT reported as
  // a route with zero recurrence — an item the log cannot place is absent, not a silent zero.
  assert.equal(env.body.includes("tool "), false);
});

test("question 2 states its population and its collapsing rule, and labels volume as context", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "bottlenecks"], { store });
  assert.match(env.body, /HOW MANY DISTINCT BOTTLENECKS ARE LIVE\?/);
  assert.match(env.body, /2 distinct live cause\(s\) — a CEILING, from 2 filing\(s\)/);
  assert.match(env.body, /population:/);
  assert.match(env.body, /collapsing rule:/);
  assert.match(env.body, /CEILING on distinctness/);
  assert.match(env.body, /context \(NOT a health figure — ADR-0316 D3\)/);
});

test("REFUSAL reaches the reader: a quiet churn window prints the failed condition, not a ratio", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "churn", "--from", "2026-08-01", "--to", "2026-08-08"], {
    store,
    ...CHURN_DEPS,
  });
  assert.equal(env.ok, true, "a refusal is a first-class OUTPUT, never a failed command");
  assert.match(env.body, /re-syncs per landing: REFUSED/);
  assert.match(env.body, /below the 80% floor/);
  assert.match(env.body, /DECLINED/);
  // Rate-normalised figures are still printed — refusing one figure never blanks the report.
  assert.match(env.body, /per-landing absorbed churn: /);
  assert.match(env.body, /channel composition of absorbed churn/);
});

test("a comparable churn window DOES render the ratio, so the floor is reachable", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "churn", "--from", "2026-08-01", "--to", "2026-08-02"], {
    store,
    ...CHURN_DEPS,
  });
  assert.match(env.body, /re-syncs per landing: 0\.03/);
  assert.match(env.body, /comparable/);
});

test("the exclusion is stated in the output rather than buried in the code", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "churn", "--from", "2026-08-01", "--to", "2026-08-02"], {
    store,
    ...CHURN_DEPS,
  });
  assert.match(env.body, /excluded: docs\/research\/ — bulk additive research dumps/);
  assert.match(env.body, /BLIND SPOT, stated: claim-queue delay is invisible here/);
});

test("the caller may state its own dispatch-rate reference, and it is printed with the verdict", async () => {
  const store = await seeded();
  const env = await run(
    ["factory", "health", "churn", "--from", "2026-08-01", "--to", "2026-08-08", "--landings-per-day", "4"],
    { store, ...CHURN_DEPS },
  );
  assert.match(env.body, /caller-supplied \(4 landings\/day\)/);
  assert.match(env.body, /re-syncs per landing: 0\.03/);
});

test("an unreadable trunk ref REFUSES the churn leg rather than reporting a zeroed one", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "churn"], {
    store,
    factory: {
      now: NOW,
      repoRoot: "/nowhere",
      commits: () => {
        throw new Error("fatal: ambiguous argument 'origin/main': unknown revision");
      },
    },
  });
  assert.match(env.body, /REFUSED: cannot read the trunk history at `origin\/main`/);
  assert.match(env.body, /shallow clone carries no trunk history/);
  assert.equal(env.body.includes("re-syncs per landing: 0"), false);
});

test("the reading a surface consumes is printed, and the loud/quiet threshold is NOT set here", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "bottlenecks"], { store });
  assert.match(env.body, /THE READING/);
  assert.match(env.body, /loudest live cause: a-guardrail-that-kept-firing — recurred ×2/);
  assert.match(env.body, /The loud\/quiet THRESHOLD is not set here/);
});

test("an unknown question is refused by name, with the three that exist offered", async () => {
  const store = await seeded();
  const env = await run(["factory", "health", "velocity"], { store });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown factory health question "velocity"/);
  assert.match(env.body, /recurrence \| bottlenecks \| churn/);
});

test("factory --help describes a REPORT-ONLY instrument that does not adjudicate", async () => {
  const store = await seeded();
  const env = await run(["factory", "--help"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /REPORT-ONLY \(ADR-0316 D1\)/);
  assert.match(env.body, /not a gate rung, blocks no merge/);
  assert.match(env.body, /MEASURES and does not ADJUDICATE/);
});
