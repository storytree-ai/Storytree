# What a context window is actually made of — and how little of it the replay panel draws

Measured 2026-09-05 for the review of the context-traversal replay surface. The decision it produced
is **ADR-0516**; the work it chartered is `context-window-composition-arc`.

**Read this before proposing any context-categorisation, replay-axis or "what is the window spent on"
work.** It exists so a later session does not re-derive numbers it can read in five minutes, and does
not re-propose the two things this review already declined.

---

## 0. How this was measured, and why it is not the traces

Every figure here comes from **host Claude Code transcripts** under
`~/.claude/projects/C--code-storytree/`, 60 most recent windows, 71.1 MB of content.

That choice is the whole reason the numbers are sound. **A transcript is one context window by
construction** — the harness writes one file per window, named for the window id. The traversal
traces under `~/.storytree/traces` are not: censused the same day over **every line of every file**,
**862 traces — 243 in which every line carries `grade: window`, 619 in which no line carries a grade
at all, and none mixed** — the ungraded ones pre-2026-08-22, slot-keyed, pooled across a parent
session, its subagents and every later session handed the same slot, and not retrofittable. Any
per-session ratio computed over those 619 is a ratio over a pool. This is the same instrument defect
that inflated the re-read figure by ×2.39 (`re-reading-cost-and-mechanism-2026-08-22.md`).

**Nothing in this document is asserted about traces.** Where trace behaviour matters below it is
cited to a decision that measured it, never re-derived here.

Composition is counted in **BYTES**, for ADR-0330 D1's reason: this repo carries no tokenizer, and a
budget whose measurement drifts with an estimator is not a budget. Tokens appear in exactly one
place — §3's residual — where they are read off a request's own `usage` rather than estimated.

---

## 1. The composition of a window, as far as a transcript can see it

60 windows, 71,113,698 content bytes.

| category | bytes | share |
|---|---:|---:|
| tool output (`tool_result`) | 36,438,516 | **51.2%** |
| tool calls the agent authored | 10,192,078 | 14.3% |
| project guidance (`CLAUDE.md`, injected) | 9,165,851 | **12.9%** |
| token-count reminders | 4,722,075 | 6.6% |
| unclassified harness records | 3,782,481 | 5.3% |
| unclassified attachments | 2,223,339 | 3.1% |
| harness catalogues (skills, agents, tool deltas, MCP) | 2,055,188 | 2.9% |
| assistant prose | 1,427,553 | 2.0% |
| the human's own prompts | 520,880 | **0.7%** |
| hook injections | 424,477 | 0.6% |
| assistant thinking | 161,260 | 0.2% |

**Mandatory, non-elective context — guidance + reminders + catalogues + hooks — is 23.0%.**
The human's own words are **0.7%**.

Two honest limits on this table. **8.4% is unclassified** (the two `other:` rows) and is not
silently distributed into the named categories. And **the thinking row is a known under-count** —
thinking blocks reach the transcript redacted, so their bytes do not reflect what they cost in the
window; the row is reported rather than dropped, but it must not be quoted as a cost share.

### The classification needs no content inspection

This is the finding that makes any future build cheap and keeps it legal. **The harness types its own
injections.** Every non-message record carries `attachment.type`, and the vocabulary is already the
owner's category list:

`nested_memory` (carries `displayPath`, e.g. `..\..\CLAUDE.md`) · `skill_listing` ·
`agent_listing_delta` · `deferred_tools_delta` · `mcp_instructions_delta` · `command_permissions` ·
`hook_success` · `hook_additional_context` · `total_tokens_reminder` · `auto_mode`

So categorising the window is reading a label and a length. It never opens a body, which is what
keeps it inside **ADR-0235 clause 6** ("telemetry is metadata-only … must not duplicate context
bodies, prompts, tool results, hidden reasoning").

---

## 2. The replay panel draws one tenth of the traffic

The panel's marks come from `storytree` CLI read surfaces only. ADR-0360 §1 found *exactly four* in
the traces on 2026-08-13 (`library-artifact`, `agents`, `tree`, `library-dashboard`); the allowlist
has since grown to **thirteen** declared surfaces over 18 read shapes — adding `library-search`,
`library-query`, `library-tree-focus`, `library-inbound`, `arc`, `adr`, `open-question`, `increment`
and `friction`. That figure is quoted here as the allowlist's current size, **not** as a re-count of
the traces. Split the same 60 windows' 36.4 MB of tool output by whether the call was one of those:

| | bytes | share of tool output |
|---|---:|---:|
| corpus reads — **what the panel can draw** | 3,789,731 | **10.40%** |
| everything else through a tool — invisible to it | 32,648,785 | **89.60%** |

By tool: `Read` **53.94%**, `Bash` **40.34%**, browser tools ~3.1%, `WebSearch` 0.56%, `Grep` 0.24%.

**10.40% is an UPPER bound on what the panel draws**, not an estimate of it: `observeCliInvocation`
is an allowlist, so some of those invocations emit no visit at all.

Chained against §1, corpus reads are **≈5.3% of the whole derivable composition** of a context
window. The replay panel is a picture of about one twentieth of the window, and it is the surface
titled with how agents navigate our system.

This is not a new defect. It is **ADR-0360 §1** measured from the cost side rather than the coverage
side: *"There is no adapter for file-level navigation … an agent that greps its way to an artifact
and reads the file produces no visit at all."* What is new is the size — the invisible pathway is not
a gap in the picture, it is nine tenths of it.

---

## 3. The largest single category is invisible to any transcript

At the **first** model request of a window, before the session has called a single tool:

| | median |
|---|---:|
| tokens already resident (`input` + `cache_read` + `cache_creation`) | **~106,000** |
| accounted for by everything the transcript recorded pre-request | ~11,000–16,000 |
| **residual — the harness's own system prompt and tool definitions** | **≥92,819** (n=13) |

Verified structurally, not inferred: **zero transcript lines carry a tool schema**, and the only
`type: "system"` records are `stop_hook_summary`. The system prompt and the tool definitions are sent
to the API and never written to the JSONL.

The residual is a **lower bound**. It is `resident − (pre-request bytes ÷ 3.8)`, and those bytes are
JSON-escaped lines with metadata wrappers, so the divisor over-states the visible half and therefore
under-states the residual.

This corroborates **ADR-0330** from a second direction, and sharpens one of its clauses. ADR-0330
measured an ~85k fixed preamble at 24.3% of spend and recorded that *"the majority of the floor is
the harness's system prompt and tool definitions, neither onboarding text nor ours to edit"*, leaving
**~23.5k of 85k** as the share this repo owns. Measured here at first-request granularity the floor
is larger (~106k) and the invisible share is larger with it — consistent with a session that has
since acquired MCP servers, browser tools and a deferred-tool catalogue.

**The practical consequence for any categorisation surface:** the single biggest slice of a window at
session start can only ever be shown as a **residual against `residentInputTokens`**, never as a
measured category. A surface that omits it would report a composition summing to a fraction of the
window and read as though the rest were free.

---

## 4. What this says about the two things the owner asked

### "Do we have our system backwards?"

Two separable readings. Both are already answered, and neither needs a build.

**The picture is not inverted.** Time runs left→right (ADR-0354 D3/D4's rotation) and corpus distance
runs downward (ADR-0482 D1). A session that searches, lands deep and climbs therefore already draws
as a rise over time — which is the observed behaviour, drawn the right way up. Flipping the axis
would mirror a static property of the artifact and reveal nothing about the journey.

**The session's own route is refused, twice, on measurement.** `parentVisitId` drew nothing — 704 of
8,965 reads carry it and **0 of 4,735 `library-artifact` reads do** (ADR-0482 D1). And ADR-0360 D2
refuses rebuilding it on the stronger ground that the offer set is *provably identical* to the
artifact's own `references` (verified over 1,125 artifacts, zero divergences), so recording the
descent would record nothing the corpus does not already state. That decision says in terms: do not
revisit this as an optimisation.

**The corpus half of the question — "we author top-down, agents read bottom-up" — is true, and we
have already acted on it.** Reads do not cluster by altitude (p = 0.132; p = 0.938 under a second
independent classifier, `decision-altitude-2026-08-23.md`); "Context Matters" (`arXiv 2604.03826`)
independently found recent decisions beat foundational ones; and **ADR-0464 already retired the offer
surface** in favour of search plus the authored edge. The chain-walk survey's own conclusion is that
both results *"should close any remaining plan for a 'read these foundations first' surface"*.

### "Break the window down into categories"

Feasible, cheap, and legal (§1). But the numbers relocate the question:

- Onboarding is **23.0%** of the derivable window, and the part this repo can edit is already
  budgeted and reported — ADR-0330 D1's 96 KiB ceiling on `CLAUDE.md` + `MEMORY.md`, a `storytree
  doctor` WARN and deliberately not a gate rung.
- The dominant category is **tool output at 51.2%** — the window fills with *work*, not with
  onboarding.
- The biggest slice at session start is **the harness's, not ours**, and is only ever a residual.

So the interesting ratio is not the one the ask names. It is §2's: **the surface built to show how
agents navigate draws ≈5% of what enters the window.**

---

## 5. Where a composition figure may and may not go

Three standing constraints, all of them owner decisions, and all of them cheaper to read than to
rediscover:

1. **No prose under the picture (ADR-0393 D1).** Every explanatory paragraph below the plot is
   deleted — including, by name, *"the offer denominator"*. Asked directly whether to collapse them
   behind a "what this can't show" disclosure instead, **the owner chose deletion**, because a hidden
   component is one a later reader restores by accident. A denominator sentence under the picture is
   therefore already refused.

2. **But D1 also carries the sanctioned alternative shape.** The knowledge-depth reading was
   *re-homed rather than deleted* — "**a counts chip on the axis line ABOVE the picture**, beside the
   mark and fold counts", with its fuller reading on the chip's hover, and carrying a corpus-wide
   anchor figure so a thin per-trace count cannot read as an indictment of the session. That is the
   one demonstrated route for a compact numeric fact on this panel.

3. **The vertical budget is spent.** `step` floors at 11px; a trace using all 16 depth rows plus
   ADR-0511's three off-scale bands (`record`, `work unit`, `unmeasured`) already puts every row on
   the floor in a 320px dock, which is what turns offer rings into halos rather than countable rings.
   **Category bands on the depth axis are not affordable** — and they would be a category error
   besides, since that axis is corpus distance and composition is not a distance.

---

## 6. What was declined here, so it is not re-proposed

- **Flipping or re-pointing the depth axis.** §4; the picture is not inverted and the alternative
  quantity is refused by ADR-0482 D1 and ADR-0360 D2.
- **A "read these foundations first" surface.** Closed twice on evidence, and the offer surface it
  would rebuild was retired by ADR-0464.
- **Attributing a followed edge from a file read.** ADR-0360 D7 permits a file-read adapter to
  improve the *denominator* and forbids using it to attribute a followed edge — proximity inference,
  fenced by ADR-0235 clause 3 and ADR-0260 D3. Unchanged.
- **A prose denominator line under the picture.** ADR-0393 D1, above.

---

## 7. Reproducing this

The two probes are ~120 lines of Python over the transcript root and are deliberately **not**
committed: they are a one-shot measurement, not an instrument, and ADR-0360 D8's rule is that
instrumentation needs a consumer before it needs fidelity. The method is fully specified above —
§1 classifies `attachment.type` and message content blocks by byte length; §2 splits `tool_result`
bytes by whether the originating `tool_use` input names a `storytree` corpus verb; §3 reads
`usage` off the first assistant message and subtracts the pre-request byte count at 3.8 chars/token.

If a later session needs these numbers as a series rather than a snapshot, that is the arc's
increment 1, and it should be built as a reader with tests rather than as a re-run of these scripts.
