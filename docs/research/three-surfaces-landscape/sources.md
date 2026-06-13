# Source bibliography — the storytree landscape research

These are the cited sources behind storytree's landscape research: an investigation into
whether the wider AI-coding-agent ecosystem (2025–2026) is independently converging on the
same architectural ideas storytree is built around. They were gathered via three
adversarially-verified deep-research passes run on **2026-06-08** (a fan-out search →
fetch → cross-checked-verification → synthesis harness; each claim was voted on by
independent verifiers, and refuted claims are recorded as such).

**storytree's "three surfaces" model** (the lens these passes test the field against) is:

1. **LIBRARY** — a curated, schema-validated knowledge tier.
2. **STORYTREE** — the codebase as an *authored, top-down DAG*: **story > capability >
   contract**, split by proof mode, where a **story** is an independently-deployable
   bounded context (an "organism") and a **capability** is an "organ" inside it.
3. **NOTICEBOARD** — a dependency-aware task/work tier used as agent *external memory*.

**On quality ratings.** Each entry carries the rating assigned in the underlying research
JSON: `primary` (project READMEs/docs, official vendor blogs, the author's own writing,
arXiv submissions), `secondary` (independent journalism/analysis), `blog` (practitioner
posts), `forum` (HN/Cursor forum threads), or `unreliable` (flagged low-confidence by the
verifiers — cited for completeness, not relied upon).

**Honesty caveats carried from the research.** This is a fast-moving Jan–Jun 2026 snapshot
and several projects evolved *during* the research window (e.g. Beads' storage moved from
git-JSONL to Dolt SQL; Gas Town extended into "Gas City"). Some bridges from a tool's
features to storytree's surface names are the **verifiers' analytical mapping, not claims
the authors make** — most importantly, "Beads = a noticeboard" and "Huntley's standard
library of prompts = a library tier" are interpretive framings. Two characterizations were
**refuted** by the verifiers and two arXiv datings were killed; these are flagged inline
below and listed in the closing "Refuted / contested" section. Where a pass had **coverage
gaps** (tools named but not verified), that is noted too — absence of a confirmed claim is
not evidence of absence.

---

## Gas Town / Beads (Steve Yegge)

| Source | Supports | Quality |
| --- | --- | --- |
| [github.com/steveyegge/gastown](https://github.com/steveyegge/gastown) | Gas Town's own README: Go-based multi-agent orchestrator (Town > Rigs > Polecats > Mayor), persistent git-backed work tracking, Convoys/Seance — the noticeboard analog; no knowledge-library or code-graph surface. | primary |
| [github.com/steveyegge/beads](https://github.com/steveyegge/beads) | Beads README: dependency-aware graph issue tracker as persistent structured memory for agents; `bd ready` auto-computes unblocked work — the canonical noticeboard instance. | primary |
| [github.com/steveyegge/beads — README.md](https://github.com/steveyegge/beads/blob/main/README.md) | Same project, README permalink cited in the ecosystem pass ("powered by Dolt… replaces messy markdown plans with a dependency-aware graph"; link types relates_to/duplicates/supersedes/replies_to). | primary |
| [steve-yegge.medium.com — Introducing Beads: A coding agent memory system](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a) | Yegge's own framing of the cross-session amnesia problem (~10-min memoryless sessions; ~600 "100% useless" markdown plans) that Beads replaces. | primary |
| [steve-yegge.medium.com — The Future of Coding Agents](https://steve-yegge.medium.com/the-future-of-coding-agents-e9451a84207c) | Orchestrator-level vision; term-by-term search confirmed *no* dedicated knowledge library or code-graph surface. | primary |
| [steve-yegge.medium.com — Welcome to Gas Town](https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04) | Launch article (Jan 2026); Convoys as "ticketing/work-order system… basically features." | primary |
| [steve-yegge.medium.com — Welcome to Gas City](https://steve-yegge.medium.com/welcome-to-gas-city-57f564bb3607) | The MEOW stack (Beads > Epics > Molecules > … > Wisps) making Work a first-class primitive — "a versioned knowledge graph of all your issues and tasks." | primary |
| [softwareengineeringdaily.com — Gas Town, Beads and the rise of agentic development with Steve Yegge](https://softwareengineeringdaily.com/2026/02/12/gas-town-beads-and-the-rise-of-agentic-development-with-steve-yegge/) | Independent interview corroborating the Gas Town/Beads architecture. | secondary |
| [cloudnativenow.com — Gas Town: What "Kubernetes for AI coding agents" actually looks like](https://cloudnativenow.com/features/gas-town-what-kubernetes-for-ai-coding-agents-actually-looks-like/) | Independent analysis of the orchestration model. | secondary |
| [thenewstack.io — Steve Yegge's AI agent orchestration project Gas Town comes to the cloud](https://thenewstack.io/steve-yegges-ai-agent-orchestration-project-gas-town-comes-to-the-cloud-and-brings-the-wasteland-with-it/) | Cloud/Gas City coverage. **Flagged `unreliable` by the verifiers; yielded no confirmed claims — cited for completeness only.** | unreliable |
| [agentpatterns.ai — Beads task-graph agent memory](https://agentpatterns.ai/agent-design/beads-task-graph-agent-memory/) | Practitioner write-up of the Beads task-graph-as-memory pattern. | blog |
| [paddo.dev — From Beads to Tasks](https://paddo.dev/blog/from-beads-to-tasks/) | Practitioner commentary on the noticeboard/task tier. | blog |

---

## loom (Geoffrey Huntley)

| Source | Supports | Quality |
| --- | --- | --- |
| [github.com/ghuntley/loom](https://github.com/ghuntley/loom) | loom's README: a Rust AI coding agent (REPL) on three *principles* (modularity/extensibility/reliability); key components are infra subsystems (state machine, tool registry, LLM proxy, Weaver/K8s), not attention surfaces. | primary |
| [github.com/ghuntley/loom — specs/README.md](https://github.com/ghuntley/loom/blob/trunk/specs/README.md) | The spec index: knowledge-retrieval is FTS5 search over conversation threads + Google CSE web search; code surface is plain Git/VCS tooling — no zod-validated library, no code-graph/DAG, no task board. | primary |
| [github.com/ghuntley/loom — AGENTS.md](https://github.com/ghuntley/loom/blob/trunk/AGENTS.md) | loom's agent-facing operating doc, used in the context-engineering / convergence angle. | primary |
| [ghuntley.com — Six-month recap](https://ghuntley.com/six-month-recap/) | Huntley's "standard library of prompts" practice (a tactical habit, **not** an architected knowledge tier — the verifiers' mapping to storytree's library is hedged/weak), spec-driven `/specs` workflow, headless agents cloning Tailscale/Nomad/Infisical. | primary |

> **Coverage caveat (ecosystem pass):** loom produced *no surviving confirmed claims* in
> the second pass — it is plausibly an additional noticeboard/library instance that went
> unverified there. The findings above come from the dedicated gastown/loom pass.

---

## Code-map / code-graph tools (the STORYTREE-surface analog)

| Source | Supports | Quality |
| --- | --- | --- |
| [aider.chat — Building a better repository map with tree sitter (2023-10-22)](https://aider.chat/2023/10/22/repomap.html) | Aider's repo map: tree-sitter symbol extraction; the earliest "give the agent a map, don't dump whole files" framing. | primary |
| [aider.chat — Repository map docs](https://aider.chat/docs/repomap.html) | Codebase modeled as a dependency graph (files = nodes), PageRank-ranked to fit the most-relevant parts into a token budget — the strongest code-map convergence. | primary |
| [github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph) | CodeGraph: a persisted SQLite AST/symbol/call graph (FTS5, incrementally synced) explicitly framed as a pre-built map agents query instead of grep/Read; self-reported ~16% cheaper / 47% fewer tokens / 58% fewer tool calls (vendor benchmark — directionally indicative only). | primary |
| [augmentcode.com — A real-time index for your codebase](https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable) | Augment's per-user, seconds-fresh codebase index for context retrieval. **Note: the claim that it is purely embedding-based (not a graph) was refuted 0-3 — don't overstate the mechanism.** | primary |
| [sourcegraph.com — How Cody understands your codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase) | Cody's code-retrieval surface; explicitly treats wikis/docs/tickets as *future* sources (i.e. code-map only today). **The "Cody = RAG not a graph" characterization was contested 1-2.** | primary |
| [rywalker.com — Code intelligence tools (research)](https://rywalker.com/research/code-intelligence-tools) | Comparative survey of code-intelligence/code-graph tooling. | blog |
| [developersdigest.tech — Codebase knowledge graphs for AI coding agents](https://www.developersdigest.tech/blog/codebase-knowledge-graphs-ai-coding-agents) | Practitioner overview of the codebase-knowledge-graph pattern. | blog |

---

## Library / memory tools (the LIBRARY-surface analog)

| Source | Supports | Quality |
| --- | --- | --- |
| [anthropic.com — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Agent Skills: file-based folders of instructions/scripts/resources, dynamically discovered via progressive disclosure (metadata first, full SKILL.md only when relevant) — the productized library/skills surface. | primary |
| [anthropic.com — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | "Structured note-taking / agentic memory" (notes persisted outside the context window) + the file-based memory tool (public beta); names "context engineering" as a discipline. | primary |
| [docs.letta.com](https://docs.letta.com) | Letta/MemGPT: schema-structured memory blocks (label/description/value/limit), agent-self-editable, attachable/detachable, shareable across agents. Docs contain *no* code-map and no separate task tier (its "tasks" is a memory block). | primary |
| [letta.com — Agent memory](https://www.letta.com/blog/agent-memory) | Letta's own articulation of structured agent memory. | primary |
| [letta.com — Context repositories](https://www.letta.com/blog/context-repositories) | Letta's "context repository" framing — a library-tier idea. | primary |
| [mem0.ai — State of AI agent memory 2026](https://mem0.ai/blog/state-of-ai-agent-memory-2026) | Landscape survey of the agent-memory subfield. | blog |
| [neo4j.com — Context graph: AI agent memory](https://neo4j.com/blog/agentic-ai/context-graph-ai-agent-memory/) | Knowledge-graph-as-agent-memory angle. | blog |
| [atlan.com — Best AI agent memory frameworks 2026](https://atlan.com/know/best-ai-agent-memory-frameworks-2026/) | Comparative roundup of memory frameworks. | blog |

---

## Noticeboard / task-DAG (the NOTICEBOARD-surface analog)

> The canonical noticeboard instance is **Beads** — its primary sources are listed under
> *Gas Town / Beads* above. The sources below are the additional noticeboard-angle
> material from the ecosystem pass.

| Source | Supports | Quality |
| --- | --- | --- |
| [github.github.com/spec-kit](https://github.github.com/spec-kit/) | GitHub Spec Kit's hosted docs — spec-driven workflow that hard-links generated tasks (a task-tier candidate). | primary |
| [paddo.dev — Gas Town: two kinds of multi-agent](https://paddo.dev/blog/gastown-two-kinds-of-multi-agent/) | Frames Gas Town as relying on "external persistence and Git-based coordination rather than knowledge libraries or semantic maps" — supports the *negative* finding that only the noticeboard surface is present. | blog |
| [news.ycombinator.com — item 47936461](https://news.ycombinator.com/item?id=47936461) | HN discussion used in the knowledge-library / code-graph angle. | forum |

---

## Anthropic primary posts (context engineering, agents, MCP, hooks, skills)

| Source | Supports | Quality |
| --- | --- | --- |
| [anthropic.com — Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | Dates "context engineering" as a named mainstream discipline (post dated 2025-09-29 in the timing pass); also a library-surface source (listed above). | primary |
| [anthropic.com — Building effective agents](https://www.anthropic.com/research/building-effective-agents) | The "own the loop / reduce abstraction, frameworks add overhead" guidance — anchors the own-the-loop convergence (Simon Willison's summary dates it 2024-12-19). | primary |
| [anthropic.com — Code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) | The CLI/code-execution-over-MCP swing (dated 2025-11-04 in the timing pass). | primary |
| [anthropic.com — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Agent Skills launch (2025-10-16) — the `.md`+frontmatter progressive-disclosure library format. | primary |
| [platform.claude.com — Claude Code release notes](https://platform.claude.com/docs/en/release-notes/claude-code) | Primary changelog used to date Claude Code hooks (PreToolUse/PostToolUse). | primary |
| [github.com/anthropics/claude-code — releases](https://github.com/anthropics/claude-code/releases) | Release tags corroborating the hooks feature timeline (≈ v1.0.38). | primary |
| [simonwillison.net — Building effective agents (2024-12-20)](https://simonwillison.net/2024/Dec/20/building-effective-agents/) | Independent datestamp pinning Anthropic's "Building effective agents" to Dec 2024. | secondary |
| [simonwillison.net — Code execution with MCP (2025-11-04)](https://simonwillison.net/2025/Nov/4/code-execution-with-mcp/) | Independent datestamp for the code-execution-with-MCP post. | blog |
| [ghuntley.com — Allocations](https://ghuntley.com/allocations/) | Huntley on the "too many MCP servers" / CLI-over-MCP discourse. | blog |

---

## Spec-driven development tooling

| Source | Supports | Quality |
| --- | --- | --- |
| [github.com/github/spec-kit](https://github.com/github/spec-kit) | GitHub Spec Kit repo — four-phase spec-driven workflow (the spec-vs-story-driven comparison). | primary |
| [github.blog — Spec-driven development with AI: get started with a new open-source toolkit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) | GitHub's own Spec Kit announcement (open-sourced ≈ 2025-09-02). | primary |
| [kiro.dev](https://kiro.dev/) | AWS Kiro product site — spec-driven AI IDE. | primary |
| [kiro.dev — Introducing Kiro](https://kiro.dev/blog/introducing-kiro/) | Kiro launch post (introduced ≈ 2025-07-14); spec model hard-links generated tasks to specs. | primary |
| [cline.bot](https://cline.bot/) | Cline — spec-driven workflow angle. | primary |
| [visualstudiomagazine.com — GitHub open-sources kit for spec-driven AI development (2025-09-03)](https://visualstudiomagazine.com/articles/2025/09/03/github-open-sources-kit-for-spec-driven-ai-development.aspx) | Independent datestamp for Spec Kit's open-sourcing. | secondary |
| [siliconangle.com — AWS launches Kiro spec-coding developer environment (2025-07-14)](https://siliconangle.com/2025/07/14/aws-launches-kiro-spec-coding-developer-environment-integrated-ai-agents/) | Independent datestamp for Kiro's launch. | secondary |
| [marktechpost.com — 9 best AI tools for spec-driven development in 2026](https://www.marktechpost.com/2026/05/08/9-best-ai-tools-for-spec-driven-development-in-2026-kiro-bmad-gsd-and-more-compare/) | Comparative roundup of spec-driven tools (Kiro/BMAD/GSD …). | secondary |
| [martinfowler.com — Exploring Gen AI: SDD (3 tools)](https://martinfowler.com/articles/exploring-gen-ai/sdd-3-tools.html) | Practitioner comparison of spec-driven-development tools. | blog |
| [medium.com — AWS Kiro vs GitHub Spec Kit: the honest comparison](https://medium.com/system-design-mastery-series/aws-kiro-vs-github-spec-kit-the-honest-comparison-every-developer-needs-right-now-8284412d7668) | Spec Kit vs Kiro comparison. | blog |
| [itrevolution.com — The three developer loops: a new framework for AI-assisted coding](https://itrevolution.com/articles/the-three-developer-loops-a-new-framework-for-ai-assisted-coding/) | A "three loops" framing — the nearest *multi-surface* framing found, used in the convergence angle. | secondary |

---

## Convergence / dating (the Ralph loop, momentum, TDD-guard, multi-persona)

| Source | Supports | Quality |
| --- | --- | --- |
| [ghuntley.com — Ralph](https://ghuntley.com/ralph/) | Huntley's canonical "Ralph Wiggum" agentic-loop post (≈ 2025-07-14) — the iterative-loop convergence anchor. | primary |
| [ghuntley.com — The Loop](https://ghuntley.com/loop/) | Huntley on the agentic loop (gastown/loom pass). | primary |
| [humanlayer.dev — A brief history of Ralph](https://www.humanlayer.dev/blog/brief-history-of-ralph) | Timeline of the Ralph technique's spread. | secondary |
| [theregister.com — Ralph Wiggum / Claude loops (2026-01-27)](https://www.theregister.com/2026/01/27/ralph_wiggum_claude_loops/) | Mainstream coverage marking Ralph's virality moment. | secondary |
| [arxiv.org/abs/2310.00297](https://arxiv.org/abs/2310.00297) | "Understanding In-Context Learning…" — the candidate academic analog to "behavioral momentum." **Caveat: the "token co-occurrence reinforcement = momentum" reading was refuted 1-2; the paper is not a clean match for the practitioner's notion.** | primary |
| [arxiv.org/html/2410.21819v2](https://arxiv.org/html/2410.21819v2) | LLM-judge self-preference-bias paper. **Caveat: the claimed Oct-2024 dating was refuted 0-3 — treat the date as unverified.** | primary |
| [github.com/nizos/tdd-guard](https://github.com/nizos/tdd-guard) | tdd-guard: externally blocks implementation before a failing test — harness-enforced red-green (the anti-reward-hacking convergence; ≈ 2025-07-07, confirmed 2-1). | primary |
| [news.ycombinator.com — item 45425904](https://news.ycombinator.com/item?id=45425904) | HN thread on harness-enforced TDD / LLM-can't-grade-itself discourse. | forum |
| [forum.cursor.com — How Cursor rules work (v0.45)](https://forum.cursor.com/t/i-saw-the-version-0-45-how-cursor-rules-work/44755) | Dating Cursor project rules (the file-per-topic guidance-tier precursor). | forum |
| [arxiv.org/html/2511.12884v1](https://arxiv.org/html/2511.12884v1) | Paper used in the multi-persona / blind-agent-doc-testing angle. | primary |
| [github.com/Saik0s/agent-loop](https://github.com/Saik0s/agent-loop) | A multi-persona / agent-loop implementation. **Flagged `unreliable` by the verifiers — cited for completeness only.** | unreliable |

---

## Refuted / contested claims (carried for honesty)

These were tested and **did not survive** verification, or remain contested. They are
listed so the bibliography does not silently imply more than the evidence supports:

- **Augment is purely embedding/retrieval (not a graph)** — refuted **0-3**
  (source: the Augment real-time-index blog). Don't characterize Augment's index as
  embedding-only.
- **Cody's mechanism is RAG rather than a structured graph** — contested **1-2**
  (source: the Sourcegraph/Cody blog). The embedding-vs-graph characterization of Cody is
  genuinely unsettled.
- **arXiv 2310.00297 introduces "token co-occurrence reinforcement" as the formal analog
  of "momentum"** — refuted **1-2** (source: arXiv 2310.00297).
- **The LLM-judge self-preference paper is arXiv 2410.21819, dated Oct 2024** — refuted
  **0-3** (source: arXiv 2410.21819v2). The dating is unverified.

**Open coverage gaps (not evidence of absence):** Cursor, Cline/Roo, Windsurf,
Devin/Cognition, Factory, OpenHands/Devon, GraphRAG, and broader knowledge-graph-for-agents
work were named in the research questions but produced no confirmed claims this round.
loom's deeper specs reportedly hint at an OracleTool / server-side knowledge-base component
that was not verified. And the central finding — that **no surveyed tool unifies all three
surfaces** the way storytree's library + codebase-DAG + noticeboard model does — is a
point-in-time observation about the sources above, not a guarantee no competitor is
building the triad.
