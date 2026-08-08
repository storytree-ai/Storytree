import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { stringFieldsForKind } from "@storytree/library";

import { run } from "./commands.js";
import { parsedShapeOf, typeMismatchRefusal } from "./set-value.js";

/**
 * The MEASURED artifact (2026-08-06): a `process` whose `steps` is a KIND_SPECS PROSE field holding
 * newline-separated numbered lines — array-SHAPED to a reader of the render, a string to the schema.
 */
const STEPS = [
  "1. Read the artifact first.",
  "2. Edit the live row.",
  "3. Regenerate the projections.",
].join("\n");

async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "library-edit-ceremony",
    kind: "process",
    doc: {
      kind: "process",
      id: "library-edit-ceremony",
      title: "Library edit ceremony",
      description: "How a live artifact edit lands.",
      statement: "Edit the live row, then regenerate the projections.",
      trigger: "You are about to change a Library artifact.",
      steps: STEPS,
      surfaces: "The CLI's `library artifact edit --pg`.",
      failureModes: "A stale projection left behind by a skipped regeneration.",
      references: [],
      createdAt: "2026-08-01",
      updatedAt: "2026-08-01",
    },
  });
  return store;
}

/** The stored value of one field, for the byte-identical assertions. */
async function fieldOf(store: InMemoryStore, id: string, field: string): Promise<unknown> {
  return ((await store.getDoc(id))?.doc as Record<string, unknown>)[field];
}

// ── the measured reproduction, end to end ────────────────────────────────────

test("a JSON array sent to a PROSE field is refused, not stored at exit 0", async () => {
  const store = await seeded();
  const payload = JSON.stringify(["Read the artifact first.", "Edit the live row."]);
  const env = await run(
    ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps=${payload}`],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /"steps" on a process is a PROSE field \(a string\), and this value is a JSON array/);
  assert.match(env.body, /newline-joined prose/);
  assert.match(env.body, /A list-shaped RENDER does not mean an array-typed FIELD/);
  assert.equal(await fieldOf(store, "library-edit-ceremony", "steps"), STEPS, "nothing was written");
});

test("the same payload from a FILE is refused too — @path resolves before the judgement", async () => {
  const store = await seeded();
  const dir = mkdtempSync(path.join(tmpdir(), "set-value-"));
  try {
    const file = path.join(dir, "steps.json");
    writeFileSync(file, JSON.stringify(["one", "two"]), "utf8");
    const env = await run(
      ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps=@${file}`],
      { store, writable: true },
    );
    assert.equal(env.ok, false);
    assert.match(env.body, /is a JSON array/);
    assert.equal(await fieldOf(store, "library-edit-ceremony", "steps"), STEPS);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("the newline-joined write still lands, byte-identically — the fix refuses nothing honest", async () => {
  const store = await seeded();
  const rewritten = `${STEPS}\n4. Debrief the owner.`;
  const env = await run(
    ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps=${rewritten}`],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /updated library-edit-ceremony \(set steps\)/);
  assert.equal(await fieldOf(store, "library-edit-ceremony", "steps"), rewritten);
});

test("a JSON OBJECT headed at a prose field is refused the same way", async () => {
  const store = await seeded();
  const env = await run(
    ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps={"1":"read"}`],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /is a JSON object/);
  assert.match(env.body, /not its structured source/);
});

test("an ARRAY-typed field still takes its JSON array — the two paths do not collide", async () => {
  const store = await seeded();
  const env = await run(
    [
      "library",
      "artifact",
      "edit",
      "library-edit-ceremony",
      "--set",
      `references=["asset:a","asset:b"]`,
    ],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.deepEqual(await fieldOf(store, "library-edit-ceremony", "references"), [
    "asset:a",
    "asset:b",
  ]);
});

test("prose that merely CONTAINS brackets or braces is untouched", async () => {
  const store = await seeded();
  const prose = "See [ADR-0302](docs) — the shape is { field: value } in the schema.";
  const env = await run(
    ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps=${prose}`],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.equal(await fieldOf(store, "library-edit-ceremony", "steps"), prose);
});

test("the refusal points at the read that would have prevented it", async () => {
  const store = await seeded();
  const env = await run(
    ["library", "artifact", "edit", "library-edit-ceremony", "--set", `steps=["a"]`],
    { store, writable: true },
  );
  assert.ok(
    (env.next ?? []).some((n) => n.includes("--raw steps")),
    "`--raw <field>` is the reader that shows the STORED value rather than the render",
  );
});

// ── the pure judge ───────────────────────────────────────────────────────────

test("parsedShapeOf separates a structured payload from a scalar or prose", () => {
  assert.equal(parsedShapeOf(`["a","b"]`), "array");
  assert.equal(parsedShapeOf(`  {"a":1}  `), "object");
  assert.equal(parsedShapeOf("42"), "scalar-or-prose", "a number is the caller's two characters");
  assert.equal(parsedShapeOf("true"), "scalar-or-prose");
  assert.equal(parsedShapeOf(`"quoted"`), "scalar-or-prose");
  assert.equal(parsedShapeOf("null"), "scalar-or-prose");
  assert.equal(parsedShapeOf("[not json"), "scalar-or-prose");
  assert.equal(parsedShapeOf("1. read\n2. edit"), "scalar-or-prose");
  assert.equal(parsedShapeOf(""), "scalar-or-prose");
});

test("typeMismatchRefusal fires only for a STRING-declared field", () => {
  const stringFields = new Set(["steps"]);
  assert.notEqual(
    typeMismatchRefusal({ kind: "process", field: "steps", value: `["a"]`, stringFields }),
    null,
  );
  assert.equal(
    typeMismatchRefusal({ kind: "process", field: "references", value: `["a"]`, stringFields }),
    null,
    "an array field is the caller's JSON-array path, not a mismatch",
  );
  assert.equal(
    typeMismatchRefusal({ kind: "process", field: "steps", value: "1. read", stringFields }),
    null,
  );
  assert.equal(
    typeMismatchRefusal({ kind: "asset", field: "steps", value: `["a"]`, stringFields: null }),
    null,
    "a non-Knowledge kind declares no field types, so nothing is judged",
  );
});

test("stringFieldsForKind reads the real schema — prose sections in, arrays and enums out", () => {
  const process = stringFieldsForKind("process");
  assert.ok(process?.has("steps"), "a KIND_SPECS prose section");
  assert.ok(process?.has("title"), "a string common");
  assert.equal(process?.has("references"), false, "an array field");

  const friction = stringFieldsForKind("friction");
  assert.ok(friction?.has("routeReason"));
  assert.equal(friction?.has("route"), false, "an enum-fenced field refuses off-set values itself");
  assert.equal(friction?.has("reinforcedBy"), false, "an array field");

  const agent = stringFieldsForKind("agent");
  assert.equal(agent?.has("rules"), false, "a refList field is an array of asset: refs");

  assert.equal(stringFieldsForKind("not-a-kind"), null);
});
