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
// ADR-0147: the world now holds MULTIPLE stories (WorldState.stories is an array
// of per-story nodes each carrying a tri-state status proven/building/broken),
// the forest becomes genuinely mixed after the grow-forest beat, and the
// pull-back legend is HONEST (not uniform amber — the latent over-claim is fixed).
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

/** A neighbor story raised by the grow-forest delta (ADR-0147). */
const GrowForestNeighbor = z
  .object({
    id: z.string().min(1),
    label: z.string().min(1),
    status: z.enum(['proven', 'building', 'broken']),
  })
  .strict();

/** The delta for a single beat — what the world GAINS this beat, in the
 *  mapper's semantic vocabulary (never pixels).
 *
 *  ADR-0147 adds `grow-forest` to raise sibling story islands with a
 *  genuinely mixed tri-state status (proven/building/broken). The `add-roads`
 *  kind is reused for inter-story dependency roads (beat-6-connect-stories). */
export const BeatDelta = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('plant-story'),
      storyId: z.string().min(1),
      label: z.string().min(1),
    })
    .strict(),
  z.object({ kind: z.literal('attach-wisp'), storyId: z.string().min(1) }).strict(),
  z.object({ kind: z.literal('branch-caps'), limbs: z.array(LimbDelta) }).strict(),
  z.object({ kind: z.literal('add-roads'), roads: z.array(RoadDelta) }).strict(),
  z
    .object({ kind: z.literal('grow-forest'), neighbors: z.array(GrowForestNeighbor) })
    .strict(),
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
// Director state (ADR-0147: world holds multiple stories)
// ---------------------------------------------------------------------------

/** The tri-state status of a story in the world (ADR-0147).
 *  Renders as green (proven) / sapling (building) / withered (broken). */
export type StoryStatus = 'proven' | 'building' | 'broken';

/** A per-story node in the world — each island in the forest map (ADR-0147). */
export interface StoryNode {
  /** Stable story id. */
  id: string;
  /** The outcome label displayed on the map. */
  label: string;
  /** Whether a session wisp is drifting over this story. */
  hasWisp: boolean;
  /** The tri-state proof status. */
  status: StoryStatus;
  /** Capability limbs attached to this story (from the branch-caps beat). */
  limbs: LimbDelta[];
}

/**
 * The accumulated world state as beats are applied.
 *
 * ADR-0147: `stories` replaces the old flat storyId/hasWisp/limbs fields.
 * The world starts with an empty stories array; plant-story seeds stories[0];
 * grow-forest raises sibling stories with explicitly-declared statuses, so the
 * forest is genuinely mixed (proven/building/broken) and the pull-back legend
 * is HONEST.
 */
export interface WorldState {
  /** All story nodes in the world (per-island); starts empty. */
  stories: StoryNode[];
  /** All roads drawn across beats (accumulated via add-roads beats). */
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

/** The zero DirectorState: no beats applied yet, world empty, camera at origin. */
export const initialState: DirectorState = {
  beatIndex: 0,
  world: { stories: [], roads: [] },
  camera: { focus: 'origin', zoom: 0.5 },
  done: false,
};

// ---------------------------------------------------------------------------
// Pure state machine
// ---------------------------------------------------------------------------

/** Apply a beat delta to the current world, returning a new WorldState. Pure. */
function applyDelta(world: WorldState, delta: BeatDelta): WorldState {
  switch (delta.kind) {
    case 'plant-story': {
      // Seeds stories[0] with the planted story (upsert by id — ADR-0147).
      const newStory: StoryNode = {
        id: delta.storyId,
        label: delta.label,
        hasWisp: false,
        status: 'building',
        limbs: [],
      };
      const existingIdx = world.stories.findIndex((s) => s.id === delta.storyId);
      if (existingIdx >= 0) {
        const updated = [...world.stories];
        const existing = updated[existingIdx];
        if (existing !== undefined) {
          updated[existingIdx] = { ...existing, ...newStory };
        }
        return { ...world, stories: updated };
      }
      // Not yet in the array: prepend so it lands at index 0.
      return { ...world, stories: [newStory, ...world.stories] };
    }

    case 'attach-wisp': {
      // Sets hasWisp: true on the story with the given id.
      const idx = world.stories.findIndex((s) => s.id === delta.storyId);
      if (idx < 0) return world;
      const updated = [...world.stories];
      const story = updated[idx];
      if (story === undefined) return world;
      updated[idx] = { ...story, hasWisp: true };
      return { ...world, stories: updated };
    }

    case 'branch-caps': {
      // Applies limbs to stories[0] (the opening arc's single story).
      if (world.stories.length === 0) return world;
      const updated = [...world.stories];
      const first = updated[0];
      if (first === undefined) return world;
      updated[0] = { ...first, limbs: delta.limbs };
      return { ...world, stories: updated };
    }

    case 'add-roads':
      // Accumulates roads across beats (beat-4 within-story roads + beat-6
      // inter-story dependency roads all land in the same roads array).
      return { ...world, roads: [...world.roads, ...delta.roads] };

    case 'grow-forest': {
      // Raises sibling stories (upsert by id — ADR-0147). Each neighbor carries
      // an explicit status so the forest is genuinely mixed from the moment it
      // grows (the latent over-claim fix: no more uniform amber).
      const updatedStories = [...world.stories];
      for (const neighbor of delta.neighbors) {
        const existingIdx = updatedStories.findIndex((s) => s.id === neighbor.id);
        if (existingIdx >= 0) {
          const existing = updatedStories[existingIdx];
          if (existing !== undefined) {
            updatedStories[existingIdx] = {
              ...existing,
              label: neighbor.label,
              status: neighbor.status,
            };
          }
        } else {
          updatedStories.push({
            id: neighbor.id,
            label: neighbor.label,
            status: neighbor.status,
            hasWisp: false,
            limbs: [],
          });
        }
      }
      return { ...world, stories: updatedStories };
    }

    case 'pull-back':
      // No world mutation — the camera widens but the data is unchanged.
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

  // Runtime contract enforcement: throws on any shape violation, including
  // a green limb without a signedProof marker (the verification-gap answer).
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
// The seven approved research-table beats (ADR-0147) — the exported default script
// ---------------------------------------------------------------------------

/**
 * The exported default script IS the seven approved research-table beats
 * (ADR-0134 §3, expanded by ADR-0147 to a genuinely mixed-status forest).
 *
 * Beat-id discipline (ADR-0147):
 *   Beats 1–4 keep their ids VERBATIM (site narration wall keys on beat id).
 *   beat-5-grow-forest and beat-6-connect-stories are new (ADR-0147).
 *   The pull-back is RENUMBERED beat-5-pull-back → beat-7-pull-back so ids
 *   stay position-honest (id number = position in the arc).
 *
 * NO beat claims storytree answers duplication (coverage-map §C ⚠).
 */
export const defaultScript: BeatScript = [
  // ── Beat 1 — Plant a story ────────────────────────────────────────────────
  // A seed grows into a tree with its OUTCOME on a label.
  // Intent becomes a thing on the map, not buried in a chat log (C-13).
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

  // ── Beat 2 — Watch a wisp ─────────────────────────────────────────────────
  // A soft wisp drifts over the first story — presence without obligation (D-17).
  {
    id: 'beat-2-attach-wisp',
    narrationKey: 'act2.beat2.attachWisp',
    camera: { focus: 'story-tree', zoom: 0.65 },
    delta: {
      kind: 'attach-wisp',
      storyId: 'story-outcome-api',
    },
  },

  // ── Beat 3 — It branches ──────────────────────────────────────────────────
  // Capability limbs appear; a limb turns green ONLY on a signed passing proof.
  // The delta for a green limb MUST carry the signed-proof marker; a "done"-
  // without-proof delta cannot colour it (the verification gap A-1/3/4 — the
  // arc's most load-bearing teach, enforced in data, not a canvas hint).
  {
    id: 'beat-3-branch-caps',
    narrationKey: 'act2.beat3.branchCaps',
    camera: { focus: 'story-tree', zoom: 0.6 },
    delta: {
      kind: 'branch-caps',
      limbs: [
        // Proven limb — carries the signed-proof marker (required for green).
        {
          id: 'cap-auth',
          label: 'Auth',
          green: true,
          signedProof: 'sha256:a1b2c3d4e5f6a7b8',
        },
        // In-progress limbs — no signed-proof marker (demonstrates the gap).
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

  // ── Beat 4 — Stories connect (the wrong-way road) ─────────────────────────
  // Roads draw the first story's DAG; one road is the wrong-way UI→DB road
  // skipping the service layer, flagged as an antipattern FROM ITS DATA (a
  // declared layer violation), visibly distinct the moment it is drawn
  // (C-9/11/12 — roads show coupling, not code clones; NOT duplication).
  {
    id: 'beat-4-add-roads',
    narrationKey: 'act2.beat4.addRoads',
    camera: { focus: 'dag-view', zoom: 0.5 },
    delta: {
      kind: 'add-roads',
      roads: [
        // Valid DAG dependency road.
        { from: 'story-outcome-api', to: 'cap-auth' },
        // Wrong-way UI→DB road: declared layer violation FROM ITS DATA.
        {
          from: 'ui',
          to: 'db',
          violation: 'layer-violation:ui-bypasses-service',
        },
      ],
    },
  },

  // ── Beat 5 — The forest grows (NEW, ADR-0147) ─────────────────────────────
  // Neighbor stories rise as more islands, each already carrying an explicit
  // status so the forest is genuinely mixed the moment it grows: a proven green
  // story, building saplings, one withered/broken (C-13 — the whole forest is
  // legible at a glance, not just one tree). The pull-back legend is HONEST.
  {
    id: 'beat-5-grow-forest',
    narrationKey: 'act2.beat5.growForest',
    camera: { focus: 'forest-overview', zoom: 0.3 },
    delta: {
      kind: 'grow-forest',
      neighbors: [
        // A proven neighboring story (renders green on the map).
        { id: 'story-member-auth', label: 'Member login in < 2 s', status: 'proven' },
        // A building story (renders as a sapling).
        { id: 'story-data-pipeline', label: 'Nightly data pipeline', status: 'building' },
        // A broken story (renders as withered) — the blast-radius read.
        { id: 'story-search-indexer', label: 'Full-text search indexer', status: 'broken' },
      ],
    },
  },

  // ── Beat 6 — Stories depend on each other (NEW, ADR-0147) ────────────────
  // Real inter-story dependency roads draw the cross-story DAG between the
  // islands (reusing add-roads with story-id endpoints — no new road mechanism).
  // A road from the proven story INTO the broken one is exactly the blast-radius
  // read (C-11/12 — hidden coupling / blast radius, still coupling not duplication).
  {
    id: 'beat-6-connect-stories',
    narrationKey: 'act2.beat6.connectStories',
    camera: { focus: 'forest-dag', zoom: 0.25 },
    delta: {
      kind: 'add-roads',
      roads: [
        // Valid inter-story dependency road.
        { from: 'story-outcome-api', to: 'story-member-auth' },
        // Road into the broken story — the blast-radius read.
        { from: 'story-outcome-api', to: 'story-search-indexer' },
      ],
    },
  },

  // ── Beat 7 — Pull back (RENUMBERED from beat-5-pull-back, ADR-0147) ───────
  // Camera widens to the whole legible forest; the green/sapling/withered legend
  // is GENUINELY populated (mixed status is real, not uniform amber); session
  // wisps drift over live stories → done: true (CTA state).
  // D-18/19 — terminal sprawl, done-vs-in-flight: the anti-storm.
  {
    id: 'beat-7-pull-back',
    narrationKey: 'act2.beat7.pullBack',
    camera: { focus: 'full-forest', zoom: 0.1 },
    delta: { kind: 'pull-back' },
  },
];

export default defaultScript;
