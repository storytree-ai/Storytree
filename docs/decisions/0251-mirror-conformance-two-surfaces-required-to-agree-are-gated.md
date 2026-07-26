---
status: accepted
decided: 2026-07-26
arc: verification-integrity-arc
---
# ADR-0251: Mirror conformance: two surfaces required to agree are gated by a test that compares them

## Status

accepted (2026-07-26) — decided/directed by the owner in conversation on 2026-07-26, as increment 2 of
the `verification-integrity-arc` charter. The arc's end state names the answer in the owner's own
terms: "any two surfaces required to agree are gated by a test that compares them rather than by a
convention that someone will remember", realised as "a cross-surface conformance harness (studio vs
desktop over one fixture, with studio-only fields as an explicit allowlist)". Design-time alignment IS
the ratification (ADR-0110); no second end-of-flow ask. What this ADR settles beyond that direction is
the *shape*: where the harness runs, how it stays fail-closed, and how the allowlist is kept honest.

## Context

storytree deliberately keeps two implementations of the same route algorithm. The desktop backend
(`apps/desktop/src/backend/boot-read-routes.ts`) re-composes a SUBSET of the studio's `/api/*` route
table over its own `node:fs`, and may never import `apps/studio/server` — ADR-0176's one-wired-backend
rule, enforced by `check:boundaries`. The duplication is the decision, not an accident: the desktop
ships the *same compiled studio SPA* but must own its own backend.

Duplication that is required to agree, with nothing gating the agreement, drifts. It did. Commit
`71f68d2b` folded `parseAdrWireSignals` into the studio's `listDocs` — adding `loadBearing` and the
resolved lineage-edge `references` to each Decisions `DocMeta` (ADR-0187 dec 3) — and left the
desktop's hand-written copy untouched. Measured over the real `docs/` tree on 2026-07-26, and
cross-checked against a raw frontmatter scan that does not depend on either implementation being
right: **88 ADRs lost `loadBearing` and 168 lost `references`** on the desktop. Everything else
matched exactly — same 287 entries, same order, same `title` / `group` / `excerpt` / `status` /
`decided` — so the drift is precisely the missing fold and nothing else.

The consequence is not symmetric across the two fields, and the distinction matters for calibration:

- `loadBearing` has a LIVE reader. `resolveSelectionDetail` (`apps/studio/src/lib/selectionDetail.ts`)
  carries it onto the Library selection card, which renders the load-bearing badge
  (`LibrarySelectionCard.tsx`). On the desktop that badge simply never appeared. A real, shipped,
  user-visible divergence.
- `references` has NO live reader today. Both `importanceOf` (`overviewConstellation.ts`) and
  `buildFocusGraph` (`focusGraph.ts`) walk `GuidanceAsset.references` only, and
  `LibraryOverview.test.tsx` positively pins doc out-degree at 0. So the ADR constellation computes
  out-degree 0 on every doc *in the studio too*: that is a studio-side gap, not a desktop divergence.
  The desktop's missing `references` is a latent payload divergence that lights up the moment a reader
  lands.

This correction is itself the arc's method working as chartered — the charter warns that three of the
audit's four headline aggregate findings were refuted on adversarial inspection, so a defect is not
reported without a concrete failure scenario. The measured field counts held; the rendered consequence
of one of them did not.

The forces on the fix:

1. **Extracting the shared walk into a package would end the drift class outright** — and is refused.
   The two-backend split is ADR-0176's decision, and the desktop's independence from
   `apps/studio/server` is the property being protected. A harness must encode that boundary, not
   dissolve it.
2. **A test in one app's suite would have to import the other app's source.** Cheap, and the
   `storage-protocol/parity` precedent makes test-only cross-imports sanctioned scaffolding — but it
   points the wrong way for a rule whose whole content is "these two do not import each other".
3. **The affected-only PR scope (ADR-0195) narrows typecheck+test to changed projects plus their
   dependents.** `apps/studio` and `apps/desktop` are independent projects, so a test living in either
   suite would NOT run on a PR that edited only the other. A harness that fences half the class on
   half the PRs is the kind of check that looks healthy from outside — the exact failure shape this
   arc exists to close.

## Decision

**A ROOT gate, `pnpm check:mirror-conformance`, runs each surface's own probe in its own process over
one shared input and diffs the decoded JSON.** Sibling of `check:boundaries` / `check:manifest`, wired
into `pnpm gate` and into CI's `verify` job.

1. **Per-surface probes, no cross-imports anywhere.** `apps/studio/server/docsMirrorProbe.ts` and
   `apps/desktop/src/backend/docs-mirror-probe.ts` each import ONLY their own surface's module, take
   docs directories as argv, and print `{ [dir]: DocMeta[] }`. Each runs with its own app dir as cwd,
   so its bare specifiers resolve through its own `node_modules`. Neither surface imports the other at
   build time or run time; the comparison is made by a third party on plain data. This is why the gate
   lives at the root rather than in either app's suite.

2. **A ROOT step, deliberately OUTSIDE the ADR-0195 affected narrowing.** Drift is introduced by
   editing EITHER surface, so the check must see both on every PR. Placing it with the unconditional
   root checks is load-bearing, not incidental placement.

3. **A pure judge owns every rule** (`packages/cli/src/mirror-conformance.ts`, unit-tested without
   spawning anything): same entry set, same ORDER (the payload is an ordered array both sides sort),
   and every field JSON-equal — with an ABSENT key distinguished from a falsy value, because the
   studio omits `loadBearing` entirely rather than emitting `false`.

4. **Sanctioned differences live in a SELF-PRUNING allowlist.** A spec's `referenceOnlyFields` is
   where a deliberate difference is declared, and the judge fails a stale entry both ways: a field the
   mirror actually emits, or one the reference never emits, is itself a divergence. An allowlist
   nobody prunes decays into a blanket exemption — the arc's "an advisory list stays readable or stops
   being advisory" rule. For `/api/docs` the list is EMPTY: the desktop serves the same compiled SPA,
   so every field the studio emits has a reader there too.

5. **Two inputs, and never vacuous.** Each mirror is compared over a synthetic fixture (covering
   branches the corpus may not contain: an unresolvable lineage edge, an explicit `load_bearing:
   false`, an unterminated frontmatter block, a doc with no H1, an over-long first sentence, a nested
   Decisions doc, a non-`.md` file) AND over the repo's real `docs/` tree, which catches what the
   corpus exercises and the fixture author did not think of. The real-tree comparison is stable under
   content changes because the assertion is equality between two implementations over the same input,
   never against a recorded value.

6. **Fail-closed, verified by mutation.** A probe that dies, prints unparseable output, or returns an
   EMPTY payload for a known-non-empty input is a FAILURE, never a skip — two silent surfaces agree
   perfectly. Both paths were mutation-tested rather than asserted: a probe forced to `exit(3)` and a
   probe forced to return `[]` each drove the gate red.

**And the demonstrated defect is fixed:** `boot-read-routes.ts` now re-composes `parseAdrWireSignals`
verbatim and folds `loadBearing` + the resolved `references` onto each Decisions `DocMeta`, with a
desktop-side unit test pinning the behaviour where the code lives.

## Consequences

- The `71f68d2b` drift would have been caught at the commit, on the PR, by a root step that no affected
  filter can narrow away. Demonstrated red→green: the harness reported 256 divergences over `docs/`
  (168 `references`, 88 `loadBearing`) plus 4 over the fixture before the fix, and zero after.
- The desktop Library selection card now renders the load-bearing badge it never rendered.
- **Adding a mirrored route now costs a row** in the `MIRRORS` registry plus a probe pair. That cost is
  the point: it is charged at the moment the drift class opens, which is the moment it is cheapest to
  pay. `desktop-backend-mirrors-studio-routes-subset` records that a future desktop 404 is most likely
  a newly-added studio fetch — this ADR extends that from "route present" to "payload equal".
- The gate spends two `tsx` process spawns (~2-4s). Accepted: it runs once per gate, not per test.
- **What this does NOT cover.** Only `GET /api/docs` is registered today. The other mirrored reads
  (`/api/me`, `/api/docs/content`, `/api/comments`, and the `local-backend.ts` seam routes) are
  unregistered, so their drift is still ungated. `/api/docs` was chosen because it is where drift was
  demonstrated; the registry exists so the rest is an increment, not a redesign. Stating the gap
  explicitly is the arc's no-silent-caps rule.
- **`DocMeta.references` still has no reader** — in either surface. The fold is now consistent across
  the mirror, but the ADR constellation's doc out-degree stays 0 until a studio-side reader lands.
  That is a studio gap, recorded here so a later session does not rediscover it as a desktop bug.

## Reconciliation with ADR-0252 (authored concurrently)

ADR-0252 landed on `main` (#939) while this increment was in flight, settling the same arc's open
owner fork on the detection pass. It lists **"mirror-pair drift"** among four cheap mechanical checks
that should run on every `pnpm gate` as **non-blocking warns**, on the measured ground that aggregate
metrics refuted 3 of this audit's 4 headline findings (~75% false positive), so "a metric threshold is
never itself a finding and a BLOCKING gate would be wrong on the measured evidence".

Non-blocking **per finding** — not "the advisory family can never block". ADR-0252 D3 also puts a fixed
drain ceiling on the total COUNT, so that family reds the gate on backlog GROWTH even though no single
signal ever does. `pnpm check:verification-decay` (2026-07-27) is that family's first instrument and
carries the ceiling.

`check:mirror-conformance` BLOCKS. That is not a departure from ADR-0252, because it is not a metric
sweep. ADR-0252's advisory posture is calibrated to **heuristics that locate regions** — a threshold on
a count, which needs an adversarial second phase before it is a finding. This check makes an **exact
equality assertion between two implementations over the same input**: a reported divergence is a
defect by construction, with nothing to adjudicate and no false-positive surface. Its output is not a
score to be interpreted; it is a diff. An exact assertion that cannot be wrong should block, exactly as
`check:boundaries` does.

The two are complements, and the boundary between them is the registry: this gate proves the mirrors
it KNOWS about, and is silent about the ones it does not. The unregistered-pair problem — finding
mirrored routes nobody added a row for — is a discovery heuristic, has a real false-positive surface,
and is precisely what ADR-0252's advisory "mirror-pair drift" sweep should cover. Whoever builds it
should treat this registry as its target: the sweep's job is to find pairs missing from `MIRRORS`,
not to re-derive what `MIRRORS` already proves.

That sweep now has a concrete home: the instrument registry in
`packages/cli/src/check-verification-decay.ts`, where adding it is a row rather than a redesign. It is
**not built** — only `contract-binding-drift` is — and that file says so.

## References

- ADR-0176 — one wired backend: the desktop re-composes, never imports, `apps/studio/server`.
- ADR-0187 dec 3 — the ADR wire signals (`load_bearing` + resolved lineage edges) folded onto `DocMeta`.
- ADR-0195 — the affected-only PR scope this check is deliberately placed outside of (0195 already
  states that every `check:*` step stays unconditional, so this placement is consistent with it, not
  an amendment to it).
- ADR-0252 — the same arc's detection-pass decision, authored concurrently; see the reconciliation
  section above for why an exact cross-surface assertion blocks while a metric sweep warns.
- ADR-0249 — increment 1 of this arc: evidence that cannot be attributed to the observation that
  produced it is not evidence. The same instinct shapes this harness's `where` labelling and its
  refusal to treat a silent probe as a pass.
- ADR-0074 / `check:boundaries` — the organism-boundary gate this one sits beside.
- `packages/cli/src/mirror-conformance.ts` (judge) · `check-mirror-conformance.ts` (gather) ·
  `apps/studio/server/docsMirrorProbe.ts` · `apps/desktop/src/backend/docs-mirror-probe.ts`.
