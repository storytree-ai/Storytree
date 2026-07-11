// compose-build-command: the pure string a forest-map Build click seeds into the terminal
// (ADR-0174 premise — the app composes the intent, the real tool runs it). This mirrors the
// in-app dispatch's ACTUAL behaviour (routedBuildRunner: real + pg for both kinds — ADR-0144
// flipped the node branch off the old synthetic --live smoke), not a reinvention of it: the
// story-kind command opens the auto-merging PR by CLI default (ADR-0136), the node-kind command
// parks a claude/real/<unit>-<run> branch by CLI default (ADR-0031/ADR-0136) — neither `openPr`
// nor any flag beyond `--real --store pg` is encoded here, by design (slow growth).
//
// Three isolatable assertions over one pure function: the story-scope shape, the node-scope
// shape, and unit-id interpolation (so the seeded command targets the CLICKED node, not a
// hardcoded stand-in). Runner: VITEST (the studio suite) — offline, deterministic, no seam.

import { describe, it, expect } from 'vitest';
import { composeBuildCommand } from './buildCommand';

describe('composeBuildCommand — the CLI command a Build click seeds into the terminal', () => {
  it('cbc-composes-story-real-build: scope story → pnpm storytree story build <unitId> --real --store pg', () => {
    expect(composeBuildCommand({ unitId: 'story-alpha', scope: 'story' })).toBe(
      'pnpm storytree story build story-alpha --real --store pg',
    );
  });

  it('cbc-composes-node-real-build: scope node → pnpm storytree node build <unitId> --real --store pg', () => {
    expect(composeBuildCommand({ unitId: 'node-beta', scope: 'node' })).toBe(
      'pnpm storytree node build node-beta --real --store pg',
    );
  });

  it('cbc-embeds-the-unit-id-verbatim: interpolates the CLICKED unit id, not a hardcoded stand-in — a distinct id per scope', () => {
    expect(composeBuildCommand({ unitId: 'compose-build-command', scope: 'story' })).toBe(
      'pnpm storytree story build compose-build-command --real --store pg',
    );
    expect(composeBuildCommand({ unitId: 'map-build-seeds-terminal', scope: 'node' })).toBe(
      'pnpm storytree node build map-build-seeds-terminal --real --store pg',
    );
  });
});
