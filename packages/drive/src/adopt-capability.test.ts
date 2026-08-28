import test from "node:test";
import assert from "node:assert/strict";

import type { Status } from "@storytree/proof-protocol";
import { SPINE_PRINCIPAL } from "@storytree/orchestrator";

import {
  pathMatchesDeclared,
  runAdoptCapability,
  selfAuthoredSources,
  type AdoptCapabilityDeps,
  type AdoptCapabilitySpec,
} from "./adopt-capability.js";

// ---------------------------------------------------------------------------
// Fixtures — every seam injected, so the whole suite is offline: no disk, no git,
// no subprocess, no DB.
//
// WHY THE REFUSAL BODIES ARE ASSERTED WHOLE, NOT BY FRAGMENT. For this command the
// guidance text IS the product: a refusal's entire job is telling a session what to
// do INSTEAD, before it spends $2-3 on a run that structurally cannot succeed. A
// fragment match leaves every other sentence of the same message unpinned — the
// sentence naming the honest alternative can rot away while the test stays green.
// So each wall below pins its body and its `next:` exactly, and keeps the
// behavioural assertions (nothing observed, nothing appended) alongside.
// ---------------------------------------------------------------------------

const CAP: AdoptCapabilitySpec = {
  id: "hydrated-store-dialing-root",
  tier: "capability",
  title: "The hydrated store dialing root",
  story: "library",
  proofCommand: "pnpm --filter @storytree/library test",
  sourcePaths: ["packages/library/src/store/connection.ts"],
  file: "stories/library/hydrated-store-dialing-root.md",
};

interface Recorded {
  appended: { id: string; kind: string; doc: unknown; actor?: string }[];
  observed: string[];
}

function makeDeps(over: Partial<AdoptCapabilityDeps> = {}, spec: AdoptCapabilitySpec | null = CAP) {
  const rec: Recorded = { appended: [], observed: [] };
  const deps: AdoptCapabilityDeps = {
    loadCapability: () => spec,
    ownStatus: async (): Promise<Status | null> => null,
    branchAuthoredPaths: () => ["packages/cli/src/unrelated.ts"],
    gitState: () => ({ commitSha: "abc1234def5678", clean: true }),
    observe: async (command) => {
      rec.observed.push(command);
      return { code: 0 };
    },
    resolveApprover: () => ({ ok: true, signer: "owner@example.com" }),
    store: {
      appendEvent: async (e) => {
        rec.appended.push(e);
        return e;
      },
    },
    now: () => new Date("2026-08-28T00:00:00.000Z"),
    ...over,
  };
  return { deps, rec };
}

// ---------------------------------------------------------------------------
// The pure fence helpers
// ---------------------------------------------------------------------------

test("pathMatchesDeclared: literal, single-star and double-star, and it never matches across a segment on a lone star", () => {
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/x.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/y.ts"), false);

  // A lone `*` stays INSIDE one segment — this is what stops a narrow declaration from silently
  // fencing (or failing to fence) a whole subtree.
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/src/*.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/deep/x.ts", "packages/a/src/*.ts"), false);

  // `**` crosses segments.
  assert.equal(pathMatchesDeclared("packages/a/src/deep/x.ts", "packages/a/**/*.ts"), true);
  assert.equal(pathMatchesDeclared("packages/a/src/x.ts", "packages/a/**"), true);

  // A regex metacharacter in a path is compared literally, never as a pattern.
  assert.equal(pathMatchesDeclared("packages/a+b/x.ts", "packages/a+b/x.ts"), true);
  assert.equal(pathMatchesDeclared("packages/aXb/x.ts", "packages/a+b/x.ts"), false);
});

test("pathMatchesDeclared ESCAPES a metacharacter rather than dropping it, so a `+` in a glob pattern still has to be there literally", () => {
  // The escape is what stops `packages/a+b/*.ts` from quietly fencing `packages/ab/…` — with the
  // metacharacter deleted instead of escaped, `a+b` would read as "one or more `a` then `b`".
  assert.equal(pathMatchesDeclared("packages/a+b/x.ts", "packages/a+b/*.ts"), true);
  assert.equal(pathMatchesDeclared("packages/ab/x.ts", "packages/a+b/*.ts"), false);
  assert.equal(pathMatchesDeclared("packages/aab/x.ts", "packages/a+b/*.ts"), false);
  // Same for the other forms the `proof:` blocks can carry.
  assert.equal(pathMatchesDeclared("packages/aXb/x.ts", "packages/a.b/*.ts"), false);
  assert.equal(pathMatchesDeclared("packages/a?b/x.ts", "packages/a?b/*.ts"), true);
});

test("selfAuthoredSources: returns only the branch paths that are this capability's own declared source, sorted", () => {
  const hits = selfAuthoredSources(
    ["packages/z/src/other.ts", "packages/a/src/x.ts", "packages/a/src/b.ts"],
    ["packages/a/src/*.ts"],
  );
  assert.deepEqual(hits, ["packages/a/src/b.ts", "packages/a/src/x.ts"]);
  assert.deepEqual(selfAuthoredSources(["packages/z/src/other.ts"], ["packages/a/src/*.ts"]), []);
});

test("selfAuthoredSources matches a path against ANY declared pattern, not all of them — a capability declaring two sources is fenced on either", () => {
  const declared = ["packages/a/src/*.ts", "packages/b/src/*.ts"];
  assert.deepEqual(selfAuthoredSources(["packages/a/src/x.ts"], declared), ["packages/a/src/x.ts"]);
  assert.deepEqual(selfAuthoredSources(["packages/b/src/y.ts"], declared), ["packages/b/src/y.ts"]);
  assert.deepEqual(selfAuthoredSources(["packages/c/src/z.ts"], declared), []);
});

// ---------------------------------------------------------------------------
// The walls — each refuses, and (the load-bearing part) refuses BEFORE any spend
// ---------------------------------------------------------------------------

const NO_ID_BODY =
  "adopt capability needs a capability id: storytree adopt capability <capability-id> --pg";

test("refuses with no capability id, and never reaches the spec loader", async () => {
  let loaded = 0;
  const { deps } = makeDeps({
    loadCapability: () => {
      loaded += 1;
      return CAP;
    },
  });
  const env = await runAdoptCapability(undefined, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_ID_BODY);
  assert.deepEqual(env.next, ["storytree tree", "storytree adopt capability --help"]);
  assert.equal(loaded, 0);
});

test("a BLANK id is no id — whitespace is trimmed before the emptiness test, so `adopt capability \"   \"` refuses rather than hunting for a spec named by spaces", async () => {
  let loaded = 0;
  const { deps } = makeDeps({
    loadCapability: () => {
      loaded += 1;
      return CAP;
    },
  });
  const env = await runAdoptCapability("   ", {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_ID_BODY);
  assert.equal(loaded, 0);
});

test("refuses an unknown capability", async () => {
  const { deps } = makeDeps({}, null);
  const env = await runAdoptCapability("nope", {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'no capability "nope" (looked for a stories/*/nope.md spec, or its frontmatter did not load).',
  );
  assert.deepEqual(env.next, ["storytree tree", "storytree library artifact nope"]);
});

test("the id is TRIMMED before it is used — a padded argument names the same capability, and the refusal quotes the trimmed id", async () => {
  const { deps } = makeDeps({}, null);
  const env = await runAdoptCapability("  nope  ", {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'no capability "nope" (looked for a stories/*/nope.md spec, or its frontmatter did not load).',
  );
  assert.deepEqual(env.next, ["storytree tree", "storytree library artifact nope"]);
});

test("a STORY is refused here and pointed at the status-guarded story entry — the mapped-only guard is not walked around at another grain", async () => {
  // A story spec names no OWNING story (it is one), so this also pins the `next:` line's fallback:
  // it renders `storytree tree`, never `storytree tree ` or `storytree tree undefined`.
  const { deps, rec } = makeDeps({}, { ...CAP, id: "library", tier: "story", story: undefined });
  const env = await runAdoptCapability("library", {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    '"library" is a STORY. Story-grain adoption is a different decision with a different evidence basis (it enters the proving process and flips mapped → proposed):\n' +
      "  storytree adopt library --pg",
  );
  assert.deepEqual(env.next, ["storytree tree"]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a CONTRACT is refused — it is proven by the capability that folds it", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, tier: "contract" });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    '"hydrated-store-dialing-root" is a contract, not a capability. A contract is proven by the capability that folds it, never adopted on its own.',
  );
  // The owning story IS carried through when the spec declares one.
  assert.deepEqual(env.next, ["storytree tree library"]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("NEVER stamps over an own signed pass — an already-healthy capability refuses and nothing is appended", async () => {
  const { deps, rec } = makeDeps({ ownStatus: async () => "healthy" }, { ...CAP, story: undefined });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'capability "hydrated-store-dialing-root" ALREADY holds its own signed pass — there is nothing to adopt.\n' +
      "Appending another verdict could only overwrite it (the fold is last-event-wins), so this refuses\n" +
      "rather than trading a driven pass for an adopted one.",
  );
  assert.deepEqual(env.next, ["storytree tree"]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a signed FAIL is not adopted — a red is fixed, never painted over", async () => {
  const { deps, rec } = makeDeps(
    { ownStatus: async () => "unhealthy" },
    { ...CAP, story: undefined },
  );
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'capability "hydrated-store-dialing-root" holds a signed FAIL — a red is not adopted, it is fixed.\n' +
      "Adoption records that work already serving is accepted as-is; it can never paint over an\n" +
      "observed regression (ADR-0465 D2 rests on a passing command, and this one is not passing).",
  );
  assert.deepEqual(env.next, ["storytree tree"]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

const NO_COMMAND_BODY =
  'capability "hydrated-store-dialing-root" declares no proof command — there is nothing for the spine to observe.\n' +
  "Adoption is observe-and-sign, not a flip: author a `proof:` block in stories/library/hydrated-store-dialing-root.md naming the\n" +
  "command that already exercises this capability, then adopt it. If NO command exercises it, that\n" +
  "is the finding — the capability is either unbuilt (prove it strictly) or not capability-shaped\n" +
  "(route it to story-author), and neither is adopted.";

test("THE CLASS C WALL: a capability declaring no proof command refuses for free and names all three honest outcomes", async () => {
  // The refusal must name the two OTHER honest outcomes, so a reader does not conclude that
  // authoring a command is always the right answer (ADR-0465 D1's three piles) — pinned whole,
  // because a fragment match would let either of the other two rot out of the message.
  const { deps, rec } = makeDeps({}, { ...CAP, proofCommand: undefined });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_COMMAND_BODY);
  assert.deepEqual(env.next, [
    "storytree library artifact hydrated-store-dialing-root",
    "storytree adopt capability hydrated-store-dialing-root --pg",
  ]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a WHITESPACE-ONLY proof command is no command — it is trimmed before the emptiness test, so a blank `proof:` block hits the Class C wall instead of being spawned", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, proofCommand: "   " });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_COMMAND_BODY);
  assert.equal(rec.observed.length, 0);
});

const NO_SOURCES_BODY =
  'capability "hydrated-store-dialing-root" declares no source paths, so its service history cannot be checked.\n' +
  "Adoption is fenced on the capability's code PRE-DATING this branch (ADR-0465 — a capability\n" +
  "adopted in the same landing that authored it is self-attestation). Declare the source this\n" +
  "capability owns in stories/library/hydrated-store-dialing-root.md, then adopt it.";

test("a capability declaring no source paths refuses — its service history cannot be fenced", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, sourcePaths: [] });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_SOURCES_BODY);
  assert.deepEqual(env.next, ["storytree library artifact hydrated-store-dialing-root"]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("a BLANK source path declares nothing — a whitespace entry is dropped before the fence, so it cannot pass as a declaration", async () => {
  // Otherwise a spec carrying `sourceGlobs: [" "]` would clear the fence while matching no file,
  // which is the unfenced adoption this wall exists to refuse.
  let asked = 0;
  const { deps, rec } = makeDeps(
    {
      branchAuthoredPaths: () => {
        asked += 1;
        return [];
      },
    },
    { ...CAP, sourcePaths: ["   ", "\t"] },
  );
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(env.body, NO_SOURCES_BODY);
  assert.equal(asked, 0, "it refuses before it even asks git what this branch authored");
  assert.equal(rec.observed.length, 0);
});

test("THE FENCE FAILS CLOSED: an unreadable base refuses rather than adopting unfenced", async () => {
  const { deps, rec } = makeDeps({ branchAuthoredPaths: () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "could not read what this branch authored against origin/main, so the service-history fence\n" +
      "cannot be applied — and it fails CLOSED, because a fence that fails open is not a fence.\n" +
      "Fetch the base and retry: git fetch origin main",
  );
  assert.deepEqual(env.next, [
    "git fetch origin main",
    "storytree adopt capability hydrated-store-dialing-root --pg",
  ]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("THE SELF-ATTESTATION FENCE: a branch that authored the capability's own source cannot adopt it, and every offending path is named", async () => {
  const { deps, rec } = makeDeps(
    {
      branchAuthoredPaths: () => [
        "packages/library/src/store/pg-store.ts",
        "packages/cli/src/unrelated.ts",
        "packages/library/src/store/connection.ts",
      ],
    },
    { ...CAP, sourcePaths: ["packages/library/src/store/*.ts"] },
  );
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'THIS BRANCH authored the source of "hydrated-store-dialing-root", so it cannot be adopted here (ADR-0465).\n' +
      "  packages/library/src/store/connection.ts\n" +
      "  packages/library/src/store/pg-store.ts\n" +
      "Adoption records that work ALREADY built and ALREADY serving is accepted on the owner's risk\n" +
      "acceptance. A capability adopted in the same landing that authored it is self-attestation\n" +
      "wearing the brownfield's clothes — freshly written work earns a driven red→green instead.",
  );
  // It sends the caller at the honest alternative: drive a real proof.
  assert.deepEqual(env.next, [
    "storytree node build hydrated-store-dialing-root --real --store pg",
  ]);
  assert.equal(rec.observed.length, 0);
  assert.equal(rec.appended.length, 0);
});

test("the fence matches through a declared GLOB, not only an exact path", async () => {
  const { deps } = makeDeps(
    { branchAuthoredPaths: () => ["packages/library/src/store/pg-store.ts"] },
    { ...CAP, sourcePaths: ["packages/library/src/store/*.ts"] },
  );
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'THIS BRANCH authored the source of "hydrated-store-dialing-root", so it cannot be adopted here (ADR-0465).\n' +
      "  packages/library/src/store/pg-store.ts\n" +
      "Adoption records that work ALREADY built and ALREADY serving is accepted on the owner's risk\n" +
      "acceptance. A capability adopted in the same landing that authored it is self-attestation\n" +
      "wearing the brownfield's clothes — freshly written work earns a driven red→green instead.",
  );
});

test("a blank approver refuses BEFORE the suite runs — adoption must be attributable to a person, and the chain's own reason is carried through", async () => {
  const { deps, rec } = makeDeps({
    resolveApprover: () => ({ ok: false, error: "no signer resolved" }),
  });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "no signer resolved\n" +
      "Adoption accepts RISK on work this system did not drive, so it must be attributable to a real\n" +
      "person: --signer <email> (or set git user.email / STORYTREE_SIGNER).",
  );
  assert.deepEqual(env.next, [
    "storytree adopt capability hydrated-store-dialing-root --signer <email> --pg",
  ]);
  assert.equal(rec.observed.length, 0, "the approver wall must precede any spend");
  assert.equal(rec.appended.length, 0);
});

test("the --signer flag reaches the approver chain", async () => {
  let seen: string | undefined = "UNSET";
  const { deps } = makeDeps({
    resolveApprover: (flag) => {
      seen = flag;
      return { ok: false, error: "no signer resolved" };
    },
  });
  await runAdoptCapability(CAP.id, { signer: "owner@example.com" }, deps);
  assert.equal(seen, "owner@example.com");
});

test("refuses offline — a verdict that evaporates greens nothing", async () => {
  const { deps, rec } = makeDeps({ store: null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "adopt capability signs an `adopted` verdict to the live store (events.verdict) — run with the DB up.",
  );
  assert.deepEqual(env.next, [
    "pnpm db:up",
    "storytree adopt capability hydrated-store-dialing-root --pg",
  ]);
  assert.equal(rec.observed.length, 0);
});

test("refuses when git cannot be read at all", async () => {
  const { deps, rec } = makeDeps({ gitState: () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "could not read git state (HEAD / clean tree) — an adopted verdict pins a real commit. Run inside the repo.",
  );
  // Nothing to offer: there is no command that repairs "this is not a repo".
  assert.deepEqual(env.next, []);
  assert.equal(rec.observed.length, 0);
});

test("refuses a DIRTY tree — an adopted verdict pins the commit it observed, named by its short sha", async () => {
  const { deps, rec } = makeDeps({
    gitState: () => ({ commitSha: "abc1234def5678", clean: false }),
  });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    "adopt from a clean committed HEAD — the tree at abc1234 has uncommitted edits,\n" +
      "and an adopted verdict pins the commit it observed.",
  );
  assert.deepEqual(env.next, [
    "git status",
    "storytree adopt capability hydrated-store-dialing-root --pg",
  ]);
  assert.equal(rec.observed.length, 0);
});

test("a RED command signs nothing — the bar does not move when the suite does not pass", async () => {
  const { deps, rec } = makeDeps({ observe: async () => ({ code: 1 }) });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, false);
  assert.equal(
    env.body,
    'capability "hydrated-store-dialing-root" was NOT adopted — observe gate "hydrated-store-dialing-root" did NOT pass: `pnpm --filter @storytree/library test` exit 1 — an adopted green requires the declared command observed GREEN. No verdict signed.\n' +
      "No verdict was signed. Adoption rests on the declared command being observed GREEN at a clean\n" +
      "HEAD; where it is not, the honest answer is that this capability is not in the adoptable\n" +
      "population, not that the bar should move.",
  );
  // The two follow-ups are the declared command itself (run it and see) and the retry.
  assert.deepEqual(env.next, [
    "pnpm --filter @storytree/library test",
    "storytree adopt capability hydrated-store-dialing-root --pg",
  ]);
  assert.equal(rec.appended.length, 0, "no verdict row on a red");
});

// ---------------------------------------------------------------------------
// The happy path — what the signed row actually claims
// ---------------------------------------------------------------------------

/** The success render, minus the `story:` line a spec without an owning story omits. */
function successBody(storyLine: readonly string[]): string {
  return [
    'Adopted "hydrated-store-dialing-root" — an `adopted` verdict is signed and persisted.',
    "  title:      The hydrated store dialing root",
    ...storyLine,
    "  observed:   `pnpm --filter @storytree/library test` exited 0",
    `  signer:     ${SPINE_PRINCIPAL} (the machine that witnessed the green)`,
    "  approvedBy: owner@example.com (who ACCEPTED THE RISK — not the signer, ADR-0465 D2)",
    "  commit:     abc1234",
    "",
    "What this verdict claims, stated exactly: the declared command was observed green at a clean",
    "committed HEAD, and the owner accepts that a passing suite plus a complaint-free service history",
    "is sufficient basis. It is NOT a driven red→green, and no surface may render it as one — the two",
    "differ in KIND, not in rank (ADR-0465 D7): a driven pass is a forward-looking fence over one",
    "behaviour its author thought to check, while time in service is evidence over every path real use",
    "actually took. What service history cannot speak to is the path nobody took.",
    "",
    "Green until notified otherwise (ADR-0465 D5): if this shows up wrong, it is withdrawn by a",
    "recorded act naming who reported the fault — the adoption stays visible in history, never erased.",
  ].join("\n");
}

test("adopts: observes the declared command, signs ONE `adopted` verdict whose unitId is the CAPABILITY, spine-signed and owner-approved", async () => {
  const { deps, rec } = makeDeps();
  const env = await runAdoptCapability(CAP.id, { signer: "owner@example.com" }, deps);

  assert.equal(env.ok, true);
  assert.deepEqual(rec.observed, ["pnpm --filter @storytree/library test"]);
  assert.equal(rec.appended.length, 1);

  const row = rec.appended[0];
  assert.ok(row !== undefined);
  const verdict = row.doc as {
    unitId: string;
    proofMode: string;
    outcome: string;
    signer: string;
    approvedBy?: string;
    commitSha: string;
    criterionId?: string;
    runId: string;
    at: string;
  };
  // The verdict binds to the CAPABILITY, so `rollupStatus` folds it exactly like any other own
  // verdict — the plant greens through a signed row, never through authored paint.
  assert.equal(verdict.unitId, "hydrated-store-dialing-root");
  assert.equal(verdict.proofMode, "adopted");
  assert.equal(verdict.outcome, "pass");
  assert.equal(verdict.commitSha, "abc1234def5678");
  // The MACHINE signs (it watched the exit code); the OWNER is recorded as the party accepting the
  // risk. Neither is the other, and no model appears anywhere.
  assert.equal(verdict.signer, SPINE_PRINCIPAL);
  assert.equal(verdict.approvedBy, "owner@example.com");
  assert.equal(row.actor, SPINE_PRINCIPAL);
  // No criterion binding — this is the brownfield class, not a machine UAT leg.
  assert.equal(verdict.criterionId, undefined);
  // The run is stamped from the INJECTED clock, so the row is addressable and the signing instant is
  // the one this call observed — not whatever `new Date()` happened to say inside the signer.
  assert.equal(verdict.runId, "adopt-capability:2026-08-28T00:00:00.000Z");
  assert.equal(verdict.at, "2026-08-28T00:00:00.000Z");
  assert.equal(row.id, "adopt-capability:2026-08-28T00:00:00.000Z:hydrated-store-dialing-root");
});

test("the render states the basis rather than claiming a driven pass, and never ranks the two", async () => {
  const { deps } = makeDeps();
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, true);
  // Pinned WHOLE: this paragraph is the only place the verdict says what it does and does not claim
  // (ADR-0465 D5/D7), so a fragment match would let the rest of it rot away unnoticed.
  assert.equal(env.body, successBody(["  story:      library"]));
  assert.deepEqual(env.next, [
    "storytree tree library",
    "storytree library artifact hydrated-store-dialing-root",
  ]);
});

test("a capability with no owning story adopts too, and the render simply omits the story line rather than printing a blank one", async () => {
  const { deps, rec } = makeDeps({}, { ...CAP, story: undefined });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, true);
  assert.equal(env.body, successBody([]));
  assert.deepEqual(env.next, [
    "storytree tree",
    "storytree library artifact hydrated-store-dialing-root",
  ]);
  assert.equal(rec.appended.length, 1);
});

test("a capability whose own status is null but which is covered elsewhere still adopts — coverage is not a refusal", async () => {
  // ADR-0465's population is the caps holding NEITHER an own verdict NOR a covering gate, but the
  // wall here is deliberately keyed to the cap's OWN status: a covering gate is someone else's
  // verdict, and refusing on it would make this entry depend on a fold it does not own.
  const { deps, rec } = makeDeps({ ownStatus: async () => null });
  const env = await runAdoptCapability(CAP.id, {}, deps);
  assert.equal(env.ok, true);
  assert.equal(rec.appended.length, 1);
});
