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
  type SemanticGrowthAnchors,
  type SemanticGrowthEvent,
} from '@storytree/app-surface';
import { buildWorld, buildRelaxedCells, worldToScene } from './TreeView.js';
import type {
  BuildActivity,
  ClaimActivity,
  DepartedClaim,
  TreeStory,
} from '../types.js';
import type { SpriteStyleSheet } from '../lib/sprite-sheet.js';

const DEMO_STORY_ID = 'semantic-growth-demo';
const NOW = new Date('2026-01-01T00:00:00.000Z');
const VEGETATION: SceneVegetationInput = {};
const NO_BUILDS: Map<string, BuildActivity[]> = new Map();
const NO_CLAIMS: Map<string, ClaimActivity[]> = new Map();
const NO_DEPARTURES: Map<string, DepartedClaim[]> = new Map();

const SEMANTIC_EVENTS: readonly SemanticGrowthEvent[] = [
  { key: 'empty' },
  { key: 'land' },
  { key: 'proposed' },
  { key: 'claimed' },
  { key: 'signed-proof' },
  { key: 'healthy' },
];

function demoStory(): TreeStory {
  return {
    id: DEMO_STORY_ID,
    title: 'Semantic growth witness',
    outcome: 'witnesses one persistent island and one planted story tree',
    status: 'proposed',
    proofMode: 'UAT',
    uatWitness: 'machine',
    dependsOn: [],
    consumedBy: [],
    capabilities: [],
  };
}

interface Fixture {
  readonly model: ReturnType<typeof normalizeWorldPresentationModel>;
  readonly anchors: SemanticGrowthAnchors;
}

function buildFixture(): Fixture {
  const world = buildWorld([demoStory()], { buildings: false });
  const relaxedCells = buildRelaxedCells(world, 'mesh', {});
  const scene = buildScene(
    worldToScene(
      world,
      relaxedCells,
      NOW,
      NO_BUILDS,
      NO_CLAIMS,
      NO_DEPARTURES,
      null,
      null,
      VEGETATION,
    ),
  );
  const territory = world.territories[0]!;
  return {
    anchors: {
      islandId: DEMO_STORY_ID,
      terrain: territory.centroid,
      storyTree: territory.treeSpot,
    },
    model: normalizeWorldPresentationModel({ scene }),
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
