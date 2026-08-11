import assert from "node:assert/strict";
import { test } from "node:test";

import { renderCodexAgentFile } from "@storytree/library/store";
import { InMemoryStore } from "@storytree/storage-protocol";

import { essentialsGateFailures } from "./build-agents.js";

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
