import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";

import { InMemoryStore } from "@storytree/storage-protocol";
import { booleanFieldsForKind, stringFieldsForKind } from "@storytree/library";

import { run } from "./commands.js";
import { booleanFromSetValue, parsedShapeOf, typeMismatchRefusal } from "./set-value.js";

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
      `dependsOn=["asset:a","asset:b"]`,
    ],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.deepEqual(await fieldOf(store, "library-edit-ceremony", "dependsOn"), [
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

// ── the boolean field, unwritable from this surface until now ────────────────
//
// The mirror of the JSON-array path above, in the other direction: there the caller sent structure
// at a prose field, here the schema wants a non-string and a `--set` value can only ever BE a
// string. Measured 2026-09-06 against `adr-0526` — a librarian pass judged an already-written
// decision belonged in the ADR-0086 calibrate-to-these set and had no way to say so, because
// `adr new --load-bearing` is a CREATION-time flag and the generic surface refused the literal with
// `loadBearing: Expected boolean, received string`.

/** A minimal accepted decision — the shape a librarian pass finds already in the store. */
async function seededAdr(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "adr-0526",
    kind: "adr",
    doc: {
      kind: "adr",
      id: "adr-0526",
      number: 526,
      title: "A decision written before anyone judged it load-bearing",
      description: "The measured case.",
      status: "accepted",
      body: "## Status\n\naccepted\n",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    },
  });
  return store;
}

test("--set on a BOOLEAN field stores a real boolean, not the literal string", async () => {
  const store = await seededAdr();
  const env = await run(
    ["library", "artifact", "edit", "adr-0526", "--set", "loadBearing=true"],
    { store, writable: true },
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(await fieldOf(store, "adr-0526", "loadBearing"), true);

  // And back down again — the flag is a tag a later pass can also REMOVE.
  const off = await run(
    ["library", "artifact", "edit", "adr-0526", "--set", "loadBearing=false"],
    { store, writable: true },
  );
  assert.equal(off.ok, true, off.body);
  assert.equal(await fieldOf(store, "adr-0526", "loadBearing"), false);
});

test("--set loadBearing tolerates the shapes a shell hands over: case and surrounding space", async () => {
  const store = await seededAdr();
  for (const literal of ["TRUE", " True ", "tRuE"]) {
    const env = await run(
      ["library", "artifact", "edit", "adr-0526", "--set", `loadBearing=${literal}`],
      { store, writable: true },
    );
    assert.equal(env.ok, true, `${literal}: ${env.body}`);
    assert.equal(await fieldOf(store, "adr-0526", "loadBearing"), true, literal);
  }
});

test("a non-boolean literal is REFUSED with the two accepted values named, and nothing is stored", async () => {
  const store = await seededAdr();
  for (const bad of ["1", "yes", "on", ""]) {
    const env = await run(
      ["library", "artifact", "edit", "adr-0526", "--set", `loadBearing=${bad}`],
      { store, writable: true },
    );
    assert.equal(env.ok, false, `"${bad}" should be refused`);
    assert.match(env.body, /is a BOOLEAN field — pass true or false/);
    assert.equal(
      await fieldOf(store, "adr-0526", "loadBearing"),
      undefined,
      `"${bad}" must leave the row untouched`,
    );
    // The refusal's `next:` is part of the envelope and no body assertion reaches it — a caller
    // refused here needs the read that shows what the field currently holds.
    assert.deepEqual(env.next, ["storytree library artifact adr-0526"]);
  }
});

test("a doc carrying NO kind is left alone — the type sets are unknown, so nothing is coerced", async () => {
  // A rendered LibraryAsset carries `category`, not `kind`, so every schema-derived type set is
  // null. The `--set` chain must fall through to the raw-string assignment rather than dereference
  // one: this is the input that tells a real null-guard apart from an absent one.
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "an-asset",
    kind: "asset",
    doc: {
      id: "an-asset",
      category: "definition",
      title: "No kind here",
      description: "A rendered asset, not a structured Knowledge doc.",
      body: "Its schema is chosen by `category`, so `kind` is absent from the doc.",
      createdAt: "2026-09-01",
      updatedAt: "2026-09-01",
    },
  });
  const env = await run(
    ["library", "artifact", "edit", "an-asset", "--set", "title=Renamed"],
    { store, writable: true },
  );
  assert.equal(env.ok, true, env.body);
  assert.equal(await fieldOf(store, "an-asset", "title"), "Renamed");
});

test("booleanFromSetValue is pure: two literals in, a refusal naming them for everything else", () => {
  assert.equal(booleanFromSetValue("loadBearing", "true"), true);
  assert.equal(booleanFromSetValue("loadBearing", "false"), false);
  assert.equal(booleanFromSetValue("loadBearing", "  TRUE  "), true);
  assert.equal(booleanFromSetValue("loadBearing", "False"), false);

  // NOT truthiness, and this is the assertion that matters: under a truthy rule the string "false"
  // is TRUE, and it would validate and persist at exit 0 with only the render to reveal it.
  for (const bad of ["1", "0", "yes", "no", "on", "off", "", "  ", "truthy"]) {
    const refusal = booleanFromSetValue("loadBearing", bad);
    assert.equal(typeof refusal, "string", `"${bad}" must not coerce`);
    assert.match(refusal as string, /pass true or false, and nothing else/);
  }
  // The refusal ECHOES what it got, because "pass true or false" alone leaves a caller who typed
  // `yes` re-reading their own command line. An empty value says so in words — an empty pair of
  // quotes is exactly what a reader cannot see.
  assert.match(booleanFromSetValue("loadBearing", "") as string, /got: \(empty\)/);
  assert.match(booleanFromSetValue("loadBearing", "   ") as string, /got: \(empty\)/);
  assert.match(booleanFromSetValue("loadBearing", "yes") as string, /got: "yes"/);
  assert.match(booleanFromSetValue("loadBearing", " 1 ") as string, /got: "1"/);
  // And it names the FIELD, so a multi-`--set` edit says which one was refused.
  assert.match(booleanFromSetValue("parked", "maybe") as string, /^"parked" is a BOOLEAN field/);
});

test("the refusal body is pinned WHOLE — every line of it is the remedy, not decoration", () => {
  // One golden over the entire message rather than a handful of `match` probes. A probe pins only
  // the words it quotes and leaves every other line free to be emptied without a test noticing —
  // and the lines a probe never reaches here are the two example COMMANDS, which is the half a
  // refused caller actually needs. Deliberately brittle: rewording this message is meant to fail
  // here, so the reword is a decision rather than a drift.
  assert.equal(
    booleanFromSetValue("loadBearing", "yes"),
    [
      `"loadBearing" is a BOOLEAN field — pass true or false, and nothing else.`,
      `got: "yes"`,
      "",
      "  storytree library artifact edit <id> --set loadBearing=true --pg",
      "  storytree library artifact edit <id> --set loadBearing=false --pg",
      "",
      "Only those two literals are read (case-insensitively). A truthy-looking value — 1, yes, on — is",
      "refused rather than guessed at, because the guess that matters is the wrong one: under a",
      `truthiness rule the string "false" is TRUE, and it would validate and persist at exit 0.`,
    ].join("\n"),
  );
});

test("booleanFieldsForKind is what the surface dispatches on, and it is schema-derived", () => {
  assert.ok(booleanFieldsForKind("adr")?.has("loadBearing"));
  assert.equal(booleanFieldsForKind("process")?.has("steps"), false, "a prose field");
  assert.equal(booleanFieldsForKind("not-a-kind"), null);

  // The boolean and string sets never overlap, so the `--set` chain's branch order cannot shadow.
  const strings = stringFieldsForKind("adr");
  for (const f of booleanFieldsForKind("adr") ?? []) {
    assert.equal(strings?.has(f), false, `${f} is boolean, so the prose guard leaves it alone`);
  }
});
