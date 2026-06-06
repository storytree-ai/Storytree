# No proof preservation

**Rule:** never soften, tiptoe around, or refuse a correct edit in order to keep a status or verdict that was expensive to earn. If an edit is correct, ship it and let the status regress. The system re-verifies on demand; an edit that degrades status is a feature, not a bug.

## Why this matters

Some units carry a status that cost real work — a story reached `healthy`, a capability passed its integration tests, an ADR settled a decision. The temptation when editing is to dance around fields so the existing `healthy` is not disturbed. That is proof preservation, and it is banned.

A proof-preserving edit leaves you with two falsehoods, not one: the artifact is still wrong *and* the verdict now attests to text that was deliberately softened to avoid invalidating it. The verdict is no longer trustworthy.

This follows directly from the **prove-it-gate** and the **proof-hash** mechanism in the glossary: a unit reaches `healthy` only via earned, on-disk evidence, and a change to proof-bearing content invalidates the prior verdict by design. The honest path is to make the correct edit, accept that the unit drops to `building` (or computes as `unhealthy`), and let the next proof run promote it again — or not, if the edit genuinely broke something real.

## What to do

- Make the correct edit. Do not phrase it to dodge a proof-hash change.
- Expect and accept the status regression. A `healthy` story that you correctly amend reverts to `building` — that is the system asking for a re-proof because the proof-bearing content changed.
- Let the proof mode re-run (contract test, integration test, UAT, or operator attestation as the tier requires).

Verdicts are cheap to re-issue; that is the whole point of binding status to on-disk evidence rather than to a hand-edited flag. Tiptoeing is how incorrect content survives.

This is the inverse stance to a hand-edit that fakes `healthy`: there a unit claims proof it did not earn; here a unit clings to proof its new content no longer supports. Both break the same contract — status must track the evidence, not the other way round.
