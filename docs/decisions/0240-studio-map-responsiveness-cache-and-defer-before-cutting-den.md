---
status: accepted
decided: 2026-07-25
arc: studio-map-responsiveness-arc
---
# ADR-0240: Studio map responsiveness — cache and defer before cutting density

## Status

accepted (2026-07-25) — decided/directed by the owner in conversation on 2026-07-25. Design-time alignment IS the ratification (ADR-0110); no second end-of-flow ask.

**Corrected in place 2026-07-27 per [ADR-0139](0139-the-accepted-adr-set-carries-no-stale-prose-correct-in-place.md), after stages 1 and 2 landed.**
Every decision below STANDS unchanged — the felt cost is re-computation and re-mounting, cache and
defer first and cut density last, cached paint is never cached truth, the density budget is
sequenced here and not designed here. What building stages 1–2 overtook is two CONSEQUENCES: one
that called the early increments "behaviour-preserving", and one whose prescribed staleness guard
turns out to be insufficient on its own. A third bullet is added for a stage boundary stage 2
necessarily crossed. All three are corrected in the Consequences below — truth-maintenance, not a
re-decision. What landed and when is the arc's increment log
(`storytree arc show studio-map-responsiveness-arc --pg`), never tracked here.

## Context

The owner reported that the studio's forest map "takes a while to render" and asked whether in-app
caching would make it feel smoother. A scan of the surface (2026-07-25, dev build, JSON store, 41
stories / 196 capabilities) measured where the time actually goes:

- **The map is serialised behind the Library corpus.** `App` renders nothing until
  `Promise.all([listDocs, listAssets, listComments])` resolves, so `TreeView` does not begin its own
  `/api/tree` fetch until ~470 ms in (warm). `/api/docs` re-reads and parses every markdown file
  under `docs/` (277 files) on every request — 174 ms warm, 9.3 s cold. `/api/assets` ships 561 KB of
  corpus the map itself does not need until the Library drawer is opened.
- **Nothing is cached, at any layer.** No `Cache-Control` or `ETag` on any `/api` route, no client
  cache, no persistence. `readTree` measured directly at 1141 ms cold / 137 ms warm, recomputed on
  every request; the payload is 208 KB.
- **Every return to the map is a full rebuild.** `RouteView` unmounts `TreeView` on any route change,
  so returning re-fetches `/api/tree` and re-runs `buildWorld → buildRelaxedCells → worldToScene`:
  one ~2.0 s main-thread block, with the camera reset.
- **That block is not the DOM.** The map is ~16.6k SVG nodes, but cloning and inserting the entire
  live `.world-camera` subtree costs ~70 ms. The cost is React element/fiber creation plus the scene
  compute — i.e. *re-doing work*, not painting it.

This refines, and does not repeat, the earlier finding that the map is CPU/DOM-bound rather than
GPU-bound: the prior pass (the `SceneView` memo, stable scene identity, idle-frozen age ticker)
already prevents the expensive scene re-walk on a camera update and freezes idle rebuilds, and that
work is intact in `@storytree/app-surface`. It did not coalesce raw pointer input, so the
studio-local frame coalescer can remove redundant camera commits while retaining that protection.
Boot, re-entry, and the unbounded density remain the separately sequenced follow-ons.

The forces: the cheap fixes are studio-local and behaviour-preserving; the fix that actually *scales*
(a density budget / LOD) touches the shared scene graph, which drags the web-engine sync-and-pin
dance and changes what the owner sees on the map.

## Decision

1. **The felt cost is re-computation and re-mounting, not rendering.** Optimisation on this surface
   targets work that is repeated — refetching, recomputing, remounting — before it targets the size
   of what is drawn.
2. **Cache and defer first; cut density last.** The staged order is: keep the map mounted across
   routes → cache and persist the payloads client-side → memoize the server walks and add
   validators → de-serialise the boot so the map's data no longer waits on the Library corpus →
   only then bound the density. The density work is genuinely the only fix whose benefit survives
   the tree growing, but it is sequenced last because it is the only one that changes the shared
   scene graph and what the owner sees.
3. **Cached paint is never cached truth.** Every cache on this path is paint-then-revalidate: the map
   may paint instantly from a previous payload, but it always refetches and reconciles, and proof
   state (crowns, verdicts, claim and build wisps) is never presented as current on the strength of a
   cache alone. The existing store-health honesty (the load screens, the banner, the "asleep vs
   fault" distinction) is not weakened to make a boot look faster.
4. **The density budget is sequenced here, not designed here.** What gets capped, culled, or dropped
   below a zoom threshold is a separate decision, taken when that increment is planned, because it
   is an owner-visible change to the world's look.

## Consequences

- The first increments are studio-local and land through the ordinary gate without an owner look —
  the map should simply stop rebuilding. *(Corrected in place per ADR-0139: "behaviour-preserving"
  was too strong, and decision 3 is why. A cached first paint is only honest if it SAYS it is
  provisional, so stage 2 necessarily added an operator-visible badge over the map — "Showing your
  last visit — checking for changes…" — which clears on a successful revalidation and deliberately
  persists on a failed one. It still landed through the ordinary gate. The correction is the
  expectation, not the gate: a stage on this path should expect to add a visible state, not assume
  invisibility.)*
- Persisting payloads client-side introduces a staleness surface that did not exist before: it has
  to be version-stamped, or a schema-changing merge will paint a stale shape into a new client.
  *(Corrected in place per ADR-0139: the guard this bullet prescribed — "version-stamp it against
  the server's code stamp, already exposed on `/api/health` for the version-skew banner" — cannot
  do that job by itself,
  because `code.head` arrives only after a network round-trip, i.e. after the very first paint it
  would have to gate. As built, the PRE-PAINT guards are a client stamp that moves with the bundle
  plus a structural shape check, both decidable synchronously; the server code stamp is the
  post-hoc EVICTOR that discards an entry recorded under a different head, and a boot that catches
  its own entry stale that way stops re-writing for the rest of that boot. Any later stage that
  persists something client-side needs the same split — a synchronous guard for the paint, the
  server stamp for eviction.)*
- *(Recorded in place per ADR-0139, after stage 2.)* The stages are sequenced, not sealed. Stage 2
  necessarily took the `/api/docs` third of stage 4's de-serialisation with it: a cache that seeds
  the docs payload cannot sit behind the all-or-nothing boot `Promise.all` that withheld it, so
  `/api/docs` is now fetched in its own effect, independent of the readiness gate. What stage 4
  still owns is the remaining pair — the map mounts only once `/api/assets` (the 561 KB it does not
  need) and `/api/comments` resolve.
- Server-side memoization of the `stories/` and `docs/` walks means an edit on disk is no longer
  guaranteed to be visible on the next request; invalidation has to key on directory mtime, and the
  dev loop is where that will bite first.
- The density increment will require a web-engine sync and pin bump, and an owner attestation of the
  look, so it should not be attempted opportunistically inside a caching increment.
- The map remains SVG. Nothing here proposes a renderer change; the measured DOM cost (~70 ms for
  16.6k nodes) does not justify one.

## References

- Arc: `studio-map-responsiveness-arc` (`storytree arc show studio-map-responsiveness-arc --pg`).
- ADR-0042 (hosted studio) — the caching decisions apply to the members deployment, not just local dev.
- `apps/studio/src/App.tsx` (the boot gate), `apps/studio/server/apiRouter.ts` (`readTree`, `listDocs`),
  `apps/studio/src/components/TreeView.tsx` (the world/scene memos), `@storytree/app-surface`
  (`SceneView`, already memoized).
- `apps/studio/src/lib/payloadCache.ts` — what stage 2 built: the persisted entry and its three
  guards (client stamp / server code stamp / structural shape), and what it deliberately never
  persists (the mutable reads, and the `builds`/`claims` coordination seeds — ADR-0128/ADR-0138
  wisps are never restored from a previous load).
