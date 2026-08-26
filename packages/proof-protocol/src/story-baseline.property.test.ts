/**
 * PROPERTY LEG for the story-baseline content binding (arc `test-strength-beyond-red-green-arc`
 * increment 4, realising ADR-0447 D3).
 *
 * ⚠ THIS FILE IS BEYOND THIS INCREMENT'S NAMED TARGET, AND THAT IS THE POINT. The increment named
 * `attestations.ts` and `proof.ts` — the two files increment 1 measured and increment 2 left out of
 * scope. `story-baseline.ts` was not in increment 1's table because it did not exist yet
 * (ADR-0416 D6 landed after the baseline was taken). It turned up at 73.68% only because the WHOLE
 * survivor list was read rather than its headline, which is increment 2's explicit lesson: increment
 * 1 had `criterion-binding.ts`'s full list in hand and missed a real hole by writing up the top of
 * it. Skipping this file would have repeated that exact mistake one increment later.
 *
 * WHAT IT CLOSES — three MEASURED survivors, each verified by hand before this file was written,
 * and each a defect in a CONTENT BINDING rather than in a message:
 *
 *  1. REGEX ANCHORS. Both `^` and `$` can be stripped from `/^sbl1:[0-9a-f]{16}$/` with the package
 *     green. This is the identical shape increment 2 closed on `CriterionId`/`CriterionRevisionId`,
 *     recurring in a newer file — a validator whose job is rejecting malformed opaque identities,
 *     with no test that feeds it one carrying valid content embedded in junk.
 *
 *  2. THE PADDING. `hash.toString(16).padStart(16, "0")` -> `padStart(16, "")` survives. One hash in
 *     sixteen has a leading zero nibble and renders as fewer than 16 hex digits, so without the pad
 *     the fingerprint is the wrong length and `StoryBaselineFingerprint.parse` THROWS. No test ever
 *     supplied a set that hashes short. `["cap-0"]` is such a set — found by hand and PROMOTED
 *     below as a permanent example (ADR-0447 D3's third non-negotiable), so this case no longer
 *     depends on the generator rediscovering it.
 *
 *  3. THE CANONICAL SEPARATOR. `sortedUnique(ids).join("\n")` -> `join("")` survives, and it is the
 *     sharpest of the three. With an empty separator, `["ab", "c"]` and `["a", "bc"]` both
 *     canonicalise to `abc` and bind to the SAME fingerprint. A baseline fingerprint that collides
 *     across different declared sets cannot answer "has the set moved?", which is the one question
 *     ADR-0416 D6 built it to answer — expansion beyond the baseline would silently read as none.
 *
 * INSTRUMENT CHOICE, PER HOLE (baseline §9's "a property is not always the right instrument"):
 * the anchors and the padding are properties, because both contracts are stated over ALL inputs and
 * there is no interesting single example. The COLLISION is an EXAMPLE, because the failure is a
 * specific structural coincidence — two adjacent ids whose concatenation matches a different split
 * — and a generator drawing arbitrary strings would essentially never produce that pair. The
 * distinctness property beside it covers the general half but would NOT have caught this alone.
 *
 * SEED PINNED (ADR-0447 D3). A red here is a counterexample to promote into a permanent example
 * and a bug to fix — never a seed to re-roll.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fc from "fast-check";

import { StoryBaselineFingerprint, storyBaselineFingerprint } from "./index.js";

/** Pinned for reproducibility — see the file header. Changing this is a decision, not a fix. */
const SEED = 20260826;

/** `fc.hexaString` was removed in fast-check v4; a constantFrom unit is the current spelling. */
const HEX_DIGIT = fc.constantFrom(..."0123456789abcdef".split(""));
const hexOfLength = (n: number) => fc.string({ minLength: n, maxLength: n, unit: HEX_DIGIT });

/**
 * The anchor half, in the shape `criterion-binding.property.test.ts` established: an anchored
 * pattern accepts its exact form and REJECTS every decoration of it. `prefix`/`suffix` are
 * unconstrained, so the empty pair exercises the accept case and every other draw a reject case.
 * Drop `^` and a non-empty prefix starts passing; drop `$` and a non-empty suffix does.
 */
test("StoryBaselineFingerprint accepts only the exactly-anchored sbl1 form, and rejects every decoration", () => {
  fc.assert(
    fc.property(hexOfLength(16), fc.string(), fc.string(), (hex, prefix, suffix) => {
      const exact = prefix === "" && suffix === "";
      assert.equal(
        StoryBaselineFingerprint.safeParse(`${prefix}sbl1:${hex}${suffix}`).success,
        exact,
        `expected ${exact ? "accept" : "reject"} for prefix=${JSON.stringify(prefix)} suffix=${JSON.stringify(suffix)}`,
      );
    }),
    { seed: SEED, numRuns: 1000 },
  );
});

/**
 * The LENGTH half the anchor property does not reach: `{16}` is exact, so a body of any other
 * length is rejected however well-formed its characters are. Widening it to `{15,}` or `{1,16}`
 * dies here and nowhere else.
 */
test("StoryBaselineFingerprint rejects a body of any length but its exact sixteen", () => {
  fc.assert(
    fc.property(
      fc
        .integer({ min: 0, max: 32 })
        .filter((n) => n !== 16)
        .chain((n) => hexOfLength(n)),
      (hex) => {
        assert.equal(StoryBaselineFingerprint.safeParse(`sbl1:${hex}`).success, false);
      },
    ),
    { seed: SEED, numRuns: 300 },
  );
});

/**
 * THE PADDING, over all inputs. The constructor parses its own output, so a fingerprint that comes
 * out the wrong width does not return a malformed value — it THROWS. Roughly one draw in sixteen
 * hashes to a leading zero nibble, so an unpadded implementation fails within a few dozen runs.
 */
test("storyBaselineFingerprint always returns the exact sbl1 shape, whatever the hash renders as", () => {
  fc.assert(
    fc.property(fc.array(fc.string()), fc.array(fc.string()), (caps, obligations) => {
      const id = storyBaselineFingerprint(caps, obligations);
      assert.equal(
        StoryBaselineFingerprint.safeParse(id).success,
        true,
        `${id} must be well-formed`,
      );
      assert.equal(
        storyBaselineFingerprint(caps, obligations),
        id,
        "the same declared sets must bind to the same fingerprint",
      );
    }),
    { seed: SEED, numRuns: 500 },
  );
});

/**
 * THE PROMOTED COUNTEREXAMPLE (ADR-0447 D3). `["cap-0"]` hashes to fifteen hex digits, so it is
 * exactly the input an unpadded `padStart` mishandles. Kept as a permanent example so this case is
 * pinned by name rather than left for the generator to rediscover on some future seed.
 */
test("storyBaselineFingerprint pads a short hash rather than emitting a narrow id", () => {
  const id = storyBaselineFingerprint(["cap-0"], []);
  assert.equal(id.length, "sbl1:".length + 16, `${id} must carry exactly sixteen hex digits`);
  assert.equal(StoryBaselineFingerprint.safeParse(id).success, true);
});

/**
 * THE COLLISION, as an example. Both lists sort to themselves, so with an EMPTY separator both
 * canonicalise to `abc` and the two genuinely different capability sets bind identically. This is
 * the assertion that kills `join("") `; the distinctness property below would not have found it,
 * because arbitrary generated strings essentially never line up this way.
 */
test("adjacent capability ids cannot be re-split into a different set with the same fingerprint", () => {
  assert.notEqual(
    storyBaselineFingerprint(["ab", "c"], []),
    storyBaselineFingerprint(["a", "bc"], []),
    "a separator-less canonicalisation would bind these two different sets to one fingerprint",
  );
});

/**
 * The general distinctness half: different declared scopes bind to different fingerprints. A broken
 * mixer collides immediately, so this is what would catch the binding degenerating wholesale.
 * Collision risk is negligible at 64 bits and the seed is pinned in any case.
 */
test("storyBaselineFingerprint binds DISTINCT declared scopes to distinct fingerprints", () => {
  const canonical = (caps: string[], obligations: string[]) =>
    JSON.stringify([[...new Set(caps)].sort(), [...new Set(obligations)].sort()]);

  fc.assert(
    fc.property(
      fc.array(fc.string()),
      fc.array(fc.string()),
      fc.array(fc.string()),
      fc.array(fc.string()),
      (capsA, oblA, capsB, oblB) => {
        // Only meaningful for scopes that genuinely differ AFTER sorting and de-duplication —
        // order and duplicates are deliberately NOT part of the identity (see story-baseline.test.ts).
        fc.pre(canonical(capsA, oblA) !== canonical(capsB, oblB));
        assert.notEqual(
          storyBaselineFingerprint(capsA, oblA),
          storyBaselineFingerprint(capsB, oblB),
          `distinct scopes collided: ${canonical(capsA, oblA)} vs ${canonical(capsB, oblB)}`,
        );
      },
    ),
    { seed: SEED, numRuns: 500 },
  );
});
