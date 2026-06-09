# Making open-questions legible — a guidance gap, and a first dogfooding task

**Status:** design exploration / proposal. Non-binding; nothing here is rolled out. Owner decides.
**Date:** 2026-06-08
**Scope:** the 5 `open-question` artifacts in the Library, the authoring guidance that should
govern their clarity, and whether "rewrite them" is a good first subagent task.

## The owner's framing, restated plainly

> "I can't tell what the open-questions are on about: too much jargon, the language isn't simple,
> and there are no diagrams. This feels like a GUIDANCE issue, and maybe it's our first subagent."

Three threads follow: (1) diagnose *why* they're hard to read, with evidence; (2) treat the cure as
**durable authoring guidance**, not five one-off edits; (3) decide whether having an **agent** do the
rewrite is a sensible first dogfood of our owned loop. The recommendation lands at the end; tradeoffs
are named on both sides throughout, per
[`assess-tradeoffs-by-naming-both-sides`](../guidelines/assess-tradeoffs-by-naming-both-sides.md).

---

## Thread 1 — Why they're hard to follow (concrete diagnosis)

I read all five (`oq-anti-pattern-lessons`, `oq-adr-0014-draft`, `oq-library-doc-shape`,
`oq-studio-store-default`, `oq-corpus-source-format`). The smells the prompt predicted are all
present and quotable. They cluster into four failure modes.

### Smell 1 — Bare identifiers used as if the reader already knows them

The text leans on code-level names with no gloss. A newcomer (or an agent without the repo loaded)
cannot resolve them.

- `oq-library-doc-shape`, Context: *"the structured fields (oneLine/whatItIs/options/...) are
  produced by `renderBody(doc)` on read and are NOT recoverable from the rendered markdown without
  parsing."* — `renderBody(doc)` is a function in `packages/core/src/knowledge-render.ts`. The reader
  is expected to know it exists, what it consumes, and what it emits. None is stated.
- `oq-adr-0014-draft`, Context: *"comments are moving to `events.comment` (+ `events.comment_event`
  history)"* — two table/column identifiers, zero explanation of what they are or why the move
  matters.
- `oq-studio-store-default`, statement: *"Should `STORYTREE_STUDIO_STORE` default to `json` … or
  `pg`"* — the env var *is* the question, yet it is never expanded ("the switch that picks which
  backend a fresh `pnpm dev` talks to").
- `oq-library-doc-shape` leans on `GuidanceAsset` vs `Knowledge` as if the distinction were obvious;
  it is in fact the entire crux of the question, and it is never drawn.

### Smell 2 — ADR numbers as load-bearing nouns, with no one-line gloss

Every open-question cites ADRs by number and treats the number as the explanation.

- `oq-corpus-source-format`, Context: *"ADR-0013 ('structured corpus, markdown as a view') asserts
  YAML as the authoring source of truth."* — this one is actually *good*: it glosses the ADR inline.
  It is the exception that proves the rule.
- `oq-anti-pattern-lessons`, Context: *"(The third lesson, `vibe-the-load-bearing-layers`, was
  already merged into `own-the-layers` per ADR-0018 §D3.)"* — `ADR-0018 §D3` is pure coordinate; the
  reader must leave the page to learn anything.
- `oq-adr-0014-draft` cites ADR-0014, 0017, 0018 repeatedly; only 0014 gets a partial gloss
  ("notice-board feedback → durable guidance"). 0017/0018 are bare numbers doing real argumentative
  work ("supersede by ADR-0017/0018").

The pattern: **when the author glosses the ADR, the sentence is readable; when they cite the bare
number, it is not.** That is a teachable, mechanical rule (Thread 2).

### Smell 3 — No plain-language statement of what's at stake

The template's lead field is **The question** (`statement`), and the second field is **Context**,
whose template placeholder is *"Why it is open now — the forces and constraints."* So every artifact
opens with the *decision* and then the *forces*, and **never with "why a non-expert should care."**

- `oq-library-doc-shape` opens: *"The store holds structured Knowledge docs (per-kind fields), but
  the studio writes rendered GuidanceAssets — so editing a unit in the studio collapses it to a
  rendered markdown body (one-way)."* That is the *mechanism*. The **stake** — "edit a Library entry
  in the UI and you silently lose its structure; the next re-seed then fights your edit" — is
  derivable but never said in newcomer terms.
- `oq-studio-store-default` is the closest to leading with stakes (offline-safe/zero-cost vs
  shared-live-state), but buries it under env-var and ADR machinery before the reader gets there.

There is **no field in the template that asks for the stake in plain terms**, so authors don't write
one. This is the single highest-leverage finding (Thread 2 acts on it).

### Smell 4 — Structure/flow described in prose where a picture would win

`oq-library-doc-shape` is the clearest case. Its whole question is a **data-flow relationship** —
`knowledge.json` (structured source) → `build-corpus.mjs` (generator) → DB (stores a rendered
`GuidanceAsset` body) → `renderBody`/the studio (read path) → studio edit (writes rendered, one-way)
→ re-seed conflict. That is four nodes and a cycle, and it is rendered as one 80-word sentence the
reader has to simulate in their head. A six-box diagram would make the "one-way collapse" and the
"re-seed conflict" self-evident. (The same is true, more mildly, of `oq-adr-0014-draft`'s
comments→events migration and `oq-corpus-source-format`'s per-tier format split.)

**Today the studio cannot render a diagram even if an author drew one** — see Thread 2's rendering
sub-finding.

### Does the template shape help or hurt? — It hurts, mildly, in two specific ways

The `open-question` shape in `KIND_SPECS` (`packages/core/src/knowledge.ts`) is:
**The question** (lead) · **Context** (req) · **Options** (req) · **Recommendation** (opt) ·
**See also** (opt).

What it gets *right*: **Options** forces "name both sides — A vs B," and every artifact obeys it —
the options sections are the most readable part of all five. The structure already encodes our
`assess-tradeoffs` value, and it works.

What it gets *wrong* for clarity:

- **No stakes slot.** The lead is **The question** (the most jargon-dense sentence), and **Context**
  is pointed at *forces*, not *plain-language stakes*. A newcomer hits maximal jargon first and never
  gets a one-sentence "why care."
- **No diagram slot, and no renderer for one.** Nothing in the shape invites a picture for the
  structural/flow questions that most need it.

Neither is a deep flaw — the shape is sound — but both are *template-level* nudges that would lift
every future open-question, which is exactly the leverage Thread 2 wants.

---

## Thread 2 — Treat it as a guidance gap (the core ask)

The owner's instinct is right: five hand-edits fix five artifacts; **guidance fixes the next fifty.**
Below is what the guidance should say, what *form* it should take, and the one genuine
build decision hiding inside "add diagrams."

### What prior art already exists (build on it, don't duplicate)

Two guideline docs already speak directly to this, and **both are the right kin to extend**:

- [`guidance-quality`](../guidelines/guidance-quality.md) — *"fix unfollowed guidance with
  **structure** (path / signpost / fence), not emphasis."* This is the meta-lesson: the cure for
  jargon is a **structural** move (a template field, a lint), not a "please write clearly" exhortation.
- [`signal-and-noise`](../guidelines/signal-and-noise.md) — *"judge guidance by discriminatory
  power."* Jargon-without-gloss is **noise**: it consumes the reader's attention without helping them
  decide.

**Important finding:** both docs live in `docs/guidelines/` but are **not yet Library artifacts** —
they have no row in `knowledge.json` (unlike `assess-tradeoffs-by-naming-both-sides`, `deep-modules`,
`edit-first-curation`, which *are* both doc and artifact). So part of the work is simply **promoting
the prior art into the Library** so it's discoverable in the studio at all. The new clarity guidance
should **compose with** these two (cite them), exactly as `signal-and-noise` already cites
`guidance-quality`.

### The proposal: one new principle + one template change + promote two existing docs

I recommend **not** a single sprawling artifact but a small, layered set, each at the right altitude.
The altitude question — principle vs pattern vs guardrail — is decided by the schema itself: a
`guardrail` requires an **Enforced by** field naming a *deterministic mechanism*, and the schema's
own placeholder says *"If nothing deterministically enforces it, this is a `pattern`, not a
guardrail."* That rules guardrail out until/unless we build a lint (see below).

#### (a) New `principle` — `plain-language-first` (how to *judge* clarity)

A principle states a judgement rule, a why, and a "how to apply" test. Draft body is in
[Appendix A](#appendix-a). Its load-bearing rules:

1. **Lead with the stake.** Open with one sentence a newcomer understands: what breaks, or what is
   blocked, if this isn't settled — before any identifier or ADR number.
2. **Explain-or-link every internal term on first use.** A bare identifier (`renderBody`,
   `GuidanceAsset`, `events.comment_event`, `STORYTREE_STUDIO_STORE`, `build-corpus.mjs`) or a bare
   ADR number gets a ≤7-word gloss or a link, the first time it appears. This is a **jargon budget**:
   the count of unexplained internal tokens on first use should be **zero**.
3. **Draw the structure.** Any artifact whose subject is a *structure, flow, or state machine* should
   include a diagram, not only prose (see rendering decision below).

It's a **principle**, not a pattern, because it is a *standard you judge against* ("is the stake in
the first sentence? is the jargon budget zero?"), not a reusable construction. It composes with
`signal-and-noise` (jargon = noise) and `guidance-quality` (the cure is structure).

#### (b) Template change to the `open-question` shape — the structural fix

Per `guidance-quality`, the durable cure is **structure, not exhortation**: bake the stake and the
diagram into the shape so authors *can't* skip them. Two field additions to the `open-question` entry
in `KIND_SPECS`:

| Field | Position | Required? | Heading | Purpose |
|---|---|---|---|---|
| `stakes` | **new lead** | **required** | `**Why this matters.**` | One plain sentence: what breaks / what's blocked. |
| `diagram` | after Context | optional | `## Diagram` | A picture for structural/flow questions. |

The existing `statement` (**The question**) demotes from lead to a required section directly under the
new lead. Net new author burden: **one sentence** (the stake) per open-question; the diagram is
optional and only expected for structural questions.

**Blast radius — named honestly.** `KIND_SPECS` is the single source for the zod schema, `renderBody`,
and `generateTemplate` (all three derive from it, by design). Adding a **required** field means the
five existing open-questions **fail validation until each gets a `stakes` line** — so this change and
a backfill of the five must land together (which is the worked example in Thread 3). Adding `diagram`
as **optional** is free (no existing doc must change). A cheaper, reversible variant: ship **both as
optional first**, prove the habit, then promote `stakes` to required once the corpus is backfilled —
trading "guaranteed every artifact has a stake" for "zero migration risk." I lean *required `stakes`
+ backfill-in-the-same-change* because an optional stakes field is the status quo (authors already
*could* lead with stakes and don't); required is the structural fence `guidance-quality` argues for.

#### (c) Promote `guidance-quality` and `signal-and-noise` into the Library

They're already written; they're just not artifacts. Add them to `knowledge.json` (kind `principle`),
so the studio surfaces them and the new `plain-language-first` principle can cross-link to live
artifacts, not just docs. Low cost, pure win, and it's the `edit-first-curation` move (extend the
corpus's existing authority rather than inventing parallel guidance).

### The diagram decision — two separable parts

"Include diagrams" is really **(a) a rendering capability** the studio lacks, and **(b) authoring
guidance on when one is required.** (b) is just rule 3 of the principle above. (a) is the only real
*engineering* decision in this whole proposal, so name the options and their blast radius:

The renderer today is **`react-markdown` + `remark-gfm` only** (`apps/studio/src/components/Markdown.tsx`;
studio deps confirm no mermaid/rehype). So:

| Option | What it is | Blast radius | Security |
|---|---|---|---|
| **A — ASCII/box diagrams in fenced code** | authors draw with text; renders today, unchanged | **zero** — works now | none (inert text) |
| **B — Mermaid via `remark`/`rehype` plugin** | add `rehype-mermaid` (or client `mermaid` + a code-block renderer); ```` ```mermaid ```` blocks become SVG | **moderate** — new dep(s), a `Markdown.tsx` change, the editor live-preview must use the same renderer, bundle size up | Mermaid runs author-supplied diagram source; pin a version, render client-side sandboxed, and treat it like any author input. Corpus authors are trusted (operators/agents-under-review), so the surface is small but non-zero. |
| **C — Committed images** | authors commit PNG/SVG, reference by path | low render change, but **images bypass the structured corpus** — they live in git, not the DB, and re-seed/round-trip don't carry them; collides with `oq-library-doc-shape`'s very problem | image content is opaque to review |

**Recommendation: A now, B as a fast-follow.** ASCII unblocks every structural open-question *today*
with zero risk (the Thread-3 worked example uses ASCII for exactly this reason). Mermaid (B) is the
better end state — diffable, prettier, structured — and is a cleanly-scoped capability worth a small
ADR + its own task, but it should not gate the clarity rewrite. Avoid C: committed images reintroduce
the structure-lives-outside-the-DB problem the Library is trying to kill.

### What about a guardrail (deterministic enforcement)?

The owner floated "the editor flags undefined ALL-CAPS/identifier tokens." That *would* make
`plain-language-first` a true `guardrail` (it would have a real **Enforced by**). It's appealing and
plausible — a lint over an artifact body that flags `[A-Z][a-zA-Z]+\(|[a-z-]+\.(ts|mjs)|ADR-\d{4}|[A-Z_]{4,}`
tokens not glossed within N words or linked. But it's a **build**, with false-positive tuning (every
artifact legitimately names `ADR-0017`), and it belongs *after* the principle exists to define what
"glossed" means. **Recommendation: ship the principle + template now; log the lint as a future
guardrail** once we've seen whether the template alone moves the needle. Naming both sides: a lint is
the only thing that makes clarity *non-bypassable* (advisory guidance gets ignored, which is the whole
reason we're here); against it, a noisy linter that cries wolf on every ADR citation will be disabled
within a day. Earn it with the principle first.

---

## Thread 3 — Is "rewrite the open-questions" a good first subagent task?

**Short answer: yes, with a narrowed scope and a human/LLM-judge gate standing in for red-green. It is
close to an ideal first dogfood — but only if we *don't* pretend the prove-it-gate applies.**

### Why it's a genuinely good first task

- **Bounded and low-blast-radius.** Five artifacts, prose only, no production code paths. A bad
  output embarrasses; it doesn't break a build or corrupt state.
- **The tools already exist and are exactly the surface.** `packages/agent`'s `fs-tools` are
  `read_file`, `write_file`, `edit_file`, `list_dir`, `run_command` — enough to read `knowledge.json`,
  read the guidance docs, and propose edits. No new agent capability is needed.
- **It dogfoods the Library as the agent's context source** — the agent pulls
  `plain-language-first` + `guidance-quality` + `signal-and-noise` as its brief, which is precisely
  the [`pull-based-context-architecture`](../guidelines/pull-based-context-architecture.md) thesis
  ("brief thinly, pull just-in-time").
- **Success is observable to a human in seconds.** Before/after readability is something the owner can
  judge in the studio at a glance — a fast, honest review loop.

### What it would concretely look like

```
  brief (thin)                  tools                      output                 review
  ───────────                   ─────                      ──────                 ──────
  plain-language-first   ─┐                            proposed new body      studio Library
  guidance-quality        ├─►  read_file knowledge.json  per open-question  ─► diff/comment ─► operator
  signal-and-noise        │    read_file guidelines/*    (NOT a direct write)   approves / steers
  the 1 target artifact  ─┘    edit_file (proposal only)                        (outer loop)
```

- **Context injected:** the three clarity artifacts (the new principle + the two promoted docs), the
  `KIND_SPECS` open-question shape, and the **one** target artifact's current body. Thin brief; the
  agent pulls the rest.
- **Tools:** `read_file` / `list_dir` to gather; `edit_file` to produce a *proposed* revision. It
  should **propose, not commit** — write to a scratch location or emit a diff, not `--pg` the live DB.
- **Output → review:** surface the before/after in the **studio Library** (or as a comment/diff on the
  artifact). A human does the `approval` (the **outer loop**, per
  [`human-owns-the-outer-loop`](../guidelines/) / the glossary). This matches our
  approval-gated-trunk posture exactly: a result is *a request for diff-review*, never an auto-merge.

### The honest problem: "proof" for a prose task

This is where it gets interesting, and where I want to be candid rather than hand-wave.

**The prove-it-gate does *not* apply.** The prove-it-gate is `red→green over on-disk test evidence`
(glossary: *"a unit reaches `healthy` only via earned, on-disk evidence"*). Prose clarity has **no
failing test that turns green** — there is no automatable assertion that "the stake is in the first
sentence and a newcomer understands it." Forcing a red-green ritual here would be exactly the
**faked-UAT theatre** the corpus already warns against (`faked-uat-theatre` pattern): a green check
that proves nothing.

The corpus *already has the right proof mode for this*: **`operator-attested`** — defined for
*"behavioural surfaces that have neither an honest scripted UAT nor an isolatable automated test."*
Prose quality is precisely that. So the proof of success is an **operator-attested sign-off** (a typed,
signed event; the agent can never self-exempt), optionally assisted by an **LLM-judge** that scores the
rewrite against the principle's checklist (stake-in-first-sentence? jargon budget zero? diagram present
for a structural question?). The LLM-judge is **advice to the human, not the gate** — `reward-hacking`
warns that any gameable success signal gets gamed, and an LLM grading prose it could also write is
gameable; keep "doing" and "judging" separate, and let the human hold the sign.

There *is* one deterministic check worth wiring: **the rewrite must still validate against the zod
schema** (`Knowledge` discriminated union) and round-trip through `renderBody`. That's a real,
non-gameable green — not proof of *clarity*, but proof the agent didn't produce a structurally broken
artifact. Cheap to add to the task's definition of done.

### Honest recommendation on *whether* it's the right first task

**Recommend: yes — but make the first run a single artifact, not all five.** Have the agent rewrite
**one** open-question (`oq-library-doc-shape` — the worst offender, and the one that most needs a
diagram, so it exercises the full guidance), under the new guidance, with operator-attested sign-off.
That is a complete, honest dogfood: thin brief → pull context → propose → human approves. If it lands
well, fan out to the other four as a second, now-de-risked pass.

**The safer alternative, named:** a *non*-prose first task (e.g. "add the `stakes` field to
`KIND_SPECS` and backfill the five docs to keep `pnpm -r test` green") is more in the agent's
comfort zone because it has a **real red-green gate** — tests must pass. It's a better fit for proving
the *loop's mechanics* (tool use, the gate, approval). The prose rewrite is a better fit for proving
the *Library-as-context* thesis but leans entirely on human judgment for proof.

My pick: **do the schema/backfill task first** (it's the lower-risk way to prove the owned loop end-to-end
*with* a genuine gate), **then** the single-artifact prose rewrite (to prove Library-as-context). They're
complementary, and in that order each de-risks the next. If forced to one, the prose rewrite is still a
*good* first task — just be explicit that its proof is operator-attestation, not red-green.

---

## Recommendation summary

1. **Add `principle: plain-language-first`** (Appendix A) — lead-with-the-stake, zero-jargon-budget
   (explain-or-link every internal term/ADR on first use), draw-the-structure. Composes with
   `signal-and-noise` + `guidance-quality`.
2. **Change the `open-question` template** in `KIND_SPECS`: add required lead `stakes`
   (**Why this matters.**) and optional `diagram` (`## Diagram`); demote `statement` to a section.
   Land the schema change *with* a backfill of the five existing docs (they won't validate otherwise).
3. **Promote `guidance-quality` and `signal-and-noise` into `knowledge.json`** as `principle`
   artifacts so the studio surfaces them.
4. **Diagrams:** ASCII-in-fenced-code now (zero risk, works today); scope **mermaid via remark/rehype**
   as a fast-follow with its own small ADR. Avoid committed images.
5. **Defer the clarity *lint* guardrail** until the principle has had a chance to work; revisit making
   it deterministically enforced once we know the template alone isn't enough.
6. **First subagent:** do the **schema-field + backfill** task first (real red-green gate), then a
   **single-artifact prose rewrite** of `oq-library-doc-shape` (operator-attested + optional LLM-judge,
   schema-validation as the one hard check). Don't bulk-rewrite all five up front.

### Tradeoffs, both sides

- **Required `stakes` field** — *for:* a structural fence guarantees every future open-question leads
  with a stake (the status-quo optional version is already available and ignored). *against:* forces a
  same-change backfill of the five and any in-flight drafts; an optional-first rollout avoids that
  migration at the cost of weaker enforcement.
- **Mermaid (B) vs ASCII (A)** — *for B:* diffable, structured, prettier, lives in the corpus.
  *against B:* new deps, a renderer change touching the editor preview, author-input execution surface.
  *for A:* zero blast radius today. *against A:* uglier, no semantic structure.
- **Prose rewrite as first subagent** — *for:* bounded, low-risk, dogfoods Library-as-context, fast
  human review. *against:* no red-green gate — proof is judgment, which is softer and (via LLM-judge)
  gameable; a schema/backfill task proves the loop's mechanics more honestly.
- **A new principle vs only extending the two docs** — *for new:* `plain-language-first` names a
  distinct, judge-against standard (lead-with-stake / jargon-budget) the two existing docs don't state
  outright. *against:* risks corpus bloat near `signal-and-noise`; mitigated by making it explicitly
  compose-with-and-cite rather than restate (the `edit-first-curation` discipline).

---

## Appendix A — DRAFT clarity guidance artifact

> Draft only. Not added to `knowledge.json`. For owner review.

**kind:** `principle` · **id:** `plain-language-first` · **title:** "Plain language first"

**The principle.** Write every artifact so a newcomer with the repo *not* loaded grasps the stake in
the first sentence and never hits an unexplained internal term.

**Why.** Our artifacts are read by newcomers and by agents that pull them as just-in-time context
without the codebase in mind. A bare identifier (`renderBody`, `STORYTREE_STUDIO_STORE`) or a bare ADR
number (`ADR-0018 §D3`) is **noise** to that reader (see `signal-and-noise`): it consumes attention
without conferring the power to decide. An artifact that opens with *the decision* instead of *the
stake* makes the reader earn the "why should I care" that should have been free.

**How to apply.** Three checks, all observable:

1. **Stake in sentence one.** The first sentence says what breaks, or what is blocked, in plain terms —
   before any identifier or ADR number. ("Edit a Library entry in the studio today and it silently
   loses its structured fields.")
2. **Jargon budget = zero.** Every internal term, code identifier, and ADR number gets a ≤7-word gloss
   or a link **on first use**. Count the unexplained ones; the target is none. (`renderBody` →
   "`renderBody` — the function that turns structured fields into the markdown you see.")
3. **Draw the structure.** If the subject is a structure, flow, or state machine, include a diagram,
   not only prose.

**See also.** Composes with `signal-and-noise` (jargon is noise) and `guidance-quality` (fix clarity
with structure — a template field or lint — not "please write clearly"). The `open-question` template
operationalises check 1 via its required `stakes` lead and check 3 via its `## Diagram` slot.

---

## Appendix B — Before / after, one worked example (`oq-library-doc-shape`)

The worst offender, and the one that most needs a diagram. Below: the current rendered body, then a
rewrite under the proposed guidance (stake-led, jargon glossed, ASCII diagram). **This is illustrative
— not applied to `knowledge.json`.**

### BEFORE (current — `statement` + `context` as they render today)

> **The question.** The store holds structured Knowledge docs (per-kind fields), but the studio writes
> rendered GuidanceAssets — so editing a unit in the studio collapses it to a rendered markdown body
> (one-way). How should the structured authoring source survive editing?
>
> **Context.** The pg write path persists a GuidanceAsset (a string `body`) and validates it; the
> structured fields (oneLine/whatItIs/options/...) are produced by `renderBody(doc)` on read and are
> NOT recoverable from the rendered markdown without parsing. `knowledge.json` remains the structured
> authoring source, but once a unit is edited in the studio its stored form is rendered, diverging from
> the structured source — which `build-corpus.mjs` would then overwrite or conflict with…

*Problems:* opens with the mechanism, not the stake; `GuidanceAsset`, `renderBody(doc)`,
`build-corpus.mjs` all bare; the four-node flow is a single sentence.

### AFTER (rewritten under `plain-language-first` + the new template)

> **Why this matters.** Edit a Library entry in the studio today and it **silently loses its structured
> fields** — the next time we regenerate from source, your edit and the source fight, and one wins by
> accident. We need to decide how an edited entry keeps its structure.
>
> **The question.** Our database stores entries as *structured docs* (separate fields like
> `oneLine`, `options`, …), but the studio's save path stores only a single rendered-markdown `body`.
> Saving in the studio therefore flattens a structured doc into plain text, one-way. How should the
> structured form survive an edit?
>
> ## Diagram
> ```
>   knowledge.json            build-corpus.mjs              the database
>   (structured source) ──────► (generator) ──────────────► stores a RENDERED
>        ▲                                                   markdown body
>        │                                                        │
>        │  re-seed CONFLICTS  ◄───────────────────────┐         │ read
>        │  with the edit                              │         ▼
>        │                                    studio EDIT    renderBody()
>        └──────────────  studio writes  ◄─── (writes        rebuilds the
>                         rendered body,       rendered)     fields for display
>                         structure lost ──────────┘
> ```
> *`build-corpus.mjs` = the script that turns `knowledge.json` into what the studio reads.
> `renderBody()` = the function that rebuilds the markdown view from structured fields on read.*
>
> **Context.** `knowledge.json` is the structured authoring source. The studio's database write stores
> only a rendered `body` string and validates that; the per-field structure is reconstructed on read by
> `renderBody()` and **cannot** be recovered from the rendered markdown without parsing it back. So once
> an entry is edited in the studio, its stored form is rendered-only — diverging from the structured
> source that the generator would later overwrite. ADR-0013 ("structured corpus, markdown as a view")
> wants structure-as-source; ADR-0017 (the knowledge tier) makes the templates derive from the schema.
> Editing in rendered form fights both.
>
> **Options.** *(unchanged — already strong; A: accept rendered-on-edit + re-seed; B: parse markdown
> back to structured on write; C: edit structured fields directly.)*

*What changed:* stake leads in plain words; every identifier glossed on first use; the four-node
cycle is a picture; the strong Options section is left alone. The body is *longer* but each sentence
now carries decision-power — higher signal, not just more words.
