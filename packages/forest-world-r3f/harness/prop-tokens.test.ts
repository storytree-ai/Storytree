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
  SHADE_KEYS,
  SHADE_KEY_FLOOR,
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
import {
  SHADOW_LADDER,
  deliveredColour,
  landPaletteWithShadow,
  shadowRamp,
} from './shadow-ladder.js';

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

test('an UNKEYED prop material is still (authored token x authored level) — nothing is free-shaded', () => {
  for (const [name, token] of Object.entries(PROP_TOKENS)) {
    if (SHADE_KEYS[token]) continue; // the keyed ones are the next test's subject
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

test('a SHADE-KEYED material is a mix of exactly TWO authored colours — still not free-shaded', () => {
  const keyed = Object.entries(PROP_TOKENS).filter(([, t]) => SHADE_KEYS[t]);
  // A guard rather than a formality: if the keys are ever emptied, every assertion below would
  // pass vacuously over an empty list and this file would go green having checked nothing.
  assert.ok(keyed.length >= 3, 'no shade-keyed tokens to check');
  for (const [name, token] of keyed) {
    const base = parseHex(token);
    const key = parseHex(SHADE_KEYS[token]!);
    const ramp = shadowRamp(token);
    assert.equal(ramp.length, SHADOW_LADDER.length, `${name} does not wear the whole ladder`);
    ramp.forEach((c, i) => {
      const level = SHADOW_LADDER[i]!;
      const f = Math.min(1, Math.max(0, (level - SHADE_KEY_FLOOR) / (1 - SHADE_KEY_FLOOR)));
      // The delivered colour is a lerp between TWO AUTHORED COLOURS at an AUTHORED level. The
      // property ADR-0380 D6 fence 3 carries is that the delivered set is enumerable and
      // authored, not that it is computed by multiplying — so this is the same fence, spelled
      // differently, and `landPalette` still closes over it entry for entry.
      assert.deepEqual(
        c,
        {
          r: Math.min(255, Math.max(0, Math.round(key.r + (base.r - key.r) * f))),
          g: Math.min(255, Math.max(0, Math.round(key.g + (base.g - key.g) * f))),
          b: Math.min(255, Math.max(0, Math.round(key.b + (base.b - key.b) * f))),
        },
        `${name} at level ${level} is not its key mixed toward its token`,
      );
    });
    // MONOTONE IN LUMINANCE, which a mix does not guarantee on its own: a key brighter than its
    // token would deliver a "shadow" lighter than the lit face, and the island would read as a
    // rendering fault rather than as a colour choice.
    const lumas = ramp.map((c) => 0.3 * c.r + 0.59 * c.g + 0.11 * c.b);
    for (let i = 1; i < lumas.length; i++) {
      assert.ok(lumas[i]! > lumas[i - 1]!, `${name} ramp is not monotone at rung ${i}`);
    }
  }
});

test('THE POINT OF A SHADE KEY: the shaded rung ROTATES rather than only darkening', () => {
  // The measurement this mechanism exists to reproduce — ISLANDERS' own trees, read off the lit
  // and shaded deciles of each tree's own pixels: a shaded face rotates 22 to 61 degrees of hue
  // on the green trees while dropping to about 0.6 of its value. A pure multiply CANNOT rotate
  // at all, because scaling R, G and B by one scalar leaves the hue exactly where it was. So
  // this assertion is the difference between the new lever and the old one, stated as a number.
  for (const name of ['canopy', 'canopyDark'] as const) {
    const ramp = shadowRamp(PROP_TOKENS[name]);
    const lit = ramp[ramp.length - 1]!;
    const shade = ramp[0]!;
    const dh = hueDelta(hueOf(lit), hueOf(shade));
    assert.ok(dh >= 20, `${name} rotates only ${dh.toFixed(1)} degrees into shade`);
    const ratio = valueOf(shade) / valueOf(lit);
    assert.ok(ratio > 0.5 && ratio < 0.8, `${name} shade is ${ratio.toFixed(2)}x its lit value`);
  }

  // ⚠ AND THE ROW THAT IS EASIEST TO GET BACKWARDS. The reference's ONE warm tree rotates by
  // -11 degrees and STAYS WARM. Pointing it at the greens' cool key mixed a saturated orange
  // through grey and delivered a muddy brown at S29 against the token's S72 — measured, and
  // corrected. So the warm canopy is asserted to HOLD its hue and its chroma, not to rotate.
  const rust = shadowRamp(PROP_TOKENS.canopyRust);
  const rl = rust[rust.length - 1]!;
  const rs = rust[0]!;
  assert.ok(
    Math.abs(hueDelta(hueOf(rl), hueOf(rs))) < 12,
    'the warm canopy rotated into shade — its key is on the wrong side of the wheel',
  );
  assert.ok(satOf(rs) > 0.5, `the warm canopy shade went muddy at S${(satOf(rs) * 100) | 0}`);
});

test('SHADE KEYS ARE OPT-IN — every pre-canopy token delivers exactly what it did before', () => {
  // The regression guard on the whole mechanism. Routing `deliveredColour` through the mix
  // touched the ONE function every palette entry on this island goes through, so the cheapest
  // way for this change to have gone wrong is silently, somewhere else.
  for (const token of landTokens()) {
    if (SHADE_KEYS[token]) continue;
    const base = parseHex(token);
    for (const level of SHADOW_LADDER) {
      assert.deepEqual(deliveredColour(token, level), {
        r: Math.min(255, Math.round(base.r * level)),
        g: Math.min(255, Math.round(base.g * level)),
        b: Math.min(255, Math.round(base.b * level)),
      });
    }
  }
  // And no STATUS family may ever be keyed: a rotated shadowed ground would change what the
  // land's colour asserts, and ADR-0392 D5 / ADR-0398 D7 put that beyond an art call. The
  // question is priced in `docs/research/chapter2-islanders-canopy-2026-08-22/`, not decided.
  for (const fam of Object.values(STATUS_TOKENS)) {
    for (const t of [...fam.top, fam.wheat, fam.side]) {
      assert.equal(SHADE_KEYS[t], undefined, `${t} is a status token and must not be shade-keyed`);
    }
  }
});

/** HSV hue in degrees, for the rotation assertions above. */
function hueOf(c: { r: number; g: number; b: number }): number {
  const mx = Math.max(c.r, c.g, c.b);
  const mn = Math.min(c.r, c.g, c.b);
  const d = mx - mn;
  if (d === 0) return 0;
  let h: number;
  if (mx === c.r) h = ((((c.g - c.b) / d) % 6) + 6) % 6;
  else if (mx === c.g) h = (c.b - c.r) / d + 2;
  else h = (c.r - c.g) / d + 4;
  return h * 60;
}

/** Signed shortest rotation from `a` to `b`, so 350 -> 10 reads as +20 rather than -340. */
function hueDelta(a: number, b: number): number {
  let d = b - a;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  return d;
}

function valueOf(c: { r: number; g: number; b: number }): number {
  return Math.max(c.r, c.g, c.b);
}

function satOf(c: { r: number; g: number; b: number }): number {
  const mx = valueOf(c);
  return mx === 0 ? 0 : (mx - Math.min(c.r, c.g, c.b)) / mx;
}

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
