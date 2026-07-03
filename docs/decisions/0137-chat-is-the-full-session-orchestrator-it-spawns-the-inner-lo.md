---
status: accepted
decided: 2026-07-02
amends: [108]
load_bearing: true
---
# ADR-0137: Chat is the full session-orchestrator: it spawns the inner loop; ADRs are its one direct write

## Status

accepted — directed by the owner 2026-06-29 in design discussion with the orchestrator, drafted by
the orchestrator from that discussion (the workflow this ADR itself sanctions, decision 2), and
**green-lit by the owner 2026-07-02** ("proceed to build Phase 3" — the nod the proposed status
awaited; the agent-permitted green flip, ADR-0084). It mostly **affirms the already-accepted
ADR-0108**; what is genuinely NEW is the ADR-authoring carve-out (decision 2), the sharpening of
*how* ADR-0108 Phase 3 is built (decision 1), and the consultative change/fix routing model
(decision 4 — owner-confirmed 2026-06-29: a bug is a missing contract). Amends ADR-0108; upholds
ADR-0091. Built on since accept by ADR-0138 (the claim-at-spawn wall: the orchestrator takes the
story-claim before any spawn; ADR-authoring is the sole claim-free act).

## Context

ADR-0108 already decided the shape the owner re-articulated here: a server-side session-orchestrator
runtime with **whole-loop authority** (orient → decide → decompose → route provable units to the inner
loop → gate → librarian pass → open the landing PR), running the one generated `session-orchestrator`
agent (ADR-0051), **driving the spine without ever handing in a verdict** (ADR-0091 upheld, d.5), with
**accept-to-land the permanent human gate** (d.3). Its accepted costs explicitly name that it "runs
agent-authored orchestration (decompose, **spawn subagents**, open PRs)."

But the BUILD is phased, and at decision time only Phases 1–2 were realized in the desktop chat: it
was a **read/propose-only** headless session (`packages/agent/src/headless-orchestrator.ts` —
`tools: []` + orientation + `propose_unit`). It could orient and propose; it could not spawn anything
or drive. The desktop-drive walk (2026-06-28) had added a propose→accept→**dispatch** bridge (click
Build → `routedBuildRunner`), but the orchestrator still did not SPAWN the inner loop. So "chat brings
a story in" or "chat fixes a bug through the inner loop" was unreachable — **not because it was
undecided** (ADR-0108 decided it) but because **Phase 3 (drive authority) was unbuilt.** *(Since
built: `stories/chat-subagent-spawn` landed all five machine capabilities green under signed `--real`
verdicts — the claim-gated spawn tools mounted on `runHeadlessOrchestrator`, the real spawn-deps
composition threaded through `orchestrate()`; the live desktop spawn walks remain the story's
operator-attested UAT legs.)*

The owner's framing sharpens two things ADR-0108 left implicit:

- **How the orchestrator drives** — by SPAWNING the right subagents into the strong inner-loop
  scaffolding (often literally one: the story-author to author work; the builder leaf to drive a
  change/fix red→green), which it ADHERES TO and does not reinvent. The chat gets *orchestration
  (spawn)* power, not raw `Write`/`Bash`.
- **The one thing it does NOT delegate** — authoring ADRs. The owner's reason: the orchestrator holds
  the discussion context, a handoff to a spawned subagent bleeds it, and orchestrators are precisely
  the role that sharpens discussion into a decision. (This ADR is itself an instance of that.)

## Decision

1. **The desktop chat realizes ADR-0108's whole-loop authority by SPAWNING subagents into the
   inner-loop scaffolding** — the sharpening of how Phase 3 (drive authority) is built. The
   orchestrator's power is to SPAWN and route, never to write code or sign:
   - Bring a story in (`mapped`/`proposed`) → spawn the **story-author** (the work-hierarchy write —
     disk-canonical `stories/**` frontmatter files, ADR-0039 — made in the spawned session, never the
     chat; often a single spawn — "literally just a story writer").
   - Bug fix / change → spawn the **inner-loop builder leaf** to drive the change red→green; the spine
     observes RED→GREEN and SIGNS, CI re-proves, the human lands (ADR-0091 + ADR-0022, verbatim).
   It ADHERES TO the existing strong scaffolding (the prove-it-gate, the phase machine, the signing
   spine) — it spawns INTO it, never reinvents or bypasses it.

2. **ADR-authoring is the orchestrator's SOLE direct corpus write.** It MAY reserve (`adr new`) and
   author an ADR body directly — because it holds the discussion context and a subagent handoff loses
   it. EVERYTHING ELSE it produces goes through a spawned subagent: the work hierarchy via the
   story-author, code/tests via the inner-loop leaf, and the decision LOG's integrity (status
   projection, supersession edges, the `load_bearing` set, graduation) via the **librarian-curator**
   (ADR-0095 / ADR-0086). The orchestrator authors the DECISION; the librarian-curator maintains the
   LOG — complementary, not overlapping. (This formalizes existing practice — CLAUDE.md already has the
   orchestrator reserve ADRs for design forks.)

3. **The boundaries are unchanged.** The deliberate whole-story go-green stays the human's forest-map
   **Adopt/Build** button (ADR-0094 / ADR-0136) — a billed, outward-facing PR is a click, not an
   autonomous act. **Accept-to-land** stays the permanent human gate (ADR-0108 d.3). The orchestrator
   NEVER hand-signs a verdict (ADR-0091's no-verdict-handed-in stands; the spine signs). The
   orchestrator's spawning handles authoring + conversational changes/fixes; the human's button + merge
   are the direct gates.

4. **A change/fix routes through CONSULTATIVE enlistment, not a mechanical rule** (resolving the open
   tension this ADR first flagged). A bug fix or change is not a new story, so the orchestrator does not
   author it directly — it ENLISTS the roles the change needs and JUDGES the composition:
   - **A bug is a missing contract.** A bug is signal that the story is under-specified — a behaviour
     the contracts did not pin. So the orchestrator's first judgment is: *under-specified story, or
     right-contract-wrong-impl?* If under-specified → spawn the **story-author** to add the missing
     contract (the red test that reproduces the bug), then spawn the **leaf** to drive that contract
     red→green (spine signs, CI re-proves, human lands). If the contract was right and only the code was
     wrong → straight to the leaf to re-drive the existing contract. Either way the change becomes a
     **provable unit by becoming a contract** — the bridge from change → red→green. This extends
     `orchestrate-route-supplement` (decompose → route → supplement) and
     `route-structural-forks-to-story-author` into the change/fix domain.
   - **Each enlisted subagent advises HONESTLY against its own prose.** A subagent is a consultant, not
     a yes-man: it assesses the task against its OWN guidance and answers honestly — DO the work, report
     **no action needed** (e.g. the test author finds the coverage already sufficient), **push back**,
     or **escalate a clarifying question** up through the orchestrator (potentially to the user). The
     orchestrator composes these honest verdicts; it never pre-decides a role's output. This
     honest-consultant discipline is GENERAL — it governs every enlistment, not just changes — and is
     flagged as a **candidate Library principle** for the guidance-curator to author and graduate.
   - **Same flow for changes**, not only fixes: a change is a new/refined contract enlisted, judged, and
     driven the same way.

## Consequences

**Good**
- Settles HOW to build ADR-0108 Phase 3: the chat gains subagent-SPAWNING, not raw write/drive — so the
  safety is the **gate the spawned roles pass through**, not a special wall on the chat. The
  highest-leverage inner-loop-adoption lever (ADR-0128 / ADR-0129, `docs/research/inner-loop-adoption-gap.md`)
  gets a concrete, integrity-preserving build shape.
- The desktop chat becomes the SAME orchestrator the Claude Code terminal session already is (spawn
  subagents, delegate red→green, author ADRs) — one model, no special-case subset.
- The carve-out keeps decision-authoring where the context lives (no handoff bleed) while the
  librarian-curator still owns the log's integrity — the division is explicit, not blurred.

**Bad / accepted costs**
- An orchestrator that spawns the inner loop is a much larger surface than a propose-only session: it
  needs the SDK subagent/Agent-tool surface on the live runtime (ADR-0030), careful tool-scoping per
  spawned role, the single-session/concurrency guard (ADR-0108 d.6), and the turn-cap brake
  (ADR-0130 / ADR-0131). A real build arc, not a wiring increment.
- **RESOLVED by decision 4:** how a bug fix / change becomes a provable unit — it becomes a *contract*
  (a bug is a missing contract; story-author adds it, the leaf drives it red→green), routed through
  consultative enlistment. The residual is lighter and OPERATIONAL, not architectural: the orchestrator
  must BOUND the consultation (know when enough roles have weighed in) and route an upward clarification
  cleanly back to the human; and a real *unit-level* drive is still a smoke today (ADR-0099-B), so the
  leaf re-driving a single contract for a fix is itself a build-shape detail to settle when Phase 3 is
  built. *(Settled 2026-07-02 by
  [ADR-0144](0144-chat-accepted-node-builds-run-the-real-proof-and-persist-the.md), resolving
  `oq-fix-drive-build-shape` Option A: the routed node dispatch drives `node build --real` with persist
  semantics — real proof, signed verdict to `events.verdict`, PASS parked on a `claude/real/*` branch;
  landing stays the human gate, no auto-PR per node accept.)*

**Neutral**
- Affirms, does not retire, ADR-0108's shape and phasing; the terminal session-orchestrator is
  unchanged (it already works this way).

## References

- [ADR-0108](0108-chat-driven-orchestration-a-server-side-session-orchestrator.md) — the chat-driven
  session-orchestrator runtime + its phased build; this **amends/sharpens** d.3 (spawn-to-drive) and
  commits the Phase-3 build shape; affirms d.5 (no verdict handed in).
- [ADR-0091](0091-proof-bearing-builds-may-run-in-a-hosted-self-contained-work.md) — proof-off-tether;
  "no verdict is ever handed in" — **UPHELD** (the orchestrator holds no signing key; the spine signs).
- [ADR-0051](0051-the-agent-renderer-shapes-claude-md-and-the-leaf-prompt-from.md) — the generated
  `session-orchestrator` agent the runtime runs.
- [ADR-0095](0095-agent-memory-graduates-into-the-library-as-a-signal-sourc.md) / ADR-0086 — the
  librarian-curator (graduation + log integrity); the orchestrator spawns it. ADR-authoring stays the
  orchestrator's.
- [ADR-0094](0094-go-green-is-a-status-transition-proposed-builds-mapped-adopt.md) / ADR-0136 — the
  human's forest-map Adopt/Build is the deliberate whole-story go-green.
- [ADR-0030](0030-all-in-on-claude-agent-sdk.md) — the live Claude Agent SDK runtime (the
  subagent-capable author).
- ADR-0099-B — node `--live` smoke is synthetic; a real unit-level drive is the primitive a bug-fix
  path needs — since built:
  [ADR-0144](0144-chat-accepted-node-builds-run-the-real-proof-and-persist-the.md) routes the node
  dispatch to `node build --real` (persisting), settling the build-shape residual above.
- ADR-0128 / ADR-0129 + `docs/research/inner-loop-adoption-gap.md` — drive authority is the lever.
- `orchestrate-route-supplement` (Library pattern) — decompose → route → supplement with subagents;
  decision 4 extends it into the change/fix domain.
- `route-structural-forks-to-story-author` (Library principle) — the bug → story-author routing
  (a missing contract is a structural fork).
- **Candidate Library principle** (guidance-curator to author + graduate): the *honest-consultant
  enlistment* discipline — an enlisted subagent advises honestly against its own prose (act / no action
  needed / push back / escalate-for-clarification), never a yes-man executor (decision 4).
- Code: `packages/agent/src/headless-orchestrator.ts` (the propose-only runtime to promote);
  `packages/agent/src/sdk-author.ts` (`ClaudeAgentAuthor` — the subagent-capable runtime).
