---
status: accepted
decided: 2026-06-11
---

# ADR-0034: `process` artifacts — ways-of-working as a downstream library kind

## Status

accepted (2026-06-11). Adds a seventh structured kind to the Library schema (ADR-0017/0018) and
lands its first three instances plus the three missing surface definitions. Also updates the
`CLAUDE.md` commit/merge convention (see §4).

## Date

2026-06-11

## Context

The project now operates across three solidifying surfaces — the **story tree** (the work DAG),
the **noticeboard** (session presence, ADR-0033), and the **library** (the knowledge tier,
ADR-0017/0019/0023) — but the *ways of working* across them live nowhere a session reliably reads:

- The **merge ceremony** is split across ADR-0022 (CI green gate + auto-merge), ADR-0031
  (non-squash for `claude/real/*` promotions), one line in `CLAUDE.md`, and per-session memory.
  The observable symptom: the owner kept having to tell sessions to commit and open a PR, and
  sessions sometimes reached for `gh pr merge` — which on this repo merges *pre-CI* (no required
  checks).
- The **library edit ceremony** (`db:up` → CLI `--pg`; never hand-edit `knowledge.json` for live
  state; never `load-corpus --force` over CLI edits) lives only in `CLAUDE.md` prose.
- The library *misleads by omission* here: its only merge-adjacent artifacts (`trunk`,
  `approval-gated-trunk`) describe the **product story-trunk** (approval-gated, ADR-0008) and read
  as contradicting the dev repo's auto-merge-on-green unless the reader knows the two-trunk
  distinction in ADR-0022 §Relationship.
- None of the existing kinds fits an operating procedure: `pattern` is design-shaped
  (problem/approach/tradeoffs), `guardrail` requires deterministic enforcement, `principle` is a
  judgement rule. A ceremony is trigger + ordered steps + surfaces + failure modes.

## Decision

1. **A new structured kind `process` in `KIND_SPECS`** (`packages/core/src/knowledge.ts`), with
   fields: `statement` (lead, "**The ceremony.**"), `trigger`, `steps`, `surfaces`,
   `failureModes` (all required), `verification` (optional — what deterministically checks the
   ceremony was followed; if nothing does, the artifact must say so). Schema, renderer, template,
   CLI listing and studio editor all derive from `KIND_SPECS` as usual (ADR-0018), so the only
   other touches are the three hardcoded category lists (CLI `KIND_ORDER`, studio
   `AssetCategory`/`ASSET_CATEGORIES`/gloss, devApi).

2. **Process artifacts are *downstream, derived* artifacts.** They are synthesized from the
   deciding ADRs and guardrails, cite them via `references`, and **reference-don't-restate**
   (ADR-0029 §7): a process carries the *operational* shape (when, then what, in what order) and
   points at its sources for the *why*. On any disagreement, the cited ADR wins — a process
   artifact is a view of decisions, never a place where new policy is made.

3. **First instances** (authored via a fan-out + adversarial-verify agent workflow, landed to the
   seed and the live store together): `merge-ceremony`, `library-edit-ceremony`,
   `real-build-drive`. Alongside them, the three missing **surface definitions** — `library`,
   `noticeboard`, `story-tree` — so the glossary finally names the surfaces sessions work across.

4. **The `CLAUDE.md` cadence line changes** from "Commit only when asked" to: when a unit of work
   is green, commit and open a **non-draft PR** without being asked; **never merge manually**;
   hold = draft / `hold` label; `claude/real/*` merges non-squash. Merge to `main` quickly and
   frequently — the trunk-based cadence ADR-0022 was built for, now stated where sessions read it.

## Named-deferred (captured, not decided)

**Code-backed artifacts.** The owner's observation: guardrails claim an `enforcedBy`, and nothing
keeps that claim honest as code moves; artifacts could carry their own test suite where the link
is worth maintaining (a guardrail's test asserts its enforcement mechanism still refuses).
Captured as `oq-artifact-code-backing` in the Library rather than decided here — it interacts
with ADR-0016 (knowledge↔code binding & staleness) and should be designed against it, not ad hoc.

## What this does NOT decide

- A DB→seed export path (the seed still lags live CLI edits; unchanged from ADR-0023).
- A presence/session-startup process artifact — premature until the `notice-board` story's
  surfaces are built and stable (ADR-0033).
- Any change to the guardrail kind's schema (the code-backing idea above).

## References

- ADR-0017 / ADR-0018 (the library schema; templates → schema), ADR-0022 (CI green gate +
  auto-merge), ADR-0031 (REAL promotion, non-squash), ADR-0008 (the *product* approval-gated
  trunk — the distinction the `merge-ceremony` artifact must carry), ADR-0029 §7
  (reference-don't-restate), ADR-0033 (noticeboard), ADR-0016 (binding & staleness — the
  named-deferred's home).
- Owner conversation, 2026-06-11.
