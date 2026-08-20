---
id: "studio-cloud"
tier: story
title: "Studio cloud — the trusted circle interacts with a served studio"
outcome: "A small circle of trusted devs opens a URL, signs in with their Google account, and interacts with the live studio — world, library, docs — leaving comments under their verified identity; nothing else about the system is exposed."
status: proposed
proof_mode: UAT
capabilities: [serve-mode, guest-scope, container-image, cloud-run-iap, circle-onboarding, hosted-db-wake, write-broker, deploy-health-signal]
# Story-level edges: the studio UI being served, the library story's store seam (ADR-0010 §4), and —
# ADR-0117 — studio-members, whose `builder` role + `resolveAccess` the write-broker gate consumes (the
# real code edge already exists: guestPolicy.ts imports @storytree/studio-members, and studio-members'
# story declares "Membership is CONSUMED BY the hosted studio"). The broker persists a builder's
# locally-signed verdict/presence under the studio's one service-account DB identity.
# notice-board + proof-protocol: honesty edges the ADR-0115 drift report surfaced (2026-07-05 map
# audit) — this story's registered unit sources import the CLAIM schema + folds
# (@storytree/notice-board — ClaimDocT / DepartedClaim / foldDepartures in the hosted server's
# libraryBackend.ts + apiRouter.ts; corrected 2026-07-26 — this comment used to name the ADVISORY
# PRESENCE schema, which ADR-0200 retired) and the verdict/signing shapes (@storytree/proof-protocol,
# the broker's verdict persist) directly, not only through the studio.
# cli (ADR-0192 rule 5 — the hosted-story landlord / packages-forward edge): the `deploy-health-signal`
# capability's proof-bound source (packages/cli/src/deploy-health.ts) is HOSTED in cli's building
# (packages/cli), where every gate check lives. NO code import backs it — the pure classifier imports
# nothing and is wired into the gate by the root package.json check script (glue), not by a package
# dependency — so the edge is declared consumer-side here and annotated in artifact_edges (ADR-0192 D1).
# studio-cloud is on the `hostedStories` grandfather register (rule 6 admits it).
depends_on: [studio, library, studio-members, notice-board, proof-protocol, cli]
# ADR-0166 artifact edges: the deliberate NON-IMPORT seams among the depends_on above (build-artifact /
# write-target / hosted-seam consumption, narrated per-edge in the comments/body of this spec) — the
# declared-edge honesty gate accepts these without a code import; remove an entry if the seam ever
# becomes a real package import.
artifact_edges: [studio, library, cli]
decisions: [42, 49, 117, 311] # deciding ADRs (ADR-0037 §2): 0042 stood it up, 0049 lets it wake its own DB, 0117 the members-gated write-broker + builder scope, 0311 retires the deploy-health gate signal
---

# Studio cloud — the trusted circle interacts with a served studio

**Outcome —** A small circle of trusted devs opens a URL, signs in with their Google account, and
interacts with the live studio — world, library, docs — leaving comments under their verified
identity; nothing else about the system is exposed.

The deciding ADR is [ADR-0042](../../docs/decisions/0042-hosted-studio-demo-cloud-run-iap.md)
(owner decisions 2026-06-14: Cloud Run + IAP exposure; read+comment guest scope). The story turns
the studio from a laptop-bound Vite dev process into a deployable artifact without forking it:
ONE `/api/*` route table serves both the dev plugin and the hosted server, and the hosted
differences are a policy layer, not a second backend.

## Design floor (from ADR-0042)

- **One route table.** The dev plugin and the standalone server mount the same extracted API
  router; hosted behaviour differs only by the injected policy. No endpoint exists twice.
- **Identity from the proxy, fail-closed.** IAP's verified-email header is the identity; in
  guarded mode an API request without one is refused (401). The deployment invariant — ingress
  is IAP-only — is what makes header trust acceptable for a trusted circle; JWT-assertion
  verification is named hardening.
- **Guests read everything, write comments only.** Comment authorship is stamped server-side
  from the verified identity; guests edit/resolve/delete only their own comments; asset writes
  need the admin allowlist; `/api/db/*` is never served hosted.
- **The image is a snapshot; the store is live.** docs/ + stories/ bake into the container;
  library/comments/verdicts/presence flow from the shared Cloud SQL store via the runtime
  service account (keyless IAM, ADR-0021).
- **Local dev is untouched.** `vite dev` keeps the open localhost behaviour, json fallback
  included.

## The write-broker (ADR-0117)

[ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
adds a **members-gated write-broker** on this served studio's `/api/*` table: a thick-local co-builder
(the `desktop` story) POSTs his **already-signed** verdict / presence to the broker, and the SERVER — under
its one service-account DB identity — validates SHAPE + ATTRIBUTION and persists it, so his local build
blooms in the shared forest WITHOUT a per-friend Cloud SQL IAM grant. The broker holds **no signing key**
and never re-signs (ADR-0091); it is the inverse of `/api/uat/attest` on the verdict side (that endpoint
*signs* a new verdict; the broker *persists* a handed-in one). Authorization is the existing `resolveAccess`
gate with the `builder` scope required ([`builder-role`](../studio-members/builder-role.md)). It rides the
ONE route table + the existing policy gate (`guestPolicy.ts`) — not a second backend (ADR-0042). It is
CONSUMED BY the desktop over HTTP ([`shared-forest-connection`](../desktop/shared-forest-connection.md)).

## Capabilities (8)

Listed roots-first (1–7 serve + gate the studio; 8 watches this story's own post-merge CD from the repo
side, so a silently-failed deploy is loud at the gate tail — ADR-0194).

| # | capability | outcome | status | depends on |
|---|---|---|---|---|
| 1 | [`serve-mode`](serve-mode.md) | A standalone node server serves the built SPA and the same /api route table the dev plugin uses — no Vite at runtime. | proposed | — |
| 2 | [`guest-scope`](guest-scope.md) | In guarded mode every API request carries a verified identity; guests read everything, comment as themselves, and touch only their own comments; admins keep asset writes; db control is refused. | proposed | `serve-mode` |
| 3 | [`container-image`](container-image.md) | The studio builds into a container image carrying dist/, the server, and the docs/stories snapshot — runnable anywhere with only env + ADC. | proposed | `serve-mode` |
| 4 | [`cloud-run-iap`](cloud-run-iap.md) | Terraform stands up the Cloud Run service behind IAP with a least-privilege runtime service account reaching Cloud SQL keylessly. | proposed | `container-image`, `guest-scope` |
| 5 | [`circle-onboarding`](circle-onboarding.md) | Adding a trusted dev is one IAM grant plus a runbook link; removing them is one revoke; the circle's access is enumerable at a glance. | proposed | `cloud-run-iap` |
| 6 | [`hosted-db-wake`](hosted-db-wake.md) | When the shared DB idle-stops, an admin wakes it from the site — keyless, container-native, no gcloud; the page self-recovers, non-admins are refused. | proposed | `serve-mode`, `guest-scope` |
| 7 | [`write-broker`](write-broker.md) | A members-gated POST endpoint persists a builder's locally-signed verdict / presence — validating shape + attribution, refusing a non-builder (403) / malformed (400) / mismatched signer — holding no signing key, never re-signing. | proposed | `guest-scope` |
| 8 | [`deploy-health-signal`](deploy-health-signal.md) | A pure classifier turns the deploy-studio CD run list into an ok / red / unknown health signal, so a red post-merge deploy is loud at the gate tail (best-effort, WARN-only, ADR-0194). | proposed | — |

## UAT Test Criteria

**Goal —** One trusted dev who has never seen the system goes from an invite to a comment the
owner reads, without touching a terminal.

> **Per-leg witness (ADR-0106 / ADR-0184 / ADR-0209 §8, re-adjudicated 2026-07-26; surgically
> reduced under ADR-0294 on 2026-08-06).** The five surviving legs are `witness: machine`: every
> success condition below is an observable IAM, HTTP, persisted-store or browser-DOM fact — never
> human merely because the faithful proof is live, cross-process, or not yet harnessed. None of the
> five surviving legs carries a proof-gate binding: the repo has no standing command or persisted
> live-proof verifier that grants/revokes production IAP, drives Google's real sign-in, verifies the
> deployed browser journey, or composes a thick-local desktop build → the production broker → the live
> store → the deployed forest. They are explicit machine-proof BINDING GAPS that adoption must refuse
> until a faithful deliberate live producer + standing verifier lands.
>
> **The supplemental suites below are supplements, never substitutes — a PASSING run of any of them
> is a FALSE PASS for the five surviving legs.** Each proves a stubbed slice: a recording fake backend, an
> injected `now`, a forged-then-stripped header, no IAP, no live store, no deployed browser, no
> desktop. Binding one as an observe gate for those legs would be exactly the rubber stamp ADR-0097 §2
> bans — leave them unbound and let the gap stay loud. No leg rests `either`, and no leg carries a
> model tier: nothing here is a rubric-judged semantic call, so ADR-0209's `model` rung is not in play.
>
> **Detail pointers removed (2026-07-26).** All eight legs previously declared a detail-artifact
> pointer at `studio-cloud#uat-1` … `#uat-8`. **None of those artifacts has ever existed** — checked
> at the time against both surfaces then in play, the committed detail docs and the live Library — so
> every one of the eight dangled. *(Wording corrected 2026-08-05: this note used to call the
> committed `apps/studio/data/seed-kinds/uat-criterion/` docs the seed-canonical surface and contrast
> them with the live Library. ADR-0307 D5 withdrew that posture and the directory is deleted — the
> detail docs now live IN the live Library, which is exactly the surface this note implied they were
> absent from. The finding is unchanged: these eight ids exist on neither surface, then or now.)*
> Under the owner's 2026-07-25 narrower bar (ADR-0209 §5: author a
> detail artifact ONLY where the one-line title is too thin to judge against, never one per leg), eight
> pointers for eight legs is precisely the over-application that bar removed. Each leg already carries
> its full action and success conditions inline here, and this file stays the canonical, versioned
> surface for them, so the dead pointers are DELETED rather than backfilled.

### ADR-0294 disposition of the eight original criteria

| original leg | criterion id | disposition |
|---|---|---|
| 1. **Grant** | `uatc_cf832d40045d76c96a9fb153` | **Keep.** [`circle-onboarding`](circle-onboarding.md) declares live grant/revoke UAT, but has no lower-tier automated proof that changes and enumerates the real production IAP IAM policy. |
| 2. **Sign in** | `uatc_7f0c7763d324ffb43169bb76` | **Keep.** [`cloud-run-iap`](cloud-run-iap.md) declares the IAP door as UAT; the mounted-router tests forge an already-verified header and never complete Google's real sign-in or render the deployed live-store world. |
| 3. **Browse** | `uatc_74a8267a8cb36c8780ff3a88` | **Keep.** [`serve-mode`](serve-mode.md) and [`guest-scope`](guest-scope.md) prove local mounted HTTP slices, not one authenticated production-browser traversal of the deployed world, story panel, Library lens, and ADR against real served routes. |
| 4. **Comment** | `uatc_ccd2aaa5cb592dc7b6a8d213` | **Delete as duplicate.** [`guest-scope`](guest-scope.md), `apps/studio/server/serveApi.integration.test.ts`, test **“comment authorship is stamped from the verified identity — the client field is ignored”**: POST returns `201` and `seen.createdComment.author` equals the verified member, not the forged client author. |
| 5. **Scope walls** | `uatc_19fa35837d4f215bac5faf3c` | **Delete as duplicate of the exact enumerated operations.** [`guest-scope`](guest-scope.md), `apps/studio/server/serveApi.integration.test.ts`: **“a member reads, comments as self, but cannot write assets or reach user mgmt”** asserts member asset POST `403`; **“the bootstrap-seed admin writes assets (becomes an effective active admin)”** asserts admin asset POST `201`; **“a member edits their own comment but not another author's; an admin may touch any”** asserts member own/other comment PATCH `200`/`403` and admin PATCH `200`; **“db control is 403 for member AND admin”** asserts GET `/api/db/status` is `403` for both roles. These are only the methods/routes claimed here, not every asset/comment verb or DB route. |
| 6. **No identity, no API** | `uatc_53f880acb76b7ab23c01619b` | **Delete as duplicate.** [`serve-mode`](serve-mode.md), test **“serves index.html at / and real assets by path (no identity needed)”**, asserts `/` and `/assets/app.js` return `200`; [`guest-scope`](guest-scope.md), test **“refuses identity-less /api/* with 401 — every route, health and me included”**, samples assets, health, tree/corpus, me/membership, and DB status and asserts `401` for each. Both tests are in `apps/studio/server/serveApi.integration.test.ts`. |
| 7. **Revoke** | `uatc_79977112ba53b5410622e661` | **Keep.** [`circle-onboarding`](circle-onboarding.md) declares live revoke UAT, but no lower-tier test removes a real production IAM binding, re-enumerates policy, and observes Google's edge deny a fresh visit before the app. |
| 8. **Broker a build (ADR-0117)** | `uatc_57f6f0fcb7addad5b9f35c44` | **Keep.** [`write-broker`](write-broker.md) proves broker walls through an injected recording store with no live DB or IAP; no lower-tier proof composes a thick-local build, production broker, live store, and deployed forest bloom. |

### ADR-0294 **D4** pass (2026-08-20): five legs declared UNBOUND, none deleted — two ordinals restored

The D2 pass above deleted three of the eight original criteria. This pass answers the other half of
ADR-0294's end state, point 4: **what the five survivors ARE, given every one of them binds no gate.**
The answer for this story is the simplest in the corpus, and worth stating so nobody re-adjudicates
it: **all five are RE-AUTHORS, and zero are deletions.** Each is a live-deployment walk with no lower
tier to point at — granting a real `roles/iap.httpsResourceAccessor` binding and enumerating the real
IAP policy (1), completing Google's real sign-in against the production URL (2), traversing the
deployed read surfaces (3), revoking and being denied at Google's edge (7), and the desktop → hosted
write-broker → live store → deployed forest round trip (8). The per-leg witness note above already
established this in 2026-07-26 terms — *"explicit machine-proof BINDING GAPS that adoption must
refuse"*, and *"a PASSING run of any [supplemental suite] is a FALSE PASS"*. What this pass adds is the
house form: each leg now says so **in its own text** rather than only in a shared preamble, in the
compact **UNBOUND — fails closed** clause PR #1444 settled on, so a reader who reaches a leg without
reading the preamble still gets the truth. **No gate is minted for any of them** (ADR-0097 §2), and no
supplemental suite is bound.

**Two ordinals are RESTORED, and this is a correction rather than a renumbering (ADR-0139).** The
2026-08-06 D2 pass burned positions 4, 5 and 6 in `stories/uat-legacy-dispositions.json` — where they
are still recorded `superseded` as Comment / Scope walls / No identity — but then renumbered the two
survivors below them to 4 and 5, so those two positional keys denoted two different criteria at once.
The file gave the collision away itself: leg 5's own note referred to *"legs 1–3 and 7"*, a numbering
its own list no longer matched. **Revoke** returns to **7** and **Broker a build** returns to **8**,
the positions their ledger keys `studio-cloud#uat-7` / `#uat-8` have always named. The restoration
moves no identity and no proof: the `(criterion-id:)` is what identifies a leg; the leading ordinal is
stripped before the `(revision-id:)` is computed, so the renumbering alone changes no revision (the
five revisions below DO advance, but from this pass's added prose, not from the digits); all five read
`proven=–` on the live store; this story holds zero `uat-criterion` detail artifacts; and nothing
anywhere else cites a `studio-cloud#uat-N` ordinal. Positions **4, 5 and 6 are now genuinely absent**,
which is what "burned, never renumbered" is supposed to look like.

1. **Grant.** _(witness: machine)_ _(criterion-id: uatc_cf832d40045d76c96a9fb153)_ _(revision-id: uatr1:1706a452cf504cbf)_ _(previous-revision-id: uatr1:8ab2d240e8e5a9b7)_
   The owner grants `dev@example.com` `roles/iap.httpsResourceAccessor` on the production Cloud Run
   IAP resource using the runbook (`infra/studio-cloud.md` §5), then enumerates that resource's IAM
   policy. **Success —** the real IAP policy contains exactly the granted user on the served studio
   resource.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: nothing in the repo grants or
   enumerates a REAL production IAP policy, and the runbook step persists no artifact an `observe`
   gate could read, so `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted to host
   it (ADR-0097 §2).
2. **Sign in.** _(witness: machine)_ _(criterion-id: uatc_7f0c7763d324ffb43169bb76)_ _(revision-id: uatr1:66c3146f68d0630f)_ _(previous-revision-id: uatr1:f490699b9d6d71a7)_
   The dev opens the production studio URL, completes Google's real sign-in, and reaches the served
   studio with no local setup or forged identity header. **Success —** the deployed world renders from
   the live store under `dev@example.com`, carrying verdict-derived hues and whatever session CLAIM
   wisps the live claim ledger holds at that moment. *(Corrected 2026-07-26: this leg read "active
   wisps" from the pre-ADR-0200 world. The advisory presence layer is retired — a wisp is a story
   claim now, so a harness must seed a live claim rather than assume one is orbiting.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: the mounted-router suites forge
   an already-verified identity header and never complete Google's real sign-in, so binding one would
   be a FALSE PASS by the preamble's own rule and `resolveWitness` refuses the leg
   (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2).
3. **Browse.** _(witness: machine)_ _(criterion-id: uatc_74a8267a8cb36c8780ff3a88)_ _(revision-id: uatr1:4c432907e645b1f7)_ _(previous-revision-id: uatr1:e1720299519d5445)_
   In that authenticated production browser session, the dev navigates the story world, a story
   panel, the Library lens over the map, and an ADR. **Success —** every deployed read surface renders
   from its real served route/API and the journey completes without a read or authorization error.
   *(Corrected 2026-07-26: this leg read "the Library", which now names a retired surface. ADR-0185
   dec 6 retired the standalone `#/library` page — `parseRoute` redirects every `/library` path to the
   tree route — so the Library is reached as an overlay lens over the forest map, and a harness that
   deep-links `#/library` will silently land on the map instead of failing.)*
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: [`serve-mode`](serve-mode.md) and
   [`guest-scope`](guest-scope.md) prove LOCAL mounted HTTP slices, not one authenticated
   production-browser traversal of the deployed surfaces, so `resolveWitness` refuses it
   (`coverage: "refused"`). No gate is minted to host it (ADR-0097 §2).
7. **Revoke.** _(witness: machine)_ _(criterion-id: uatc_79977112ba53b5410622e661)_ _(revision-id: uatr1:f2d7ddd5d962cf81)_ _(previous-revision-id: uatr1:476854f0f2907be8)_
   The owner removes `dev@example.com`'s `roles/iap.httpsResourceAccessor` binding from the
   production IAP resource, then the dev starts a fresh visit. **Success —** the real IAP policy no
   longer contains the user and Google's edge denies the next visit before any studio API is reached.
   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`: no test removes a real production
   IAM binding, re-enumerates the policy, or observes Google's edge deny a fresh visit before the app
   is reached, so `resolveWitness` refuses it (`coverage: "refused"`). No gate is minted to host it
   (ADR-0097 §2). *(This leg was numbered 4 between 2026-08-06 and 2026-08-20, colliding with the
   burned ordinal `studio-cloud#uat-4`; restored to 7 by the D4 pass above, per ADR-0139.)*
8. **Broker a build (ADR-0117).** _(witness: machine)_ The owner marks `friend@example.com` a _(criterion-id: uatc_57f6f0fcb7addad5b9f35c44)_ _(revision-id: uatr1:09e63f9a51b8704c)_ _(previous-revision-id: uatr1:aa5a8227739592b0)_
   **builder** in the deployed Members panel; the friend's thick-local desktop performs a REAL local
   build and POSTs its already-signed verdict through the production hosted write-broker into the
   live shared store. **Success —** the broker validates shape, attribution, and builder scope and
   persists the verdict byte-unchanged, never re-signing; the persisted verdict reaches live activity
   attributed to the friend's `signer`; and the deployed forest renders that unit's bloom for the
   friend's landed verdict. A `member` POST is `403`, malformed is `400`, and mismatched attribution
   is `403`.

   > **Re-adjudicated 2026-07-26 (ADR-0209 §8): was `human`, now `machine`.** The recorded basis was
   > "no integrated desktop → hosted broker/store → browser harness exists". That is a HARNESS
   > statement, and a harness basis dissolves the moment someone writes the harness — so it can never
   > hold the human rung, whose bar is a success condition with no compiler at all
   > (`human-witness-is-a-judgment-gap-not-cost`). Clause by clause, every one of them compiles:
   > the three walls and the byte-unchanged persistence are ALREADY asserted, offline, against the
   > mounted endpoint (`apps/studio/server/writeBrokerApi.integration.test.ts` — 401 identity-less,
   > 403 member, 201 builder with the persisted verdict deep-equal to the POSTed one and `signer`
   > un-restamped, 403 mismatched signer, 400 malformed); provenance is machine-checkable here rather
   > than unobservable, because the broker's attribution wall REQUIRES `verdict.signer` to equal the
   > verified IAP caller (`apps/studio/server/writeBroker.ts`), so "the friend's build" is a field
   > comparison, not an inference about who was at the keyboard; and the bloom is a PURE deterministic
   > projection of verdict outcome plus age (`verdictBloom` in `apps/studio/src/lib/activity.ts` —
   > pass-only, decaying `ageRatio`, caller-supplied `now`), not a look-or-feel judgment about whether
   > the deployed forest reads right. Nothing in the success condition asks a person to decide
   > anything. What is genuinely missing is only the COMPOSED LIVE HARNESS — the same missing thing
   > legs 1–3 and 7 already record as machine binding gaps, on materially the same reasoning; the leg
   > sat at a different rung than its own siblings for no distinguishing reason. It stays UNBOUND and
   > unstamped until that harness lands: this pass classifies, it does not make the leg green, and no
   > gate is minted to host it. Zero attestation and zero verdict rows exist for this story, so the
   > move strands nothing signed.

   **UNBOUND — fails closed (ADR-0294 D4, 2026-08-20).** No `(proof-gate:)`, restating the blockquote above in
   the house form: the walls are proven offline against an injected recording store with no live DB,
   no IAP, no desktop and no deployed browser, and the COMPOSED live harness this leg turns on does
   not exist — so `resolveWitness` refuses it (`coverage: "refused"`) and no gate is minted to host it
   (ADR-0097 §2). *(This leg was numbered 5 between 2026-08-06 and 2026-08-20, colliding with the
   burned ordinal `studio-cloud#uat-5`; restored to 8 by the D4 pass above, per ADR-0139.)*

## Reliability Gates

`studio-cloud#gate-1` is retained, unrenumbered, as this story's independent reliability obligation.
It is not a proof binding for any of the five surviving journey legs and must not be deleted with the
three duplicate criteria.

1. **The hosted route-table policy journey is green** _(gate: observe)_
   `pnpm --filter studio test -- server/serveApi.integration.test.ts`.

## Supplemental deterministic checks

- `pnpm --filter studio uat` is the local real-browser read/comment shadow, but repository convention
  requires a separately installed Playwright Chromium. It is not self-preparing and does not cross
  production IAP, so it is not an adoption observe gate for Grant, Sign in, Browse, or Revoke.
- `pnpm --filter studio test -- server/serveApi.integration.test.ts` additionally proves the
  application-membership and exact IAP-header boundary using a stub backend; those assertions
  supplement, but do not replace, the production IAM/sign-in/revoke facts.
- `pnpm --filter studio test -- server/writeBrokerApi.integration.test.ts src/lib/activity.test.ts src/lib/worldStatus.test.ts`
  proves mounted broker authorization/shape/attribution/unchanged persistence plus the pure
  verdict-to-bloom/status projections. Re-verified green 2026-07-26, and the claim holds clause by
  clause. It runs against a RECORDING STUB backend with an injected `now`, and composes no
  thick-local desktop, no production IAP, no live store and no deployed browser — so it supplements
  Broker a build's machine proof and can never stand in for it.

## Open modeling calls (for the owner)

ADR-0042 resolved exposure and guest scope; [ADR-0117](../../docs/decisions/0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md)
added the members-gated write-broker + the `builder` scope (a settled owner-directed decision, born
accepted per ADR-0110). Cost detail (direct IAP integration vs classic LB ~US$20/mo) is recorded in
ADR-0042 and lands with `cloud-run-iap`. One call is open:

1. **`cloud-sql-admin-rest.md` is an orphaned node with a DEAD proof binding.** *Raised 2026-07-26 by
   the ADR-0209 §8 witness pass; since 2026-07-27 the DEAD-BINDING half is held by machinery —
   `pnpm check:verification-decay` (ADR-0252) sweeps it as one of the five baselined
   `contract-binding-drift` signals, so it is no longer carried only by this note and cannot be lost
   with it. Repairing the binding should also TIGHTEN `DRAIN_CEILING` in
   `packages/cli/src/check-verification-decay.ts` from 5 to 4 — the ceiling only ever ratchets down.
   The ORPHANING half — nothing references this node — is not swept by anything and lives only here.
   Neither half is repaired here, because re-parenting a node is a story-shape call.*
   `stories/studio-cloud/cloud-sql-admin-rest.md` declares `tier: contract`, `story: studio-cloud`,
   but **nothing references it**: it is absent from this story's frontmatter `capabilities:` list and
   from the Capabilities (8) table, and no capability lists it under a `## Contracts` heading — the
   only occurrence of its id anywhere under `stories/` is its own `id:` line. Its proof block is also
   bound to a package that no longer exists: `pnpm --filter @storytree/store test` over
   `packages/store/src/cloud-sql-admin{,.test}.ts`, but `@storytree/store` was DISSOLVED by ADR-0077
   and those files now live at `packages/library/src/store/cloud-sql-admin{,.test}.ts` (both present
   and real). So the node cannot be built or proven as written. Options, not chosen here: (a) adopt it
   as a contract under `hosted-db-wake` — the capability whose keyless start/stop it actually serves —
   and re-bind the proof to `@storytree/library` / `packages/library/src/store/**`; (b) retire it,
   since the code it describes shipped under another owner. Either way the binding must move; leaving
   it is a node that would go red against correct code.
