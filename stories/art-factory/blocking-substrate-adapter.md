---
id: "blocking-substrate-adapter"
tier: capability
story: art-factory
title: "The blocking-substrate adapter — a vendor-swappable author-time generative-3D adapter that produces a thrown-away maquette an author re-authors into a checkable vector asset"
outcome: "An author-time, vendor-swappable adapter produces a thrown-away generative-3D maquette that an author re-authors into a checkable vector asset the existing factory checker governs — never reaching the deterministic build, the runtime, or the shipped 2.5D-isometric map."
status: proposed
proof_mode: integration-test
depends_on: [art-pipeline]
# ADOPTION BASIS (ADR-0465 D2/D4), declared spec-borne per ADR-0057. The package landed
# 2026-07-21 (`ff98fbc8`) and its tests are NAMED for these contracts:
# `bsa-adapter-fans-to-swappable-vendors` and `bsa-author-selects-one-maquette-rest-discarded` —
# `adapter.test.ts`; `bsa-reauthor-handoff-governed-by-checker` — `reauthor.test.ts`, against the REAL
# art-pipeline checker (sound passes, perturbed refused, the maquette never enters the bake);
# `bsa-nvidia-edify-backend-exports-a-mesh` — its OFFLINE conformance half only, in
# `backends/nvidia-trellis.test.ts` (interface conformance, fail-closed on a missing key, the
# request/response contract with an injected fetch). The LIVE credential-gated leg is excluded here
# exactly as contract 4 already says, so this adoption never rests on a credential.
# NO `real:` arm — the code and its tests already exist, so there is no red to observe (ADR-0465).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/art-authoring", "test"]
  scope:
    testGlobs:
      - "packages/art-authoring/src/adapter.test.ts"
      - "packages/art-authoring/src/reauthor.test.ts"
      - "packages/art-authoring/src/backends/nvidia-trellis.test.ts"
    sourceGlobs:
      - "packages/art-authoring/src/adapter.ts"
      - "packages/art-authoring/src/reauthor.ts"
      - "packages/art-authoring/src/backends/nvidia-trellis.ts"
---

# The blocking-substrate adapter — generate a maquette, re-author to a checkable vector

**Outcome —** An author-time, vendor-swappable adapter produces a thrown-away generative-3D maquette
that an author re-authors into a checkable vector asset the existing factory checker governs — never
reaching the deterministic build, the runtime, or the shipped 2.5D-isometric map.

**Depends on —** [`art-pipeline`](art-pipeline.md). The adapter's downstream boundary is the pipeline's
**invariant checker** (station 2, `check` / `assertSound`) and the model builder (station 1): a
produced maquette earns nothing until an author has re-authored a checkable vector the real checker
governs (ADR-0217 stations 1–3). That hand-off is a real within-story code edge onto the pipeline
(ADR-0010 §3) — the adapter never touches the building/landscape factories directly.

> **Proof status — BUILT since 2026-07-21, corrected in place 2026-08-31.** This block used to read
> *"greenfield, UNBUILT — there is no adapter package, no backend, no test"*, and it was **false at
> HEAD**: `packages/art-authoring/` landed in `ff98fbc8` ("the offline generative blocking-substrate
> adapter seam (ADR-0225, contracts 1-3)") with the adapter, the backend registry, the re-author
> hand-off, two real backends and a test file per contract — the tests are literally NAMED for the
> contract ids below. It is registered in `repo-manifest.json`. A session trusting this paragraph
> would have paid the prove-it-gate to manufacture a red over green code, which is the exact failure
> ADR-0465 exists to stop; the spec's own self-report is never the evidence, the code is.
>
> The build path it described is therefore spent: contracts 1–3 and contract 4's OFFLINE conformance
> half are discharged by ADOPTION on the owner's recorded risk acceptance (ADR-0465 D2/D4) against
> the `proof:` block in this frontmatter, not by a driven red→green. What stays genuinely unproven is
> only contract 4's LIVE credential-gated leg, exactly as contract 4 already says. `healthy` remains
> DERIVED from a signed verdict (ADR-0020 / ADR-0040) and is never authored here.

## Guidance

This capability is the "net-new authoring tooling" ADR-0219
D2 flagged and deferred, decided by ADR-0225:
a generative-3D model **produces the bridge's blocking substrate** (the LIGHT ortho/parametric maquette
that buys correct iso projection, occlusion and one consistent light) instead of an author hand-building
the rig. The organ is a **`(prompt, concept image) → block` adapter** with three load-bearing shapes:

- **Vendor-swappable.** The generator sits behind an adapter interface so the same request fans to more
  than one backend and the author picks the best-produced block. The FIRST block-producing backend
  that actually shipped is NVIDIA-hosted **microsoft/TRELLIS** on `build.nvidia.com`
  (`backends/nvidia-trellis.ts`) — ADR-0225 named NVIDIA Edify via the Shutterstock / Getty NIM
  services, NVIDIA pulled Edify's direct API in June 2025, and the swappable seam absorbed the
  substitution exactly as designed (contract 4's note carries the detail). Google/Gemini stays an
  optional image-reference backend (view-only, no mesh export — verified ADR-0225, shipped as
  `backends/gemini-nano-banana.ts`); Adobe is excluded. The swappability makes the vendor ordering
  non-load-bearing — a further backend is an addition behind the interface, not a rewrite, and that
  vendor substitution is the first live evidence of it.
- **Author-time ONLY.** The adapter runs in an author's tooling session, NEVER in the deterministic
  build, NEVER at runtime, NEVER per-instance, and its output is NEVER parsed into our code
  (ADR-0219 D1 / ADR-0217 D2). The generator's non-determinism never reaches the prove-it-gate.
- **The maquette is thrown away; the re-authored vector is the source of truth.** The produced 3D is a
  proportion / occlusion / one-light reference only. The author **re-authors** a structured, parametric,
  CHECKABLE vector asset against it (a factory input in the `art-pipeline` shape), the existing checker
  governs it, and the committed re-authored vector — not the maquette — is what the build and the map
  see. No auto-trace of the maquette into the scene-graph ("vector soup"); no inlining (ADR-0217 D2);
  no generated mesh ever shipped as the map asset (the map stays 2.5D-isometric, ADR-0219 D4).

The organ is distinct from the per-object-type factories: `building-factory` and `landscape-factory`
CONSUME a re-authored input and prove soundness + bake; this adapter PRODUCES the reference an author
re-authors into such an input. That distinct organ boundary — plus its own isolatable suite (a
fixture-backed offline core and one credential-gated live leg) — is why it earns its own capability
rather than folding into an existing factory (ADR-0217 D1).

**Where the code lives (recommendation, not authored here — this spec is the WHAT).** The adapter is a
node/network, credential-holding, author-time organ, so it MUST NOT live in
`@storytree/procedural-architecture`: that package is the story's browser-bundleable foundational root
(zero runtime deps, no `node:*`, ADR-0075 / ADR-0222), and a network client would break the design
floor the studio bundle depends on. It should be a **new sibling author-tool package** (e.g.
`@storytree/art-authoring`) that DEPENDS ON `@storytree/procedural-architecture` (to hand off to the
real checker), carries the HTTP client + owner-provided credential + fixture backends + suite, and is
NEVER imported by the browser bundle, the deterministic build, or the runtime. A standalone script is
too thin for a vendor-swappable interface with multiple backends and a real test surface. Registration
of that package under `art-factory` ownership — and its EXCLUSION from the manifest's `foundational`
subset (it is author-time tooling, not a shipped foundational organism) — is a `repo-manifest.json` /
wiring concern for the build increment, outside this spec's `stories/**` surface.

## Integration test

**Goal —** Drive the adapter end-to-end OFFLINE with fixture backends (no network, no credential):
register ≥2 backends, fan one `(prompt, concept image)` request, author-select one produced maquette
from the candidate set, re-author a fixture checkable-vector asset, and assert the REAL `art-pipeline`
checker governs that re-authored asset — while the maquette itself never enters a model, the bake, or
the scene-graph. The live NVIDIA-Edify backend is layered on as one separately-provable, credential-gated
contract and is NOT exercised in this offline journey.

The integration test exercises `blocking-substrate-adapter` against its **real in-story collaborator** —
the real `art-pipeline` checker (`check` / `assertSound`) — with the vendor BACKENDS stubbed by fixtures
(the network/credential boundary is exactly where a stub belongs). It would register two fixture backends
that each return a canned maquette handle, fan one request and assert two candidates come back, run the
author-selection to reduce to exactly one (the rest discarded), re-author a small fixture vector asset,
assert `check` returns no violations for the sound re-authored asset and the expected `Violation[]` for a
perturbed unsound one, and assert the maquette object is absent from the baked drawables (the throw-away /
no-inlining invariant).

## Contracts (4)

The test-proven leaf behaviours. Contracts 1–3 are offline, isolated, and provable **without** the
owner-provided credential; contract 4 is the credential-gated live backend, separately provable and
excluded from the offline gate.

> **Corrected 2026-08-31.** This preamble used to end *"Anchors/`proven by` files are authored by the
> build increment against the real package — this greenfield spec names the behaviours, not
> yet-existent test files."* The test files exist and each is named for the contract it proves:
> contracts 1 and 2 → `packages/art-authoring/src/adapter.test.ts`, contract 3 →
> `src/reauthor.test.ts` (against the REAL `art-pipeline` checker), contract 4's offline conformance
> → `src/backends/nvidia-trellis.test.ts`. See the `proof:` block in this spec's frontmatter for the
> declared command.

1. **`bsa-adapter-fans-to-swappable-vendors`** — the vendor-swappable interface fans one request to N registered backends
   - **asserts —** given ≥2 registered fixture backends, the adapter fans a single `(prompt, concept
     image)` request to each and returns exactly one candidate maquette handle per backend, in a stable
     order — proving the interface is vendor-swappable with no backend hard-coded.
   - **covers —** the adapter interface + backend registry (the new author-tool package, e.g.
     `@storytree/art-authoring`).
   - **proven by —** an isolated offline unit test with fixture backends (no network, no credential),
     authored with the code.
2. **`bsa-author-selects-one-maquette-rest-discarded`** — author-selection reduces the candidate set to exactly one, discarding the rest
   - **asserts —** from a multi-candidate set the author-selection yields exactly one maquette and the
     unselected candidates are dropped and retained nowhere — the thrown-away-maquette invariant
     (ADR-0225 / ADR-0219: the maquette is a reference, not an asset).
   - **covers —** the candidate-selection surface (the new author-tool package).
   - **proven by —** an isolated offline unit test with fixture candidates, authored with the code.
3. **`bsa-reauthor-handoff-governed-by-checker`** — the selected maquette proceeds ONLY as a re-authored vector the real checker governs
   - **asserts —** the selected maquette is handed off only as a re-authored checkable vector asset that
     the real `art-pipeline` checker (`check` / `assertSound`, stations 1–3) governs — a sound
     re-authored asset passes and a perturbed one is refused — and the maquette object never appears in a
     built model, the bake, or the scene-graph (no inlining / no auto-trace, ADR-0217 D2; author-time
     only, ADR-0219 D1).
   - **covers —** the re-author hand-off (the new author-tool package) against the real
     `@storytree/procedural-architecture` checker.
   - **proven by —** an isolated offline unit test against the real checker with a fixture re-authored
     asset, authored with the code.
4. **`bsa-nvidia-edify-backend-exports-a-mesh`** — the live NVIDIA backend returns an exportable mesh, conforming to the backend interface
   > **Corrected 2026-08-31 — the VENDOR moved, the contract did not.** NVIDIA pulled Edify's direct
   > API in June 2025 (Edify is Shutterstock/Getty-only now), so the backend that actually shipped is
   > NVIDIA-hosted **microsoft/TRELLIS** on `build.nvidia.com`
   > (`packages/art-authoring/src/backends/nvidia-trellis.ts`), reached with a direct `nvapi-` key.
   > That is precisely the swappability this capability claims — a different vendor behind the same
   > seam is an addition, not a rewrite — so the contract stands as written with the vendor name
   > read as "the live NVIDIA mesh backend". The contract ID keeps its `edify` spelling because the
   > test names bind to it verbatim; renaming it would break that binding for nothing.
   - **asserts —** the live NVIDIA mesh backend returns
     an exportable mesh (glTF / OBJ / GLB) for a `(prompt, concept image)` request and conforms to the
     adapter's backend interface — the one leg that proves a REAL vendor plugs into the swappable seam.
     Verified end-to-end by hand against the hosted endpoint on 2026-07-21 (a real 200 returned a
     3.48 MB GLB carrying the `glTF` magic); that hand-run is not a signed verdict, which is why the
     leg below stays excluded from the offline gate and from this capability's adoption.
   - **covers —** the NVIDIA-Edify backend adapter (the new author-tool package).
   - **proven by —** a **credential-gated** live smoke (owner-provided NVIDIA NIM key; Claude never
     enters credentials), run separately and **excluded from the offline prove-it-gate**. Its offline
     stand-in is the backend-interface conformance already exercised by fixtures in contract 1, so the
     capability's offline green never depends on the credential.
