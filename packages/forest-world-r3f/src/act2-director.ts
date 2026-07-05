// act2-director.ts — Act 2 beat director: pure, visitor-paced choreography.
//
// No React, no three.js, no timers — the visitor-paced state machine is a pure
// function: advance() moves exactly one beat per call and parks on the final
// CTA state (the deliberate inverse of Act 1's all-at-once, ADR-0134 §3).
//
// Beats carry narrationKeys; the plain-language copy and fictional story names
// live in the web repo keyed by beat id (the fictional-data precedent,
// ADR-0093 §3/§4). No narration strings live here.
//
// The beat shapes are ZOD schemas (the exported contract) — the site parses its
// beat copy against `BeatScript` at build time, and advance() parses each beat
// before applying it, so the teaching claims are RUNTIME contracts, not type
// hints: a green-without-marker limb is refused loudly, never rendered.
//
// FENCES: no live data ever; no React/three.js; interpolation is the canvas
// layer's job.
//
// World shape (ADR-0150 / ADR-0153): `WorldState` holds `stories: StoryNode[]`
// where each `StoryNode` carries a tri-state status ('proven'|'building'|'broken'),
// a `dependsOn` edge array (FROM dependent TO prerequisite — ADR-0058), a wisp
// flag, and limbs. The `add-upstream-story` delta raises a new story that an
// existing story depends on (website→backend→database; direction corrected by
// ADR-0153). The exported defaultScript is the ONE continuous arc: the website
// walk (beats 1–3) then the upstream dependency-layer reveal (beats 4–6).

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Camera
// ---------------------------------------------------------------------------

/** A declared camera target for a beat: a semantic anchor the camera frames
 *  (not a coordinate — the canvas resolves it) plus a zoom level
 *  (0 = widest possible, 1 = tightest close-up). */
export const CameraTarget = z
  .object({
    focus: z.string().min(1),
    zoom: z.number(),
  })
  .strict();
export type CameraTarget = z.infer<typeof CameraTarget>;

// ---------------------------------------------------------------------------
// Delta shapes (discriminated union) — the exported contract
// ---------------------------------------------------------------------------

/**
 * A capability limb in the branch-caps delta.
 *
 * The signed-proof marker (`signedProof`) is present and non-empty on every
 * GREEN limb — the refine REFUSES a limb coloured green without it. The
 * verification-gap answer is enforced in data, not applied as a presentation
 * hint by the canvas: a "done"-without-proof delta cannot colour the tree.
 */
export const LimbDelta = z
  .object({
    /** Stable id for this capability limb. */
    id: z.string().min(1),
    /** Display label (site-side narration key provides the copy). */
    label: z.string().min(1),
    /** Whether this limb has a signed passing proof. */
    green: z.boolean(),
    /** The signed-proof marker — required (non-empty) whenever `green` is true. */
    signedProof: z.string().min(1).optional(),
  })
  .strict()
  .refine((limb) => !limb.green || limb.signedProof !== undefined, {
    message:
      'a green limb MUST carry a non-empty signedProof marker — no signed proof, no green',
  });
export type LimbDelta = z.infer<typeof LimbDelta>;

/**
 * A road in the add-roads delta. `violation` is non-empty when this road is a
 * declared layer violation — the antipattern name, flagged FROM THE DATA, not
 * added as a presentation hint by the canvas. Absent on valid DAG dependency roads.
 *
 * Kept as a latent capability — the wrong-way-road teach is RETIRED as a beat
 * in the exported defaultScript (ADR-0150 §4), but the model can still express it.
 */
export const RoadDelta = z
  .object({
    /** Source node id. */
    from: z.string().min(1),
    /** Target node id. */
    to: z.string().min(1),
    /** The declared layer violation (the antipattern name); absent on valid roads. */
    violation: z.string().min(1).optional(),
  })
  .strict();
export type RoadDelta = z.infer<typeof RoadDelta>;

/** The delta for a single beat — what the world GAINS this beat, in the
 *  mapper's semantic vocabulary (never pixels). */
export const BeatDelta = z.discriminatedUnion('kind', [
  // plant-story: seed → story node with label, status seeded as 'building'
  z
    .object({
      kind: z.literal('plant-story'),
      storyId: z.string().min(1),
      label: z.string().min(1),
    })
    .strict(),
  // attach-wisp: a soft wisp drifts over the named story
  z
    .object({
      kind: z.literal('attach-wisp'),
      storyId: z.string().min(1),
    })
    .strict(),
  // branch-caps: capability limbs appear; green ONLY on signed proof
  z
    .object({
      kind: z.literal('branch-caps'),
      limbs: z.array(LimbDelta),
    })
    .strict(),
  // add-roads: latent capability — not in defaultScript (ADR-0150 §4 retired the teach)
  z
    .object({
      kind: z.literal('add-roads'),
      roads: z.array(RoadDelta),
    })
    .strict(),
  // add-upstream-story: raise a story that an existing story DEPENDS ON.
  // Edge direction: FROM dependent TO prerequisite (ADR-0058 / cross-story-dependency;
  // direction corrected by ADR-0153). dependentId names the existing story (or stories)
  // whose dependsOn edge set gains the new story's id. A string | string[] allows the
  // BaaS diamond (ADR-0157): the database is a prerequisite of BOTH the backend AND the
  // website, so the single upstream raise fans the new id into multiple dependents'
  // dependsOn arrays.
  z
    .object({
      kind: z.literal('add-upstream-story'),
      /** The new upstream story's stable id. */
      id: z.string().min(1),
      /** The new upstream story's display label. */
      label: z.string().min(1),
      /** The new upstream story's tri-state status. */
      status: z.enum(['proven', 'building', 'broken']),
      /** The id (or ids) of the existing stories that depend on this new upstream story.
       *  A string array allows a single upstream raise to fan into multiple dependents
       *  (the BaaS diamond: database is prerequisite of BOTH backend AND website). */
      dependentId: z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
    })
    .strict(),
  // pull-back: camera widens to the whole legible forest → done: true (CTA).
  // `proven` (optional) resolves the listed stories to 'proven' at the reveal —
  // the website the visitor grew greens HERE; the upstream layers stay building
  // (proposed/sapling — UAT 2, never green), so the legend has a real proven
  // example AND real building examples (ADR-0150 honest legend).
  z
    .object({
      kind: z.literal('pull-back'),
      /** Story ids that resolve to 'proven' at the pull-back reveal (the grown
       *  website). Absent/empty → a pure camera move. */
      proven: z.array(z.string().min(1)).optional(),
    })
    .strict(),
]);
export type BeatDelta = z.infer<typeof BeatDelta>;

// ---------------------------------------------------------------------------
// Beat + script contract
// ---------------------------------------------------------------------------

/**
 * A single beat in the director script.
 *
 * The narration key is a lookup into the web repo's copy; the module never
 * contains the narration string itself (fictional-data precedent, ADR-0093).
 */
export const Beat = z
  .object({
    /** Stable, unique id for this beat. */
    id: z.string().min(1),
    /** Narration key — the site looks up its copy by this key. */
    narrationKey: z.string().min(1),
    /** Camera target declared by this beat. */
    camera: CameraTarget,
    /** What the world GAINS this beat (the mapper's semantic vocabulary). */
    delta: BeatDelta,
  })
  .strict();
export type Beat = z.infer<typeof Beat>;

/** The script contract — the site parses its beat data against THIS at build
 *  time, so site-side copy keyed by beat id can never drift shape-wise. */
export const BeatScript = z.array(Beat);
export type BeatScript = z.infer<typeof BeatScript>;

// ---------------------------------------------------------------------------
// World model (ADR-0150 / ADR-0153)
// ---------------------------------------------------------------------------

/**
 * A story node in the accumulated world.
 *
 * `status` is tri-state ('proven' | 'building' | 'broken'), backing the honest
 * legend: green = proven, sapling = building, withered = broken (ADR-0147 salvage).
 * `dependsOn` is an array of prerequisite story ids — the edge flows FROM this
 * story TO its prerequisites (ADR-0058 / cross-story-dependency: A dependsOn B
 * iff A needs B's delivered outcome to pass A's own UAT).
 */
export interface StoryNode {
  /** Stable id for this story. */
  id: string;
  /** Display label. */
  label: string;
  /** True once a wisp has been attached to this story. */
  hasWisp: boolean;
  /** Tri-state story health. */
  status: 'proven' | 'building' | 'broken';
  /** Prerequisite story ids (FROM this story TO its prerequisites — ADR-0058). */
  dependsOn: string[];
  /** Capability limbs belonging to this story. */
  limbs: LimbDelta[];
}

/** The accumulated world state as beats are applied. */
export interface WorldState {
  /** The stories present in the world, in insertion order. */
  stories: StoryNode[];
}

/**
 * The current state of the Act 2 director. Pure data — no timers, no RNG.
 * Visitor-paced: the state changes only when the visitor's Next-tap calls
 * advance(), which is the deliberate inverse of Act 1's all-at-once.
 */
export interface DirectorState {
  /**
   * Index of the NEXT beat to apply (0 = no beats applied yet).
   * Increments by exactly 1 per advance() call. Parked at script.length when done.
   */
  beatIndex: number;
  /** The accumulated world state. */
  world: WorldState;
  /** The current camera target (follows each beat's declared camera). */
  camera: CameraTarget;
  /** True once all beats have been applied — the CTA / pull-back state. */
  done: boolean;
}

// ---------------------------------------------------------------------------
// Initial state
// ---------------------------------------------------------------------------

/** The zero DirectorState: no beats applied yet, camera at the origin. */
export const initialState: DirectorState = {
  beatIndex: 0,
  world: { stories: [] },
  camera: { focus: 'origin', zoom: 0.5 },
  done: false,
};

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

/** Apply a beat delta to the current world, returning a new WorldState. Pure. */
function applyDelta(world: WorldState, delta: BeatDelta): WorldState {
  switch (delta.kind) {
    case 'plant-story':
      // Seed a new story node as 'building' (proposed, not yet proven).
      return {
        ...world,
        stories: [
          ...world.stories,
          {
            id: delta.storyId,
            label: delta.label,
            hasWisp: false,
            status: 'building' as const,
            dependsOn: [],
            limbs: [],
          },
        ],
      };

    case 'attach-wisp':
      // Set hasWisp on the named story.
      return {
        ...world,
        stories: world.stories.map((s) =>
          s.id === delta.storyId ? { ...s, hasWisp: true } : s,
        ),
      };

    case 'branch-caps':
      // Attach capability limbs to the first story (the currently-active website).
      // Green limbs MUST carry the signed-proof marker (enforced by the zod refine
      // on LimbDelta — advance() parses the beat before calling applyDelta).
      return {
        ...world,
        stories: world.stories.map((s, i) =>
          i === 0 ? { ...s, limbs: delta.limbs } : s,
        ),
      };

    case 'add-roads':
      // Latent capability — not used in defaultScript (ADR-0150 §4 retired the teach).
      // The road model may remain but has no effect on WorldState.
      return world;

    case 'add-upstream-story': {
      // Raise a new upstream story AND update each dependent story's dependsOn edge.
      // Edge direction: dependent.dependsOn gains the new story's id (FROM dependent
      // TO prerequisite — ADR-0058 / cross-story-dependency; ADR-0153 direction).
      // dependentId may be a string (single dependent) or string[] (multiple dependents —
      // the BaaS diamond: database is prerequisite of BOTH backend AND website, so
      // applyDelta fans the new upstream id into each named dependent's dependsOn).
      const newStory: StoryNode = {
        id: delta.id,
        label: delta.label,
        hasWisp: false,
        status: delta.status,
        dependsOn: [],
        limbs: [],
      };
      const dependentIds: string[] =
        typeof delta.dependentId === 'string' ? [delta.dependentId] : delta.dependentId;
      return {
        ...world,
        stories: [
          ...world.stories.map((s) =>
            dependentIds.includes(s.id)
              ? { ...s, dependsOn: [...s.dependsOn, delta.id] }
              : s,
          ),
          newStory,
        ],
      };
    }

    case 'pull-back': {
      // The camera widens (advance() applies the beat's camera). Any story listed
      // in `proven` resolves to 'proven' — the culminating reveal that the grown
      // website is proven (green); the upstream layers stay building (proposed,
      // UAT 2 — never green). No ids → a pure camera move.
      if (delta.proven === undefined || delta.proven.length === 0) return world;
      const proven = new Set(delta.proven);
      return {
        ...world,
        stories: world.stories.map((s) =>
          proven.has(s.id) ? { ...s, status: 'proven' as const } : s,
        ),
      };
    }
  }
}

/**
 * Advance the director by exactly one beat (visitor-paced: one call = one tap).
 *
 * Pure: the input `state` is never mutated.
 * REFUSES a contract-violating beat: the beat is parsed against the exported
 * `Beat` contract before it is applied, so a green-without-marker limb THROWS
 * here (a faked "done" cannot colour the tree even in fiction).
 * Parks on the final CTA state: calling advance() when `state.done` is a no-op
 * that returns the same state object unchanged.
 */
export function advance(state: DirectorState, script: Beat[]): DirectorState {
  if (state.done) return state;

  const beat = script[state.beatIndex];
  // Guard: beatIndex out of bounds (e.g. empty script) → park as done.
  if (beat === undefined) return { ...state, done: true };

  // Parse the beat against the full zod contract — throws on any violation
  // (e.g. a green limb without a signedProof marker).
  Beat.parse(beat);

  const newIndex = state.beatIndex + 1;
  return {
    beatIndex: newIndex,
    world: applyDelta(state.world, beat.delta),
    camera: beat.camera,
    done: newIndex >= script.length,
  };
}

// ---------------------------------------------------------------------------
// The six-beat continuous arc — the exported default script (ADR-0150 / ADR-0153)
// ---------------------------------------------------------------------------
//
// ONE arc: the website walk (beats 1–3) then the upstream dependency-layer reveal
// (beats 4–5) then the pull-back CTA (beat 6).
//
//   beat 1: plant-story     — seed → website tree, status 'building'
//   beat 2: attach-wisp     — soft wisp drifts over the tree (presence)
//   beat 3: branch-caps     — capability limbs; green ONLY on signed proof
//   beat 4: add-upstream-story — backend (website.dependsOn=[backend])
//   beat 5: add-upstream-story — database (backend.dependsOn=[database])
//   beat 6: pull-back       — widen to full legible forest → done: true (CTA)
//
// The wrong-way-road antipattern beat IS RETIRED (ADR-0150 §4). The new teach is
// the POSITIVE dependency-layer-as-advantage: you see what the website NEEDS,
// up front, in order — the vertical upstream stack (website→backend→database).
//
// Fictional story names and narration copy live in the web repo, keyed by beat id
// (ADR-0093 §3/§4). Beat ids are POSITION-HONEST (id number = position).

/** The exported default script IS the six-beat continuous arc. */
export const defaultScript: BeatScript = [
  // Beat 1 — Plant a story: a seed grows into the website tree.
  // Intent becomes a thing on the map, not buried in a chat log.
  // The website story starts 'building' (proposed, not yet proven).
  {
    id: 'beat-1-plant-story',
    narrationKey: 'act2.beat1.plantStory',
    camera: { focus: 'story-tree', zoom: 0.7 },
    delta: {
      kind: 'plant-story',
      storyId: 'story-website',
      label: 'Seamless checkout experience',
    },
  },

  // Beat 2 — Watch a wisp: a soft wisp drifts over the tree.
  // Presence without obligation.
  {
    id: 'beat-2-attach-wisp',
    narrationKey: 'act2.beat2.attachWisp',
    camera: { focus: 'story-tree', zoom: 0.65 },
    delta: {
      kind: 'attach-wisp',
      storyId: 'story-website',
    },
  },

  // Beat 3 — It branches: capability limbs appear.
  // Green ONLY on a signed passing proof — a limb without the marker cannot be
  // coloured green (the verification-gap answer, enforced in data).
  {
    id: 'beat-3-branch-caps',
    narrationKey: 'act2.beat3.branchCaps',
    camera: { focus: 'story-tree', zoom: 0.6 },
    delta: {
      kind: 'branch-caps',
      limbs: [
        // Proven limb — carries the signed-proof marker (required for green)
        {
          id: 'cap-auth',
          label: 'Auth',
          green: true,
          signedProof: 'sha256:a1b2c3d4e5f6a7b8',
        },
        // In-progress limbs — no signed-proof marker (demonstrates the gap)
        {
          id: 'cap-cache',
          label: 'Cache',
          green: false,
        },
        {
          id: 'cap-rate-limit',
          label: 'Rate limit',
          green: false,
        },
      ],
    },
  },

  // Beat 4 — Grow upstream: the backend story the website depends on.
  // The edge is website.dependsOn=[backend] — FROM dependent TO prerequisite
  // (ADR-0058 / cross-story-dependency; direction corrected by ADR-0153).
  // Teach: you SEE what the website NEEDS (a backend to serve checkout), up front.
  {
    id: 'beat-4-add-upstream-backend',
    narrationKey: 'act2.beat4.addUpstreamBackend',
    camera: { focus: 'upstream-backend', zoom: 0.55 },
    delta: {
      kind: 'add-upstream-story',
      id: 'story-backend',
      label: 'Reliable API service',
      status: 'building',
      dependentId: 'story-website',
    },
  },

  // Beat 5 — Grow upstream: the database story (the shared foundation, BaaS diamond).
  // ADR-0157: the frontend reads the catalog DIRECTLY from the database, so BOTH the
  // website AND the backend depend on the database. dependentId spans both, so applyDelta
  // fans the new database id into backend.dependsOn AND website.dependsOn, giving the
  // diamond: website → {backend, database}, backend → database, database → [].
  // The database is 'building' — PROPOSED, never green (UAT 2: upstream layers are the
  // work you build next). The honest mix completes at the pull-back.
  {
    id: 'beat-5-add-upstream-database',
    narrationKey: 'act2.beat5.addUpstreamDatabase',
    camera: { focus: 'upstream-database', zoom: 0.5 },
    delta: {
      kind: 'add-upstream-story',
      id: 'story-database',
      label: 'Persistent data store',
      status: 'building',
      dependentId: ['story-backend', 'story-website'],
    },
  },

  // Beat 6 — Pull back: camera widens to the whole legible forest AND the website
  // the visitor grew resolves to 'proven' (the culminating reveal). Final honest
  // mix: website = proven (green), backend + database = building (the proposed
  // layers above it — never green, UAT 2). Green = proven, sapling = building,
  // withered = broken — the legend is backed by real statuses. → done: true (CTA).
  {
    id: 'beat-6-pull-back',
    narrationKey: 'act2.beat6.pullBack',
    camera: { focus: 'full-forest', zoom: 0.1 },
    delta: { kind: 'pull-back', proven: ['story-website'] },
  },
];

export default defaultScript;
