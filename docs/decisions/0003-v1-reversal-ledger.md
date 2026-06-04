# ADR-0003: v1→v2 disposition ledger

**Status:** proposed (2026-06-04) — for *why* any call was made, read the cited v1 (Agentic) ADR.

The index of where every v1 decision went, so nothing is silently dropped and the settled reversals are not re-litigated. Not a justification doc — a routing table.

## Settled reversals (closed)

Rust→TS/Node/pnpm · SurrealDB→Postgres/DBOS · Claude-subscription-subprocess→pi+API-keys · managed-GCP/SWE-bench→local. Two v1 principles explicitly **dead**: the subscription-auth ban, and "cascade rounds are not a cost" (per-node budget resurrected in ADR-0005).

## Every v1 ADR

| v1 ADR | | v2 home |
|---|---|---|
| 0001 Rust | superseded | TS stack (0001); boundaries/invalid-states → core |
| 0002 SurrealDB | superseded | Postgres/DBOS (0001) |
| 0003 Claude-sub subprocess | superseded | pi+keys; orchestrator-only-spawns → 0004 |
| 0004 no-bootstrap-generator | obsolete | per-node spec name open → open-q §4 |
| 0005 red-green | carry | forensic, contract-level → 0007 |
| 0006 hardening loop | carry | run≠node → 0004; cold-rebuild → 0007; human-can-intervene → 0008 |
| 0007 stories-consume-assets | carry | guidance assets → ADR-0010 (guidance system) |
| 0008 mock/UAT seam | carry | seam → 0007; own wrapper → 0004 |
| 0010 in-sandbox orchestrator | superseded | fan-out → 0004/0005; budget inverted → 0005 |
| 0011 forum | carry | forum + verification-wins → ADR-0010 |
| 0012 cred bridge | obsolete | security note |
| 0013 branch-per-session | carry/reshape | DBOS+Postgres isolation → 0009 |
| 0014 gate signing-walk | carry | never-bypass content invariants → 0008 |
| 0015 SWE-bench container | obsolete | "benchmark the system" note |
| 0016 cred daemon | obsolete | security note |
| 0017 deployment-filter | obsolete | packaging note; `deployment` not carried |
| 0018 Cloud Run Jobs | superseded | DBOS queues (0009) |
| 0019 OAuth-token env | superseded | dead auth |
| 0020 decompose-before-implement | carry/defer | DAG-stabilisation → 0007 + open-q §4 |
| 0021 Secret Manager (tracked) | superseded | security note |
| 0021 cc-extension (orphan) | inverted | = 0023 → 0006/0008 |
| 0023 cc-extension observability | **inverted** | driving IDE over pi stream → 0006/0008 |
| 0022 cross-session coordination | carry/reshape | claims as rows → 0009; channel → ADR-0010 |
| 0024 UAT-exempt / manual_signings | retired | no special tier — guardrails are contracts (0007), behaviour is guidance (ADR-0010) |
| 0025 origin-aware IDs | carry | DB-allocated, both classes → 0009 |
| 0026 deterministic spine | carry | code-vs-leaf → 0005 |
| 0027 contract-proof model (draft) | superseded | 0002 + 0007 |
| 0028 v2-seed (draft) | superseded | 0002/0007/0009; overrules D9 (race→atomic), D11 (contract→capability); D16 (retire UAT-exempt) stands |

**Now homed (was parked):** cross-cutting knowledge (0007), forum + learning loop (0011), prose channel (0022) → all **ADR-0010** (guidance system).
