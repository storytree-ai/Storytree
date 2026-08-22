---
id: "map-server-memo"
tier: capability
story: studio
arc: studio-map-responsiveness-arc
title: "A repeated studio load is answered without re-reading an unchanged corpus"
outcome: "An operator's repeated studio load is answered without re-reading a corpus that has not changed on disk."
status: proposed
proof_mode: integration-test
depends_on: []
decisions: [240]
# BROWNFIELD R1: the server memoizes nothing and validates nothing today. `readTree`
# (apiRouter.ts:1151) re-reads and YAML+zod-parses every `stories/**/*.md` on EVERY /api/tree
# (137 ms warm / 1141 ms cold, 208 KB); `listDocs` (apiRouter.ts:238) re-reads and re-parses every
# `docs/**/*.md` on EVERY /api/docs (174 ms warm / 9.3 s cold); `sendJson` (httpUtil.ts:17) sets
# Content-Type and nothing else, so no route carries a validator and a browser can never
# conditionally revalidate. AUTHOR_TEST first proves the memo's freshness + non-pollution semantics
# and the conditional-revalidation wire behaviour over a REAL node:http server against a real
# temp-dir corpus; IMPLEMENT adds ONE pure server module plus the minimal wiring at the two read
# routes. NO client change.
proof:
  command:
    file: pnpm
    args: ["--filter", "studio", "test"]
  scope:
    testGlobs: ["apps/studio/server/mapServerMemo.integration.test.ts", "packages/cli/src/node-build.test.ts"]
    sourceGlobs: ["apps/studio/server/corpusMemo.ts", "apps/studio/server/apiRouter.ts", "apps/studio/server/httpUtil.ts"]
  real:
    testFile: "apps/studio/server/mapServerMemo.integration.test.ts"
    sourceFile: "apps/studio/server/apiRouter.ts"
    editsExisting: true
    scope:
      testGlobs: ["apps/studio/server/mapServerMemo.integration.test.ts", "packages/cli/src/node-build.test.ts"]
      sourceGlobs: ["apps/studio/server/corpusMemo.ts", "apps/studio/server/apiRouter.ts", "apps/studio/server/httpUtil.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "studio", "typecheck"]
    # The studio suite is Vitest, not node:test. The focused proof runs the one integration file in
    # the node environment against a REAL node:http server and a REAL temp-dir corpus — a mocked
    # filesystem or a mocked walk would hollow every freshness contract below.
    proofCommand:
      file: pnpm
      args:
        - "--filter"
        - "studio"
        - "exec"
        - "vitest"
        - "run"
        - "server/mapServerMemo.integration.test.ts"
---

# A repeated studio load is answered without re-reading an unchanged corpus

**Outcome —** An operator's repeated studio load is answered without re-reading a corpus that has not
changed on disk.

## Why this is one capability

The journey is one repeated load: the operator returns to the studio and the server answers from work
it has already done, while an edit they made a second ago is still there. Those are not two outcomes —
"without re-reading an *unchanged* corpus" is a single claim whose whole content is the freshness test.
A memo that skipped the re-read but served a stale spec would not be a smaller increment; it would be
the defect this unit exists to prevent.

This is what makes [`map-payload-cache`](map-payload-cache.md)'s revalidation affordable. Stage 2 took
ADR-0240 decision 3 seriously and made every boot ALWAYS refetch both read payloads, so the client now
paints instantly but the server still pays a full `stories/` walk plus a full `docs/` walk plus 208 KB
on the wire for every one of those mandatory revalidations. Stage 2 bought the paint; this stage buys
the revalidation. That is why the two stages are sequenced this way and why this one is not optional
tuning. Sharing a file with a sibling increment creates no `depends_on` edge — stage 2 says the same.

Both walks belong to the same unit. They are the same mechanism (a recursive markdown walk of a
directory the studio serves out of the repo root), they carry the same staleness risk against the same
dev loop, and they are validated by the same fingerprint. The HTTP validators are not separable either:
a memo without them still ships 208 KB on every revalidation, and a validator without the memo still
re-walks the disk to decide whether the body changed. Together they are one thing — the server answering
a repeat cheaply and honestly.

## Guidance

- **Directory mtime is NOT a sufficient validator — this is the primary risk.** ADR-0240's consequence
  bullet prescribes keying invalidation on directory mtime. Probed on the real filesystem, a directory's
  mtime does **not** move when a contained file's CONTENT changes; it moves only on an add, a remove, or
  a rename. A directory-mtime key would therefore serve a stale spec after exactly the edit the dev loop
  makes most — edit `stories/<x>/story.md`, refresh the map — and ADR-0240 already names the dev loop as
  where staleness bites first. This is the same CLASS of gap stage 2 found in that ADR's prescribed
  code-stamp guard, and correcting it is part of this increment's job. The requirement here is a
  PROPERTY, not a derivation: the validator must change on a content edit, an add, a remove, and a
  rename. How it is computed is the leaf's call.
- **The validating walk reads nothing and parses nothing.** Whatever the fingerprint is, computing it
  must perform no file READS and no spec PARSE — otherwise the validator costs what it saves. Measured
  on this repo: `docs/` is 380 files, and a recursive readdir+stat walk of it takes **22.5 ms** against
  **63.1 ms** merely to *read* its 299 markdown files, before `listDocs` runs a single frontmatter regex
  or excerpt derivation; `stories/` is 280 files, **16.6 ms** to stat-walk against **75.9 ms** to read
  its 280 markdown files, before `loadNodeSpec`'s YAML + zod parse. So a stat-only fingerprint (path +
  mtime + size per file) is a real 4–8x validator over even the bare read, and unlike directory mtime it
  moves on a content edit. That is evidence the property is cheaply satisfiable, not a prescription.
- **Fingerprint BEFORE the read-walk, and store it with the payload it describes.** The entry records
  the fingerprint observed before the expensive walk began — never one re-observed after it. Taken
  before, an edit that lands mid-walk yields an entry keyed to the pre-edit fingerprint, so the next
  request's fresh fingerprint differs and it re-walks: a wasted walk, never a stale answer. Taken after,
  the same race stores pre-edit CONTENT under a post-edit fingerprint, and the memo will serve that
  stale content as current until something else changes. This ordering is also what makes concurrent
  cold requests safe without any coordination between them: two overlapping walks can only ever store
  an entry under the fingerprint their own walk saw, so the loser of the race causes a later miss, never
  a stale serve.
- **Hand back a payload the caller cannot use to poison the memo.** This is the single most important
  correctness contract. The `/api/tree` handler MUTATES the `readTree` result in place: `applyUatCriteria`,
  `applyCapCoverage`, `applyUatCrowns`, `applyStoryGoGreenProof`, and `applyOpenQuestionGate` each
  document themselves as "Mutates `stories` in place" (`apiRouter.ts:1301-1466`), and the handler sets
  `payload.builds` directly (`apiRouter.ts:2110`). If the memo returns its stored object, the FIRST
  request's live DB enrichment — verdicts, crowns, build wisps — is written INTO the memo, and every
  later request serves that as though it came off disk. That is ADR-0240 decision 3's failure ("cached
  paint is never cached truth") applied to PROOF state, arriving silently and surviving until the files
  change. Whether the memo copies on the way out, freezes what it stores, or re-derives is the leaf's
  call; what is fixed is that mutating a returned payload can never be observed in a later read.
- **The memo covers the FILE WALK only.** The `/api/tree` live enrichment — `latestVerdicts`,
  `verdictEvents`, `inFlightBuilds`, `listAssets` and the open-question gate — is recomputed on EVERY
  request and never served from a file-keyed store. Nothing about the corpus on disk says whether a
  verdict was signed a second ago or a build is in flight right now, so a file fingerprint can never be
  the freshness authority for them. This is ADR-0240 decision 3 made structural rather than remembered.
- **Key per directory path, never one global slot.** `resolveStudioPaths` takes a `repoRootOverride`
  and the studio can be pointed at a foreign repo root (`repoRootOverride.test.ts`, ADR-0246), and
  `docsMirrorProbe.ts` calls `listDocs` on several directories inside one process for the cross-surface
  conformance gate. A single shared slot would serve one tree's answer for another repo. The memo holds
  at most one entry per directory, so it also cannot grow unbounded in a long-lived server.
- **No TTL, no clock.** Freshness is decided by the fingerprint and by nothing else. A time-based
  expiry would both serve stale content inside its window and re-walk needlessly outside it, and it
  would make "is my edit visible?" a question about elapsed time rather than about the disk.
- **Validators, not caching — `no-cache` and never `max-age`.** `apps/studio/src/api.ts`'s `http()` is a
  bare `fetch(url)` at the default cache mode, so `Cache-Control: no-cache` plus an `ETag` makes the
  browser revalidate conditionally on its own and turn a 304 back into a 200 from its own store, with
  no client change at all. `no-cache` means *store it, but ALWAYS ask* — which is precisely stage 2's
  mandate. A `max-age` would let a browser paint proof state without asking, re-introducing decision 3's
  failure at the HTTP layer, and is refused.
- **`/api/tree`'s validator covers the FULL body, enrichment included.** The ETag is computed over the
  bytes actually sent, after the live enrichment is folded in, so a verdict change alone with no file
  change busts it and the client gets a 200. Computing it over the memoized file payload only would
  serve a 304 while a crown had changed underneath — the same failure as caching the enrichment,
  reached by a different route. A corollary worth designing for: any nondeterminism in the serialized
  body (an unstable key order, an embedded timestamp) makes the ETag never match and the 304 never fire,
  so the repeat-request contract below pins body stability as well as the header.
- **Touch only the two read routes.** `sendJson` (`httpUtil.ts:17`) is the ONE JSON sender for every
  route in the app, so adding headers inside it would put a validator on `/api/comments`, `/api/assets`,
  and every write response too. The validators are applied at `/api/tree` and `/api/docs` specifically —
  by a separate sender or an opt-in parameter, the leaf's call — and every other route's response
  headers stay byte-for-byte what they are today. The 200 body of both validated routes also stays
  byte-identical to today's, so no client parses anything differently.
- **Keep the implementation boundary small.** The memo is ONE new pure server module,
  `apps/studio/server/corpusMemo.ts` — fingerprint, store, validate, evict — with no HTTP, no
  `ServerResponse`, and no import of `readTree` or `listDocs`, so its freshness semantics are provable
  directly. The only wiring points are `apps/studio/server/apiRouter.ts` (the `/api/tree` arm at 2034 and
  `handleDocs` at 1711) and `apps/studio/server/httpUtil.ts` (the validated sender). `listDocs` and
  `readTree` keep their exported signatures and their returned VALUES, so `docsMirrorProbe.ts` and the
  `check:mirror-conformance` diff are unaffected — a memo that changed what the walk returns would break
  a conformance gate that exists to compare two surfaces byte-for-byte.
- **Degrade to today's behaviour, never to a crash.** A directory that does not exist, a file that
  disappears between the fingerprint and the read, or any failure inside the memo leaves both routes
  answering exactly as they do today — the full walk, a 200, no unhandled rejection. The memo is an
  accelerator; both routes must be correct with it removed.
- **Prove it as an integration test.** Add `apps/studio/server/mapServerMemo.integration.test.ts`
  (Vitest, node environment) driving a REAL `node:http` server over the real handler against a REAL
  temp-directory corpus — the `healthApi.integration.test.ts` / `claimsApi.integration.test.ts` pattern,
  with only the LibraryBackend stubbed. A mocked filesystem or a stubbed walk would hollow every
  freshness contract here, and only a real conditional `fetch` proves the 304. Its test titles carry
  every contract id below, each as ONE plain string literal with the declared id leading it — never a
  concatenation and never a locally-invented id. The coverage scan is a static AST scan (ADR-0126), so a
  title assembled with `+` reads as UNCOVERED even when the id is the first thing in it. *(This read:
  keep the generic real-build catalog companion `packages/cli/src/node-build.test.ts` in lockstep so its
  exact buildable-capability catalog includes `map-server-memo`, list it in BOTH `scope.testGlobs` and
  `real.scope.testGlobs`, and don't skip it as an earlier stage had. That catalog-companion obligation is
  now false: ADR-0341 D4 replaced the hand-maintained catalogue with one DERIVED from the specs on disk, so
  authoring this spec IS the registration and there is nothing to add or skip. The file stays in BOTH
  `scope.testGlobs` and `real.scope.testGlobs` for the derivation test itself, which is unaffected.
  Corrected in place per ADR-0139.)*

## Integration test

1. Build a real temp-dir corpus (a `stories/` tree and a `docs/` tree) and serve it. Request `/api/tree`
   and `/api/docs` twice with no disk change between them, counting file reads and spec parses. Assert
   the second request performs none of either, that the validating work it does perform reads no file
   contents, and that both responses are byte-identical.
2. Change only the CONTENT of one file in each tree — no add, no remove, no rename, so the containing
   directory's own mtime does not move. Assert the next request re-walks and the new content is on the
   wire. This is the directory-mtime trap; it must fail before the fix and pass after.
3. Exercise the other three mutations in each tree — add a file, remove a file, rename a file. Assert
   each one is reflected on the next request.
4. Take a `/api/tree` response through the handler, then mutate the returned payload the way the live
   enrichment does (write a verdict onto a story, set `builds`). Assert a subsequent request over an
   unchanged corpus carries none of that mutation. Drive the memo module directly for the same
   assertion, so the guarantee is pinned at the seam and not only at the route.
5. Serve two DIFFERENT directories from one process (the `repoRootOverride` / `docsMirrorProbe` shape).
   Assert each answers with its own contents and that neither is ever served the other's, before and
   after a change to one of them.
6. Hold the corpus fixed and change what the stubbed backend returns between two `/api/tree` requests —
   a new verdict, then an in-flight build. Assert both changes appear on the second response, so the
   enrichment is provably recomputed rather than memoized.
7. Request `/api/tree` and `/api/docs` and assert each carries `Cache-Control: no-cache` and an `ETag`,
   and that no `max-age` appears. Re-request each with `If-None-Match` set to the returned value over an
   unchanged corpus and unchanged backend answers; assert a 304 with an empty body carrying the same
   validator. Then change a file and assert a 200 with a different `ETag`; then, with files unchanged,
   change only a verdict and assert `/api/tree` also returns a 200 with a different `ETag`.
8. Assert `/api/assets`, `/api/comments`, and a write response carry neither `ETag` nor `Cache-Control`,
   and that their bodies and other headers are unchanged.
9. Edit a file DURING the expensive read-walk (drive it from a read hook that mutates on first call).
   Assert the next request re-walks and serves the edited content — never the pre-edit payload presented
   as fresh.
10. Point both routes at a directory that does not exist and at one whose file disappears mid-walk.
    Assert each answers exactly as it does today, with no unhandled rejection.
11. Run the generic real-build catalog regression and assert its exact buildable-capability catalog
    names `map-server-memo`; this keeps the authored capability visible to the real-build path.

## Contracts

1. **`map-server-memo-repeats-without-re-reading-the-corpus`**
   - **asserts —** a second `/api/tree` and `/api/docs` over an unchanged corpus performs no file
     content read and no spec parse, the freshness check it does perform reads no file contents, and
     the served body is byte-identical to the first.
2. **`map-server-memo-revalidates-on-a-content-edit`**
   - **asserts —** editing only the CONTENT of a file under `stories/` or `docs/` — no add, remove, or
     rename, so the directory's own mtime does not move — makes the next request serve the new content.
3. **`map-server-memo-revalidates-on-an-add-a-remove-and-a-rename`**
   - **asserts —** adding, removing, and renaming a file under either tree is each reflected on the
     next request.
4. **`map-server-memo-hands-back-an-unpollutable-payload`**
   - **asserts —** mutating a returned payload the way the `/api/tree` enrichment does — writing a
     verdict onto a story, setting `builds` — is never observable in any later read over an unchanged
     corpus, at the route and at the memo seam directly.
5. **`map-server-memo-keys-per-directory`**
   - **asserts —** two different served directories in one process each answer with their own contents,
     before and after a change to one of them; neither is ever served the other's.
6. **`map-server-memo-recomputes-live-enrichment-every-request`**
   - **asserts —** with the corpus unchanged, a newly signed verdict and a newly in-flight build both
     appear on the next `/api/tree` response — the enrichment is never served from the file-keyed memo.
7. **`map-server-memo-revalidates-conditionally-over-the-full-body`**
   - **asserts —** `/api/tree` and `/api/docs` each carry `Cache-Control: no-cache` and an `ETag` and no
     `max-age`; a matching `If-None-Match` over an unchanged corpus AND unchanged backend answers
     returns 304 with an empty body; a file change returns 200 with a different `ETag`; and a verdict
     change alone, with no file change, also returns 200 with a different `ETag`.
8. **`map-server-memo-leaves-mutable-and-write-routes-unvalidated`**
   - **asserts —** `/api/assets`, `/api/comments`, and write responses carry neither `ETag` nor
     `Cache-Control`, with bodies and remaining headers unchanged from today.
9. **`map-server-memo-never-serves-a-payload-a-mid-walk-edit-overtook`**
   - **asserts —** an edit landing DURING the expensive read-walk leaves the next request re-walking
     and serving the edited content, never the pre-edit payload presented as fresh.

## Explicitly outside this increment

- **Collapsing concurrent cold requests into one walk (single-flight).** Deliberately excluded, and the
  reason is that it is a COST question only: the fingerprint-before-the-walk rule above already makes
  overlapping walks CORRECT — the loser of a race stores its entry under the fingerprint its own walk
  saw, so it can cost an extra walk but can never produce a stale serve, which contract 9 pins. Its
  precondition (several cold requests in flight at once) and its observable (one walk instead of N) are
  both different from this unit's repeated-load journey, so by the splitting rule it is a separate unit,
  and it can be added later without revisiting anything decided here. In the studio's own boot the two
  requests hit two DIFFERENT directories and would not collide at all.
- Density, LOD, culling, aggregation, scene-graph redesign, renderer choice, `packages/forest-world`,
  `@storytree/app-surface`, or any owner-visible change to the world's look. ADR-0240 deliberately
  sequences that LAST, behind its own ADR and an owner attestation of the look.
- Stage 4's boot de-serialisation: the remaining `/api/assets` + `/api/comments` pair stays in the
  blocking boot `Promise.all` exactly as it is, and the map still mounts only once both resolve. (Stage
  2 already took the `/api/docs` third of stage 4 with it.)
- Caching, memoizing, or validating the MUTABLE payloads (`/api/assets`, `/api/comments`), and any
  validator on a write path. Both are write surfaces; putting a staleness surface inside one is a
  separate decision, as `map-payload-cache` already recorded.
- Any regression of `map-payload-cache`'s three cache guards (the client stamp, the server `code.head`
  eviction, the structural shape check) or of `map-route-retention`'s SPA route retention.
- Weakening any existing store-health honesty — the load screens, the banner, or the asleep-vs-fault
  distinction — to make a load appear faster.
- Any client change. This increment is `apps/studio/server/**` only: no change to `apps/studio/src`, to
  the `api.ts` client, to the boot order, or to any route's payload SHAPE or field set.
