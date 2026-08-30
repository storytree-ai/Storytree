---
id: "oq-hygiene-gate"
tier: capability
story: drive-machinery
title: "Retired — the open-question hygiene gate on live story builds (ADR-0037 §5)"
outcome: "Retired by ADR-0477: the library `references` field the gate read to find the open questions bearing on a story is gone from the schema, and `open-question` is edge-free, so there is nowhere left to say which decision a question is about — the gate's input is unrepresentable, not merely empty."
status: retired
proof_mode: integration-test
depends_on: [prove-spec-resolution]
# RETIRED 2026-08-30 (citation-tier-retirement-arc, increment `retire-the-oq-hygiene-gate-module`),
# following ADR-0477's retirement of the library `references` field.
#
# WHY THE INPUT IS UNREPRESENTABLE, NOT MERELY EMPTY — this is the whole reason the capability
# retires rather than sitting `proposed` waiting for data. The gate found the questions bearing on a
# story by intersecting the story's declared `decisions:` (ADR-0037 §2) with `doc:decisions/NNNN`
# pointers carried in each open-question's `references[]`. ADR-0477 removed `references` from the
# schema, and `open-question` is an `EDGE_FREE_KINDS` member (ADR-0223 D1), so it carries no
# `dependsOn` for the pointer to move to. There is no field left in which a question can say which
# decision it is about. A gate whose input cannot be EXPRESSED is not an empty gate — it is a gate
# that can never fire again, and one that would report "clean" forever while saying nothing.
#
# MEASURED AGAINST THE LIVE STORE 2026-08-30, rather than inferred: 27 live `open-question` rows,
# 16 still carrying an undrained `references[]` array, and ZERO carrying a decisions pointer.
#
# WHAT WENT WAS THE INPUT, NOT THE LOGIC. `classifyOpenQuestions` — the awaiting-answer /
# unprocessed-answer / engaged classification and the rule that a LATER non-operator follow-up
# engages an unresolved operator answer — was UNCHANGED and still unit-true at the moment it was
# deleted. Every one of the eight contracts below was REAL and passing. Nothing about the
# classification was found wrong; it was orphaned. It is RECOVERABLE FROM GIT if a later decision
# wants an open question to gate a story's green again (`git log -p -- packages/drive/src/oq-gate.ts`
# and its colocated `oq-gate.test.ts`).
#
# WHAT WOULD NEED RE-DECIDING FIRST is the ATTACHMENT, never the classification: how an
# `open-question` says which decision it bears on. That wants a TYPED POINTER on the kind — the
# `arcRef` / `settledByRef` shape the tier already uses — not a revived citation array. Reviving the
# citation is the move ADR-0477 closed off; re-deciding the attachment is the move that would make
# this capability authorable again.
---

# Retired — the open-question hygiene gate on live story builds (ADR-0037 §5)

**Retirement —** This capability described the ADR-0037 §5 enforcement half: before any store setup
or spend, a LIVE `story build` resolved the story's deciding ADRs, found the open questions pointing
at those decisions, and REFUSED the build while an operator's answer sat unprocessed. ADR-0477
retired the library `references` field the pointer lived in, and `open-question` carries no
`dependsOn` edge for it to move to — so the gate's input became unrepresentable. The module
(`packages/drive/src/oq-gate.ts`), its colocated suite, and its call site in `story build` were
deleted in the same landing.

**This is a retirement of the ATTACHMENT, not a judgment on the RULE.** ADR-0037 §5's rule — an
unprocessed operator answer on a deciding ADR's open question should stop a live build before it
spends — is not withdrawn here, and nothing in this landing decided it was wrong. What was withdrawn
is the only way the corpus had of saying *this question is about that decision*. Reviving the gate is
a matter of deciding how a question declares that, not of rewriting how it classifies comments.

## What was proven, and is now history

The eight contracts below were REAL and passing when the module was deleted; they are kept as the
record of what the deleted code did, so a later reviver knows exactly what already worked and does
not re-derive it. Their `covers —` / `proven by —` targets no longer exist in this checkout.

1. **`only-deciding-adrs-pull-oqs-in`** — an OQ with no reference to a deciding ADR is excluded.
   This is the contract the retirement kills: the reference it read has no schema home left.
2. **`no-answer-is-awaiting`** — no operator comment → `awaiting-answer`.
3. **`unresolved-answer-is-unprocessed`** — an unresolved operator comment → `unprocessed-answer`;
   all resolved → `engaged`.
4. **`follow-up-engages-only-after`** — a non-operator comment AFTER the latest unresolved answer
   engages it; one BEFORE does not (the engagement TIMESTAMP rule — the unclear-answer path).
5. **`nothing-to-check-never-refuses`** — a story with no `decisions` and a dry-run both passed
   through with an honest header line, `refusal: null`.
6. **`live-unprocessed-refuses-with-the-three-paths`** — a live build with an unprocessed answer was
   refused, naming the OQ, its ADRs, and the three ways out (process it, post a follow-up, fix a
   wrong link).
7. **`awaiting-warns-clean-reports`** — only-awaiting answers WARNed without refusing; a clean state
   reported clean.
8. **`never-refuse-blind`** — an unreachable live store yielded an UNCHECKED line, never a refusal.

Contracts 2, 3, 4, 7 and 8 are the classification and the never-refuse-blind posture — all of them
input-agnostic, all of them still true of the deleted code, and all of them recoverable verbatim.
Only contract 1 depended on the retired field.

## The sibling that survives

ADR-0037's enforcement was split by TRIGGER SURFACE, not duplicated: §3–4 on the contributor PR,
§5 on the live `story build` drive. The PR half — [`adr-health-gate`](../ci-cd/adr-health-gate.md) in
`stories/ci-cd` — is untouched by this retirement and still runs. §5 is the half that loses its
enforcement; ADR-0037 keeps its in-place annotation recording that.

## Historical boundary

This unit depended on [`prove-spec-resolution`](prove-spec-resolution.md) for one thing: the loaded
`NodeSpec`'s `decisions` field was the gate's input. The dependency list is kept only as retired
history. The capability is absent from the story's current capability list and dependency graph, and
[`build-drive-cli`](build-drive-cli.md) no longer declares it — the import that justified that edge
(`oqHygieneGate` in `story-build.ts`) is gone. It carried no `real:` proof arm, so no build could
select it as current work before or after.
