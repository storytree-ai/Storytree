---
status: accepted
load_bearing: true
decided: 2026-06-10
amends: [12]
---

# ADR-0030: Adopt the Claude Agent SDK as a live runtime (pivot-out by architecture)

## Status

accepted (2026-06-10, owner) — **demotes [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)**
(the owned loop drops from *the* leaf runtime to one executor implementation; "Anthropic-only for now"
deepens to all-in — ADR-0011 corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)),
**amends [ADR-0012](0012-tool-execution-pluggable-sandbox.md)**
(the live sandbox is now supplied by the rented runtime; the `ToolExecutor` seam becomes the
pivot-out seam), and **reaffirms [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)'s
trust base** (spine-observed proof never enters the rented runtime).

**Correction ([ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md),
then [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md),
per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)):** the core
decision stands: rent a capable live coding harness, retain the owned loop as the
offline/deterministic fallback, and keep every leaf untrusted behind the spine-owned
`PhaseAuthor` proof boundary. ADR-0177 briefly overtook the stronger **Claude-only / all-in**
conclusion by admitting Cursor as a second live harness; **ADR-0198 retires that Cursor leaf**
(and its `CURSOR_API_KEY` billing path). Claude Agent SDK on subscription auth is again the only
admitted live prove-it-gate leaf. A broad provider registry remains deferred.

*Numbering note:* checked `git log --all` across all 20 remote branches on 2026-06-10 — no
ADR-0030 exists anywhere; the live-DB ref check is pending (instance stopped) per the
ADR-0027-collision lesson. *Reconciled 2026-06-13:* the live-DB ref check ran (instance up) —
six live library docs reference ADR-0030, all matching this ADR's content (the SDK-live-runtime
pivot); no parallel claim, no stale refs.

## Date

2026-06-10

## Context

[ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (2026-06-06) owned the agent
loop for two reasons: **context engineering as the differentiator**, and the V1 (`Agentic`)
cautionary tale that the Claude Code SDK was an opaque wrapper around a binary — "a wrapped
runtime is a runtime you don't fully own."

Four things changed (owner, 2026-06-10):

1. **The premise is reframed — this is the load-bearing change.** storytree's research object
   is the **story tree itself**: how the map of stories/capabilities/contracts helps an
   AI-driven SDLC, *and* how a human maintains observability over agent-driven work. Owning
   every byte of the context window and the loop was instrumental to that, never the premise.
   The differentiator is the **map and the pull surfaces** (the Library, ADR-0023's CLI), not
   the loop that consumes them.
2. **Model–harness co-evolution is accelerating.** Models are increasingly tuned with and for
   the Claude Code harness (tool shapes, context management, behavioral calibration). A
   bespoke raw-API loop re-derives harness quality per model release and falls behind; the
   Agent SDK rides the curve instead of chasing it.
3. **Code is cheap now.** The V1 opacity tale carried weight when a runtime rewrite was
   months of work. With agent-driven development, re-coding the loop is days. The risk
   ADR-0011 guarded against has a cheap remedy — *provided the pivot seams exist* — so the
   guard no longer justifies its capability and funding costs.
4. **Funding asymmetry at the time of decision.** From 2026-06-15, programmatic subscription usage (Agent SDK,
   `claude -p`, Actions) draws a dedicated monthly credit ($20/$100/$200 by plan tier), with
   extra-usage credit as overflow. The raw Messages API bills metered Console spend with no
   subscription path (consumer OAuth tokens are not sanctioned against it). For a self-funded
   project, the SDK was the surface with a recurring budget. That programmatic credit was later
   exhausted, firing the pivot class recorded in [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md).

## Decision

1. **Adopt the Claude Agent SDK as a live agent runtime.** Claude-backed live node builds
   (drive-machinery Phase D onward) may run through an SDK-backed executor, authenticated via the
   subscription (`claude setup-token` → `CLAUDE_CODE_OAUTH_TOKEN`). The raw-API `AnthropicModel`
   path is not the Claude live driver. [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md)
   briefly opened the same runtime seam to Cursor; that leaf was **retired** by
   [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md).
2. **Pivot-out is an architectural requirement, not an intention.** The named seams, each of
   which must hold as the SDK executor is built:
   - **Executor seam.** The spine drives phases through a runtime-agnostic executor
     interface. The SDK executor is one implementation; `packages/agent` (the owned loop)
     remains the **offline/deterministic implementation** (ScriptedModel tests) and the
     escape hatch.
   - **One tool core, two adapters.** Tool implementations stay behind ADR-0012's
     `ToolExecutor`; exposed to the SDK via in-process MCP adapters, to the owned loop
     directly. Policy and behavior live once.
   - **Write-scope policy as shared code.** One policy module; enforced by the
     write-scoped-executor on the owned loop and by `PreToolUse` hooks on the SDK.
   - **Spine-side proof unchanged.** The phase machine, spine-observed RED/GREEN
     (`shell-test-executor`), and signed verdicts stay spine-side. The trust base never
     enters the rented runtime — the SDK agent is an untrusted worker inside a phase, same
     as any other.
   - **Library context stays pull-based and harness-agnostic.** ADR-0023's CLI is the
     context surface in any harness; nothing about context delivery assumes the owned loop.
3. **Context engineering reframes** from "own the window" to "own the map and the pull
   surfaces." ADR-0011 §2's "never delegated to a third-party harness" is withdrawn. What
   stays owned: the story tree, the Library, the CLI, and the spine.
4. **The owned loop is not deleted.** It is small, green, and is the pivot target: the test
   harness for gate e2e and the fallback runtime if the SDK bites (opacity, policy churn,
   pricing) the way V1 predicted.

## Consequences

- **Demotes ADR-0011 §§1–2.** §3's seam discipline carries — pointed the other
  way: the seam now protects *exit from* the Anthropic SDK rather than entry. ADR-0004/0005
  boundary rules carry verbatim: a **single** model-runtime import site (now including the
  Agent SDK package), orchestrator-only driver, *run ≠ node*, no agent-spawns-agent.
- **Amends ADR-0012.** For live runs the sandbox is supplied by the SDK runtime (its
  permission modes + hooks); `ToolExecutor` remains for the offline executor and as the
  pivot seam. ADR-0012's "borrow sandboxing" intent is realized, just at a coarser grain.
- **ADR-0020 is unaffected in substance.** Red-green enforcement never trusted the loop; it
  trusts what the spine itself observes and signs. That is what makes this reversal cheap.
- **Reversal ledger.** [ADR-0003](0003-v1-reversal-ledger.md) gains the arc: v1-0003
  Claude-sub subprocess → pi (0001) → owned loop (0011) → **Agent SDK on subscription auth
  (0030)**. Note v1's "subscription-auth ban" was already declared dead in the settled
  reversals — this lands near where v1 started, with the spine-side gate as the difference.
- **A Claude Phase D run uses the Claude SDK executor.** Its accounting reads SDK-reported
  usage rather than metering an API key. The once-sufficient shared monthly programmatic pool was
  later exhausted; [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md)
  briefly admitted a second harness; [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md)
  retired it after metered Cursor API spend — Claude subscription remains the live path.
- **Test asymmetry, accepted with eyes open.** Loop-level e2e stays offline on the owned
  executor; the SDK executor gets live smoke coverage (Phase D) plus offline unit tests of
  its adapters (MCP tool mapping, hook policy). The gate's own guarantees remain offline-testable.
- **Follow-up sweep (tracked, not silent):** drive-machinery plan §Phase D/E assumptions
  (API-key wording → subscription token); `agent-artifacts-draft.json` / ADR-0029 references
  that describe the owned loop as *the* runtime; glossary wording for `leaf`/`agent loop`.

## What this does NOT decide

- A broad provider registry or provider-independent raw-model layer. [ADR-0177](0177-open-the-leaf-runtime-seam-to-cursor-while-keeping-the-deter.md)
  briefly admitted one evidence-backed second harness through the existing `PhaseAuthor` boundary;
  [ADR-0198](0198-retire-the-cursor-leaf-claude-agent-sdk-is-the-only-live-pro.md) retired that Cursor
  leaf. A future second harness needs a new ADR with an explicit funding model; the broader registry
  stays deferred.
- Per-phase model/effort selection across live harnesses.
- Whether/when the owned loop is ever retired — explicitly kept until the SDK executor has
  survived real drives.

## References

- [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md) (corrected in place per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)),
  [ADR-0012](0012-tool-execution-pluggable-sandbox.md) (amended), [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md),
  [ADR-0023](0023-library-cli-choose-your-own-adventure.md), [ADR-0003](0003-v1-reversal-ledger.md) (ledger).
- Anthropic billing change, effective 2026-06-15: programmatic-usage credit for Agent SDK /
  `claude -p` / Actions on paid plans.
- Owner direction, design conversation 2026-06-10 ("the core premise is the story tree …
  researching how our map helps the AI-driven SDLC and how I as a human maintain
  observability"; "good modular architecture … so if we need to pull out we can").
