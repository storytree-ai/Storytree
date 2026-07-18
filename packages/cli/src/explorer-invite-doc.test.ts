import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { runDoctor, NODE_MAJOR_FLOOR, type DoctorObservations } from "./doctor.js";
import { escalationCategoryOf } from "./escalation-blob.js";

/**
 * Structural floor for the owner's explorer invite ceremony, `infra/explorer-invite.md`
 * (ADR-0207 D2/D4).
 *
 * The runbook's whole value is that its two access grants map 1:1 onto the invariants `doctor`
 * independently verifies — so a grant the owner forgets comes back as a named escalation rather than
 * "it doesn't work". That mapping is exactly what would rot silently: rename a probe, or add a third
 * owner-granted access invariant, and the runbook quietly stops matching reality.
 *
 * So this asserts the tie in the direction that matters: EVERY owner-escalatable ACCESS probe doctor
 * can produce must be named in the runbook. A new access grant therefore fails here until it is
 * documented, which is the point.
 */

const doc = readFileSync(fileURLToPath(new URL("../../../infra/explorer-invite.md", import.meta.url)), "utf8");

/** An environment where both owner-granted access invariants are refused. */
const BOTH_ACCESS_REFUSED: DoctorObservations = {
  gitPresent: true,
  nodeMajor: NODE_MAJOR_FLOOR,
  provisioned: true,
  remoteReachable: false, // GitHub Read refused
  seedReadable: true,
  claudeCliPresent: true,
  claudeLoggedIn: true,
  checkoutBehind: 0,
  hostedRead: "refused", // IAP access refused
};

test("every owner-escalatable ACCESS probe is named in the invite runbook", () => {
  const accessProbes = runDoctor(BOTH_ACCESS_REFUSED)
    .probes.filter((p) => escalationCategoryOf(p) === "access")
    .map((p) => p.name);

  // Guard the fixture: if this ever yields nothing, the test would pass vacuously.
  assert.ok(accessProbes.length >= 2, "expected both owner-granted access invariants to be refused");

  for (const probe of accessProbes) {
    assert.ok(
      doc.includes(probe),
      `infra/explorer-invite.md must name the '${probe}' probe — an owner-granted access invariant ` +
        "the dev's doctor verifies. A new access grant must be documented in the invite ceremony.",
    );
  }
});

test("the runbook keeps the read-only framing and the D3 credential boundary explicit", () => {
  assert.match(doc, /read-only/i, "an explorer is read-only by design (D2)");
  assert.match(
    doc,
    /never handles their Claude credential|never handles your Claude credential/i,
    "the invite message must state the D3 boundary — storytree never handles the credential",
  );
});

test("the runbook points the dev at the guide, not at manual repair steps", () => {
  assert.match(doc, /storytree guide --fix/, "self-serve repair is the guide, not a list of commands");
});
