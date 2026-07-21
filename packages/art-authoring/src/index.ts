// The art-authoring organism (ADR-0225) — the author-time, vendor-swappable generative-3D
// blocking-substrate adapter.
//
//   adapter          the vendor-swappable `(prompt, concept image) -> maquette` seam:
//                    register N backends, fan one request, author-select exactly one
//   fixture-backend  the offline, deterministic backend (no network, no credential)
//   reauthor         the governing hand-off: a re-authored checkable vector asset is run
//                    through the REAL @storytree/procedural-architecture factory checker
//
// AUTHOR-TIME ONLY: never imported by the deterministic build, the runtime, or the browser
// bundle. Carries node/network deps (the live backend), so it is NOT a foundational port.

export * from './adapter.js';
export * from './fixture-backend.js';
export * from './backends/nvidia-trellis.js';
export * from './reauthor.js';
