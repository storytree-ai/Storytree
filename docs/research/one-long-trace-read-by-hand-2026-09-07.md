# One long trace, read by hand

**Written for the owner, 2026-09-07.** You asked to zoom into one of our longer traces and get a
breakdown of what the agent actually did — and you suspected the useful signal might be *how useful
the decisions a session reads turn out to be*. This is that breakdown, and a straight answer on the
hypothesis.

Increment: `read-one-long-trace-by-hand` on `replay-answers-retrieval-ease-arc`. It is one session.
It can say what is worth looking at; it cannot say how common any of it is.

---

## The short version

A session spent **six hours and a quarter**, opened **65 different documents 150 times**, ran **25
searches** — and landed **one file, thirteen lines added, two removed**.

That sounds damning and it isn't, which is the most useful thing in this document. The session was
doing something else for most of those six hours, got interrupted by an urgent problem near the end,
and fixed it. The reading and the landing belong to different pieces of work. **Our trace has no way
to tell you that.** It records every document opened and nothing about why, so any story you read off
it — including "this session wasted six hours" — is one you brought with you.

On your hypothesis, the answer is a qualified no. Detail in the last section.

---

## The session

It ran overnight, **from about 10pm to 4:30am**. It was started by another agent rather than by you —
it picked up a handover, not an instruction — and it announced it was working on something called
"forest surface migration", which turns out not to be a real entry in our library at all. So the very
first thing the trace tells us is that the session's own statement of what it was doing pointed at
nothing.

It was working somewhere in the area of the island's ground and forest.

## What it actually did

**The first three and a half minutes: a standing start.** It opened its initiative, re-opened it
twelve seconds later, listed every initiative in flight, and then made **seventeen more opens across
twelve distinct documents** — three neighbouring initiatives, three of them already re-opened once,
and a run of **eight past decisions about twelve seconds apart**. Twelve seconds is not reading. That
is a machine pulling documents to have them, the way you would open eight browser tabs before
deciding which to actually look at.

**Minutes five to fourteen: hunting, and not finding.** **Seven searches back to back in sixty-five
seconds**, with nothing opened between any of them. Then more searches. Across the session it asked
three times for the entire decision log — 463 records — which is the reading equivalent of opening
the filing cabinet and looking at all of it. Of the thirteen genuine ranked searches it ran, **six led
straight to opening one of the results and seven did not.** Something it wanted was not where it
looked.

**A telling detail in the middle of that:** it opened one particular decision **three times in
twenty-four seconds**. That is not three readings. That is one document being paged through — and our
capture cannot tell the difference, because it records that a document was opened and never how much
of it was taken.

**Minutes twenty-two to thirty: circling.** It returned to a single open question **ten times** in
eight minutes, alternating between peeking at the header and opening the whole thing, interleaved
with re-opening two initiatives. This is the most behaviourally interesting stretch in the whole
trace. Something there was either unclear or unresolved, and the agent kept going back to it. If any
part of this trace looks like difficulty, it is this.

**Then a 159-minute hole.** Two and a half hours in which the trace records nothing at all. The agent
was working — editing files, running the gate, reading source code — and **none of that is captured.**
There are four more holes like it: 47 minutes, 18, 12, 11.

**The last half hour: the actual landing.** At minute 348 it opened a decision about a visual effect,
read it four times, then read the decision that had replaced it, then the ceremony for landing work.
At minute 374 the trace stops. Three minutes earlier its change had merged.

**What it landed:** a one-file fix re-pointing a story at a decision that had just superseded the one
it named. Small, and genuinely urgent — the stale pointer was failing a check for *every* concurrent
session on the machine, so it was blocking other people's work, not tidying.

## The most-returned-to documents

| times opened | what it was |
|---|---|
| 14 | the initiative it was working under |
| 11 | a second, adjacent initiative |
| 10 | one open question |
| 8 | a second open question |
| 7 | a decision about the map's camera |
| 7 | a note about generating the surface |

**Forty-five of the 65 documents were opened exactly once.** The picture is a small hot core the
agent kept returning to, and a long tail it touched and left.

---

## What the trace cannot see, stated plainly

This matters more than any number above, because it bounds every conclusion.

- **It only sees our own command-line tools.** Files opened directly, code read, tests run, anything
  done through the harness's own file tools — invisible. A story specification read straight off disk
  leaves no mark.
- **It does not record what was searched for.** The search event stores the *results* and not the
  query. So "what did it look for and fail to find" — the thing you would most want — is not
  recoverable. Only "it searched, and opened nothing from the answer."
- **It does not record how much of a document was taken.** Peeking at one field and reading four
  thousand words look identical. This is why the three-opens-in-twenty-four-seconds pattern cannot be
  told from three genuine readings.
- **It does not record why anything was opened, or what came of it.** There is no notion of a document
  being *used*.

---

## Your hypothesis, tested

> *"i suspect we need some sort of retro that says how useful the adrs are to the task at hand then we
> can potentially use that as signal not sure"*

Three questions, as the increment required.

### (a) Is it answerable from a trace at all? — **No.**

The trace records that a decision was opened. It records nothing about consequence. There is no field
that could carry usefulness and nothing from which it can be derived, because the two candidate
proxies both fail:

- **Re-reading is not usefulness.** The document opened most often in this session was opened three
  times in twenty-four seconds by a pager. Re-reads measure the shape of our output as much as the
  agent's interest.
- **Being cited is not usefulness either** — and this is the interesting one, because I tried it.

I joined what this session **read** against what its landing **cited**, which is the cheapest honest
proxy available. The result:

- It read **33 decisions**.
- Its landing cites **4**.
- **3 of those 4 it had read** — all of them in the **final 26 minutes** of a 374-minute session.
- **1 it cites but never opened**, at least not through any channel we capture.
- **30 of the 33 it read leave no trace in what it produced.**

Read carelessly, that says four-fifths of the reading was waste. It says no such thing. The 30
include decisions read and correctly judged irrelevant — a good outcome, indistinguishable here from
never having read them — and decisions read for the work that occupied the first five and a half
hours and did not land in this window. **A read and a landing are not the same unit of work, so
scoring one against the other measures mostly their misalignment.**

That is a real finding rather than a caveat: the obvious cheap instrument is not merely imprecise, it
is biased in a direction that would make every session look wasteful.

### (b) Is it answerable cheaply? — **No, and the cheap version is worse than nothing.**

A genuine judgement of "was this decision useful to this task" needs something that knows the task,
read the decision, and can say what it changed. That is a model making a judgement call per document
per session — not a query. It would cost roughly what the session itself costs, and it would be an
opinion, not a measurement. The cheap alternative is the citation join above, which is confounded in
the direction that flatters the conclusion you would least want to draw.

### (c) Would it be more informative than the panel today? — **Yes, but that bar is on the floor.**

Today's vertical axis is how far the material sits from the work in the corpus — a fact about how our
library is wired, not about the agent. It answers nothing you asked. Almost any honest signal beats
it. That makes (c) a weak yes and not an argument for building the retro.

**So: the idea does not close as buildable, and it should not be re-proposed from memory in three
months as though it were untried.** What kills it is not cost — it is that the trace has no notion of
consequence, and adding one means asking a model for an opinion rather than reading a record.

---

## What I would actually look at, if we rebuild

Offered as observations from one trace, not a recommendation. The things that *were* legible here,
and that no aggregate would have shown me:

1. **The circling.** Ten returns to one open question in eight minutes is the clearest sign of
   friction in the whole six hours, and it needs no new capture — it is in the data now.
2. **The standing start.** Seventeen opens in three and a half minutes at twelve seconds apiece is the
   shape of orientation, and it is distinguishable from reading by *pace alone*.
3. **The holes.** Two and a half hours of silence sits in the middle of this session. Any picture that
   draws only the recorded events implies the session was reading the whole time, which is the
   panel's quietest lie.
4. **Searches that went nowhere** — seven of thirteen here. Weak on its own, as already established,
   but it is the only live signal we have and it did point at the right stretch.

The one capture change worth its cost, on this evidence, is **recording how much of a document was
taken** — a field peek versus a full read. It is one flag on an event we already write, and it
separates orientation from reading, which is the distinction every other reading here depends on.

---

## Appendix — the identifiers, kept out of the prose above

- Trace: `9838daa7-d977-4d73-a843-aa502080f50e`, worktree slot `keen-goldstine-767135`, origin `cut`
  (predecessor: "forest land session"), declared unit `forest-surface-migration` (resolves to no arc;
  not a library row).
- Window: 2026-09-05T22:12:15Z → 2026-09-06T04:26:43Z (374.5 min).
- Events: 175 — 133 full-payload reads, 17 front-matter reads, 25 searches. 65 distinct nodes, 150
  opens, 45 nodes opened exactly once.
- Landing: PR #1848, `stories/wisp-as-story-claim/story.md`, +13/−2, merged 2026-09-06T04:23:42Z.
- Cited by the landing: ADR-0529, ADR-0045, ADR-0040, ADR-0227. Read in-trace: 0045 (×4, min
  348–351), 0227 (min 352), 0529 (min 362). **ADR-0040 never opened.**
- Most re-opened: `mount-the-land-on-a-real-surface-arc` ×14, `land-ground-stack-arc` ×11,
  `oq-the-map-this-arc-is-improving-is-mounted-nowhere-which-ma` ×10,
  `oq-how-far-does-the-land-treatment-move-onto-the-studios-map` ×8, `adr-0380` ×7,
  `generate-the-surface-not-a-drawing-of-one` ×7.
- Ranked-search follow-through (`library_search` + `library_related`, next-3-reads window): 6 of 13
  led to a read. ⚠ Listing operations (`arc_list`, `adr_list`) are excluded: they return the whole
  inventory — one call here returned 463 of ~465 decisions — so set-membership against them is
  vacuous. A whole-session membership window instead of next-3 inflates this to 24 of 25 and is the
  wrong measure; it is recorded here so nobody recomputes it that way.
- Silent gaps > 10 min, in order of occurrence: 10.5, 159.4, 18.1, 47.0, 11.4, 12.3.
- Opening stretch: 18 events (17 reads + 1 search) over 12 distinct nodes in 3.5 min; the decision run
  `adr-0093 … adr-0521` is 8 reads across 84 s. Longest unbroken search run: 7 in 65 s (min 5.6–6.7).

Sibling documents on this arc, neither of which this one repeats:
`docs/research/traversal-replay-ease-signals-2026-09-05.md` (the five candidate signals, four dead)
and `docs/research/trace-arc-attribution-coverage-2026-09-05.md` (arc attribution coverage).
