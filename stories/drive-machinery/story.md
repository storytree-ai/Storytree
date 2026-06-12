---
id: "drive-machinery"
tier: story
title: "The drive machinery"
outcome: "The spine drives any registered node through a genuine red→green proof and lands the proven commit through the merge gate."
status: proposed
proof_mode: UAT
capabilities: []
# Story-level edge (ADR-0010 §4, code-import-evidenced; ADR-0036): the drive consumes the
# library story's store connection seam — createPool/closePool/applySchema + the narrow
# Store seam type in packages/cli/src/node-build.ts (events.work_event/verdict are its OWN).
depends_on: [library]
# Deciding ADRs (ADR-0037 §2): the gate (20), the SDK leaf (30), promotion (31), leaf tools (35).
decisions: [20, 30, 31, 35]
---

# The drive machinery

**Outcome —** The spine drives any registered node through a genuine red→green proof and lands
the proven commit through the merge gate.

This is the story home for storytree's own build machinery: the prove-it-gate (ADR-0020), the
node/story build drive (`node build` / `story build`, PRs #26–#30), REAL worktree builds, and
promotion (ADR-0031). Per the V1 lesson recorded in ADR-0031 §3, **machinery is ordinary work in
the ordinary tree** — it gets a normal story, not a special meta-corner.

## Honest status

`proposed`, thinly mapped — deliberately. The machinery itself is real and green
(`packages/orchestrator` + the CLI build surface, offline suites passing), but this story file
does not yet decompose it into capabilities: mapping the gate, the resolvers, the worktree/
promotion lifecycle and the registry into honest `mapped` capabilities (the `library`-story
treatment) is open authoring work. The file exists now so the story's units have a home and the
tree carries no parentless specs.

## Units

- [`verdict-line`](verdict-line.md) — contract grain, file-per-unit. The first REAL-built node
  (Phase F): proven by a signed PASS (run `real-mq7ky4ck`, persisted to `events.verdict`), then
  **folded into the system by promotion** (ADR-0031 §3): the exact proven commit is in this
  branch's ancestry, the function is exported from `@storytree/core`, and the CLI node-build
  envelope is its live consumer.

File-per-unit here is the **registered-buildable grain** (the drive loads one spec file per
buildable node); the seed's contracts-inline convention continues to apply to authored capability
files (see `stories/README.md`). Both conventions are real; ADR-0031 §3 records the distinction.
