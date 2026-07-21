// reauthor.ts — the re-author hand-off (ADR-0225 / ADR-0219 decision 2).
//
// A selected maquette proceeds ONLY as a re-authored checkable vector asset. The
// re-authoring is a HUMAN act: an author builds a @storytree/procedural-architecture
// BuildingModel BY HAND against the maquette, in the parametric part-tree DSL. There is
// deliberately NO auto-trace of the maquette into geometry ("vector soup", ADR-0217 D2)
// and NO inlining — the maquette is a reference, the re-authored vector is the asset.
//
// This module is the GOVERNING seam: it routes the re-authored asset to the REAL factory
// checker (stations 1-3, `check` / `assertSound`). A produced block earns nothing until
// the re-authored asset the author built against it passes that checker.

import { check, assertSound } from '@storytree/procedural-architecture';
import type { BuildingModel, Violation } from '@storytree/procedural-architecture';

/**
 * A re-authored checkable vector asset — the committed source of truth. It carries the
 * hand-authored `model` plus, for provenance only, the `meshRef` of the maquette it was
 * authored against. The maquette itself is NEVER embedded — `authoredAgainst` is a
 * reference string, so the throw-away / no-inline invariant holds by construction.
 */
export interface ReauthoredAsset {
  /** the checkable vector the author built by hand — what the build and the map see. */
  readonly model: BuildingModel;
  /** provenance: the `meshRef` of the maquette this was authored against (a reference
   *  string only; the maquette is not embedded). Optional. */
  readonly authoredAgainst?: string;
}

/** Govern a re-authored asset with the REAL factory checker. Empty array = sound. */
export function governReauthored(asset: ReauthoredAsset): Violation[] {
  return check(asset.model);
}

/** Whether the re-authored asset is structurally sound (the checker finds no violations). */
export function isSound(asset: ReauthoredAsset): boolean {
  return governReauthored(asset).length === 0;
}

/** Fail-closed author-time guard — throw (listing every violation) if the re-authored
 *  asset is unsound. The point where a produced block is refused entry until it is honest. */
export function assertReauthoredSound(asset: ReauthoredAsset): void {
  assertSound(asset.model);
}
