// prop-tokens.test.ts — THE FENCE ON THE PROP MATERIALS (ADR-0406 D3/D4).
//
// ADR-0406 unfenced props, materials and colour on the harness island, on the ground that the
// island represents nothing and so has no state a decoration can misreport. That licence comes
// with two obligations, and this file is where both are checked rather than asserted in prose.
//
// D3 — THE PALETTE STAYS CLOSED. A prop material is added by AUTHORING ITS TOKEN, so that every
// delivered pixel is still an authored `(token x level)` closure entry. The test that matters is
// that the closure GREW rather than moved: the pre-prop palette must survive entry for entry.
//
// D4 — A PROP TOKEN NEVER DELIVERS A STATUS COLOUR. This is the load-bearing one. A paving slab
// that delivered `healthy` green would be an ornament indistinguishable from a status read, and
// the island is judged by a human who carries what he learns to the map — so even on a surface
// that asserts nothing, the two vocabularies must not overlap. It is checked on the SHADOW
// LADDER as well as the lit one, because the occlusion rung is a fifth multiplier and a
// collision that only appeared under a contact pool would be invisible until an island happened
// to shade the right slab.
//
// ⚠ WHY THIS CANNOT BE LEFT TO `capture.mjs`. That harness's own foreign-status count is a
// CLOSURE instrument: it asks whether a delivered colour is in the palette and, if it is not
// family-less, which family it belongs to. Prop tokens are declared family-less, so the harness
// subtracts them BEFORE asking — which is correct (otherwise every paving pixel reads as a
// defect) and is exactly why the harness can never notice a prop token that collides with a
// status colour. The instrument is doing its job; this is the different question.

import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MARKER_TOKENS,
  PROP_TOKENS,
  SHARED_TOKENS,
  STATUS_TOKENS,
  TREE_TOKENS,
  familylessTokens,
  landPalette,
  landTokens,
  paletteImageOfToken,
  parseHex,
  toHex,
} from './palette-band.js';
import { SHADOW_LADDER, landPaletteWithShadow, shadowRamp } from './shadow-ladder.js';

/** Every delivered colour a STATUS-BEARING token can put on the island, on the full ladder
 *  including the occlusion rung, mapped back to what produced it so a failure names the
 *  collision rather than merely reporting one. The wheat override and the story tree's bole are
 *  excluded for the same reason `statusFamilyOf` excludes them: a token every family carries
 *  discriminates none, so a prop matching it asserts nothing. */
function statusDeliveredColours(): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    const tree = TREE_TOKENS[st];
    const tokens = [...fam.top, fam.side, ...(tree ? [tree.crown] : [])];
    for (const token of tokens) {
      for (const c of shadowRamp(token)) out.set(toHex(c), `${st} (${token})`);
    }
  }
  return out;
}

test('D4: no prop material can ever deliver a colour a status family delivers', () => {
  const status = statusDeliveredColours();
  const collisions: string[] = [];
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    for (const c of shadowRamp(token)) {
      const hit = status.get(toHex(c));
      if (hit) collisions.push(`PROP_TOKENS.${name} (${token}) delivers ${toHex(c)}, which is ${hit}`);
    }
  }
  assert.deepEqual(
    collisions,
    [],
    'A prop material that delivers a status colour makes an ornament indistinguishable from a ' +
      'status read (ADR-0406 D4). Move the prop token, never the status token.',
  );
});

test('D4: every prop token is declared FAMILY-LESS, so the capture harness does not read it as a defect', () => {
  const familyless = new Set(familylessTokens());
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    assert.ok(
      familyless.has(token),
      `PROP_TOKENS.${name} is not in familylessTokens(); capture.mjs would count every one of ` +
        'its pixels as an unaccounted colour and the run would report a defect that is not one.',
    );
  }
});

test('D3: every prop token is IN the closed palette — a prop cannot deliver an unauthored pixel', () => {
  const tokens = new Set(landTokens());
  const palette = new Set(landPaletteWithShadow());
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    assert.ok(tokens.has(token), `PROP_TOKENS.${name} is missing from landTokens()`);
    for (const c of shadowRamp(token)) {
      assert.ok(
        palette.has(toHex(c)),
        `PROP_TOKENS.${name} delivers ${toHex(c)}, which is not in the closed palette`,
      );
    }
  }
});

test('D3: the palette GREW rather than moved — every pre-prop entry survives', () => {
  // The pre-prop vocabulary, reconstructed from the records the props did not touch. If a prop
  // token had displaced a status entry rather than adding to the set, the closure would be the
  // same SIZE while meaning something different — which is the failure a bare count cannot see.
  const before = new Set<string>();
  for (const st of Object.keys(STATUS_TOKENS)) {
    const fam = STATUS_TOKENS[st]!;
    for (const t of [...fam.top, fam.wheat, fam.side]) {
      for (const c of paletteImageOfToken(t)) before.add(toHex(c));
    }
  }
  for (const st of Object.keys(TREE_TOKENS)) {
    for (const c of paletteImageOfToken(TREE_TOKENS[st]!.crown)) before.add(toHex(c));
  }
  for (const t of [...Object.values(SHARED_TOKENS), ...Object.values(MARKER_TOKENS)]) {
    for (const c of paletteImageOfToken(t)) before.add(toHex(c));
  }
  const after = new Set(landPalette());
  for (const hex of before) assert.ok(after.has(hex), `${hex} lost from the palette`);
  assert.ok(after.size > before.size, 'the prop materials added nothing at all');
});

test('the prop materials are still (authored token x authored level) — nothing is free-shaded', () => {
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    const base = parseHex(token);
    const ramp = shadowRamp(token);
    assert.equal(ramp.length, SHADOW_LADDER.length, `${name} does not wear the whole ladder`);
    ramp.forEach((c, i) => {
      const level = SHADOW_LADDER[i]!;
      // The delivered colour is the token times an AUTHORED level, rounded once in TypeScript —
      // exactly as `bandedColour` specifies and as the GPU then selects rather than recomputes.
      assert.deepEqual(
        c,
        {
          r: Math.min(255, Math.round(base.r * level)),
          g: Math.min(255, Math.round(base.g * level)),
          b: Math.min(255, Math.round(base.b * level)),
        },
        `${name} at level ${level} is not its token times that level`,
      );
    });
  }
});

test('the prop vocabulary is what ADR-0406 D1 licensed — stone, wood, clay, water, and accents', () => {
  // Named rather than counted, because the interesting failure is a token QUIETLY DISAPPEARING
  // when someone tidies the record, which a length assertion would pass right through as long as
  // something else was added the same day.
  for (const required of [
    'stoneLight',
    'stone',
    'stoneDark',
    'paving',
    'gravel',
    'wood',
    'woodLight',
    'terracotta',
    'roofTile',
    'water',
    'waterDeep',
    'sand',
    'lantern',
    'doorway',
    'hedge',
    'blossom',
    'marigold',
    'thatch',
  ]) {
    assert.ok(required in PROP_TOKENS, `PROP_TOKENS.${required} is gone`);
  }
});

test('every prop token is a well-formed authored hex, and they are all distinct', () => {
  const seen = new Map<string, string>();
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    // `parseHex` throws on anything that is not `#rrggbb` — an unparseable authored entry is a
    // corpus error rather than a pixel to guess at.
    parseHex(token);
    const prior = seen.get(token);
    assert.equal(
      prior,
      undefined,
      `PROP_TOKENS.${name} duplicates PROP_TOKENS.${prior} — two names for one material is how a ` +
        'palette silently stops meaning what its vocabulary says it means',
    );
    seen.set(token, name);
  }
});
