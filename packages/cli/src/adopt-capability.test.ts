import test from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { REPO_ROOT_ENV } from "@storytree/library";
import { SIGNING_EVENT_KIND } from "@storytree/proof-protocol";
import { SPINE_PRINCIPAL, type NodeBuildConfig } from "@storytree/orchestrator";
import type { AdoptCapabilityWiring } from "./adopt-capability.js";

import {
  adoptCapabilityCommand,
  adoptCapabilityHelp,
  approverOptsFor,
  branchAuthoredPaths,
  declaredCommand,
  declaredSourcePaths,
  loadAdoptCapability,
  pathLines,
  renderCommand,
} from "./adopt-capability.js";
import { run } from "./commands.js";

// ---------------------------------------------------------------------------
// The spec PROJECTION — which command an adoption observes, and which paths the
// service-history fence is measured against. Both decide whether a real verdict
// gets signed, so both are tested rather than trusted.
// ---------------------------------------------------------------------------

function config(over: Partial<NodeBuildConfig> = {}): NodeBuildConfig {
  return {
    command: { file: "pnpm", args: ["--filter", "@storytree/library", "test"] },
    scope: { testGlobs: ["packages/library/src/*.test.ts"], sourceGlobs: ["packages/library/src/*.ts"] },
    ...over,
  };
}

test("renderCommand joins file and args back into the one line the spine observes", () => {
  assert.equal(renderCommand({ file: "pnpm", args: ["--filter", "studio", "test"] }), "pnpm --filter studio test");
  assert.equal(renderCommand({ file: "node", args: [] }), "node");
});

test("renderCommand TRIMS the joined line — a blank arg in the declared vector must not become trailing whitespace on the observed command", () => {
  // The rendered string is what the spine spawns AND what the render quotes back, so a stray space
  // would follow the command into both.
  assert.equal(renderCommand({ file: "pnpm", args: ["test", ""] }), "pnpm test");
  assert.equal(renderCommand({ file: "", args: ["node"] }), "node");
});

test("declaredCommand prefers the `real:` arm's override over the node's base command", () => {
  const withReal = config({
    real: {
      testFile: "packages/library/src/knowledge-dag.test.ts",
      sourceFile: "packages/library/src/knowledge-dag.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
      proofCommand: { file: "pnpm", args: ["--filter", "studio", "exec", "vitest", "run", "x.test.ts"] },
    },
  });
  assert.equal(declaredCommand(withReal), "pnpm --filter studio exec vitest run x.test.ts");
});

test("declaredCommand falls back to the base command when the `real:` arm declares no override", () => {
  assert.equal(declaredCommand(config()), "pnpm --filter @storytree/library test");
});

test("declaredCommand is UNDEFINED with no proof block at all — the Class C wall, and never a default", () => {
  // ADR-0465 D2 signs on an OBSERVED green, so a capability nobody declared a command for has
  // nothing to observe. Inventing one here would manufacture the evidence the verdict rests on.
  assert.equal(declaredCommand(undefined), undefined);
});

test("declaredCommand is UNDEFINED when the declared vector renders EMPTY — a blank command is not a command", () => {
  // Otherwise an empty declaration would clear drive's Class C wall and be handed to the spine to
  // spawn, which is the one thing an `adopted` verdict may never rest on.
  assert.equal(declaredCommand(config({ command: { file: "", args: [] } })), undefined);
  assert.equal(declaredCommand(config({ command: { file: " ", args: [] } })), undefined);
});

test("declaredSourcePaths unions the write scope's globs with the `real:` arm's own source file", () => {
  const withReal = config({
    real: {
      testFile: "packages/library/src/store/connection.test.ts",
      sourceFile: "packages/library/src/store/connection.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
    },
  });
  assert.deepEqual(declaredSourcePaths(withReal), [
    "packages/library/src/*.ts",
    "packages/library/src/store/connection.ts",
  ]);
});

test("declaredSourcePaths does not duplicate a source file the globs already name", () => {
  const dup = config({
    scope: { testGlobs: [], sourceGlobs: ["packages/library/src/store/connection.ts"] },
    real: {
      testFile: "packages/library/src/store/connection.test.ts",
      sourceFile: "packages/library/src/store/connection.ts",
      scope: { testGlobs: [], sourceGlobs: [] },
    },
  });
  assert.deepEqual(declaredSourcePaths(dup), ["packages/library/src/store/connection.ts"]);
});

test("declaredSourcePaths is EMPTY with no proof block — drive then refuses, because an unfenceable capability is not adoptable", () => {
  assert.deepEqual(declaredSourcePaths(undefined), []);
});

// ---------------------------------------------------------------------------
// The disk loader
// ---------------------------------------------------------------------------

function storiesDirWith(files: Record<string, string>): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "adopt-cap-"));
  for (const [rel, body] of Object.entries(files)) {
    const full = path.join(root, rel);
    mkdirSync(path.dirname(full), { recursive: true });
    writeFileSync(full, body, "utf8");
  }
  return root;
}

const SPEC = `---
id: "widget-core"
tier: capability
title: "The widget core"
outcome: "A widget resolves."
status: proposed
proof_mode: integration-test
story: demo
proof:
  command:
    file: node
    args: ["--version"]
  scope:
    testGlobs: ["packages/demo/src/*.test.ts"]
    sourceGlobs: ["packages/demo/src/widget.ts"]
---

# The widget core
`;

test("loadAdoptCapability projects the slice the adoption reads, command and fence paths included", () => {
  const dir = storiesWithSpec();
  const spec = loadAdoptCapability(dir, "widget-core");
  assert.ok(spec !== null);
  assert.equal(spec.id, "widget-core");
  assert.equal(spec.tier, "capability");
  assert.equal(spec.title, "The widget core");
  assert.equal(spec.story, "demo");
  assert.equal(spec.proofCommand, "node --version");
  assert.deepEqual(spec.sourcePaths, ["packages/demo/src/widget.ts"]);
  assert.match(spec.file, /widget-core\.md$/);
});

test("loadAdoptCapability returns null for an id with no spec", () => {
  const dir = storiesWithSpec();
  assert.equal(loadAdoptCapability(dir, "no-such-capability"), null);
});

test("loadAdoptCapability returns null rather than throwing on an unreadable spec — the caller refuses, it does not crash", () => {
  const dir = storiesDirWith({ "demo/broken.md": "not frontmatter at all\n" });
  assert.equal(loadAdoptCapability(dir, "broken"), null);
});

test("a spec carrying NO proof block loads, but declares no command and no fence paths", () => {
  // This is the Class C shape — 43 of the arc's 71 capabilities. It must LOAD (so the refusal can
  // name what is missing) rather than fail to resolve, which would read as "no such capability".
  const bare = SPEC.split("proof:")[0] + "---\n\n# The widget core\n";
  const dir = storiesDirWith({ "demo/widget-core.md": bare });
  const spec = loadAdoptCapability(dir, "widget-core");
  assert.ok(spec !== null);
  assert.equal(spec.proofCommand, undefined);
  assert.deepEqual(spec.sourcePaths, []);
});

// ---------------------------------------------------------------------------
// The git seams — the service-history fence's only view of what this branch wrote
// ---------------------------------------------------------------------------

test("pathLines normalises a `--name-only` listing: CRLF trimmed, backslashes forward-slashed, blanks dropped", () => {
  // The fence compares by STRING against the capability's declared globs, so each of these is the
  // difference between a self-authored source matching its own declaration and silently missing it.
  assert.deepEqual(pathLines("packages/a/src/x.ts\r\npackages/a/src/y.ts\r\n"), [
    "packages/a/src/x.ts",
    "packages/a/src/y.ts",
  ]);
  assert.deepEqual(pathLines("packages\\a\\src\\x.ts"), ["packages/a/src/x.ts"]);
  assert.deepEqual(pathLines("a.ts\n\n\n  \nb.ts\n"), ["a.ts", "b.ts"]);
  assert.deepEqual(pathLines("  spaced.ts  "), ["spaced.ts"]);
});

test("pathLines answers EMPTY for the two shapes that mean 'git said nothing' — a failed read and a clean listing", () => {
  assert.deepEqual(pathLines(null), []);
  assert.deepEqual(pathLines(""), []);
});

/**
 * A throwaway repo the git seam can be run against for real. Never the checkout this test runs in:
 * the fence's whole subject is "what did THIS branch author", and deriving the expectation from the
 * live repo would be reading the answer off the subject. It also makes the suite portable — CI
 * checks out at `fetch-depth: 2` with no `origin/main` at all, so a test resting on the real
 * checkout's merge base would pass here and quietly stop asserting there.
 */
function throwawayRepo(opts: { originMain: boolean }): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "adopt-cap-repo-"));
  const git = (...args: string[]): void => {
    // Identity and line-ending policy are passed per invocation rather than written with three more
    // `git config` calls: every spawn here is paid again on each mutant run of this suite.
    execFileSync(
      "git",
      ["-c", "user.email=test@example.com", "-c", "user.name=Adoption Test",
       "-c", "commit.gpgsign=false", "-c", "core.autocrlf=false", ...args],
      { cwd: root, stdio: "ignore" },
    );
  };
  git("init", "-q");
  mkdirSync(path.join(root, "packages", "other", "src"), { recursive: true });
  writeFileSync(path.join(root, AUTHORED_TRACKED), "export const a = 1;\n", "utf8");
  git("add", "-A");
  git("commit", "-q", "-m", "base");
  // The base this branch is measured FROM. Without it there is no "before", which is the case the
  // fence has to fail closed on.
  if (opts.originMain) git("update-ref", "refs/remotes/origin/main", "HEAD");
  // What "this branch" then authored: one tracked file modified, one new file never added.
  writeFileSync(path.join(root, AUTHORED_TRACKED), "export const a = 2;\n", "utf8");
  mkdirSync(path.join(root, "packages", "other", "src", "nested"), { recursive: true });
  writeFileSync(path.join(root, AUTHORED_UNTRACKED), "export const b = 3;\n", "utf8");
  return root;
}

/** Modified against the base — git's own diff lists this one. */
const AUTHORED_TRACKED = path.join("packages", "other", "src", "base.ts");
/** Never added — git's diff does NOT list it, which is the half the seam has to add itself. */
const AUTHORED_UNTRACKED = path.join("packages", "other", "src", "nested", "new.ts");

// Built once and shared. Every consumer below only READS them, and each build spawns git several
// times — a per-test rebuild is paid again on every mutant run of this suite, which is what pushed
// the mutation rung into timeouts rather than verdicts.
let withBase: string | undefined;
let withoutBase: string | undefined;
let defaultStories: string | undefined;
/** A repo whose `origin/main` exists, so a merge base resolves. */
const repoWithBase = (): string => (withBase ??= throwawayRepo({ originMain: true }));
/** A repo with no `origin/main` — the case the fence must fail closed on. */
const repoWithoutBase = (): string => (withoutBase ??= throwawayRepo({ originMain: false }));
/** A stories dir holding the fixture capability spec. */
const storiesWithSpec = (): string =>
  (defaultStories ??= storiesDirWith({ "demo/widget-core.md": SPEC }));

test("branchAuthoredPaths reports both halves of what this branch wrote: the diff against the merge base AND the untracked files git's diff never lists", () => {
  const root = repoWithBase();
  const authored = branchAuthoredPaths(root);
  assert.ok(authored !== null);
  assert.deepEqual(
    [...authored].sort(),
    ["packages/other/src/base.ts", "packages/other/src/nested/new.ts"],
  );
});

test("branchAuthoredPaths FAILS CLOSED with no origin/main to resolve a base against — null, never an empty set", () => {
  // The distinction is the whole fence: an empty set says "this branch authored nothing", which
  // would ADOPT; null says "I could not tell", which drive refuses on.
  const root = repoWithoutBase();
  assert.equal(branchAuthoredPaths(root), null);
});

test("branchAuthoredPaths fails closed on a directory that is not a repo at all", () => {
  assert.equal(branchAuthoredPaths(mkdtempSync(path.join(os.tmpdir(), "adopt-cap-bare-"))), null);
});

// ---------------------------------------------------------------------------
// The signer seam
// ---------------------------------------------------------------------------

test("approverOptsFor passes a supplied --signer through, and says NOTHING when none was supplied", () => {
  // `{ flag: undefined }` would read as "a flag was supplied and it is blank" — the fail-closed
  // chain must see an absent input, so it falls through to STORYTREE_SIGNER and git user.email.
  assert.deepEqual(approverOptsFor("owner@example.com"), { flag: "owner@example.com" });
  assert.deepEqual(approverOptsFor(undefined), undefined);
});

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

test("the help states the basis, names every refusal, and does not rank adopted below driven", () => {
  // Pinned WHOLE. This text is the only thing standing between a session and a $2-3 run that cannot
  // succeed, so every clause of it is the product: which shapes refuse, why `adopted` is stronger
  // than the flip that was asked for, and that `driven` is not the senior mode (ADR-0465 D7).
  const env = adoptCapabilityHelp();
  assert.equal(env.ok, true);
  assert.equal(
    env.body,
    [
      "storytree adopt capability <capability-id> --pg — adopt ONE capability on the owner's recorded",
      "risk acceptance (ADR-0465 D2/D4), for work that is ALREADY built and ALREADY serving.",
      "",
      "WHY IT EXISTS. ADR-0443 D6 asked every unproven capability to earn its own driven verdict, but",
      "CONFIRM_RED is fail-closed: a capability whose implementation and test already exist, with a",
      "command that already passes, has NO RED LEFT to observe. The run halts, signs nothing, and costs",
      "~$2-3. ADR-0465 narrows D6 for exactly that population.",
      "",
      "WHAT IT SIGNS. The spine RE-RUNS the capability's declared command and OBSERVES it green at a",
      "clean committed HEAD, then signs an `adopted` verdict bound to the capability. The signer is the",
      "spine principal (the machine that watched the exit code); `approvedBy` is YOU — the party",
      "ACCEPTING THE RISK, never the signer, and no model signs either. This is deliberately stronger",
      "than the flip to green the owner asked for: a bare flip would record a state with no observation",
      "behind it.",
      "",
      "WHAT IT REFUSES, all before any spend:",
      "  · a STORY (that is `storytree adopt <story> --pg`, which keeps its own `mapped`-only guard —",
      "    this entry joins that guard with a different evidence basis, it never widens it)",
      "  · a capability that already holds its own signed pass (re-stamping could only lose it)",
      "  · a signed FAIL (a red is fixed, never adopted)",
      "  · a capability declaring NO proof command — nothing for the spine to observe. Author a `proof:`",
      "    block naming the command that already exercises it. If none does, that IS the finding: the",
      "    capability is unbuilt (prove it strictly) or not capability-shaped (route it to story-author).",
      "  · a capability whose source THIS BRANCH authored — adoption rests on work already serving, and",
      "    a capability adopted in the same landing that authored it is self-attestation (ADR-0465)",
      "  · a blank approver, the offline store, and a DIRTY tree (the verdict pins the commit observed)",
      "",
      "`adopted` is NOT a lesser verdict than a driven pass — the two differ in KIND, not rank (D7). A",
      "driven red→green is a forward-looking fence over one behaviour its author thought to check; time",
      "in service is evidence over every path real use actually took. No surface may render `driven` as",
      "the senior mode. What service history cannot speak to is the path nobody took.",
    ].join("\n"),
  );
  assert.deepEqual(env.next, [
    "storytree adopt capability <capability-id> --signer <email> --pg",
    "storytree tree <story-id>",
  ]);
});

// ---------------------------------------------------------------------------
// The wiring — the live seams resolved, drive's walls reached through them
// ---------------------------------------------------------------------------

interface RecordedRun {
  appended: { id: string; kind: string; doc: unknown; actor?: string }[];
  observed: string[];
}

/** A verdict event the fold reads as an OWN signed pass for `unitId`. */
function healthyVerdictEvent(unitId: string) {
  return {
    kind: SIGNING_EVENT_KIND,
    seq: 1,
    doc: {
      unitId,
      proofMode: "capability",
      outcome: "pass",
      commitSha: "0000000",
      signer: SPINE_PRINCIPAL,
      runId: "earlier-run",
      outputVersion: "v1",
      evidence: [{ kind: "observation:green", ref: unitId, note: "an earlier driven pass" }],
      at: "2026-01-01T00:00:00.000Z",
    },
  };
}

function wiring(over: Partial<AdoptCapabilityWiring> = {}) {
  const rec: RecordedRun = { appended: [], observed: [] };
  const base: AdoptCapabilityWiring = {
    storiesDir: storiesWithSpec(),
    repoRoot: repoWithBase(),
    verdicts: null,
    store: {
      appendEvent: async (e) => {
        rec.appended.push(e);
        return e;
      },
    },
    gitState: () => ({ commitSha: "abc1234def5678", clean: true }),
    observe: async (command) => {
      rec.observed.push(command);
      return { code: 0 };
    },
    resolveApprover: () => ({ ok: true, signer: "owner@example.com" }),
    ...over,
  };
  return { wiring: base, rec };
}

test("adoptCapabilityCommand resolves the disk, git, verdict and store seams and signs a real `adopted` row", async () => {
  const { wiring: w, rec } = wiring();
  const env = await adoptCapabilityCommand("widget-core", { signer: "owner@example.com" }, w);
  assert.equal(env.ok, true, env.body);
  // The DECLARED command was observed — projected off the spec on disk, never invented here.
  assert.deepEqual(rec.observed, ["node --version"]);
  assert.equal(rec.appended.length, 1);
  const row = rec.appended[0];
  assert.ok(row !== undefined);
  const verdict = row.doc as { unitId: string; proofMode: string; approvedBy?: string; at: string };
  assert.equal(verdict.unitId, "widget-core");
  assert.equal(verdict.proofMode, "adopted");
  assert.equal(verdict.approvedBy, "owner@example.com");
  // The clock is the live one, so the signing instant is a real timestamp rather than an absent field.
  assert.ok(!Number.isNaN(Date.parse(verdict.at)), `signed at an unparseable instant: ${verdict.at}`);
});

test("adoptCapabilityCommand folds the capability's OWN verdict log — an already-healthy capability refuses, and nothing is appended", async () => {
  const { wiring: w, rec } = wiring({
    verdicts: { readEvents: async () => [healthyVerdictEvent("widget-core")] },
  });
  const env = await adoptCapabilityCommand("widget-core", {}, w);
  assert.equal(env.ok, false);
  assert.match(env.body, /ALREADY holds its own signed pass/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("adoptCapabilityCommand folds by UNIT — another capability's signed pass is not this one's, so this one still adopts", async () => {
  const { wiring: w, rec } = wiring({
    verdicts: { readEvents: async () => [healthyVerdictEvent("some-other-capability")] },
  });
  const env = await adoptCapabilityCommand("widget-core", {}, w);
  assert.equal(env.ok, true, env.body);
  assert.equal(rec.appended.length, 1);
});

test("an UNREADABLE verdict store folds to null — genuinely unproven, never a false green and never a crash", async () => {
  const { wiring: w } = wiring({
    verdicts: {
      readEvents: async () => {
        throw new Error("store is down");
      },
    },
  });
  const env = await adoptCapabilityCommand("widget-core", {}, w);
  assert.equal(env.ok, true, env.body);
});

test("adoptCapabilityCommand routes an unknown id to drive's refusal, through the real disk loader", async () => {
  const { wiring: w, rec } = wiring();
  const env = await adoptCapabilityCommand("no-such-capability", {}, w);
  assert.equal(env.ok, false);
  assert.match(env.body, /no capability "no-such-capability"/);
  assert.equal(rec.observed.length, 0);
});

test("adoptCapabilityCommand applies the service-history fence against the REAL branch diff — a capability whose declared source this branch touched is refused", async () => {
  // `packages/other/src/base.ts` is what `throwawayRepo` has the branch modify, so declaring it as
  // this capability's own source is exactly the self-attestation shape.
  const selfAuthoredSpec = SPEC.replace(
    "packages/demo/src/widget.ts",
    "packages/other/src/base.ts",
  );
  const { wiring: w, rec } = wiring({
    storiesDir: storiesDirWith({ "demo/widget-core.md": selfAuthoredSpec }),
  });
  const env = await adoptCapabilityCommand("widget-core", {}, w);
  assert.equal(env.ok, false);
  assert.match(env.body, /THIS BRANCH authored the source of "widget-core"/);
  assert.match(env.body, /\n {2}packages\/other\/src\/base\.ts\n/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("adoptCapabilityCommand fails the fence CLOSED when the repo root has no base to measure against", async () => {
  const { wiring: w, rec } = wiring({ repoRoot: repoWithoutBase() });
  const env = await adoptCapabilityCommand("widget-core", {}, w);
  assert.equal(env.ok, false);
  assert.match(env.body, /fails CLOSED/);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

// ---------------------------------------------------------------------------
// Dispatch — `storytree adopt capability …` routing through the CLI's own areas
// ---------------------------------------------------------------------------

/**
 * Run one `storytree …` invocation with the repo root pointed at a throwaway repo, so the dispatch's
 * hard-wired `repoRoot()` (which the surface does not inject) resolves somewhere this test owns.
 */
async function runWithRepoRoot(
  argv: readonly string[],
  deps: Parameters<typeof run>[1],
  root: string,
): Promise<Awaited<ReturnType<typeof run>>> {
  const before = process.env[REPO_ROOT_ENV];
  const beforeSigner = process.env["STORYTREE_SIGNER"];
  process.env[REPO_ROOT_ENV] = root;
  process.env["STORYTREE_SIGNER"] = "owner@example.com";
  try {
    return await run(argv, deps);
  } finally {
    if (before === undefined) delete process.env[REPO_ROOT_ENV];
    else process.env[REPO_ROOT_ENV] = before;
    if (beforeSigner === undefined) delete process.env["STORYTREE_SIGNER"];
    else process.env["STORYTREE_SIGNER"] = beforeSigner;
  }
}

test("`adopt capability` with no id prints the help rather than refusing for a missing argument", async () => {
  const env = await run(["adopt", "capability"], {
    store: undefined as never,
    storiesDir: storiesWithSpec(),
  });
  assert.equal(env.ok, true);
  assert.equal(env.body, adoptCapabilityHelp().body);
});

test("`adopt capability <id>` routes to the capability entry, wired to the stories dir this CLI was given", async () => {
  const env = await run(["adopt", "capability", "no-such-capability"], {
    store: undefined as never,
    storiesDir: storiesWithSpec(),
  });
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'no capability "no-such-capability" (looked for a stories/*/no-such-capability.md spec, or its frontmatter did not load).',
  );
});

test("`adopt capability` reads the session's VERDICT store — a capability already holding its own signed pass refuses at the dispatch too", async () => {
  const env = await run(["adopt", "capability", "widget-core"], {
    store: undefined as never,
    storiesDir: storiesWithSpec(),
    verdicts: { readEvents: async () => [healthyVerdictEvent("widget-core")] },
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /ALREADY holds its own signed pass/);
});

test("`adopt capability` refuses offline: with no live verdict store wired, nothing is signed and the DB is named", async () => {
  // This is the deepest wall the dispatch can be driven to without a store: the spec loads, the
  // fence passes against a throwaway repo that touched none of the capability's declared source, an
  // approver resolves from STORYTREE_SIGNER — and then the persistence wall refuses.
  const env = await runWithRepoRoot(
    ["adopt", "capability", "widget-core"],
    {
      store: undefined as never,
      storiesDir: storiesWithSpec(),
    },
    repoWithBase(),
  );
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "adopt capability signs an `adopted` verdict to the live store (events.verdict) — run with the DB up.",
  );
});

test("the capability branch does not swallow the adopt area's other subcommands", async () => {
  // `capability` is one sub among several. A bare story id must still reach the STORY-grain entry:
  // were this branch to catch every sub, `adopt <story>` would have no third token and would answer
  // with the capability HELP — an ok:true envelope — instead of the story entry's own refusal.
  const store = undefined as never;
  const story = await run(["adopt", "library"], { store, storiesDir: storiesDirWith({}) });
  assert.equal(story.ok, false, "a bare story id must reach the story entry, not the capability help");
  assert.doesNotMatch(story.body, /adopt capability/);
  // And `plan` must still reach the offline classifier rather than a capability lookup.
  const plan = await run(["adopt", "plan", "library"], { store, storiesDir: storiesDirWith({}) });
  assert.equal(plan.ok, false);
  assert.doesNotMatch(plan.body, /no capability "library"/);
});
