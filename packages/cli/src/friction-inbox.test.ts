import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { test } from "node:test";

import { validateInboxDir } from "./friction.js";

/**
 * The friction-inbox gate (ADR-0168 D3): every `*.json` staged in `docs/friction-inbox/` must validate
 * against the `Friction` schema, fail-closed. It lives in `pnpm -r test` (not a DB-backed check) so it
 * runs in the LOCAL gate AND in CI — the remote 443-only sessions that produce these staging files may
 * never run the full local `pnpm gate`, so CI is where a malformed staging file must be caught before
 * merge. The pure fail-closed logic (bad JSON / bad schema / wrong kind → offender) is unit-tested in
 * friction.test.ts against temp dirs; this asserts the real committed dir is clean.
 */

// This file sits at packages/cli/src/ — three levels up is the repo root.
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const inboxDir = path.join(repoRoot, "docs", "friction-inbox");

test("every docs/friction-inbox staging file validates as Friction (fail-closed)", () => {
  const offenders = validateInboxDir(inboxDir);
  assert.deepEqual(
    offenders,
    [],
    offenders.length === 0
      ? "clean"
      : `malformed friction-inbox staging file(s):\n${offenders.map((o) => `  ✗ ${o.file}: ${o.error}`).join("\n")}\n` +
          "Fix or remove the staging file (it must be a valid `friction` doc — see docs/friction-inbox/README.md).",
  );
});
