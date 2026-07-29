---
status: accepted
load_bearing: true
decided: 2026-06-27
amends: [103, 23, 18]
---
# ADR-0120: Live-to-seed reconciliation: export corpus and unit-status to the seed, content-diff gated

## Status

accepted (2026-06-27) — the owner DIRECTED the two load-bearing calls in conversation on 2026-06-27,
so design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask. The rest is the
direct generalisation of the already-accepted reconciliation model (ADR-0103/0023/0055) plus the
already-accepted generated-view (ADR-0018) and derived-status (ADR-0020/0040) rules, so it is flipped
green at authorship (ADR-0084); the catch, as ever, is observability — the new checks make the drift
they address self-surfacing.

## Context

ADR-0103 added a seed→live reconcile (`sync-corpus`, migrate-only) and **explicitly deferred** two
things as "later work": the inverse direction (a live→seed export) and "a seed↔live content-diff
view". Those gaps are now the two amber dimensions a corpus audit reports — **"Story DAG"** (the work
hierarchy) and **"Corpus integrity"** (the library tier):

1. **Proven progress is invisible on disk (Story DAG).** A probe of the live store on 2026-06-27 found
   **69 signed verdicts across 43 proven units** (every one a latest-`pass`), yet ZERO units carry
   `status: healthy` on disk and that status has never appeared in git. This is *by design* —
   `healthy` is derived-only, never authored to `stories/*.md` frontmatter (ADR-0020/0040) — but there
   is no generated on-disk VIEW of it either, so the single biggest fact about the project (what is
   proven) lives only in a database nobody reads from git.
2. **Live-canonical edits never flow back to the seed (Corpus integrity).** `sync-corpus` is
   migrate-only — it will not push seed content over a present live row, and has no inverse — so an
   `artifact edit --pg` to an existing artifact never reaches `knowledge.json`. The only path back was
   a hand-done recipe (memory `live-to-seed-corpus-export`), run by eye.
3. **The guards count, they do not compare (Corpus integrity).** `count-reconciliation` compares the
   *number* of structured units to generated assets; `check:corpus-sync` compares *id presence*. Neither
   looks at BODIES, and `build-corpus.mjs` had no `--check` wired into CI — so a stale glossary *(retired
   by ADR-0135)* / assets.json, or a live body that has drifted from its seed copy, passes clean.

The probe also surfaced a fact the naive "live is canonical, overwrite the seed from it" model misses:
live and seed both hold 137 non-agent docs (equal counts *hid* the drift), but **12 differ by body**.
Of those, **1 is degraded in LIVE** (`audit-the-signed-verdict`, stored at schemaVersion 0 in the
rendered `{body,category}` shape — also the current live `version-floor` gate failure), where the SEED
is canonical; the rest are value-drifts of **mixed direction** (graduation writes edits to the seed,
so some seed copies — e.g. `orchestrate-route-supplement`, which carries `provenance` only in the
seed — are the canonical side). A blind live→seed overwrite would both corrupt the seed with the
degraded body and delete seed-canonical content.

## Decision

Build the durable reconciliation TOOLING (each proven red→green, offline) and record the two
owner-directed calls. Four parts:

1. **`build-corpus.mjs --check`** (finding 3 / generated views). The corpus generator gains a DB-free
   `--check` mode that regenerates `assets.json` + `docs/glossary.md` in memory and exits non-zero on
   drift, writing nothing — the mirror of `check:claude` / `check:agents`. Wired into `pnpm gate` and
   the CI `verify` job (`check:corpus-build`). A stale generated view can no longer merge clean.
   **Correction (2026-07-06 — ADR-0139 pass):** per [ADR-0135](0135-retire-docs-glossary-md-the-library-is-the-sole-term-authori.md)
   the glossary is retired; `--check` now covers `assets.json` only.
   **Amended (2026-07-18 — [ADR-0210](0210-retire-the-generated-apps-studio-data-assets-json.md)):**
   `assets.json`, the `build-corpus.mjs` generator, and the `check:corpus-build` gate are now all
   removed — part 1 no longer stands. Nothing regenerates a committed view, so the seed↔view drift this
   gate policed cannot occur (there is no view). Findings 2–4 are unaffected.
2. **Content-diff reconciliation** (finding 3 / bodies). A reconciliation that compares seed↔live by
   BODY, not just count/id — WARN-only and SKIP-offline (mirroring `check:corpus-sync`, since CI's
   verify job is DB-free), classifying each drift as *degraded-live* (restore seed→live) vs
   *value-drift* (resolve on the live edit surface). This makes "Corpus integrity" measurable instead
   of silently-green.
   **Correction (2026-07-28 — ADR-0139 pass): "WARN-only" no longer holds and is scoped, not
   reversed.** `check:corpus-content` was bounded at a two-axis drain ceiling
   (`packages/cli/src/corpus-content-drain.ts`, which holds the live numbers — never restated here),
   so it now sets a non-zero exit when either axis is breached. This is
   [ADR-0252](0252-verification-decay-detection-continuous-mechanical-warns-a-j.md) D3
   applied in [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) D4's
   shape — the enforcement posture is the LATER ADR's to set, and **nothing in this ADR is
   re-decided**: the reconciliation, its two-way classification, and its remedies are unchanged, and
   the OK/WARN lines it prints are byte-identical. The "SKIP-offline / mirroring `check:corpus-sync`"
   half is untouched and still true (see the Consequences bullet below): with no DB or creds the check
   SKIPs at exit 0, so CI stays DB-free. A reader of "WARN-only" alone would otherwise conclude the
   shipped exit code VIOLATES this ADR and "fix" it by removing the red — the exact stale-prose harm
   ADR-0139 exists to prevent.
   **Correction (2026-07-29 — ADR-0139 pass): both ceilings are now ZERO, and the "no individual
   drift blocks a landing" half of the note above is retired as FALSE.** That clause was true only
   while `valueDriftCeiling` was 14 — headroom that existed because the backlog's only sanctioned
   remedy was a batch export carrying 222 transient artifacts, not because drift was tolerated.
   [ADR-0263](0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md) removed that
   coupling, the backlog was drained, and the ceiling followed the measurement down to `V=0, D=0`
   (tightening-only, as ADR-0252 D3 requires). **So the FIRST unreconciled artifact now reds the gate**
   — a session that leaves a durable-tier live edit unexported blocks every other session until it runs
   `storytree library export-corpus --pg --write`. Nothing here is re-decided either: the classification
   and the per-artifact direction judgement are still ADR-0120's and still not a gate's to make; only
   the accumulation the later ADRs bound has reached zero. This note exists because "no individual drift
   blocks a landing" would otherwise read as licence to defer the export.
3. **A live→seed export** (finding 2) — the inverse of `sync-corpus`. **Owner decision (a): OVERWRITE
   seed bodies for live-edited artifacts**, plus add live-only artifacts; never delete seed-only or
   `agent`-kind (those stay seed-canonical, ADR-0055). The migrate-only symmetry FLIPS here: because
   live is canonical, seed→live must not clobber (ADR-0103), but live→seed SHOULD mirror the canonical
   side into the lagging seed. **Safety floor:** the export only overwrites with a live body that
   validates at/above the current schema version — a degraded/below-floor live body is refused (writing
   it would corrupt the canonical seed) and reported for a seed→live restore instead. This protects the
   one case the owner's directive did not anticipate, without contradicting it.
   **Amended (2026-07-29 — [ADR-0263](0263-narrow-the-live-to-seed-export-scope-to-the-durable-tier-an.md)):
   "add live-only artifacts" is now scoped to the DURABLE TIER, and the qualifier matters.** As shipped,
   the scope was a DENYLIST — every structured kind except `agent` — so "add live-only artifacts" meant
   *every* non-agent kind, and this prose naming only the `agent` exclusion is what a reader would take
   it to mean. Three kinds introduced after this ADR (`friction` 2026-07-06, `arc` 2026-07-11,
   `uat-criterion` 2026-07-18) therefore enrolled in the seed export silently, by default: measured at
   236 additions on 2026-07-29, 222 of them transient artifacts the seed has never carried. ADR-0263
   flips the predicate to an explicit ALLOWLIST (`SEED_SCOPE_KINDS` in
   `packages/library/src/knowledge.ts`) covering the durable tier only — definition, principle, pattern,
   guardrail, techstack, process, open-question, proposal. **Nothing in this decision is re-decided:**
   owner call (a)'s conflict policy — live-edited bodies OVERWRITE the seed, seed-only and `agent`-kind
   are never deleted — is unchanged and still governs every kind that remains in scope, as is the
   non-degradation safety floor. What moved is WHICH KINDS the export covers, which was never an
   owner-level call; ADR-0263 grounds each exclusion in a decision already on the record, including this
   ADR's OWN decision 4 (the work-hierarchy tier stays out of the knowledge tier) for `uat-criterion`.
4. **A unit-status export** (finding 1) — **owner decision (b): a SEPARATE generated status file**
   (`apps/studio/data/unit-status.json`), not folded into `knowledge.json`. It is a clearly-`@generated`
   view derived from the signed verdicts (`rollupStatus` over `events.verdict`), regenerated like
   `assets.json` / `glossary.md`. It keeps the work-hierarchy tier out of the knowledge/library tier
   and respects ADR-0020/0040 (no authored `healthy`; status stays a derived projection) while finally
   making proven progress visible in git.

The two **owner-directed calls** (the only owner-level forks here): (a) the export overwrites
live-edited bodies (refined only by the non-degradation safety floor above); (b) unit health-status
lives in its own generated file, not in `knowledge.json`.

## Consequences

- **Good — the audit ambers become closeable and self-surfacing.** "Story DAG" gets an on-disk,
  git-visible projection of what is proven; "Corpus integrity" gets a body-level diff and a
  generated-view gate, so stale views and drifted bodies are caught at the gate instead of passing on
  a matching count.
- **Good — the export closes the inverse-direction gap ADR-0103 deferred,** with a clobber guard the
  hand recipe never had: a degraded or below-floor live body is refused rather than mirrored into the
  canonical seed.
- **Bound — the existing 12 drifts are a data act, not code.** The degraded `audit-the-signed-verdict`
  restores seed→live (and clears the live `version-floor` failure); the value-drifts are resolved
  per-doc on the live edit surface (`artifact edit --pg`) once direction is confirmed — surfaced, not
  guessed. The tooling lands first; the one-time reconciliation follows.
- **Bound — the live-touching checks are local/gate-only.** Content-diff and any live read SKIP without
  a DB and never gate CI (verify stays DB-free), exactly like `check:corpus-sync`. `build-corpus
  --check` was the only new CI gate, and it was fully offline *(the generator, the `assets.json` view,
  and this `check:corpus-build` gate were all removed by ADR-0210 — see the Decision part 1 amendment)*.
- **Bound — unit-status is derived, never authored.** The generated file is a projection of verdicts;
  it is not an edit surface and does not change the rule that `healthy` is earned, not written
  (ADR-0020). Editing it by hand is meaningless — it is regenerated from the event log.

## References

- [ADR-0103](0103-seed-to-live-reconcile-for-the-non-agent-corpus-tier-sync-co.md) — the seed→live
  `sync-corpus` this amends by adding the deferred inverse export + content-diff view.
- [ADR-0023](0023-library-cli-choose-your-own-adventure.md) — the live-canonical model; the export
  turns its "lagging export" seed into an actively-mirrored one.
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the seed-canonical
  `agent` tier the export leaves untouched.
- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) — graduation writes
  edits to the seed, the reason some seed copies are the canonical side of a value-drift.
- [ADR-0018](0018-knowledge-tier-phase1-structured-source.md) — the generated-view
  model `build-corpus --check` gated *(both the last committed view and this gate were removed by
  [ADR-0210](0210-retire-the-generated-apps-studio-data-assets-json.md))*.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) /
  [ADR-0040](0040-verdict-derived-green-and-the-human-witness-signpost.md) — `healthy` is derived from
  signed verdicts, never authored; the unit-status file is a view, not an edit surface.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time owner
  direction is the ratification.
- Code: `apps/studio/data/build-corpus.mjs` (`--check`), `packages/cli/src/corpus-build-check.test.ts`,
  `package.json` (`check:corpus-build`), `.github/workflows/ci.yml` *(part 1's generator, test, gate,
  and CI wiring were all removed by ADR-0210)*; the export + content-diff +
  unit-status surfaces land in `@storytree/library/store` + `packages/cli` across the following PRs.
