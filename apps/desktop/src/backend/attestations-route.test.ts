// Unit test for attestations-route.ts — the desktop's re-composition of the studio's
// GET /api/attestations join, extracted out of `electron/backend-entry.ts` so a probe (and this
// suite) can reach it at all.
//
// WHAT IT PINS, and why each assertion exists rather than being left to the mirror row. The
// `/api/attestations` mirror row (packages/cli/src/mirror-conformance.ts) proves the two SURFACES
// agree; it is a gate step, so without this file a `pnpm --filter desktop test` would stay green
// through a re-introduction of any of the three divergences that row's first run measured. The two
// are complementary — this says what THIS surface must serve, the row says the two must match — and
// the `/api/comments` landing set the precedent of carrying both.
//
// The three, all measured 2026-08-31 (`unscored-guards-arc` / `register-deep-mirror-pairs`) by
// standing each surface's own composition up in its own process and diffing the composed RESULTS:
//   1. an id that ESCAPES the stories root was RESOLVED here and refused there;
//   2. a CAPABILITY id fell back to `<story>/<capId>.md` here and resolved to nothing there;
//   3. `detailArtifactId` (ADR-0209 D7) was attached there and by nothing here.
//
// DELETION TEST: drop the containment check and case 1 fails; restore `findNodeSpecFile` and case 2
// fails; drop the detail-pointer read and case 3 fails.
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
import { criterionRevisionId } from "@storytree/proof-protocol";

import { createAttestationsMount } from "./attestations-route.js";

const INSIDE = `uatc_${"1".repeat(24)}`;
const CAP = `uatc_${"2".repeat(24)}`;
const OUTSIDE = `uatc_${"3".repeat(24)}`;

const LEG_INSIDE = "**The story's own leg** — served, with its detail pointer.";
const LEG_CAP = "**A capability's own leg** — never served by this route.";
const LEG_OUTSIDE = "**A leg outside the root** — reaching it at all is the defect.";

/** One authored criterion line whose `(revision-id:)` binds the WHOLE item, detail tag included. */
function criterion(ordinal: number, criterionId: string, prose: string, detail?: string): string {
  const item = `${ordinal}. ${prose}${detail === undefined ? "" : ` _(detail: ${detail})_`}`;
  const revisionId = criterionRevisionId(canonicalUatCriterionContent(item));
  return `${item} (criterion-id: ${criterionId})(revision-id: ${revisionId})`;
}

function storyBody(id: string, uatLines: string[]): string {
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
  ].join("\n");
}

/**
 * A temp repo root holding `stories/inside` (with a capability spec beside it) AND a story ONE LEVEL
 * ABOVE the stories root. The outside story is real and parses — a decoy that does not exist would
 * make the containment assertion pass whether the guard held or not.
 */
async function seed(): Promise<{ root: string; storiesDir: string; cleanup: () => Promise<void> }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "attestations-route-"));
  const storiesDir = path.join(root, "stories");
  await fs.mkdir(path.join(storiesDir, "inside"), { recursive: true });
  await fs.writeFile(
    path.join(storiesDir, "inside", "story.md"),
    storyBody("inside", [criterion(1, INSIDE, LEG_INSIDE, "inside#detail-1")]),
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
  await fs.mkdir(path.join(root, "escaped"), { recursive: true });
  await fs.writeFile(
    path.join(root, "escaped", "story.md"),
    storyBody("escaped", [criterion(1, OUTSIDE, LEG_OUTSIDE)]),
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

/** Drive the mount for one `?storyId=` and return the decoded answer. */
async function ask(
  storiesDir: string,
  storyId: string,
): Promise<{ status: number; body: { storyId: string; tests: { criterionId: string }[] } }> {
  const mount = createAttestationsMount({
    storiesDir,
    readAttestationEvents: async () => [],
    readVerdictEvents: async () => null,
  });
  const target = `/api/attestations?storyId=${encodeURIComponent(storyId)}`;
  const req = new IncomingMessage(new Socket());
  req.method = "GET";
  req.url = target;
  let raw = "";
  const res = new ServerResponse(new IncomingMessage(new Socket()));
  res.end = ((chunk?: unknown): ServerResponse => {
    raw = typeof chunk === "string" ? chunk : "";
    return res;
  }) as ServerResponse["end"];
  const claimed = await mount(req, res, "/api/attestations");
  assert.ok(claimed, "the mount claims its own pathname");
  return {
    status: res.statusCode,
    body: JSON.parse(raw) as { storyId: string; tests: { criterionId: string }[] },
  };
}

test("attestations-route: an id that ESCAPES the stories root reads exactly like a missing story", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const escaping = await ask(storiesDir, "../escaped");
    const missing = await ask(storiesDir, "no-such-story");
    // NOT merely "serves no legs": the refusal must be INDISTINGUISHABLE from an absence. A refusal
    // that answered differently — a 404, an error body, a different key set — is itself the
    // filesystem existence oracle the guard exists to prevent.
    assert.equal(escaping.status, missing.status, "same status as an absent story");
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
    const answer = await ask(storiesDir, "cap-a");
    assert.equal(answer.status, 200, "an unknown story is an empty 200, never a 404");
    assert.deepEqual(answer.body.tests, [], "a capability's legs are not this route's answer");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a leg's `(detail: …)` pointer rides the wire, and only when it has one", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const answer = await ask(storiesDir, "inside");
    const [row] = answer.body.tests as ({ criterionId: string; detailArtifactId?: string })[];
    assert.ok(row, "the story's one leg is served");
    assert.equal(row.criterionId, INSIDE);
    // ADR-0209 D7: the studio attached these and this surface attached none, so the SHARED
    // `UatTestCriteriaSection` rendered every desktop leg with no link to the artifact behind it.
    assert.equal(row.detailArtifactId, "inside#detail-1", "the declared pointer reaches the wire");

    // And a leg WITHOUT a tag must carry no key at all — an explicit `undefined` would read as a
    // pointer that failed to resolve rather than one that was never declared.
    await fs.writeFile(
      path.join(storiesDir, "inside", "story.md"),
      storyBody("inside", [criterion(1, INSIDE, LEG_INSIDE)]),
      "utf8",
    );
    const untagged = await ask(storiesDir, "inside");
    const [plain] = untagged.body.tests as Record<string, unknown>[];
    assert.ok(plain, "the leg is still served");
    assert.ok(!("detailArtifactId" in plain), "no key at all for a leg that declares no pointer");
  } finally {
    await cleanup();
  }
});

test("attestations-route: a missing or blank storyId is a 400, and an unreadable vouch log is not fatal", async () => {
  const { storiesDir, cleanup } = await seed();
  try {
    const mount = createAttestationsMount({
      storiesDir,
      // An unreadable store must not blank the panel — the ADR-0033 advisory posture. Asserted
      // rather than assumed: this seam is the one the extraction introduced, so its rejection path
      // is the one nothing exercised before.
      readAttestationEvents: async () => {
        throw new Error("the attestation store is down");
      },
      readVerdictEvents: async () => null,
    });
    const answer = async (target: string): Promise<{ status: number; raw: string }> => {
      const req = new IncomingMessage(new Socket());
      req.method = "GET";
      req.url = target;
      let raw = "";
      const res = new ServerResponse(new IncomingMessage(new Socket()));
      res.end = ((chunk?: unknown): ServerResponse => {
        raw = typeof chunk === "string" ? chunk : "";
        return res;
      }) as ServerResponse["end"];
      await mount(req, res, new URL(target, "http://localhost").pathname);
      return { status: res.statusCode, raw };
    };

    assert.equal((await answer("/api/attestations")).status, 400, "storyId is required");
    assert.equal((await answer("/api/attestations?storyId=")).status, 400, "blank is not an id");

    const served = await answer("/api/attestations?storyId=inside");
    assert.equal(served.status, 200, "a down vouch store still serves the legs");
    const body = JSON.parse(served.raw) as { tests: Record<string, unknown>[] };
    assert.equal(body.tests.length, 1, "the leg is there");
    assert.ok(!("human" in body.tests[0]!), "with no marks on it, rather than a fabricated one");
  } finally {
    await cleanup();
  }
});
