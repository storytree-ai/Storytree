import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, readFileSync, existsSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  adrCommand,
  kebabSlug,
  parseEdges,
  maxAdrNumber,
  scaffold,
  type AdrAllocatorLike,
  type AdrCommandDeps,
} from "./adr.js";

// ---- pure helpers --------------------------------------------------------------------------

test("kebabSlug lowercases, hyphenates, strips junk, and caps length", () => {
  assert.equal(kebabSlug("Hosted studio may wake its own DB!"), "hosted-studio-may-wake-its-own-db");
  assert.equal(kebabSlug("  ADR:  Foo/Bar  "), "adr-foo-bar");
  assert.equal(kebabSlug("***"), "");
  assert.ok(kebabSlug("x".repeat(200)).length <= 60);
});

test("parseEdges parses comma/space lists of positive ints, dropping junk", () => {
  assert.deepEqual(parseEdges("42"), [42]);
  assert.deepEqual(parseEdges("42, 43 7"), [42, 43, 7]);
  assert.deepEqual(parseEdges("0, -1, abc, 5"), [5]); // 0 and negatives and non-numbers dropped
  assert.deepEqual(parseEdges(undefined), []);
});

test("maxAdrNumber reads the highest NNNN- on disk (0 when none/missing)", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "adr-max-"));
  try {
    assert.equal(maxAdrNumber(dir), 0);
    writeFileSync(path.join(dir, "0042-a.md"), "x");
    writeFileSync(path.join(dir, "0046-b.md"), "x");
    writeFileSync(path.join(dir, "notes.md"), "x"); // not an ADR — ignored
    assert.equal(maxAdrNumber(dir), 46);
    assert.equal(maxAdrNumber(path.join(dir, "nope")), 0); // missing dir → 0
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("scaffold emits proposed frontmatter + H1 + sections, with optional edges", () => {
  const plain = scaffold(50, "Do the thing", { supersedes: [], amends: [] });
  assert.match(plain, /^---\nstatus: proposed\n---\n/);
  assert.match(plain, /# ADR-0050: Do the thing/);
  assert.match(plain, /## Status/);
  assert.match(plain, /## Decision/);
  assert.doesNotMatch(plain, /supersedes:/);

  const edged = scaffold(51, "Edged", { supersedes: [42], amends: [7, 8] });
  assert.match(edged, /supersedes: \[42\]/);
  assert.match(edged, /amends: \[7, 8\]/);
  assert.match(edged, /\*\*Supersedes\*\* ADR-0042/);
  assert.match(edged, /\*\*Amends\*\* ADR-0007, ADR-0008/);
});

// ---- adr new / next ------------------------------------------------------------------------

/** A fake allocator that always returns a fixed number and records what it was asked. */
function fakeAllocator(number: number): { allocator: AdrAllocatorLike; seen: Parameters<AdrAllocatorLike["allocate"]>[0][] } {
  const seen: Parameters<AdrAllocatorLike["allocate"]>[0][] = [];
  return {
    allocator: {
      allocate: async (a) => {
        seen.push(a);
        return { number };
      },
    },
    seen,
  };
}

function withDecisionsDir(fn: (dir: string) => void | Promise<void>): Promise<void> {
  const dir = mkdtempSync(path.join(tmpdir(), "adr-new-"));
  return Promise.resolve(fn(dir)).finally(() => rmSync(dir, { recursive: true, force: true }));
}

const depsFor = (dir: string, allocator: AdrAllocatorLike | null): AdrCommandDeps => ({
  allocator,
  decisionsDir: dir,
  branch: "claude/test",
  actor: "tester",
});

test("adr new --pg: reserves from the allocator, scaffolds NNNN-slug.md, no offline warning", async () => {
  await withDecisionsDir(async (dir) => {
    writeFileSync(path.join(dir, "0046-prior.md"), "x");
    const { allocator, seen } = fakeAllocator(50);
    const env = await adrCommand("new", { title: "Wake the DB" }, depsFor(dir, allocator));
    assert.equal(env.ok, true);
    // localMax (46) + slug + branch + actor were passed to the allocator.
    assert.deepEqual(seen[0], { localMax: 46, slug: "wake-the-db", branch: "claude/test", actor: "tester" });
    const file = path.join(dir, "0050-wake-the-db.md");
    assert.ok(existsSync(file), "the scaffold file was written");
    assert.match(readFileSync(file, "utf8"), /# ADR-0050: Wake the DB/);
    assert.match(env.body, /reserved in the DB/);
    assert.doesNotMatch(env.body, /OFFLINE/);
  });
});

test("adr new offline (no allocator): falls back to max+1 and warns it is NOT reserved", async () => {
  await withDecisionsDir(async (dir) => {
    writeFileSync(path.join(dir, "0049-prior.md"), "x");
    const env = await adrCommand("new", { title: "Some Title" }, depsFor(dir, null));
    assert.equal(env.ok, true);
    assert.ok(existsSync(path.join(dir, "0050-some-title.md")), "max+1 = 0050 scaffolded");
    assert.match(env.body, /OFFLINE/);
    assert.match(env.body, /NOT reserved/);
  });
});

test("adr new refuses without a title", async () => {
  await withDecisionsDir(async (dir) => {
    const env = await adrCommand("new", {}, depsFor(dir, null));
    assert.equal(env.ok, false);
    assert.match(env.body, /needs a title/);
    assert.equal(readdirSync(dir).length, 0, "no file written");
  });
});

test("adr new refuses to overwrite an existing file", async () => {
  await withDecisionsDir(async (dir) => {
    const { allocator } = fakeAllocator(50);
    writeFileSync(path.join(dir, "0050-wake-the-db.md"), "already here");
    const env = await adrCommand("new", { title: "Wake the DB" }, depsFor(dir, allocator));
    assert.equal(env.ok, false);
    assert.match(env.body, /already exists/);
    assert.equal(readFileSync(path.join(dir, "0050-wake-the-db.md"), "utf8"), "already here");
  });
});

test("adr new surfaces an allocator failure as a clear error (db down)", async () => {
  await withDecisionsDir(async (dir) => {
    const failing: AdrAllocatorLike = {
      allocate: async () => {
        throw new Error("connection terminated");
      },
    };
    const env = await adrCommand("new", { title: "X" }, depsFor(dir, failing));
    assert.equal(env.ok, false);
    assert.match(env.body, /couldn't reserve an ADR number/);
    assert.match(env.body, /connection terminated/);
    assert.equal(readdirSync(dir).length, 0, "no file written when reservation failed");
  });
});

test("adr next --pg reserves a number; offline it only peeks with a warning", async () => {
  await withDecisionsDir(async (dir) => {
    writeFileSync(path.join(dir, "0046-p.md"), "x");
    const { allocator } = fakeAllocator(47);
    const reserved = await adrCommand("next", {}, depsFor(dir, allocator));
    assert.equal(reserved.ok, true);
    assert.match(reserved.body, /ADR-0047 reserved/);

    const peek = await adrCommand("next", {}, depsFor(dir, null));
    assert.equal(peek.ok, false);
    assert.match(peek.body, /0047/);
    assert.match(peek.body, /NOT reserved/);
  });
});

test("adr help (no sub) and an unknown sub both return guidance", async () => {
  await withDecisionsDir(async (dir) => {
    const help = await adrCommand(undefined, {}, depsFor(dir, null));
    assert.equal(help.ok, true);
    assert.match(help.body, /storytree adr/);
    const unknown = await adrCommand("frobnicate", {}, depsFor(dir, null));
    assert.equal(unknown.ok, false);
    assert.match(unknown.body, /unknown adr command/);
  });
});
