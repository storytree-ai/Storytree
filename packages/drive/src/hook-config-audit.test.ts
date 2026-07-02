import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

import { auditHookConfig } from "./ambient-presence.js";

/**
 * Points the never-blocking-hooks audit at the REPO'S actual hook config, so a
 * hand-edit that registers a presence/noticeboard hook on a blocking event
 * (Stop, PreToolUse, UserPromptSubmit) fails `pnpm -r test` instead of silently
 * degrading sessions. The fixture tests in ambient-presence.test.ts prove the
 * audit's logic; this file proves the real settings files are scanned.
 */

/** repo root: packages/drive/src → four dirs up. */
const REPO_ROOT = path.resolve(fileURLToPath(import.meta.url), "..", "..", "..", "..");

// settings.local.json is gitignored (absent in CI) but a local hand-edit there
// degrades sessions just the same — scan it too when present.
const SETTINGS_FILES = [".claude/settings.json", ".claude/settings.local.json"];

for (const rel of SETTINGS_FILES) {
  test(`repo hook config: ${rel} registers no presence hooks on blocking events`, () => {
    const file = path.join(REPO_ROOT, rel);
    if (!existsSync(file)) return; // no settings file = nothing to violate
    const violations = auditHookConfig(readFileSync(file, "utf8"));
    assert.deepEqual(violations, [], `never-blocking-hooks violations in ${rel}`);
  });
}
