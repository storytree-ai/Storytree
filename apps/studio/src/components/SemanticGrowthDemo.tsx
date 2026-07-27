// Query-gated Studio witness for the public semantic-growth player. It composes one persistent
// island through the real Studio world pipeline; the public component alone owns the timeline.

import React from 'react';
import {
  buildScene,
  type SceneVegetationInput,
} from '@storytree/forest-world';
import {
  normalizeWorldPresentationModel,
  SemanticGrowthWorldView,
  type LaneLayout,
  type SemanticGrowthAnchors,
  type SemanticGrowthEvent,
} from '@storytree/app-surface';
import { buildWorld, buildRelaxedCells, worldToScene } from './TreeView.js';
import type {
  BuildActivity,
  ClaimActivity,
  DepartedClaim,
  TreeCapability,
  TreeStory,
} from '../types.js';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

const DEMO_STORY_ID = 'semantic-growth-demo';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const VEGETATION: SceneVegetationInput = {};
const NO_BUILDS: Map<string, BuildActivity[]> = new Map();
const NO_DEPARTURES: Map<string, DepartedClaim[]> = new Map();

const SEMANTIC_EVENTS: readonly SemanticGrowthEvent[] = [
  { key: 'empty' },
  { key: 'land' },
  { key: 'proposed' },
  { key: 'claimed' },
  { key: 'signed-proof' },
  { key: 'healthy' },
];

function demoCapability(id: string, testCount: number): TreeCapability {
  return {
    id,
    title: id,
    outcome: `${id} — representative semantic-growth capability`,
    status: 'healthy',
    proofMode: 'contract',
    dependsOn: [],
    testCount,
  };
}

function demoStory(): TreeStory {
  return {
    id: DEMO_STORY_ID,
    title: 'Semantic growth witness',
    outcome: 'witnesses one persistent island through the shared app-surface timeline',
    status: 'healthy',
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn: [],
    consumedBy: [],
    capabilities: [
      demoCapability('semantic-growth-demo-cap-alpha', 6),
      demoCapability('semantic-growth-demo-cap-beta', 5),
    ],
    verdict: { outcome: 'pass', at: NOW.toISOString() },
  };
}

const DEMO_CLAIM: ClaimActivity = {
  unitId: DEMO_STORY_ID,
  kind: 'claim',
  sessionId: 'semantic-growth-demo-session',
  branch: 'claude/demo-real',
  intent: 'real',
  grade: 'work',
  at: NOW.toISOString(),
};

interface Fixture {
  readonly model: ReturnType<typeof normalizeWorldPresentationModel>;
  readonly anchors: SemanticGrowthAnchors;
}

function buildFixture(): Fixture {
  const world = buildWorld([demoStory()], { buildings: false });
  const relaxedCells = buildRelaxedCells(world, 'mesh', {});
  const claims = new Map<string, ClaimActivity[]>([[DEMO_STORY_ID, [DEMO_CLAIM]]]);
  const scene = buildScene(
    worldToScene(
      world,
      relaxedCells,
      NOW,
      NO_BUILDS,
      claims,
      NO_DEPARTURES,
      null,
      null,
      VEGETATION,
    ),
  );
  const territory = world.territories[0]!;
  const anchors: SemanticGrowthAnchors = {
    islandId: DEMO_STORY_ID,
    terrain: territory.centroid,
    contents: territory.treeSpot,
    claim: {
      x: territory.treeSpot.x + territory.radius * 0.35,
      y: territory.treeSpot.y - territory.radius * 0.2,
    },
    proof: {
      x: territory.treeSpot.x,
      y: territory.treeSpot.y - territory.radius * 0.5,
    },
    route: {
      from: {
        x: territory.centroid.x - territory.radius * 0.55,
        y: territory.centroid.y + territory.radius * 0.2,
      },
      to: {
        x: territory.centroid.x + territory.radius * 0.75,
        y: territory.centroid.y + territory.radius * 0.35,
      },
    },
  };
  const { from, to } = anchors.route;
  const lanes: LaneLayout = {
    hand: 1,
    netTurn: 0,
    hubs: [],
    lanes: [{
      key: `down:${DEMO_STORY_ID}:local`,
      dir: 'down',
      other: DEMO_STORY_ID,
      d: `M ${from.x} ${from.y} L ${to.x} ${to.y}`,
      width: 2,
      length: Math.hypot(to.x - from.x, to.y - from.y),
    }],
  };
  return {
    anchors,
    model: normalizeWorldPresentationModel({
      scene,
      lanes,
      laneMotion: 'draw',
    }),
  };
}

let fixtureCache: Fixture | null = null;

function fixture(): Fixture {
  if (!fixtureCache) fixtureCache = buildFixture();
  return fixtureCache;
}

export interface SemanticGrowthDemoProps {
  readonly spriteSheet: SpriteStyleSheet | null;
  readonly artScale: number;
}

export function SemanticGrowthDemo({
  spriteSheet,
  artScale,
}: SemanticGrowthDemoProps): React.JSX.Element {
  const stable = fixture();
  const model = React.useMemo(
    () => ({ ...stable.model, spriteSheet, artScale }),
    [stable, spriteSheet, artScale],
  );
  return (
    <div className="tree-wrap semantic-growth-demo-host">
      <div className="tree-layout">
        <div className="world-frame">
          <div className="world-viewport" aria-label="semantic growth witness (persistent fixture)">
            <SemanticGrowthWorldView
              model={model}
              semanticEvents={SEMANTIC_EVENTS}
              anchors={stable.anchors}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
