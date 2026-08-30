---
id: "signal-synthesis"
tier: capability
story: feedback-graduation
title: "A synthesis agent graduates accumulated signal into open-questions / proposals (RETIRED — the agent was built)"
outcome: "A future synthesis agent reads the signal-graph and proposes open-questions / proposals for operator review."
status: retired
proof_mode: integration-test
# KEPT DELIBERATELY, and both edges point at RETIRED nodes. The lineage is the point: all three
# retire together in one adjudication, and clearing these edges would erase why they travel as one.
# Nothing LIVE depends on this node or on either of those.
depends_on: [cite-event, archive-with-reason]
decisions: [32, 168, 287, 298, 477]
# RETIRED 2026-08-31, and deliberately carrying NO `proof:` block. The AGENT this node describes was
# built (`graduation-synthesist`) but it is a live Library artifact, not code under a capability's
# proof arm — there is no test file this node could honestly name.
---

# A synthesis agent graduates accumulated signal into open-questions / proposals (RETIRED — the agent was built)

**Outcome —** A future synthesis agent reads the signal-graph and proposes open-questions /
proposals for operator review.

> **RETIRED 2026-08-31 — because the thing it describes as FUTURE already exists.** This spec is
> written in the future tense about "a future synthesis agent". That agent is live:
> **`graduation-synthesist`**, un-parked and BUILT by **ADR-0168 D5** on the owner's direction
> (*"I shouldn't need to be included in this loop unless a dedicated subagent says so"*). Its own
> body calls it "the un-parked dedicated adjudicator ADR-0032 §3 named and ADR-0168 D5 BUILT". Read
> it with `storytree library artifact graduation-synthesist --pg`.
>
> **Its stated reason for being DEFERRED was resolved, not merely overtaken.** The original body
> said this node was "deferred, not merely unbuilt: its trust model waits on identity §1". ADR-0168
> D5 is exactly the owner fork it was parked awaiting, and the owner exercised it. There is no
> remaining condition for this node to wait on.

## Why RETIRE and not RE-SCOPE

Re-scoping would mean rewriting this node to describe what is actually wanted now — but what is
wanted now is **already delivered, and delivered as an AGENT rather than as a capability**. The
adjudicator is a live Library artifact of kind `agent`; the mechanism it chairs is code owned at
STORY grain (`repo-manifest.json` maps `packages/cli/src/*friction*.ts` to `feedback-graduation`);
and the judgement it performs is this story's UAT leg 4, deliberately witnessed by a human. Every
piece of the outcome therefore has a live owner already. A re-scoped capability here would own
nothing that is not owned, and would re-introduce a node the prove-it gate could never discharge.

## What was delivered, and in what different form — verified at source 2026-08-31

- **The input is NOT a cite signal-graph.** The synthesist reads friction artifacts + comments +
  agent-memory candidates + the decision log. The cite store this node's `depends_on` assumed was
  never built and is now decided against (ADR-0477 D1 made the authored `depends_on` edge the only
  edge the library carries) — see [`cite-event`](cite-event.md).
- **The output is NOT an OQ-or-`proposal` pair.** The `proposal` KIND that ADR-0287 created was
  RETIRED by **ADR-0298 D2**; deferred remedies are now PARKED as arc increments
  (`storytree arc increment new … --friction <id> --pg`), and the owner escalation is a
  born-`proposed` ADR. The `open-question` tier survives and is authored with
  `storytree question new`.
- **"Writes nothing durable directly" SURVIVED intact.** Least-authority is the synthesist's stated
  design: it ROUTES and ESCALATES, and the per-route authors (guidance-curator, librarian-curator,
  story-author) do the durable writes.

## Contracts (would-be) — all three retired with the node

These were explicitly headed "would-be" and named no test file, so nothing here pointed at a
dissolved package. Each is restated as its disposition.

1. **`emits-through-oq-flow`** — synthesis output is an OQ / proposal via the ADR-0018 path, never a
   direct guidance write.
   - **disposition —** SUPERSEDED as to the OBJECT, DELIVERED as to the RULE. The `proposal` kind no
     longer exists (ADR-0298 D2), so the named emission is unbuildable; the never-a-direct-guidance-
     write rule it protected is live in the synthesist's least-authority charter.
2. **`provenance-is-walkable`** — each emitted artifact references the signal-graph it was
   synthesised from.
   - **disposition —** DELIVERED, in DERIVED form. The walk is arc-to-friction rather than
     cite-to-cite: an arc's OPEN increment names the item in `frictionRefs`, `friction route` reads
     that derivation, and `--discharged-by` stamps a landed remedy. Proven by
     `packages/cli/src/friction.test.ts` — "an OPEN entry naming the item parks it WITHOUT --arc —
     the derived read is what answers", "TWO arcs parking the same item are both reported, deduped
     and in sorted order", and "list marks a discharged archived item so the two ends of a route are
     tellable apart". This story's UAT leg 2 asserts it at story grain.
3. **`ignores-archived-signal`** — archived posts and their cites do not feed synthesis.
   - **disposition —** CONTRADICTED by the landed design, and deliberately so. ADR-0168 D2 requires
     the OPPOSITE: an archived item is a RETAINED tombstone precisely because "recurrence of an
     archived trap must be detectable and re-open it with the stronger evidence", pinned by
     "reinforce records a recurrence on an ARCHIVED item". Building this contract would now be a
     regression.

## The original design (historical record — ADR-0032 §3)

Kept so the retirement is legible, NOT as work to pick up: graduation is intelligence, not
arithmetic — no deterministic cite-threshold scan, no auto-promotion, and no anti-gaming machinery
(ADR-0032 §5). That posture is unchanged and is inherited in full by the built synthesist.
