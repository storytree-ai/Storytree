// adapter.ts — the vendor-swappable author-time generative-3D adapter (ADR-0225).
//
// AUTHOR-TIME ONLY. This runs in an author's tooling session — NEVER in the
// deterministic build, NEVER at runtime, NEVER per-instance (ADR-0219 D1 / ADR-0217 D2).
// A produced maquette is a THROWN-AWAY reference: a proportion / occlusion / one-light
// block an author re-authors against. The committed re-authored vector asset — a
// @storytree/procedural-architecture BuildingModel the checker governs (see ./reauthor.ts)
// — is the source of truth. The maquette is NEVER parsed into our code, and a generated
// mesh is NEVER shipped as the map asset (the map stays 2.5D-isometric, ADR-0219 D4).

/**
 * An author-time request: a prompt and an optional concept-image reference. The concept
 * image INFORMS a backend (mood / palette / parts) and is never parsed by our code
 * (ADR-0217 D2). It is a handle (path / URI), not embedded content.
 */
export interface BlockRequest {
  readonly prompt: string;
  readonly conceptImage?: string;
}

/** The mesh container a backend can return. */
export type MeshFormat = 'glb' | 'gltf' | 'obj';

/**
 * A produced blocking-substrate maquette — the thrown-away generative-3D block. It is a
 * HANDLE to a mesh (an opaque `meshRef`), never parsed into our code and never shipped.
 * Two maquettes from two backends for one request are candidates the author chooses between.
 */
export interface Maquette {
  /** the backend id that produced it. */
  readonly backend: string;
  /** the request prompt it was produced for (provenance). */
  readonly prompt: string;
  /** the mesh container. */
  readonly meshFormat: MeshFormat;
  /** an opaque handle / URI to the mesh bytes — a reference an author opens in a 3D viewer,
   *  never parsed or inlined by our code. */
  readonly meshRef: string;
  /** optional backend-specific provenance (model id, seed-that-wasn't, etc.). */
  readonly meta?: Readonly<Record<string, string>>;
}

/**
 * A vendor backend behind the swappable seam — the ONE vendor-specific surface. A fixture
 * backend (offline, `./fixture-backend.ts`) and a live one (e.g. NVIDIA build.nvidia.com
 * TRELLIS) both implement this, so the adapter hard-codes no vendor.
 */
export interface GenerativeBackend {
  readonly id: string;
  generate(req: BlockRequest): Promise<Maquette>;
}

/**
 * The vendor-swappable adapter: register N backends, fan one request to all of them (one
 * candidate per backend, in stable registration order), and let the author select exactly
 * one produced maquette — the rest are returned nowhere and retained nowhere (the
 * thrown-away-maquette invariant, ADR-0225 / ADR-0219). It holds NO candidate state; a
 * fanned candidate set lives only in the caller's hands.
 */
export class BlockingSubstrateAdapter {
  readonly #backends: GenerativeBackend[] = [];

  /** Register a backend. Registration order is preserved (it fixes the fan order); a
   *  duplicate id is a mis-wire and throws. Returns `this` for fluent registration. */
  register(backend: GenerativeBackend): this {
    if (this.#backends.some((b) => b.id === backend.id)) {
      throw new Error(`backend "${backend.id}" is already registered`);
    }
    this.#backends.push(backend);
    return this;
  }

  /** The registered backend ids, in registration order. */
  get backendIds(): readonly string[] {
    return this.#backends.map((b) => b.id);
  }

  /**
   * Fan one request to EVERY registered backend, returning one candidate maquette per
   * backend in stable registration order — proving the seam is vendor-swappable with no
   * backend hard-coded (contract `bsa-adapter-fans-to-swappable-vendors`). Fanning with no
   * backends registered is a mis-wire, not a silent empty result.
   */
  async fan(req: BlockRequest): Promise<Maquette[]> {
    if (this.#backends.length === 0) {
      throw new Error('no backends registered — register at least one before fanning a request');
    }
    return Promise.all(this.#backends.map((b) => b.generate(req)));
  }

  /**
   * Author-selection: from a fanned candidate set, reduce to exactly ONE maquette (named by
   * its producing backend id). The unselected candidates are neither returned nor retained
   * — the thrown-away-maquette invariant (contract `bsa-author-selects-one-maquette-rest-discarded`).
   * A backend id that matches zero or more than one candidate is refused (an ambiguous or
   * absent selection is a mis-pick, never a silent first-wins).
   */
  select(candidates: readonly Maquette[], backend: string): Maquette {
    const matches = candidates.filter((c) => c.backend === backend);
    if (matches.length !== 1) {
      throw new Error(
        `author-selection must resolve to exactly one maquette for backend "${backend}", ` +
          `found ${matches.length} of ${candidates.length} candidate(s)`,
      );
    }
    return matches[0]!;
  }
}
