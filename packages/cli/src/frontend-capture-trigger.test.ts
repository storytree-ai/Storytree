import { test } from "node:test";
import assert from "node:assert/strict";

import { RENDER_SURFACE_PROJECTS, renderSurfaceTrigger } from "./frontend-capture-trigger.js";
import type { AffectedScope } from "./ci-affected.js";

test("full scope fails wide — the capture fires even with no render-surface evidence", () => {
  const scope: AffectedScope = { mode: "full", reason: "a package manifest changed" };
  const verdict = renderSurfaceTrigger(scope);
  assert.equal(verdict.affected, true);
  assert.match(verdict.reason, /fails wide/);
});

test("affected scope touching the studio app fires", () => {
  const scope: AffectedScope = { mode: "affected", projects: ["studio"], reason: "x" };
  const verdict = renderSurfaceTrigger(scope);
  assert.equal(verdict.affected, true);
  assert.match(verdict.reason, /studio/);
});

test("affected scope touching a forest-world package fires", () => {
  const scope: AffectedScope = {
    mode: "affected",
    projects: ["@storytree/forest-world"],
    reason: "x",
  };
  assert.equal(renderSurfaceTrigger(scope).affected, true);
});

test("affected scope touching only unrelated packages does not fire", () => {
  const scope: AffectedScope = {
    mode: "affected",
    projects: ["@storytree/library", "@storytree/cli"],
    reason: "x",
  };
  const verdict = renderSurfaceTrigger(scope);
  assert.equal(verdict.affected, false);
  assert.match(verdict.reason, /none of them the render surface/);
});

test("affected scope with a mix of render and non-render projects still fires, naming only the touched ones", () => {
  const scope: AffectedScope = {
    mode: "affected",
    projects: ["@storytree/cli", "@storytree/app-surface"],
    reason: "x",
  };
  const verdict = renderSurfaceTrigger(scope);
  assert.equal(verdict.affected, true);
  assert.match(verdict.reason, /@storytree\/app-surface/);
  assert.doesNotMatch(verdict.reason, /@storytree\/cli/);
});

test("RENDER_SURFACE_PROJECTS names exactly the render layer + its geometry/scene packages", () => {
  assert.deepEqual(
    [...RENDER_SURFACE_PROJECTS].sort(),
    ["@storytree/app-surface", "@storytree/forest-world", "@storytree/forest-world-r3f", "studio"].sort(),
  );
});
