---
status: superseded
decided: 2026-06-21
amends: [84, 37]
---
# ADR-0086: Librarian-curated ADR lifecycle: supersede authority, copy-on-write edits, searchable load-bearing list

## Status

**Superseded by [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md)**
(2026-06-29) — ADR-0139 reverses this ADR's conclusion that `supersedes_in_part` + an in-prose note is
the clean steady state (see Consequences below), moves the copy-on-write line of §D so that removing
overtaken prose is an in-place correction, and retires the `load_bearing` tag of §E (active ⟺
load-bearing). It restates and keeps in force this ADR's still-true parts: the `adr list` query (§A),
the spawn-`librarian-curator`-at-landing discipline (§B), and the librarian's supersede authority with
the transcribe-not-invent invariant (§C). The body below is preserved unchanged as history.

accepted (2026-06-21) — decided in conversation by the owner, who, worried about ADR bloat and
context-rot for future sessions, directed four changes to the ADR lifecycle (A–E below). Flipped to
`accepted` by an agent under [ADR-0084](0084-agents-may-flip-an-adr-green.md) (an agent may transcribe
an evidence-backed green flip) and this ADR's own decision C — the same self-application
[ADR-0084](0084-agents-may-flip-an-adr-green.md) used (it was "recorded under, and itself flipped by,
the very policy it establishes"). The owner keeps the final say on the reviewed PR (the catch is
observability, ADR-0084 §3). It **amends [ADR-0084](0084-agents-may-flip-an-adr-green.md)** (which
reserved the `→ superseded` flip for humans — the `librarian-curator` may now also perform it as
curation) and **amends [ADR-0037](0037-decision-binding-and-hygiene-gates.md)** (the frontmatter spec —
it adds the `load_bearing` tag, the `adr list` query, and the `load-bearing-live` gate). It overturns no
honesty wall: status stays a PROJECTION of the `## Status` prose
([ADR-0006](0006-event-store-observability-surface.md) /
[ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)), and `green = a signed verdict`
([ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md)) is untouched — this is governance over a
DOCUMENTATION projection, not over a proof.

## Context

The ADR corpus grew fast: **83 ADRs in 18 days (~4.6/day)** by 2026-06-21, **~60% of them refining an
earlier ADR** (36 `amends`, 14 `supersedes_in_part`, 1 `supersedes`). The intended design already
separates concerns — **ADRs are append-only HISTORY** (the justification log), the **live iterating
guidance is the Library artifacts** (~137 of them) + the generated glossary, and `CLAUDE.md` is the
one-read orientation that overrides stale ADR prose. But three seams in that machinery had drifted:

1. **The current-state list was hand-maintained in `CLAUDE.md`.** The "## Load-bearing ADRs" section and
   the "## ⚠️ Current state — READ THE REVERSALS FIRST" reversals block were hand-picked prose that drift
   from the files. A session reads them as authoritative even after they rot.

2. **Status maintenance had a one-sided authority.** [ADR-0084](0084-agents-may-flip-an-adr-green.md) let
   an agent flip `proposed → accepted` but reserved `→ superseded` for humans. So when a session lands a
   decision that overtakes an earlier one, nothing keeps the earlier ADR's `status`/edges honest without a
   human round-trip — and status rot accumulates silently. The smell the owner named: **only 1 of 83 ADRs
   was marked `superseded`, yet `accepted`-green bodies can be partly or wholly overtaken** (the canonical
   dead body is [ADR-0011](0011-own-the-agent-loop-and-context-engineering.md)'s "DBOS/Postgres durable
   execution stands", overtaken by [ADR-0019](0019-library-tier-name-and-defer-dbos.md)). The studio now
   renders a status chip on Library/ADR cards (proposed amber / accepted green / superseded grey) — but
   that chip only does real work if statuses are actively maintained.

3. **"Modify an existing ADR" had no supported, history-preserving operation.** An in-place destructive
   edit of a decided ADR's body would erase the justification history an ADR exists to keep.

## Decision

**A. The current-state / load-bearing ADR list is CLI-searchable, not hard-coded in `CLAUDE.md`.** A new
`storytree adr list` query is derived from the live frontmatter, so it can never drift from the files:

- `adr list --current` — every `accepted`, non-`superseded` ADR (the derived backbone, honest by
  construction), with each ADR's outgoing edges (`supersedes` / `supersedes-in-part` / `amends`) and the
  derived `superseded by` back-edge shown inline, so the reversal story reads off the graph, not prose.
- `adr list --load-bearing` — only the curated set carrying a new **`load_bearing: true`** frontmatter
  tag (`★`): the editorial "calibrate-to-these" highlight a new session must know, co-located on each ADR
  instead of hand-listed in `CLAUDE.md`.
- `adr list --status <proposed|accepted|superseded>` — filter to a status.

The query is read-only and offline (it reads `docs/decisions/` on disk — no DB, no API key). `CLAUDE.md`'s
two hand-maintained sections are slimmed to a pointer at this command.

**B. `session-orchestrator` pushes spawning the `librarian-curator` to keep status flags honest as part of
landing work.** When a session updates or supersedes a decision, the orchestrator's discipline is to
spawn the librarian (the [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) seed-canonical agent) to pull
the relevant ADRs and maintain `status` / edges / the `load_bearing` set — so rot is curated at landing
time, not left for a future session to trip over.

**C. The `librarian-curator` is authorised to UPDATE status flags AND SUPERSEDE ADRs.** This extends
[ADR-0084](0084-agents-may-flip-an-adr-green.md): where that ADR let an agent perform the
`proposed → accepted` green flip and reserved `→ superseded` for humans, the `librarian-curator` may now
ALSO flip an ADR to `superseded` (and record the outgoing `supersedes` edge on the superseding ADR) as
part of curation. **The honesty invariant is unchanged and binding:** status remains a PROJECTION of the
`## Status` prose ([ADR-0006](0006-event-store-observability-surface.md) /
[ADR-0031](0031-real-pass-promotion-and-worktree-deps.md)) — the librarian TRANSCRIBES evidence (the
prose already declares the decision overtaken/dead), it never INVENTS a flip. If an ADR's prose still
reads as a live accepted decision, the librarian must edit the prose first (a substantive change → see D),
never flip the frontmatter alone. The catch is observability, not a pre-flip gate: the studio status
chip, the `supersede-consistency` ADR-health gate (a `supersedes` edge ⇔ a `superseded` status, both
directions), and PR review. Flipping `accepted → proposed` (un-deciding) stays out of scope for any agent.

**D. Modifying an existing ADR is COPY-ON-WRITE for substantive edits; history is preserved.** Re-deciding
— changing the **substance** of `## Context` / `## Decision` / `## Consequences` — does NOT edit a decided
ADR's body in place. Instead: copy it to a NEW ADR (a fresh number allocated atomically per
[ADR-0050](0050-adr-number-allocation.md)), make the change there, mark the new ADR `supersedes` the old,
and flip the old to `superseded`. The old body survives untouched as history, marked dead. **Non-substantive
maintenance stays in-place** (no new ADR): the status flip ([ADR-0084](0084-agents-may-flip-an-adr-green.md)
and C above), fixing or adding an `amends` / `supersedes` edge, typos, references, formatting, and setting
`load_bearing`. The dividing line is "does this change what was DECIDED?" — if yes, copy-on-write; if it is
a projection or a correction, edit in place.

**E. The `load_bearing` tag is gate-enforced.** A new `load-bearing-live` ADR-health check (a GATE-class
check in `pnpm -r test` + CI) fails if any `load_bearing: true` ADR is not `accepted`: a `proposed` one is
not yet current state, a `superseded` one is dead, so neither may carry the calibrate-to-these tag.

## Consequences

**Good.**
- The current-state list is a query over the files, so it cannot drift from them; `CLAUDE.md` stops
  carrying a hand-maintained list that lies. The reversal story is derivable from the edge graph.
- Status stays honest without a human round-trip on every supersession: the librarian maintains it at
  landing time, and the studio chip becomes meaningful (a green chip now means a maintained green).
- "Modify an ADR" is a supported, history-preserving operation — the justification log an ADR exists to
  keep is never destroyed by a re-decision.
- The convention is consistent across its encodings (`CLAUDE.md`, `adr-frontmatter.ts`, `adr-health.ts`,
  the `librarian-curator` and `session-orchestrator` artifacts), all updated alongside this ADR.

**Bad / costs / follow-on (surfaced, not buried).**
- The librarian can now mis-supersede an ADR without a human in the loop. Mitigated by the same catch as
  ADR-0084: visible in the studio chip and the world, gated by `supersede-consistency`, and reverted on
  the PR like any one-line frontmatter change. The residual risk is a status that briefly overstates
  consensus until the owner reviews — judged acceptable for a solo-owner repo.
- The `load_bearing` set is still editorial curation — the drift risk is moved, not eliminated. But it is
  now co-located on each ADR (edit the ADR, not a separate `CLAUDE.md` section), CLI-queryable, and
  gate-checked, which is strictly better than a buried hand-list.
- **The motivating SWEEP found the corpus already clean.** Walking every `accepted` ADR's `## Status`
  prose under the projection invariant surfaced **zero true whole-supersede candidates**: every overtaking
  is correctly recorded as `supersedes_in_part` / `amends` with the still-live core named in the prose, and
  the one whole-dead ADR ([0014](0014-notice-board-feedback-graduates-into-durable-guidance.md)) is already `superseded` by
  [0027](0027-supersede-adr-0014-notice-board.md). The proposed backlog was likewise already cleared
  (no lingering `proposed` ADRs). So this ADR's machinery is **preventive** — it keeps the disciplined
  lifecycle disciplined as the corpus grows — rather than a cleanup of present rot. The execution payoff is
  the `load_bearing` tagging that makes the studio chip and the `adr list --load-bearing` view useful.
- This is the meta-layer (the dev repo's ADRs). It says nothing about the product story-trunk, which stays
  approval-gated ([ADR-0008](0008-ui-drives-agents-approvals.md)).

## References

- [ADR-0084](0084-agents-may-flip-an-adr-green.md) — agents may flip `proposed → accepted` (amended: the librarian may also flip `→ superseded` as curation).
- [ADR-0037](0037-decision-binding-and-hygiene-gates.md) — structured ADR frontmatter + the ADR-health checks (amended: adds `load_bearing`, the `adr list` query, the `load-bearing-live` gate).
- [ADR-0006](0006-event-store-observability-surface.md) / [ADR-0031](0031-real-pass-promotion-and-worktree-deps.md) — status is a projection of evidence (preserved: the librarian transcribes prose, never invents a flip).
- [ADR-0050](0050-adr-number-allocation.md) — atomic ADR-number allocation (a copy-on-write edit allocates the new number through it).
- [ADR-0055](0055-the-library-agent-tier-is-seed-canonical-sync-agents-reconci.md) — the `librarian-curator` / `session-orchestrator` are seed-canonical agent artifacts.
- [ADR-0020](0020-red-green-enforcement-on-the-owned-loop.md) — `green = a signed verdict` (unaffected — this is documentation governance).
- `packages/cli/src/adr.ts` (`adr list`, `renderAdrList`, `loadAdrListings`), `packages/cli/src/adr-frontmatter.ts` (`load_bearing`), `packages/cli/src/adr-health.ts` (`load-bearing-live`) — the code encodings added here.
