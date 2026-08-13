import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCodexAgentFile } from "@storytree/library/store";
import { InMemoryStore } from "@storytree/storage-protocol";

import { essentialsGateFailures, explainAgentCheckFailure } from "./build-agents.js";

// ---------- the failure REPORT: a remedy that does not work is not printed alone ----------
//
// `gate-checks-name-the-remedy-that-works` (gate-self-report-honesty-arc). `check:agents` failed on
// drift the instant it found any, so the essentials gate ran only on runs where drift was empty.
// The combined case therefore printed `stale: <file>` — the routine sibling-race signature whose
// documented remedy is `pnpm build:agents` + commit — while the check ALREADY HELD the fact that
// regenerating would hand back a different, unfixable red. Neither predicate changed; only what the
// run is allowed to claim about itself.

test("drift alone still prints the routine remedy, unqualified", () => {
  const message = explainAgentCheckFailure({
    drift: ["stale:   .claude/agents/planner.md"],
    essentialsFailures: [],
  });
  assert.ok(message);
  assert.match(message, /Regenerate with `pnpm build:agents` and commit/);
  assert.match(message, /planner\.md/);
  assert.doesNotMatch(message, /WILL NOT CLEAR/, "nothing here says the remedy fails — it works");
});

test("an essentials breach alone reads as itself, not as a stale view", () => {
  const message = explainAgentCheckFailure({
    drift: [],
    essentialsFailures: ["claude: planner exceeds the essentials budget"],
  });
  assert.ok(message);
  assert.match(message, /essentials gate FAILED/);
  assert.doesNotMatch(message, /STALE/);
});

test("drift PLUS a breach says regenerating will not clear it, and whose it is", () => {
  const message = explainAgentCheckFailure({
    drift: ["stale:   .claude/agents/planner.md"],
    essentialsFailures: ["claude: planner exceeds the essentials budget"],
  });
  assert.ok(message);
  // The whole point: the routine remedy is named as INSUFFICIENT rather than offered bare.
  assert.match(message, /REGENERATING WILL NOT CLEAR THIS RUN/);
  assert.match(message, /replaces\s+this red with a different one/);
  // …and the owner is named, because no other session can clear a live-store breach for you.
  assert.match(message, /LIVE STORE/);
  assert.match(message, /whoever holds the live agent edit/);
  assert.match(message, /storytree library artifact edit/, "it names the write that actually helps");
  // Both findings survive into the report — the session should not have to run it twice to see them.
  assert.match(message, /planner\.md/);
  assert.match(message, /exceeds the essentials budget/);
});

test("a clean run reports nothing to fail on", () => {
  assert.equal(explainAgentCheckFailure({ drift: [], essentialsFailures: [] }), null);
});

test("build:agents checks Codex TOML content for essentials prompt violations", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "codex-agent",
    kind: "agent",
    doc: {
      kind: "agent",
      title: "Codex Agent",
      description: "a Codex projection whose prompt leaks a full referenced body",
      oneLine: "The Codex agent proves its native TOML is gated.",
      role: "### Leaked Principle  [principle]\n\nThis full body must fail the essentials gate.",
      outcome: "Codex receives only the thin essentials prompt.",
      context: [],
      tools: "none",
      workflow: "orient, then stop.",
      references: [],
    },
  });

  const rendered = await renderCodexAgentFile(store, "codex-agent");
  assert.equal(rendered.ok, true);
  if (!rendered.ok) return;
  assert.match(rendered.content, /^name = "codex-agent"/);
  assert.match(
    rendered.content,
    /^# Storytree model policy: inherit; no Codex model is pinned \(Library model tier: unset\)\.$/m,
  );
  assert.doesNotMatch(rendered.content, /^model(?:_reasoning_effort)?\s*=/m);
  assert.match(rendered.content, /^## Codex runtime$/m);
  assert.match(rendered.content, /^### Leaked Principle  \[principle\]$/m);

  const failures = await essentialsGateFailures(store, ["codex-agent"], [
    {
      label: ".codex/agents",
      extension: "toml",
      files: new Map([["codex-agent.toml", rendered.content]]),
    },
  ]);

  assert.ok(
    failures.some(
      (failure) => failure.startsWith(".codex/agents:") && failure.includes("inlines a full ref BODY"),
    ),
    `expected the Codex TOML prompt violation to fail the gate, got: ${failures.join("\n")}`,
  );
});
