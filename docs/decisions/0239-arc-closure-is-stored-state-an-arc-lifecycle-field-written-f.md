---
status: proposed
amends: [183, 196]
arc: arcs-and-plans-arc
---
# ADR-0239: Arc closure is stored state: an arc lifecycle field, written from a terminal increment, filtered by default in arc list

## Status

**proposed** — raised by an owner-directed arc audit on 2026-07-25 that found 9 of 15 live arcs had
reached their end state (several saying so verbatim in their own final increment) while every one of
them still read as outstanding. The owner has **not** directed a decision here: this ADR records the
fork and the recommendation for ratification.

**Amends** [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) (D1's
authored-mutation set and D3's "the arc is never otherwise edited" rule gain exactly one more
mutation: the closing transition) and
[ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) (D2 already *authorised* an arc
close-state write "only where a surface needs to WRITE the transition"; this ADR names the surface,
the field, and the write path). Neither is overturned.

## Context

### The observed failure

`storytree arc list --pg` returns 15 arcs. On reading each one's end state and increment log, **nine
had already reached their end state** — several had said so explicitly in their own last increment:

- `library-tech-tree-overlay-arc` (#736): "THE ARC'S END STATE IS MET AND ITS PLANNED INCREMENTS
  CLOSE HERE"
- `noticeboard-claim-ledger-arc` (#767): "THE ARC'S END STATE IS REACHED … the arc CLOSES"
- `desktop-terminal-pivot-arc` (#705): the owner reviewed and closed it

Every one still rendered as outstanding. Closing entries were appended to all nine on 2026-07-25
(forest-parcels, sprite-art-sheets, library-tech-tree-overlay, noticeboard-claim-ledger,
studio-hud-chrome, terminal-orchestrator-seat, desktop-terminal-pivot, graduation-park-lease,
arcs-and-plans) — but that was a **manual owner-directed sweep, not the process working**, and the
sweep changed nothing a machine can read: `arc list` still renders those nine identically to the six
live ones.

### Why the process did not close them

Not "sessions skipped a step". **There is no step, and no mechanism to perform it with.**

1. **The merge ceremony never mentions arcs at all.** The authoritative `merge-ceremony` process
   artifact (sync → gate → commit → push → non-draft PR → stop → branch-dies) contains no arc step
   in any form.
2. **The one place arcs appear at landing forecloses closure.** The `session-orchestrator` workflow
   step 6 reads: *"Landed an arc increment? APPEND the arc's increment-log entry … and flip the
   consumed plan's `status` to `consumed` (a drifted one to `superseded`); **the arc is never
   otherwise edited when children land (D3)**."* A session following this correctly appends an
   increment and stops. The clause is right about children being born; applied at landing it also
   rules out the only mutation that could record closure.
3. **No other role owns it.** `librarian-curator`'s workflow curates the decision log and graduates
   memory — no arc duty. `planner` reads the arc's increment log to scope the next increment — it
   never closes one. No gate checks arcs (`pnpm gate` has `check:friction-drain` for the friction
   worklist; there is no arc equivalent).
4. **A scan of the whole live guidance corpus confirms it**: across all 213 non-arc/plan/friction
   live docs, the only `arc` + `close` matches are *descriptive* — the `arc` definition ("tracked to
   a closed end-state") and `template-arc` ("what closed looks like"). **Zero** instruct anyone to
   record that closure has happened.
5. **And there is nothing to write it with.** The `arc` schema
   (`packages/library/src/knowledge.ts` — `KIND_SPECS.arc` ≈ L523, `Arc` ≈ L910) carries `intent`,
   `endState`, and the `increments` log. No status field. The CLI's write verbs are `arc edit
   --intent/--end-state` and `arc increment add` — no close verb, no flag. Closure is expressible
   *only* as prose inside an increment.

So the honest classification is **(c) there is no mechanism to say it with**, compounded by (a) the
ceremony omitting it. The nine authors did not skip a step — several did the most the machinery
allows, wrote "the arc CLOSES" into an increment, and that was the end of what the system could hear.

### Was closure designed in and lost?

**Half designed, then conditionally deferred — twice.**

- **ADR-0183 designed the closed end-state as a concept, not a state.** D1 defines an arc as an
  intent "tracked through an increment log to a **closed end-state**", and makes `endState` a
  required field ("what closed looks like — the observable condition under which the arc is
  delivered and its increment log stops"). But D1's authored-mutation set is intent edits + increment
  appends only. There is no transition and no field: the arc can *describe* its closed condition and
  can never *report* meeting it.
- **ADR-0196 then decided the state should exist — and deferred the write.** Its D1 table maps
  `arc (epic)` → `active` = "in flight", `archived` = "closed", and D2 says verbatim: *"**Arc close
  becomes visible state instead of increment-log prose**; … a stored `lifecycle` field for kinds
  that have NO stored state today lands with the build **only where a surface needs to WRITE a
  transition (arc close)**, not speculatively."*
- **The build honoured the deferral literally.** `packages/library/src/lifecycle.ts:62-63` is
  `case "arc": return "active";` — a hardcoded constant with no input to read. Its capability spec
  (`stories/library-tech-tree-overlay/library-lifecycle-wire.md:162-164`) states the reasoning:
  *"`arc` → `active` (in flight). D2: an arc's CLOSED-state write lands only when a surface needs to
  WRITE the transition — this projection returns the in-flight default and NEVER invents an
  `archived` an absent field can't witness."*

The projection is correct and was correctly built. No surface ever came back to ask for the write, so
the closed half of ADR-0196's own arc row has been unreachable since 2026-07-14.

### The actual cost

Both reading surfaces are blind, in opposite directions:

- **CLI**: `arcList` (`packages/cli/src/arc.ts:104-115`) renders id, increment count, last landing
  date/PR, title. No state column, no filter. A closed arc and a live one are the same row. Contrast
  `arc show`, which *does* print plan state (`[consumed]`) — plans have a lifecycle; their owning arc
  does not.
- **Studio**: `LibraryFinder` (ADR-0197) has one three-state selector defaulting to `open`. Arcs
  project `active` unconditionally, so **no arc is ever visible in the default view, and no arc can
  ever appear under `archived`.**

The outstanding-work view therefore rots silently and only a manual audit can detect it — which is
exactly what happened, at a cost of reading 15 arcs end to end.

## Decision

**Proposed (not ratified).** Make arc closure stored state, written only from evidence, and filtered
by default:

### D1 — A stored `lifecycle` field on `arc`, fail-closed enum

Add `lifecycle: z.enum(["active", "closed"]).default("active")` to the `Arc` schema as `.extend()`
metadata (the `increments` / `plan.status` precedent — schema-level, not a `KIND_SPECS` body field,
so it never round-trips through markdown). Optional-with-default, so every existing arc validates
with no `CURRENT_SCHEMA_VERSION` bump and no migration.

Name and vocabulary follow **ADR-0196 D2 verbatim** ("a stored `lifecycle` field"), and the values
are the two an arc can actually be in — an arc has no `open` state (D1's table: `arc` has no `open`
column). `lifecycleOf`'s `arc` branch reads it: absent/`active` → `active`, `closed` → `archived`.
The projection stays the single home of the mapping (**ADR-0196 D4**: any new stateful kind MUST
route through it — a second ad-hoc status surface is the failure that ADR exists to end).

### D2 — The flip is a projection of the prose, never an invented state

`storytree arc close <id> --outcome <text|@file> [--pr <ref>] --pg` — one verb that **atomically
appends the terminal increment and sets `lifecycle: closed`**. The outcome is required: an arc cannot
go closed without a terminal increment stating the observable end-state condition it met. This is the
ADR-0084/0086 discipline applied unchanged — status is a projection of prose that supports it, never
a free flip — and it is why a bare `--set lifecycle=closed` must be refused.

Re-opening (`closed → active`) is **owner-only**, mirroring ADR-0084's human-only `accepted →
proposed` un-deciding: an agent may recognise that an end state was met; deciding it was not is the
owner's call.

### D3 — `arc list` filters by default

`storytree arc list` shows `active` arcs only, prints a muted `(N closed — --all)` footer, and gains
`--all` / `--closed`. `arc show` always renders any arc and displays its lifecycle. This is what makes
the rot self-correcting: an arc that was never closed keeps appearing in the default worklist, so the
omission is visible weekly instead of at audit time.

### D4 — The ceremony gains exactly one clause, via guidance-curator

Step 6's arc sentence extends to: *if this landing meets the arc's `endState`, run `arc close`
instead of `increment add`.* The "never otherwise edited" rule stands for children being born (D3's
actual subject); closure is named as the one further authored mutation, alongside intent edits and
increment appends. Authored through **guidance-curator** against the library artifacts
(`session-orchestrator`, `merge-ceremony`, the `arc` definition), never by hand-editing the generated
CLAUDE.md region.

### D5 — Backfill the nine, no gate

The nine arcs closed by the 2026-07-25 sweep get `lifecycle: closed` set from their existing terminal
increments (the prose that justifies the flip is already written). **No `check:arc-*` gate is
proposed** — ADR-0183 D6's anti-ceremony rule and ADR-0168's retro-theater lesson both apply; D3's
default filter is the backstop, and it costs nothing to comply with.

### Options weighed, and why the others lose

- **(b) a derived/closed filter alone** — deriving closure by pattern-matching increment prose for
  "CLOSES"/"end state met" is precisely the invented flip ADR-0084/0086 forbids, in its most fragile
  form (a regex over free text deciding an initiative is done). It also cannot express the nine
  arcs whose closure was decided by an owner in conversation. Rejected as the *sole* mechanism; D3
  keeps the filter, reading a stored field instead of guessing.
- **(c) prose only + a ceremony fix** — cheapest, and insufficient: it leaves both reading surfaces
  exactly as blind as they were on 2026-07-25. The nine authors mostly *did* write the prose; the
  audit still had to happen. Ceremony without a mechanism is the state that produced this finding.
- **Reusing `plan`'s five-state enum** — over-modelled for an artifact with two states, and
  ADR-0196 D2 already judged that enum surface-level over-engineering.

### Why a stored field does not violate ADR-0183 D4

D4 bans **implementation surface** (file lists, package names, ordering) from durable artifacts
because surface rots. A closed flag is not surface — it is *state*, and D1 says in terms that an arc
"holds **state** and pointers only". A two-value lifecycle cannot go stale in the way a file list
does: it is set once, from evidence, at the moment the end state is met.

## Consequences

**Good.** The outstanding-work view stops rotting: `arc list` is a real worklist, and the studio's
`archived` state becomes reachable for arcs (today it is unreachable by construction). ADR-0196's arc
row becomes true instead of aspirational, through its own single projection. Closure becomes cheap
and evidence-bound — one verb, one required outcome — so the recognition step has somewhere to land
at the moment a session notices it. Zero migration; zero new gate.

**Bad / costs.** One more authored arc mutation, against ADR-0183's ceremony-light intent — bounded
to a single terminal verb, but real. A session must still *recognise* that an end state was met;
nothing forces that judgment, so a missed closure is still possible — D3's default filter makes it
visible rather than silent, which is the honest limit of this proposal. And the `lifecycle` /
`status` vocabularies now coexist across kinds until ADR-0196 D4's deferred rename (default: never)
— accepted knowingly, since `lifecycleOf` remains the single mapping.

## References

- [ADR-0183](0183-arcs-contain-plans-the-initiative-overlay-upstream-of-storie.md) D1/D3/D4/D6 (the
  arc kind, its authored mutations, the surface rule, the anti-ceremony guard),
  [ADR-0196](0196-unified-artifact-lifecycle-open-active-archived.md) D1/D2/D4 (the universal
  lifecycle, the deferred arc-close write, the single-projection rule),
  [ADR-0197](0197-lifecycle-selector-open-by-default-one-three-state-toggle-go.md) (the studio
  selector that defaults to `open`),
  [ADR-0084](0084-agents-may-flip-an-adr-green.md) /
  [ADR-0086](0086-librarian-curated-adr-lifecycle-supersede-authority-copy-on.md) (status is a
  projection of the prose; un-deciding is human-only),
  [ADR-0168](0168-session-retro-friction-every-session-feeds-friction-to-the-l.md) (why no
  compliance gate).
- Code: `packages/library/src/knowledge.ts` (`KIND_SPECS.arc` ≈ L523, `Arc` ≈ L910),
  `packages/library/src/lifecycle.ts:62-63` (the hardcoded `arc → active`),
  `packages/cli/src/arc.ts:91-116` (`arcList`, no state column), `packages/cli/src/arc.ts:259-357`
  (`arcEdit` / `arcIncrementAdd` — the only arc write verbs),
  `apps/studio/src/components/LibraryFinder.tsx:60` (selector defaults to `open`).
- `stories/library-tech-tree-overlay/library-lifecycle-wire.md:162-164` (the capability spec that
  recorded the deferral).
- Owner-directed arc audit, 2026-07-25; the nine closing increments are readable via
  `storytree arc show <id> --pg`.
