# Guidance violation audit — the agent pass on the system itself

**Date:** 2026-06-14 · **Mode:** single-pass, read-only audit (no code changed) ·
**Scope:** the storytree codebase (`packages/{core,agent,orchestrator,store,cli}`, `apps/studio`)
audited against the Library's **principle (22) / guardrail (9) / pattern (11)** prose
(`apps/studio/data/knowledge.json`).

Companion to the friction audit (`docs/research/session-friction-audit.md`) and the
[[library-guidance-unwired]] finding: the Library holds ~101 guidance artifacts, **none injected
into any working session** (no SessionStart hook reads them; the live SDK leaf at
[`packages/agent/src/sdk-author.ts`](../../packages/agent/src/sdk-author.ts) ships a fixed generic
system prompt and has no path to *pull* the Library). The load-bearing guardrails are instead
**compiled into the spine** (prove-it gate, write-scope hook, dirty-tree fail-closed, claims-in-store).
The question the owner posed: *have we drifted from our own principles, and does it matter?*

---

## Executive summary

**The codebase does not violate its own principles in any way that is both real and harmful — the
count of real-AND-harmful code violations is zero.** Every load-bearing guardrail the spine is
supposed to compile is genuinely compiled and holds (verified below). The hollow-test / swallowed-error
/ mock-in-organism failure classes the behavioural principles warn about are **largely absent** — the
foundation has a consistent fail-closed-or-documented-fail-soft culture, and the integration tier uses
real collaborators and content assertions.

**The drift that exists is in the *prose*, not the code.** Three guidance artifacts make claims that
the current code contradicts or no longer matches — and per the Library's own
**doc-vs-implementation-precedence** principle, the honest first move is to correct the doc, not the
code:

1. **`own-the-layers`** still says "keep the runtime self-hosted — API keys, not a subscription." The
   **live** runtime (ADR-0030) is the Claude Agent SDK on **subscription** auth. The principle's
   data/event-model/spine clauses still hold; its runtime clause is **overtaken by a deliberate
   reversal** and reads as stale.
2. **`agent-never-self-exempts`** asserts (in `enforcedBy`) a code check that does not exist: "an
   attestation signed by the agent under test is rejected." No such distinctness check is in the code.
   The *spirit* (an agent can't mint its own promotion to `healthy`) is upheld by a **different**
   mechanism, so harm is low — but the stated enforcement is a phantom.
3. **`approval-gated-trunk`** says a green result "surfaces for human diff-review and lands ONLY on
   approval (inverts auto-merge-on-green)." The storytree repo itself runs **auto-merge-on-green**
   (ADR-0022) — the literal inverse — by deliberate, documented choice. Not a violation; a scoping gap
   in the prose (it describes the *product's* target posture, not the toolmaker repo).

Two further low-harm literal gaps (`fail-closed-on-dirty-tree`'s "distinct exit code";
`verify-edit-write-persisted-or-escalate`'s read-back) are detailed below.

**Verdict on the library prose for the design discussion:** the prose is *well-written* (structured,
concrete, high per-artifact signal). Its problem is not quality but **targeting**. Roughly 60% of the
artifacts are **agent-behavioural** — they govern how a working *session* operates — yet they reach no
session. The remaining **code-structural** ones are *also* compiled into the spine, so the prose
**restates an enforced single source of truth** (a `signal-and-noise` smell: "link the single source
rather than restating it"). The net consequence the owner already suspected is confirmed here from the
other side: **the unwired guidance has not caused code drift, because the spine catches the
load-bearing cases anyway.** That makes the *value of wiring a read-path* unproven, and points the
higher-value work at (a) fixing the 2–3 prose drifts and (b) deciding whether the behavioural corpus is
an accepted **reference library** (keep, accept write-only) or **active guidance** (must be wired *and*
pruned to the load-bearing subset — `guidance-quality` says the fix for ignored guidance is a
structural *path*, and right now there is literally none).

---

## How to read the findings

Two audit lenses, because the artifacts split into two populations:

- **Code-structural** (the boundary/event/gate guardrails + a few patterns): auditable directly against
  the code. *Finding: enforced and clean, with the prose drifts above.*
- **Agent-behavioural** (most principles + the craft patterns): govern a session's moves
  (how to test, explore, curate, route defects). They cannot be "violated by the code" — only embodied
  or not by the code that *does* the work (the gate, the test suite). *Finding: the code that embodies
  them honours them; but as guidance for their actual audience they are write-only.*

---

## Master table

| Artifact | Kind | Violation found? | Harmful? | Fix the code, or the prose? | Prose recommendation |
|---|---|---|---|---|---|
| **own-the-layers** | principle | **Yes — runtime clause** contradicted by ADR-0030 (live = SDK on subscription) | No (deliberate reversal; data/traces still owned) | **Prose** | **OPERATIONALIZE→amend**: cite ADR-0030; reframe runtime as rented-but-pivot-out behind `PhaseAuthor`; keep event-model/spine clauses |
| **agent-never-self-exempts** | guardrail | **Yes — `enforcedBy` names a non-existent check** | Low (spirit upheld elsewhere; latent: a session could rely on a phantom check) | **Prose** (or build the check) | **KEEP→correct**: rewrite `enforcedBy` to the *actual* mechanism (non-proof attestation log + spine-signs-verdict-not-leaf); flag the distinctness check as unbuilt |
| **approval-gated-trunk** | guardrail | **Partial** — toolmaker repo is the inverse (auto-merge) by design | No (documented divergence, ADR-0022) | **Prose** (scoping) | **KEEP→scope**: state it targets the *product's* trunk (largely unbuilt); note ADR-0022 toolmaker-repo divergence explicitly |
| **fail-closed-on-dirty-tree** | principle | **Minor** — "distinct exit code" unmet (all CLI refusals = exit 1) | No (no-evidence-written holds) | Prose *or* trivial code | **KEEP→soften**: "non-zero" not "distinct," or add a distinct code as a follow-up |
| **verify-edit-write-persisted-or-escalate** | principle | **Yes vs literal text** — `fs-tools` write/edit never read back | No (targets the *offline* loop, not the live SDK leaf; gate re-reads downstream) | **Prose** (rescope) | **KEEP→rescope or PRUNE**: the in-the-wild shell-heredoc fallback it guards against is designed out (Bash not in the leaf surface); rescope to the owned-loop path or retire |
| one-model-boundary | guardrail | No | — | — | KEEP-AS-IS (accurate, code-backed) |
| orchestrator-is-sole-fan-out | guardrail | No (cli edge is type-only) | — | — | KEEP-AS-IS |
| run-is-not-a-node | guardrail | No | — | — | KEEP-AS-IS |
| never-bypass-the-gate | guardrail | No | — | — | KEEP-AS-IS |
| repo-surface-allowlist | guardrail | No | — | — | KEEP-AS-IS |
| claims-in-the-shared-store | guardrail | No (named-deferred, DBOS — honest) | — | — | KEEP-AS-IS |
| human-owns-the-outer-loop | guardrail | No (studio operator actions) | — | — | KEEP-AS-IS |
| prove-it-gate | principle | No (built, green) | — | — | KEEP-AS-IS |
| observability-first | principle | No | — | — | KEEP-AS-IS |
| event-log-then-projection | pattern | No (append-only + derived rollup; mutable rows are read caches with events always emitted) | — | — | KEEP-AS-IS |
| spine-sequences-leaf-judges | principle | No | — | — | KEEP-AS-IS |
| no-proof-preservation | principle | No (status is a projection; nothing writes `healthy`) | — | — | KEEP-AS-IS |
| red-green | principle | No (gate observes RED then GREEN out-of-band) | — | — | KEEP-AS-IS |
| thin-wrapper-over-the-runtime | pattern | No | — | — | KEEP-AS-IS |
| glossary-wins | pattern | No | — | — | KEEP-AS-IS |
| dogfood-fix-the-source | principle | No (no symptom-masking found) | — | — | KEEP (behavioural, unwired) |
| reward-hacking | principle | No (tests bind to outcomes) | — | — | KEEP (behavioural, unwired) |
| test-creation-principles | principle | No | — | — | KEEP (behavioural, unwired) |
| test-fixtures-mirror-production-failure-modes | principle | No | — | — | KEEP (behavioural, unwired) |
| implementer-shortcut-patterns | pattern | No | — | — | KEEP (behavioural, unwired) |
| faked-uat-theatre | pattern | No | — | — | KEEP (behavioural, unwired) |
| verification-wins | principle | n/a (behavioural) | — | — | KEEP |
| doc-vs-implementation-precedence | principle | n/a (this audit *applies* it) | — | — | KEEP→**OPERATIONALIZE** (this audit is the manual version) |
| defects-amend-the-owning-story | principle | n/a (behavioural) | — | — | KEEP |
| cold-rebuild | principle | n/a (authoring guideline, never enforced — says so) | — | — | KEEP |
| stale-prerequisite-links-are-phantoms | principle | n/a (behavioural) | — | — | KEEP |
| tightening-a-shared-contract-needs-a-full-sweep | principle | n/a (gate does *not* re-run full suite — the principle says so) | — | — | KEEP; OPERATIONALIZE is hard (detect contract-tightening) — leave as guidance |
| exploration-principles | principle | n/a (behavioural, generic craft) | — | — | KEEP; **prune-eligible** if corpus stays reference-only |
| recursive-decomposition-patterns | pattern | n/a (behavioural, generic craft) | — | — | KEEP; **prune-eligible** (blind-reconstruction) |
| pull-based-context-architecture | pattern | **Half-embodied** — orchestrator briefs are pointers, but the leaf has no pull path to the Library | No | — | KEEP→**OPERATIONALIZE** (a leaf Library-read tool is the natural pull-path) |
| edit-first-curation | pattern | n/a (corpus-curation behavioural) | — | — | KEEP |
| assess-tradeoffs-by-naming-both-sides | pattern | n/a (behavioural) | — | — | KEEP |
| signal-and-noise | principle | n/a (the lens for *this* recommendation) | — | — | KEEP→APPLY |
| guidance-quality | principle | n/a (the lens for *this* recommendation) | — | — | KEEP→APPLY |
| deep-modules | principle | No clear instance | — | — | KEEP; **prune-eligible** (generic Ousterhout, blind-reconstructible) — low priority |
| standalone-resilient-library | pattern | No | — | — | KEEP-AS-IS |
| durable-workflow-per-node | pattern | No (DBOS named-deferred — honest) | — | — | KEEP-AS-IS |

---

## Detailed findings (the real drifts)

### 1. `own-the-layers` runtime clause is overtaken by ADR-0030 (prose stale)

The principle's `howToApply` reads: *"keep it model-agnostic and self-hosted (API keys, not a
subscription; your data and traces stay yours)"*, and `why`: *"Renting them (a subscription, someone
else's runtime) surrenders your data and traces and couples you to a single model."*

The **live** runtime is now the Claude Agent SDK on **subscription** auth
([`sdk-author.ts:268-287`](../../packages/agent/src/sdk-author.ts), `permissionMode: "bypassPermissions"`,
ambient `CLAUDE_CODE_OAUTH_TOKEN`), chosen deliberately in ADR-0030 (the owned API-key loop is *demoted*
to the offline/test executor + pivot-out fallback). The principle's deeper requirement — own every
load-bearing layer, stay pivot-out-able — is arguably still honoured (the SDK import is confined to one
file; the owned loop remains behind the `PhaseAuthor` seam; the event model and traces are still
owned). But the literal "API keys, not a subscription; self-hosted runtime" clause now **contradicts
the live path**.

- **Harm:** none to the code (a reasoned reversal). The risk is a future session reading
  `own-the-layers` and "correcting" the code back toward a self-hosted runtime on a phantom premise —
  exactly the `doc-vs-implementation-precedence` failure mode.
- **Recommendation:** amend the prose to cite ADR-0030 and reframe the runtime as a *deliberate rent
  with a held pivot-out*, distinct from the still-owned data/event/spine layers.

### 2. `agent-never-self-exempts` — `enforcedBy` describes a check that isn't there

`enforcedBy`: *"The event store requires the `operator-attested` event to carry an operator signature
distinct from any agent identity; an attestation signed by the agent under test is rejected."*

In code:
- `resolveSigner` ([`signer.ts:34-50`](../../packages/core/src/signer.ts)) resolves *an* identity
  (flag → env → git email, fail-closed) but **never compares it to the agent under test**.
- `Attestation` ([`attestations.ts:39-56`](../../packages/core/src/attestations.ts)) records `signer`
  and `relayedBy` as separate provenance fields but enforces **no** `signer !== relayedBy` (or
  `signer != agent`) constraint. Nothing rejects `--signer <agent-identity>`.
- There is no `operator-attested` branch inside `proveUnit` at all — the gate runs the identical
  automated red-green walk regardless of proof mode.

The **spirit holds via a different mechanism**: attestations are an explicitly **non-proof** log
(`events.attestation`, never `events.verdict`, never rolled up to status — [`attestations.ts:5-18`](../../packages/core/src/attestations.ts)),
so a self-signed attestation **cannot** move a unit to `healthy`; and the only thing that *can*
(a signed `Verdict`) is signed by the **spine**, out-of-band, after it observes red/green itself — the
leaf never reports the verdict ([`prove-it-gate.ts`](../../packages/orchestrator/src/prove-it-gate.ts),
"THE MODEL NEVER REPORTS THE VERDICT"). So an agent genuinely cannot mint its own promotion.

- **Harm:** low, but real *latent* harm — the `enforcedBy` is a phantom a session could rely on.
- **Recommendation:** correct `enforcedBy` to the real mechanism (non-proof attestation log +
  spine-signs-verdict-not-leaf), and mark the signer-distinctness check as *unbuilt* (or build it as a
  cheap belt-and-suspenders follow-up).

### 3. `approval-gated-trunk` is inverted on the toolmaker repo (by design)

The guardrail: *"a green result surfaces for human diff-review and lands only on approval … inverts
auto-merge-on-green."* The storytree repo's own `main`:

- `.github/workflows/ci.yml` `automerge` job runs `gh pr merge --merge --delete-branch` the moment
  `verify` is green — **no diff-review** — opt-out only via `draft` / `hold` label.
- ADR-0022 states this is intentional for a solo author: *"green is accepted as sufficient (the
  friction of clicking merge from a phone buys no real review), whereas the product treats green as
  necessary but not sufficient."*

The built-system promotion path (the *product*) is closer to the guardrail's spirit: a REAL pass
auto-pushes a `claude/real/*` branch but leaves opening the PR to the operator (ADR-0031 §1) — one
human decision per landing — though the subsequent merge still auto-lands on green via the same
ADR-0022 path.

- **Harm:** none — the divergence is deliberate and documented.
- **Recommendation:** scope the prose explicitly to the *product's* trunk (largely unbuilt: the
  promotion gate exists; per-action approval and operator diff-review in the studio do not yet), and
  name the ADR-0022 toolmaker-repo divergence so the contradiction reads as known, not accidental.

### 4. `fail-closed-on-dirty-tree` — "distinct exit code" unmet (minor)

The gate writes **no** evidence on a dirty tree (the load-bearing half — verified:
[`prove-it-gate.ts:143-150`](../../packages/orchestrator/src/prove-it-gate.ts), and
`prove-it-gate.test.ts` asserts zero signing rows). But the principle says "exits with a **distinct**
code," and the CLI maps *every* refusal to exit `1` ([`cli/src/main.ts`](../../packages/cli/src/main.ts)).
**Harm: none** (the honesty property holds). Recommendation: soften the prose to "non-zero," or add a
distinct dirty-tree code as a trivial follow-up.

### 5. `verify-edit-write-persisted-or-escalate` — write tool never reads back (rescope)

`fs-tools.ts` `write_file` returns a byte count computed from the *input* string and `edit_file`
returns success from the absence of a throw — **neither reads the file back** nor emits a structured
assumption-violation on mismatch ([`fs-tools.ts:82-107`](../../packages/agent/src/fs-tools.ts)). Against
the literal principle, a gap. But: (a) `fs-tools` is the **owned-loop** (offline/test executor) write
surface, not the **live** SDK leaf, which uses the SDK's own Write/Edit; (b) the specific in-the-wild
reaction the principle guards against — silently falling back to a shell heredoc — is **designed out**
(Bash is not in the leaf tool surface, [`sdk-author.ts:106-107`](../../packages/agent/src/sdk-author.ts));
(c) the gate re-reads and re-tests the written files downstream
([`prove-it-gate.e2e.test.ts`](../../packages/orchestrator/src/prove-it-gate.e2e.test.ts)). **Harm:
near-zero.** Recommendation: rescope the prose to the owned-loop path it actually concerns, or retire
it as targeting a path the design has moved past.

---

## Confirmation: the code-enforced guardrails genuinely hold

| Guardrail | Status | Evidence |
|---|---|---|
| one-model-boundary | **ENFORCED** | model runtime imported only in `packages/agent` (`model.ts:1`, `sdk-author.ts:22`); no `@anthropic-ai`/SDK import in core/orchestrator/store/cli/studio |
| orchestrator-is-sole-fan-out | **ENFORCED** | only `packages/orchestrator` instantiates `ClaudeAgentAuthor`; cli's `@storytree/agent` import is `import type` only |
| run-is-not-a-node | **ENFORCED** | `Tier = story\|capability\|contract` only; a run is a `runId` field on a `Verdict` event keyed to a unit, no node identity (`schema.ts`, `proof.ts`) |
| never-bypass-the-gate | **ENFORCED** | gate *refuses* (fail-closed `ProveResult`) at every step; `healthy` reachable only through a signed pass (`prove-it-gate.ts`, `proof.ts isProvenStatus`) |
| fail-closed-on-dirty-tree | **ENFORCED** (exit code not distinct — see finding 4) | dirty-tree check before any signing append; no row written; test asserts zero signing rows |
| repo-surface-allowlist | **ENFORCED** | `scripts/check-manifest.mjs` + `repo-manifest.json`, wired into `pnpm gate` (`package.json gate` script) before typecheck/test |
| observability-first / event-log-then-projection | **ENFORCED** | append-only `events.*` tables; `rollupStatus` is a pure fold, status never stored; mutable projection rows are read caches with the typed event always emitted in the same txn |
| no-proof-preservation | **ENFORCED** | nothing writes `healthy` into a spec; health is a projection of signed verdicts |
| spine-sequences-leaf-judges | **ENFORCED** | deterministic routing in `sequence.ts`/`phase-machine.ts`; the leaf authors, the spine observes |
| claims-in-the-shared-store | **NAMED-DEFERRED (honest)** | the prose says so (DBOS deferred, ADR-0019); not a violation |
| agent-never-self-exempts | **SPIRIT ENFORCED, `enforcedBy` PHANTOM** | see finding 2 |

---

## What this means for the wiring decision

Feeding [[library-guidance-unwired]] and the owner's *measure-friction-first* fork:

- **The read-path's value is unproven from this side too.** The unwired guidance has not produced code
  drift, because the spine compiles the load-bearing guardrails. Injecting the *code-structural*
  artifacts into sessions would largely **restate an already-enforced single source of truth** — a
  `signal-and-noise` anti-pattern, not a win.
- **If a path is wired, wire the behavioural subset, and prune first.** `guidance-quality` says ignored
  guidance is a *structural* failure (no path at the decision point), and `pull-based-context-architecture`
  argues for pull-on-demand over a fat static brief. The natural shape is a **leaf Library-read tool**
  (a pull-path the leaf currently lacks) over a small, curated behavioural set (the test/reward-hacking/
  defect-routing cluster), **not** a SessionStart dump of all 42.
- **Prune candidates** (blind-reconstruction test, if the corpus stays reference-only): `deep-modules`,
  `recursive-decomposition-patterns`, `exploration-principles` read as generic agent/CS craft
  reconstructible from training; they earn their keep only once a pull-path makes them actionable.
- **Cheapest highest-value move regardless of the wiring fork:** fix the 3 prose drifts (findings 1–3)
  so the Library stops asserting things the code contradicts. A Library that lies about its own
  enforcement is worse than one that is merely unread.

---

## Follow-ups (not done in this pass — surfaced for owner review)

1. **Amend `own-the-layers`** prose: cite ADR-0030; reframe the runtime clause as a deliberate
   rent-with-pivot-out. *(Library edit; no code.)*
2. **Correct `agent-never-self-exempts` `enforcedBy`** to the real mechanism; optionally build the
   cheap `signer != relayedBy`/`signer != agent` distinctness check on the attestation write path.
3. **Scope `approval-gated-trunk`** prose to the product trunk; name the ADR-0022 divergence.
4. **`fail-closed-on-dirty-tree`:** soften "distinct" → "non-zero," or add a distinct dirty-tree exit
   code in the CLI.
5. **`verify-edit-write-persisted-or-escalate`:** rescope to the owned-loop write path or retire.
6. **Wiring decision (the big one):** if a read-path is built, prefer a *leaf Library-pull tool* over a
   SessionStart dump, scoped to a curated behavioural subset — and prune the generic-craft artifacts.

---

### Method note

Single pass. Evidence gathered by three read-only sub-audits (boundary/gate enforcement;
dogfood/write-persistence/hollow-tests; trunk-landing/event-model) plus direct reads of `sdk-author.ts`,
`signer.ts`, `attestations.ts`, `prove-it-gate.ts`. No code was changed. The offline gate was not run
(no code touched).
