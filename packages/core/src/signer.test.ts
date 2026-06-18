import test from "node:test";
import assert from "node:assert/strict";
import { resolveSigner } from "./signer.js";
import type { SignerInputs } from "./signer.js";
import { resolveSignerFromEnv } from "./signer-env.js";

interface Case {
  name: string;
  inputs: SignerInputs;
  expect: { ok: true; signer: string } | { ok: false };
}

const cases: Case[] = [
  {
    name: "flag wins over env and git",
    inputs: { flag: "f@x", env: "e@x", gitEmail: "g@x" },
    expect: { ok: true, signer: "f@x" },
  },
  {
    name: "blank flag falls through to env",
    inputs: { flag: "   ", env: "e@x", gitEmail: "g@x" },
    expect: { ok: true, signer: "e@x" },
  },
  {
    name: "empty-string flag falls through to env",
    inputs: { flag: "", env: "e@x" },
    expect: { ok: true, signer: "e@x" },
  },
  {
    name: "undefined flag falls through to env",
    inputs: { env: "e@x" },
    expect: { ok: true, signer: "e@x" },
  },
  {
    name: "blank env falls through to git",
    inputs: { env: "  ", gitEmail: "g@x" },
    expect: { ok: true, signer: "g@x" },
  },
  {
    name: "git email used when flag and env absent",
    inputs: { gitEmail: "g@x" },
    expect: { ok: true, signer: "g@x" },
  },
  {
    name: "value is trimmed",
    inputs: { flag: "  f@x  " },
    expect: { ok: true, signer: "f@x" },
  },
  {
    name: "sandbox convention passes validation",
    inputs: { flag: "sandbox:opus@run-123" },
    expect: { ok: true, signer: "sandbox:opus@run-123" },
  },
  {
    name: "all empty -> fail closed",
    inputs: { flag: "  ", env: "", gitEmail: "   " },
    expect: { ok: false },
  },
  {
    name: "all undefined -> fail closed",
    inputs: {},
    expect: { ok: false },
  },
];

for (const c of cases) {
  test(`resolveSigner: ${c.name}`, () => {
    const result = resolveSigner(c.inputs);
    assert.equal(result.ok, c.expect.ok);
    if (c.expect.ok && result.ok) {
      assert.equal(result.signer, c.expect.signer);
    }
    if (!c.expect.ok && !result.ok) {
      assert.match(result.error, /signer could not be resolved/);
    }
  });
}

test("resolveSignerFromEnv: explicit flag wins regardless of env/git", () => {
  const result = resolveSignerFromEnv({ flag: "explicit@x" });
  assert.deepEqual(result, { ok: true, signer: "explicit@x" });
});

test("resolveSignerFromEnv: reads STORYTREE_SIGNER when no flag", () => {
  const prev = process.env.STORYTREE_SIGNER;
  process.env.STORYTREE_SIGNER = "env-signer@x";
  try {
    const result = resolveSignerFromEnv();
    assert.deepEqual(result, { ok: true, signer: "env-signer@x" });
  } finally {
    if (prev === undefined) delete process.env.STORYTREE_SIGNER;
    else process.env.STORYTREE_SIGNER = prev;
  }
});
