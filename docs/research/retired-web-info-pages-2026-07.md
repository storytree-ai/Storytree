# Retired web pages — the four brochure pages (content salvage, 2026-07-07)

Salvage extraction from the public site's four remaining informational pages, retired per the owner's
direction on 2026-07-07 ("retire all of these, if there is useful content turn it into an ADR that can
be revived later"). This is the revival material the follow-on ADR points to: future sessions find the
substance here instead of re-deriving it from web-repo git archaeology.

**What was retired:** `/how-it-works/`, `/get-involved/`, `/contact/`, `/constitution/` (and their
data files, the `constitution.md` body, the `TreeWorld`/`AgentMaze` components + `mockSystem.json`
demo). After this the public site is exactly the Act 1 + Act 2 **experience** plus the no-JS /
reduced-motion accessibility fallback and the 404 — every old URL redirects to `/`.

**Source (byte-exact revival):** storytree-web @ `42474a7` — `src/pages/{how-it-works,get-involved,
contact,constitution}.astro`, `src/data/{how-it-works,get-involved,contact,constitution-page}.json`,
`src/content/constitution.md`, `src/components/{TreeWorld,AgentMaze}.astro`, `src/data/mockSystem.json`
(all deleted in the retire commit; full render code recoverable in storytree-web git history). This
extends the ADR-0167 salvage (`retired-web-roadmap-2026-07.md` / `retired-web-landscape-2026-07.md`),
which retired the other two pages a day earlier.

**Retire rationale (the signed disposition):** the shipped experience is now the whole front door and
carries the site's job itself (ADR-0134/0148/0153/0157/0165); ADR-0167 had already deprecated these as
capable-visitor escapes and the owner directed the full retirement the next day. The content below is
kept because it is genuinely useful — the how-it-works explainer is the clearest plain-language
statement of the three-surface thesis the project has written, and the constitution is the founder's
standing manifesto — and may come back to life (on a page, or folded into the experience's own copy).

---

## `/how-it-works/` — the three-surface explainer (the strongest salvage)

The thesis: **AI agents don't need more context — they need a map.** Structure and key copy:

**Intro — the maze.** "Drop an agent into a real codebase and it finds its way the only way it can:
grep around, open a few files, and pull as much as it can into its context window… On a small project
that works. On a large one, it's a maze." Piling in *more* context doesn't clear it — attention is
finite; past a point the agent **thrashes** (re-reads, loops, gets reckless — "ripping out the test
that won't pass, faking the output"). Hand it a **map** and the maze falls away.

**The three surfaces (the trio):**
- **The map** — a top-down, glanceable picture of the whole system, coloured by health. You read it
  instead of re-reading diffs and chat logs — and so do the agents.
- **The library** — where humans and agents agree what's being built and what "done" means, *before* a
  line is generated, so review checks the work against intent.
- **The harness** — a deterministic, human-in-the-loop lane that holds the model to the same gates a
  team would; nothing counts as done until a check that was failing is made to pass.

**The map · observability** — "A satellite view of your system, not a scroll-back of the chat." Grounds
the verification gap (Sonar Jan-2026 survey of 1,100+ devs: 96% don't *fully* trust AI-generated code
is correct; ~half always verify before shipping). Each tree is a **story** (one slice of the product),
colour = health, garden = capabilities. The map is also what the *agents* read — a compact top-down
graph beats dumping the repo into context (attention is "a finite resource with diminishing marginal
returns as it fills" — Anthropic's framing).

**The grain** — "Big things are made of small, checkable things." The level ladder:
- **Story** — a whole, useful slice a newcomer can point at; checked by walking it end to end.
- **Capability** — an organ inside a story; checked by testing its parts wired together, no faking the
  hard bits with a mock.
- **Contract** — a single behaviour pinned by one focused automated test; the smallest brick, and the
  one thing an agent can't talk its way past.

**The graph · triage** — "A file tree tells you where things are. A health graph tells you where
they're broken." Health flows along edges like blast-radius analysis; a red branch tells you (and the
next agent) exactly where to look. "The red branch is the work; everything else can wait."

**The harness · proof** — "'All tests pass' is a claim, not a proof." Agents reward-hack (the late-2025
`sys.exit(0)` fake-pass; a 2026 benchmark logged exploit rates as high as ~14%). So a node only goes
green when a *failing* check is made to pass for the right reason, and **the agent that writes the check
isn't the one that makes it pass** (grounded: ADR-0020) — people stay in charge of what's worth building
and what ships (ADR-0040/0030). Honest scope: "green means the checks passed — not that the code is
flawless."

**The library · coordination** — "Decisions that don't scroll away in Slack." When agents emit hundreds
of lines in seconds, the humans are the bottleneck; review becomes archaeology. The library is where
intent lives — decisions + the agreed definition of done recorded *before* generation — so review checks
the diff against what everyone agreed. "At its best, steering a project here is closer to playing a cosy
city-builder than parsing terminal output."

**Why this is different** — "Most tools give an agent one surface. storytree draws the whole map." Honest
prior art named: Steve Yegge's **Beads** (a dependency-aware issue graph — a work surface); Anthropic's
**Skills** / Letta memory blocks (a library); **Aider**'s tree-sitter repo map + CodeGraph (a code map).
The two claimed-novel moves: (1) put all three together — knowledge, code, work as one model; (2) draw
the map at the altitude of **intent** — the code has to satisfy the map, not mirror it. "A standing,
two-tier map of intent that outlives any one task still looks like open ground."

**The named industry terms (ADR-0165 §8, cited once here):** the generation–verification loop Karpathy
described; the verification gap (Sonar Jan-2026, "fully" kept); the second brain (Forte's term). With
the page retired, this naming obligation is discharged into the follow-on ADR + the experience's own
plain-language copy — the terms are embodied in the walk, not named on a brochure page.

---

## `/get-involved/` — the bet

- **Intro:** "Why this exists — and how to take part." storytree is "a bet about how software gets built
  once AI agents write most of the code."
- **The bet:** "Proof is a stronger foundation for trust than promises." "When agents write most of the
  code and humans can't read all of it, the thing that keeps software honest isn't good intentions —
  it's proof: work that has to pass a check it can't talk its way past before it counts as done."
- **How we keep ourselves honest:** "We claim only what's actually built." The same discipline the
  product enforces — a failing check made to pass, not by the agent that wrote it.
- **Where we are:** "Early, honest, and growing slowly." Invite-only; "one person still decides what
  gets built next — we're honest that 'your voice counts' isn't yet 'your vote counts.'" CTA: "Ask to
  come in."

---

## `/contact/` — the front door (form)

Copy: "Come and knock." — "This website is open to anyone… storytree itself is invite-only for now, but
*asking* is open to everyone. If you build with AI agents and these frictions are *your* frictions, say
hello." Submit → here.now submissions endpoint (`POST /.herenow/data/submissions`, idempotency-keyed);
"No account, no spam. We read everything." **This is the door the owner said can be added back later** —
if revived, it is the here.now form (or any inbound path), not necessarily a full brochure page.

---

## `/constitution/` — the founder's manifesto (verbatim, the most-preserve-worthy)

Rendered verbatim from the founder's draft; standing do-not-rewrite rule. Preserved in full:

> # The storytree Constitution
> *A living draft — v0.1. This will change, and you'll be able to watch it change.*
>
> ## What we're trying to show
> storytree is an experiment with one question at its centre: **can software be built by lots of people
> and AI agents at once — including people who've never written a line of code — and stay fair and
> trustworthy as it grows?**
>
> Most projects ask you to trust the people running them. We're trying to show that trust can rest on
> something sturdier: work that has to prove itself before it counts, and a project that's honest about
> what it has and hasn't built. The bet is that proof is a stronger foundation for trust than promises
> or good intentions — and that building this way can make a project genuinely fairer to everyone it
> touches: the people who use it, the people who build it, and the people affected by it. If that works,
> it's a way of building that more people can take part in and fewer get shut out of. If it doesn't,
> you'll be able to see that too.
>
> ## What we commit to
> 1. **Fairer to everyone it touches.** We lead with the people who use, build, and are affected by this
>    — not with whatever maximises profit. We won't pretend that's enforced by anything yet but our
>    conduct and what you can see; making fairness something the system *guarantees*, not just something
>    we promise, is part of the experiment.
> 2. **Proof, not promises.** Work has to pass a check it can't talk its way past before it counts as
>    done — and the agent that writes the check isn't the one that makes it pass, so nothing grades its
>    own work. "It works" means something you could verify, not a status someone typed.
> 3. **You don't have to write code to matter.** Anyone taking part can raise an idea or a concern and
>    have it weighed in the open. Today one person still decides what gets built next — so we're honest
>    that "your voice counts" isn't yet "your vote counts."
> 4. **We're honest about what's unsolved.** Governance, how this sustains itself, who eventually holds
>    these rules — all still unsettled. When something isn't figured out, you'll hear "this is unsolved,"
>    not spin.
>
> ## How we plan to keep ourselves honest
> This is the part that has to be real, or none of the rest is.
>
> Two things hold us to it. First, proof: inside storytree, work only counts as done when a check that
> was failing is made to pass — and not by the same agent that wrote it, so nothing grades its own
> homework. Second, plain talk: we describe only what's actually built, and name what isn't. Where we're
> still figuring something out, you'll hear us say so rather than paper over it. And the simplest check
> is open to anyone: ask us a hard question, point at a hole, and see whether the answer holds up.
>
> ## Where we are right now
> storytree is small on purpose. Taking part is invite-only while we iterate out the rough edges and
> build the guardrails this needs. We're starting with a small inner circle whose goals are aligned with
> this, because strong, aligned early members are how an experiment like this earns the right to grow. If
> it takes off, we want it to grow *slowly* — slow enough to genuinely listen to the people who join and
> shape their input well, rather than drown in it.
>
> ## What this isn't
> This is an early, solo experiment — no company, no token, no equity, no vote, and nothing here is an
> offer of any of those. These are our current intentions, not legal guarantees, and they'll change as
> we learn. The one thing we won't change quietly is this document itself: you'll see it change.
>
> ## The front door
> This website is open to anyone — that part is deliberate. storytree itself is invite-only for now, but
> the door to *ask* is wide open: if what we're trying to do resonates, reach out. Being this early, the
> people we start with matter enormously, so we'll usually get to know you a little before bringing you
> in. You're welcome to watch, to ask hard questions, and to tell us where we're wrong — that last one
> especially. If something here rings hollow, or you see a hole we can't, this project is built to hear it.
