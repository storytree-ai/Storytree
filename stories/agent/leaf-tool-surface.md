---
id: "leaf-tool-surface"
tier: capability
story: agent
title: "Tool calls dispatch through one executor to workspace-confined real file tools"
outcome: "A leaf's tool calls dispatch through one executor to real local file tools whose every path is confined to the workspace, errors captured as tool results, never thrown."
status: mapped
proof_mode: integration-test
depends_on: [model-runtime-seam]
# Node-borne proof config (ADR-0057 keystone): authoring THIS block is what makes the capability
# inner-loop buildable — no NODE_BUILD_REGISTRY edit. EDIT-EXISTING (ADR-0057 §3 expansion C): the
# leaf authors a regression test that FAILS against current behaviour, then edits the EXISTING
# packages/agent/src/fs-tools.ts. The red is genuine and runtime: `EditFileInput` is `.strict()` and
# `#editFile` has no replace-every-occurrence path, so an `edit_file` call carrying `replace_all:true`
# is rejected as an unrecognized key (ZodError → `is_error` tool_result → file UNCHANGED) at HEAD,
# until IMPLEMENT adds the optional field + the `replaceAll` branch. `install: true` + a typecheck
# wall because fs-tools.ts imports `zod` (the proof runs in a fresh worktree — tsx + tsc need the
# lockfile-only install, ADR-0031 §2). Single LITERAL source file (no `*`), so the default node:test
# proof on the one test file is legal — no `proofCommand` (the edits-existing single-file exemption,
# ADR-0057 §3 / ADR-0087).
proof:
  command:
    file: pnpm
    args: ["--filter", "@storytree/agent", "test"]
  scope:
    testGlobs: ["packages/agent/src/**/*.test.ts"]
    sourceGlobs: ["packages/agent/src/**/*.ts"]
  real:
    testFile: "packages/agent/src/edit-file-replace-all.test.ts"
    sourceFile: "packages/agent/src/fs-tools.ts"
    scope:
      testGlobs: ["packages/agent/src/edit-file-replace-all.test.ts"]
      sourceGlobs: ["packages/agent/src/fs-tools.ts"]
    install: true
    typecheck:
      file: pnpm
      args: ["--filter", "@storytree/agent", "typecheck"]
    editsExisting: true
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

## Guidance

The brownfield slice that earns this capability a signed verdict (the next bootstrap rung toward
`healthy`): give `edit_file` an OPT-IN `replace_all` mode while keeping the ambiguous-edit refusal as
the safe default. This is additive — the default behaviour (refuse an `old_str` that appears more than
once) is unchanged; a caller must explicitly ask for replace-all.

- **The existing source —** `packages/agent/src/fs-tools.ts`. Two relevant pieces:
  - `EditFileInput = z.object({ path, old_str, new_str }).strict()` — the `.strict()` is load-bearing
    here: it makes `replace_all` an UNRECOGNIZED key today, so an `edit_file` call carrying it is
    rejected before `#editFile` runs.
  - `#editFile(input)` finds the first occurrence of `old_str`, and if it occurs more than once
    THROWS `"edit_file: old_str appears more than once … (ambiguous edit)"`. There is no path to
    replace every occurrence.
- **The new test —** `packages/agent/src/edit-file-replace-all.test.ts`. Follow the temp-dir pattern
  already in `fs-tools.test.ts`: `before` → `rootDir = await fs.mkdtemp(path.join(os.tmpdir(),
  "storytree-fs-tools-"))`, `exec = new FileToolExecutor({ rootDir })`, `after` → `fs.rm(rootDir,
  { recursive: true, force: true })`, and the `call(name, input)` helper that builds a `ToolUseBlock`
  (`{ type: "tool_use", id, name, input }`). `import { FileToolExecutor } from "./fs-tools.js"`.
- **The RED the spine observes (before IMPLEMENT) —** in the test: `write_file` a file whose content
  contains the same token three times (e.g. `"x and x and x"`), then `execute` an `edit_file` call
  with `input: { path, old_str: "x", new_str: "y", replace_all: true }`, then `read_file` it back and
  assert all three are replaced (`"y and y and y"`). Against the unedited source this FAILS: `.strict()`
  rejects `replace_all` as an unknown key → the executor returns an `is_error` tool result (caught in
  `execute`) and the file is UNCHANGED, so the read-back still shows `"x and x and x"`. A genuine
  runtime red against CURRENT behaviour. Optionally also assert the no-flag path is untouched (an
  `edit_file` with no `replace_all` against a 3× token still returns `is_error` "ambiguous edit") so
  the default-refusal stays proven.
- **The GREEN edit —** in `fs-tools.ts`, two additive changes to ONE file:
  1. add `replace_all: z.boolean().optional()` inside the `EditFileInput` `.object({ … })` (keep
     `.strict()`);
  2. in `#editFile`, destructure `replace_all` and, when it is `true`, replace EVERY occurrence
     (e.g. `original.split(old_str).join(new_str)` after the not-found guard) and return a count;
     otherwise keep the EXISTING single-unique-occurrence path with its ambiguous-edit refusal intact.

Rules:

- **Keep `replace_all` `.optional()` and keep `EditFileInput` `.strict()`.** Optional preserves every
  existing `edit_file` caller (no key supplied → the safe single-occurrence default); `.strict()` is
  exactly what makes the red real, so do not relax it.
- **The ambiguous-edit refusal is the DEFAULT, not removed.** When `replace_all` is absent or `false`
  and `old_str` occurs more than once, still throw the "ambiguous edit" error — the safety default
  must stay. This change ADDS an explicit opt-in; it never weakens the default.
- **Touch nothing else** — not the path-confinement (`resolveInRoot` / `PathEscapeError`), not the
  other tools, not `FILE_TOOLS` / `FILE_WRITE_TOOLS` shape beyond what the new optional input needs.
  (Updating the `edit_file` `FILE_TOOLS` description / input_schema to mention `replace_all` is
  in-scope and welcome, since it is the same file and the same behaviour, but optional.)
