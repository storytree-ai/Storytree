// The studio keeps its OWN copy of the Library's kind set, and until this file nothing bound the two.
//
// That gap is a landed defect with a name: `friction-studio-kind-blind` (2026-07-06) — the studio UI
// and its write allowlist had no `friction` category, so friction artifacts rendered nowhere and a
// friction write answered `400 invalid category`, while `pnpm gate` stayed green throughout. It was
// routed `nothing` because that increment wired the six surfaces by hand, which fixed the INSTANCE
// and left the duplication; it then recurred verbatim for the next kind added (`resteer`, ADR-0515,
// 2026-09-05) and was reinforced on the same item.
//
// WHY THE COMPILER DOES NOT CATCH IT. `ASSET_CATEGORY_GLOSS` is `satisfies Record<AssetCategory,
// string>`, so adding a union member does force a gloss. Its two neighbours — the `ASSET_CATEGORIES`
// array here, and the write allowlist in `server/apiRouter.ts` — are PLAIN ARRAYS that no totality
// check reaches. The symptom is invisibility rather than an error, which is why it survives a green
// gate twice.
//
// This file is the bridge. It is deliberately a TEST rather than a type-level fence: `KnowledgeKind`
// is a zod-derived union in another package, and the studio's category set is legitimately WIDER (see
// STUDIO_ONLY below), so the honest relation is containment plus a named allowlist — a statement about
// two sets, which reads far better as an assertion than as conditional types.

import { describe, it, expect } from 'vitest';
import { KIND_SPECS } from '@storytree/library';

import { ASSET_CATEGORIES, ASSET_CATEGORY_GLOSS, type AssetCategory } from './types';

/**
 * Studio categories that are deliberately NOT Library kinds. Every member needs a reason, because
 * this allowlist is the one place a genuine omission could hide as an intentional extra.
 */
const STUDIO_ONLY = {
  // Retired by ADR-0298 — deferred work is an `increment` now. The category is kept so historical
  // rows still render rather than falling through to an unknown-category branch.
  proposal: 'retired kind (ADR-0298); kept so historical rows still render',
  // `template-*` units are store rows the Library renders, never a `KnowledgeKind`.
  template: 'a store row the Library renders; never a KnowledgeKind',
  // `satisfies`, not a `Readonly<Record<string, string>>` annotation: the annotation is an open
  // dictionary that discards the two keys this literal just wrote (anti-slop `no-known-value-widening`),
  // and those keys are the whole point — the lookup below must be able to miss.
} satisfies Readonly<Record<string, string>>;

/** The same table as a `Map`, so an arbitrary category string can be looked up without an assertion. */
const studioOnly: ReadonlyMap<string, string> = new Map(Object.entries(STUDIO_ONLY));

/** The schema's own kind set — `KIND_SPECS` is keyed by `KnowledgeKind` and is total over it. */
const LIBRARY_KINDS: readonly string[] = Object.keys(KIND_SPECS);

describe('studio kind parity with the Library schema', () => {
  it('every Library kind has a studio category — the friction-studio-kind-blind fence', () => {
    const missing = LIBRARY_KINDS.filter((kind) => !ASSET_CATEGORIES.includes(kind as AssetCategory));
    expect(
      missing,
      `these Library kinds have no studio category, so their rows render nowhere: ${missing.join(', ')}. ` +
        'Add each to the AssetCategory union, the ASSET_CATEGORIES array, ASSET_CATEGORY_GLOSS, and the ' +
        'write allowlist in server/apiRouter.ts.',
    ).toEqual([]);
  });

  it('every studio category is either a Library kind or a declared studio-only extra', () => {
    const unexplained = ASSET_CATEGORIES.filter(
      (category) => !LIBRARY_KINDS.includes(category) && studioOnly.get(category) === undefined,
    );
    // The other direction, and it is not symmetric decoration: a category left here after its kind is
    // retired keeps promising a surface that no longer has rows. `proposal` is exactly that case,
    // which is why it is ALLOWLISTED WITH ITS REASON rather than silently tolerated.
    expect(
      unexplained,
      `these studio categories match no Library kind and are not declared in STUDIO_ONLY: ${unexplained.join(', ')}`,
    ).toEqual([]);
  });

  it('every studio category carries a gloss, and the array and the gloss agree', () => {
    // `ASSET_CATEGORY_GLOSS` is `satisfies Record<AssetCategory, string>`, so the compiler already
    // binds it to the UNION. What nothing binds is the ARRAY to the union — an omission there is the
    // exact shape that bit twice — so this compares the two runtime values directly.
    expect([...ASSET_CATEGORIES].sort()).toEqual(Object.keys(ASSET_CATEGORY_GLOSS).sort());
  });

  it('the fence is not vacuous: a kind absent from the array is reported', () => {
    // The negative control. Without it, an ASSET_CATEGORIES that had drifted to `[]` — or a
    // LIBRARY_KINDS that read empty because the import moved — would pass every assertion above with
    // an empty difference. This proves the comparison can actually fail.
    // `readonly string[]`, not the narrowed literal union: `.filter(c => c !== 'friction')` narrows
    // the ELEMENT type too, so the very kind this control removes would stop being expressible.
    const pruned: readonly string[] = ASSET_CATEGORIES.filter((c) => c !== 'friction');
    const missing = LIBRARY_KINDS.filter((kind) => !pruned.includes(kind));
    expect(missing).toEqual(['friction']);
    // And that the sets being compared are non-empty in the first place.
    expect(LIBRARY_KINDS.length).toBeGreaterThan(10);
    expect(ASSET_CATEGORIES.length).toBeGreaterThan(10);
  });
});
