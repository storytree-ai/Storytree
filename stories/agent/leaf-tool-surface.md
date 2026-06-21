---
id: "leaf-tool-surface"
tier: capability
story: agent
title: "Tool calls dispatch through one executor to workspace-confined real file tools"
outcome: "A leaf's tool calls dispatch through one executor to real local file tools whose every path is confined to the workspace, errors captured as tool results, never thrown."
status: mapped
proof_mode: integration-test
depends_on: [model-runtime-seam]
---

# The leaf tool surface — one executor, workspace-confined file tools

**Outcome —** A leaf's tool calls dispatch through one executor to real local file tools whose every
path is confined to the workspace, errors captured as tool results, never thrown.

> **Proof status (honest) — `mapped`.** `tool-executor.test.ts` (4) + `fs-tools.test.ts` (17) pass
> offline. `ToolExecutor` (`tool-executor.ts`) is the dispatch seam; `MapToolExecutor` routes a
> `ToolUseBlock` to a registered handler, awaits async handlers, and turns an unknown tool or a
> throwing handler into an `is_error` tool result (never a thrown crash). `FileToolExecutor`
> (`fs-tools.ts`) is the real local file surface (read / write / edit / list / run, `FILE_TOOLS` /
> `FILE_WRITE_TOOLS`): every path is resolved against the workspace and a path escape raises
> `PathEscapeError`, returned as a tool result. No `healthy` — no signed verdict (ADR-0020).

This capability is the leaf's hands. It depends on `model-runtime-seam` by code: `tool-executor.ts`
and `fs-tools.ts` import the model-event block types (`ToolUseBlock` / `ToolResultBlock`) and
`fs-tools.ts` imports `ModelTool` (the file tools are described to the model as `ModelTool`s) — the
tool surface is defined in the vocabulary the seam owns.

## Proof

Integration-proven against the real executor + real filesystem operations under a temp workspace
(ADR-0010 §2): a write lands, an edit applies, a path escape is refused as a tool result, a throwing
handler is captured. This is offline and deterministic (no model, no network) — exactly the
fail-closed surface the write wall is layered on top of (the spine's write-scoped decorator wraps
this executor; that decorator lives in drive-machinery).
