// buildingDrawer — the PURE state math for the forest's left-rail/drawer (owner ask
// 2026-06-21), under ADR-0076's distributed-building model. The distributed bookshelf
// (ADR-0076) gave a cleaner forest but lost the library's clickable-island signal and
// its health hue; the drawer restores both in a LEFT panel so the forest stays clean —
// NOT a revert to a connected island.
//
// Why a standalone, framework-free module (mirrors solarLayout / buildingLayout /
// worldSettings):
//   • Pure data math (no React, no DOM) → unit-testable in vitest (buildingDrawer.test.ts)
//     — Stage-1 red-green of the rail roster + the one-open-at-a-time toggle (ADR-0070).
//     The drawer's APPEARANCE is owner-attested, never self-signed here.

import type { TreeStory } from '../types';

/**
 * The building-tagged stories that populate the left rail, in input order. A story is a
 * building when `render: building` (frontmatter, ADR-0076 §2 → `TreeStory.building`).
 * `library` is the first; the rail lists every one. Tolerates a null list (pre-load).
 */
export function buildingStories(stories: readonly TreeStory[] | null): TreeStory[] {
  if (!stories) return [];
  return stories.filter((s) => s.building === true);
}

/**
 * The next drawer selection given the currently-open building id and the one just clicked
 * — ONE building open at a time:
 *   • none open        → open the clicked one
 *   • clicked the open → collapse (null)
 *   • clicked another  → switch to it
 */
export function nextDrawerSelection(open: string | null, clicked: string): string | null {
  return open === clicked ? null : clicked;
}
