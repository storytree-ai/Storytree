# Verification evidence — `decision-log-readers-arc-inc-01`, 2026-08-22

Visual proof that decisions render again in the studio after the `adr` scope was routed to the
artifact store. Captured with Playwright (`@playwright/test`, already an `apps/studio`
devDependency) against a dev server on the **live Cloud SQL store**, run from the branch worktree.

**Provenance is asserted, not assumed.** Each run reads `GET /api/health` first and refuses to
continue unless `code.head` equals the branch HEAD — the studio dev server is easy to point at the
main checkout or at a sibling session's server on a neighbouring port, and either would make the
whole capture a photograph of somebody else's tree. Both runs recorded:

    served code.head = f43f32ab291801cc4ccf74d35a2f9b52bd9dd328 (stale=false), store=pg

Raw run output is in `verify-run-1.txt` / `verify-run-2.txt`.

## `story-panel-decisions.png` — a story panel's deciding decisions

The `desktop` story, which declares 15. **15 rows, 15 resolved as links, 0 unresolved**, each with
its real title and an `ACCEPTED` status chip, linked `#/asset/adr-NNNN`.

Before this change every one of those 15 read **"(no doc found)"** — the lookup was built from
`docs.filter(d => d.group === 'Decisions')` and PR #1546 left that filter matching nothing.

## `library-shelf-active.png` — the Library category shelf

Under the `active` lifecycle state: **one** `Decisions` row reading **365**, which is exactly the
count of `accepted` decisions on the wire (365 of 412; `proposed` 10, `superseded` 37 fill the
`open` and `archived` states). Before, `buildCategoryShelf` pushed a second `category: 'adr'` entry
counted from the docs walker — 0 after PR #1546 — beside the real one, two rows sharing one React
key at `LibraryFinder.tsx`'s `key={entry.category}`.

Entering that row now lists decisions: **10 rows under `open`, every id `adr-NNNN`, none a
reference document** (run 1). Before, the `'adr'` scope was special-cased to list `docs` and
answered with the 113 surviving REFERENCE documents relabelled as decisions.

## `library-loadbearing-card.png` — the selection card, load-bearing badge

`ADR-0002`, showing kind `ADR`, status `ACCEPTED`, and the **`LOAD-BEARING`** badge.

This badge had no producer at all between PR #1546 and this change: it was read off
`DocMeta.loadBearing`, folded in by the deleted half of the docs walker, so the lookup was
always `undefined` and the badge was structurally unreachable — with every assertion in
`LibrarySelectionCard.test.tsx` green, because the fixture built the deleted shape itself. The
ADR-0086 tag crosses from the store row now (`renderStoredDoc` → `toGuidanceAsset`), present only
when `true`: **125 of 412** on the live wire, and zero explicit `false`.
