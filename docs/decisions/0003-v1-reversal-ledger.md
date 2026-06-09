# ADR-0003: v1→v2 disposition ledger

**Status:** proposed (2026-06-04) — for *why* any call was made, read the cited v1 (Agentic) ADR.

The index of where every v1 decision went, so nothing is silently dropped and the settled reversals are not re-litigated. Not a justification doc — a routing table.

## Settled reversals (closed)

Rust→TS/Node/pnpm · SurrealDB→Postgres/DBOS · Claude-subscription-subprocess→pi+API-keys · managed-GCP/SWE-bench→local. Two v1 principles explicitly **dead**: the subscription-auth ban, and "cascade rounds are not a cost" (per-node budget resurrected in ADR-0005).

## v2-internal reversals

- **pi → owned agent loop (ADR-0011).** ADR-0001 chose **pi** as the per-node runtime (the v2 home for v1-0003's "Claude-sub subprocess"); [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) reverses it — storytree now **owns the agent loop and context engineering**, built on the Anthropic SDK. ADR-0001's *model-agnostic, pay-as-you-go* non-negotiable is **relaxed** to start Anthropic-only (pivot if it bites). So the v1-0003 row below now routes **pi → owned loop (ADR-0011)**, and ADR-0004/0005's pi-adapter/leaf are amended to that owned loop. A pi-wording sweep of the glossary + ADR-0006/0008 is the tracked follow-up.
- **owned loop → Claude Agent SDK as live runtime (ADR-0030).** [ADR-0030](0030-all-in-on-claude-agent-sdk.md) supersedes ADR-0011 in part: the live driver is the **Agent SDK on subscription auth**, the owned loop is demoted to the offline/test executor + pivot-out fallback, and "own the window" reframes to "own the map and the pull surfaces" (the story tree + Library are the research object, not the loop). This completes an arc back near v1-0003's starting point — Claude-sub subprocess → pi (0001) → owned loop (0011) → Agent SDK on subscription (0030) — with the spine-side prove-it-gate (ADR-0020) as the structural difference from v1.

## Considered, not reversed

- **TypeScript stack — reconsidered post-pi, NOT reversed (2026-06-06).** With pi dropped (ADR-0011), ADR-0001's TS rationale was partly invalidated (it was partly pi-driven; v1 was Rust), so a Rust rewrite was weighed. Reaffirmed TS, all-in: the agent loop stays TS on the official Anthropic SDK, and **DBOS is kept over Temporal** → an all-TS backend, so a Rust `core` would be an island. See [ADR-0001 § Reaffirmation](0001-foundational-stack.md). Logged here so it is not re-litigated cold.

## Every v1 ADR

| v1 ADR | | v2 home |
|---|---|---|
| 0001 Rust | superseded | TS stack (0001); boundaries/invalid-states → core |
| 0002 SurrealDB | superseded | Postgres/DBOS (0001) |
| 0003 Claude-sub subprocess | superseded | pi+keys → **owned loop (ADR-0011)**; orchestrator-only-spawns → 0004 |
| 0004 no-bootstrap-generator | obsolete | per-node spec name open → open-q §4 |
| 0005 red-green | carry | forensic, contract-level → 0007 |
| 0006 hardening loop | carry | run≠node → 0004; cold-rebuild → 0007; human-outer-loop → 0008 |
| 0007 stories-consume-assets | deferred | cross-cutting knowledge, no home → open-q §9 |
| 0008 mock/UAT seam | carry | seam → 0007; own wrapper → 0004 |
| 0010 in-sandbox orchestrator | superseded | fan-out → 0004/0005; budget inverted → 0005 |
| 0011 forum | deferred | verification-wins kept; learning loop no home → open-q §5 |
| 0012 cred bridge | obsolete | security note |
| 0013 branch-per-session | carry/reshape | DBOS+Postgres isolation → 0009 |
| 0014 gate signing-walk | carry | never-bypass gate → 0008 |
| 0015 SWE-bench container | obsolete | "benchmark the system" note |
| 0016 cred daemon | obsolete | security note |
| 0017 deployment-filter | obsolete | packaging note; `deployment` not carried |
| 0018 Cloud Run Jobs | superseded | DBOS queues (0009) |
| 0019 OAuth-token env | superseded | dead auth |
| 0020 decompose-before-implement | carry/defer | DAG-stabilisation → 0007 + open-q §4 |
| 0021 Secret Manager (tracked) | superseded | security note |
| 0021 cc-extension (orphan) | inverted | = 0023 → 0006/0008 |
| 0023 cc-extension observability | **inverted** | driving IDE over pi stream → 0006/0008 |
| 0022 cross-session coordination | carry/reshape | claims as rows → 0009; channel → open-q §5 |
| 0024 UAT-exempt / manual_signings | carry | operator-attested → 0007 (overrules 0028-D16) |
| 0025 origin-aware IDs | carry | DB-allocated, both classes → 0009 |
| 0026 deterministic spine | carry | code-vs-leaf → 0005 |
| 0027 contract-proof model (draft) | superseded | 0002 + 0007 |
| 0028 v2-seed (draft) | superseded | 0002/0007/0009; overrules D9/D11/D16 |

**Parked (durable, no v2 home yet):** cross-cutting knowledge (0007) → open-q §9 · learning loop (0011) → §5 · prose channel (0022) → §5.
