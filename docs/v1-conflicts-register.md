# v1 → v2 ADR conflicts & confusions register

A review artifact (not authoritative terminology). It records every conflict and
confusion an agentic review surfaced across the **v1 (Agentic) ADR corpus
0001–0028** when read against storytree v2's settled direction (ADR-0001 stack,
ADR-0002 work hierarchy, `glossary.md`). 52 findings were confirmed by adversarial
verification; this is their triaged disposition.

**Status legend**
- `GLOSSARY` — already resolved in `docs/glossary.md` (the v1-vocab import).
- `OPEN-Q §n` — captured as still-open in `docs/open-questions.md`.
- `ADR-000X` — recorded/resolved by a principle ADR merged on this branch (0003–0009). *Merged and verified against the final files.*
- `V2-FIX` — a correction to v2's own docs.
- `V1-FACT` — an internal v1-corpus defect; informational. v2 avoids it by starting clean (greenfield).
- `[H]` high-confidence finding · `[L]` lower-confidence.

---

## Part 1 — Conflicts (18)

### 1a. v2 self-conflicts — fix in v2's own docs
- **[L] "contract" given a 3rd v2 sense** — ADR-0001:91 lists "story / **contract** / event" (contract as a *peer* of story); ADR-0002 makes contract the *leaf*. → `V2-FIX` (ADR-0001 line corrected to "story / capability / contract / event").
- **[L] DAG grain** — README/ADR-0001/glossary say "DAG of stories"; ADR-0002 said edges are capability-level and the story-grain undecided. → **`ADR-0010`** (now *resolved*, was `OPEN-Q`): stories **do** carry edges, but only via declared cross-story **interfaces** (`boundary`/`port`); capabilities have their own **within-story, code-derived** graph — two graphs at two altitudes, not one capability-level DAG crossing story lines.

### 1b. v1 decisions that invert under v2 (recorded as inversions/supersessions)
- **[L] Observability/UI is a read-only sidecar** — ADR-0021/0023 make Claude-Code's extension surfaces THE observability+UI layer (sidecar reads a `runs` table from hooks/OTel) and **reject pi by name**. v2 inverts: an owned-loop-stream-sourced event store + an embedded *driving* IDE (the leaf is now the owned loop, ADR-0011). → `ADR-0006`.
- **[H] "cascade rounds are not a cost" / no per-iteration budget** — sound only under a flat subscription; v2 bills per token. → `ADR-0008` (cost is a first-class budget surface).
- **[L] `--dangerously-skip-permissions` everywhere** — no in-loop approval gate; v2's headline is a UI that approves/steers. → `ADR-0008`.
- **[L] API-key path is banned as a standing principle** — v1 ADR-0003 erects per-token billing as "unacceptable"; v2 adopts exactly it. → `ADR-0003` (reversal ledger; superseded).
- **[H] auto-merge-on-green, "main may hold broken states", no human review** — v2 is approval-gated trunk. → `ADR-0008`.
- **[L] pi is named and rejected** (ADR-0023 §7; ADR-0006 says story/red-green/UAT "don't map cleanly" onto this harness class) — v2 initially chose pi, now reversed to an owned loop (ADR-0011). → `ADR-0001`/`ADR-0006` (+ owned-loop boundary impedance noted).
- **[L] Task-tool-blocked premise** — ADR-0003's "Rust owns the spawn tree / no agents-spawn-agents" rests on a Claude-Code quirk; v2 re-derives fanout ownership from first principles. → `ADR-0005`/`ADR-0004`.
- **[H] ADR-0022 coordination substrate is a workaround for the *absence* of a shared store** — v2 ships the shared store by default, so port the answer, not the workaround. → `ADR-0009`.

### 1c. v1-internal contradictions (informational — facts about the v1 corpus)
- **[H] The "seven-step commit-time gate" has no originating ADR** — treated as law across ≥5 ADRs; ADR-0014 sources its key step to ADR-0005, which self-disclaims being a gate. → `ADR-0007` (v2 *defines* its gate cleanly) · `V1-FACT`.
- **[H] `manual_signings` is half the UAT-promotion read-set but no ADR establishes the table** (ADR-0008/0022 enumerate signing tables without it). → `ADR-0007` (operator-attested formalised) + `OPEN-Q §1`.
- **[H] UAT signer decided ≥2 ways** — ADR-0006 §8 reserves a human signer; ADR-0008/0010/0015 have the in-loop agent sign autonomously. → `OPEN-Q §1` + `ADR-0007`/`ADR-0008`.
- **[H] `runs.outcome` enum decided twice** (green/inner_loop_exhausted/crashed vs green/exhaustion/refusal) across co-reactivated ADR-0006/0010. → `ADR-0006`.
- **[H] UAT-exempt story class (ADR-0024) has no tier** in v2's trichotomy, and ADR-0028's rationale for retiring it is false. → `ADR-0007` (adds the operator-attested third tier; overrules ADR-0028 D16).
- **[H] ID-collision fix claimed but disclaimed** — ADR-0001 banners it; ADR-0028 D9 calls the race "out of v2 scope"; the ADR that dissects it (0025) was absent. → `ADR-0009`.
- **[L] ADR-0018 still cites a credential path ADR-0019 had already retired.** → `V1-FACT`.
- **[L] Duplicate ADR-0021** (two files claim the slot; one untracked) and **[L] phantom ADR-0009** (cited live by ADR-0010, no file exists). → `V1-FACT` (v2 ADR-0009 extends conflict-free allocation to the ADR namespace itself).

---

## Part 2 — Confusions / terminology overloads (34)

### 2a. Already resolved by the glossary
- **[H] "contract" (4+ senses)** → `GLOSSARY` + ADR-0002 (contract = leaf; v1→v2 term map).
- **[L] "verdict" (×4)** → `GLOSSARY` (reserved for a UAT Pass/Fail).
- **[L] "outcome" (×3)** → `GLOSSARY` (a capability's value statement).
- **[L] asset / pattern / guidance / principle (4-way)** → `GLOSSARY` (asset = tree art; pattern dropped; guidance defined; named principles carry).
- **[L] `manifest.yml` vs `contract.yml`** → `GLOSSARY` (per-agent contract file dropped; term map notes it).
- **[L] non-UAT-gated subtypes (mapped/synthetic)** → `GLOSSARY` (`mapped` status defined) + `OPEN-Q §2` (mechanism).
- **[L] "gate" (×6)** → `GLOSSARY` (gate / prove-it-gate) *partial* — specific gates land in `ADR-0006`/`ADR-0007`.
- **[H] ADR-0005 headline vs content ("gate" vs "forensic, not a gate")** → `GLOSSARY` (red-green = a principle, not the noun) · `V1-FACT`.

### 2b. Captured in open-questions.md (still open)
- **[H] event vocabulary — OTel GenAI vs bespoke owned-loop-shaped** → `OPEN-Q §8` (+ `ADR-0006` for the store shape).
- **[H] isolation/coordination on dead git/embedded-store mechanics** → `OPEN-Q §3` (+ `ADR-0009`).
- **[L] channel / forum / noticeboard (3 near-identical surfaces)** → `OPEN-Q §5`.
- **[L] decompose-before-implement loop** → `OPEN-Q §4`.
- **[L] "session" (×6)** → `OPEN-Q §3` (+ `ADR-0009`).
- **[L] "scope" (×4, two typed & colliding)** → `OPEN-Q §3` (+ `ADR-0009` declared_scope → claim).
- **[L] epic tier above stories** → `OPEN-Q §7`.

### 2c. Addressed by the new principle ADRs (0003–0009)
- **[H] orchestrator-only-spawns-agents boundary has no v2 home** → `ADR-0004`.
- **[L] ADR-0026 deterministic spine absent but IS v2's DBOS-over-the-owned-loop** → `ADR-0005`.
- **[H] `runs` per-RUN vs per-EVENT grain; `runs` vs `test_runs` name** → `ADR-0006`.
- **[L] "run/runs" overloaded; path keyed by story-id vs run-id** → `ADR-0006`.
- **[H] red-green mechanism (separate agents) doesn't map to one owned-loop session** → `ADR-0007`/`ADR-0005`.
- **[H] UAT-mocks-forbidden anchored to "the real claude binary"** → `ADR-0007` (mock-UAT seam, already in glossary).
- **[L] parallelism deferred (ADR-0006) vs default (ADR-0013)** → `ADR-0009`/`ADR-0008`.
- **[L] orchestrator-owns-fanout justified by the dead Task-blocked quirk** → `ADR-0005`/`ADR-0004`.
- **[H] no-autonomous-amendment / no-agents-spawn-agents vs self-building** → `ADR-0008` (outer-loop human; self-building is the trajectory).
- **[H] screener subsystem (agent→human gate)** → `ADR-0008` (studio is the surface; successor noted).
- **[L] "convergence" (cold-rebuild vs DAG fixed-point)** → `ADR-0007` (cold-rebuild) + `OPEN-Q §4` (DAG) — *needs a glossary disambiguation line.*

### 2d. Still needs a home / decision (flagged for you)
- **[H] cross-session LEARNING substrate** (forum-graduation + memory-curator + "verification-wins-over-recency") — a durable *principle* with no explicit v2 home yet (only loosely under `OPEN-Q §5/§6`). **Recommend: add an open-question or fold into a future knowledge-tier ADR.**
- **[H] every v1 agent has two names** (kebab role-id + an undefined job-title persona) — v2 drops personas, but the per-node role taxonomy under a single owned-loop session is unsettled. → partial `ADR-0008` + flag.
- **[L] "deployment" (×3)**, **"audit/review" (×5)** — v2 doesn't import these heavily; minor. **Recommend: a one-line glossary "not carried" note if they appear in imported v1 docs.**
- **[L] "capability" — v1 used it for a healthy unit; ADR-0002's "collision-free" rationale is stack-scoped** (arguable, not wrong). → optional glossary footnote.
- **[L] v2 ADR-0002 rests on v1 0027/0028, both DRAFT/unratified** — informational; ADR-0002 is accepted regardless. → note in `ADR-0003` ledger.

---

## Part 3 — Counts

| Bucket | Count |
|---|---|
| Conflicts | 18 |
| Confusions | 34 |
| Already resolved (glossary) | 8 |
| Captured open-questions | 7 |
| Resolved by new ADRs 0003–0009 | ~20 |
| v2-doc fixes | 2 |
| v1-internal facts (informational) | 6 |
| Still-needs-a-home (flagged) | 5 |

*Generated 2026-06-04 from a multi-agent review of `C:\code\Agentic` ADRs 0001–0028.*
