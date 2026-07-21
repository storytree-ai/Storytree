# Forest-hut concept (author-time reference)

`forest-hut-concept.png` — a cosy woodland **forest hut** concept, the style reference for a fresh
building asset to be **re-authored** through the art factory (`@storytree/procedural-architecture`) into
a checkable parametric baked-vector asset (ADR-0217 stations 1–3), matching the approved cottage/gazebo
hero-kit style. Per ADR-0219 the raster concept is **author-time only** — it goes to an author, is never
parsed into our code, and the committed re-authored vector asset is the source of truth (D2).

## Provenance

- **Generated** 2026-07-21 via **Nano Banana Pro** (`models/gemini-3-pro-image`, Gemini API), keyed from
  Google Secret Manager (`gemini-api-key`, project `storytree-498613`, reached via ambient ADC).
- **Style-referenced** against `cosy-island-concept.png` (fed as an input image) so the palette,
  softness, projection, and one warm upper-left key light match the cosy-island direction.
- **Prompt:** a single cosy forest hut as a standalone hero asset in the reference's warm muted storybook
  style (sage greens, warm timber, terracotta, cream; no cool greys), gentle 3/4 isometric, soft warm
  upper-left key light — timber-plank walls, a steep shingled roof with a slight sag, a small stone
  chimney with a wisp of smoke, a round wooden door, one warm-lit window, mushrooms/ferns at the base;
  centred as a single isolated asset on a plain neutral background (no scene, no other buildings, no text).
- **Non-deterministic** (no seed) — this committed image is the fixed reference, not the model call.
