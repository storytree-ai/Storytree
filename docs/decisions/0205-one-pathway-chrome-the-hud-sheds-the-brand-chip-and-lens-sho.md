---
status: accepted
decided: 2026-07-17
amends: [204]
arc: studio-hud-chrome-arc
---
# ADR-0205: One-pathway chrome: the HUD sheds the brand chip and lens shortcuts

## Status

accepted (2026-07-17) — decided/directed by the owner in conversation on 2026-07-17, at the
ADR-0204 HUD look walk on the hosted studio. Design-time alignment IS the ratification (ADR-0110);
no second end-of-flow ask.

**Amends** ADR-0204 — narrows D2/D3: the HUD loses the brand chip and the avatar menu loses its
Library/Documents navigation entries. ADR-0204's core (forest landing, topbar retired, the avatar
presenting the verified identity, no new auth) stands untouched.

## Context

Walking the landed ADR-0204 chrome, the owner judged two of its pieces redundant and directed a new
Library principle in the same breath (authored as the `one-way-to-do-things` principle artifact):
**there should be one way to do things; a second pathway to the same destination needs very strong
justification.** Measured against it:

- The avatar menu's **Library** entry duplicated the forest map's library drawer — the permanent,
  default-visible lens handle (ADR-0191) that IS the library pathway.
- The avatar menu's **Documents** entry duplicated the same lens's dive: document/ADR bodies render
  inside the library overlay (ADR-0185 inc 4), so the corpus already has its one door.
- The **brand chip**'s only function was "back to the forest" — but the forest is the landing
  surface (ADR-0204 D1) and every other surface is an overlay on it; a permanent navigation chip to
  the place you already are is a second pathway to nowhere.

## Decision

1. **The brand chip retires.** The HUD renders no brand/navigation chip; the forest needs no "home"
   affordance because it is home.
2. **The avatar menu becomes a pure account surface:** the read-only identity + role line, Members
   (admin-gated), Credentials (desktop-gated), Sign out (hosted/IAP posture). The Library and
   Documents entries are removed — the map's library drawer is the one pathway to the Library, and
   the lens dive is the one pathway into document bodies.
3. **The `hud-chrome` capability's contracts are re-tensed (v2)** to pin the reduced composition
   (chip absent, menu carries no navigation entries) and re-proven through the spine
   (`node build hud-chrome --real`), the ADR-0197 walk-feedback precedent.

## Consequences

- The avatar is now the only HUD element — one floating control, top-right.
- `#/doc/...` routes keep working (deep links, in-corpus cross-links, the lens dive) but no longer
  have a global chrome entry point. If that proves too buried in practice, adding a pathway back is
  a new owner call that must clear the `one-way-to-do-things` justification bar.
- `libraryHref()` keeps its lens semantics for in-app callers; only the menu shortcut dies.
- The retired `hud-brand-chip-links-forest` contract and the re-tensed menu contract are re-proven
  in the same capability run; the desktop e2e is unaffected (it navigates by hash, PR #757).

## References

- ADR-0204 (amended), ADR-0191 (the library drawer as the default entry), ADR-0185 (the lens +
  dive), ADR-0197 (the walk-feedback re-tense precedent), ADR-0110 (born-accepted ratification).
- Principle: `one-way-to-do-things` (live store; owner-directed 2026-07-17).
- Arc: `studio-hud-chrome-arc`. Surface: `apps/studio/src/components/Hud.tsx`, `App.tsx`,
  `stories/studio/hud-chrome.md`.
