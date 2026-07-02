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
  z.object({ kind: z.literal('plant-story'), storyId: z.string().min(1), label: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('attach-wisp'), storyId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('branch-caps'), limbs: z.array(LimbDelta) }).strict(),
  z.object({ kind: z.literal('add-roads'), roads: z.array(RoadDelta) }).strict(),
  z.object({ kind: z.literal('pull-back') }).strict(),
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
// Director state
// ---------------------------------------------------------------------------

/** The accumulated world state as beats are applied. */
export interface WorldState {
  storyId: string;
  hasWisp: boolean;
  limbs: LimbDelta[];
  roads: RoadDelta[];
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
  world: { storyId: '', hasWisp: false, limbs: [], roads: [] },
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
      return { ...world, storyId: delta.storyId };
    case 'attach-wisp':
      return { ...world, hasWisp: true };
    case 'branch-caps':
      return { ...world, limbs: delta.limbs };
    case 'add-roads':
      return { ...world, roads: delta.roads };
    case 'pull-back':
      return world;
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
// The five approved research-table beats — the exported default script
// ---------------------------------------------------------------------------

/** The exported default script IS the five approved research-table beats
 *  (docs/research/vibe-coding-gripes-2026.md "The Act 2 spine", via ADR-0134). */
export const defaultScript: BeatScript = [
  // Beat 1 — Plant a story: a seed grows into a tree with its OUTCOME on a label.
  // Intent becomes a thing on the map, not buried in a chat log.
  {
    id: 'beat-1-plant-story',
    narrationKey: 'act2.beat1.plantStory',
    camera: { focus: 'story-tree', zoom: 0.7 },
    delta: {
      kind: 'plant-story',
      storyId: 'story-outcome-api',
      label: 'API latency < 200 ms',
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
      storyId: 'story-outcome-api',
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

  // Beat 4 — Stories connect: roads draw the DAG.
  // One road is the wrong-way UI→DB road skipping the service layer, flagged as
  // an antipattern FROM ITS DATA (a declared layer violation, not a canvas hint).
  {
    id: 'beat-4-add-roads',
    narrationKey: 'act2.beat4.addRoads',
    camera: { focus: 'dag-view', zoom: 0.5 },
    delta: {
      kind: 'add-roads',
      roads: [
        // Valid DAG dependency road
        { from: 'story-outcome-api', to: 'cap-auth' },
        // Wrong-way UI→DB road: declared layer violation FROM ITS DATA
        {
          from: 'ui',
          to: 'db',
          violation: 'layer-violation:ui-bypasses-service',
        },
      ],
    },
  },

  // Beat 5 — Pull back: camera widens to the whole legible forest.
  // Green = proven, sapling = in-progress, withered = broken. → done: true (CTA).
  {
    id: 'beat-5-pull-back',
    narrationKey: 'act2.beat5.pullBack',
    camera: { focus: 'full-forest', zoom: 0.1 },
    delta: { kind: 'pull-back' },
  },
];

export default defaultScript;
