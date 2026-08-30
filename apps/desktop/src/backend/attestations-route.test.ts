// Unit test for attestations-route.ts — the desktop's re-composition of the studio's
// GET /api/attestations join, extracted out of `electron/backend-entry.ts` so a probe (and this
// suite) can reach it at all.
//
// WHAT IT PINS, and why it is here as well as in the mirror row. The `/api/attestations` row in
// `packages/cli/src/mirror-conformance.ts` proves the two SURFACES agree; it is a gate step, so
// without this file a `pnpm --filter desktop test` would stay green through a re-introduction of any
// of the three divergences that row's first run measured. The two are complementary — this says what
// THIS surface must serve, the row says the two must match — and the `/api/comments` landing set the
// precedent of carrying both.
//
// The three, all measured 2026-08-31 (`unscored-guards-arc` / `register-deep-mirror-pairs`) by
// standing each surface's own composition up in its own process and diffing the composed RESULTS:
//   1. an id that ESCAPES the stories root was RESOLVED here and refused there;
//   2. a CAPABILITY id fell back to `<story>/<capId>.md` here and resolved to nothing there;
//   3. `detailArtifactId` (ADR-0209 D7) was attached there and by nothing here.
//
// THE ENVELOPE IS PINNED FIELD BY FIELD TOO, and that is not padding. Almost everything this mount
// composes for itself is a PRESENCE decision — `storyUat`, `unresolvedWitnesses`, `proven` and
// `detailArtifactId` are all OMITTED rather than nulled when they have nothing to say, because
// absence is what the renderer keys on. A test that only checked the happy row would leave every one
// of those decisions unobserved, which is what `check:mutation-diff` reported the first time round.
//
// INTEGRATION TIER: drives the REAL mount over a REAL temp `stories/` tree and the REAL orchestrator
// compute. No DB — both event streams are injected, which is the seam the extraction created.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import { canonicalUatCriterionContent } from "@storytree/library";
import { Verdict, criterionRevisionId } from "@storytree/proof-protocol";

import {
  createAttestationsMount,
  loadStorySpec,
  type VerdictEventRow,
} from "./attestations-route.js";

const INSIDE = `uatc_${"1".repeat(24)}`;
const CAP = `uatc_${"2".repeat(24)}`;
const OUTSIDE = `uatc_${"3".repeat(24)}`;
const MAPPED = `uatc_${"4".repeat(24)}`;
const RETIRED = `uatc_${"5".repeat(24)}`;

const LEG_INSIDE = "**The story's own leg** — served, with its detail pointer.";
const LEG_CAP = "**A capability's own leg** — never served by this route.";
const LEG_OUTSIDE = "**A leg outside the root** — reaching it at all is the defect.";
const LEG_MAPPED = "**A pre-adopt leg** — undecided witnesses are allowed here.";
const LEG_RETIRED = "**A withdrawn leg** — the story is over, so nothing is owed.";

const AT = "2026-08-31T09:30:00.000Z";

/** One authored criterion line whose `(revision-id:)` binds the WHOLE item, detail tag included. */
function criterion(ordinal: number, criterionId: string, prose: string, detail?: string): string {
  return `${item(ordinal, prose, detail)} (criterion-id: ${criterionId})(revision-id: ${revisionOf(ordinal, prose, detail)})`;
}
function item(ordinal: number, prose: string, detail?: string): string {
  return `${ordinal}. ${prose}${detail === undefined ? "" : ` _(detail: ${detail})_`}`;
}
/** The item's content binding — computed, never typed: a hash that does not bind is a spec-load error. */
function revisionOf(ordinal: number, prose: string, detail?: string): string {
  return criterionRevisionId(canonicalUatCriterionContent(item(ordinal, prose, detail)));
}

function storyBody(id: string, status: string, uatLines: string[]): string {
  return [
    "---",
    `id: "${id}"`,
    "tier: story",
    `title: "${id}"`,
    `outcome: "the ${id} outcome"`,
    `status: ${status}`,
    "proof_mode: UAT",
    "---",
    "",
    `# ${id}`,
    "",
    "## UAT Test Criteria",
    "",
    ...uatLines,
  ].join("\n");
}

/** A signed criterion verdict — the PROVEN column, deliberately distinct from a vouch (ADR-0044). */
function signed(
  seq: number,
  criterionId: string,
  revisionId: string,
  outcome: "pass" | "fail",
): VerdictEventRow {
  return {
    kind: "signing",
    seq,
    doc: Verdict.parse({
      unitId: criterionId,
      criterionId,
      revisionId,
      proofMode: "story",
      outcome,
      commitSha: "da".repeat(20),
      signer: "ci@example.com",
      runId: `run-${seq}`,
      at: AT,
    }),
  };
}

/**
 * A temp repo root holding `stories/inside` (with a capability spec beside it), a still-`mapped`
 * story, a MALFORMED story, and a story ONE LEVEL ABOVE the stories root.
 *
 * The outside story is real and PARSES on purpose — a decoy that did not exist would make the
 * containment assertion pass whether the guard held or not.
 */
async function seed(): Promise<{ root: string; storiesDir: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "attestations-route-"));
  const storiesDir = path.join(root, "stories");
  await fs.mkdir(path.join(storiesDir, "inside"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "inside", "story.md"),
    storyBody("inside", "proposed", [criterion(1, INSIDE, LEG_INSIDE, "inside#detail-1")]),
    "utf8",
  );
  await fs.writeFile(
    path.join(storiesDir, "inside", "cap-a.md"),
    [
      "---",
      'id: "cap-a"',
      "tier: capability",
      'title: "Capability A"',
      'outcome: "the cap-a outcome"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# Capability A",
      "",
      "## UAT Test Criteria",
      "",
      criterion(1, CAP, LEG_CAP),
    ].join("\n"),
    "utf8",
  );
  // A story still at `mapped` — PRE-adopt, where an undecided (`either`) witness is allowed, so the
  // "no `either` at rest" guard must NOT fire and `unresolvedWitnesses` must be omitted.
  await fs.mkdir(path.join(storiesDir, "premapped"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "premapped", "story.md"),
    storyBody("premapped", "mapped", [criterion(1, MAPPED, LEG_MAPPED)]),
    "utf8",
  );
  // A WITHDRAWN story (ADR-0038). The guard exempts it for a different reason from `mapped` — that
  // one is pre-adopt, this one is over — and the two exemptions are separate clauses of the same
  // predicate, so exercising only one leaves the other unobserved.
  await fs.mkdir(path.join(storiesDir, "withdrawn"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "withdrawn", "story.md"),
    storyBody("withdrawn", "retired", [criterion(1, RETIRED, LEG_RETIRED)]),
    "utf8",
  );
  // A frontmatter block the spec loader cannot read — the catch branch, which must answer like a
  // missing story rather than throwing the request away.
  await fs.mkdir(path.join(storiesDir, "broken"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "broken", "story.md"),
    ["---", "id: [unclosed", "tier: story", "---", "", "# Broken"].join("\n"),
    "utf8",
  );
  await fs.mkdir(path.join(root, "escaped"), { recursive: true });
  await fs.writeFile(
    path.join(root, "escaped", "story.md"),
    storyBody("escaped", "proposed", [criterion(1, OUTSIDE, LEG_OUTSIDE)]),
    "utf8",
  );
  return {
    root,
    storiesDir,
    cleanup: async () => {
      await fs.rm(root, { recursive: true, force: true });
    },
  };
}

interface Answer {
  claimed: boolean;
  status: number;
  headers: Record<string, unknown>;
  raw: string;
  body: {
    storyId?: string;
    tests?: Record<string, unknown>[];
    storyUat?: unknown;
    unresolvedWitnesses?: unknown;
  };
}

/** Drive the mount for one request and return everything it decided. */
async function ask(
  storiesDir: string,
  target: string | undefined,
  opts: {
    /** Left UNSET when omitted with `noMethod`, so the mount's own GET default is what answers. */
    method?: string;
    noMethod?: boolean;
    pathname?: string;
    attestationEvents?: { seq: number; doc: unknown }[];
    verdictEvents?: VerdictEventRow[] | null;
    attestationsThrow?: boolean;
  } = {},
): Promise<Answer> {
  const mount = createAttestationsMount({
    storiesDir,
    readAttestationEvents: async () => {
      if (opts.attestationsThrow === true) throw new Error("the attestation store is down");
      return opts.attestationEvents ?? [];
    },
    readVerdictEvents: async () => opts.verdictEvents ?? null,
  });
  const req = new IncomingMessage(new Socket());
  // A fresh IncomingMessage carries `method: null` until the HTTP parser fills it, which is exactly
  // the state the mount's own `?? "GET"` default exists for.
  if (opts.noMethod !== true) req.method = opts.method ?? "GET";
  // Left UNSET when the caller passes `undefined`, which is the `req.url ?? "/"` fallback branch.
  if (target !== undefined) req.url = target;
  let raw = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];
  const claimed = await mount(req, res, opts.pathname ?? "/api/attestations");
  return {
    claimed,
    status: res.statusCode,
    headers: res.getHeaders(),
    raw,
    body: raw === "" ? {} : (JSON.parse(raw) as Answer["body"]),
  };
}

// ---------------------------------------------------------------------------
// The dispatch envelope
// ---------------------------------------------------------------------------

test("attestations-route: a pathname this mount does not own is DECLINED, not answered", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    // The caller's route table keeps dispatching on `false`. A mount that claimed everything would
    // swallow every later route on this backend and answer them all as attestations.
    const other = await ask(storiesDir, "/api/tree", { pathname: "/api/tree" });
    assert.equal(other.claimed, false, "a foreign pathname is declined");
    assert.equal(other.raw, "", "and nothing at all is written to the response");

    const own = await ask(storiesDir, "/api/attestations?storyId=inside");
    assert.equal(own.claimed, true, "its own pathname is claimed");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a method other than GET is a 405 naming the method, with a JSON body", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const refused = await ask(storiesDir, "/api/attestations?storyId=inside", { method: "DELETE" });
    assert.equal(refused.claimed, true, "the mount owns the refusal rather than passing it on");
    assert.equal(refused.status, 405);
    assert.equal(refused.headers["content-type"], "application/json; charset=utf-8");
    // The method is NAMED. A generic refusal reads as "this route is broken" rather than "this route
    // is read-only", and read-only here is a decision (the write half has no desktop mirror at all).
    assert.deepEqual(JSON.parse(refused.raw), { error: "method DELETE not allowed" });

    const posted = await ask(storiesDir, "/api/attestations?storyId=inside", { method: "POST" });
    assert.deepEqual(JSON.parse(posted.raw), { error: "method POST not allowed" });

    // A request whose method has not been set at all defaults to GET and is SERVED, not refused.
    // Without this the default is unobserved, and a mount that defaulted to anything else would
    // answer 405 for a request the real server sends as an ordinary read.
    const unstated = await ask(storiesDir, "/api/attestations?storyId=inside", { noMethod: true });
    assert.equal(unstated.status, 200, "an unstated method reads as GET");
    assert.equal(unstated.body.tests?.length, 1, "and the legs are served");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a missing, blank or whitespace-only storyId is a 400 that says so", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    for (const target of [
      "/api/attestations",
      "/api/attestations?storyId=",
      "/api/attestations?storyId=%20%20",
    ]) {
      const refused = await ask(storiesDir, target);
      assert.equal(refused.status, 400, `${target} is refused`);
      assert.equal(refused.headers["content-type"], "application/json; charset=utf-8");
      assert.deepEqual(JSON.parse(refused.raw), { error: "storyId query param is required" });
      // The refusal is CLAIMED. Answering 400 and then reporting the pathname unhandled would let
      // the caller's route table run on and write a second response onto the same socket.
      assert.equal(refused.claimed, true, `${target} is claimed, not passed on`);
    }
    // No `req.url` at all — the fallback the URL parse carries. It must land on the SAME refusal,
    // never on a throw that the caller would surface as a 500.
    const noUrl = await ask(storiesDir, undefined);
    assert.equal(noUrl.status, 400);
    assert.deepEqual(JSON.parse(noUrl.raw), { error: "storyId query param is required" });
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// Which file a storyId resolves to
// ---------------------------------------------------------------------------

test("attestations-route: an id that ESCAPES the stories root reads exactly like a missing story", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const escaping = await ask(storiesDir, "/api/attestations?storyId=..%2Fescaped");
    const missing = await ask(storiesDir, "/api/attestations?storyId=no-such-story");
    // NOT merely "serves no legs": the refusal must be INDISTINGUISHABLE from an absence. A refusal
    // that answered differently — a 404, an error body, a different key set — is itself the
    // filesystem existence oracle the guard exists to prevent.
    assert.equal(escaping.status, missing.status, "same status as an absent story");
    assert.equal(escaping.status, 200, "and it is an empty 200, never a 404");
    assert.deepEqual(
      { ...escaping.body, storyId: "" },
      { ...missing.body, storyId: "" },
      "same body as an absent story, apart from the id echoed back",
    );
    assert.deepEqual(escaping.body.tests, [], "no leg from outside the root reaches the wire");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a CAPABILITY id resolves to nothing — this route's vocabulary is stories", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    // `findNodeSpecFile` (what this mount used before the mirror row measured it) falls back to
    // `<story>/<unitId>.md`, so this served the capability's own criteria. The studio looks only for
    // `<storyId>/story.md` and answers with none.
    const answer = await ask(storiesDir, "/api/attestations?storyId=cap-a");
    assert.equal(answer.status, 200, "an unknown story is an empty 200, never a 404");
    assert.deepEqual(answer.body.tests, [], "a capability's legs are not this route's answer");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a story whose spec will not parse answers empty rather than throwing", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const broken = await ask(storiesDir, "/api/attestations?storyId=broken");
    assert.equal(broken.status, 200, "an unreadable spec must not become a 500");
    assert.deepEqual(broken.body.tests, []);
    assert.equal(broken.body.storyId, "broken", "the id is still echoed back");
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// The row assembly and the four presence decisions
// ---------------------------------------------------------------------------

test("attestations-route: a leg's `(detail: …)` pointer rides the wire, and only when it has one", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await ask(storiesDir, "/api/attestations?storyId=inside");
    const row = answer.body.tests?.[0];
    assert.ok(row, "the story's one leg is served");
    assert.equal(row["criterionId"], INSIDE);
    // ADR-0209 D7: the studio attached these and this surface attached none, so the SHARED
    // `UatTestCriteriaSection` rendered every desktop leg with no link to the artifact behind it.
    assert.equal(row["detailArtifactId"], "inside#detail-1", "the declared pointer reaches the wire");

    // And a leg WITHOUT a tag must carry no key at all — an explicit `undefined` would read as a
    // pointer that failed to resolve rather than one that was never declared.
    await fs.writeFile(
      path.join(storiesDir, "inside", "story.md"),
      storyBody("inside", "proposed", [criterion(1, INSIDE, LEG_INSIDE)]),
      "utf8",
    );
    const untagged = await ask(storiesDir, "/api/attestations?storyId=inside");
    const plain = untagged.body.tests?.[0];
    assert.ok(plain, "the leg is still served");
    assert.ok(!("detailArtifactId" in plain), "no key at all for a leg that declares no pointer");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a vouch MARK joins its own leg and no other, and is absent when unrecorded", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const bare = await ask(storiesDir, "/api/attestations?storyId=inside");
    const unmarked = bare.body.tests?.[0];
    assert.ok(unmarked);
    assert.ok(!("human" in unmarked), "no marks recorded means no `human` key, not an empty one");
    assert.ok(!("machine" in unmarked), "and no `machine` key either");

    const marked = await ask(storiesDir, "/api/attestations?storyId=inside", {
      attestationEvents: [
        {
          seq: 1,
          doc: {
            testId: INSIDE,
            criterionId: INSIDE,
            revisionId: revisionOf(1, LEG_INSIDE, "inside#detail-1"),
            outcome: "pass",
            witness: "human",
            signer: "operator@example.com",
            at: AT,
          },
        },
        // A mark for a leg on ANOTHER story — the join must leave it off `inside`'s row.
        {
          seq: 2,
          doc: {
            testId: OUTSIDE,
            criterionId: OUTSIDE,
            revisionId: revisionOf(1, LEG_OUTSIDE),
            outcome: "pass",
            witness: "human",
            signer: "operator@example.com",
            at: AT,
          },
        },
      ],
    });
    const row = marked.body.tests?.[0];
    assert.ok(row);
    assert.equal((row["human"] as { signer: string }).signer, "operator@example.com");
    assert.equal(marked.body.tests?.length, 1, "the other story's mark adds no row");
  } finally {
    await cleanup();
  }
});

test("attestations-route: an unreadable vouch log serves the legs unmarked rather than blanking the panel", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    // The ADR-0033 advisory posture on the seam the extraction introduced — its rejection path is
    // the one nothing exercised before.
    const served = await ask(storiesDir, "/api/attestations?storyId=inside", {
      attestationsThrow: true,
    });
    assert.equal(served.status, 200, "a down vouch store still serves the legs");
    assert.equal(served.body.tests?.length, 1);
    assert.ok(!("human" in served.body.tests![0]!), "with no marks, rather than a fabricated one");
  } finally {
    await cleanup();
  }
});

test("attestations-route: `proven` and `storyUat` ride the wire ONLY when a verdict stream answered", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const revision = revisionOf(1, LEG_INSIDE, "inside#detail-1");

    // No stream at all (the json backend / a down DB): both proof-derived fields are ABSENT, not
    // negative. The renderer keys on absence, so a `null` here would read as "measured, nothing
    // proven" where the truth is "not measured".
    const silent = await ask(storiesDir, "/api/attestations?storyId=inside");
    assert.ok(!("storyUat" in silent.body), "no stream means no `storyUat` key");
    assert.ok(!("proven" in silent.body.tests![0]!), "and no `proven` on the row");

    // A stream that answered, with the leg PROVEN.
    const passed = await ask(storiesDir, "/api/attestations?storyId=inside", {
      verdictEvents: [signed(1, INSIDE, revision, "pass")],
    });
    assert.equal(passed.body.tests?.[0]?.["proven"], "pass");
    assert.equal(passed.body.storyUat, "healthy", "one proven leg greens the story rollup");

    // Proven and then REGRESSED — a signed fail demotes, and the demotion must reach both fields.
    const failed = await ask(storiesDir, "/api/attestations?storyId=inside", {
      verdictEvents: [signed(1, INSIDE, revision, "pass"), signed(2, INSIDE, revision, "fail")],
    });
    assert.equal(failed.body.tests?.[0]?.["proven"], "fail");
    assert.equal(failed.body.storyUat, "unhealthy");

    // A stream that answered and says NOTHING about this story: `storyUat` is present and null —
    // "I looked and there is no proof" — while `proven` stays absent on the row.
    const unproven = await ask(storiesDir, "/api/attestations?storyId=inside", {
      verdictEvents: [],
    });
    assert.ok("storyUat" in unproven.body, "a stream that answered always sets the key");
    assert.equal(unproven.body.storyUat, null, "and null is a different fact from absent");
    assert.ok(!("proven" in unproven.body.tests![0]!), "an unproven leg carries no `proven` key");
  } finally {
    await cleanup();
  }
});

test("attestations-route: `unresolvedWitnesses` fires on an ADOPTED story and stays off a mapped one", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    // ADR-0106's "no `either` at rest" guard. Both legs here are authored with the DEFAULT witness,
    // which is `either` — so the only thing separating these two answers is the story's status.
    const adopted = await ask(storiesDir, "/api/attestations?storyId=inside");
    assert.deepEqual(
      adopted.body.unresolvedWitnesses,
      [INSIDE],
      "a story past `mapped` must not still hold an undecided witness",
    );

    const preAdopt = await ask(storiesDir, "/api/attestations?storyId=premapped");
    assert.ok(
      !("unresolvedWitnesses" in preAdopt.body),
      "a still-`mapped` story may hold undecided legs — adopt is what prompts the decision, so the key is omitted entirely",
    );
    assert.equal(preAdopt.body.tests?.length, 1, "its leg is served all the same");

    // The predicate's THIRD clause, and a different reason from `mapped`: a withdrawn story is not
    // pre-adopt, it is over. Both exemptions must hold, and a fixture carrying only one of them
    // leaves the other clause free to be anything.
    const withdrawn = await ask(storiesDir, "/api/attestations?storyId=withdrawn");
    assert.ok(
      !("unresolvedWitnesses" in withdrawn.body),
      "a `retired` story is owed nothing — the guard must not fire on it either",
    );
    assert.equal(withdrawn.body.tests?.length, 1, "and its leg is still readable");
  } finally {
    await cleanup();
  }
});

test("attestations-route: the answer is JSON, and it echoes the id it was asked about", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await ask(storiesDir, "/api/attestations?storyId=inside");
    assert.equal(answer.headers["content-type"], "application/json; charset=utf-8");
    assert.equal(answer.body.storyId, "inside");
  } finally {
    await cleanup();
  }
});

// `loadStorySpec` is exported and asserted DIRECTLY, which is a deliberate choice rather than a
// reflex to test an internal. The route cannot distinguish its three refusals — a contained-but-
// missing file, an id that escaped, and a spec that would not parse all have to answer identically
// on the wire, which is the whole design (a refusal that reads differently from an absence is an
// existence oracle). That makes the function's OWN promise — `NodeSpec | null`, never `undefined` —
// unobservable from outside, and `check:mutation-diff` said so: emptying the catch survived every
// route-level assertion in this file. The signature is a real contract; this is where it is held.
test("attestations-route: loadStorySpec answers exactly `null` for every shape it refuses", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const { loadNodeSpec } = await import("@storytree/orchestrator");
    for (const [why, id] of [
      ["a story that is simply absent", "no-such-story"],
      ["an id that escapes the stories root", "../escaped"],
      ["an id that resolves to the root itself", "."],
      ["a spec the loader cannot parse", "broken"],
    ] as const) {
      const spec = loadStorySpec(storiesDir, id, loadNodeSpec);
      // `strictEqual` against null, NOT a falsy check: `undefined` would pass a falsy check and
      // reach every caller here as the same thing, which is exactly how the distinction went
      // unobserved. The signature promises null.
      assert.strictEqual(spec, null, `${why} answers null`);
    }
    // And the positive control, so the four refusals above are not all that this can ever return.
    assert.ok(loadStorySpec(storiesDir, "inside", loadNodeSpec), "a real story still loads");
  } finally {
    await cleanup();
  }
});
