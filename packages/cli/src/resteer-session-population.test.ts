import { test } from "node:test";
import assert from "node:assert/strict";

import { InMemoryStore } from "@storytree/storage-protocol";
import { Resteer, type SessionPopulation } from "@storytree/library";

import { run } from "./commands.js";
import { listResteer } from "./resteer.js";
import {
  isSessionBranch,
  parseSessionBranches,
  sessionPopulationSince,
} from "./resteer-session-population.js";

/**
 * The git half of the re-steer denominator. Every case here is a way the parse could quietly produce
 * the WRONG POPULATION — and a wrong denominator is invisible in the rate it produces, which is why
 * these are examples rather than a single happy path.
 */

/** A `git log --merges --format=%s` transcript. */
function log(...subjects: readonly string[]): string {
  return subjects.join("\n");
}

test("session-population: both owner namespaces are stripped, so one session is not counted twice", () => {
  // This repo moved from a personal account to an org, so history carries BOTH prefixes. A re-steer
  // row is stamped with neither — it records `claude/foo` — so a population that kept the prefix
  // would match nothing and report a 0% intervention rate over a full denominator.
  const branches = parseSessionBranches(
    log(
      "Merge pull request #1870 from storytree-ai/claude/sleepy-neumann-7eba33",
      "Merge pull request #1200 from HuaMick/claude/older-session",
    ),
  );

  assert.deepEqual(branches, ["claude/older-session", "claude/sleepy-neumann-7eba33"]);
});

test("session-population: a branch merged twice is one session", () => {
  const branches = parseSessionBranches(
    log(
      "Merge pull request #10 from storytree-ai/claude/one",
      "Merge pull request #11 from HuaMick/claude/one",
    ),
  );

  assert.deepEqual(branches, ["claude/one"]);
});

test("session-population: promotion branches are excluded — a build artifact is not a sitting", () => {
  // `claude/real/*` is the promotion branch a session produces, not a session anyone could re-steer.
  // Counting it inflates the denominator with rows that had no owner in the loop.
  const branches = parseSessionBranches(
    log(
      "Merge pull request #12 from HuaMick/claude/real/promote-thing",
      "Merge pull request #13 from storytree-ai/claude/genuine-session",
    ),
  );

  assert.deepEqual(branches, ["claude/genuine-session"]);
});

test("session-population: non-PR merge subjects are ignored", () => {
  // `Merge origin/main into <branch>` is a session SYNCING, not landing. It appears in
  // `git log --merges` and names a branch, so an unanchored parse would count every re-sync as a
  // fresh session and silently multiply the denominator.
  const branches = parseSessionBranches(
    log(
      "Merge origin/main into claude/priceless-knuth-7da868",
      "Merge branch 'claude/something' into claude/other",
      "Merge pull request #14 from storytree-ai/claude/real-landing",
    ),
  );

  assert.deepEqual(branches, ["claude/real-landing"]);
});

test("session-population: pre-convention and non-session branches are excluded", () => {
  // The old `worktree-*` era predates the capture entirely, and `feat`/`fix`/`chore` branches are not
  // agent sittings.
  const branches = parseSessionBranches(
    log(
      "Merge pull request #1 from storytree-ai/worktree-old-style",
      "Merge pull request #2 from HuaMick/feat/hand-authored",
      "Merge pull request #3 from HuaMick/fix/something",
      "Merge pull request #4 from storytree-ai/claude/kept",
    ),
  );

  assert.deepEqual(branches, ["claude/kept"]);
});

test("session-population: a codex session counts — it runs the same retro", () => {
  const branches = parseSessionBranches(
    log("Merge pull request #5 from storytree-ai/codex/some-session"),
  );

  assert.deepEqual(branches, ["codex/some-session"]);
});

test("session-population: empty log yields an empty population, not a throw", () => {
  assert.deepEqual(parseSessionBranches(""), []);
});

test("session-population: isSessionBranch draws the line at the runtime prefix", () => {
  assert.equal(isSessionBranch("claude/foo"), true);
  assert.equal(isSessionBranch("codex/foo"), true);
  assert.equal(isSessionBranch("claude/real/foo"), false);
  assert.equal(isSessionBranch("worktree-foo"), false);
  assert.equal(isSessionBranch("main"), false);
});

test("session-population: git failure yields null, so the caller reports NOT COMPUTABLE", () => {
  // FAIL CLOSED. Without a checkout (or without `origin/main`) there is no honest denominator, and the
  // report must keep saying so. Returning an empty population instead would divide by zero sessions;
  // returning the filing branches would count only the re-steered ones and print 100%.
  const population = sessionPopulationSince("2026-09-05", {
    runGit: () => {
      throw new Error("not a git repository");
    },
  });

  assert.equal(population, null);
});

test("session-population: the EXACT git query is asserted, not just its window", () => {
  // Every argument is load-bearing and each fails differently if dropped: without `--merges` the log
  // carries ordinary commits, without `--format=%s` the parse sees hashes, without `--since` the
  // denominator spans all history (~1,856 PRs against ~61 in the window, which reads as a reassuring
  // 0.5%), and without `origin/main` it reports whatever this branch happens to contain. Asserting
  // membership one flag at a time lets any of the others be silently dropped.
  let seen: readonly string[] = [];
  const population = sessionPopulationSince("2026-09-05", {
    runGit: (args) => {
      seen = args;
      return log("Merge pull request #6 from storytree-ai/claude/in-window");
    },
  });

  assert.deepEqual(seen, ["log", "--merges", "--format=%s", "--since=2026-09-05", "origin/main"]);
  assert.equal(population?.since, "2026-09-05");
  assert.deepEqual(population?.branches, ["claude/in-window"]);
});

test("session-population: the source line states the selection bias in full", () => {
  // The bias is not fixable from this source, so it must travel WITH the number rather than living in
  // a doc comment the reader never opens. Both halves are asserted — the half naming WHAT is counted
  // and the half naming what is MISSED — because either alone leaves the reader able to misread it.
  const population = sessionPopulationSince("2026-09-05", { runGit: () => "" });

  assert.ok(population !== null);
  assert.ok(
    population.source.includes("LANDED sessions only"),
    "the source must say which sessions it counts",
  );
  assert.ok(
    population.source.includes("never opened a PR"),
    "the source must name the sessions it cannot see",
  );
  assert.ok(
    population.source.includes("at least this, never less"),
    "the source must name the DIRECTION of the bias, which is the part that makes it usable",
  );
});

test("session-population: a REVERT commit quoting a merge subject is not a session", () => {
  // `Revert "Merge pull request #9 from …"` contains the whole merge subject as a substring. The
  // anchor on the pattern is the only thing keeping it out of the population — and a revert is a
  // commit that lands on main, so this is an everyday shape rather than a contrived one.
  const branches = parseSessionBranches(
    log(
      'Revert "Merge pull request #9 from storytree-ai/claude/reverted-session"',
      "Merge pull request #10 from storytree-ai/claude/genuine",
    ),
  );

  assert.deepEqual(branches, ["claude/genuine"]);
});

test("session-population: CRLF line endings parse — git on Windows is the normal case here", () => {
  // This repo's dev box is Windows. A parse that only handles `\n` would silently see every branch
  // name with a trailing `\r`, which matches no re-steer stamp and reports a 0% intervention rate
  // over a full denominator.
  const branches = parseSessionBranches(
    "Merge pull request #11 from storytree-ai/claude/one\r\nMerge pull request #12 from HuaMick/claude/two\r\n",
  );

  assert.deepEqual(branches, ["claude/one", "claude/two"]);
});

test("session-population: the owner is stripped at the FIRST slash, whatever its length", () => {
  // The strip is positional, not a match against the two owner names this repo happens to have used.
  // A one-character owner is the boundary that catches an off-by-one in the slice.
  const branches = parseSessionBranches(
    log(
      "Merge pull request #13 from a/claude/short-owner",
      "Merge pull request #14 from some-much-longer-org/claude/long-owner",
    ),
  );

  assert.deepEqual(branches, ["claude/long-owner", "claude/short-owner"]);
});

test("session-population: a head ref with no owner at all is not a session branch", () => {
  const branches = parseSessionBranches(log("Merge pull request #15 from main"));

  assert.deepEqual(branches, []);
});

/* -------------------------------------------------------------------------------------------- */
/* The RENDER — what `resteer list` actually prints once a denominator exists                     */
/* -------------------------------------------------------------------------------------------- */

/**
 * A stored re-steer row. PARSED rather than cast, so a fixture that stops matching the schema fails
 * here instead of being silently skipped by `listResteer`'s own `safeParse` — which would leave every
 * assertion below passing over an empty report.
 */
async function seed(store: InMemoryStore, id: string, branch: string): Promise<void> {
  const doc = Resteer.parse({
    kind: "resteer",
    id,
    title: `re-steer ${id}`,
    description: "fixture",
    createdAt: "2026-09-06T00:00:00.000Z",
    updatedAt: "2026-09-06T00:00:00.000Z",
    schemaVersion: 1,
    doing: "what the session was doing",
    redirect: "what the owner asked for instead",
    evidence: "his words, quoted",
    disposition: "defect",
    dispositionBy: "owner",
    mode: "step-repetition",
    provenance: { branch, date: "2026-09-06", source: "retro" },
  });
  await store.upsertDoc({ id, kind: "resteer", doc, actor: "t" });
}

function pop(branches: readonly string[]): SessionPopulation {
  return { branches, since: "2026-09-05", source: "test population" };
}

test("resteer-list: with a denominator it prints the rate block EXACTLY, and nothing it has no data for", async () => {
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");

  const res = await listResteer(store, pop(["claude/one", "claude/two", "claude/three", "claude/four"]));

  // The whole block, verbatim. Asserted as one string rather than four `includes` calls: a caveat
  // line that silently emptied, or a blank line that stopped separating the block from the figures
  // above it, would pass every membership check while changing what the reader sees.
  // Anchored on the line ABOVE it, so the blank separator is pinned too: a report whose sections run
  // together is a different reading experience, and a membership check on the heading alone cannot
  // see that.
  assert.ok(
    res.body.includes(
      "  taste called by owner / by agent:         0 / 0\n" +
        "\n" +
        "HUMAN INTERVENTION RATE\n" +
        "  1 of 4 sessions re-steered — 25.0%\n" +
        "  window: landings since 2026-09-05\n" +
        "  ⚠ test population.\n",
    ),
    `rate block not found verbatim in:\n${res.body}`,
  );
  // With nothing unattributable and nothing outside the population, NEITHER warning may appear —
  // a report that always prints its caveats teaches the reader to skip them.
  assert.ok(!res.body.includes("carry no usable branch stamp"));
  assert.ok(!res.body.includes("outside the population"));
  assert.ok(
    !res.body.includes("HUMAN INTERVENTION RATE — needs a count"),
    "the not-computable caveat must be gone once the rate is reported",
  );
});

test("resteer-list: without a denominator it prints the caveat and no rate", async () => {
  // The pre-existing behaviour, which is the honest one: absent is not zero.
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");

  const res = await listResteer(store);

  assert.ok(!res.body.includes("HUMAN INTERVENTION RATE\n"), "no rate block without a population");
  assert.ok(res.body.includes("HUMAN INTERVENTION RATE — needs a count of sessions"));
});

test("resteer-list: unattributable rows are printed as their own line, not folded into the ratio", async () => {
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");
  await seed(store, "r2", "HEAD");

  const res = await listResteer(store, pop(["claude/one", "claude/two"]));

  assert.ok(res.body.includes("1 of 2 sessions re-steered — 50.0%"), "HEAD must not enter either side");
  assert.ok(
    res.body.includes(
      "  ⚠ 1 row(s) carry no usable branch stamp (detached HEAD, or no\n" +
        "    provenance) and are counted in NEITHER side of this ratio.\n",
    ),
    `unattributable warning not found verbatim in:\n${res.body}`,
  );
});

test("resteer-list: filing branches outside the population are named, sorted, and the rate stays under 100%", async () => {
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/landed");
  // Seeded in NON-alphabetical order, so the rendered list proves the sort rather than inheriting it
  // from insertion order. A reader comparing two windows needs a stable list.
  await seed(store, "r2", "claude/zeta-never-landed");
  await seed(store, "r3", "claude/alpha-never-landed");

  const res = await listResteer(store, pop(["claude/landed"]));

  assert.ok(res.body.includes("1 of 1 sessions re-steered — 100.0%"));
  assert.ok(
    res.body.includes(
      "  ⚠ 2 filing branch(es) are outside the population — never\n" +
        "    landed, or landed outside the window — so they are excluded from the numerator:\n" +
        "    claude/alpha-never-landed, claude/zeta-never-landed",
    ),
    `outside-population warning not found verbatim (or not sorted) in:\n${res.body}`,
  );
});

test("session-population: a subject line with surrounding whitespace still parses", () => {
  // The line is trimmed before matching, because the pattern is anchored: any leading space would
  // otherwise drop the commit silently, shrinking the denominator and RAISING the reported rate.
  const branches = parseSessionBranches(
    "   Merge pull request #16 from storytree-ai/claude/indented   ",
  );

  assert.deepEqual(branches, ["claude/indented"]);
});

test("resteer list: the dispatcher hands the population through to the report", async () => {
  // The wiring itself. `deps.sessionPopulation` is a thunk the composition root supplies; a test that
  // omits it gets the not-computable output, so this is the only place the connected path is proved.
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");

  const res = await run(["resteer", "list"], {
    store,
    sessionPopulation: () => pop(["claude/one", "claude/two"]),
  });

  assert.ok(res.body.includes("1 of 2 sessions re-steered — 50.0%"));
});

test("resteer list: with no population thunk the dispatcher still reports NOT COMPUTABLE", async () => {
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");

  const res = await run(["resteer", "list"], { store });

  assert.ok(res.body.includes("HUMAN INTERVENTION RATE — needs a count of sessions"));
});

test("resteer list: only `list` reaches the report — a sibling subcommand is not the list", async () => {
  // The dispatch guard on the line this branch changed. Without a case that takes the OTHER branch,
  // nothing here can tell `sub === "list"` from an unconditional true, and a `resteer agreement` that
  // silently printed the intervention rate would pass every test above.
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/one");
  const population = (): SessionPopulation => pop(["claude/one", "claude/two"]);

  const unknown = await run(["resteer", "nonsense"], { store, sessionPopulation: population });
  assert.equal(unknown.ok, false);
  assert.ok(unknown.body.includes('unknown resteer command "nonsense"'));
  assert.ok(!unknown.body.includes("HUMAN INTERVENTION RATE"));

  const agreement = await run(["resteer", "agreement"], { store, sessionPopulation: population });
  assert.ok(!agreement.body.includes("HUMAN INTERVENTION RATE"));
});

test("resteer-list: a clean window reports 0.0% — a real reading, not an absent one", async () => {
  // The distinction the whole tier rests on: NO re-steers over a KNOWN population is a genuine 0%,
  // where no population at all is not computable. Both must be reachable and they must not look alike.
  const store = new InMemoryStore();
  await seed(store, "r1", "claude/outside-the-window");

  const res = await listResteer(store, pop(["claude/a", "claude/b"]));

  assert.ok(res.body.includes("0 of 2 sessions re-steered — 0.0%"));
});
