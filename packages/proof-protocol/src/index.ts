/**
 * `@storytree/proof-protocol` — the published verdict SHAPE (ADR-0068 §3).
 *
 * The DATA shapes + zod validators that readers validate verdict-DATA against, across the built
 * ADR-0010 §4 boundary. No proof machinery, no signing chain, no store, no `node:` imports —
 * browser-safe, zod is the only runtime dependency. The compute (hashing, drift classification,
 * attestation derivation, signing) stays in the farmer organism (`@storytree/core` / the gate).
 *
 * The `Tier` / `Status` enums are DUPLICATED from core (ADR-0068, locked owner decision) and
 * parity-guarded against core in the tests so they can never silently drift.
 */
export * from "./enums.js";
export * from "./proof.js";
export * from "./anchor.js";
export * from "./attestations.js";
export * from "./work-event.js";
export * from "./usage-event.js";
