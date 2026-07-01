---
id: "review-refresh-feed"
tier: capability
story: library-review
title: "A feed endpoint returns a topic's comments and suggestions for live refresh"
outcome: "The studio API exposes a review-feed for one topic — its block-anchored comments and its suggestions (with statuses) in a single response — so the Review surface refreshes live on the existing 30s visibility-gated poll without a reload; the feed filters to the requested topic and degrades to an empty feed (never a throw) when the store is absent."
status: proposed
proof_mode: integration-test
depends_on: [block-position-comment-anchor, suggestion-edit-store]
# Node-borne proof config (ADR-0057 keystone). NET-NEW (no editsExisting): the leaf authors a NEW
# server handler (e.g. handleReviewFeed in apps/studio/server/reviewFeedApi.ts) + its route
# registration, and a NEW vitest test. The RED is module-not-found: the test imports the
# not-yet-existing handler and drives it over stub comment+suggestion backends — failing at HEAD
# because the handler does not exist (the net-new red, ADR-0057). Exercised at the handler layer over
# stubs (the activityApi / inFlightActivity discipline) so the proof is offline + deterministic.
#
# CRITICAL — apps/studio is VITEST, not node:test → a `real.proofCommand` runs the ONE file under
# vitest (cwd = apps/studio). install: true + a typecheck wall (the handler imports the studio server
# types + the comment/suggestion store surfaces).
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/**/*.test.ts"]
    sourceGlobs: ["apps/studio/server/**/*.ts"]
  real:
    testFile: "apps/studio/server/reviewFeedApi.test.ts"
    sourceFile: "apps/studio/server/reviewFeedApi.ts"
    scope:
      testGlobs: ["apps/studio/server/reviewFeedApi.test.ts"]
      sourceGlobs: ["apps/studio/server/reviewFeedApi.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "server/reviewFeedApi.test.ts"
---

# A feed endpoint returns a topic's comments and suggestions for live refresh

**Outcome —** The studio API exposes a review-feed for one topic — its block-anchored comments and its
suggestions (with statuses) in a single response — so the Review surface refreshes live on the existing
30 s visibility-gated poll without a reload; the feed filters to the requested topic and degrades to an
empty feed (never a throw) when the store is absent.

**Depends on —** [`block-position-comment-anchor`](block-position-comment-anchor.md) (the comments it
returns), [`suggestion-edit-store`](suggestion-edit-store.md) (the suggestions it returns) — the feed
reads both record kinds for a topic.

> **Proof status (honest) — NOT BUILT, `proposed`.** This precedes the code. There is no review-feed
> endpoint today (comments are fetched via `GET /api/comments`; there is no suggestion read). The leaf
> authors a single feed handler that returns both kinds for a topic, proven by an isolated vitest
> handler test over stub backends (the `activityApi` / `inFlightActivity` advisory-read discipline).

## Guidance

WHY THIS IS A CAPABILITY, NOT A CONTRACT: its honest proof is the feed HANDLER as a whole — a
behavioural server handler that, given a topic id, returns that topic's block-anchored comments AND its
suggestions (with statuses) in one response, filters out other topics, and degrades to an empty feed
when the store is absent — spanning the two-source read, the topic filter, and the advisory degradation
over scripted backends, not a single isolated assertion. It is the LIVE-SOURCE half of the no-real-time
model; the client poll that consumes it is the frontend `inline-comment-thread` cap.

WHY A COMBINED FEED (not two polls). The Review surface needs BOTH a topic's comments and its
suggestions to refresh together; returning them in one response keeps the client to ONE poll on the
existing 30 s visibility-gated cadence (`apps/studio/src/lib/presence.ts` `PRESENCE_POLL_MS`) — the
SAME DB-connection cost envelope, no new cost class (the `usePresence` discipline). The alternative —
the client polling `/api/comments` and a separate `/api/suggestions` — is two reads where one suffices;
the combined feed is the slow-growth call.

NO REAL-TIME — LIVE REFRESH ONLY (the model — ADR-0140). A single trusted dev works async: there is no
collaborative cursor / OT / CRDT. The feed is a plain GET the client re-polls; a posted comment /
suggestion appears within the poll window without a reload. The feed does NOT push (no SSE here — the
poll is the mechanism; the chat-SSE pattern is the named alternative but the poll is the chosen one,
matching the existing presence layer).

ADVISORY DEGRADATION (the `activeSessions` / `latestVerdicts` discipline). When the store is absent
(the json backend, or a down DB), the feed returns an EMPTY feed, never a throw — the Review surface
shows no comments/suggestions rather than erroring (the advisory-absence contract the studio's other
live reads already honour). The handler races/guards exactly as `inFlightBuilds` / `activeSessions` do.

OFFLINE-TESTABLE AT THE HANDLER LAYER (over stubs). The test exercises the handler directly over a stub
comment store + a stub suggestion store (scripted lists), no DB, no `node:http` server — `describe/it/expect`
under vitest (environment node). The topic filter + the two-source merge + the empty-on-absent
degradation are all asserted over scripted backends.

## Integration test

**Goal —** Prove that the review-feed handler returns one topic's block-anchored comments AND its
suggestions (with statuses) in a single response, filtered to that topic, and degrades to an empty feed
when the store is absent — entirely over scripted backends, no DB.

The integration test exercises this capability against its **real in-story collaborators** — the
comment + suggestion store surfaces (caps 1 + 2), scripted as stubs. No stubs within the handler's own
merge/filter logic. It would:

1. Script the comment-store stub with two block-anchored comments for topic A and one for topic B, and
   the suggestion-store stub with one `open` + one `accepted` suggestion for topic A. Drive the handler
   for topic A → assert the response carries topic A's TWO comments + TWO suggestions (with their
   statuses) and NONE of topic B's — the topic filter + two-source merge.
2. Assert each returned comment carries its BLOCK anchor (not a text-quote span) and each suggestion
   carries its `status` — the wire shape the frontend consumes.
3. Drive the handler against an ABSENT store (the stub returns null / the json-backend shape) → assert
   an EMPTY feed and NO throw — advisory degradation.
4. (Slow-growth) assert the feed orders / shapes deterministically so the client can diff between polls
   without flicker (the leaf's call on ordering; the contract pins "both kinds, topic-filtered").

## Contracts (3)

The test-proven leaf behaviours — each **one isolated automated test** in the `studio` suite (vitest,
`apps/studio/server/reviewFeedApi.test.ts`), the comment + suggestion stores scripted as stubs. None
exist yet; each is the assertion a contract test WILL prove once authored (re-cite at real `file:line`
when built). Per ADR-0122 each contract id leads a distinctly-named test so `storytree coverage
review-refresh-feed` reports 3/3.

1. **`rrf-returns-comments-and-suggestions-for-a-topic`** — the feed returns both record kinds for one topic
   - **asserts —** for topic A the handler returns A's block-anchored comments AND A's suggestions
     (each with its `status`) in one response; each comment carries a block anchor (not a text-quote
     span) and each suggestion its status — the combined wire shape.
   - **covers —** `apps/studio/server/reviewFeedApi.ts` (the two-source read) *(provisional path)*
2. **`rrf-filters-to-the-requested-topic`** — other topics' records are excluded
   - **asserts —** records for topic B are absent from topic A's feed (and vice-versa) — the feed is
     topic-scoped, not the whole corpus.
   - **covers —** `apps/studio/server/reviewFeedApi.ts` (the topic filter) *(provisional path)*
3. **`rrf-empty-feed-when-store-absent`** — an absent store yields an empty feed, never a throw
   - **asserts —** against an absent/null store backend the handler returns an empty feed and does NOT
     throw — the advisory-absence degradation (the `activeSessions` / `latestVerdicts` contract).
   - **covers —** `apps/studio/server/reviewFeedApi.ts` (the advisory degradation) *(provisional path)*

## Guidance — the net-new slice that earns the signed verdict

The bootstrap rung toward `healthy` (ADR-0057 §3, NET-NEW): author the feed handler as a new server
module, test-first.

- **The new test —** `apps/studio/server/reviewFeedApi.test.ts` (vitest, `describe/it/expect`,
  environment node — the studio server convention; script the comment + suggestion stores as stubs, the
  `inFlightActivity.test.ts` advisory-read discipline; NO DB, NO `node:http` server). Import the handler
  from `"./reviewFeedApi"`. Name each test for its contract id (`rrf-…`) so `storytree coverage` reports
  3/3 (ADR-0122).
- **The RED the spine observes (before IMPLEMENT) —** the import resolves NOTHING —
  `reviewFeedApi.ts` does not exist at HEAD, so the test fails module-not-found (the net-new
  missing-symbol red, ADR-0057).
- **The GREEN —** write `apps/studio/server/reviewFeedApi.ts`: a handler that reads the topic's comments
  (via the comment backend, filtered) + its suggestions (via the suggestion backend, filtered), merges
  them into one feed response, and degrades to an empty feed when the store is absent (the advisory
  race/guard the studio's other live reads use). Add a `LibraryBackend.listSuggestions` seam if needed
  (mirroring `listComments`). Register the route. Wire the client poll in cap 7 (the frontend), reusing
  `PRESENCE_POLL_MS`. After it, the import resolves, the assertions hold, and `pnpm --filter studio test`
  + `pnpm --filter studio typecheck` stay green.

Rules:

- **One feed, one poll** — return both kinds in one response so the client re-polls once on the existing
  30 s visibility-gated cadence (the same cost envelope as presence). Do NOT add a second poll endpoint.
- **No real-time** — the feed is a re-polled GET, not a push; a single trusted dev works async (no
  cursor / OT / CRDT).
- **Advisory degradation** — empty feed (never a throw) when the store is absent (the studio live-read
  contract).
- **Handler-level proof** — exercise the handler over stub stores (offline); a real `node:http`
  integration test is a legitimate later add, not this cap's net-new.
