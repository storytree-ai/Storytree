# The scoped claim-writer identity, minted and proven narrow

**Date:** 2026-08-14
**Increment:** `codex-claim-writer-scoped-identity` (arc `codex-factory-parity-arc`)
**Nature:** infrastructure only — no repository behaviour changed. This file is the evidence.

## What exists now

| | |
|---|---|
| Service account | `storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com` |
| Project roles | `roles/cloudsql.client`, `roles/cloudsql.instanceUser` (connect only — they confer no table privilege) |
| Impersonation | `user:Hua.Mick@gmail.com` holds `roles/iam.serviceAccountTokenCreator` on it |
| Cloud SQL user | `storytree-codex-claim-writer@storytree-498613.iam` (`CLOUD_IAM_SERVICE_ACCOUNT`) |

Postgres grants — the part that actually scopes it:

```sql
GRANT USAGE  ON SCHEMA events                        TO "storytree-codex-claim-writer@storytree-498613.iam";
GRANT SELECT, INSERT, UPDATE, DELETE ON events.node_claim  TO "…";
GRANT INSERT ON events.claim_event                   TO "…";
GRANT USAGE  ON SEQUENCE events.claim_event_seq_seq  TO "…";
```

**Reaches 2 of 19 tables in `events`.** The audit table is append-only for this identity (INSERT
only, no SELECT/UPDATE/DELETE) — strictly narrower than the `storytree-ci-presence` precedent, which
holds `rU` on the same sequence where this holds `U`.

## Why the grants, not the name, are the scope

The increment's own warning, restated because it is the whole point: *a service account named
`claim-writer` is not scoped by its name.* Cloud SQL IAM maps a login to an identity; what that
identity may DO comes from Postgres grants. So the deliverable is the negative test, not the account.

**The precondition that made a narrow grant meaningful was checked first:** `PUBLIC` holds **nothing**
in the `events` schema, and schema `USAGE` is granted per-identity. Had `PUBLIC` carried privileges,
every grant below would have been decoration.

## The proof

Run as the writer itself, via `createPool({ user, impersonateServiceAccount })`:

```
connected as: storytree-codex-claim-writer@storytree-498613.iam

--- POSITIVE: the two operations the broker performs ---
  ok      take     INSERT events.node_claim
  ok      promote  UPDATE events.node_claim grade->work
  ok      audit    INSERT events.claim_event

--- NEGATIVE: READ each of the 17 non-claim tables ---
  refused SELECT adr_number          refused SELECT attestation      refused SELECT change_event
  refused SELECT claim_cursor        refused SELECT comment          refused SELECT comment_event
  refused SELECT library_artifact    refused SELECT library_event    refused SELECT schema_migration
  refused SELECT suggestion          refused SELECT suggestion_event refused SELECT uat_drive
  refused SELECT usage_event         refused SELECT user             refused SELECT user_event
  refused SELECT verdict             refused SELECT work_event

--- NEGATIVE: WRITE the two most sensitive non-claim tables ---
  refused INSERT library_artifact
  refused DELETE verdict

--- NEGATIVE: claim_event stays append-only for this identity ---
  refused SELECT claim_event   refused DELETE claim_event   refused UPDATE claim_event

--- NEGATIVE: no reach outside the events schema ---
  refused CREATE TABLE in public
  refused read pg_authid (credential surface)

=== VERDICT ===
  positives : 3/3
  leaks     : NONE
  SCOPE PROVEN
```

Probe rows were removed afterwards as the schema owner; the live ledger holds no residue.

## ⚠ The trap that faked a clean pass

The first version of the negative test discovered the non-claim tables by querying
`information_schema.tables` **as the writer**. That view is **permission-filtered**: the writer can
only see the two tables it already reaches, so the loop iterated an empty list, printed nothing, and
reported no leaks — a green result that tested nothing at all.

**A negative permission test must hard-code its target list from the owner side.** The inventory of
19 tables is enumerated as the owner and pasted into the test; if a new table is added to `events`
and not added to that list, the test silently stops covering it. That is the known cost of the
hard-coding, and it is still the lesser evil.

A second, milder version of the same shape: an `INSERT` that fails on a `NOT NULL` column has already
passed the permission check. Read the error — `permission denied for sequence claim_event_seq_seq`
and `null value in column "doc" violates not-null constraint` are different findings, and only the
first is about scope.

## What this does and does not settle

- **Settled:** the write path no longer has to hold the operator's personal cloud identity. A
  credential exists that can take and promote claims and reach nothing else.
- **NOT settled:** nothing yet USES it. The bootstrap still dials Cloud SQL directly with
  `loadLocalSecrets()` + `createPool()`. This account only becomes load-bearing when the broker
  (`codex-out-of-sandbox-claim-broker`) holds it and the bootstrap dials the broker
  (`codex-bootstrap-dials-the-broker`).
- **Ordering, deliberately:** this landed BEFORE the broker so the broker is never built holding a
  personal credential — per the increment's own dependency note.

## Reproducing the negative test

The proof is not committed as a live test: it needs impersonation credentials and would be a
skipped rung on every ordinary gate. To re-run it after any grant change, connect as the writer with
`createPool({ user: "storytree-codex-claim-writer@storytree-498613.iam", impersonateServiceAccount:
"storytree-codex-claim-writer@storytree-498613.iam.gserviceaccount.com" })`, attempt one read of each
of the 19 tables enumerated as the owner, and assert exactly `node_claim` answers.
