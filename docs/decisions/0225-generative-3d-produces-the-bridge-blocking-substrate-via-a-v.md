---
status: accepted
decided: 2026-07-21
amends: [219]
arc: grounded-art-machinery-arc
---
# ADR-0225: Generative-3D produces the bridge blocking substrate via a vendor-swappable author-time adapter

## Status

accepted (2026-07-21) — decided/directed by the owner in conversation on 2026-07-21. Design-time
alignment IS the ratification (ADR-0110); no second end-of-flow ask. This is the formal record of the
"Direction update (2026-07-21)" the `grounded-art-machinery-arc` end state already carried; that note
flagged the ADR would be authored by the driver session as the next increment, matching the ADR-0219
(2026-07-20) pattern, and this is it. The LOOK verdict on any produced asset remains separate and the
owner's (ADR-0070 stage 2), still outstanding.

## Context

[ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) decision 2 fixed the
shape of the raster→checkable-vector bridge: nano-banana for mood/palette/parts-reference → lock a style
bible → **block the asset in a LIGHT ortho / parametric substrate** (the "3D as ground rules", NEVER
shipped) to buy correct iso projection, occlusion and one consistent light → re-author a structured,
parametric, CHECKABLE vector asset against it → the existing checker (ADR-0217 stations 1–3). ADR-0219
penciled that blocking substrate as **hand-built** authoring tooling and deferred it ("the bridge's
light 3D substrate is net-new authoring tooling and is NOT built here … a future increment").

The owner ratified (2026-07-21) taking the next generative step: **a reputable, established
generative-3D model PRODUCES that blocking substrate, instead of an author hand-building the rig.** The
arc end state carries this as its vendor-neutral "Direction update (2026-07-21)"; the owner's stated
vendor preference was **Google/Gemini first** (its April-2026 "spatial intelligence" 3D, believed to be
previewable via the Gemini API), **NVIDIA later + in parallel**, **Adobe excluded** (owner distrust).

**One question gated the whole design, and this increment answered it first (verify, never recall — a
fast-moving space).** Does Gemini's April-2026 3D return an EXPORTABLE mesh (glTF/OBJ/GLB), which would
let an author block against a real maquette in a 3D viewer, or is it only interactive in-chat 3D, which
degrades to a better multi-angle image reference? Verified against Google's current sources on
2026-07-21, the answer is **view-only — no exportable mesh via the API**:

- The "spatial intelligence" 3D is a Gemini **app** feature (interactive in-chat: rotate / zoom /
  physics sliders; "Pro" model; announced ~2026-04-09), not a Gemini **API** capability, and no
  export/download to a mesh is documented.
- The Gemini **API** has no 3D output modality. The official API changelog (Dec 2023 – Jul 2026) lists
  the April-2026 releases as Veo (video), Nano Banana (image), Lyria (music) and robotics — nothing
  3D/mesh; the API's output modalities are text / image / audio.
- The "Gemini 3D exports GLB/OBJ/FBX" results are **third-party** tools (gemini3d.app, Meshy AI), not
  Google; the only real Google route to a mesh is a two-step hack (Gemini image → a separate
  image-to-3D service). No dedicated Google/Vertex generative **text-to-mesh** path surfaced either
  (Vertex has 3D *reconstruction* from photos, not concept-art generation).

So **Google/Gemini cannot produce the block — only an image reference.** The reputable, established path
that *does* export a mesh is **NVIDIA Edify**: GLB / USDz / OBJ meshes with PBR materials and OpenUSD,
delivered through Shutterstock's and Getty's commercially-and-ethically-licensed generative-3D services
built on Edify and served as NVIDIA NIM microservice APIs (NVIDIA's direct Edify API was retired; the
Shutterstock/Getty NIM services are the access path). Seeing the verification, the owner **flipped the
vendor ordering**: NVIDIA Edify becomes the block producer, Google is demoted to an optional
image-reference backend.

**Licensing is settled** (owner call): the owner accepts training-on-inputs (we feed prompts and found
concept art; we are not shipping proprietary art), and because the committed asset is **re-authored**,
IP-indemnity and data-isolation are moot — nothing generated is redistributed. So **cost is the main
factor**; any tier that exposes the capability works. SynthID/watermarking is moot once re-authored to
vector.

## Decision

**A reputable, established generative-3D model produces the bridge's blocking substrate — amending
ADR-0219 decision 2's hand-built rig — reached through a vendor-swappable author-time adapter, with
NVIDIA Edify as the first block-producing backend.** In five parts.

1. **The block is generator-produced, not hand-built.** ADR-0219 D2's LIGHT ortho/parametric substrate
   is produced by a generative-3D model rather than hand-built by an author. Everything else in the
   bridge stands: the produced 3D is a **thrown-away maquette** — a proportion / occlusion / one-light
   reference only — the author **re-authors** a structured, parametric, CHECKABLE vector asset against
   it, the existing checker (ADR-0217 stations 1–3) governs, and the committed **re-authored vector is
   the source of truth**. The generator's non-determinism never reaches the deterministic build or the
   prove-it-gate.

2. **A vendor-swappable author-time adapter, `(prompt, concept image) → block`.** The generator sits
   behind an adapter that can fan the same prompt to more than one vendor so the author picks the best
   block. It is **author-time ONLY** — never in the deterministic build, never at runtime, never
   per-instance, never parsed into our code (ADR-0219 D1 / ADR-0217 D2). This is exactly the "net-new
   authoring tooling" ADR-0219 D2 flagged and deferred.

3. **Vendor strategy set by the verification: NVIDIA Edify first; Google image-reference; Adobe
   excluded.** Gemini is view-only, so it cannot be the block producer; **NVIDIA Edify** (via the
   Shutterstock/Getty NVIDIA NIM services — mesh export confirmed, commercially/ethically licensed)
   becomes the **first** block-producing backend. **Google/Gemini** (nano-banana image generation,
   already adopted author-time in ADR-0219 D1) stays an **optional image-reference** backend — a better
   multi-angle reference sheet, not a block. **Adobe is excluded** (owner distrust). The adapter's
   swappability makes this ordering non-load-bearing: a further backend is an addition, not a rewrite.

4. **Licensing settlement (above) is recorded as decided:** training-on-inputs accepted; re-authoring
   makes indemnity/data-isolation moot; cost is the factor; Google's enterprise indemnity (Vertex tier)
   is available if ever wanted but not required.

5. **The load-bearing invariants of ADR-0219 STAND, unchanged:** author-time only; the maquette is
   thrown away; the re-authored checkable vector is the source of truth; the checker governs; the
   shipped map stays **2.5D isometric** (a generated mesh is NEVER the shipped asset — only a
   reference an author rebuilds against, ADR-0219 D4); colour-is-class (ADR-0093) and the fenced
   baked-art family (ADR-0218) are untouched; the look is baked-vector-first (ADR-0219 D3); and the LOOK
   verdict on any produced asset is the owner's (ADR-0070 stage 2), never self-signed.

Rejected: authoring against Gemini as the block producer (it cannot export a mesh — verified); any
per-instance or runtime call to the generative model; auto-tracing the maquette into the scene-graph as
the asset ("vector soup"); shipping a generated mesh as the map asset; Adobe as a vendor; and any
machine-signed look verdict.

## Consequences

- **Good — the block stops being hand-built rig work.** The increment's value (a generator produces the
  proportion/occlusion/one-light reference) is realized by a mesh-exporting vendor, so an author
  re-blocks against a real maquette rather than building the rig from a flat image.
- **Good — the vendor choice is not load-bearing.** Behind the adapter a prompt fans to N backends and
  the author picks; adding NVIDIA, Google, or a future vendor is a backend, not a redesign. The
  arc's machinery-first ladder is unchanged — a physically-sound gap between a produced block and the
  cosy target is a KIT or PALETTE gap, not a reason to climb the model tier.
- **Correction — "Google first" did not survive verification.** The owner's original ordering assumed
  Gemini's April-2026 3D was an exportable-mesh API; it is view-only. The ordering flipped to
  NVIDIA-first. This is the "verify, never recall" discipline catching a fast-moving-space assumption
  before it was built on.
- **Cost — a new author-time dependency, a real bill, and a new credential.** The NVIDIA path needs a
  **Shutterstock or Getty (NVIDIA NIM) account/key**, owner-provided (Claude never enters credentials);
  a wired Google image-reference backend needs the owner's Google API key. Non-determinism is handled
  structurally: the committed re-authored vector — not the maquette — is what the build and checker see,
  so the prove-it-gate's reproducibility is untouched.
- **Deferred — the adapter BUILD is a later increment.** Its home in the story tree (the `art-factory`
  story, ADR-0222) and its decomposition are routed to story-author / planner; the live/paid generation
  is gated on the owner-provided credential. This ADR records the decision and the verified vendor
  strategy; it builds no adapter.
- **Unresolved, honestly.** Whether any produced + re-authored asset actually reads cosy is the owner's
  LOOK verdict (ADR-0070 stage 2) and is not given here. Every look finding in this arc came from a
  human looking at a render; that discipline is unchanged.

## References

- [ADR-0219](0219-generative-image-models-enter-the-art-pipeline-author-time-o.md) — **amended**:
  decision 2's hand-built light-3D blocking substrate becomes **generator-produced**; the rest of
  ADR-0219 (author-time only, thrown-away maquette, re-author to checkable vector, checker governs,
  baked-vector look D3, 2.5D-isometric D4) stands and is the load-bearing spine.
- [ADR-0217](0217-art-factories-are-per-object-type-parametric-kit-explicit-dr.md) — D8 (concept designs
  the FACTORY, not the instance) and D2 (no inlining — a reference is re-authored, never consumed)
  govern the adapter; D1 (one factory per object type) untouched.
- [ADR-0218](0218-baked-art-carries-resolved-paint-into-the-shared-scene-via-a.md) /
  [ADR-0093](0093-shared-forest-world-render-core-for-studio-and-the-public-we.md) — the fenced
  baked-art family and colour-is-class; the produced look stays inside that fence, untouched.
- [ADR-0222](0222-split-the-art-factory-into-its-own-story-forest-world-gains.md) — the `art-factory`
  story that owns the adapter's home; art-kit / authoring-tooling work claims `art-factory`.
- [ADR-0070](0070-frontend-as-an-inner-loop-role-the-two-stage-proof-for-visua.md) /
  [ADR-0159](0159-frontend-builder-proves-stage-1-through-the-inner-loop-visua.md) — the look is
  operator-attested, stage 2; produced assets earn nothing until the owner signs.
- [ADR-0110](0110-collapse-the-redundant-end-of-flow-adr-ratification.md) — design-time alignment is
  ratification; this ADR is born accepted.
- `docs/research/grounded-art-concept/` — the concept image + README (the aesthetic target) and
  `style-bible.md` (the D2-safe bridge style bible).
- Export verification (2026-07-21, verify-not-recall): Gemini API changelog + output modalities (no
  3D/mesh); Google's Gemini-app 3D announcement (interactive in-chat, no export); NVIDIA Edify via
  Shutterstock/Getty NVIDIA NIM (GLB/USDz/OBJ mesh export, licensed). Recorded in the
  `grounded-art-machinery-arc` memory.
</content>
</invoke>
