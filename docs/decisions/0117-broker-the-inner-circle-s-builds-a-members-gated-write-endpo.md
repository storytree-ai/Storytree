---
status: accepted
decided: 2026-06-27
amends: [113, 43]
load_bearing: true
---
# ADR-0117: Broker the inner circle's builds: a members-gated write endpoint and a builder role replace the per-friend Cloud SQL grant

## Status

accepted (2026-06-27) — decided/directed by the owner in conversation, choosing **Option B (a members-gated
write-broker + a `builder` role)** over both the status-quo per-friend Cloud SQL IAM grant and a fully-hosted
thin-client worker. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. The
friend-facing Members-panel invite UX and the end-to-end "invite a builder → their local build blooms in the
shared forest" walk are operator-attested under ADR-0070 when built.

## Context

ADR-0113 made the inner-circle desktop a **thick-local** client: the drive machinery (build/orchestrate/loop) runs
on the trusted co-builder's own machine, and — §6 — his builds, verdicts, and presence write to the **shared Cloud
SQL Postgres** so his work blooms in the same forest the owner watches. ADR-0113 §6 routes those writes **directly**:
the friend's local backend opens its own keyless Cloud SQL connection under **his own Google identity** (ADR-0021),
which requires **granting that identity Cloud SQL IAM access — an attended privileged action the owner performs per
friend at delivery**. The desktop's `forest-readiness` probe (`apps/desktop/src/backend/forest-readiness.ts`) even
encodes this: when the connector refuses it tells the friend to *"ask the owner to run `gcloud … add-iam-policy-binding
… roles/cloudsql.client`."*

Two costs of that direct path motivate this decision:

1. **The grant is per-friend friction the owner must repeat, and it hands a third party a direct key to the shared
   production DB.** A granted IAM identity can open a raw connection and write *anything* to the forest; authorization
   lives at the **data layer** and is provisioned one `gcloud` invocation at a time.
2. **It re-couples "is this person allowed to contribute" to a cloud-IAM grant** rather than to the **Members
   whitelist the owner already manages in-app** (ADR-0042 hosted studio + ADR-0043 app-owned users/roles). The owner
   already invites/removes members through the studio Members panel; the contribute-permission should ride the same
   surface.

`studio-members` today has exactly two roles — `admin` (manage) and `member` (read + comment) — and the hosted
studio authorizes every `/api/*` request from its own users projection via `resolveAccess` (`packages/studio-members/
src/users.ts`, gated in `apps/studio/server/guestPolicy.ts`), IAP having authenticated the identity at the edge.

## Decision

1. **Friend writes are BROKERED, not direct (amends ADR-0113 §6 for friends).** The thick-local friend keeps **local
   compute** — the build spine still runs the prove-it-gate on his machine and **signs the verdict locally** (ADR-0113's
   premise, ADR-0091's gate-runs-then-signs integrity) — but his local backend **no longer opens a Cloud SQL
   connection.** Instead it **POSTs the already-signed verdict / the presence declaration** to a **members-gated write
   endpoint on the owner's hosted studio** (`apps/studio/server`). The **server** — under its single service-account DB
   identity — validates and persists them via the existing `@storytree/library/store` write path. **No per-friend Cloud
   SQL IAM grant is needed**; the friend holds no DB identity and opens no DB connection.

2. **Add a `builder` role (extends ADR-0043).** `studio-members` gains a third role: `builder` = a member who may POST
   builds/writes through the broker (read + comment like a `member`, **plus** the brokered write scope), still
   IAP-authenticated, still resolved by `resolveAccess`, still holding **no DB identity**. The Members panel invites /
   marks a `builder` exactly as it does an admin or member (ADR-0043 in-UI invitation). `admin` ⊇ `builder` ⊇ `member`
   for the broker gate (an admin may also POST through it).

3. **The broker holds NO signing key and never re-signs (ADR-0091).** It persists the **build spine's local
   signature**; it is a *persisting* endpoint, not a *signing* one. It **validates SHAPE** (the proof-protocol
   `Verdict` / presence zod shapes — a malformed body is refused) and **ATTRIBUTION** (the verdict's signer / the
   presence's session identity must match the **IAP-authenticated builder** — you cannot POST a write attributed to
   someone else), then writes. Authorization is the same `resolveAccess` gate the rest of the studio uses, with the
   `builder` (or `admin`) scope required for the broker path.

4. **Authorization moves from the DB layer to the APP layer — the same trade ADR-0091 already made.** ADR-0091 §3
   already replaced per-principal DB IAM with "app-layer authz over the trusted-operator / circle set, kept bounded by
   keeping the trigger set trusted." This decision applies exactly that trade to the thick-local friend: the server is
   the **single DB authority**; the friend is authorized **in-app** as a `builder`. The trust boundary equals the
   Members whitelist the owner already curates.

5. **The desktop re-homes its forest writes to the broker.** What ADR-0113's `shared-forest-connection` /
   `forest-readiness` assumed — a direct keyless connector — becomes a **broker client**: the readiness probe checks the
   broker endpoint is reachable and the caller is an authorized `builder` (not that a DB socket is open), and the
   write path POSTs to the broker. The direct-connector code path for the friend is retired (the owner's own
   first-party tooling may still connect directly; this decision scopes the friend).

## Consequences

**Good**
- **No per-friend Cloud SQL IAM grant.** Inviting a co-builder is a fully in-app action through the Members panel the
  owner already manages — no `gcloud`, no handing out a direct key to the production DB. Removing a builder is likewise
  in-app and immediate.
- **The server stays the single DB authority.** Exactly one principal touches Cloud SQL; the friend's machine never
  holds a DB identity or opens a DB connection. Smaller, owner-controlled data-layer attack surface.
- **Local compute is preserved (ADR-0113 stands).** The friend still runs the real loop, build, and gate on his own
  machine and signs locally — this decision changes only *where the persisted bytes enter the forest* (through a
  validated HTTP endpoint instead of a raw DB socket), not *where the work runs*.
- **Authorization rides the surface the owner already curates** (ADR-0042/0043 Members), unifying "may read/comment"
  and "may contribute builds" under one whitelist.

**Bad / accepted costs**
- **Re-introduces one small hosted surface** — a write endpoint — that ADR-0113 had simplified away (its whole appeal
  was sidestepping hosted surfaces for the circle-of-one). This is **far less** than alternative C's full hosted worker
  (no Cloud Run build runtime, no agent-on-shared-infra, no egress policy): it is a single validated, members-gated
  POST handler on the studio that already exists, persisting bytes the friend's local gate already produced.
- **Trust boundary — a `builder` POSTing an already-signed verdict is trusted to be truthful.** A builder could hand
  the broker a hand-crafted "healthy" verdict the local gate did not actually produce. But this is the **SAME trust a
  granted IAM friend already has** under the status quo: a granted identity can write any row — including a forged
  healthy — directly to the forest. The broker is **not weaker** than the direct grant and is in fact **stricter**: it
  validates shape + attribution (the raw DB socket validated neither). And the real backstop against a forged-healthy
  reaching the trunk is **identical in every world**: **CI independently re-proves green before main** (ADR-0022) — a
  wrong in-store verdict is at worst a briefly-wrong hue in the studio, corrected when CI runs (ADR-0091's accepted
  cost, carried over verbatim).

**Neutral**
- **Cryptographically verifying the local spine signature** (vs persisting + validating shape/attribution) is a named
  hardening, deferred: it would catch a forged-healthy *at the broker* rather than at CI, but adds nothing against the
  trust model above (the builder is trusted, like a granted IAM identity, and CI is the backstop either way). Revisit
  if the circle grows past "trusted to be truthful."
- **Hosting is still deferred, not foreclosed (alternative C).** When the circle outgrows "trusted with the source"
  (ADR-0113's precondition), the fully-hosted thin-client worker (ADR-0090 Phase 3 / ADR-0091) returns. B is the
  middle path: local compute kept, only the write brokered.
- The owner's own first-party direct-connect tooling (CLI `--pg`, load-corpus, the studio server itself) is unchanged
  — this decision scopes the **friend's** thick-local write path only.

### Alternatives considered

- **(A) Status-quo thick-local + per-friend IAM grant (ADR-0113 §6 as written)** — rejected: the per-friend grant is
  attended `gcloud` friction the owner repeats per friend, and it hands a third party a direct key to the shared
  production DB (authorization at the data layer).
- **(B) Members-gated write-broker + `builder` role** — **chosen.** Authorization moves to the app layer (the Members
  whitelist), the server stays the single DB authority, and the friend keeps local compute with no DB key.
- **(C) Fully-hosted thin-client worker (ADR-0090 / ADR-0091)** — deferred: it gives up local compute (the build runs
  on hosted infra, re-opening ADR-0113's thick-vs-hosted call and ADR-0108's "biggest new surface" containment cost).
  B re-introduces only a write endpoint, not a whole hosted build runtime.

## References

- [ADR-0113](0113-thick-local-desktop-for-the-inner-circle-the-drive-machinery.md) — thick-local desktop; **amended**
  (§6 direct keyless Cloud SQL write for *friends* replaced by a brokered write to the hosted studio; local compute,
  the shared-forest source of truth, and every other clause stand).
- [ADR-0043](0043-app-owned-users-roles-and-ui-invitations.md) — app-owned users + in-UI invitations; **amended** (a
  third role, `builder`, is added to `admin`/`member`; `resolveAccess` and the Members panel gain the tier).
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted studio behind IAP; the surface that hosts the
  broker and the Members whitelist.
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — the gate-signs-then-persists
  integrity model and the app-layer-authz-over-the-circle trade this decision reuses; the broker holds no signing key.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless Cloud SQL IAM; the per-friend grant this
  decision removes for friends.
- [ADR-0022](0022-ci-green-gate-and-auto-merge.md) — CI re-proves green before the trunk; the backstop against any
  forged-healthy verdict, identical in every alternative.
- [ADR-0090](0090-ui-driven-orchestration-hosted-build-capable-backend-thin-cl.md) — the fully-hosted thin-client
  worker (alternative C), deferred.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) — the Members-panel invite UX is
  operator-attested.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — owner-directed in conversation → born accepted.
