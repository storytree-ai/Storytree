// detail-normal-texture.test.ts — the two recipe numbers pinned to their lines, and the texture's
// sampling state proved without a browser.
//
// ⚠ HOW A `TextureLoader` RUNS HERE AT ALL. `three`'s `ImageLoader` creates its `<img>` through
// `document.createElementNS`, and bun has no `document`. The test installs a MINIMAL stub for the
// duration of the call — an element that records the `src` it was given and accepts listeners —
// which is enough for the loader's synchronous half to run, and it is that half the module owns:
// the URL it hands the browser and the sampling state it sets on the returned texture. The
// asynchronous decode is the browser's, and the delivered-pixel guard on a real GPU is where it
// is proved.

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
  RepeatWrapping,
  Texture,
} from 'three';

import { DETAIL_NORMAL_PNG_BASE64 } from './detail-normal.js';
import {
  DETAIL_STRENGTH_RECIPE,
  DETAIL_TILE_UNITS,
  HEADLESS_DETAIL_NAME,
  detailNormalTexture,
} from './detail-normal-texture.js';

/** The recipe, sliced to one enclosing function — the discipline `land-sand.test.ts` follows,
 *  because `mat_procedural()` is a REJECTED decoy above `mat_attribute()` with near-identical
 *  node names. */
function recipeFunction(name: string): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const script = readFileSync(
    join(here, '..', '..', '..', 'docs', 'research', 'chapter2-land-idiom-2026-08-27', 'build_land.py'),
    'utf8',
  );
  const start = script.indexOf(`def ${name}(`);
  assert.ok(start > 0, `${name}() is missing from build_land.py`);
  if (name === 'mat_attribute') {
    const decoy = script.indexOf('def mat_procedural(');
    assert.ok(decoy > 0 && decoy < start, 'the decoy is expected to sit ABOVE mat_attribute()');
  }
  return script.slice(start, script.indexOf('\ndef ', start + 1));
}

test('the tile is 6.0 / 2.5 = 2.4 ground units — the UV divisor over the Mapping scale', () => {
  // Both halves of the derivation are pinned to the script, in their own functions: the Mapping
  // scale in mat_attribute() and the plane's UV divisor in build_land_grid(). Reading 2.5 as the
  // tile would be the off-by-a-UV-scale trap the module header names.
  const material = recipeFunction('mat_attribute');
  assert.ok(
    material.includes('mp.inputs["Scale"].default_value = (2.5, 2.5, 2.5)'),
    'mat_attribute() no longer scales the detail UV by 2.5',
  );
  assert.ok(
    material.includes('detail.image = _kit_image("Pine_Cliff_Normal.tga")'),
    'mat_attribute() no longer reads the cliff normal map as the detail layer',
  );
  const grid = recipeFunction('build_land_grid');
  assert.ok(grid.includes('uv[:, 0] = verts[loop_v, 0] / 6.0'), 'the plane UV is no longer x / 6.0');
  assert.ok(grid.includes('uv[:, 1] = verts[loop_v, 1] / 6.0'), 'the plane UV is no longer y / 6.0');
  assert.equal(DETAIL_TILE_UNITS, 6.0 / 2.5);
  assert.equal(DETAIL_TILE_UNITS, 2.4);
});

test('the recipe strength is 0.30, pinned to the NormalMap node and its stated limit', () => {
  const material = recipeFunction('mat_attribute');
  assert.ok(
    material.includes('nm.inputs["Strength"].default_value = 0.30 if grain_on else 0.0'),
    'mat_attribute() no longer holds the NormalMap strength at 0.30',
  );
  // The limit the recipe measured is what makes the strength a LADDER rung rather than a value:
  // the number that produced whorls is named beside the number that did not.
  assert.ok(material.includes('at strength 0.55'), 'the recipe no longer names the 0.55 limit');
  assert.equal(DETAIL_STRENGTH_RECIPE, 0.3);
});

/** A stand-in for the one DOM call `ImageLoader` makes, recording what it was asked to load. */
interface StubImage {
  tag: string;
  src: string | undefined;
  addEventListener: () => void;
  removeEventListener: () => void;
}

/** What a stubbed call yields: the module's own return value, and every element the loader made. */
interface StubbedLoad<T> {
  result: T;
  created: StubImage[];
}

function withDocumentStub<T>(run: () => T): StubbedLoad<T> {
  const created: StubImage[] = [];
  const stub = {
    createElementNS(_ns: string, tag: string): StubImage {
      const el: StubImage = {
        tag,
        src: undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      };
      created.push(el);
      return el;
    },
  };
  const g = globalThis as { document?: unknown };
  assert.equal(g.document, undefined, 'this test expects to run without a DOM');
  g.document = stub;
  try {
    return { result: run(), created };
  } finally {
    delete g.document;
  }
}

test('the texture is loaded from the embedded PNG as a data: URL, and nothing is fetched', () => {
  const { result, created } = withDocumentStub(() => detailNormalTexture());
  assert.ok(result instanceof Texture, 'detailNormalTexture() did not return a three Texture');
  assert.equal(created.length, 1, 'the loader created more than one image element');
  assert.equal(created[0]!.tag, 'img');
  assert.equal(
    created[0]!.src,
    'data:image/png;base64,' + DETAIL_NORMAL_PNG_BASE64,
    'the loader was handed something other than the embedded PNG as a data: URL',
  );
});

test('the texture repeats, is linear data, and is mipmapped with trilinear minification', () => {
  const { result: tex } = withDocumentStub(() => detailNormalTexture());
  assert.equal(tex.wrapS, RepeatWrapping, 'wrapS');
  assert.equal(tex.wrapT, RepeatWrapping, 'wrapT');
  assert.equal(tex.colorSpace, NoColorSpace, 'a normal map is data, not colour');
  assert.equal(tex.generateMipmaps, true);
  assert.equal(tex.minFilter, LinearMipmapLinearFilter);
  assert.equal(tex.magFilter, LinearFilter);
});

test('each call returns a fresh texture — two materials never share one GPU upload state', () => {
  const a = withDocumentStub(() => detailNormalTexture()).result;
  const b = withDocumentStub(() => detailNormalTexture()).result;
  assert.notEqual(a, b);
  assert.notEqual(a.uuid, b.uuid);
});

// ---------------------------------------------------------------- headless callers

test('with no document the texture is an image-less, NAMED Texture with the same flags', () => {
  // bun has no `document` (that is why the tests above stub one). The frame-cost and comparison
  // pages build the SHIPPED scene under node to read its plan; there the material still binds a
  // Texture, and the name is what keeps a headless-built frame from passing as the map.
  assert.equal(typeof document, 'undefined', 'this test relies on bun having no document');
  const tex = detailNormalTexture();
  assert.equal(tex.name, HEADLESS_DETAIL_NAME);
  assert.equal(tex.wrapS, RepeatWrapping);
  assert.equal(tex.wrapT, RepeatWrapping);
  assert.equal(tex.colorSpace, NoColorSpace);
  assert.equal(tex.generateMipmaps, true);
  assert.equal(tex.minFilter, LinearMipmapLinearFilter);
  assert.equal(tex.magFilter, LinearFilter);
  // And a browser-built one is NOT so named — the stubbed path above decodes the data: URL.
  const { result: decoded } = withDocumentStub(() => detailNormalTexture());
  assert.notEqual(decoded.name, HEADLESS_DETAIL_NAME);
});
