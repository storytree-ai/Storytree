---
status: accepted
decided: 2026-07-27
amends: [250]
---
# ADR-0254: A non-human identity may hold library write scope; proof-bearing writes stay human-tethered

## Status

accepted (2026-07-27) — decided/directed by the owner in conversation on 2026-07-27. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Amends** [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) — it closes
0250's two deliberately-open owner-gated questions and corrects the one Context claim the owner's
action overtook. It **overturns nothing**: 0250 D1 (remote sessions are offline-only), D2 (the fast
legible refusal), D3's vehicle and guard, and D3.4's build trigger all stand exactly as written.

## Context

ADR-0250 settled the remote-session DB fork on evidence but ended with an `Open — owner-gated`
section holding two questions it explicitly was not entitled to answer:

1. rotate — or retire — the long-lived `storytree-remote-dev` service-account key; and
2. may a non-human identity ever hold library write scope?

The owner answered both on 2026-07-27: **the service account is disabled**, and **yes**.

**What the second answer actually changes.** Not "a model may write to the library" in the loose
sense — models already do, constantly. Every `storytree library artifact edit --pg`, every
`arc increment add`, every `adr new` allocation in a local session is a model-authored write today.
What was unsettled is narrower and sharper: whether a **machine identity may hold that write scope in
its own right**, rather than borrowing the owner's ambient ADC on the owner's own laptop. That is the
question ADR-0250 D3.3 flagged as "a change to who may authenticate", and it is the one now answered.

**Why the answer is defensible on this tier specifically.** The library is a **revisable, curated**
tier. A wrong artifact is caught by schema validation at the write path, by the librarian pass before
each merge, by the version floor, and by a human read surface in the studio; and it is corrected by
editing it. Nothing downstream treats a library row as evidence that work was proven. The proof tier
is the opposite on every count — which is why widening one says nothing about the other, and why this
ADR states the line rather than leaving it to inference.

**The attribution surface that already exists.** Worth recording so D3 is not read as new machinery:
`events.library_event.actor` is `TEXT NOT NULL` (`packages/library/src/store/schema.sql`), every write
path threads an actor (`pg-store.ts`, `pg-comment-store.ts`, `arc.ts`, the ADR allocator), and the
number allocator already records `slug`/`branch`/`actor` per allocation. The **column** is there and
non-null. What is thin is the **discipline**: unset callers fall back to a generic `"system"` /
`"cli"`, so today's writes are attributable to a tool, not always to a session.

**What the owner's first answer overtook.** Disabling `storytree-remote-dev` removes the only GCP
identity a remote container was handed. ADR-0250's Context and its shipped refusal message both record
that the Cloud SQL Admin **REST control plane** still works from a remote session (ADR-0063, no
`gcloud` binary needed). That is no longer true: with the SA disabled, a remote session is
un-credentialled toward GCP entirely, so `db:status` and the activation flip fail there too. This costs
nothing real — a session that cannot reach the data plane has little use for starting the instance —
but two pieces of prose now tell a reader something false, and one of them is a runtime message.

## Decision

### D1 — A non-human identity may hold library write scope

Answered by the owner. A machine identity — an agent session, a service account, or a future brokered
caller — may hold write scope over the **knowledge tier**: artifacts (definitions, principles,
guardrails, patterns, processes, agents), arcs and plans, friction items, comments, and ADR number
allocation.

This is a posture, not an instruction to provision anything. Nothing is granted by this ADR.

### D2 — Proof-bearing writes stay human-tethered; ADR-0089 D4 is unchanged

D1 does **not** extend to the proof tier. Unchanged and binding, restated here so no future session
reads D1 as the wider permission it is not:

- no `events.verdict` writes,
- no `events.work_event` writes,
- nothing the prove-it-gate signs,

by any non-human identity acting in its own right, and in particular not through a bridge
([ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) D4,
[ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) D3.2). Proof-bearing
builds remain laptop work, spine-signed, as ADR-0091 already requires.

The reason is the asymmetry in Context: knowledge is revisable and curated; proof is the evidence the
system's honesty rests on. A forged or careless verdict is not caught by a librarian pass — it is
exactly what [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md)'s
verification-integrity work exists to detect. Widening the knowledge tier must not be quoted as
precedent for widening that one.

### D3 — A non-human write must be attributable to the session that made it

Any write taken under D1 must carry an actor that identifies the writing **session or identity** — not
a generic tool name. Machine authorship is acceptable; **anonymous** machine authorship is not, because
the curation loop D1 leans on (the librarian pass, `edit-first-curation`) depends on being able to ask
who wrote a thing and why.

This is a constraint on future work, not a claim about today: the `actor` column is non-null and
threaded, but unset callers still default to `"system"` / `"cli"`. Tightening those defaults is a small
follow-on, deliberately **not** bundled here — this ADR records the requirement so the follow-on has a
rule to implement rather than a preference to argue.

### D4 — `storytree-remote-dev` is retired, not rotated; the prose it overtook is corrected

The owner disabled the service account on 2026-07-27. ADR-0250's open item 1 is closed by **retirement**
— the cheapest safe answer it anticipated, since D1 there had already made the key useless for the data
plane it was provisioned to reach.

[ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md)'s keyless posture is restored: no
long-lived private key sits in an ephemeral container's env, and therefore none is echoed into a session
transcript.

Two now-false statements are corrected in this change:

- `CLAUDE.md`'s remote-session bullet, which lists the REST control plane under "Still fine remotely".
- The `dataPlaneRefusal` message (`packages/library/src/store/data-plane.ts`), which tells a blocked
  session the control plane is still available to it. A runtime message that misdescribes the
  environment is the exact defect ADR-0250 D2 existed to remove, so it is fixed the same way — under
  test.

The D2 refusal **fingerprint** needs no change and is deliberately untouched: it fires on the harness's
`/root/.ccr` marker directory, or on a remote-shaped credential **and** a proxy together. The marker
branch is independent of the credential, so a remote session with no GCP identity at all is still
refused correctly.

### D5 — The permission question is answered; the build trigger is not

ADR-0250 D3.4 — lift the deferral only on **demonstrated recurring need**, never on the next
inconvenience — is unchanged. D1 removes the *permission* blocker on D3; it does not schedule the work,
and it is not a finding of need. The demand still has not materialised.

If and when it does, the vehicle is unchanged and pre-decided: extend `/api/write-broker`'s write set
([ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) + ADR-0180), never a
second service, never the studio's ad-hoc asset API — under D2's guard and D3's attribution rule.

## Consequences

**Good**

- ADR-0250's open section is closed. Both questions have answers on the record, so a future session
  reading it does not re-escalate a settled call to the owner.
- The knowledge/proof line is written down at the moment the knowledge side was widened, which is the
  only moment at which stating it is cheap. D1 cannot later be cited as precedent for D2's territory.
- The keyless posture is whole again, and the credential that departed from it is gone rather than
  rotated — one fewer long-lived secret to own.
- A runtime message and the onboarding file stop telling remote sessions something false.

**Bad / accepted costs**

- Remote sessions lose the Cloud SQL Admin REST control plane along with everything else. Accepted:
  they are offline-only by D1 of ADR-0250, and starting an instance they cannot dial has no use.
- D3 states a requirement the code does not yet fully meet (generic default actors). Recorded as a known
  gap rather than fixed here, to keep this change to the decision it is.
- The `SessionStart` credential bootstrap (`scripts/remote-session-setup.sh`) can no longer do its job:
  a disabled SA mints no JWT, so the Secret Manager fetch that hydrates `CLAUDE_CODE_OAUTH_TOKEN` on a
  pod fails. It is made to degrade to the same no-op as an absent key rather than exit non-zero, so the
  expected steady state is not an ERROR on every remote session. The script is kept, not deleted, so
  the mechanism is ready if an identity is ever re-provisioned.

**Neutral**

- Nothing about a laptop session changes. No grant is created, no scope is provisioned, and no code path
  behaves differently except the corrected messages and the softened bootstrap.
- The **IAM identity** is disabled, but the **Cloud SQL user row survives** — measured 2026-07-27,
  `storytree-remote-dev@storytree-498613.iam` still lists as a `CLOUD_IAM_SERVICE_ACCOUNT` on the
  instance. So ADR-0250's "the DB-side grant already exists" fact still holds; what a future bridge
  would have to restore is the identity, not the grant. Nothing can authenticate as it meanwhile.
  Whether to drop the row as well is a separate, reversible cleanup and an owner call.

## References

- [ADR-0250](0250-remote-sessions-are-offline-only-the-fence-is-tls-re-termina.md) — amended: both
  open owner-gated items closed; its control-plane Context claim corrected. D1/D2/D3 stand.
- [ADR-0089](0089-live-db-access-from-443-only-remote-sessions-the-bridge-is-t.md) D4 — the
  no-proof-bearing-writes guard D2 restates.
- [ADR-0117](0117-broker-the-inner-circle-s-builds-a-members-gated-write-endpo.md) + ADR-0180 — the
  brokered write endpoint that remains the only vehicle if D5's trigger ever fires.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — the keyless posture D4 restores.
- [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) — the
  verification-integrity work D2 protects.
- `packages/library/src/store/data-plane.ts` (+ `.test.ts`) — the corrected refusal message.
- `packages/library/src/store/schema.sql` — `events.library_event.actor`, the attribution column D3
  builds on.
