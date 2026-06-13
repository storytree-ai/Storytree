# A timeline of the field converging on agent-context patterns

As AI coding agents ran into the hard limit of the context window, the field independently
converged on a recurring idea: give the agent **structured "attention surfaces"** — curated,
addressable bodies of state that the agent reads from and writes to, instead of stuffing
everything into one ever-growing prompt. Different teams arrived at variations of this from
different directions (knowledge files, spec documents, skills, code-as-tooling, external task
memory), and across the second half of 2025 the practice picked up a name: *context
engineering*.

This document is a **neutral field history**. It collects the dated, primary-source milestones
where the broader community formalized one of these patterns. It is not a claim about who did
what first. Every date below traces to the verified research source bundle that backs this page;
where a claim was contested or killed during verification, that is stated plainly rather than
smoothed over.

> **How storytree maps onto this.** The storytree project organizes an agent's working state
> into **three surfaces**: (1) a **LIBRARY** — a curated, validated knowledge tier; (2) the
> **STORYTREE** itself — the codebase modeled as an *authored, top-down DAG* of
> `story > capability > contract` with explicit proof modes, where a *story* is an
> independently-deployable bounded context (an "organism") and a *capability* is an "organ"
> inside it; and (3) a **NOTICEBOARD** — a dependency-aware task/work tier that acts as the
> agent's external memory. That three-surface framing is storytree's own. The milestones below
> are the *field's* parallel and prior moves toward structured context, against which storytree
> can be honestly located — not a ledger of priority.

---

## The timeline

| Date | Event | Primary source | Surface / theme |
| --- | --- | --- | --- |
| 19 Dec 2024 | Anthropic publishes **"Building effective agents"**, arguing teams should compose agents from simple, composable patterns on the raw model API rather than reach for heavyweight frameworks. | [anthropic.com/research/building-effective-agents](https://www.anthropic.com/research/building-effective-agents) | Own-the-loop / minimal-framework discipline |
| 7 Jul 2025 | **tdd-guard** (harness-enforced TDD for AI coding agents) is established as a project that externally blocks implementation until a failing test exists — a verifier the model cannot self-attest around. | [github.com/nizos/tdd-guard](https://github.com/nizos/tdd-guard) | Harness-enforced red-green / non-self-attestable verification |
| 14 Jul 2025 | **AWS Kiro**, a spec-driven AI IDE, is publicly introduced; its model hard-links generated tasks back to spec documents. | [kiro.dev/blog/introducing-kiro](https://kiro.dev/blog/introducing-kiro/) | Spec-driven development (spec as an attention surface) |
| 14 Jul 2025 | Geoffrey Huntley publishes the canonical **"Ralph"** (Ralph Wiggum) technique — running an AI coding agent in an unattended Bash loop. | [ghuntley.com/ralph](https://ghuntley.com/ralph/) | Agentic iterative loops |
| 2 Sep 2025 | GitHub open-sources **Spec Kit**, defining a four-phase spec-driven development workflow as an open toolkit. | [github.blog — spec-driven development toolkit](https://github.blog/ai-and-ml/generative-ai/spec-driven-development-with-ai-get-started-with-a-new-open-source-toolkit/) | Spec-driven development |
| 29 Sep 2025 | Anthropic publishes **"Effective context engineering for AI agents"**, framing *context engineering* as the discipline of curating what enters the model's limited attention — and advising teams to reduce abstraction. | [anthropic.com — effective context engineering](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents) | "Context engineering" named as a discipline |
| 16 Oct 2025 | Anthropic launches **Agent Skills** — loadable, dynamically-discovered capability units (the `.md` + frontmatter, progressive-disclosure format). | [anthropic.com — Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills) | Knowledge/guidance tier as loadable capabilities |
| 4 Nov 2025 | Anthropic publishes **"Code execution with MCP"**, naming the MCP tool-call-overhead problem and steering agents toward executing code over heavy tool surfaces. | [anthropic.com — code execution with MCP](https://www.anthropic.com/engineering/code-execution-with-mcp) | CLI / code-as-tooling over MCP |
| ~Jan 2026 | The **Ralph** technique goes viral in the AI-dev community; coverage in *The Register* on 27 Jan 2026 marks the mainstream-press inflection. | [theregister.com — Ralph Wiggum / Claude loops (27 Jan 2026)](https://www.theregister.com/2026/01/27/ralph_wiggum_claude_loops/) | Agentic iterative loops going mainstream |

**Caveats on the table.** A few entries warrant explicit hedging:

- The Ralph **virality** date (~Jan 2026) is the softest cell in the table. The 14 Jul 2025
  *publication* date is a primary datestamp on Huntley's own post and verified cleanly; "went
  viral" is an inflection inferred from secondary coverage, with *The Register*'s 27 Jan 2026
  piece as the dated anchor. Treat the publication and virality as two separate facts.
- The **tdd-guard** entry was confirmed but with a split verification vote (a 2–1 majority, not
  unanimous), so the 7 Jul 2025 date carries slightly more uncertainty than the unanimous rows.
- Mappings from a tool to a *surface/theme* are this document's analytical framing. Most of
  these projects do **not** describe themselves using storytree's "attention surfaces" or
  "three surfaces" language; the right-hand column is interpretation, not the authors' own
  claims.

---

## On "momentum" / behavioral self-reinforcement

A tempting story is that there exists a clean academic concept of agent **"momentum"** — an
agent's behavior reinforcing itself as its context grows — with a single canonical paper behind
it. The verification pass does **not** support that story, and honesty requires saying so.

- **arXiv 2310.00297 exists** (submitted October 2023; the paper on understanding in-context
  learning is real and was confirmed). Source:
  [arxiv.org/abs/2310.00297](https://arxiv.org/abs/2310.00297).
- **The "momentum analog" claim was refuted.** The specific assertion — that this paper
  introduces a "token co-occurrence reinforcement" mechanism that is the closest formal academic
  analog to a behavioral-"momentum" / self-reinforcement notion — **failed verification (1–2
  against)**. It should not be cited as the academic grounding for "momentum."
- **A proposed alternative citation was also killed.** A second attempt to anchor the idea in a
  different paper (claimed as arXiv 2410.21819, "published October 2024") **failed verification
  outright (0–3 against)** — the redating did not hold up.

**Bottom line:** there is no settled, named research concept of agent behavioral "momentum" that
this research bundle could stand behind. The term, as used in practitioner writing, is an
informal coinage, not an established academic result. Anyone reaching for a citation here should
stop — the clean analog does not exist in the verified sources.

---

## Reading the timeline

The striking feature of this list is the **clustering in the second half of 2025**. Within a
roughly five-month window — Kiro and Ralph in July, Spec Kit in September, Anthropic's context-
engineering post in September, Agent Skills in October, code-execution-with-MCP in November —
multiple independent teams converged on the same underlying move: pull state *out* of the raw
prompt and into structured, addressable surfaces (spec documents, loadable skills, code-as-
tooling, harness-enforced verifiers), and give the discipline a shared name.

The lone 2024 entry — Anthropic's "Building effective agents" (Dec 2024) — reads in hindsight as
the early signal: keep the loop simple and own it. The 2025 cluster is the field acting on that
intuition at scale and formalizing *context engineering* as the name for the work. storytree's
three surfaces (library, the authored story-DAG, and the noticeboard-as-external-memory) sit
inside that same convergence — one particular arrangement of the structured-context idea that
the broader field arrived at independently across H2 2025, rather than a departure from it.

---

*Sourcing note: every date and event above traces to the verified research bundle backing this
page. Primary sources are linked inline. Two claims related to behavioral "momentum" were
explicitly refuted during verification and are reported as such above. Dates tied to
"virality" or community uptake (as opposed to a hard publication/release datestamp) are
inherently softer and are flagged where they appear.*
