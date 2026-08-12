---
status: accepted
decided: 2026-08-12
---
# ADR-0352: a --set edit writes only the fields it names

## Status

accepted (2026-08-12) — decided/directed by the owner in conversation on 2026-08-12. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

## Context

Two sessions editing one live Library artifact silently overwrite each other, and **both report
success**. `library artifact edit --set` is a read-modify-write with no precondition on what it read:
`editArtifact` calls `getDoc`, spreads the whole doc, applies the named fields, and `upsertDoc`s the
WHOLE doc back (`packages/cli/src/commands.ts`). Everything a sibling landed between that read and
that write is reverted — including fields this edit never mentioned.

**This is measured, not theoretical.** From `events.library_event` on `session-orchestrator`, the
`workflow` field over fifteen minutes on 2026-08-11:

| seq | time (UTC) | `workflow` chars | actor | |
|---|---|---|---|---|
| 6643 | 08:41 | 16,791 | `agent-a95c…` | stable |
| 6763 | 14:34 | **9,733** | `agent-f86fa1` | **−7,058** |
| 6764 | 14:38 | 18,488 | `epic-euler-4fbaa3` | +8,755 — recovered by hand |
| 6765 | 14:39 | **16,820** | `agent-f86fa1` | **−1,668** |
| 6770 | 14:49 | 18,490 | `epic-euler-4fbaa3` | +1,670 — recovered again |

Four writes, two sessions, two losses, two manual recoveries. `agent-f86fa1` was working the Codex
parity arc; its own edits were to `outcome`/`provenance`. It never intended to touch `workflow` at
all — it simply carried a stale copy of it. **The collisions are CROSS-FIELD**, which is what makes
this fixable without a general concurrency-control scheme.

Incidence, measured across 21 days (cross-actor shrinking writes ≥400 chars within 120 min of the
prior version, schema migrations excluded): **5 clobbers across 5 artifacts**, in two incidents —
2026-08-02 (four agent artifacts wiped in one 23-minute window) and the 2026-08-11 one above. That 5
is a conservative floor: the single largest loss (−7,058) has a ~6-hour read-to-write gap and falls
outside the window filter. Rare, severe, and concentrated on the highest-traffic artifacts — the
agent guidance tier, whose projections are `CLAUDE.md` and `AGENTS.md`.

**Two forces make it worse than its rate suggests.** First, nothing detects it: `check:guidance` and
`check:agents` compare the generated views against whatever the store CURRENTLY holds, never against
what the author meant to write, so a clobbered edit regenerates and gates **green**. Second, the
downstream symptom was misdiagnosed as a second bug. A regeneration during the window above emitted
a structurally valid but truncated `CLAUDE.md`, deleting three floor rules (workflow step 7's
escalation rule, ADR-0303's blocked-mid-unit landing rule, and "never self-exempt from the gate").
That was recorded as the generator reading a half-written field — **it cannot be**: `upsertDoc`
writes the whole doc as one jsonb value inside one transaction, so a torn read is impossible. The
generator was honest; it faithfully projected a store state the lost update had already corrupted.
There is one defect here, not two.

## Decision

**A `--set` edit writes only the fields it names.** The seam gains one verb:

```
patchDoc({ id, fields, actor?, kind?, validate? }) -> StoredDoc | null
```

`fields` are merged onto whatever the store currently holds, **inside the write itself**, so a key
this patch does not name survives a concurrent edit to it. `PgLibraryStore` reads the row under
`SELECT … FOR UPDATE` inside the transaction, so a second patcher blocks on the row lock and then
merges onto the result of the write it waited for — never onto a stale snapshot. `patchDoc` never
creates: an absent id returns `null`.

The write boundary is unchanged. `validate` runs on the MERGED doc, still inside the write, and what
it RETURNS is persisted — mirroring `upsertDoc`'s persist-the-upcast-output rule, so a patch cannot
skip migrate-on-write. The CLI passes `upcastAndValidate` so it can still render a friendly refusal.

`--json` / `--file` keep the whole-doc `upsertDoc` path, deliberately: a wholesale replace genuinely
IS a replace, and last-write-wins is the honest semantics for one.

**Rejected: a shrink-guard on the generator** — refusing `build:guidance` / `build:agents` when the
regenerated section is materially shorter than the committed one. It was the cheapest option (~1
hour, no seam change) and it would have caught both incidents. The owner rejected it on the grounds
that **it taxes legitimate curation**: shortening a guidance section is normal, wanted work, and a
guard that makes the honest case argue with a tripwire trains sessions to pass the override flag by
reflex — at which point it detects nothing and has cost something. Do not re-propose it as a
standalone remedy. It stays available as a diagnostic if a cause OTHER than the lost update is ever
evidenced.

**Deferred, not rejected: compare-and-set on `upsertDoc`.** `StoredDoc.updatedAt` already carries the
row's machine-managed `updated_at` (bumped by `now()` on every update — distinct from the author-set
`doc.updatedAt` prose), so an `expectedUpdatedAt` precondition needs no migration and no new token.
It is the theoretically complete fix and it covers the case this ADR does not: two sessions editing
the SAME field. The log shows zero instances of that, and the cost is real — it touches
`storage-protocol`, the root the whole graph rests on, plus three store implementations, the parity
suite, and ~12 read-modify-write call sites. **Revisit on evidence of a same-field collision**, which
`events.library_event` can answer directly; do not build it speculatively.

## Consequences

- The measured failure class is closed. All five recorded clobbers were cross-field; every one of
  them would have been prevented, because neither writer named the other's field.
- Concurrent editors of one artifact now SERIALIZE on the row lock rather than racing. Held only
  across a shallow merge plus a zod validate, so the wait is microseconds — but `validate` must stay
  pure and fast, and the seam's doc says so, because anything slow there blocks every other writer
  of that doc.
- **The seam is one verb wider.** `Store` was narrow on purpose (ADR-0017), and this is the first
  addition since. It is justified as the honest primitive its callers already needed: every
  read-modify-write caller was hand-rolling a merge that could not be atomic from outside the store.
- **A closure cannot cross the wire**, so `HttpStore.patchDoc` refuses a `validate` callback loudly
  rather than dropping it — dropping it would let a remote patch skip migrate-on-write. This splits
  the parity suite: `storeParitySuite` keeps the contracts all three backends can meet, and a new
  `localStoreParitySuite` carries the `validate` contracts only an in-process store can. That is a
  real, if small, loss of uniformity in the parity claim, taken knowingly.
- **Same-field concurrent edits are still last-write-wins.** This ADR narrows the blast radius to
  genuine overlap; it does not eliminate it. A session that means to rewrite a field a sibling is
  also rewriting still needs the reconcile-forward discipline.
- The clobber remains **undetectable after the fact** by any gate — that half is unaddressed and
  deliberately so. `events.library_event` is the instrument; the queries that produced this ADR's
  Context are the way to ask.
- Both open friction items —`concurrent-library-artifact-edits-clobber-with-no-detection` and
  `regen-mid-edit-truncates-guidance-silently` — are ONE item and are discharged by this decision.
- **`patchDoc` ships with real parity tests but NO declared contract on `event-sourced-store-seam`,
  and that is deliberate.** `check:coverage` scans only a capability's registered `real.testFile`
  (`connection.test.ts` here, the ADR-0098 gate-5 arm), never `store-parity.ts` where these tests
  live — which is why all nine existing contracts already sit in the drain backlog despite five
  citing REAL passing tests. Declaring two more would have taken the corpus backlog from 119 to 121
  and RED the ceiling, for behaviour that IS proven; naming them in `connection.test.ts` to satisfy
  the scanner would be a fake drain. The capability's spec records this in place. The real remedy is
  repointing that binding, which touches a signed `real:` arm and belongs to its own unit.

## References

- `packages/storage-protocol/src/store.ts` — the `Store` seam, `PatchDocInput`, `mergeFields`, `InMemoryStore.patchDoc`
- `packages/library/src/store/pg-store.ts` — `PgLibraryStore.patchDoc` (the `FOR UPDATE` transaction)
- `packages/cli/src/commands.ts` — `editArtifact`'s field-scoped `--set` path
- `packages/storage-protocol/src/store-parity.ts` — the shared contracts + `localStoreParitySuite`
- ADR-0017 — history = events, current = projection; the narrow seam this widens by one verb
- ADR-0259 D5 — the store door's write routes stay 403; `patchDoc` is wired but equally gated
- ADR-0110 — design-time alignment is ratification (why this ADR is born accepted)
- ADR-0139 — correct-in-place vs supersede-and-replace
