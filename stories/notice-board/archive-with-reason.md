---
id: "archive-with-reason"
tier: capability
story: notice-board
title: "Wrong posts are archived with a reason, never deleted"
outcome: "A wrong post is archived by a reasoned event that preserves history and removes it from the live surface."
status: proposed
proof_mode: integration-test
depends_on: []
---

# Wrong posts are archived with a reason, never deleted

**Outcome —** A wrong post is archived by a reasoned event that preserves history and removes it
from the live surface.

> **Proof status (honest) — `proposed`, greenfield.** Would-be tests only. Design floor from
> ADR-0032 §4 (carrying ADR-0014's one surviving piece unchanged): wrong posts are **archived with
> a reason** — correction is additive (an event), never destructive (no delete; the post's cites/links
> stay in the log).

## Guidance

The notice board's error path, shaped like the Library's own retire mechanism (`deleteDoc`
appends a `deleted` event and drops the projection — ADR-0027 §4 used exactly this): being wrong
is recorded, not erased.

- **Shape:** `{ postId, archivedBy, reason, at }` — attributable via the fail-closed signer
  chain; `reason` is required prose (the lesson-shaped part: WHY it was wrong outlives the post).
- **Additive only:** the post's events — including its cites/links — remain in the log untouched. The
  *projection* marks the post archived; live-surface reads exclude it, and a future `signal-synthesis`
  agent ignores archived signal.
- **Reversible by the same mechanism:** un-archiving, if ever needed, is another reasoned event,
  not an edit of the archival.

## Integration test (would-be)

**Goal —** Against a real store, archival is one reasoned event: the post leaves the live
surface, its history (and cites) remain fully readable, and nothing was deleted.

Seed a post with two cites; archive it with a reason; assert the projection excludes it, the
event log still holds post + cites + archival in order, a reason-less archival is refused, and
the raw cite events are bit-identical to before the archival.

## Contracts (3)

1. **`archival-requires-reason`** — a reason-less or unattributable archival is refused
   - **asserts —** archiving with empty `reason` or no resolvable signer throws; the post stays
     live.
   - **proven by —** would-be `packages/core/src/archive.test.ts`
2. **`archival-is-additive`** — archival appends; it never deletes or mutates history
   - **asserts —** after archival the post's prior events (incl. cites) are unchanged in the log;
     the archival event carries who/when/reason.
   - **proven by —** would-be `packages/store/src/archive-store.test.ts`
3. **`archived-leaves-projection`** — an archived post leaves the live read surface
   - **asserts —** projection/list reads exclude the archived post while a history read still
     returns it.
   - **proven by —** would-be `packages/store/src/archive-store.test.ts`
