# Arc surface — mock round (`arc-orientation-surface-arc` increment 2)

Four mock options for the map's primary top-drawer slot, which ADR-0267 D1 reassigns from the
Library lens to arcs. **Nothing here is built.** This round exists so the owner can pick a direction
by looking at renders rather than by answering abstract questions; the build is a later increment.

Open [`index.html`](index.html) in a browser — self-contained, no build step, no server, no network.

## What is in here

| File | What it is |
| --- | --- |
| `index.html` | The deliverable. Four interaction diagrams + four working mocks + the `blocked` comparison + the three questions. Data is inlined, so the file opens straight off disk. |
| `arc-data.json` | The raw extract the mocks are drawn from — every active arc's rollup as `loadArcRollups()` returned it on 2026-08-02. Committed so the mocks' claims are auditable. |

## Grounded in real data, deliberately

Every arc in every mock is real. The extract came from `loadArcRollups()`
(`packages/drive/src/arc-rollup.ts`) against the live Cloud SQL store — the same join that backs
`storytree arc show` and `GET /api/arcs`, so the mocks render exactly what a built surface would
have to render.

This is the round's main failure mode and it was designed against: a layout that reads beautifully
with three invented arcs and collapses at seventeen real ones would mislead the pick. So the mocks
carry the ugly cases on purpose —

- **17 active arcs** (not the 16 the brief assumed — `act2-intro-forest-regrow-arc` landed in
  between), plus 15 closed ones correctly hidden by ADR-0239's active-only default.
- **Increments range 0 to 42.** `grounded-art-machinery-arc` has 42 and
  `verification-integrity-arc` has 29, while three arcs have never landed anything at all. Any
  per-increment glyph has to survive that ratio inside one viewport.
- **Titles range 19 to 72 characters**, so truncation behaviour is visible rather than assumed.
- **Recency is bimodal** — seven arcs moved within 48 hours, five have been quiet a week or more.

## The four options

Each answers a different question *first*, and each proposes its own answer to ADR-0267 D3 (where
the Library goes, left open by that ADR).

| | Answers first | Library becomes |
| --- | --- | --- |
| **A · Triage board** | Which arcs need me, in what order? | A toggle in the drawer header |
| **B · Momentum lanes** | What is moving, what has quietly stopped? | A second lens on the same time axis |
| **C · Reading room** | What was this arc about again? | A row in a universal index |
| **D · Contact sheet** | How much is in the air? | A tile among the arcs |

Clicking any arc in A, B or D opens its briefing in C, so the options compose rather than compete —
a build could take one layout's index and another's detail pane.

## Two honesty problems the mocks confront rather than hide

**1 · The `waiting` state cannot occur today, and the reason has moved.** The brief said the
open-question tier is empty after ADR-0267 D5 retired `oq-diff-view-altitude`. That is now stale:
there is exactly one live open question, `oq-public-live-forest-on-the-website`, authored 2026-08-02
during the Act 2 attestation. But it carries **no `arcRef`** — verified against the stored doc — and
under D4 the arc→question view is derived purely from that edge. So no arc surfaces it, and
`arc show` still prints "(none)" seventeen times out of seventeen. The tier is not empty; it is
*unhomed*, which is a sharper finding than emptiness and feeds directly into question 3.

Consequently **every `waiting` arc in the mocks is driven by synthetic questions**, marked in purple
with a dashed border wherever they appear. Nothing purple is real.

**2 · `blocked` has no definition and none was invented here.** D7 names the state and deliberately
declines to define it; increment 1 fenced its absence with a test. So `index.html` ships a *switch*
rather than a predicate: three candidate meanings that can be computed from what is already stored,
each showing exactly which real arcs it would light up, with a control that re-sorts the mocks live.

| Candidate | Meaning | Lights up today |
| --- | --- | --- |
| B1 undecided | An ADR stamped to this arc is still `proposed` | 1 arc |
| B2 never started | Chartered, zero increments landed | 3 arcs |
| B3 gone quiet | Nothing landed in more than 7 days | 5 arcs |
| B4 waiting on you | The session halted on an owner decision | ~5, **not derivable** — needs new authored state |

**And one thing deliberately not drawn: a progress bar.** ADR-0267's Context says outright that "a
percentage-complete bar would answer none of that", and an arc has no denominator — `endState` is
prose, not a checklist. "What step are they up to" is rendered instead as a three-part position
read: **distance** (one pip per landed increment), **momentum** (days since the last landing), and
**next** (a `ready` plan, a `proposed` ADR, or nothing queued).

## Read-only, per D6

No mock has a comment affordance, an answer field, or any write path. Questions are found here and
answered elsewhere, exactly as D6 stages it.

## What the owner is asked to settle

Stated in full, with concrete alternatives and a non-binding lean, in section 06 of `index.html`:

1. **Which layout**, and how the Library is reached as the secondary surface.
2. **What `blocked` should mean** — as a pick between the candidates above, not an open prompt.
3. **Whether the orchestrator must author an open-question briefing when it escalates.** This is the
   genuinely unsettled fork from ADR-0267, and it decides whether the surface ever has content:
   agents escalate in chat today, which is why the tier holds one question and no arc can see it.
   Section 05 dissects the retired `oq-diff-view-altitude` — recovered from git at `4337959a` — as
   the worked example of a briefing that can be answered cold.

## Regenerating the data

The extract was produced by a throwaway script (deleted after use) that called `loadArcRollups()`
with `decisionsDir: docs/decisions` and `storiesDir: stories`, then trimmed prose fields for size.
`storytree arc list --pg` and `storytree arc show <id> --pg` give the same view interactively.
