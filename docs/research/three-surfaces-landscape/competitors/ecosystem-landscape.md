# The ecosystem vs the three surfaces

storytree organises a coding-agent's working context into **three distinct surfaces**:

1. **LIBRARY** — a curated, schema-validated knowledge/memory tier (the durable corpus of
   decisions, glossary, guidance an agent reads from and writes to).
2. **STORYTREE** — the codebase itself rendered as an **authored, top-down DAG**
   (story &gt; capability &gt; contract, split by proof mode), where a *story* is an
   independently-deployable bounded context — an "organism" — and a *capability* is an
   "organ" inside it.
3. **NOTICEBOARD** — a dependency-aware task/work tier that serves as the agent's external
   memory for what is in-flight, ready, or blocked.

This document surveys the wider 2025–2026 AI coding-agent ecosystem against those three
surfaces. The short version: there is **real, broad convergence on the individual surfaces**
— nearly every notable player has independently built one or two of them — but **no surveyed
tool unifies all three** into a single model the way storytree does.

> **Sourcing note.** Every factual claim below traces to a primary or near-primary source
> cited inline. This is a fast-moving snapshot; "no one unifies all three" is a point-in-time
> finding about the surveyed sources, not a guarantee no competitor is building the triad.
> Several named players produced no verified evidence in this pass — see [Caveats](#caveats).

---

## Codebase-map / code-graph cohort

This is the **most mature and most widely shared** of the three surfaces. Multiple
independent tools model the codebase as a structured graph or index in order to *focus agent
attention* rather than dump raw files into the context window — the same motivating framing
storytree gives its STORYTREE surface.

- **Aider's repo map** is the pioneering instance (introduced
  [October 2023](https://aider.chat/2023/10/22/repomap.html)). Per Aider's
  [docs](https://aider.chat/docs/repomap.html), the repo map is "a concise map of your whole
  git repository" built "automatically using tree-sitter to extract symbol definitions." It
  is analysed "using a graph ranking algorithm, computed on a graph where each source file is
  a node and edges connect files which have dependencies" (a PageRank-style ranking) to select
  "the most important parts of the codebase which will fit into the active token budget,"
  rather than "sending whole files [which] is a bulky way to send code context, wasting the
  precious context window."

- **CodeGraph** ([github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph))
  persists an AST/symbol code-graph in local SQLite (FTS5), incrementally synced. Its README
  frames the goal explicitly: "CodeGraph gives those agents a pre-indexed knowledge graph —
  symbol relationships, call graphs, and code structure. Agents query the graph instantly
  instead of scanning files." This is a *query-instead-of-scan* posture. (CodeGraph's
  self-reported efficiency figures — roughly cheaper cost, fewer tokens, fewer tool calls —
  are vendor-run benchmarks; see [Caveats](#caveats).)

- **Augment Code** runs a **real-time, per-user codebase index**, updated within seconds of a
  change, used to retrieve relevant context
  ([augmentcode.com](https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable)):
  "we maintain a real-time index of your codebase, for each user."

- **Sourcegraph Cody** implements a code-retrieval/context surface over repositories
  ([sourcegraph.com](https://sourcegraph.com/blog/how-cody-understands-your-codebase)).

> **Important caveat on internals.** It is tempting to draw a sharp line — "Aider/CodeGraph
> are *structural graphs*, Augment/Cody are *just RAG/embeddings*." During verification, two
> such claims were **refuted**: that Augment's index is purely embedding/retrieval rather than
> any graph (refuted 0–3), and that Cody's mechanism is RAG rather than a structured map
> (refuted 1–2). The precise embedding-vs-graph characterisation of Augment and Cody is
> genuinely contested. They are best described as **code-retrieval / codebase-index** systems
> whose exact internals should not be overstated here.

---

## Library / knowledge-memory cohort

The **second major locus of convergence** is the durable knowledge/memory tier — the analogue
of storytree's LIBRARY. Two players productise it most explicitly.

- **Anthropic — Agent Skills** (announced
  [16 October 2025](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills))
  are file-based folders of "instructions, scripts, and resources that agents can discover and
  load dynamically." They use **progressive disclosure**: described as a manual that "starts
  with a table of contents, then specific chapters," skills let the agent "load information
  only as needed" — Level 1 metadata is roughly **30–50 tokens** read first, with the full
  body loaded only when relevant. This is attention-focusing rather than dumping everything.

- **Anthropic — file-based memory tool and structured note-taking.** Anthropic separately
  shipped a **file-based memory tool** (public beta on the Claude Developer Platform) and
  frames "structured note-taking, or agentic memory" as a technique "where the agent regularly
  writes notes persisted to memory outside of the context window," likening it to "Claude Code
  creating a to-do list, or your custom agent maintaining a `NOTES.md` file"
  ([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

- **Letta / MemGPT** implements a structured agent-memory tier
  ([docs.letta.com](https://docs.letta.com)). A **memory block** is a defined object with a
  **label, a description, a value, and a character limit**; blocks are "editable by agents via
  memory tools," can be "attached and detached from agents," and can be "attached to multiple
  agents at once (shared blocks)."

> **Caveat on "schema-validated."** Describing Skills and Letta blocks as "schema-validated"
> is a **mild gloss**. Both *enforce structure/constraints* — required frontmatter for Skills;
> character limits and read-only flags for Letta blocks — rather than running a storytree-style
> zod validation pass at write time. They constrain shape; they do not validate to a schema in
> the strict sense storytree's LIBRARY does.

---

## Noticeboard cohort

The **newest and most concentrated** point of convergence is the dependency-aware task tier —
the analogue of storytree's NOTICEBOARD.

- **Beads** (Steve Yegge) is the canonical, explicit instance
  ([README](https://github.com/steveyegge/beads/blob/main/README.md);
  [introductory post](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)).
  The README describes a "Distributed graph issue tracker for AI agents... Beads provides a
  persistent, structured memory for coding agents. It replaces messy markdown plans with a
  dependency-aware graph, allowing agents to handle long-horizon tasks without losing context."
  It supports dependency tracking and **auto-ready task detection**, with typed graph links
  (`relates_to`, `duplicates`, `supersedes`, `replies_to`). Yegge's post — titled
  "Introducing Beads: A coding agent memory system" — frames the motivating problem bluntly:
  "The problem we all face with coding agents is that they have no memory between sessions,"
  describing a graveyard of decaying markdown plan files replaced by querying `bd ready --json`.

- **Spec-driven development tools** — **GitHub Spec Kit**
  ([released 2 September 2025](https://github.com/github/spec-kit)) and **AWS Kiro**
  ([14 July 2025](https://kiro.dev/)) — are **adjacent but not the same surface**. They
  structure work as specs that decompose into plans and tasks *per feature*. By comparison to
  Beads' standing, cross-session dependency graph, these are best read as **per-feature spec
  artefacts rather than a persistent, standing task DAG** that serves as continuous external
  memory. *(This adjacent-not-equivalent positioning is an analytical inference, not a claim
  made by Spec Kit's or Kiro's own authors — they produced no verified mapping onto a
  noticeboard model in this pass; see [Caveats](#caveats).)*

---

## Master scorecard

A surface is marked present (●) only where a primary source supports it; adjacent/partial fits
are marked (◐); absent or unverified surfaces are blank.

| Tool | Library | Code-graph | Noticeboard | Notes |
| --- | :---: | :---: | :---: | --- |
| **Aider** (repo map) | | ● | | tree-sitter symbols + dependency-graph PageRank ranking to a token budget |
| **CodeGraph** | | ● | | persisted SQLite/FTS5 AST + symbol/call graph; "query instead of scan" |
| **Augment Code** | | ● | | real-time per-user codebase index; exact internals contested |
| **Sourcegraph Cody** | | ● | | code-retrieval/context surface; RAG-vs-graph characterisation contested |
| **Anthropic** (Skills + memory tool) | ● | | | progressive disclosure (~30–50-token metadata first); file-based memory + structured note-taking |
| **Letta / MemGPT** | ● | | | structured memory blocks (label/description/value/limit), attachable + shareable |
| **Beads** | | | ● | dependency-aware graph issue tracker as persistent agent memory; auto-ready detection |
| **GitHub Spec Kit** | | | ◐ | spec → plan → tasks, **per feature** (adjacent; inference) |
| **AWS Kiro** | | | ◐ | spec-driven decomposition, **per feature** (adjacent; inference) |
| **storytree** | ● | ● | ● | the unified triad: LIBRARY + authored codebase-DAG + NOTICEBOARD |

---

## Key finding

**No surveyed tool implements more than one of the three surfaces.** The code-map cohort
(Aider, Augment, Cody, CodeGraph) implements only the codebase-map axis — Cody explicitly
treats wikis, docs, and engineering tickets as *future* sources, and CodeGraph's roadmap stays
on the code-graph axis. The library cohort (Anthropic Skills/memory, Letta) implements only
the library/memory axis — Letta's surveyed docs contain no codebase map and no dependency-aware
task tier distinct from memory blocks. Beads implements only the noticeboard axis. The field is
converging on the **individual surfaces** but not on the **unified triad**, which makes
storytree's three-surface model genuinely distinctive among the surveyed sources.

A second, subtler distinction concerns **altitude**. The code-map cohort sits at **symbol
altitude**: its graphs are a *bottom-up mirror of the code as written* — files, symbols, call
edges, ASTs extracted mechanically from source. storytree's STORYTREE surface sits at
**architecture altitude**: it is a *top-down, authored statement of intent* — a story is an
independently-deployable bounded context (an "organism" / microservice) and a capability is an
"organ" within it. One is generated upward from the code; the other is authored downward from
the design. They are complementary rather than competing, and storytree's surface is not
reproducible by indexing source alone.

A common thread runs under all three surfaces: the shared motivation is identical to
storytree's — replace raw context dumping and flat prose with a **structured, queryable,
attention-focused external surface**, because the finite context window and the lack of
cross-session memory are the binding constraints. Aider avoids "wasting the precious context
window"; Anthropic persists memory "outside of the context window"; CodeGraph has agents "query
the graph instantly instead of scanning files"; Beads cures inter-session amnesia by replacing
"messy markdown plans." The same constraint and the same response recur across all three
cohorts' primary sources — which is what makes the convergence real even though the
implementations target different axes.

---

## Caveats

- **Coverage gaps — absence of evidence, not evidence of absence.** This survey's
  confirmed-claim corpus is concentrated on Aider, CodeGraph, Augment, Cody, Anthropic, Letta,
  and Beads. Several players named in the underlying research question produced **no surviving
  verified claims** in this pass and are therefore *not* placed on the scorecard: **Cursor,
  Cline/Roo, Devin/Cognition, Factory, OpenHands/Devon, Windsurf, and GraphRAG /
  knowledge-graph-for-agents** work, among others. Their absence reflects a lack of verified
  evidence here, not a finding that they lack these surfaces. Any of them could plausibly
  implement a codebase-map index or a task tier that simply went unverified.

- **The Spec Kit / Kiro positioning is an inference.** Their classification as adjacent
  *per-feature* spec tools rather than standing task DAGs is the surveyor's analytical mapping,
  not a claim those tools' authors make about themselves.

- **Contested internals.** As noted above, the embedding-vs-graph characterisation of Augment
  and Cody is contested (two refuted claims). Do not read the code-graph cohort as a uniform
  family of structural graphs.

- **"Schema-validated" is a mild gloss** for Anthropic Skills and Letta blocks — they enforce
  structure and constraints, not a strict schema-validation pass.

- **Source quality.** Several confirmed claims rest on **vendor engineering blogs** (Augment,
  Sourcegraph, CodeGraph, Anthropic) and **self-reported benchmarks** (CodeGraph's efficiency
  figures are vendor-run medians on a small number of runs, directionally indicative rather
  than independently reproduced). These are primary sources but partly marketing-adjacent, and
  should be read with that in mind.

- **Time-sensitivity.** This is a 2025–2026 snapshot of a fast-moving field. Cody's "future"
  library/ticket sources and any hosted CodeGraph platform may have shipped since; the "no one
  unifies all three" conclusion is point-in-time, about the surveyed sources only.

---

### Sources

- Aider repo map — [introduction (Oct 2023)](https://aider.chat/2023/10/22/repomap.html) ·
  [docs](https://aider.chat/docs/repomap.html)
- CodeGraph — [github.com/colbymchenry/codegraph](https://github.com/colbymchenry/codegraph)
- Augment Code — [real-time index blog](https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable)
- Sourcegraph Cody — [how Cody understands your codebase](https://sourcegraph.com/blog/how-cody-understands-your-codebase)
- Anthropic — [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) ·
  [effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
- Letta / MemGPT — [docs.letta.com](https://docs.letta.com)
- Beads — [README](https://github.com/steveyegge/beads/blob/main/README.md) ·
  [introductory post](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)
- GitHub Spec Kit — [github.com/github/spec-kit](https://github.com/github/spec-kit)
- AWS Kiro — [kiro.dev](https://kiro.dev/)
