import test from "node:test";
import assert from "node:assert/strict";
import {
  CLASSIFIED_WITNESSES,
  ClassifiedWitness,
  CRITERION_WITNESSES,
  CriterionWitness,
  Criterion,
  legacyCriterionId,
  parseCriteria,
  isClassifiedWitness,
  isLegacyUnresolved,
  canonicalCriterionContent,
} from "./criterion.js";
import { criterionRevisionId } from "@storytree/proof-protocol";
import { authoredCriteria, EXACT_CRITERION } from "./criterion.test-helpers.js";

/**
 * Offline unit tests for the `three-kind-witness` capability (ADR-0209 D1/D8).
 *
 * A UAT criterion's `witness` now classifies as one of THREE distinct kinds —
 * `machine`, `model`, `human` — or remains the legacy pre-migration UNRESOLVED
 * state `either`. `model` is a genuinely new kind, never a spelling of `machine`.
 * An untagged (legacy) criterion parses only to `either` and can never default
 * into `model` — that state stays visibly unresolved until an explicit migration
 * tags it. An explicit-but-invalid witness value is refused, never defaulted.
 */

const STORY = "demo-story";

/**
 * A story body with one leg of each explicit classified kind, plus one untagged legacy leg.
 * The `model` leg carries a `(tier: advanced)` annotation (ADR-0209 D2): a classified
 * `model` witness must declare its preclassified minimum tier, so a fixture exercising
 * `model` classification must supply one.
 */
const BODY = authoredCriteria(`## UAT Test Criteria

1. **Decompose** _(witness: machine)_: a criterion resolves to addressable ids.
2. **Human relay** _(witness: human)_: the owner tells the agent it works.
3. **Model judged** _(witness: model)(tier: advanced)_: a model attests structured judgment.
4. **Not yet migrated:** a legacy untagged criterion.
`);

// ── the three classified kinds ──────────────────────────────────────────────

test("classified-witness-enum: exactly three classified kinds — machine, model, human", () => {
  assert.deepEqual(CLASSIFIED_WITNESSES, ["machine", "model", "human"]);
});

test("classified-witness-enum: `model` is a distinct kind, not a spelling of `machine`", () => {
  assert.notEqual("model", "machine");
  assert.ok(ClassifiedWitness.safeParse("model").success, "model is a valid classified witness");
  assert.ok(ClassifiedWitness.safeParse("machine").success, "machine is a valid classified witness");
  assert.deepEqual(
    new Set(CLASSIFIED_WITNESSES).size,
    CLASSIFIED_WITNESSES.length,
    "no duplicate/aliased entries",
  );
});

test("classified-witness-enum: `either` is not a classified kind", () => {
  assert.equal(ClassifiedWitness.safeParse("either").success, false, "either is not classified");
  assert.ok(!(CLASSIFIED_WITNESSES as readonly string[]).includes("either"));
});

test("criterion-witness-enum: the full parseable set is machine|model|human|either", () => {
  assert.deepEqual(CRITERION_WITNESSES, ["machine", "model", "human", "either"]);
  for (const kind of CRITERION_WITNESSES) {
    assert.ok(CriterionWitness.safeParse(kind).success, `${kind} is a valid criterion witness`);
  }
});

// ── explicit classification (new / migrated criteria) ──────────────────────

test("explicit classification: a criterion tagged (witness: machine) classifies as machine", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(criteria.length, 4);
  assert.equal(criteria[0]!.witness, "machine");
  assert.equal(isClassifiedWitness(criteria[0]!.witness), true);
});

test("explicit classification: a criterion tagged (witness: human) classifies as human", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(criteria[1]!.witness, "human");
  assert.equal(isClassifiedWitness(criteria[1]!.witness), true);
});

test("explicit classification: a criterion tagged (witness: model) classifies as model, distinct from machine", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(criteria[2]!.witness, "model");
  assert.notEqual(criteria[2]!.witness, "machine", "model must never collapse to machine");
  assert.equal(isClassifiedWitness(criteria[2]!.witness), true);
});

test("explicit classification: ids are authored opaque identities, stable across re-parse", () => {
  const first = parseCriteria(STORY, BODY);
  const second = parseCriteria(STORY, BODY);
  assert.deepEqual(
    first.map((c) => c.criterionId),
    [
      "uatc_000000000000000000000001",
      "uatc_000000000000000000000002",
      "uatc_000000000000000000000003",
      "uatc_000000000000000000000004",
    ],
  );
  assert.deepEqual(first, second, "re-parsing the same body is deterministic");
});

test("legacyCriterionId is explicitly migration-only", () => {
  assert.equal(legacyCriterionId("s", 3), "s#uat-3");
});

// ── legacy compatibility without model default (ADR-0209 D8) ───────────────

test("legacy compatibility: an untagged criterion parses only to unresolved `either`", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(criteria[3]!.witness, "either", "no witness tag → either, the conservative legacy default");
  assert.notEqual(criteria[3]!.witness, "model", "an untagged criterion must never default into model");
});

test("legacy compatibility: an unresolved `either` criterion is not classified", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(isClassifiedWitness(criteria[3]!.witness), false, "either can never be treated as classified");
  assert.equal(isLegacyUnresolved(criteria[3]!.witness), true);
});

test("legacy compatibility: a classified leg is never reported as legacy-unresolved", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(isLegacyUnresolved(criteria[0]!.witness), false, "machine");
  assert.equal(isLegacyUnresolved(criteria[1]!.witness), false, "human");
  assert.equal(isLegacyUnresolved(criteria[2]!.witness), false, "model");
});

test("legacy compatibility: a story with no UAT section yields [] (backward-compatible)", () => {
  assert.deepEqual(parseCriteria(STORY, "# Just a heading\n\nno uat here\n"), []);
});

test("legacy compatibility: the schema default for an omitted witness is `either`, never `model`", () => {
  const parsed = Criterion.parse({ ...EXACT_CRITERION, title: "t" });
  assert.equal(parsed.witness, "either");
  assert.notEqual(parsed.witness, "model");
});

// ── explicit-but-invalid witness is refused, never defaulted ───────────────

test("invalid witness: an explicit but unknown prose tag is refused, not silently either", () => {
  const body = authoredCriteria("## UAT Test Criteria\n\n1. **Bad** (witness: nobody): oops.\n");
  assert.throws(() => parseCriteria(STORY, body), /invalid witness/i, "refused at the parsing boundary");
});

test("invalid witness: the schema refuses an unknown witness value directly", () => {
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "nobody" }));
});

test("invalid witness: the schema rejects unknown fields (strict)", () => {
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "human", extra: 1 }));
});

// ── model tier classification (ADR-0209 D2) ─────────────────────────────────
//
// A `model` criterion must declare a preclassified MINIMUM capability tier —
// `advanced` or `frontier`, nothing below. Tier is meaningful only on a
// classified `model` witness: a `machine`/`human`/legacy-unresolved `either`
// criterion carrying a tier is refused, and a `model` criterion with no tier
// (or an unrecognised tier value) is refused at the parse boundary — never
// silently defaulted or clamped up.

const TIER_ADVANCED_BODY = authoredCriteria(`## UAT Test Criteria

1. **Model judged, advanced** _(witness: model)(tier: advanced)_: judged by a registered advanced-tier model.
`);

const TIER_FRONTIER_BODY = authoredCriteria(`## UAT Test Criteria

1. **Model judged, frontier** _(witness: model)(tier: frontier)_: judged by a frontier-tier model.
`);

const TIER_MISSING_BODY = authoredCriteria(`## UAT Test Criteria

1. **Model judged, no tier** _(witness: model)_: a model witness with no preclassified minimum.
`);

const TIER_UNKNOWN_BODY = authoredCriteria(`## UAT Test Criteria

1. **Model judged, unknown tier** _(witness: model)(tier: basic)_: an unrecognised tier value.
`);

const TIER_ON_NON_MODEL_BODY = authoredCriteria(`## UAT Test Criteria

1. **Machine with a tier** _(witness: machine)(tier: advanced)_: tier is exclusive to the model witness.
`);

test("tier classification: (witness: model)(tier: advanced) parses to the advanced tier", () => {
  const criteria = parseCriteria(STORY, TIER_ADVANCED_BODY);
  assert.equal(criteria[0]!.tier, "advanced");
});

test("tier classification: (witness: model)(tier: frontier) parses to the frontier tier", () => {
  const criteria = parseCriteria(STORY, TIER_FRONTIER_BODY);
  assert.equal(criteria[0]!.tier, "frontier");
});

test("tier classification: the three-kind-witness fixture's model leg carries an advanced tier", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(criteria[2]!.witness, "model");
  assert.equal(criteria[2]!.tier, "advanced");
});

test("tier classification: a model criterion with no tier annotation is refused at the parse boundary", () => {
  assert.throws(
    () => parseCriteria(STORY, TIER_MISSING_BODY),
    /tier/i,
    "a model witness with no preclassified minimum tier must be refused, never defaulted",
  );
});

test("tier classification: a model criterion with an unrecognised tier value is refused", () => {
  assert.throws(() => parseCriteria(STORY, TIER_UNKNOWN_BODY), /tier/i);
});

test("tier classification: a non-model criterion carrying a tier annotation is refused", () => {
  assert.throws(
    () => parseCriteria(STORY, TIER_ON_NON_MODEL_BODY),
    /tier/i,
    "tier is exclusive to the model witness",
  );
});

// ── model tier classification: schema-level refinement ─────────────────────

test("tier schema: a model criterion with tier=advanced parses successfully", () => {
  const parsed = Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "model", tier: "advanced" });
  assert.equal(parsed.tier, "advanced");
});

test("tier schema: a model criterion with tier=frontier parses successfully", () => {
  const parsed = Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "model", tier: "frontier" });
  assert.equal(parsed.tier, "frontier");
});

test("tier schema: a model criterion with no tier is refused (ambiguous minimum forbidden)", () => {
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "model" }));
});

test("tier schema: a model criterion with an unknown tier string is refused", () => {
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "model", tier: "basic" }));
});

test("tier schema: a non-model criterion (machine/human/either) carrying a tier is refused", () => {
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "machine", tier: "advanced" }));
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "human", tier: "frontier" }));
  assert.throws(() => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "either", tier: "advanced" }));
});

// ── revision identity and lineage (ADR-0253) ───────────────────────────────
//
// `revisionId` is a CONTENT binding: it must equal the FNV-1a/64 hash of the
// item's canonical content, so an edited criterion whose annotation was not
// refreshed is refused rather than silently carried as still-proven.
// `previousRevisionId` names the PRECEDING revision, so it may never equal the
// current one — a self-pointing lineage records no history at all.

const STAMPED = authoredCriteria(
  "## UAT Test Criteria\n\n1. **Stamped** _(witness: machine)_: original prose.\n",
);
const TAMPERED = STAMPED.replace("original prose.", "silently edited prose.");

test("revision binding: a parsed criterion's revisionId is the content hash of its canonical item", () => {
  const criteria = parseCriteria(STORY, BODY);
  const items = BODY.split("\n").filter((l) => /^\d+\.\s/.test(l));
  assert.equal(criteria[0]!.revisionId, criterionRevisionId(canonicalCriterionContent(items[0]!)));
});

test("revision binding: an item whose prose changed without re-stamping its revision-id is REFUSED", () => {
  assert.throws(
    () => parseCriteria(STORY, TAMPERED),
    /does not bind current content/,
    "a stale revision-id must never read as still bound to the edited body",
  );
});

test("revision binding: the refusal names the criterion, the declared revision and the expected one", () => {
  assert.throws(
    () => parseCriteria(STORY, TAMPERED),
    (err: unknown) => {
      const message = (err as Error).message;
      assert.match(message, /^uatc_[0-9a-f]{24}: /, "leads with the criterion id");
      assert.match(
        message,
        /revision-id uatr1:[0-9a-f]{16} does not bind current content \(expected uatr1:[0-9a-f]{16}\)/,
        `both revisions must be named, got: ${message}`,
      );
      return true;
    },
  );
});

test("lineage: an item with no (previous-revision-id:) tag carries NO previousRevisionId key at all", () => {
  const criteria = parseCriteria(STORY, BODY);
  assert.equal(
    Object.hasOwn(criteria[0]!, "previousRevisionId"),
    false,
    "absence — not undefined — is the honest first-revision state under a strict schema",
  );
});

test("lineage: an item's (previous-revision-id:) tag is carried onto the criterion", () => {
  const previous = "uatr1:00000000000000ab";
  const body = authoredCriteria(
    `## UAT Test Criteria\n\n1. **Revised** _(witness: machine)_ _(previous-revision-id: ${previous})_: second revision.\n`,
  );
  const criteria = parseCriteria(STORY, body);
  assert.equal(criteria[0]!.previousRevisionId, previous);
  assert.notEqual(criteria[0]!.revisionId, previous, "the predecessor is never the current revision");
});

test("lineage: duplicate (previous-revision-id:) annotations are refused as ambiguous", () => {
  const body = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Two predecessors** _(previous-revision-id: uatr1:00000000000000ab)_ _(previous-revision-id: uatr1:00000000000000cd)_: ambiguous lineage.\n",
  );
  assert.throws(() => parseCriteria(STORY, body), /duplicate previous-revision-id annotations/);
});

test("lineage schema: previousRevisionId equal to revisionId is refused — it records no predecessor", () => {
  assert.throws(
    () =>
      Criterion.parse({
        ...EXACT_CRITERION,
        title: "t",
        previousRevisionId: EXACT_CRITERION.revisionId,
      }),
    (err: unknown) => {
      const { issues } = err as { issues: { path: (string | number)[]; message: string }[] };
      assert.ok(
        issues.some(
          (i) =>
            i.path.join(".") === "previousRevisionId" &&
            i.message === "previousRevisionId must name the preceding revision",
        ),
        `expected the previousRevisionId refinement on its own path, got ${JSON.stringify(issues)}`,
      );
      return true;
    },
  );
});

test("lineage schema: a previousRevisionId naming a DIFFERENT revision parses", () => {
  const parsed = Criterion.parse({
    ...EXACT_CRITERION,
    title: "t",
    previousRevisionId: "uatr1:00000000000000ab",
  });
  assert.equal(parsed.previousRevisionId, "uatr1:00000000000000ab");
});

test("duplicate identity: two items sharing one criterion-id are refused, naming the story", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **First** _(witness: machine)_: one.\n2. **Second** _(witness: machine)_: two.\n",
  );
  const collided = authored.replace(
    "uatc_000000000000000000000002",
    "uatc_000000000000000000000001",
  );
  assert.throws(
    () => parseCriteria(STORY, collided),
    new RegExp(`${STORY}: duplicate criterion-id uatc_000000000000000000000001`),
  );
});

// ── identity annotations are counted, not merely found ─────────────────────
//
// Each identity tag must appear EXACTLY once. Zero is an unstamped item and two
// is an ambiguous one; both are refused at the boundary rather than resolved by
// taking the first match, because either silently picks an identity for the
// author.

test("identity tags: an item with NO criterion-id is refused, naming the tag and the count", () => {
  assert.throws(
    () => parseCriteria(STORY, "## UAT Test Criteria\n\n1. **Unstamped** _(witness: machine)_: no identity.\n"),
    /criterion-id: expected exactly one \(criterion-id: \.\.\.\) annotation, found 0/,
  );
});

test("identity tags: an item carrying TWO criterion-ids is refused, naming the count", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Doubled** _(witness: machine)_: body.\n",
  );
  const doubled = authored.replace(
    "(criterion-id: uatc_000000000000000000000001)",
    "(criterion-id: uatc_000000000000000000000001)(criterion-id: uatc_000000000000000000000002)",
  );
  assert.throws(
    () => parseCriteria(STORY, doubled),
    /criterion-id: expected exactly one \(criterion-id: \.\.\.\) annotation, found 2/,
  );
});

test("identity tags: a missing revision-id is refused under the revision-id label, not criterion-id", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **No revision** _(witness: machine)_: body.\n",
  );
  const stripped = authored.replace(/\(revision-id: [^)]*\)/, "");
  assert.throws(
    () => parseCriteria(STORY, stripped),
    /revision-id: expected exactly one \(revision-id: \.\.\.\) annotation, found 0/,
  );
});

test("identity tags: surrounding whitespace inside a tag is trimmed, not carried into the id", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Padded** _(witness: machine)_: body.\n",
  );
  const padded = authored.replace(
    "(criterion-id: uatc_000000000000000000000001)",
    "(criterion-id:   uatc_000000000000000000000001   )",
  );
  const criteria = parseCriteria(STORY, padded);
  assert.equal(criteria[0]!.criterionId, "uatc_000000000000000000000001");
});

test("identity tags: a tag written with NO space after the colon still parses", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Tight** _(witness: machine)_: body.\n",
  );
  const tight = authored.replace("(criterion-id: uatc_", "(criterion-id:uatc_");
  const criteria = parseCriteria(STORY, tight);
  assert.equal(criteria[0]!.criterionId, "uatc_000000000000000000000001");
});

test("witness/tier tags parse with no space after the colon", () => {
  const body = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Tight tags** _(witness:model)(tier:frontier)_: body.\n",
  );
  const criteria = parseCriteria(STORY, body);
  assert.equal(criteria[0]!.witness, "model");
  assert.equal(criteria[0]!.tier, "frontier");
});

test("invalid witness: the refusal quotes the offending value and lists the allowed set", () => {
  const body = authoredCriteria("## UAT Test Criteria\n\n1. **Bad** (witness: nobody): oops.\n");
  assert.throws(() => parseCriteria(STORY, body), (err: unknown) => {
    assert.match((err as Error).message, /invalid witness "nobody"/);
    assert.match((err as Error).message, /must be one of machine\|model\|human\|either/);
    return true;
  });
});

test("invalid tier: the refusal quotes the offending value and lists the allowed set", () => {
  const body = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Bad tier** _(witness: model)(tier: basic)_: oops.\n",
  );
  assert.throws(() => parseCriteria(STORY, body), (err: unknown) => {
    assert.match((err as Error).message, /invalid tier "basic"/);
    assert.match((err as Error).message, /must be one of advanced\|frontier/);
    return true;
  });
});

test("tier schema: the missing-tier refusal sits on the tier path and forbids an ambiguous minimum", () => {
  assert.throws(
    () => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "model" }),
    (err: unknown) => {
      const { issues } = err as { issues: { path: (string | number)[]; message: string }[] };
      assert.ok(
        issues.some(
          (i) =>
            i.path.join(".") === "tier" &&
            i.message ===
              "a model witness must declare a preclassified minimum tier (advanced|frontier) — an ambiguous minimum is forbidden",
        ),
        `expected the tier refinement on the tier path, got ${JSON.stringify(issues)}`,
      );
      return true;
    },
  );
});

test("tier schema: the tier-on-non-model refusal sits on the tier path with its own message", () => {
  assert.throws(
    () => Criterion.parse({ ...EXACT_CRITERION, title: "t", witness: "machine", tier: "advanced" }),
    (err: unknown) => {
      const { issues } = err as { issues: { path: (string | number)[]; message: string }[] };
      assert.ok(
        issues.some(
          (i) => i.path.join(".") === "tier" && i.message === "tier is exclusive to the model witness",
        ),
        `expected the exclusivity refinement on the tier path, got ${JSON.stringify(issues)}`,
      );
      return true;
    },
  );
});

// ── canonical content: what a revision id actually binds ───────────────────
//
// `canonicalCriterionContent` decides what a revision id BINDS. Everything it
// strips is something an author may change WITHOUT invalidating a signed green;
// everything it keeps is something that MUST invalidate one. Each assertion
// below is one of those two claims, and the last is the one that stops the
// canonicaliser from degenerating into "everything is equal".

test("canonical content: the leading ordinal is stripped, so renumbering never moves the hash", () => {
  const first = canonicalCriterionContent("1. **Same** _(witness: machine)_: body.");
  assert.equal(first, canonicalCriterionContent("7. **Same** _(witness: machine)_: body."));
  assert.ok(!first.startsWith("1."), "the ordinal is gone, not merely equal between two items");
});

test("canonical content: a MULTI-DIGIT ordinal is stripped too", () => {
  assert.equal(canonicalCriterionContent("12. **Same** body."), canonicalCriterionContent("3. **Same** body."));
});

test("canonical content: identity metadata is excluded — id and revision history are not content", () => {
  const bare = canonicalCriterionContent("1. **Item** body.");
  for (const tag of [
    "(criterion-id: uatc_000000000000000000000001)",
    "(revision-id: uatr1:0000000000000001)",
    "(previous-revision-id: uatr1:0000000000000002)",
    "(lineage: whatever)",
  ]) {
    assert.equal(canonicalCriterionContent(`1. **Item** ${tag} body.`), bare, `${tag} must be excluded`);
  }
});

test("canonical content: CRLF and lone CR normalise to LF, so a line-ending change never moves the hash", () => {
  const lf = canonicalCriterionContent("1. **Item** body.\nsecond line.");
  assert.equal(canonicalCriterionContent("1. **Item** body.\r\nsecond line."), lf);
  assert.equal(canonicalCriterionContent("1. **Item** body.\rsecond line."), lf);
});

test("canonical content: interior whitespace runs collapse and each line is trimmed", () => {
  assert.equal(
    canonicalCriterionContent("1. **Item**   spaced\t\tout.\n   indented line   "),
    canonicalCriterionContent("1. **Item** spaced out.\nindented line"),
  );
});

test("canonical content: three or more consecutive newlines collapse to exactly one blank line", () => {
  assert.equal(canonicalCriterionContent("1. **Item** a.\n\n\n\n\nb."), "**Item** a.\n\nb.");
});

test("canonical content: leading and trailing blank space around the whole item is trimmed", () => {
  assert.equal(
    canonicalCriterionContent("1. **Item** body.\n\n  "),
    canonicalCriterionContent("1. **Item** body."),
  );
});

test("canonical content: a PROSE change DOES move the canonical form — the binding still binds", () => {
  assert.notEqual(
    canonicalCriterionContent("1. **Item** body."),
    canonicalCriterionContent("1. **Item** different body."),
  );
});

// ── the section boundary and item splitting ────────────────────────────────
//
// The parser reads ONE section of a story body. Both of its edges matter: it
// must not start early (a `##` that is not a UAT heading, or one mid-line), and
// it must not run past the next `## ` into a neighbouring section's prose.

test("section: parsing stops at the NEXT `## ` heading — a later section's items are not criteria", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **Inside** _(witness: machine)_: counted.\n");
  const criteria = parseCriteria(STORY, `${authored}\n## Reliability Gates\n\n1. **Outside**: not counted.\n`);
  assert.equal(criteria.length, 1, "an item under a later heading must not be read as a criterion");
  assert.equal(criteria[0]!.title, "Inside");
});

test("section: with no following heading, the section runs to the end of the body", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **First** _(witness: machine)_: one.\n2. **Second** _(witness: machine)_: two.\n",
  );
  assert.equal(parseCriteria(STORY, authored).length, 2);
});

test("section: the `Story UAT` spelling opens a section too", () => {
  const authored = authoredCriteria("## Story UAT\n\n1. **Alternate heading** _(witness: machine)_: counted.\n");
  assert.equal(parseCriteria(STORY, authored).length, 1);
});

test("section: a heading must start its own line — an inline `## UAT Test Criteria` opens nothing", () => {
  assert.deepEqual(parseCriteria(STORY, "prose ## UAT Test Criteria\n\n1. **Not a criterion**: ignored.\n"), []);
});

test("section: `##UAT Test Criteria` with no space after the hashes is not a heading", () => {
  assert.deepEqual(parseCriteria(STORY, "##UAT Test Criteria\n\n1. **Not a criterion**: ignored.\n"), []);
});

test("items: a numbered item's continuation lines belong to it, and are part of its content", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Wrapped** _(witness: machine)_: first line.\n   a continuation line.\n",
  );
  const criteria = parseCriteria(STORY, authored);
  assert.equal(criteria.length, 1, "a continuation line must not become a second criterion");
  const withoutTail = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Wrapped** _(witness: machine)_: first line.\n",
  );
  assert.notEqual(
    criteria[0]!.revisionId,
    parseCriteria(STORY, withoutTail)[0]!.revisionId,
    "the continuation is CONTENT — dropping it must move the binding",
  );
});

test("items: prose before the first numbered item is not swept into any criterion", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\nAn introductory paragraph.\n\n1. **First** _(witness: machine)_: one.\n",
  );
  const criteria = parseCriteria(STORY, authored);
  assert.equal(criteria.length, 1);
  assert.equal(criteria[0]!.title, "First");
});

test("items: a MULTI-DIGIT ordinal opens an item", () => {
  const body = "## UAT Test Criteria\n\n10. **Tenth** _(witness: machine)_: counted.\n";
  assert.equal(parseCriteria(STORY, authoredCriteria(body)).length, 1);
});

test("items: a digit-dot with no following space is not an item", () => {
  assert.deepEqual(parseCriteria(STORY, "## UAT Test Criteria\n\n1.**Squashed**: not an item.\n"), []);
});

// ── the one-line title ─────────────────────────────────────────────────────

test("title: the bold lead is the title, and its trailing colon is stripped", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **The bold lead:** _(witness: machine)_ trailing prose.\n");
  assert.equal(parseCriteria(STORY, authored)[0]!.title, "The bold lead");
});

test("title: the bold lead is taken NON-greedily — a second bold run is not swallowed", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **First** and **second** _(witness: machine)_: body.\n");
  assert.equal(parseCriteria(STORY, authored)[0]!.title, "First");
});

test("title: with no bold lead, the first line is the title, ordinal stripped and trimmed", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1.    A plain first line _(witness: machine)_\n");
  const title = parseCriteria(STORY, authored)[0]!.title;
  assert.ok(!title.startsWith("1."), `the ordinal must be stripped, got ${JSON.stringify(title)}`);
  assert.equal(title, title.trim(), "the title is trimmed");
  assert.match(title, /^A plain first line/);
});

test("title: only the FIRST line is the title — a continuation line never joins it", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Titled** _(witness: machine)_: first line.\n   a continuation line.\n",
  );
  assert.equal(parseCriteria(STORY, authored)[0]!.title, "Titled");
});

// ── the grammar's anchors, spacing and greediness ──────────────────────────
//
// Every assertion below pins one character of a regular expression that the
// parser's correctness rests on: an anchor that stops a pattern matching
// mid-line, a `*` that lets an annotation be written tightly, or a lazy
// quantifier that stops a title swallowing the rest of its line. They are
// deliberately written as BEHAVIOUR ("this body parses to that criterion"),
// never as assertions about the pattern text.

test("heading: more than one space after `##` still opens the section", () => {
  const authored = authoredCriteria("##   UAT Test Criteria\n\n1. **Spaced heading** _(witness: machine)_: counted.\n");
  assert.equal(parseCriteria(STORY, authored).length, 1);
});

test("section: an inline `## ` inside a criterion's prose does NOT end the section", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **First** _(witness: machine)_: prose mentioning a ## marker inline.\n2. **Second** _(witness: machine)_: still inside the section.\n",
  );
  const criteria = parseCriteria(STORY, authored);
  assert.equal(criteria.length, 2, "only a `## ` at the START of a line closes the section");
  assert.equal(criteria[1]!.title, "Second");
});

test("items: a continuation line containing `1. ` mid-line does NOT open a new item", () => {
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Wrapped** _(witness: machine)_: first line.\n   as described in 1. the preamble.\n",
  );
  const criteria = parseCriteria(STORY, authored);
  assert.equal(criteria.length, 1, "only a line STARTING with an ordinal opens an item");
});

test("title: a bold run that is not at the START of the line is not the title", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. plain lead with **bold** later _(witness: machine)_\n");
  const title = parseCriteria(STORY, authored)[0]!.title;
  assert.notEqual(title, "bold", "a mid-line bold run must not be mistaken for the bold LEAD");
  assert.match(title, /^plain lead with/);
});

test("title: the bold lead's trailing whitespace is trimmed after the colon strip", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **Padded title :** _(witness: machine)_ body.\n");
  assert.equal(parseCriteria(STORY, authored)[0]!.title, "Padded title");
});

test("title: only a TRAILING colon is stripped — an interior colon is part of the title", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **Given: when then** _(witness: machine)_: body.\n");
  assert.equal(parseCriteria(STORY, authored)[0]!.title, "Given: when then");
});

test("title: a first line with trailing whitespace yields a trimmed title", () => {
  // NO bold lead, so the title is the whole first line and the trim on it is what is under test.
  // The blanks are appended AFTER stamping and at the very END of the line:
  // `canonicalCriterionContent` trims every line, so they cannot move the revision binding — which
  // is what makes them a clean probe of whether the TITLE is trimmed.
  // A SECOND item follows deliberately: `criteriaSection` trims the section as a whole, so blanks
  // on the LAST line are stripped before `itemTitle` ever sees them and would prove nothing.
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. a plain lead _(witness: machine)_\n2. **Second** _(witness: machine)_: body.\n",
  );
  const padded = authored.replace(")\n", ")   \n");
  assert.notEqual(padded, authored, "the fixture must actually carry trailing blanks");
  const title = parseCriteria(STORY, padded)[0]!.title;
  assert.equal(title, title.trimEnd(), `the title must be trimmed, got ${JSON.stringify(title)}`);
  assert.match(title, /^a plain lead/);
});

test("title: a MULTI-DIGIT ordinal is stripped from a title that has no bold lead", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n10. a plain tenth item _(witness: machine)_\n");
  const title = parseCriteria(STORY, authored)[0]!.title;
  assert.ok(!title.startsWith("10."), `a two-digit ordinal must be stripped, got ${JSON.stringify(title)}`);
  assert.match(title, /^a plain tenth item/);
});

test("identity tags: a revision-id written tightly, and one written padded, both parse", () => {
  const authored = authoredCriteria("## UAT Test Criteria\n\n1. **Revision spacing** _(witness: machine)_: body.\n");
  const revision = /\(revision-id:\s*([^)]*)\)/.exec(authored)![1]!.trim();
  for (const spelling of [`(revision-id:${revision})`, `(revision-id:   ${revision}   )`]) {
    const rewritten = authored.replace(/\(revision-id:[^)]*\)/, spelling);
    assert.equal(
      parseCriteria(STORY, rewritten)[0]!.revisionId,
      revision,
      `${spelling} must parse to the same revision`,
    );
  }
});

test("identity tags: a previous-revision-id written tightly, and one written padded, both parse", () => {
  const previous = "uatr1:00000000000000ab";
  for (const spelling of [`(previous-revision-id:${previous})`, `(previous-revision-id:   ${previous}   )`]) {
    const authored = authoredCriteria(
      `## UAT Test Criteria\n\n1. **Lineage spacing** _(witness: machine)_ _${spelling}_: body.\n`,
    );
    assert.equal(
      parseCriteria(STORY, authored)[0]!.previousRevisionId,
      previous,
      `${spelling} must parse to the same predecessor`,
    );
  }
});

test("items: a multi-line item followed by a SECOND item keeps its continuation line", () => {
  // The two pushes in `splitItems` are different code paths: this one closes an item
  // because a NEW item started, where the single-item fixtures close it at end-of-input.
  const authored = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Wrapped first** _(witness: machine)_: first line.\n   a continuation line.\n2. **Plain second** _(witness: machine)_: body.\n",
  );
  const criteria = parseCriteria(STORY, authored);
  assert.equal(criteria.length, 2);
  const alone = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Wrapped first** _(witness: machine)_: first line.\n2. **Plain second** _(witness: machine)_: body.\n",
  );
  assert.notEqual(
    criteria[0]!.revisionId,
    parseCriteria(STORY, alone)[0]!.revisionId,
    "the continuation line is CONTENT of the first item, and joined with a newline",
  );
});

test("canonical content: only a LEADING ordinal is stripped — one inside the prose survives", () => {
  const canonical = canonicalCriterionContent("**No ordinal here** see step 2. and stop.");
  assert.match(canonical, /2\. and stop\./, "an interior ordinal is prose, not position");
});

test("canonical content: a stripped identity tag leaves a separator, never fusing its neighbours", () => {
  const fused = canonicalCriterionContent("1. **Item**(criterion-id: uatc_000000000000000000000001)body.");
  assert.equal(fused, "**Item** body.", "the excluded tag must not weld `**Item**` onto `body.`");
});

// ── the fixture generator and the parser must agree ────────────────────────
//
// `authoredCriteria` decides where an item ENDS in order to hash it; `parseCriteria` decides the
// same thing independently in order to check that hash. The two are separate implementations of
// one rule, so a disagreement between them is not cosmetic — it shows up as a criterion whose
// revision-id does not bind its content, which is a REFUSAL. That makes a single successful parse
// of a body exercising every boundary the strongest available statement that they still agree.

test("fixture stamping: the generator agrees with the parser about where an item ends", () => {
  const authored = authoredCriteria(
    [
      "## UAT Test Criteria",
      "",
      "1. **First** _(witness: machine)_: opening line.",
      "   a continuation line that mentions a ## marker inline.",
      "2. **Second** _(witness: model)(tier: frontier)_: body.",
      "",
      "## Reliability Gates",
      "",
      "1. **Not a criterion** — this lives under a later heading.",
      "",
    ].join("\n"),
  );

  // If the generator hashed a different span than the parser reads — because it ran an item past
  // the `## Reliability Gates` heading, stopped it at the inline `##` marker, or swallowed the
  // following item — the revision-ids would not bind and this call would THROW.
  const criteria = parseCriteria(STORY, authored);

  assert.equal(criteria.length, 2, "exactly the two items under the UAT heading are criteria");
  assert.deepEqual(
    criteria.map((c) => c.title),
    ["First", "Second"],
  );
  assert.equal(criteria[1]!.tier, "frontier", "the second item's annotations survive the boundary");
});

test("fixture stamping: an item's continuation line is inside the span the generator hashes", () => {
  const withTail = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Only** _(witness: machine)_: opening line.\n   a continuation line.\n2. **Next** _(witness: machine)_: body.\n",
  );
  const withoutTail = authoredCriteria(
    "## UAT Test Criteria\n\n1. **Only** _(witness: machine)_: opening line.\n2. **Next** _(witness: machine)_: body.\n",
  );
  assert.notEqual(
    parseCriteria(STORY, withTail)[0]!.revisionId,
    parseCriteria(STORY, withoutTail)[0]!.revisionId,
    "dropping a continuation line must move the binding — it is content, not decoration",
  );
});
