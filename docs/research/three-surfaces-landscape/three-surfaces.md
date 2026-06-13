# Three surfaces: giving coding agents a map

## The problem

The binding constraint on an AI coding agent is not raw intelligence. It is the
**context window plus the lack of cross-session memory**. An agent works inside a finite
attention budget, and when the session ends it forgets everything. The field has been blunt
about this. Anthropic frames *context engineering* as the discipline of "curating what enters
the model's limited attention"
([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
Steve Yegge's Beads exists because "the problem we all face with coding agents is that they
have no memory between sessions — sessions that only last about ten minutes"
([introducing Beads](https://steve-yegge.medium.com/introducing-beads-a-coding-agent-memory-system-637d7d92514a)).

The intuitive response is to give the agent **more**: a bigger context window, more
retrieval, the whole repository pasted in. That instinct is wrong, and the most thoughtful
practitioners have said so. Aider's repo map was built precisely because "sending whole files
is a bulky way to send code context, wasting the precious context window"
([Aider repo map docs](https://aider.chat/docs/repomap.html)). CodeGraph exists so that
"agents query the graph instantly instead of scanning files"
([CodeGraph](https://github.com/colbymchenry/codegraph)). Anthropic's own advice during the
2025 context-engineering wave was to *reduce* abstraction and curate, not to dump more
([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).

The better move is to **manage attention rather than expand it** — to give the agent a *map*,
not a dump. A map is a structured, addressable surface the agent reads from on demand and
writes back to, so that state lives outside the prompt and survives the session. This is the
premise the whole field arrived at, independently, across the second half of 2025.

## The three surfaces

The storytree project organizes an agent's working state into **three distinct surfaces** —
three walls the agent reads instead of being force-fed:

1. **LIBRARY — the knowledge surface.** A curated, schema-validated knowledge/memory tier: the
   durable corpus of decisions, glossary, and guidance an agent reads from and writes to. It is
   the long-term memory that is *validated at write time* rather than accreted as loose prose.

2. **STORYTREE — the codebase surface.** The codebase itself rendered as an **authored,
   top-down DAG** — `story > capability > contract`, split by proof mode. A *story* is an
   independently-deployable bounded context, an "organism" (think microservice); a *capability*
   is an "organ" inside it; a *contract* is the proof-carrying unit at the leaves. Crucially,
   this map is authored as intent, and the code is held to satisfy it.

3. **NOTICEBOARD — the work surface.** A dependency-aware task/work tier that serves as the
   agent's external memory for what is in-flight, ready, or blocked. It answers "what should I
   pick up next, and what is it waiting on?" without re-deriving the plan from scratch each
   session.

Each surface targets the same constraint from a different angle: the library holds *what is
known*, the storytree holds *what the system is*, the noticeboard holds *what is being done*.
Together they let an agent orient — read the relevant slice of each wall — instead of carrying
the whole world in its head.

## The field is converging — on the pieces

The strongest validation of this model is that the field has been building these exact surfaces,
piece by piece, without coordinating. Convergent evolution is a useful signal: when independent
teams keep arriving at the same primitives, the primitives are probably correct.

**The noticeboard has clearly landed.** Beads is the canonical instance — a "dependency-aware
graph" issue tracker that gives agents "persistent, structured memory," with dependency
tracking and auto-ready task detection ([Beads README](https://github.com/steveyegge/beads/blob/main/README.md)).
Steve Yegge's [Gas Town](https://github.com/steveyegge/gastown) builds on Beads, bundling work
into **Convoys** atop a "MEOW stack" that "places Work front and center, as the first-class
system primitive... creating a versioned knowledge graph of all your issues and tasks"
([Welcome to Gas City](https://steve-yegge.medium.com/welcome-to-gas-city-57f564bb3607)). This
is a direct, deliberate analog of a dependency-aware work tier.

**The code-map has clearly landed.** This is the most mature and most widely shared surface.
[Aider's repo map](https://aider.chat/2023/10/22/repomap.html) (October 2023) pioneered it,
using tree-sitter to extract symbol definitions and a PageRank-style ranking over the file
dependency graph to fit "the most important parts of the codebase" into the token budget
([docs](https://aider.chat/docs/repomap.html)). [CodeGraph](https://github.com/colbymchenry/codegraph)
persists an AST/symbol/call graph in SQLite so agents "query the graph instantly instead of
scanning files." [Augment Code](https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable)
runs a real-time per-user codebase index, and [Sourcegraph Cody](https://sourcegraph.com/blog/how-cody-understands-your-codebase)
offers a code-retrieval surface over repositories.

**The library has clearly landed.** Anthropic's [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
(16 October 2025) are file-based folders of instructions and resources loaded via *progressive
disclosure* — roughly 30–50 tokens of metadata read first, full body only when relevant —
alongside a file-based memory tool and structured note-taking
([effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
[Letta / MemGPT](https://docs.letta.com) implements a structured agent-memory tier of *memory
blocks*, each a defined object with a label, description, value, and character limit, editable
and shareable across agents.

The dates tell the convergence story plainly. Within a roughly five-month window in H2 2025 —
[Kiro](https://kiro.dev/blog/introducing-kiro/) and [Ralph](https://ghuntley.com/ralph/) in
July, [Spec Kit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/)
and the [context-engineering post](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
in September, [Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)
in October — multiple independent teams pulled state *out* of the raw prompt and into
structured, addressable surfaces. The three surfaces are not an idiosyncratic invention; they
are where the field went.

## Two things that are still distinctive

Against that backdrop, two observations stand out from the surveyed sources.

**First: nobody surveyed unifies all three.** Each cohort builds one axis and stops. The
code-map cohort (Aider, CodeGraph, Augment, Cody) implements only the codebase map — Cody
treats wikis, docs, and tickets as *future* sources. The library cohort (Anthropic Skills and
memory, Letta) implements only the knowledge/memory axis, with no codebase map and no
dependency-aware task tier. Beads implements only the noticeboard. Even Gas Town, the most
ambitious orchestration system here, converges strongly on the noticeboard and on *neither* of
the other two — term-by-term searches of its primary sources found no library, knowledge base,
code graph, or code map. Geoffrey Huntley's [loom](https://github.com/ghuntley/loom) has the
raw *components* — VCS tooling, an FTS5 thread search, a docs publisher — but none is presented
as an integrated, agent-facing attention surface, and it has no dependency-aware task tier at
all. The unified triad, as a single model, was not found in this survey.

| Tool | Library | Code-map | Noticeboard |
| --- | :---: | :---: | :---: |
| [Aider](https://aider.chat/docs/repomap.html) (repo map) | | ● | |
| [CodeGraph](https://github.com/colbymchenry/codegraph) | | ● | |
| [Augment Code](https://www.augmentcode.com/blog/a-real-time-index-for-your-codebase-secure-personal-scalable) | | ● | |
| [Sourcegraph Cody](https://sourcegraph.com/blog/how-cody-understands-your-codebase) | | ● | |
| [Anthropic Skills + memory](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | ● | | |
| [Letta / MemGPT](https://docs.letta.com) | ● | | |
| [Beads](https://github.com/steveyegge/beads/blob/main/README.md) | | | ● |
| [Gas Town](https://github.com/steveyegge/gastown) | | | ● |
| [loom](https://github.com/ghuntley/loom) | ◐ | ◐ | |
| **storytree** | ● | ● | ● |

*● = a primary source supports a direct analog; ◐ = a weak, partial, or unintegrated parallel.*

**Second: the code-map everyone built sits at a different altitude.** The code-map cohort
operates at **symbol altitude**. Its graphs are a *bottom-up mirror of the code as written* —
files, symbols, call edges, ASTs extracted mechanically from source by tree-sitter and ranking
algorithms ([Aider docs](https://aider.chat/docs/repomap.html);
[CodeGraph](https://github.com/colbymchenry/codegraph)). The map reflects the code; if the code
changes, the map re-mirrors it.

storytree's STORYTREE surface sits at **architecture altitude**. It is authored *top-down as
intent*: a two-tier statement of design where a story is an independently-deployable bounded
context (an "organism" / microservice) and a capability is an "organ" within it, with the code
required to *satisfy* the map rather than the map mirroring the code. One is generated upward
from source; the other is authored downward from design. They are complementary, not competing —
but the architecture-altitude map is not reproducible by indexing source alone.

The spec-driven tools — [GitHub Spec Kit](https://github.com/github/spec-kit) and
[AWS Kiro](https://kiro.dev/) — are the closest neighbors here: they *do* author intent
top-down. But they flatten that intent into **per-feature** spec → plan → task checklists,
artifacts scoped to one unit of work rather than a standing, cross-session architectural DAG. A
two-tier architectural map that outlives any single task — organism and organ, persisting as the
system's shape — appears to be open ground among the surveyed sources.

## Honest caveats

The brand here is honesty, so the limits of these claims matter as much as the claims.

- **Point-in-time snapshot.** All sources date from roughly 2023 through June 2026, and the
  fast-moving ones move fast. Beads' storage evolved from git-backed JSONL toward a SQL backend;
  Gas Town extended into a "Gas City" form; loom is on an actively developed trunk; Cody's
  "future" doc/ticket sources may have shipped. "No one unifies all three" is a finding *about
  the surveyed sources at this date*, not a guarantee about the field.
- **The mappings are analytical.** Casting Beads as a noticeboard, Skills as a library, or
  Aider's repo map as a code-map is *this assessment's framing*. None of these projects describes
  itself in storytree's "three surfaces" language; the surface labels are interpretation, not the
  authors' own claims.
- **Coverage gaps — absence of evidence is not evidence of absence.** Several named players
  (Cursor, Cline/Roo, Devin/Cognition, Factory, OpenHands, Windsurf, GraphRAG work) produced no
  verified claims in this pass and are deliberately left off the scorecard. Any could implement
  one of these surfaces unobserved here.
- **Contested internals and soft glosses.** The embedding-vs-graph characterization of Augment
  and Cody is genuinely contested (claims were refuted during verification), so the code-map
  cohort should not be read as a uniform family of structural graphs. "Schema-validated" is a
  mild gloss for Skills and Letta blocks, which enforce structure and constraints rather than a
  strict write-time validation pass. Several claims rest on vendor engineering blogs and
  self-reported benchmarks.
- **"Distinctive" means "not found here," not "proven novel."** Where this essay calls the
  unification or the architecture altitude distinctive, that is a statement about what this
  survey did and did not surface — not a proof of first-ever invention.

## Why it matters — and the open question

If the three surfaces are correct — and the field's convergent evolution is good evidence that
the individual primitives are — then the interesting question is what, exactly, the contribution
is. There are two honest readings, and they should be stated plainly rather than resolved by
assertion:

- **The optimistic reading:** the contribution is real and twofold — the *unification* of all
  three surfaces into one coherent model, and the *altitude* of the code-map (architecture, not
  symbols; intent the code must satisfy, not a mirror of code as written). On this reading,
  storytree occupies ground the survey did not find anyone else holding.

- **The skeptical reading:** the contribution is mostly *naming*. Task trackers, docs/memory
  tiers, and VCS-backed code views already exist in unintegrated form; perhaps storytree simply
  labels and arranges primitives that Beads, Skills, and Aider already shipped, and the
  "unification" is a presentation choice rather than a capability.

The survey does not settle this. What it can say is narrow and defensible: the three surfaces
are a pattern the field independently converged on; no surveyed tool unifies all three; and the
authored, architecture-altitude code-map is a different object from the bottom-up code mirrors
everyone else built. Whether that adds up to a genuine advance or to a tidy renaming is the open
question — and it is more useful to leave it open than to answer it louder than the evidence
allows.
