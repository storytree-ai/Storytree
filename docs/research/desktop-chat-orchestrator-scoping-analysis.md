# Why the desktop chat over-routed a glue edit to a whole-story `--real` build

**Research + proposal for the owner (hua.mick@gmail.com). Not implementation.**
Date: 2026-07-05 · Checkout: clean worktree off `origin/main` @ `e007526` (verified `git status` clean,
HEAD == origin/main).

> Deliverable scope: this is analysis + a reviewable proposal. **Nothing here has been applied.** The
> `session-orchestrator` agent is seed-canonical (ADR-0055) — authored in
> `apps/studio/data/knowledge.json`, rendered via `storytree agents` — so any guidance change is the
> owner's to make personally. Proposed CODE changes are called out separately from proposed GUIDANCE
> changes.

---

## 0. The incident in one paragraph

In the 2026-07-04 desktop full-autonomy experiment, the desktop **chat** orchestrator (the
`session-orchestrator` running inside the Electron sidecar) was handed a **scoped** intent — *"add 3
missing routes to `apps/desktop/electron/backend-entry.ts`"* — a pure wiring/glue edit. Instead of a
targeted minimal change, it routed the work as a **whole-story** `story build desktop-build-mount
--real`: a full, billed, red→green build of the nearest existing story, which then opens an
auto-merging PR. Mechanically it worked (claim-gated spawn → routed worker → PR). It just did not scope
to the minimum change the intent described.

The owner's hypothesis was: *"the desktop chat gets the same guidance as Claude Code's
session-orchestrator, only without Claude Code's system prompt."* That hypothesis is **half right, and
the wrong half is where the bug lives** — see §2.

**Bottom line up front:** this is a **tooling gap, not a guidance gap.** By design the
session-orchestrator does not write code itself — it *delegates* glue to subagents (guidance: "supplement
the non-leaf glue with its own subagents"). On the **terminal**, that delegation is the general
**Agent/Task tool**: it can spawn an arbitrary write-scoped worker and hand it "add these 3 routes." The
**desktop chat has no general glue-subagent** — its only spawn targets are `spawn_story_author` (fenced
to `stories/**`) and `spawn_builder` (whole-unit `--real` build). So when the correct move is "delegate
this glue to a subagent," the chat has nothing to delegate it to, and `spawn_builder` — which ignores its
task prompt and routes the story id into a whole-story `--real` — is the only button left. The guidance
was already correct; it named a subagent affordance the surface lacks. **The fix is to add that
affordance, not to change the guidance.**

---

## 1. The current guidance, in full (the parts that bear on *what to build and at what scope*)

Source: `pnpm storytree agents session-orchestrator` (assembled from the seed corpus). The agent's own
prose + the injected `context` / `rules` / `antiPatterns` artifacts. Quoting the scope-bearing
sections verbatim.

### 1a. The agent's own body

**Role** (excerpt):
> orchestrator … **decides the unit; decomposes it into provable units and routes them through the
> prove-it-gate — the inner loop is one tool, not the whole job** (asset:orchestrate-route-supplement) —
> **supplementing the non-leaf glue with its own subagents** and delegating the red→green mechanics to
> the leaf and the spine …

**Tools** (verbatim — note what it *claims*):
> The full session surface, least-authority by intent: **Read / Grep / Glob / Edit / Write for the
> repo**; `pnpm gate` … the storytree CLI — `storytree library` + `agents` (orient), `adr list` …,
> `node` / `story build` (drive the gate), `adr new --pg` …, `noticeboard declare --pg` …; **`gh` for
> PRs.** The one forbidden verb: `gh pr merge` …

**Workflow step 1 (decide & decompose):**
> Decide & decompose the unit — **one coherent green unit (slow growth: the minimum to green)**, split
> into **provable units** by the routing filter 'does this piece have an isolatable red→green test?'
> (not package boundaries; `asset:orchestrate-route-supplement`). …

**Workflow step 2 (build to green):**
> Build to green — **route** the provable units to the inner loop chained in dependency order
> (`story build --real`, or sequenced `node build --real` across merges …), and **supplement** the
> non-leaf glue (DB/SQL, deps, visual/UI, config/wiring) **with your own subagents — yourself only as a
> last resort**; when the inner loop genuinely can't prove a piece, raise it as a capability gap rather
> than force-fitting or skipping it. …

### 1b. `orchestrate-route-supplement` (pattern) — the artifact most directly on point

> **The pattern.** The inner loop … (`storytree node|story build --real`) — is ONE tool the
> session-orchestrator wields, not the whole job. The orchestrator's job is to DECOMPOSE work into
> provable units, ROUTE those to the inner loop chained in dependency order, and **SUPPLEMENT the
> non-leaf glue with its own subagents — doing the glue itself only as a last resort.**

Approach, step 3 (verbatim):
> SUPPLEMENT the non-leaf glue — SQL/DB adapters, dependency additions, visual/UI, pure config/wiring
> with nothing to assert — **with the orchestrator's OWN subagents (the Agent tool)**; do it yourself
> only as a last resort.

Problem statement (verbatim):
> Treating `node/story build --real` as 'the job' force-fits work that has no isolatable red→green test
> — SQL/DB adapters, dependency additions, visual/UI, pure config or wiring — into a proof that can't
> pin it, or silently skips it.

### 1c. `slow-growth-minimum-to-green` (principle)

> **The principle.** Write the minimum source that turns ONE failing test green — no speculative
> abstraction, no speculative dependency, no wide refactor disguised as a fix.
>
> **How to apply.** Pick the one red test; make the smallest change in the owning package's source that
> turns it green; iterate one test at a time.

**Read the altitude carefully.** `slow-growth-minimum-to-green` is the **leaf's** discipline *inside* a
provable unit ("the minimum source that turns ONE failing test green"). It is not a rule about the
orchestrator's *routing/scoping* decision. `orchestrate-route-supplement` explicitly notes the two
compose: slow-growth is "the leaf's discipline INSIDE a provable unit." So the *only* artifact that
governs "should this glue become a `--real` build at all?" is `orchestrate-route-supplement` — and its
answer is **no**: pure config/wiring is glue to *supplement*, not to route into the inner loop.

**So the guidance already said the right thing.** The intent ("add 3 routes to a wiring file") is
textbook glue — "pure config/wiring with nothing to assert." The pattern says: do NOT route it to
`--real`; supplement it with your own subagents / do it yourself. The agent did the opposite. Why the
guidance did not bind is §3.

---

## 2. Verifying the owner's assumption — what the desktop chat actually receives

**Claim to test:** *"the desktop chat orchestrator gets the same guidance as Claude Code's
session-orchestrator, only without Claude Code's system prompt."*

### 2a. The prompt path (traced on clean `origin/main`)

```
POST /api/chat  (apps/desktop/src/backend/chat-sse-mount.ts)
  → startChatStream(args)                      packages/drive/src/chat-stream.ts
      → orchestrate({ intent, store, spawn, landing, … })   packages/drive/src/orchestrate.ts
          → renderAgentPrompt(store, "session-orchestrator") packages/library/src/store/render-agent.ts
              ⇒ renderResult.agent.prompt   ← the SYSTEM prompt
          → runHeadlessOrchestrator({ systemPrompt, userPrompt: intent, spawn, landing, … })
                                                packages/agent/src/headless-orchestrator.ts
              → query({ prompt: userPrompt, options: { systemPrompt, tools: [], allowedTools, … } })
```

*(Note on the mid-refactor caveat in the task: I read `headless-orchestrator.ts` and `chat-stream.ts`
on a clean checkout at `e007526` == `origin/main`. They are coherent and internally consistent — no
half-applied refactor visible. If a concurrent session lands changes to these files, re-verify §2b/§2c
against the new main; the structural conclusion (system prompt = rendered agent; actuators = MCP tools
only) is unlikely to move, but the exact tool list could.)*

### 2b. What is the SAME — the guidance content

`orchestrate.ts` (lines 166-173) renders the system prompt via `renderAgentPrompt(store,
"session-orchestrator")` — **the exact same function and artifact** that `storytree agents
session-orchestrator` prints, and that the CLAUDE.md generator embeds (ADR-0051, single render
mechanism). Its own docstring is explicit:

> THE LOOP DEFINITION IS THE RENDERED AGENT, NOT A FORK (ADR-0108 decision 2 / ADR-0051): the system
> prompt is assembled by `renderAgentPrompt` from the Library — the SAME prompt the terminal session
> embodies.

So **the guidance prose is byte-identical** to the terminal agent's. In fact the desktop chat receives
*more* of it up front: the terminal Claude Code session gets the **digest** in its CLAUDE.md region
(role/outcome/workflow + a "stands on" manifest, `renderAgentDigest`) and pulls the full text on
demand; the desktop chat gets the **full assembled prompt** (all `context`/`rules`/`antiPatterns`
bodies injected) as its system prompt. The owner's "same guidance" is correct — arguably an
understatement.

### 2c. What is DIFFERENT — and it is not just "Claude Code's system prompt"

Two differences, one minor and one decisive:

**(i) Minor — the harness/system-prompt context (as the owner said).** `runHeadlessOrchestrator` passes
`systemPrompt: args.systemPrompt` as a **string**, which in the Agent SDK **replaces** the default
Claude Code system prompt (the string form is a full override, not the `{ type: 'preset' }` form). So
the desktop chat runs with **only** the rendered agent prompt as its system prompt — no Claude Code
preamble, and **no `CLAUDE.md` project instructions**, no environment/OS/git preamble, no
tool-use-discipline scaffolding. The owner named this. ✔ (with the addition that CLAUDE.md is also
absent, not only the Claude Code preamble).

**(ii) DECISIVE — the chat has no general glue-subagent to delegate to.** This is the part the owner's
model omits, and it is where the bug lives. (To be precise: the orchestrator is *not* meant to Edit/Write
itself — it delegates glue to subagents. The gap is not "missing Edit/Write"; it is "missing the subagent
to delegate to.")

`headless-orchestrator.ts` builds the session with `tools: []` (line 291) plus a fixed set of in-process
MCP tools (lines 265-348). The **complete** actuator surface of the desktop chat is:

| Tool | Kind | What it can do |
|---|---|---|
| `mcp__orientation__*` | read-only | run read-only CLI orientation (tree / library / noticeboard) |
| `mcp__proposal__propose_unit` | declaration | record a proposed unit id (no side effect) |
| `mcp__spawn__spawn_story_author` | write (fenced) | spawn a story-author SDK session; writes fenced to `stories/**` |
| `mcp__spawn__spawn_builder` | build | dispatch a unit id into a `--real` build (see §2d) |
| `mcp__landing__run_gate` | observe | run `pnpm gate`, report pass/fail |
| `mcp__landing__open_landing_pr` | land | commit the working tree, push, open a non-draft PR |

The relevant instruction is workflow step 2 / `orchestrate-route-supplement` step 3: *"supplement the
non-leaf glue … with your **own subagents (the Agent tool)** — yourself only as a last resort."* On the
**terminal**, that "Agent tool" is real: Claude Code exposes a general Task/Agent spawn, so the terminal
orchestrator can hand an arbitrary glue task to a write-scoped worker. On the **desktop chat**, there is
**no general subagent spawn**. The two spawn targets it has are special-purpose: `spawn_story_author`
only writes `stories/**` (it authors the work hierarchy, not `backend-entry.ts`), and `spawn_builder`
only drives a whole-unit `--real` build. Neither can take "add these 3 routes to this file and stop."

So the guidance's preferred path — *delegate the glue to a subagent* — has **no target** on this surface.
That is the gap. (The "Read / Grep / Glob / Edit / Write / `gh`" the "## Tools" section also lists are
likewise absent, but that is not the operative issue: the orchestrator is not supposed to use them
directly anyway — "yourself only as a last resort.")

**Verdict on the owner's assumption:** *Correct on the two things it names; the omission is the tool
surface.*
- ✔ "Same guidance" — correct; identical rendered artifact (the chat actually gets the fuller form).
- ✔ "Without Claude Code's system prompt" — correct (and also without CLAUDE.md).
- ✖ Missing: **the chat has no general glue-subagent** — the runtime equivalent of the terminal's Agent
  tool. Its only spawn targets are `spawn_story_author` (stories only) and `spawn_builder` (whole-unit
  `--real` only). The guidance's small-scope path ("delegate the glue to a subagent") is
  **unimplementable** on this surface, so the agent fell back to the one build actuator it had. That, not
  the missing system prompt, is why it reached for the whole-story build.

### 2d. The `spawn_builder` code path — why "scoped" cannot survive it

The `spawn_builder` tool advertises **two** parameters (`spawn-tool-surface.ts` lines 132-142):
`unitId` **and** `userPrompt` ("The task prompt for the builder session"). A reader — human or model —
would reasonably expect `userPrompt` to scope the work.

It does not. The production dep discards it. `spawn-deps.ts` line 150:

```ts
spawnBuilder: async ({ unitId }, onTrace) => {        // ← userPrompt destructured away, never used
  …
  const dispatched = await spawnBuilderDispatch(unitId, args.build);
```

`spawnBuilderDispatch` → `dispatchAcceptedBuild(unitId, build)` → `build.runner`, which the desktop
sidecar wires as `routedBuildRunner` (`backend-entry.ts` lines 514-525). `routedBuildRunner`
(`build-worker.ts` lines 337-359) classifies **by unit kind**:

```ts
const kind = await deps.classify(unitId);
if (kind === 'story') {
  // story build <id> --real, verdictStore pg, openPr: true   ← whole-story chain + auto-merging PR
  return deps.storyBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', openPr: true, … });
}
// node build <id> --real, verdictStore pg   ← real red→green, parks claude/real/<unit> branch
return deps.nodeBuild(unitId, { real: true, dryRun: false, verdictStore: 'pg', … });
```

And the sidecar's `classify` (`backend-entry.ts` line 515): `story` unit → `'story'`. `desktop-build-mount`
is a story, so → whole-story `--real` + `openPr: true`.

**Consequences that matter for this bug:**
1. **The task prompt is inert.** Whatever the orchestrator writes in `userPrompt` — "just add 3 routes,
   nothing else" — is thrown away. The builder always drives the *whole unit's* registered proof.
2. **The grain is the unit id, and the only knobs are story-vs-node.** There is no "targeted glue edit"
   grain. The narrowest thing `spawn_builder` can do is a single-node `--real` build — still a full
   red→green of a registered contract, not "edit these 3 lines."
3. **A story id auto-opens a merging PR.** For a story, `openPr: true` — clicking/spawning IS the
   approval to land (by design, ADR-0022/0136). So an over-broad routing choice doesn't just over-build;
   it over-*lands*.

So even a perfectly-scoped, perfectly-guided orchestrator, faced with "add 3 routes," has exactly two
buttons: `spawn_story_author` (wrong — that authors `stories/**`, not `backend-entry.ts`) and
`spawn_builder` (which ignores the scope and builds the whole nearest unit). It pressed the only button
that could plausibly touch `backend-entry.ts`. **The routing was over-broad because the tool surface has
no narrow option.**

---

## 3. Gap analysis — it is a tooling gap, not a guidance gap

The task asks me to separate the guidance question from the code-routing question. Having done so, they
do not split evenly: the guidance is already correct, and the whole cause is on the code side.

### 3a. Is it missing or weak guidance? — No.

`orchestrate-route-supplement` already classifies "pure config/wiring with nothing to assert" as glue to
**supplement with subagents, not route to `--real`**, and its Problem section names the exact failure:
*"Treating `node/story build --real` as 'the job' force-fits work that has no isolatable red→green test …
into a proof that can't pin it."* The intent was glue; the correct call — *delegate it to a subagent, do
not `--real` it* — is already written, at the right altitude, in the artifact most on point. The agent
would have followed it **if the surface had a subagent to delegate to.** Rewording the guidance changes
nothing while the tool is absent, and becomes unnecessary once the tool exists. **This is not where the
fix belongs.**

### 3b. Is it a code / tooling gap? — Yes, and this is the whole root cause.

The decisive facts are structural, not textual:

1. **The desktop chat has no general glue-subagent.** The terminal orchestrator delegates glue via the
   general Agent/Task tool; the desktop chat's only spawn targets are `spawn_story_author` (fenced to
   `stories/**`) and `spawn_builder` (whole-unit `--real`). Neither can take an arbitrary scoped glue
   task like "add 3 routes to `backend-entry.ts`." The guidance's delegate-the-glue path has no target.
2. **`spawn_builder` silently drops `userPrompt`** (`spawn-deps.ts:150`), so even scope intent expressed
   by the model is discarded — the builder always drives the whole unit's registered proof.
3. **`routedBuildRunner` classifies by unit *kind* only** (story vs node) and, for a story, forces
   `real:true` + `openPr:true` — coarse grain, automatic land.

Given (1)-(3), the whole-story `--real` was close to *forced*: a glue intent, no subagent to delegate it
to, and one build actuator that ignores scope and auto-lands stories, with a "nearest unit" that was a
story. **The gap is the missing subagent affordance. Close it and the existing guidance binds; leave it
open and no wording change can make the chat perform the minimal edit.**

---

## 4. Proposals — all code; the guidance stays as-is

The guidance is already correct (§3a), so there is **no proposed guidance change** — leaving the
seed-canonical `session-orchestrator` artifact untouched is deliberate, not an omission. The fix is
entirely on the code side.

**C-1 — Give the desktop chat a general glue-subagent (the fix).** Add a write-scoped "glue worker"
spawn to the chat's MCP surface — the runtime equivalent of the terminal's Agent tool — mirroring how
`spawn`/`landing` were added (optional deps, `§7` scale-down, fail-closed). It should:
  - spawn a write-scoped subagent (like `spawn_story_author`, but **fenced to a caller-declared source
    path**, not `stories/**`) that **honors** its `userPrompt` — so the orchestrator can hand it a
    scoped, minimal task ("add these 3 routes to `apps/desktop/electron/backend-entry.ts` and stop");
  - land its result through the `run_gate` + `open_landing_pr` tools the chat already has.

  This is the missing rung the guidance already assumes ("supplement the non-leaf glue with its own
  subagents"). With it, the chat delegates the 3-route edit correctly and never reaches for the
  whole-story build. Because it introduces a new spawn role / write-fence boundary, treat the design as a
  **structural fork → route to `story-author` + reserve an ADR** (per `route-structural-forks-to-story-author`),
  not an owner fork.

**C-2 — Make `spawn_builder` honor or drop `userPrompt` (independent correctness bug).** The tool
advertises a `userPrompt` param that the production dep silently discards (`spawn-deps.ts:150`), so the
builder always drives the whole unit's registered proof regardless of what the model asks. Either:
  - *(preferred, longer)* thread `userPrompt` into the routed build so scope intent isn't a lie — note
    `routedBuildRunner` has no channel for a per-run task prompt today, so this overlaps C-1; **or**
  - *(minimum, cheap)* remove `userPrompt` from the tool schema + description, so the model isn't told it
    can scope a build it cannot. A tool documenting a knob it ignores actively misleads the router.

  Worth doing regardless of C-1 — it is a standalone honesty bug in the tool contract.

### Recommended sequencing

1. **C-2 minimum** — cheap; stop the tool from advertising a phantom scope knob.
2. **C-1** — the structural fix. Route the design to `story-author` + an ADR. Until it lands, the chat's
   only honest option for a scoped glue intent is to **refuse + escalate** (surface it as a scoped edit
   for the human / next session) rather than substitute a whole-unit build — which is a runtime behaviour
   the missing tool forces, not something a guidance edit can cure.

---

## 5. One-line answer to the owner's framing

> *"Same guidance, minus Claude Code's system prompt"* — the first half is exactly right (identical
> rendered artifact, in fuller form), and the second is right too (also minus CLAUDE.md). The one thing
> the framing omits is the **tool surface**: the orchestrator is *meant* to delegate glue to a subagent,
> and on the terminal it does (the Agent tool) — but the **desktop chat has no general glue-subagent**, so
> its only code-change button, `spawn_builder`, ignored the scope and routed the story id into a
> whole-story `--real`. The guidance already says "delegate the glue to a subagent"; it just had no target
> on this surface. **Fix: add the subagent (C-1). Don't touch the guidance.**
