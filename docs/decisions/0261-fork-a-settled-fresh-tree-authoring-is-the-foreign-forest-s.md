---
status: accepted
decided: 2026-07-28
arc: foreign-project-forest-arc
---
# ADR-0261: Fork (a) settled: fresh-tree authoring is the foreign forest's first user; brownfield mapping becomes its own arc

## Status

accepted (2026-07-28) — decided/directed by the owner in conversation on 2026-07-28. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask.

The owner was given the fork with both sides argued and the asymmetry named, and closed it: *"Do a1
first then we can do a2 in a different arc."* That is two decisions — a first user (D1) and a home for
the other side (D2) — and both are recorded here.

This settles the first of the three forks ADR-0246 D6 named and deliberately left open, in exactly the
way D6 anticipated: *"at increment time by a plan or a child ADR under this arc, not here."* It is
therefore **not** an `amends` edge on ADR-0246 — D6 operating as designed is not D6 being redefined.
ADR-0246's D6 bullet carries an in-place pointer to this ADR (ADR-0086 curation) so a later reader does
not calibrate to "three forks open".

## Context

ADR-0133 §5 named both shapes of the north star — storytree *"grows a fresh tree or maps an existing
brownfield project for other developers"* — and ADR-0246 D6 recorded that the two *"have different
first users"*, which is why it refused to pick one at charter time. Increments 1 (#977) and 2 (#984)
both routed deliberately around the fork: they made the repo root a parameter and then made that
parameter drivable, which commits to neither side. That runway is spent — the next increment has to
know which side it is building.

### What was measured, at `b8a54d8c`

- **The root is a parameter and is drivable end-to-end.** `resolveRepoRoot` (`packages/library/src/repo-root.ts`,
  precedence explicit > env > module-derived), `NodeBuildOpts.repoRoot` / `NodeResolveOpts.repoRoot` /
  `StoryBuildOpts.repoRoot`, and `serve.ts --repo-root`. `nodeResolve({ repoRoot })` is the free,
  read-only proof surface — no worktree, no leaf, no spend.
- **`decisions:` refs are optional and unenforced.** `packages/library/src/schema.ts:120` declares
  `decisions: z.array(z.number().int().positive()).default([])`, and `packages/cli/scripts/validate-corpus.ts`
  does not reference the field at all. A foreign story can be authored today with no ADR-integer refs
  and nothing rejects it. **This is what takes fork (b) off the critical path** — see D4.
- **ADR-0087's write-scope validator hard-codes storytree's own layout.** It admits only globs rooted
  at `packages/` | `apps/` | `stories/` | `docs/`, so a foreign project laid out as `src/` resolves its
  root and then fails spec load with *"over-broad scope glob"*. Pinned as an executable test in
  `packages/drive/src/repo-root-drivable.test.ts`, which is designed to go red when fork (c) is
  settled. **This is on the critical path for both sides** — see D3.
- **`distribution-posture-arc` has not moved.** Its increment log still holds exactly one entry (#925,
  the charter); the `createPool` mode fork, the seed split, Tier-0 packaging, and the D4 update stream
  are all still not-started. ADR-0246 D2's "shared prerequisites land once, under whichever arc reaches
  them first" therefore still resolves to this arc, as it did for root parameterisation in increment 1.

### The asymmetry that decided it

The two sides are not mirror images. **(a2) is a generator of the artifact (a1) authors by hand.**
Mapping presupposes that a hand-authored foreign tree can exist, be resolved, and be driven to a signed
verdict; the reverse is not true. Choosing (a2) first does not skip (a1)'s work — it defers that work
behind an inference pass whose output has nothing to check it against.

Two further asymmetries point the same way:

- **(a2)'s natural first output is the thing D5 exists to block.** ADR-0246 D5 names *"map a repo,
  render it grey, declare victory"* as the obvious failure mode, and states the arc does not close on a
  foreign repo rendered grey. A mapping increment lands squarely there and needs (a1)'s machinery to
  get out.
- **(a2) has no red→green of its own.** "Did it infer the right tree?" is answered by a developer
  correcting it, not by a test. That is a weak proof leg for a first increment in a system whose whole
  discipline is that green comes only from a signed verdict (ADR-0020 / ADR-0040).

The honest case for (a2) — which is why it is sequenced rather than rejected — is that it is the better
*demonstration*: a developer sees their own codebase as a forest before investing a day describing it.
That is a real adoption argument. It is not the argument that governs *now*, because the current first
users are the inner circle (ADR-0133 §1) and the owner, who are willing to describe a project.

## Decision

**D1 — Fork (a) is settled in favour of (a1) fresh-tree authoring, as a SEQUENCE, not an exclusion.**
`foreign-project-forest-arc` builds toward a developer pointing storytree at their own repo and
authoring a story/capability/contract hierarchy for it, driven to a signed green on that project's own
proof command. (a2) brownfield mapping is not rejected on merit; it is ordered second because it
consumes (a1)'s machinery rather than competing with it.

**D2 — Brownfield mapping gets its own arc, chartered when it is reached — not now.** It is not an
increment of this arc, because ADR-0246 D2's precedent is that an arc owns one coherent question and
scope creep is how the tree question stayed invisible in the first place. It is deliberately **not**
chartered today: an arc chartered with no work scoped and no first increment is the "captured but
unscoped" state ADR-0133 §5 sat in for thirteen ADRs, and a second idle arc competing for attention is
already listed as an accepted cost in ADR-0246. This ADR is the durable record that the direction is
owner-approved; whoever reaches it charters it then.

**D3 — Fork (c)'s class is promoted from open to on-the-critical-path, and is settled by the next
increment — not here.** ADR-0087's write-scope validator (`scopeGlobBoundIssue`,
`packages/orchestrator/src/proof-config.ts`) blocks a signed green for *any* foreign project that does
not share storytree's directory layout, on either side of fork (a). Note the scoping care already
recorded on ADR-0246's References under ADR-0086 curation: this validator is the same *class* as fork
(c) without being literally `repo-manifest.json` or `check:boundaries`, so **fork (c) is wider than its
own wording** and this D3 promotes the class, not just the two artifacts D6 named. It remains a
technical trade-off with a defensible answer, so ADR-0246 D6's routing applies unchanged: it is settled
by increment 3's plan or a child ADR under this arc. What this ADR fixes is only its *priority* — it is
no longer deferrable.

**D4 — Fork (b) stays open and is explicitly OFF the critical path for (a1).** A foreign story can be
authored with no `decisions:` refs at all (measured above: the field defaults to empty and no validator
enforces it), so what replaces ADR-integer refs for a project with no `docs/decisions/` is a question
about *project identity and provenance*, not about reaching a signed green. Increment 3 must not drag
it in. It reappears when `/api/tree` needs a project field, which is the same seam ADR-0246 increment 1
already flagged and declined for this reason.

**D5 — ADR-0246's other decisions are untouched.** D2's arc boundary, D3's deployment-per-forest
tenancy, D4's fenced render core, and D5's proof leg all stand exactly as written. In particular this
ADR does not move any work across the boundary into `distribution-posture-arc`.

## Options weighed and rejected

- **(a2) brownfield mapping first** — rejected on the asymmetry above: it is a front-end on machinery
  that must exist regardless, its first output is D5's named failure mode, and it carries no red→green
  of its own. Its adoption value is real and is preserved by D2, not discarded.
- **(a1) with a thin (a2) inference seed inside the same increment** — rejected: one increment carrying
  both an unsettled proof leg and an unproven generator, against a slow-growth discipline whose
  minimum-to-green here is the authoring path alone.
- **Settle forks (b) and (c) here too, while the owner is in the conversation** — rejected: neither is
  a product-direction call. D6 routes technical forks to a plan or a child ADR at increment time, and
  pre-deciding them from outside the increment that has to live with them is how a decision gets made
  without the measurement that should inform it. D3/D4 record their *priority*, which is what changed.
- **Charter the (a2) arc now, idle** — rejected under D2's reasoning: chartering without a first
  increment reproduces the state ADR-0246 was written to end.

## Consequences

**Good**
- The arc's next increment is unblocked and has a known shape: settle fork (c), author a foreign
  story with its own proof command, drive it to a signed green. That is ADR-0246 D5's closing
  condition reached directly rather than approached.
- The cheap-close failure mode D5 warns about is now structurally out of reach for this arc, because
  the side of the fork whose natural output is a grey tree has been sequenced out of it.
- Fork (b) is fenced off explicitly, so increment 3 cannot quietly grow into project identity.

**Bad / accepted**
- The demonstration value of brownfield mapping is deferred, and with it the "see your repo as a
  forest before you invest" adoption story. That is a real cost, accepted knowingly, and D2 keeps it
  on the record rather than letting it lapse.
- Fork (c) must now be paid by the very next increment, and relaxing ADR-0087's write-scope validator
  touches a fail-closed security boundary — the increment inherits that care cost.
- A future (a2) arc will share prerequisites with this one, so ADR-0246 D2's "lands once under
  whichever arc reaches them first" clause will need applying a third time.

**Neutral**
- `packages/drive/src/repo-root-drivable.test.ts` going red is now imminent and remains the intended
  signal that fork (c) has been settled, not a regression.

## References

- ADR-0246 — the arc's charter; D6 named this fork and routed it here, D5 is the closing condition
  the sequence is chosen to reach, D2 is the boundary this ADR does not cross.
- ADR-0133 §5 — names both shapes of the north star; §1's inner-circle priority is why the first user
  is someone willing to describe a project.
- ADR-0087 — spec-borne write scope; `scopeGlobBoundIssue` in `packages/orchestrator/src/proof-config.ts`
  is the hard-coded-layout validator D3 promotes. ADR-0246's References already record that it is fork
  (c)'s class rather than its literal wording.
- ADR-0020 / ADR-0040 — green comes only from a signed verdict, which is why (a2)'s missing red→green
  is disqualifying as a *first* increment.
- ADR-0110 — owner-directed decisions are born `accepted`.
- ADR-0183 — arcs and plans; the `arc:` provenance stamp on this ADR.
- `packages/library/src/schema.ts:120`, `packages/cli/scripts/validate-corpus.ts` — the measurement
  behind D4.
- `packages/library/src/repo-root.ts`, `packages/drive/src/node-build.ts`,
  `packages/drive/src/story-build.ts` — increments 1 and 2's landed root parameterisation.
- `packages/drive/src/repo-root-drivable.test.ts` — the pinned constraint that goes red when fork (c)
  is settled.
