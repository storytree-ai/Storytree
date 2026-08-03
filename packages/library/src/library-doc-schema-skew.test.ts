// explainDocValidationError — SCHEMA SKEW is charged by AUTHORSHIP, not blamed on the caller.
//
// THE INCIDENT, measured 2026-08-03. ADR-0298's sweep wrote a `proposals` array onto four live arcs
// — including `verification-integrity-arc`, the busiest in the tree — roughly 1h40m BEFORE PR #1128
// landed the schema half that accepts it. The library tier is live-canonical (ADR-0023), so nothing
// gates that ordering. For the whole window every session running main-derived code was hard-refused
// on those four arcs with a bare zod dump:
//
//   increment would make "verification-integrity-arc" invalid:
//   [{"code":"unrecognized_keys","keys":["proposals"], ... }]
//
// Three things made that maximally expensive, and this file fences all three:
//
//   1. IT NAMED THE KEY, NOT THE CAUSE. The message pointed at the artifact, so it read as "you
//      passed a bad field". The field was not the caller's at all.
//   2. THE OBVIOUS REMEDY DESTROYS WORK. Stripping the key to get past the refusal would persist
//      the stripped doc back to the live store, deleting another session's landed sweep.
//   3. IT ARRIVES AT THE WORST MOMENT. `arc increment add` is the merge ceremony's residue step —
//      after automerge, when the branch is dead and there is nothing left to fix it with. The
//      session that hit it spent four tool-calls establishing that the blocker was neither its own
//      data nor a bug, then had to re-home its context into a brand-new arc.
//
// THE DISCRIMINATOR IS AUTHORSHIP, and it is exact rather than heuristic: the write path already
// holds the doc AS READ FROM THE STORE, so a key present there was demonstrably not introduced by
// this write. That is the same move ADR-0290 made for `check:corpus-content` (charge the difference
// to whoever authored it, label the rest). No new mechanism is invented here.
//
// The fixtures below use a SYNTHETIC field name rather than `proposals`, because `proposals` is now
// a known arc field — a test written against it would stop exercising the skew path the moment the
// schema caught up, which is precisely the shape of the bug.
//
// Proof: pnpm --filter @storytree/library exec node --import tsx --test src/library-doc-schema-skew.test.ts

import test from "node:test";
import assert from "node:assert/strict";

import { explainDocValidationError, upcastAndValidate } from "./library-doc.js";

/** A field a FUTURE schema knows about and this checkout does not — the skew, in one key. */
const FUTURE_FIELD = "cadenceLog";

/** A valid arc as the live store would hand it back, plus whatever extra keys the case needs. */
function storedArc(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: "arc",
    id: "verification-integrity-arc",
    title: "Verification integrity",
    description: "guard the proofs, not just the code",
    intent: "Keep the proof instruments honest.",
    endState: "Every instrument is within its ceiling and says who owes the drain.",
    lifecycle: "active",
    references: [],
    createdAt: "2026-07-01T00:00:00.000Z",
    updatedAt: "2026-08-03T00:00:00.000Z",
    ...extra,
  };
}

/** Push a doc through the real write boundary and hand the thrown error to the explainer. */
function explain(doc: unknown, opts?: { storedKeys?: readonly string[] }): string {
  try {
    upcastAndValidate(doc);
  } catch (e) {
    return explainDocValidationError(doc, e, opts);
  }
  throw new Error("expected the doc to fail validation");
}

// ---------- the incident: a key the caller never introduced ----------

test("a key already in the STORED doc is diagnosed as schema skew, not as a bad field", () => {
  const stored = storedArc({ [FUTURE_FIELD]: [{ at: "2026-08-03" }] });
  // The write the session was making: append an increment to a doc it just read.
  const base = { ...stored, increments: [{ date: "2026-08-03", outcome: "landed" }] };

  const msg = explain(base, { storedKeys: Object.keys(stored) });

  assert.match(msg, /SCHEMA SKEW/, "the cause must be named, not just the key");
  assert.match(msg, new RegExp(FUTURE_FIELD), "the offending field is still named");
  assert.match(msg, /git merge origin\/main/, "the actual remedy is the merge, and it is spelled out");
  assert.match(msg, /Do NOT strip the field/, "the destructive workaround is refused explicitly");

  // The WRONG diagnosis must be gone. This is the assertion that would have failed before the fix:
  // the old message said the kind "does not have" the field, which is both untrue and points the
  // reader at deleting another session's work.
  assert.ok(
    !new RegExp(`does not have:[^\\n]*\\b${FUTURE_FIELD}\\b`).test(msg),
    `a stored key must never be blamed on the caller: ${msg}`,
  );
});

// ---------- the converse: a real typo is still a real typo ----------

test("a key the CALLER introduced is still blamed on the caller", () => {
  const stored = storedArc();
  const base = { ...stored, increnents: [] }; // typo'd `increments`

  const msg = explain(base, { storedKeys: Object.keys(stored) });

  assert.match(msg, /field\(s\) this kind does not have: increnents/);
  assert.ok(!/SCHEMA SKEW/.test(msg), `a caller typo must not be excused as skew: ${msg}`);
  // `a arc` rather than `an arc` — the explainer interpolates a bare `a ${label}` and this file is
  // not the place to fix that; asserting the string the product actually emits keeps this test
  // honest about current behaviour rather than about preferred behaviour.
  assert.match(msg, /a arc artifact takes: .*\bintent\b/, "it still says what the kind does take");
});

// ---------- both at once, each charged to the right party ----------

test("a mixed doc separates the stored key from the caller's typo", () => {
  const stored = storedArc({ [FUTURE_FIELD]: [] });
  const base = { ...stored, increnents: [] };

  const msg = explain(base, { storedKeys: Object.keys(stored) });

  assert.match(msg, /SCHEMA SKEW/);
  assert.match(msg, new RegExp(`SCHEMA SKEW[^\\n]*${FUTURE_FIELD}`), "the stored key is charged as skew");
  assert.match(msg, /does not have: increnents/, "the caller's key is charged to the caller");
  assert.ok(
    !new RegExp(`does not have:[^\\n]*\\b${FUTURE_FIELD}\\b`).test(msg),
    `the stored key must not appear in the caller's column too: ${msg}`,
  );
});

// ---------- the default is unchanged, so no existing caller shifts ----------

test("without storedKeys the message is exactly the pre-existing one", () => {
  const base = storedArc({ [FUTURE_FIELD]: [] });

  const withoutHint = explain(base);
  assert.match(withoutHint, new RegExp(`does not have:[^\\n]*${FUTURE_FIELD}`));
  assert.ok(
    !/SCHEMA SKEW/.test(withoutHint),
    "skew is only claimed when the caller supplies evidence for it — never guessed",
  );

  // An EMPTY storedKeys list is evidence of the opposite (nothing was stored), not missing evidence.
  const emptyStored = explain(base, { storedKeys: [] });
  assert.ok(!/SCHEMA SKEW/.test(emptyStored));
});
