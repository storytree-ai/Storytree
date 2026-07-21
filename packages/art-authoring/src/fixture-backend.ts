// fixture-backend.ts — a deterministic OFFLINE backend (no network, no credential).
//
// The network + owner-provided credential are exactly where a stub belongs: this fixture
// lets the vendor-swappable seam, the fan-out, the author-selection, and the re-author
// hand-off all be proven offline, with the capability's green never depending on the
// credential (ADR-0225; the live NVIDIA backend is a separately-provable, credential-gated
// contract). A fixture is also the offline stand-in for the live backend's interface
// conformance.

import type { BlockRequest, GenerativeBackend, Maquette } from './adapter.js';

/**
 * A fixture backend that returns a canned, deterministic maquette handle for any request.
 * Same id + same prompt ⇒ same `meshRef`, so tests are reproducible.
 */
export function fixtureBackend(id: string): GenerativeBackend {
  return {
    id,
    generate(req: BlockRequest): Promise<Maquette> {
      return Promise.resolve({
        backend: id,
        prompt: req.prompt,
        meshFormat: 'glb',
        meshRef: `fixture://${id}/${encodeURIComponent(req.prompt)}.glb`,
        meta: { fixture: 'true' },
      });
    },
  };
}
