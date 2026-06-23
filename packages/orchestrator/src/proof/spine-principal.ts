/**
 * ADR-0097 (brownfield go-green is a proving process): the named SPINE PRINCIPAL — the machine
 * identity that SIGNS an `adopted` verdict.
 *
 * An `adopted` verdict records a MACHINE observation: the spine ran a declared command and watched it
 * exit green out-of-band at a clean committed HEAD. *"Did it work?"* is a machine fact, so the verdict
 * is attributed to the machine that witnessed it — NEVER the human who pressed Adopt. That human's
 * decision (*"do we bring it in?"*) is recorded separately as the verdict's `approvedBy`. Attributing
 * the signature to the clicker would be false witness provenance (ADR-0097 d.4).
 *
 * Owner-confirmed name (2026-06-23): email-shaped, so it sits naturally alongside human git-email
 * signers in the verdict log while clearly reading as a machine, not a person.
 */
export const SPINE_PRINCIPAL = "spine@storytree";
