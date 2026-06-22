---
status: proposed
decided: 2026-06-22
---
# ADR-0089: Live DB access from 443-only remote sessions: the bridge is the only path, scope it or use a laptop

## Status

proposed — findings recorded with the owner in conversation on 2026-06-22 while investigating why a
phone-spawned remote (Anthropic VM) session could not do live `--pg` / build work. The **network
findings** below are settled fact (measured this session). The **bridge recommendation** is a
guarded proposal, not a commitment to build: the owner explored it, surfaced two concerns (a second
store implementation; a reward-hacking pathway), and asked that the reasoning be captured as input
for a later session. Default operating stance stands: **use a laptop session for live DB work.**

> **Amended by [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md)**
> (accepted, 2026-06-22) — the laptop-only default for *proof-bearing* builds is relaxed by
> sanctioning a self-contained, gate-running WORKER as a distinct vehicle (the gate observes RED then
> GREEN and signs; no verdict is ever handed in). The network findings above and the read-only-bridge
> guard (no proof-bearing writes through a thin bridge) stand unchanged; the bridge itself remains
> deferred.

## Date

2026-06-22

## Context

Remote sessions (Claude Code on the web, and the phone-spawned Anthropic VM) run in an ephemeral
container whose **outbound egress is a web-only HTTPS proxy**. A session investigated whether such a
session can reach the live Cloud SQL Postgres directly. The credential and control-plane story is
**not** the blocker (this corrected a stale claim in `CLAUDE.md`, fixed in PR #248):

- `gcloud` is no longer required — `db:up` / `db:down` / `db:status` are REST now (ADR-0063). Verified
  from the VM: `pnpm db:status` → `RUNNABLE  ALWAYS`.
- Credentials are present and keyless auth works — the `storytree-remote-dev` service-account key is
  carried in env, and `scripts/remote-session-setup.sh` (a registered SessionStart hook) hydrates
  ADC + `~/.storytree/secrets.json`. The SA mints Google access tokens fine. So the **REST control
  plane** (Cloud SQL Admin API over 443) works from a remote session.

The blocker is the **data plane**. Measured from the VM this session:

```
# Only port 443 is reachable, to ANY host — every other port times out:
1.1.1.1:443        -> OPEN          1.1.1.1:53         -> TIMEOUT
<cloudsql-ip>:443  -> CONNECTED     <cloudsql-ip>:3307 -> TIMEOUT (Postgres data port)
github.com:443     -> CONNECTED     github.com:22      -> TIMEOUT
smtp.gmail.com:587 -> TIMEOUT       8.8.8.8:853        -> TIMEOUT
```

The Cloud SQL Node connector (`packages/store/src/connection.ts`) dials Postgres on **3307**, which
is blocked — so any DB *connection* hangs while the control plane succeeds.

Two follow-up questions were tested to exhaustion:

1. **"Open the database to 443?"** — No. Cloud SQL is managed; its ports are fixed (3307 via the
   connector, 5432 direct) and not configurable. Reaching Postgres-on-443 would mean abandoning
   managed Cloud SQL (losing keyless IAM auth per ADR-0021, backups, idle-stop) — a large regression.
2. **Is 443 a port-allow or a protocol-aware proxy?** — Protocol-aware. Test: dialing
   `ssh.github.com:443` (a **non-HTTP** protocol on the web port) **connected at the TCP layer but
   the server never spoke** — the proxy silently dropped the non-web conversation. So the gate
   inspects the *protocol*, not the port number: only genuine HTTPS traffic leaves the sandbox. This
   kills the cheap "dumb TCP forwarder 443→3307" idea — even on 443, raw Postgres bytes are dropped.

The web-only egress is a deliberate containment feature (the sandbox runs agent-authored code; it
must not phone out to arbitrary hosts/ports). It is not a misconfiguration to be "fixed."

## Decision

1. **Default: do live DB work from a laptop session.** A laptop sits behind a permissive network (it
   can dial 3307), so the already-built keyless path (ADR-0063 + the SA bootstrap) works with zero new
   code, zero new internet-facing surface, and zero new forging pathway. This is the standing
   recommendation; remote/VM sessions remain first-class for code, the offline gate, and the full
   GitHub/PR surface, but **not** for DB connections.

2. **The only way to reach the DB from a 443-only session is an HTTPS bridge** — a web server that
   speaks HTTPS on 443 (the one thing the sandbox passes) and re-speaks Postgres internally. **Cloud
   Run is exactly this** and already exists here (`storytree-studio`, ADR-0042: Cloud Run behind IAP,
   already fronting the store over HTTP for the UI). Cloud Run only serves HTTP, so it *necessarily*
   takes the application-bridge shape — there is no "dumb pipe" variant available through it.

3. **The bridge is DEFERRED, not adopted.** It is built only if untethered web/phone-session DB
   access becomes a real, recurring need — and then as a deliberate increment, not a hack.

4. **If built, the bridge MUST be scoped (the load-bearing guard).** The two owner concerns are real
   and are addressed by *shape*, not by hosting:
   - **Reward-hacking (forging proof):** the bridge MUST NOT expose proof-bearing writes — no verdict
     writes, no `events.work_event` writes, nothing the prove-it-gate signs (ADR-0020). Those stay on
     direct/laptop sessions where the spine observes RED/GREEN. With the forge-able endpoints simply
     absent, forging proof through the bridge is impossible **by construction**. Expose only: reads
     (library/tree exploration, artifact views) and *safe* writes (presence declarations; possibly
     library artifact edits). Precedent: the hosted studio already runs with "db control off" —
     same discipline, one notch wider.
   - **Identity collapse (ADR-0021):** the Cloud Run service hits the DB as *its own* service account,
     so per-principal IAM identity/audit is lost and authz moves to the app layer. A scoped,
     read-mostly surface keeps the stakes of that low; a full write surface would not.

5. **First increment, if pursued: a read-(plus-safe-write) slice** reusing the studio server — enough
   to explore the library and do light edits from anywhere, with proof-bearing work staying tethered.

## Consequences

**Good**
- The "why can't the VM reach the DB?" question is settled with evidence; a future session need not
  re-derive it. The default (laptop) is unambiguous.
- If the bridge is ever built, the integrity guard (no proof-bearing writes) is pre-decided, so the
  prove-it-gate cannot be end-run through it.
- Cloud Run is identified as the correct and already-present vehicle; the first increment is small.

**Bad / accepted costs (only if the bridge is built)**
- **A second store implementation + a wire contract** to keep in sync with `pg-store.ts` — a real
  drift surface (cf. the studio's git-HEAD banner for "checkout moved under the server"). This cost is
  inherent to talking to the store a second way and is the main reason to defer.
- A privileged, internet-reachable (IAP-gated) endpoint; its trust boundary must equal the
  trusted-operator set. Scoping reads/safe-writes only keeps the blast radius bounded.
- Per-principal DB identity is replaced by app-layer authz.

**Neutral**
- Live builds that must persist verdicts remain laptop/direct-session work by design — which is the
  correct place for trust anyway.

## References

- PR #248 — corrected the stale `CLAUDE.md` "Remote (web) sessions" bullet (gcloud/credentials were
  the wrong reason; the 443-only egress is the real blocker).
- [ADR-0063](0063-db-control-over-the-cloud-sql-admin-rest-api-retire-the-gclo.md) — REST control
  plane, gcloud subprocess removed.
- [ADR-0021](0021-keyless-agent-session-auth-and-db-bootstrap.md) — keyless Cloud SQL IAM auth (the
  per-principal identity a bridge would collapse).
- [ADR-0042](0042-hosted-studio-demo-cloud-run-iap.md) — the hosted studio: Cloud Run behind IAP
  already fronting the store over HTTP (the bridge's natural home; "db control off" precedent).
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — the prove-it-gate / signed verdicts
  (what the "no proof-bearing writes" guard protects).
- [ADR-0034](0034-process-artifacts-ways-of-working.md) — durable home for ways-of-working (the
  laptop-vs-remote DB workflow belongs in a `process` artifact, authored from a session that has the
  DB).
- `packages/store/src/connection.ts` (connector dials 3307); `packages/storage-protocol` (the `Store`
  contract a bridge client would re-implement; formerly `base`, renamed per ADR-0078);
  `apps/studio/server/` (the existing store-over-HTTP surface).
