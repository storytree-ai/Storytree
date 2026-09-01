// Unit test for uat-attest-route.ts — the desktop's `POST /api/uat/attest` mount, extracted out of
// `electron/backend-entry.ts` so a conformance probe (and this suite) can reach it at all.
//
// IT WAS PROVED BY NOTHING FOR AS LONG AS IT EXISTED, and that is the reason this file is here.
// The mount was an inline closure inside a function that boots a live pg pool, the Electron IPC
// bridge and the launch sequence, so no test could call it — on the highest-stakes WRITE in the
// system, the "I saw it work" signature that greens a story crown (ADR-0082). What it composes for
// itself is the whole of what a signed verdict rests on: which spec an id resolves to and whether
// that resolution is CONTAINED, which witness the shared trust guard is fed, and which of the five
// honesty walls a request meets.
//
// WHY IT IS HERE AS WELL AS IN THE MIRROR ROW, the `/api/attestations` and `/api/comments`
// precedent: the row in `packages/cli/src/mirror-conformance.ts` proves the two SURFACES agree and
// is a gate step, so without this file a `pnpm --filter desktop test` would stay green through a
// regression in either. The two are complementary — this says what THIS surface must do, the row
// says the two must match — and neither covers the other. Two walls are THIS SURFACE'S ALONE and
// have no mirror at all, so this file is the only thing that can prove them: the CLEAN-tree refusal
// and the broker-authoritative persistence contract (the row records both as `fenced-elsewhere`
// clauses pointing at `local-uat-attest.test.ts`, which owns them at the compute layer; what is
// proved HERE is that the mount actually wires them).
//
// INTEGRATION TIER: drives the REAL mount over a REAL temp `stories/` tree and the REAL orchestrator
// compute. No DB and no broker — the identity, the git state, the sign clock and the writer are the
// injected seams the extraction created, which is the same isolation ADR-0495 D3 chose for the
// conformance probe and for the same reason: `events.verdict` is append-only in the shared live
// store, so a suite that exercised the real write would append verdicts nobody signed.

import { test } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";
import os from "node:os";
import path from "node:path";

import { canonicalUatCriterionContent } from "@storytree/library";
import { Verdict, criterionRevisionId } from "@storytree/proof-protocol";

import { createUatAttestMount, type UatAttestRouteDeps } from "./uat-attest-route.js";
import type { ForestWrite, ForestWriteResult } from "./forest-readiness.js";

const HUMAN = `uatc_${"1".repeat(24)}`;
const MACHINE = `uatc_${"2".repeat(24)}`;
const OUTSIDE = `uatc_${"3".repeat(24)}`;

const LEG_HUMAN = "**A person looks** — only an operator can say the map reads right.";
const LEG_MACHINE = "**A suite proves it** — and no click ever can.";
const LEG_OUTSIDE = "**A leg outside the root** — reaching it at all is the defect.";

const AT = "2026-09-01T10:00:00.000Z";
const COMMIT = "ab".repeat(20);
const OPERATOR = "operator@example.com";

/** One authored criterion line whose `(revision-id:)` binds the WHOLE item, content tags included. */
function criterion(ordinal: number, criterionId: string, prose: string, tags = ""): string {
  const text = `${ordinal}. ${prose}${tags}`;
  return `${text} (criterion-id: ${criterionId})(revision-id: ${criterionRevisionId(canonicalUatCriterionContent(text))})`;
}

function storyBody(id: string, uatLines: string[], gates: string[] = []): string {
  return [
    "---",
    `id: "${id}"`,
    "tier: story",
    `title: "${id}"`,
    `outcome: "the ${id} outcome"`,
    "status: proposed",
    "proof_mode: UAT",
    "---",
    "",
    `# ${id}`,
    "",
    "## UAT Test Criteria",
    "",
    ...uatLines,
    ...(gates.length === 0 ? [] : ["", "## Reliability Gates", "", ...gates]),
  ].join("\n");
}

/**
 * A temp root holding `stories/inside` and a story ONE LEVEL ABOVE the stories root.
 *
 * The outside story is real, PARSES, and carries a real leg on purpose: against an empty decoy, a
 * containment hole and a missing story both compose nothing and the assertion would pass whether
 * the guard held or not.
 */
async function seed(): Promise<{ storiesDir: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "uat-attest-route-"));
  const storiesDir = path.join(root, "stories");
  await fs.mkdir(path.join(storiesDir, "inside"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "inside", "story.md"),
    storyBody(
      "inside",
      [
        criterion(1, HUMAN, LEG_HUMAN, " _(witness: human)_ _(witness-basis: a person must look)_"),
        criterion(2, MACHINE, LEG_MACHINE, " _(witness: machine)_ _(proof-gate: inside#gate-1)_"),
      ],
      ["1. **The suite is green** _(gate: observe)_ `pnpm test`."],
    ),
    "utf8",
  );
  // A spec that LIVES at a story path but declares `tier: capability`. This route's whole
  // vocabulary is stories — a capability reached through it would sign a verdict against a unit
  // whose UAT legs it never declared.
  await fs.mkdir(path.join(storiesDir, "not-a-story"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "not-a-story", "story.md"),
    [
      "---",
      'id: "not-a-story"',
      "tier: capability",
      'title: "not-a-story"',
      'outcome: "the not-a-story outcome"',
      "status: proposed",
      "proof_mode: contract-test",
      "---",
      "",
      "# not-a-story",
    ].join("\n"),
    "utf8",
  );
  await fs.mkdir(path.join(root, "outside"), { recursive: true });
  await fs.writeFile(
    path.join(root, "outside", "story.md"),
    storyBody("outside", [criterion(1, OUTSIDE, LEG_OUTSIDE, " _(witness: human)_ _(witness-basis: reachable)_")]),
    "utf8",
  );
  return { storiesDir, cleanup: () => fs.rm(root, { recursive: true, force: true }) };
}

/** What one replayed request answered, plus the verdict the writer was actually handed. */
interface Answer {
  status: number;
  /** The declared content type. Asserted everywhere: a client that cannot parse the body cannot
   *  read the refusal either, and every branch here sets it separately. */
  contentType: string | number | string[] | undefined;
  body: { error?: string; verdict?: unknown };
  written: ForestWrite | null;
}

async function post(
  storiesDir: string,
  body: Record<string, unknown>,
  over: Partial<UatAttestRouteDeps> = {},
  writeResult: ForestWriteResult = { persisted: true, status: 201, body: null },
): Promise<Answer> {
  let written: ForestWrite | null = null;
  const mount = createUatAttestMount({
    storiesDir,
    resolveSigner: () => Promise.resolve(OPERATOR),
    gitState: () => ({ commitSha: COMMIT, clean: true }),
    agentIdentity: () => null,
    forestWriter: {
      write: (write) => {
        written = write;
        return Promise.resolve(writeResult);
      },
    },
    now: () => AT,
    ...over,
  });

  const req = new IncomingMessage(new Socket());
  // `__method: ""` means "send no method at all" — the shape a malformed client produces, and the
  // one the mount's `?? "GET"` fallback exists for.
  const declaredMethod = body["__method"] as string | undefined;
  if (declaredMethod !== "") req.method = declaredMethod ?? "POST";
  req.url = "/api/uat/attest";
  const { __method: _method, __raw: raw_, ...payload } = body;
  // `__raw` replays BYTES rather than a JSON value — the only way to reach the body reader's
  // refusal branches, which a `JSON.stringify` of any JS value can never produce.
  req.push(typeof raw_ === "string" ? raw_ : JSON.stringify(payload));
  req.push(null);

  // A REAL ServerResponse over an unconnected socket with only `end` captured — the idiom every
  // probe and route suite in this app uses, rather than a fake claiming to be a response.
  let raw = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];

  const claimed = await mount(req, res, "/api/uat/attest");
  assert.equal(claimed, true, "the mount must claim its own pathname");
  return {
    status: res.statusCode,
    contentType: res.getHeader("Content-Type"),
    body: raw === "" ? {} : JSON.parse(raw),
    written,
  };
}

/** Every answer this route gives is JSON, and says so — asserted on each branch that sets it. */
function assertJson(answer: Answer): void {
  assert.equal(answer.contentType, "application/json; charset=utf-8");
}

/**
 * The verdict the writer was handed, PARSED as a real proof-protocol document.
 *
 * Parsed rather than eyeballed on a field or two: a shape `events.verdict` would reject greens
 * nothing, so an assertion over an invalid document passes while the write fails for real. The
 * absent case fails the test rather than being cast away — `assert.fail` returns `never`, which is
 * what narrows `written` here without discarding what the type already knows.
 */
function verdictOf(answer: Answer): Verdict {
  if (answer.written === null) assert.fail("the built verdict never reached the injected writer");
  assert.equal(answer.written.type, "verdict");
  return Verdict.parse(answer.written.payload);
}

test("a pathname this mount does not own is left for the rest of the route table", async () => {
  // `false`, not a 404: the caller keeps dispatching, and a mount that claimed everything would
  // silently swallow every other route in `backend-entry.ts`'s table.
  const { storiesDir, cleanup } = await seed();
  try {
    const mount = createUatAttestMount({
      storiesDir,
      resolveSigner: () => Promise.resolve(OPERATOR),
      gitState: () => ({ commitSha: COMMIT, clean: true }),
      agentIdentity: () => null,
      forestWriter: { write: () => Promise.resolve({ persisted: true, status: 201, body: null }) },
      now: () => AT,
    });
    const res = new ServerResponse(new IncomingMessage(new Socket()));
    assert.equal(await mount(new IncomingMessage(new Socket()), res, "/api/tree"), false);
  } finally {
    await cleanup();
  }
});

test("a GET is 405, never a 404 that would read as 'no such route'", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, { __method: "GET", storyId: "inside", criterionId: HUMAN });
    assert.equal(answer.status, 405);
    assertJson(answer);
    assert.equal(answer.body.error, "method GET not allowed", "the refusal NAMES the method it refused");
    assert.equal(answer.written, null, "a refused method must never reach the writer");

    // A request carrying NO method at all is the same refusal, and it must still name something
    // rather than reading as "method undefined not allowed".
    const noMethod = await post(storiesDir, { __method: "", storyId: "inside", criterionId: HUMAN });
    assert.equal(noMethod.status, 405);
    assert.equal(noMethod.body.error, "method GET not allowed");
  } finally {
    await cleanup();
  }
});

test("a signed leg composes a real operator-attested Verdict and hands it to the writer", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, {
      storyId: "inside",
      criterionId: HUMAN,
      outcome: "pass",
      note: "   saw the crown green   ",
    });
    assert.equal(answer.status, 201);
    assertJson(answer);
    const verdict = verdictOf(answer);
    // The 201 ECHOES the verdict it persisted. An empty body would leave the renderer with nothing
    // to confirm against, and would look identical to a success that recorded something else.
    assert.deepEqual(answer.body.verdict, verdict, "the answer echoes the verdict that was written");
    assert.equal(verdict.proofMode, "operator-attested");
    assert.equal(verdict.criterionId, HUMAN);
    assert.equal(verdict.outcome, "pass");
    assert.equal(verdict.signer, OPERATOR, "the signer is the RESOLVED identity, never a request field");
    assert.equal(verdict.commitSha, COMMIT, "the verdict pins the commit the operator observed");
    assert.equal(verdict.at, AT, "the sign time is the injected clock");
    assert.equal(verdict.runId, `local-uat-attest:${AT}`);
    // The note rides as evidence TRIMMED, and only because it is non-blank.
    assert.deepEqual(verdict.evidence, [
      { kind: "operator-attested", ref: OPERATOR, note: "saw the crown green" },
    ]);
  } finally {
    await cleanup();
  }
});

test("a client-supplied signer and commitSha are IGNORED — a verdict's provenance is not forgeable", async () => {
  // Neither field is in this route's wire contract, which is exactly why it is worth an assertion:
  // a mount that started reading them would still compose a well-formed verdict, and every other
  // test here would stay green.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, {
      storyId: "inside",
      criterionId: HUMAN,
      outcome: "pass",
      signer: "forged@attacker.example",
      commitSha: "cd".repeat(20),
    });
    assert.equal(answer.status, 201);
    const verdict = verdictOf(answer);
    assert.equal(verdict.signer, OPERATOR);
    assert.equal(verdict.commitSha, COMMIT);
  } finally {
    await cleanup();
  }
});

test("a machine-witness leg is refused — a click can never stand in for a machine proof", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, { storyId: "inside", criterionId: MACHINE, outcome: "pass" });
    assert.equal(answer.status, 422);
    assertJson(answer);
    assert.match(answer.body.error ?? "", /machine-witness UAT test cannot be greened/);
    assert.equal(answer.written, null, "a refusal must happen BEFORE the writer is ever called");
  } finally {
    await cleanup();
  }
});

test("the RESOLVED witness is what the guard sees — the mount resolves before it asks", async () => {
  // The machine refusal above only proves the guard ran; this proves the mount hands it the witness
  // resolved against the story's reliability gates rather than the declared one. It is the single
  // axis on which this mount feeds the shared guard differently from the studio's handler, so a
  // mount that stopped resolving would diverge from that surface silently.
  const { storiesDir, cleanup } = await seed();
  try {
    // `inside`'s leg 2 declares `machine` AND binds a real observe gate, so `resolvedWitnessOf`
    // answers `machine` and the guard refuses. A mount passing the declared witness would refuse
    // identically here — so the discriminating case is the leg the resolver MOVES: leg 1 is
    // `human`, which resolves to `human`, and a mount that passed something else would let a
    // signature through against the wrong wall.
    const answer = await post(storiesDir, { storyId: "inside", criterionId: HUMAN, outcome: "fail" });
    assert.equal(answer.status, 201);
    assert.equal(verdictOf(answer).outcome, "fail");
  } finally {
    await cleanup();
  }
});

test("an agent can never self-attest — the running session identity reaches the guard", async () => {
  // The mount's job is to FEED the identity; the wall itself is the shared `checkUatProof`. A mount
  // that stopped passing it would leave the no-self-exempt rule (ADR-0007) unenforced on the one
  // surface an agent actually runs on.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(
      storiesDir,
      { storyId: "inside", criterionId: HUMAN, outcome: "pass" },
      { resolveSigner: () => Promise.resolve("desktop-session-9"), agentIdentity: () => "desktop-session-9" },
    );
    assert.equal(answer.status, 422);
    assertJson(answer);
    assert.match(answer.body.error ?? "", /can never self-attest/);
    assert.equal(answer.written, null);
  } finally {
    await cleanup();
  }
});

test("a DIRTY working tree is refused — nobody attests bytes they did not commit", async () => {
  // THIS SURFACE'S OWN WALL, with no mirror anywhere: the studio has none, correctly, because a
  // member cannot dirty the deployment they are looking at. Nothing else in the repo proves the
  // MOUNT wires it.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(
      storiesDir,
      { storyId: "inside", criterionId: HUMAN, outcome: "pass" },
      { gitState: () => ({ commitSha: COMMIT, clean: false }) },
    );
    assert.equal(answer.status, 422);
    assertJson(answer);
    assert.match(answer.body.error ?? "", /working tree is DIRTY/);
    assert.equal(answer.written, null);
  } finally {
    await cleanup();
  }
});

test("a verdict the broker did not persist is a REFUSAL, never a forged signed success", async () => {
  // The other wall with no mirror. The writer IS reached here — that is the point: the verdict was
  // composed and handed over, and the broker's answer is authoritative.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(
      storiesDir,
      { storyId: "inside", criterionId: HUMAN, outcome: "pass" },
      {},
      { persisted: false, guidance: "the broker refused: sign in first", status: 401 },
    );
    assert.equal(answer.status, 422);
    assert.match(answer.body.error ?? "", /sign in first/);
    assert.notEqual(answer.written, null, "the verdict WAS composed and offered — only the write failed");
  } finally {
    await cleanup();
  }
});

test("a storyId that escapes the stories root is refused, and reads as a missing story", async () => {
  // Not merely that the escape fails — that it is INDISTINGUISHABLE from an absence. A refusal that
  // read differently is what turns this route into a filesystem existence oracle, which is the
  // defect the `/api/attestations` row measured on the read next door.
  const { storiesDir, cleanup } = await seed();
  try {
    const escaped = await post(storiesDir, { storyId: "../outside", criterionId: OUTSIDE, outcome: "pass" });
    const missing = await post(storiesDir, { storyId: "nowhere", criterionId: OUTSIDE, outcome: "pass" });
    assert.equal(escaped.status, 400);
    assertJson(escaped);
    assert.equal(escaped.written, null, "a spec outside the root must never reach a signature");
    assert.equal(missing.status, 400);
    // The messages are asserted OUTRIGHT before they are compared to each other. Comparing them
    // alone is satisfied by two blank strings, which is the shape of an assertion that cannot fail.
    assert.equal(escaped.body.error, 'story "../outside" was not found');
    assert.equal(missing.body.error, 'story "nowhere" was not found');
    assert.equal(
      escaped.body.error?.replace("../outside", "<id>"),
      missing.body.error?.replace("nowhere", "<id>"),
      "an escaped id and a missing one must answer with the same shape",
    );
  } finally {
    await cleanup();
  }
});

test("a blank storyId or criterionId is refused by name, before any spec is read", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    for (const body of [
      { storyId: "", criterionId: HUMAN },
      // WHITESPACE-only, not merely empty: without the trim these read as present and fall through
      // to a story lookup, which answers a DIFFERENT refusal for what is really a blank field.
      { storyId: "   ", criterionId: HUMAN },
      { storyId: "inside", criterionId: "   " },
      { storyId: "inside" },
      // NON-STRING ids: a client can send any JSON. Read as present, `.trim()` throws and the
      // request dies with a TypeError instead of the refusal an operator can act on.
      { storyId: 42, criterionId: HUMAN },
      { storyId: "inside", criterionId: { nested: true } },
    ]) {
      const answer = await post(storiesDir, { ...body, outcome: "pass" });
      assert.equal(answer.status, 400, `${JSON.stringify(body)} must be refused`);
      assertJson(answer);
      assert.equal(answer.body.error, "storyId and criterionId are required");
      assert.equal(answer.written, null);
    }
  } finally {
    await cleanup();
  }
});

test("an id the story does not declare never mints a verdict against nothing", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, {
      storyId: "inside",
      criterionId: `uatc_${"9".repeat(24)}`,
      outcome: "pass",
    });
    assert.equal(answer.status, 422);
    assertJson(answer);
    assert.match(answer.body.error ?? "", /unknown criterion id/);
    assert.equal(answer.written, null);
  } finally {
    await cleanup();
  }
});

test("an outcome that is not `fail` is `pass` — the wire carries two outcomes, not three", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    for (const outcome of ["pass", "banana", undefined]) {
      const answer = await post(storiesDir, { storyId: "inside", criterionId: HUMAN, outcome });
      assert.equal(answer.status, 201);
      assert.equal(verdictOf(answer).outcome, "pass");
    }
    const failed = await post(storiesDir, { storyId: "inside", criterionId: HUMAN, outcome: "fail" });
    assert.equal(verdictOf(failed).outcome, "fail");
  } finally {
    await cleanup();
  }
});

test("a blank or absent note leaves the evidence WITHOUT a note key, never an empty one", async () => {
  // Absence is the signal downstream, so `note: ""` would be a different document from `note`
  // absent — and the whitespace case is the one a real operator produces by hitting the field.
  const { storiesDir, cleanup } = await seed();
  try {
    for (const note of ["", "    ", undefined]) {
      const answer = await post(storiesDir, { storyId: "inside", criterionId: HUMAN, outcome: "pass", note });
      const verdict = verdictOf(answer);
      assert.deepEqual(verdict.evidence, [{ kind: "operator-attested", ref: OPERATOR }]);
    }
  } finally {
    await cleanup();
  }
});

// ---------------------------------------------------------------------------
// The request-body reader. It MOVED here with the mount (it had exactly one caller, this route),
// and the move is what brought it inside `check:mutation-diff`'s aperture — it had lived in
// `electron/backend-entry.ts`, outside every project's `src/`, proved by nothing for as long as it
// existed. These are the branches that guard what a signature is composed FROM.
// ---------------------------------------------------------------------------

test("a body over 64 KiB is REFUSED rather than buffered — an unbounded read is the hazard", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    // One byte past the cap, counted across however many chunks the stream delivers.
    const raw = `{"storyId":"inside","criterionId":"${HUMAN}","note":"${"x".repeat(64 * 1024 + 1)}"}`;
    await assert.rejects(post(storiesDir, { __raw: raw }), /request body is too large/);
  } finally {
    await cleanup();
  }
});

test("a body AT the cap is accepted — the bound is `over`, not `at`", async () => {
  // The off-by-one is the mutant that matters here: `>` becoming `>=` refuses a body that is
  // exactly at the limit, which is a real request an operator with a long note can produce.
  const { storiesDir, cleanup } = await seed();
  try {
    const prefix = `{"storyId":"inside","criterionId":"${HUMAN}","outcome":"pass","note":"`;
    const suffix = `"}`;
    const raw = prefix + "x".repeat(64 * 1024 - prefix.length - suffix.length) + suffix;
    assert.equal(Buffer.byteLength(raw), 64 * 1024, "the fixture must sit exactly ON the boundary");
    const answer = await post(storiesDir, { __raw: raw });
    assert.equal(answer.status, 201);
  } finally {
    await cleanup();
  }
});

test("a body that is not valid JSON, and one that is not an OBJECT, are each refused by name", async () => {
  // Two different refusals rather than one standing for both: a reader that answered "not JSON" for
  // a well-formed array would send an operator looking for a syntax error that is not there.
  const { storiesDir, cleanup } = await seed();
  try {
    await assert.rejects(post(storiesDir, { __raw: "{not json" }), /request body must be valid JSON/);
    await assert.rejects(post(storiesDir, { __raw: "[]" }), /request body must be a JSON object/);
    await assert.rejects(post(storiesDir, { __raw: "null" }), /request body must be a JSON object/);
    await assert.rejects(post(storiesDir, { __raw: '"a string"' }), /request body must be a JSON object/);
  } finally {
    await cleanup();
  }
});

test("a stream that ERRORS mid-body rejects rather than hanging or signing a partial request", async () => {
  // The socket-level failure: a client that disconnects halfway. Without the error listener the
  // promise never settles and the request hangs forever, which on a signing route means an operator
  // watching a spinner with no idea whether they signed.
  const { storiesDir, cleanup } = await seed();
  try {
    const mount = createUatAttestMount({
      storiesDir,
      resolveSigner: () => Promise.resolve(OPERATOR),
      gitState: () => ({ commitSha: COMMIT, clean: true }),
      agentIdentity: () => null,
      forestWriter: { write: () => Promise.resolve({ persisted: true, status: 201, body: null }) },
      now: () => AT,
    });
    const req = new IncomingMessage(new Socket());
    req.method = "POST";
    req.url = "/api/uat/attest";
    const res = new ServerResponse(new IncomingMessage(new Socket()));
    const answered = mount(req, res, "/api/uat/attest");
    req.emit("error", new Error("socket hang up"));
    await assert.rejects(answered, /socket hang up/);
  } finally {
    await cleanup();
  }
});

test("an EMPTY body is refused too — a POST with nothing in it never reaches the honesty walls", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    await assert.rejects(post(storiesDir, { __raw: "" }), /request body must be valid JSON/);
  } finally {
    await cleanup();
  }
});

test("a spec at a story path that is NOT a story is refused — this route's vocabulary is stories", async () => {
  // `containedStoryFile` always appends `story.md`, so the id cannot name a capability FILE — but a
  // directory can hold a spec that declares `tier: capability`, and signing against it would bind a
  // verdict to a unit whose UAT legs this route never read.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, { storyId: "not-a-story", criterionId: HUMAN, outcome: "pass" });
    assert.equal(answer.status, 400);
    assert.equal(answer.body.error, 'story "not-a-story" was not found');
    assert.equal(answer.written, null);
  } finally {
    await cleanup();
  }
});

test("a note that is not a string is IGNORED rather than carried into the verdict", async () => {
  // A client can send any JSON. Read as a note, a number reaches `note?.trim()` and the request dies
  // with a TypeError where the honest answer is a signed verdict carrying no note.
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await post(storiesDir, { storyId: "inside", criterionId: HUMAN, outcome: "pass", note: 42 });
    assert.equal(answer.status, 201);
    assert.deepEqual(verdictOf(answer).evidence, [{ kind: "operator-attested", ref: OPERATOR }]);
  } finally {
    await cleanup();
  }
});
