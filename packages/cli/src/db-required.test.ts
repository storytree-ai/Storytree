// The DB-required policy (ADR-0302 D3) — the pure half of "is an unreachable live store a SKIP or a
// RED here?". Every assertion is about the DECISION, never about a live database.

import test from "node:test";
import assert from "node:assert/strict";

import {
  DB_REQUIRED_ENV,
  dbIsRequired,
  evaluateDbAbsence,
  type DbAbsence,
} from "./db-required.js";

const NO_CRED: DbAbsence = { kind: "no-credential" };
const UNREACHABLE: DbAbsence = { kind: "unreachable", detail: "live read timed out after 10000ms" };

test("dbIsRequired: the recognised affirmatives arm it, case- and whitespace-insensitively", () => {
  for (const raw of ["1", "true", "yes", "on", "TRUE", "  Yes  ", "ON"]) {
    assert.equal(dbIsRequired(raw), true, `${JSON.stringify(raw)} should arm the requirement`);
  }
});

test("dbIsRequired: absent, blank and explicit negatives all leave it disarmed", () => {
  for (const raw of [undefined, "", "   ", "0", "false", "no", "off", "FALSE"]) {
    assert.equal(dbIsRequired(raw), false, `${JSON.stringify(raw)} should leave it disarmed`);
  }
});

test("dbIsRequired: an UNRECOGNISED value is disarmed, not armed", () => {
  // The fail-safe direction, and the reason it is a set membership rather than a truthiness test: a
  // typo like `STORYTREE_DB_REQUIRED=ture` must not silently red every PR in the repo. The check
  // still prints its SKIP, so the operator sees that nothing was verified.
  for (const raw of ["ture", "y", "enabled", "please"]) {
    assert.equal(dbIsRequired(raw), false, `${JSON.stringify(raw)} should NOT arm the requirement`);
  }
});

test("not required: both absences are a SKIP, and the message names what went unverified", () => {
  const noCred = evaluateDbAbsence({ absence: NO_CRED, required: false, subject: "friction backlog" });
  assert.equal(noCred.level, "skip");
  assert.match(noCred.message, /^SKIP —/);
  assert.match(noCred.message, /STORYTREE_DB_USER/);
  assert.match(noCred.message, /friction backlog unverified/);

  const down = evaluateDbAbsence({ absence: UNREACHABLE, required: false, subject: "parked work" });
  assert.equal(down.level, "skip");
  assert.match(down.message, /^SKIP —/);
  // The underlying cause survives into the message — an operator must not have to guess.
  assert.match(down.message, /live read timed out after 10000ms/);
  assert.match(down.message, /parked work unverified/);
});

test("required: both absences turn RED, and each names the variable that armed it", () => {
  const noCred = evaluateDbAbsence({ absence: NO_CRED, required: true, subject: "friction backlog" });
  assert.equal(noCred.level, "red");
  assert.match(noCred.message, /^FAIL —/);
  assert.match(noCred.message, new RegExp(DB_REQUIRED_ENV));
  assert.match(noCred.message, /STORYTREE_DB_USER is absent/);

  const down = evaluateDbAbsence({ absence: UNREACHABLE, required: true, subject: "parked work" });
  assert.equal(down.level, "red");
  assert.match(down.message, /^FAIL —/);
  assert.match(down.message, new RegExp(DB_REQUIRED_ENV));
  assert.match(down.message, /live read timed out after 10000ms/);
});

test("a RED distinguishes a MISSING credential from an UNREACHABLE store", () => {
  // The whole point of reading a CI log: "the database is down" and "this step is misconfigured"
  // need different actions, so the two reds must not collapse into one sentence.
  const noCred = evaluateDbAbsence({ absence: NO_CRED, required: true, subject: "friction backlog" });
  const down = evaluateDbAbsence({ absence: UNREACHABLE, required: true, subject: "friction backlog" });
  assert.notEqual(noCred.message, down.message);
  assert.match(down.message, /db:probe/);
  assert.doesNotMatch(noCred.message, /db:probe/);
});

test("the subject is the ONLY thing that varies between the two rungs' messages", () => {
  // Both checks share this policy; if their wording ever diverges it must be because the caller
  // passed a different subject, never because the policy grew a second code path.
  const a = evaluateDbAbsence({ absence: UNREACHABLE, required: true, subject: "friction backlog" });
  const b = evaluateDbAbsence({ absence: UNREACHABLE, required: true, subject: "parked work" });
  assert.equal(
    a.message.replace("friction backlog", "<subject>"),
    b.message.replace("parked work", "<subject>"),
  );
});
