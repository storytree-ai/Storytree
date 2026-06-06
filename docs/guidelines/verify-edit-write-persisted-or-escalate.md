# Verify an edit persisted, or escalate

**Rule:** for every contract-bearing edit or write — one whose persistence your deliverable depends on — read the file back after the call and confirm the intended content is present before proceeding. If it did not persist, record a structured assumption-violation in your return before applying any workaround. A silent fallback that hides the failure is the banned anti-pattern.

## Why this matters

An edit/write tool can return a success code without the content actually landing on disk (filesystem interception, sandbox quirks, path-normalisation edge cases). The in-the-wild reaction is to silently fall back to a shell heredoc and carry on. That hides the failure: the orchestrator never learns the original tool misbehaved, the escalation pathway is forfeit, and the symptom recurs unnamed in the next session. The fix is cheap defensive verification at the authoring layer — one extra read per contract-bearing write turns a silent symptom into a structured signal the orchestrator already knows how to consume.

## What counts as contract-bearing

Any edit/write whose persistence your return summary implicitly claims. The discriminator: *would my return summary lie if this file were not actually on disk?* If yes, it is contract-bearing — source files, test scaffolds, evidence rows, schema changes, spec amendments. Throwaway scratch you read back within the same step and discard is out of scope; the cost of read-after-write on every byte is not the point.

## The discipline

1. Issue the edit or write. Note the path and the intended content.
2. Immediately read the file at that path.
3. Verify the read reflects the intent — for an edit, the old text is replaced by the new; for a write, the bytes match.
4. If it passes, proceed.
5. If it fails (unchanged, absent, truncated, still pre-call content):
   - **Do not** silently fall back to a shell heredoc. The silent version is what this rule forbids.
   - Record an assumption-violation in your return: `{ briefed: "<intended write to path>", observed: "read after the call returned <summary>; file did not reflect the change", severity: "high" }`. The orchestrator parses this field programmatically; an unrecorded failure is invisible upstream.
   - **Only after** that record exists, the heredoc fallback is permitted as a recovery move. The contract this rule pins is the *visibility* of the failure, not the success of the recovery.

## What this rule does not do

It does not diagnose or fix the underlying tool. If a session reproduces the symptom with a transcript showing a success return on a path that stays empty, capture the transcript and file it upstream. Until the root cause is fixed, this read-after-write step is the cheapest catch.

Composes with [implementer-shortcut-patterns](implementer-shortcut-patterns.md) and [test-fixtures-mirror-production-failure-modes](test-fixtures-mirror-production-failure-modes.md): the same falsifiability discipline — verify the observable, do not trust the success flag — applied to the persistence of a write rather than to a test result.
