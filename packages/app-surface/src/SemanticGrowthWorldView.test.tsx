// @vitest-environment jsdom

import React from 'react';
import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { buildScene, type SceneInput, type SceneTrailsInput } from '@storytree/forest-world';
import { normalizeWorldPresentationModel } from './WorldSceneView.js';
import { SemanticGrowthWorldView, type SemanticGrowthFrame } from './SemanticGrowthWorldView.js';

const KEYS = ['empty', 'land', 'proposed', 'claimed', 'signed-proof', 'healthy'] as const;

const NO_TRAILS: SceneTrailsInput = {
  segments: [],
  edges: [],
  caves: [],
  dropped: [],
};

function frames(): readonly SemanticGrowthFrame[] {
  return KEYS.map((key) => {
    const input: SceneInput = {
      offset: { x: -20, y: -10 },
      width: 180,
      height: 140,
      empties: [],
      relaxedCells: [],
      drawTiles: [],
      wheatSets: [new Set()],
      trails: NO_TRAILS,
      territories: [],
    };
    return { key, model: normalizeWorldPresentationModel({ scene: buildScene(input) }) };
  });
}

describe('SemanticGrowthWorldView', () => {
  it('holds the supplied representative world framing stable while navigating every semantic frame', () => {
    const framing = { x: -36, y: -24, width: 252, height: 188 };
    const props = { frames: frames(), framing } as React.ComponentProps<typeof SemanticGrowthWorldView> & {
      readonly framing: typeof framing;
    };
    const view = render(<SemanticGrowthWorldView {...props} />);
    const expectedViewBox = '-36 -24 252 188';

    for (const key of KEYS) {
      expect(view.container.querySelector('section')?.getAttribute('data-semantic-growth-frame')).toBe(key);
      expect(view.getByLabelText(`Semantic growth: ${key}`).getAttribute('viewBox')).toBe(expectedViewBox);
      fireEvent.click(view.getByRole('button', { name: 'Next' }));
    }
  });
});
