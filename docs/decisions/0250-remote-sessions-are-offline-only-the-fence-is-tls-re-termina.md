---
status: accepted
amends: [89]
decided: 2026-07-26
load_bearing: true
---
# ADR-0250: Remote sessions are offline-only: the fence is TLS re-termination, not a port block

## Status

accepted (2026-07-26) — the owner handed this fork to an agent session with explicit delegation:
"decide and implement the durable answer … if your investigation settles it on evidence, just pick,
record the ADR, and proceed" (ADR-0110: owner direction at design time IS ratification). The
investigation settled it, and it settled it the same way [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md)
already had — so this ADR **amends** 0089's mechanism and closes its deferral question, rather than
re-opening the fork.

The `amends: [89]` edge binds two things: ADR-0089's **Context** measurement (its port-block account
of the blocker is superseded by the mechanism below) and its **D3** deferral (which stays deferred,
now on stronger evidence and with the vehicle named). ADR-0089 D1, D4 and D5 stand unchanged.

## Context

**The trigger.** A Claude Code remote (web/VM container) session on 2026-07-26 tried to reach the
live library tier, failed, and handed its evidence forward without committing anything. The owner
asked for the durable answer: grant + wire the existing hosted studio (A), build a 443 HTTPS gateway
fronting the store (B), or accept that remote sessions are offline-only and make the failure legible
(C).

**The mechanism ADR-0089 got wrong.** ADR-0089 (2026-06-22) measured "only port 443 is reachable, to
ANY host — every other port times out" and concluded a port-and-protocol fence. `CLAUDE.md` has since
told every session that remote DB work fails because "the 443-only egress blocks" port 3307. The
2026-07-26 re-measurement shows that is **not** the operative fence:

- **Raw sockets** from the container are still 443-only — `34.116.114.82:3307` blocked, `:443` open.
  ADR-0089's measurement was of this layer and remains correct for it.
- **The agent proxy CONNECT-tunnels arbitrary ports.** `portquiz.net:3307` and `portquiz.net:5432`
  both returned "Port test successful!" through the proxy. So a session is *not* confined to port 443
  — which kills the port-block explanation.
- **The fence is TLS re-termination.** TLS on any non-443 port is reset. Confirmed twice: a full
  Cloud SQL mTLS handshake with a *valid* ephemeral cert → `ECONNRESET`, and an unrelated control
  (`smtp.gmail.com:465`) → the identical reset. The proxy terminates and re-originates TLS, so a
  client-mTLS handshake cannot survive it.
- **This is written policy, not an accident.** The harness's own `/root/.ccr/README.md` states:
  *"Not supported through the proxy (report, do not work around): … client-mTLS, certificate-pinned
  clients, non-443 HTTPS ports, raw-TCP databases."* Cloud SQL's connector is all three at once.

The correction matters beyond pedantry: sessions reasoning from "a port is blocked" keep reaching for
port-shaped workarounds (a tunnel, a forwarder, a different port), all of which are dead ends *and*
are explicitly out of bounds. Sessions reasoning from "TLS is re-terminated and client-mTLS is
excluded by policy" reach the correct conclusion immediately — only a legitimate 443-shaped HTTPS
application can ever work.

**The credential and control-plane story is fine, and is now stronger than ADR-0089 recorded.**

- A GCP service-account key reaches the container as `GOOGLE_APPLICATION_CREDENTIALS_JSON` →
  `storytree-remote-dev@storytree-498613`. JWT-bearer token mint works.
- The Cloud SQL Admin REST control plane works completely (ADR-0063's REST-only db-control is what
  makes this possible — no `gcloud` binary is installed): `storytree-pg` reads `RUNNABLE` /
  `activationPolicy: ALWAYS`, and both `connectSettings` and `generateEphemeralCert` succeed.
- **`storytree-remote-dev` is already a provisioned `CLOUD_IAM_SERVICE_ACCOUNT` Cloud SQL user.** The
  DB-side grant exists. Only the network path is missing — a fact worth recording precisely, because
  it means no future session should spend time on the grant.
- The offline gate is green there (`pnpm -r typecheck` clean, `pnpm -r test` exit 0).
- The SA **cannot stand up its own infrastructure**: `run.services.*`, `cloudbuild.builds.create`,
  `compute.instances.create`, `iam.serviceAccounts.actAs`, `serviceusage.services.enable`,
  `storage.buckets.create` are all DENIED (`cloudsql.instances.{connect,get,update,login}`,
  `secretmanager.versions.access` and `resourcemanager.projects.get` are granted). Any bridge has to
  come from a laptop session, by construction.

**What a remote session actually loses.** Enumerated rather than assumed, because the cost of C is
the whole case against it:

| Capability | Blocked? | Consequence today |
| --- | --- | --- |
| Offline gate, typecheck, tests | no | — |
| Code + docs authoring, full GitHub/PR surface | no | — |
| Library read commands (`library`, `artifact <id>`, `tree focus`) | no | run on the in-memory seed |
| `adr new` number allocation | degraded | falls back to `max+1` with a loud "not reserved" warning; the `adr-number-unique` gate + the cross-PR CI check catch a collision before it lands (ADR-0050) |
| `noticeboard declare --pg` | yes | the session is invisible on the map. The gate is *not* blocked — see the note below this table |
| `library artifact edit/new --pg` | **yes, hard** | no workaround |
| `--live` / `--real` builds with `--store pg` | yes | no workaround — and proof-bearing builds are laptop work by design anyway (ADR-0089 D1, ADR-0091) |

*(Corrected in place 2026-08-06 per ADR-0139; nothing decided here is re-decided and the table's verdict
is unchanged — a remote session's gate is still not blocked by being unable to declare. The reason
changed. This row read "**`check:declared` SKIPs** on an unreachable DB, so the gate is not blocked
(ADR-0200 D3)". ADR-0311 D2 retired `check:declared` from root policy and CI outright, so the gate is
now unblocked because the rung does not run at all — not because it skips. The stronger conclusion holds
for the same practical purpose, but a reader must not infer a live SKIP arm that is still watching.)*

So the genuinely lost capability is **library artifact writes**. Everything else is either unaffected,
gracefully degraded, or already tethered by an existing decision.

**Why A and B do not earn their cost.** Both were evaluated against the studio's actual API surface,
not its reputation.

- **A (grant the SA IAP access to the hosted studio) is incomplete, and the check the owner asked
  for is the reason.** `apps/studio/server/apiRouter.ts` serves `/api/assets` with GET/POST/PATCH/
  DELETE — that genuinely covers artifact CRUD. But `/api/claims` is **GET-only** (no declare), and
  there is **no ADR-allocation endpoint at all**. Two of the three named needs are simply absent. It
  is also identity-wrong: direct IAP wants its OAuth client ID as the token audience (both the
  `…/locations/…/services/storytree-studio` and `global/backendServices` forms return 401 `Invalid
  JWT audience`), reading that client ID needs `iap.*` permissions the SA lacks, and the studio's
  write paths gate on a **members** row — so landing A means enrolling a *service account* as a
  studio member with write scope. That is a change to who can authenticate, not a wiring task.
- **B (a new 443 gateway) is not the increment it looks like — and its correct form already exists.**
  [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) (deferral lifted by
  ADR-0180) already decided this exact architecture for a different caller: a remote party POSTs to a
  members-gated write endpoint on the hosted studio, the server persists under its single SA DB
  identity, no per-caller Cloud SQL grant, app-layer authz bounded by the members whitelist.
  `/api/write-broker` is that endpoint, built. So "build a gateway" is really "extend the broker's
  write set" — which is the right shape and a genuine option, but it is **not** blocked on
  infrastructure, and it inherits ADR-0089 D4's guard (no proof-bearing writes through a thin bridge)
  and ADR-0117's attribution wall (signer ≡ IAP-authenticated caller).
- **Both A and B shared the same unbuilt client-side half:** the CLI speaks `pg` directly through
  `createPool`, and at the time of this decision nothing in the repo spoke HTTP to a store. Either
  path therefore needed a second store implementation behind the `Store` seam plus a wire contract to
  keep in sync with `pg-store.ts` — precisely the drift cost ADR-0089 named as "the main reason to
  defer". *(No longer current: that client half was built on 2026-07-27 under
  [ADR-0259](0259-every-client-reaches-the-store-through-an-http-front-door-di.md) — `store-wire.ts`
  plus `HttpStore` in `packages/storage-protocol`, held to the same `storeParitySuite` as the other
  backends. It migrated no caller and stood up no server, so the fork below is untouched; the cost
  weighed here is now paid rather than pending.)*
- **And both turn on a question this session is not entitled to settle:** whether a *non-human*
  identity — a service account whose private key sits in plaintext in an ephemeral container's env —
  should hold library write scope. That is a change to who can authenticate and an access-widening
  IAM grant, both owner-gated.

**The residual harm is real and is not the fork.** Today the failure is not an error, it is a
**hang**: `probeLiveDb` burns its 45s budget, `ensureDbUp` concludes "unreachable", starts an
instance that was never the problem, and polls it for 420s — roughly eight minutes to arrive at a
message that sends the reader after a healthy database. That is a defect regardless of which path
wins, and fixing it is not a bet on any of them.

## Decision

### D1 — Remote sessions are offline-only. This is the settled answer, not a pending question

Path **C**. ADR-0089 D1 ("do live DB work from a laptop session") and D3 ("the bridge is deferred,
not adopted") were right and are now re-affirmed on stronger evidence: the proxy's own policy
instructs *report, do not work around*, so the class of cheap fixes is not merely ineffective but out
of bounds. Remote/web sessions stay first-class for code, docs, ADR prose, the whole offline gate,
and the full GitHub/PR surface — and are **not** a place to reach the DB.

This is recorded as a decision rather than a deferral so no future session re-runs the investigation.
Three sessions have now measured this fence (2026-06-22, 2026-07-26, and this one).

### D2 — The blocked data plane refuses fast and legibly, naming the real mechanism

A session whose egress structurally cannot carry a Postgres connection must learn that in
milliseconds, from a message that names the cause — not after eight minutes, from a message about a
database that is up.

- `dataPlaneRefusal(env, probe)` (`packages/library/src/store/data-plane.ts`) is a **pure** predicate
  over the environment plus an injected directory probe, so the whole decision is offline-testable.
- It is **deliberately conservative**, because the error costs are asymmetric: a false positive
  refuses the owner's own laptop (breaking the daily driver), while a false negative merely leaves
  today's hang in place. It fires only on the harness's own remote marker directory
  (`/root/.ccr`), **or** on a remote-shaped GCP credential (`GOOGLE_APPLICATION_CREDENTIALS_JSON`)
  **and** a configured egress proxy together. None of these hold on a laptop session (measured).
- `createPool` enforces it. That is the single choke point every `--pg` write, `--store pg` build, and
  gate `check:*` rung funnels through, so one guard covers them all — and callers that already treat
  a `createPool` throw as "live store unavailable" keep skipping exactly as they do offline; only the
  reason they print gets better.
- `ensureDbUp` refuses **before** its first probe and before `db:up`, so a blocked session never
  spends the 45s probe or the multi-minute cold-start poll (that poll's budget is ADR-0060's to set —
  420s when this was written, 600s since 2026-07-30 — and this guard skips all of it either way).
- `STORYTREE_ALLOW_DATA_PLANE=1` overrides unconditionally, so an environment whose egress is later
  fixed is not bricked by a stale fingerprint.

### D3 — If the deferral is ever lifted, the vehicle is the ADR-0117 broker — never a new gateway, never the studio's ad-hoc asset API

Pre-deciding the shape so a future session cannot pick a worse one:

1. **Extend `/api/write-broker`'s write set**; do not stand up a second service. ADR-0117's trade —
   the server is the single DB authority, callers are authorized in-app against the members
   whitelist, no per-caller Cloud SQL grant — is already accepted and built.
2. **ADR-0089 D4's guard is unchanged and binding:** no proof-bearing writes through the bridge. No
   verdict writes, no `events.work_event` writes, nothing the prove-it-gate signs. With the forgeable
   endpoints absent, forging proof through the bridge is impossible by construction.
3. **A non-human caller is a separate decision.** ADR-0117's broker authenticates a *human* member
   through IAP. Admitting a service account — one holding a long-lived key inside an ephemeral
   container — is a change to who may authenticate and is **owner-gated**, not implied by this ADR.
4. **Only lift the deferral on demonstrated recurring need.** The demand has not materialised in the
   ~5 weeks since ADR-0089; the trigger is repeated real blockage, not the next time it is
   inconvenient.

### D4 — `CLAUDE.md` states the mechanism, not the port

The remote-session bullet is corrected to name TLS re-termination and the client-mTLS policy
exclusion, and to point here. Sessions reason from the model they are given; the wrong model has been
sending them down port-shaped dead ends.

## Consequences

**Good**

- The question is closed with a decision instead of a deferral, and the mechanism is recorded
  precisely enough that no fourth session re-derives it.
- The worst concrete symptom — an ~8-minute hang ending in a misleading message — is fixed now,
  independently of the fork, and the fix is a pure function with an offline red→green test.
- The evaluation of A is recorded with the specific gap (`/api/claims` is GET-only; no ADR-allocation
  endpoint), so "just wire the studio" cannot be re-proposed without confronting it.
- If the deferral is ever lifted, the vehicle, the guard, and the owner-gated question are already
  chosen, so the increment is small and cannot drift into a forgeable surface.
- One durable, keyless-adjacent fact is captured: the `storytree-remote-dev` Cloud SQL user already
  exists, so a future bridge needs no DB-side grant work.

**Bad / accepted costs**

- Library artifact writes stay impossible from a remote session. This is a real capability loss with
  no workaround — accepted because the demand is low and every alternative costs a second store
  implementation plus a widened authentication surface.
- The fingerprint in D2 is a heuristic over an environment the repo does not own. It is conservative,
  overridable, and fails **open** (an unrecognised remote session degrades to today's behaviour, not
  to a false refusal) — but it will need revisiting if the harness changes its container shape.
- A remote session remains invisible on the notice board. Nothing is blocked, but the map under-reports.
  *(Corrected in place 2026-08-06 per ADR-0139; the consequence is unchanged. This read "`check:declared`
  SKIPs rather than fails, so nothing is blocked" — ADR-0311 D2 retired that rung from root/CI policy,
  so nothing is blocked because nothing runs.)*

**Neutral**

- Nothing about the laptop path changes: `dataPlaneRefusal` returns `null` there and every code path
  behaves exactly as before.

## Open — owner-gated, deliberately not decided here

1. **Rotate the `storytree-remote-dev` key, and reconsider whether the identity should be keyless.**
   A long-lived private key sits in plaintext in the remote container's env — and therefore in that
   session's transcript. This is against [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md)'s
   keyless-ADC posture. Note that D1 makes the key **useless for its original purpose**: the data
   plane it was provisioned to reach is unreachable by construction, and what it is still used for
   (the REST control plane) is read-mostly. So the cheapest safe answer may be to retire the identity
   rather than rotate it. Either way: an owner call on credentials.
2. **May a non-human identity ever hold library write scope?** The gating question for D3, and the
   real reason A and B are not landed here.

## References

- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) — amended: the
  bridge deferral (D3) is confirmed and closed; its port-block mechanism is corrected. D1/D4/D5 stand.
- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) + ADR-0180 — the brokered
  write architecture D3 names as the only vehicle.
- [ADR-0063](0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md) — REST-only
  db-control; the reason the control plane still works remotely with no `gcloud` binary.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — the keyless posture the injected
  SA key departs from (open item 1).
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted studio behind direct IAP (the
  surface path A would have used).
- [ADR-0050](0050-adr-number-allocation.md) — why a remote session's `max+1` ADR fallback is safe.
- [ADR-0200](0200-the-noticeboard-is-the-claim-ledger-forced-session-claims-pr.md) D3 — `check:declared`
  SKIPs on an unreachable DB, so a remote session's gate is not blocked.
- `packages/library/src/store/data-plane.ts` (+ `.test.ts`) — the D2 refusal.
- `packages/library/src/store/connection.ts`, `packages/drive/src/db-control.ts` — the two enforcement
  points.
- `apps/studio/server/apiRouter.ts` — the surface path A was evaluated against.
