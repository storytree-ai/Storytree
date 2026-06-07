# Library template-alignment pass

**Date:** 2026-06-07
**Scope:** Editorial/structural alignment of the cross-cutting knowledge "Library"
(`apps/studio/data/assets.json`) — the `GuidanceAsset` corpus. A **content** pass: no
schema, storage, or migration changes. ADR-0017's DEFERRED items (tier name, citing/
reciprocity, comments layer, templates-from-schema, store migration) are untouched; this
aligns to the prose templates **as they exist**.

**Result:** all 6 templates refined; all 82 content units restructured to their kind's
template; 17 units flagged for owner review (none silently force-fit, none recategorized).

---

## 1. Template-count mismatch (6 templates, 5 content kinds) — resolved

There are 6 `template` units but only 5 content kinds
(`definition` / `principle` / `pattern` / `guardrail` / `techstack`). The extra is
**`template-adr`**.

**Resolution: keep it — it is neither a stray nor a template-for-templates. It scaffolds a
different layer.** Per ADR-0017, **ADRs are the SOURCE layer** the knowledge tier *derives
from*, not a knowledge-unit kind; and there are **no `adr`-category content units in
`assets.json`** (the Library folds ADRs in read-only from `docs/decisions/` at render time).
So:

- The **5 kind-templates** (`template-definition/principle/pattern/guardrail/techstack`) map
  **1:1** to the 5 content kinds aligned in this pass.
- **`template-adr`** is the scaffold an author uses to write a *new ADR doc* under
  `docs/decisions/` — the only template whose output is a doc, not a knowledge unit.

Action taken: added a one-line lead note to `template-adr`'s body and rewrote its
`description` to state this role explicitly, so the mismatch is self-documenting rather than
looking like an orphan. (Templates themselves have no `template-template`; that is correct —
ADR-0017 marks "templates → schema" as deferred, so we are not generating templates from a
schema here.)

---

## 2. Template refinements made

All five kind-templates already shared a sound shape (a bold one-line lead + `##` sections
+ a closing `## See also`). Refinements kept that shape and tightened it for consistency:

| Template | Section shape (after) | Change |
|---|---|---|
| `template-definition` | **In one line.** / What it is / What it is not / See also | "What it is not" marked **omittable** when a term has no easily-confused neighbour (prevents padding thin glossary leaves); See also now explicitly invites **provenance**. |
| `template-principle` | **The principle.** / Why / How to apply / See also | Unchanged shape; See also standardized to "Source ADR(s), related artifacts, and provenance." |
| `template-pattern` | **The pattern.** / Problem / Approach / Tradeoffs / See also | Same. Tradeoffs section deliberately mirrors the `assess-tradeoffs-by-naming-both-sides` principle (name A vs B). |
| `template-guardrail` | **The boundary.** / Rule / **Enforced by** / Failure mode prevented / See also | Kept the load-bearing rule: **"If nothing deterministically enforces it, this is a `pattern`, not a guardrail."** This is the discriminator from `types.ts`. |
| `template-techstack` | **The choice.** / What it is / Why this / Constraints / See also | Same; "role it plays **in storytree**" sharpened. |
| `template-adr` | (ADR doc skeleton) | Added lead note + new description clarifying it scaffolds the **source layer** (see §1). Body skeleton (Status / Date / Context / Decision / Consequences / Alternatives considered / References) matches the real ADR files. |

Consistency rules now uniform across all kind-templates: bold one-liner lead → ordered `##`
sections → `## See also` carrying source ADR(s), related artifacts, **and provenance**
(import/attribution lines).

---

## 3. Units aligned per kind

Every content unit's `body` was restructured to its kind's template, **preserving
substantive content** (every claim, every `(ADR-XXXX)` citation, every attribution and v1-
provenance line — reworded/reorganized, never deleted). Standalone provenance/attribution
moved into `## See also`; claim-anchoring parentheticals stayed inline. `id`, `category`,
and `references` were left **untouched**; `updatedAt` bumped to 2026-06-07 on every changed
unit.

| Kind | Gloss | Units aligned |
|---|---|---|
| definition | what something is | 54 |
| pattern | a reusable approach | 11 |
| guardrail | a deterministically-enforced boundary | 8 |
| principle | how to judge | 5 |
| techstack | what we build on | 4 |
| **Total content** | | **82** |
| template (refined, not "aligned") | the shape an artifact conforms to | 6 |

No `title`/`description` field needed correcting except `template-adr`'s description (§1);
the subagents found no other clearly-wrong titles/descriptions.

---

## 4. MISFIT LIST (for owner review — not force-fit, not recategorized)

17 units carry a flag. **No category was changed and nothing was deleted** — each still
received a best-effort aligned body. These are recommendations only.

### 4a. Mis-categorized — rule/stance-shaped "definitions" (owner call: keep as glossary term, or recategorize)

These are legitimate `docs/glossary.md` terms, but their content reads as a rule/principle/
guardrail ("what to do / how to judge") rather than "what something is":

| id | Reads as | Recommendation |
|---|---|---|
| `cold-rebuild` | authoring guideline / principle | Keep as glossary def **or** recategorize `principle`. The body itself stresses it is a guideline, not a gate. |
| `red-green` | principle | Body literally says "a *principle*, not a synonym for `contract`." |
| `verification-wins` | principle / stance | Body opens "the stance that…". |
| `defects-amend-the-owning-story` | workflow rule | Imperative policy, not a noun. |
| `fail-closed-on-dirty-tree` | guardrail | Imperative rule that even names an enforcement behaviour (writes nothing, distinct exit code). Strongest recategorize candidate. |

### 4b. Mis-categorized — anti-patterns / v1-lessons filed as `pattern`

`pattern` = "a reusable approach you apply." These three instead recount **what v1 did
wrong**. Aligned with their "Approach" reframed as "what v2 does instead," but the fit is
poor:

| id | Issue | Recommendation |
|---|---|---|
| `auto-merge-on-green` | anti-pattern **and** redundant with the `approval-gated-trunk` guardrail (same ADR-0008 inversion) | Fold into / point at `approval-gated-trunk`, or reframe as an explicit "lesson." |
| `vibe-the-load-bearing-layers` | anti-pattern; overlaps the `own-the-layers` principle | Reframe as the failure-story `own-the-layers` warns against; cross-link or merge. |
| `store-lock-races-and-id-collisions` | anti-pattern; remedies already live in `claims-in-the-shared-store` + `durable-workflow-per-node` | Reframe as a "lesson," or fold the v1 evidence into those units. |

> **Owner decision worth surfacing:** the corpus has a recurring *"v1 scar / lesson"* shape
> that fits none of the five kinds cleanly. Options: (a) accept them as `principle`s stated
> in the negative, (b) fold each into its positive counterpart, or (c) note that a future
> "lesson"/"anti-pattern" kind is out of scope here (ADR-0017 owns kind changes).

### 4c. Redundant / overlapping pairs

| Units | Overlap | Recommendation |
|---|---|---|
| `inner-loop-outer-loop` (def) ↔ `human-owns-the-outer-loop` (guardrail) | Near-verbatim inner/outer-loop split, incl. the same "north-star may dissolve it" clause | Keep the **definition** as neutral vocabulary; let the **guardrail** carry the enforcement claim and *cite* the def instead of re-describing both loops. |
| `own-the-layers` (principle) ↔ `vibe-the-load-bearing-layers` (pattern) | Same ADR-0001 "don't vibe the load-bearing layers" rule, positive vs negative | Keep the principle; reframe the pattern as its anti-pattern, or merge. |
| `auto-merge-on-green` (pattern) ↔ `approval-gated-trunk` (guardrail) | Same trunk inversion | See 4b. |

### 4d. Thin (little content beyond restating the term)

| id | Note / recommendation |
|---|---|
| `proposed`, `building` | One-line lifecycle-status values. Consider folding the lifecycle states (proposed / building / healthy / unhealthy / mapped / retired) into **one "lifecycle status" definition** instead of one thin entry per value. |
| `title`, `id` | Trivial unit-field defs. Consider merging the unit-field defs (`title`, `id`, possibly `outcome` / `guidance`) into one "unit fields" reference. |
| `proof-hash` | Single-sentence leaf def. Either expand with the ADR-0016 staleness/anchor mechanism, or accept as a deliberately terse leaf. |
| `stack-pixijs-react-studio` | Documents an **intention**, not something built on — body says "no PixiJS yet." Keep as forward-looking, but mark deferred/not-yet-integrated in the description; enrich once `@pixi/react` is actually wired in. |

---

## 5. Open decisions for the owner

1. **The "v1-lesson / anti-pattern" shape (§4b).** Four-plus units don't fit the five kinds.
   Accept-as-negative-principle, fold-in, or defer to a future kind decision (ADR-0017)?
2. **Rule-shaped glossary terms (§4a).** Keep glossary definitions that state rules, or
   migrate the strongest (`fail-closed-on-dirty-tree`, `defects-amend-the-owning-story`) to
   `guardrail`/`principle`? (`fail-closed-on-dirty-tree` would need a stated enforcement
   mechanism to be a true guardrail.)
3. **Lifecycle-status consolidation (§4d).** Six thin status defs → one enum-style definition?
4. **Redundant pairs (§4c).** Trim-and-cross-link, or merge-and-retire one side?

None of these were actioned — all leave `id`/`category` intact pending owner direction.

---

## 5b. Update — round 2: mutations applied + durability findings (2026-06-07)

After owner authorization to "mutate misfits to align where value isn't lost," I dug into
how `assets.json` is produced and acted on the high-confidence misfits.

### Architecture discovered (key onboarding context)

- **`apps/studio/data/assets.json` is the runtime store** the dev server reads/writes.
- **`apps/studio/data/seed.assets.mjs` is the provenance generator** (`--force` regenerates
  the store). It (1) **hand-curates** the principles/patterns/guardrails/techstack, (2) ships
  the 6 templates, and (3) **auto-extracts the 54 `definition` units from `docs/glossary.md`**,
  hard-coding `category: 'definition'` and taking each glossary paragraph **verbatim** as the
  body (`description` = its first sentence).
- **`category` is functional**: `apps/studio/src/lib/templates.ts` blocks saving a `guardrail`
  whose body lacks an "Enforced by" section.
- **A blessed override mechanism already exists**: `deep-modules` and
  `standalone-resilient-library` are glossary terms that the seeder lists in `curated` with a
  non-definition category; the extractor skips any id already curated. This is exactly how a
  "glossary term that is really a principle/pattern" is meant to be handled.

### Mutations applied (durable — seeder + store, verified by a `--force` reseed)

Recategorized 5 glossary terms that the glossary's own "## Principles & patterns" section
already classifies as rules/stances, via the curated-override mechanism above, and rewrote
each body to its **new** kind's template:

| id | definition → | Basis |
|---|---|---|
| `red-green` | **principle** | Glossary: "A *principle*, not a synonym for `contract`." |
| `verification-wins` | **principle** | Glossary: "The **stance** that…"; listed under Principles & patterns. |
| `cold-rebuild` | **principle** | Glossary: "An **authoring guideline** (not a gate)." (Also fixed its truncated `…` description.) |
| `defects-amend-the-owning-story` | **pattern** | Glossary Principles & patterns; a reusable defect-handling approach. *Soft call — could be a principle; reversible.* |
| `fail-closed-on-dirty-tree` | **guardrail** | A deterministically-enforced refusal (writes nothing, distinct exit code); given a proper "Enforced by". *Soft call — could be a principle; reversible.* |

New counts: principle 8, pattern 12, definition 49, guardrail 9, techstack 4, template 6.
`id` and `references` unchanged for all 5; bodies follow the target template.

### Durability gap raised (NOT resolved — needs owner direction)

The **body alignments from round 1 are NOT yet durable**: the seeder still hand-curates the
other 28 non-definition bodies in their pre-alignment form, and re-extracts all definition
bodies as **raw glossary prose**. A `--force` reseed today reverts every aligned body except
the 5 recategorized units (whose new bodies are now in the seeder). The aligned bodies live
only in the runtime store. Making them durable is the **#1 open decision** (see §7) — and it
collides with a real constraint: the glossary extractor splits on blank lines and takes one
paragraph as the body, so the multi-section definition template **cannot** be pushed back
into `glossary.md` without breaking extraction. Options are in §7.

---

## 6. Method & guardrails respected

- **Stayed in lane:** only `apps/studio/data/assets.json` was modified. No `infra/`,
  Cloud SQL, DB, or `packages/core` changes. No ADR-0017 DEFERRED item resolved.
- **ADR-0013 discipline preserved:** structured fields (`id`/`category`/`references`/
  timestamps) stayed structured and untouched; only the prose `body` view was reshaped.
- **Verified:** post-write, every unit's `id`, `category`, `references`, and `createdAt`
  matched `HEAD` exactly (0 drift); the only field-level change beyond `body`/`updatedAt`
  was `template-adr.description`. File re-parses as valid JSON, 88 units.
- Body authoring was fanned out across six subagents (one per disjoint id-set, each writing
  an isolated patch file), then assembled by a single script that controlled all structural
  fields — so no field outside `body`/`updatedAt`/`template-adr.description` could change.
- Round 2 added the 5 curated overrides to `seed.assets.mjs` and verified a `--force` reseed
  reproduces the new categories/bodies identically (then restored the hand-aligned store).

---

## 7. Open decisions — detail for the owner

> **Now live as `open-question` artifacts in the Library** (new first-class artifact type,
> gloss "an unresolved decision to settle"). D1→`oq-library-body-durability`,
> D2→`oq-anti-pattern-lessons`, D3→`oq-redundant-library-pairs`, D4→`oq-thin-glossary-terms`,
> D5→`oq-soft-recategorizations`. Decide them in the studio (comment / edit) rather than over
> chat — this is the dogfooding handoff. The detail below mirrors those artifacts.

These were **not** mutated: each is a genuine fork (destructive, or touches the authoritative
glossary, or is your design taste). My recommendation is marked ★.

### D1 — Durability of the body alignments vs the seeder *(the big one)*

Round 1 aligned 82 bodies in the runtime store; the seeder would revert all but the 5
recategorized units on `--force`. Constraint: the glossary extractor takes one verbatim
paragraph per term, so the multi-section **definition** template can't live in `glossary.md`.

- **D1-A — Store is source of record.** Treat `assets.json` as authoritative; the seeder
  stays a bootstrap/reset fallback (regenerates less-polished bodies). Simplest, zero further
  work; cost: provenance drifts, a naive reseed degrades quality. *(This matches ADR-0017's
  end-state "the store is source, markdown is the view" — but informally, not yet enforced.)*
- **D1-B — Seeder authoritative, definitions mechanically wrapped.** Sync the 28 curated
  bodies + template refinements into the seeder, and teach the extractor to wrap each glossary
  def as `**In one line.** {first sentence}` + `## What it is` + {prose}. Fully regenerable;
  cost: definitions lose round 1's hand-crafted "What it is not" / "See also" splits.
- ★ **D1-C — Hybrid.** Seeder authoritative for curated + templates; definitions get the
  mechanical wrap as the regenerable baseline, **and** the ~15 defs that have genuine
  "what it is not" / cross-link content are promoted to curated overrides (like deep-modules).
  Best durability/quality balance; cost: a follow-up pass to pick and curate those defs.

### D2 — The "cautionary lessons" anti-patterns

`auto-merge-on-green`, `vibe-the-load-bearing-layers`, `store-lock-races-and-id-collisions`
sit under the seeder's `// pattern: practices & cautionary lessons` comment — an **intentional**
sub-bucket of `pattern`. They describe v1 mistakes, not approaches you apply.

- ★ **D2-A — Keep as-is**, just cross-link each to its positive counterpart
  (`approval-gated-trunk`, `own-the-layers`, `claims-in-the-shared-store`). Honours the intent,
  no deletion.
- **D2-B — Merge & retire**: fold each lesson's v1 evidence into its counterpart's "Why" and
  retire the unit. DRY-est; destructive (loses standalone discoverability of the lesson).
- **D2-C — Recategorize → `principle`** (stated negatively). Keeps them standalone but stops
  calling them "patterns."

### D3 — Redundant pairs

`inner-loop-outer-loop` (definition) ≈ `human-owns-the-outer-loop` (guardrail); and
`own-the-layers` (principle) ≈ `vibe-the-load-bearing-layers` (pattern).

- ★ **D3-A — Keep both, trim overlap + cross-link.** The definition carries neutral
  vocabulary; the guardrail/pattern carries the enforced/cautionary claim. Non-destructive.
- **D3-B — Merge & retire one side of each.** Fewer units; destructive.

### D4 — Thin units that are authoritative glossary terms

The lifecycle statuses (`proposed` / `building` / `healthy` / `unhealthy` / `mapped` /
`retired`) and `title` / `id` are thin, but each is a canonical `docs/glossary.md` term
auto-extracted into the Library. Consolidating them means **editing the glossary** (the
source of truth `glossary-wins` defers to) — a heavier move than a Library edit.

- ★ **D4-A — Leave as-is.** Thinness is fine for canonical vocabulary; one addressable unit
  per term has injection value.
- **D4-B — Consolidate** lifecycle statuses into one "lifecycle status" definition and
  `title`/`id`/`outcome`/`guidance` into one "unit fields" definition — requires a glossary
  edit + an extractor that understands grouped terms. (`proof-hash` would also be expanded
  with the ADR-0016 staleness anchor, or left as a terse leaf.)

### D5 — Soft recategorization calls to confirm/veto (already applied, reversible)

`defects-amend-the-owning-story → pattern` and `fail-closed-on-dirty-tree → guardrail` are
defensible but debatable (both could be `principle`). Flag if you want either flipped.
