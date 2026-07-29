import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { InMemoryStore } from "@storytree/storage-protocol";
import { loadCorpus } from "@storytree/library/store";

import { run } from "./commands.js";
import { formatEnvelope } from "./envelope.js";

/**
 * Offline tests (ADR-0023): seed an InMemoryStore from the studio data files via loadCorpus — no
 * Cloud SQL, no API key — and drive `run` exactly as `main` does. Asserts the choose-your-own-
 * adventure contract: a map with a total, drill-in to one artifact, list a category, and that misses
 * are guidance (ok:false + next), never throws.
 */
async function seeded(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await loadCorpus(store);
  return store;
}

test("library dashboard reports a total + categories and maps artifacts by id", async () => {
  const env = await run(["library"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /Library: OK — \d+ artifacts across \d+ categories\./);
  assert.match(env.body, /edit-first-curation/);
  // The envelope always carries `next` branches.
  assert.match(formatEnvelope(env), /\nnext:\n/);
});

test("artifact <id> prints the artifact with its id and body", async () => {
  const env = await run(["library", "artifact", "edit-first-curation"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /id: edit-first-curation/);
  assert.match(env.body, /[Ee]dit/);
});

test("artifact <id> given an offerId prints a follow-up command per FOLLOWABLE ref, each carrying it", async () => {
  // The CLI-side half of ADR-0260 D3 (glue, ADR-0158 — the proof lives in the capability's own file
  // pair). `offerId` is pre-minted in main.ts so the id PRINTED here is the id capture RECORDS.
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "offering-thing",
    kind: "definition",
    doc: {
      kind: "definition",
      id: "offering-thing",
      title: "Offering Thing",
      description: "offers two assets and one doc",
      body: "b",
      references: ["asset:merge-ceremony", "doc:decisions/0260-a-thing.md", "asset:arc"],
    },
  });

  const withOffer = await run(["library", "artifact", "offering-thing"], {
    store,
    offerId: "candidate-set:visit-x",
  });
  assert.equal(withOffer.ok, true);
  assert.deepEqual(withOffer.next, [
    "storytree library tree focus offering-thing   (its local DAG)",
    "storytree library artifact edit offering-thing   (coming soon)",
    // the ordinary nav is untouched and the offer follow-ups are APPENDED — one per followable ref,
    // in authored order, each naming the same offer. The `doc:` ref gets none: it resolves to a file,
    // not to a CLI read, so there is no command that could follow it (the declared D7 caveat).
    "storytree library artifact merge-ceremony --from-offer candidate-set:visit-x",
    "storytree library artifact arc --from-offer candidate-set:visit-x",
  ]);

  // Without one — every test, and every run that will record no offer — the nav is exactly what it
  // always was. A follow-up carrying an id nothing recorded is an id an agent can return.
  const withoutOffer = await run(["library", "artifact", "offering-thing"], { store });
  assert.deepEqual(withoutOffer.next, [
    "storytree library tree focus offering-thing   (its local DAG)",
    "storytree library artifact edit offering-thing   (coming soon)",
  ]);
});

test("artifact <id> for a process DERIVES its next: from branch-edges (ADR-0161 process graph)", async () => {
  // Fixture-only (inc 7b): no real process carries branchEdges yet. A body-bearing process doc renders
  // through viewArtifact's pass-through path; branchEdges ride along and drive the derived next:.
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "demo-process",
    kind: "process",
    doc: {
      kind: "process",
      id: "demo-process",
      title: "Demo Process",
      description: "a process with a branch-edge graph",
      body: "The ceremony.",
      references: [],
      branchEdges: [
        { ref: "asset:merge-ceremony", label: "when green" },
        { ref: "asset:pull-based-context" },
      ],
    },
  });
  const env = await run(["library", "artifact", "demo-process"], { store });
  assert.equal(env.ok, true);
  assert.match(env.body, /id: demo-process/);
  // The next: IS the derived branch-edge pulls, in order — the `asset:` prefix stripped by the shared
  // emitter, the label shown in parens — NOT the hand-authored tree-focus/edit nav.
  assert.deepEqual(env.next, [
    "storytree library artifact merge-ceremony   (when green)",
    "storytree library artifact pull-based-context",
  ]);
});

test("artifact <id> for a process with NO branch-edges keeps the hand-authored nav (honest fallback)", async () => {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "bare-process",
    kind: "process",
    doc: {
      kind: "process",
      id: "bare-process",
      title: "Bare",
      description: "no graph",
      body: "b",
      references: [],
    },
  });
  const env = await run(["library", "artifact", "bare-process"], { store });
  assert.equal(env.ok, true);
  assert.ok(
    env.next?.some((n) => n.includes("tree focus")),
    "a graph-less process falls back to the hand-authored nav",
  );
});

test("artifact list <category> returns rows and a doctrine pointer", async () => {
  const env = await run(["library", "artifact", "list", "principle"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /principle {2}\(\d+\)/);
  assert.ok(env.doctrine && env.doctrine.length > 0, "list emits a doctrine pointer");
});

test("the doctrine pointers are library-sourced (not restated prose) — top help, library help, dashboard", async () => {
  const store = await seeded();
  for (const argv of [[], ["library", "--help"], ["library"]]) {
    const env = await run(argv, { store });
    assert.equal(env.ok, true, `ok: storytree ${argv.join(" ")}`);
    // each surfaces the just-in-time doctrine as a POINTER into the library, with the explore command
    const doctrine = (env.doctrine ?? []).join("\n");
    assert.match(
      doctrine,
      /pull-based-context-architecture — .+ {2}\(storytree library artifact pull-based-context-architecture\)/,
      `storytree ${argv.join(" ")} surfaces a library-sourced doctrine pointer`,
    );
    // the old inline doctrine sentence is gone from the body (no restated prose)
    assert.doesNotMatch(env.body, /choose-your-own-adventure/);
  }
});

test("unknown id is guidance (ok:false + next), not a throw", async () => {
  const env = await run(["library", "artifact", "does-not-exist"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "does-not-exist"/);
  assert.ok(env.next && env.next.length > 0);
});

test("unknown category lists the available categories", async () => {
  const env = await run(["library", "artifact", "list", "bogus"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown category "bogus"\. available categories:/);
});

test("an unknown area is guided back to library", async () => {
  const env = await run(["wat"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown area "wat"/);
});

test("the adopt area: bare shows help, `adopt plan` needs a story id, and `story adopt-plan` redirects", async () => {
  const store = await seeded();
  // bare `adopt` shows help listing both actions (the run entry + the offline plan)
  const help = await run(["adopt"], { store });
  assert.equal(help.ok, true);
  assert.match(help.body, /storytree adopt <story-id> --pg/);
  assert.match(help.body, /storytree adopt plan <story-id>/);
  // `adopt plan` with no story id is guidance, not a throw
  const plan = await run(["adopt", "plan"], { store });
  assert.equal(plan.ok, false);
  assert.match(plan.body, /adopt plan needs a story id/);
  // the old `story adopt-plan` path is redirected, not silently broken (the reshape moved it under `adopt`)
  const moved = await run(["story", "adopt-plan"], { store });
  assert.equal(moved.ok, false);
  assert.match(moved.body, /adoption-plan moved to: storytree adopt plan/);
  assert.ok((moved.next ?? []).some((n) => /storytree adopt plan/.test(n)));
});

test("top help and the unknown-area guidance both list the adopt area", async () => {
  const store = await seeded();
  const top = await run([], { store });
  assert.equal(top.ok, true);
  assert.match(top.body, /^\s*adopt\b/m, "top help lists the adopt area");
  const unknown = await run(["wat"], { store });
  assert.equal(unknown.ok, false);
  // the area roster is consistent — it carries adopt, the new `build` workflow (ADR-0118, with
  // node/story as its back-compat aliases), and the coverage-honesty check (ADR-0020).
  assert.match(unknown.body, /gate, adopt, build, coverage, node/);
  assert.match(unknown.body, /story, drift, adr/);
});

test("the CLI refuses --store memory for a build — there is no run-without-persisting mode (ADR-0081)", async () => {
  // ADR-0081 (amends 0060) removed the in-memory verdict store from the build SURFACE: a --live/--real
  // build always persists so real work feeds the studio, and a --dry-run is already in-memory. The
  // guard fires in the dispatch BEFORE any DB/leaf is touched (so this offline test needs neither).
  // The internal `verdictStore: "memory"` test seam is unaffected — it is not reachable from argv.
  const store = await seeded();
  for (const argv of [
    ["node", "build", "library-cli", "--live", "--store", "memory"],
    ["story", "build", "library", "--real", "--store", "memory"],
    ["node", "build", "library-cli", "--dry-run", "--store", "memory"],
  ]) {
    const env = await run(argv, { store });
    assert.equal(env.ok, false, `expected a refusal for: storytree ${argv.join(" ")}`);
    assert.match(env.body, /--store memory/);
    assert.match(env.body, /no longer|removed|always persist/i);
  }
});

test("tree focus <id> renders the node's outbound source refs", async () => {
  // glossary-wins references doc: pointers (ADRs) — outbound 'source' edges.
  const env = await run(["library", "tree", "focus", "glossary-wins"], { store: await seeded() });
  assert.equal(env.ok, true);
  assert.match(env.body, /— tree focus/);
  assert.match(env.body, /outbound/);
  assert.match(env.body, /source — surfaced on demand/);
});

test("tree focus shows inbound intra-library edges (back-edge scan)", async () => {
  // the `trunk` definition has `asset:approval-gated-trunk`, so focusing the target sees it inbound.
  const env = await run(["library", "tree", "focus", "approval-gated-trunk"], {
    store: await seeded(),
  });
  assert.equal(env.ok, true);
  assert.match(env.body, /inbound/);
  assert.match(env.body, /← trunk/);
});

test("tree focus on a missing id is guidance, not a throw", async () => {
  const env = await run(["library", "tree", "focus", "ghost"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost" to focus/);
});

const NEW_DOC = JSON.stringify({
  id: "cli-test-note",
  category: "definition",
  title: "CLI test note",
  description: "a throwaway artifact created by a test",
  body: "## What it is\n\nA test.",
  references: [],
});

test("a write without --pg is refused with guidance (not an ephemeral write)", async () => {
  const env = await run(["library", "artifact", "edit", "edit-first-curation", "--set", "description=x"], {
    store: await seeded(),
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
  // the WHY is a library-sourced doctrine pointer, not restated prose
  assert.match(
    (env.doctrine ?? []).join("\n"),
    /live-store-is-the-edit-surface — .+ {2}\(storytree library artifact live-store-is-the-edit-surface\)/,
  );
});

test("artifact new creates a validated artifact in a writable store", async () => {
  const store = await seeded();
  const env = await run(["library", "artifact", "new", "--json", NEW_DOC], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /created cli-test-note/);
  const got = await store.getDoc("cli-test-note");
  assert.ok(got, "artifact was persisted");
});

test("artifact new refuses to overwrite an existing id (edit-first)", async () => {
  const store = await seeded();
  const dup = JSON.stringify({
    id: "glossary-wins",
    category: "pattern",
    title: "dupe",
    description: "d",
    body: "b",
    references: [],
  });
  const env = await run(["library", "artifact", "new", "--json", dup], { store, writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /already exists — edit it/);
});

test("artifact new rejects an invalid doc with the validation message as guidance", async () => {
  const store = await seeded();
  const env = await run(["library", "artifact", "new", "--json", '{"id":"x"}'], { store, writable: true });
  assert.equal(env.ok, false);
  assert.match(env.body, /failed validation/);
});

test("artifact edit --set patches a field and re-persists", async () => {
  const store = await seeded();
  const env = await run(
    ["library", "artifact", "edit", "edit-first-curation", "--set", "description=patched by test"],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /updated edit-first-curation \(set description\)/);
  const got = await store.getDoc("edit-first-curation");
  assert.equal((got?.doc as { description?: string }).description, "patched by test");
});

// ---------------------------------------------------------------------------
// ADR-0267 D4 — stamping an open question into an arc through `artifact edit --set arcRef=…`.
// The edge is what a DERIVED arc surface is assembled from, so the write path has to protect it:
// a dangling ref would leave the arc view silently omitting a child that claims a parent, which is
// exactly the untrustworthiness the arc surface exists to remove.
// ---------------------------------------------------------------------------

/** Seed one arc + one unstamped open question into a store the edit path can write to. */
async function seededForStamping(): Promise<InMemoryStore> {
  const store = new InMemoryStore();
  await store.upsertDoc({
    id: "surface-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "surface-arc",
      title: "The arc surface",
      description: "d",
      references: [],
      createdAt: "2026-07-29",
      updatedAt: "2026-07-29",
    },
  });
  await store.upsertDoc({
    id: "oq-blocked",
    kind: "open-question",
    doc: {
      kind: "open-question",
      id: "oq-blocked",
      title: "What qualifies as blocked?",
      description: "d",
      stakes: "s",
      statement: "s",
      context: "c",
      options: "a | b",
      references: [],
      createdAt: "2026-07-30",
      updatedAt: "2026-07-30",
    },
  });
  return store;
}

test("artifact edit --set arcRef stamps a question to an arc, accepting a BARE arc id", async () => {
  const store = await seededForStamping();
  // The bare id is the ergonomic half: `asset:` is a wire detail, and without the coercion this
  // would fail on the schema's regex with an opaque union dump instead of just working.
  const env = await run(["library", "artifact", "edit", "oq-blocked", "--set", "arcRef=surface-arc"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, true, env.body);
  assert.equal((await store.getDoc("oq-blocked"))?.doc && ((await store.getDoc("oq-blocked"))!.doc as { arcRef?: string }).arcRef, "asset:surface-arc");

  // The explicit pointer form is accepted unchanged.
  const explicit = await run(
    ["library", "artifact", "edit", "oq-blocked", "--set", "arcRef=asset:surface-arc"],
    { store, writable: true },
  );
  assert.equal(explicit.ok, true, explicit.body);
});

test("artifact edit --set arcRef REFUSES a dangling edge rather than persisting it", async () => {
  const store = await seededForStamping();
  const env = await run(["library", "artifact", "edit", "oq-blocked", "--set", "arcRef=no-such-arc"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no arc "no-such-arc"/);
  assert.match(env.body, /renders nowhere/);
  // Nothing was written — a refused stamp must not half-land.
  assert.equal(((await store.getDoc("oq-blocked"))!.doc as { arcRef?: string }).arcRef, undefined);

  // Pointing it at a real id of the WRONG kind is refused for the same reason.
  const wrongKind = await run(["library", "artifact", "edit", "oq-blocked", "--set", "arcRef=oq-blocked"], {
    store,
    writable: true,
  });
  assert.equal(wrongKind.ok, false);
  assert.match(wrongKind.body, /is a open-question, not an arc/);
});

test("artifact edit --set arcRef= (empty) CLEARS the stamp — a mis-stamp is reversible", async () => {
  const store = await seededForStamping();
  await run(["library", "artifact", "edit", "oq-blocked", "--set", "arcRef=surface-arc"], {
    store,
    writable: true,
  });
  const cleared = await run(["library", "artifact", "edit", "oq-blocked", "--set", "arcRef="], {
    store,
    writable: true,
  });
  assert.equal(cleared.ok, true, cleared.body);
  assert.match(cleared.body, /cleared/);
  // The field is REMOVED, not blanked — an empty string would fail the AssetRef regex on next write.
  assert.ok(!Object.hasOwn((await store.getDoc("oq-blocked"))!.doc as object, "arcRef"));
});

test("artifact edit on a missing id is guidance", async () => {
  const env = await run(["library", "artifact", "edit", "ghost", "--set", "title=x"], {
    store: await seeded(),
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /no artifact "ghost" to edit/);
});

test("artifact edit --set field=@path reads the value from a file (no shell-mangled newlines)", async () => {
  const store = await seeded();
  const dir = mkdtempSync(path.join(tmpdir(), "cli-atpath-"));
  try {
    const file = path.join(dir, "desc.txt");
    writeFileSync(file, "first line\nsecond line", "utf8");
    const env = await run(
      ["library", "artifact", "edit", "edit-first-curation", "--set", `description=@${file}`, "--pg"],
      { store, writable: true },
    );
    assert.equal(env.ok, true);
    const got = (await store.getDoc("edit-first-curation"))?.doc as { description?: string };
    assert.equal(got.description, "first line\nsecond line"); // REAL newline, not a literal \n
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

/** Seed a minimal live-shaped arc into a store (arcs are live-only, absent from the offline seed). */
async function seedArc(store: InMemoryStore): Promise<void> {
  await store.upsertDoc({
    id: "dispatch-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "dispatch-arc",
      title: "Dispatch arc",
      description: "d",
      intent: "old intent",
      endState: "old end state",
      increments: [{ date: "2026-07-01", pr: "#1", outcome: "first" }],
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });
}

test("arc increment add <id> via dispatch appends one increment (positional routing + real clock)", async () => {
  const store = await seeded();
  await seedArc(store);
  const env = await run(
    ["arc", "increment", "add", "dispatch-arc", "--outcome", "landed inc 2", "--pr", "#42", "--date", "2026-07-20", "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, true);
  assert.match(env.body, /appended increment to arc dispatch-arc/);
  const log = (await store.getDoc("dispatch-arc"))?.doc as { increments: Array<Record<string, unknown>> };
  assert.equal(log.increments.length, 2);
  assert.deepEqual(log.increments[1], { date: "2026-07-20", pr: "#42", outcome: "landed inc 2" });
});

test("arc edit --end-state @path via dispatch reads long prose from a file", async () => {
  const store = await seeded();
  await seedArc(store);
  const dir = mkdtempSync(path.join(tmpdir(), "cli-arc-"));
  try {
    const file = path.join(dir, "end.md");
    writeFileSync(file, "closed when:\n- a\n- b", "utf8");
    const env = await run(["arc", "edit", "dispatch-arc", "--end-state", `@${file}`, "--pg"], {
      store,
      writable: true,
    });
    assert.equal(env.ok, true);
    const got = (await store.getDoc("dispatch-arc"))?.doc as { endState?: string };
    assert.equal(got.endState, "closed when:\n- a\n- b");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("arc edit without --pg is refused (arcs live only in the shared store)", async () => {
  const store = await seeded();
  await seedArc(store);
  const env = await run(["arc", "edit", "dispatch-arc", "--intent", "x"], { store });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes to the shared store/);
});

test("sync-agents without --pg is refused with the write-surface guidance", async () => {
  const env = await run(["library", "sync-agents"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
});

test("sync-agents (writable) reconciles the agent tier to the seed and removes a stale agent", async () => {
  const store = await seeded();
  // A stale agent not present in the seed — sync-agents must delete it.
  await store.upsertDoc({
    id: "stale-agent",
    kind: "agent",
    doc: { id: "stale-agent", kind: "agent" },
  });
  const env = await run(["library", "sync-agents", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /IN SYNC — the live agent tier equals the seed/);

  const agents = (await store.queryDocs({ kind: "agent" })).map((d) => d.id);
  assert.ok(!agents.includes("stale-agent"), "the stale agent was deleted");
  assert.ok(agents.includes("session-orchestrator"), "a known seed agent is present");
  assert.equal(await store.getDoc("stale-agent"), null);
});

test("sync-corpus without --pg is refused with the write-surface guidance", async () => {
  const env = await run(["library", "sync-corpus"], { store: await seeded() });
  assert.equal(env.ok, false);
  assert.match(env.body, /writes go to the shared store/);
});

test("sync-corpus (writable) migrates a seed-only artifact and never clobbers a live edit", async () => {
  const store = await seeded();
  // Simulate the gap: a graduated seed principle absent from this (fresh-ish) live store. Remove one
  // known seed artifact from the live store so sync-corpus has something to migrate.
  await store.deleteDoc("real-test-must-not-leak-a-handle");
  // And a live-canonical EDIT the seed has not caught up to — sync-corpus must NOT revert it.
  const edited = (await store.getDoc("edit-first-curation"))!;
  await store.upsertDoc({
    id: "edit-first-curation",
    kind: edited.kind,
    doc: { ...(edited.doc as Record<string, unknown>), title: "LIVE EDITED TITLE" },
  });

  const env = await run(["library", "sync-corpus", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /MIGRATED 1 seed-only artifact/);

  // The seed-only artifact was carried across.
  assert.ok(await store.getDoc("real-test-must-not-leak-a-handle"), "seed-only principle migrated");
  // The live edit survived (migrate-only never overwrites a present artifact).
  assert.equal(
    ((await store.getDoc("edit-first-curation"))!.doc as { title: string }).title,
    "LIVE EDITED TITLE",
    "the live-canonical edit was not clobbered",
  );
});

test("sync-corpus (writable) is idempotent — a clean live tier reports nothing to migrate", async () => {
  const store = await seeded();
  const env = await run(["library", "sync-corpus", "--pg"], { store, writable: true });
  assert.equal(env.ok, true);
  assert.match(env.body, /NOTHING TO MIGRATE/);
});

test("artifact edit --set on an unknown field is refused with a clear message, not persisted", async () => {
  const store = await seeded();
  // edit-first-curation is a pattern; `bogusField` is not one of its fields. The guard names the
  // bad field + lists the editable ones, instead of the opaque .strict() union dump it used to throw.
  const env = await run(
    ["library", "artifact", "edit", "edit-first-curation", "--set", "bogusField=nope"],
    { store, writable: true },
  );
  assert.equal(env.ok, false);
  assert.match(env.body, /unknown field "bogusField" for a pattern artifact/);
  assert.match(env.body, /editable fields: .*statement/);
  const got = await store.getDoc("edit-first-curation");
  assert.equal((got?.doc as { bogusField?: string }).bogusField, undefined, "not persisted");
});

test("artifact edit --set lifecycle on an arc is REFUSED — closure is not a free flip (ADR-0239 D2)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "a-live-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "a-live-arc",
      title: "A live initiative",
      description: "d",
      intent: "Deliver it.",
      endState: "It is delivered.",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });

  // `lifecycle` IS a real arc field, so the unknown-field guard lets it through — the refusal is a
  // deliberate policy one: the state is a projection of the prose that supports it (ADR-0084/0086).
  const env = await run(["library", "artifact", "edit", "a-live-arc", "--set", "lifecycle=closed"], {
    store,
    writable: true,
  });
  assert.equal(env.ok, false);
  assert.match(env.body, /not a free flip/);
  assert.match(env.body, /storytree arc close a-live-arc --outcome/);
  assert.match(env.body, /OWNER-only/);
  const got = (await store.getDoc("a-live-arc"))?.doc as { lifecycle?: string };
  assert.notEqual(got.lifecycle, "closed", "the flip was not persisted");

  // The refusal is scoped to that ONE field — an arc's ordinary fields still edit as before.
  const ok = await run(["library", "artifact", "edit", "a-live-arc", "--set", "description=sharper"], {
    store,
    writable: true,
  });
  assert.equal(ok.ok, true);
});

test("arc close through the dispatcher writes the terminal increment and the flip (ADR-0239 D2)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "closing-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "closing-arc",
      title: "An initiative reaching its end",
      description: "d",
      intent: "Deliver it.",
      endState: "It is delivered.",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });

  const env = await run(
    ["arc", "close", "closing-arc", "--outcome", "it is delivered — the end state is met", "--pr", "#1012", "--pg"],
    { store, writable: true },
  );
  assert.equal(env.ok, true, env.body);
  const doc = (await store.getDoc("closing-arc"))?.doc as {
    lifecycle?: string;
    increments?: Array<Record<string, unknown>>;
  };
  assert.equal(doc.lifecycle, "closed");
  assert.equal(doc.increments?.length, 1);
  assert.equal(doc.increments?.[0]?.["pr"], "#1012");
});

test("arc list --all / --closed parse as flags and widen the default worklist (ADR-0239 D3)", async () => {
  const store = await seeded();
  await store.upsertDoc({
    id: "shipped-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "shipped-arc",
      title: "A shipped initiative",
      description: "d",
      intent: "Ship it.",
      endState: "Shipped.",
      lifecycle: "closed",
      increments: [{ date: "2026-07-25", outcome: "shipped; the end state is met" }],
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-25",
    },
  });

  await store.upsertDoc({
    id: "running-arc",
    kind: "arc",
    doc: {
      kind: "arc",
      id: "running-arc",
      title: "A running initiative",
      description: "d",
      intent: "Keep shipping.",
      endState: "Not yet.",
      references: [],
      createdAt: "2026-07-01",
      updatedAt: "2026-07-01",
    },
  });

  const def = await run(["arc", "list", "--pg"], { store, writable: true });
  assert.equal(def.ok, true);
  assert.match(def.body, /running-arc/);
  assert.doesNotMatch(def.body, /shipped-arc/);
  assert.match(def.body, /\(1 closed — --all\)/);

  const all = await run(["arc", "list", "--all", "--pg"], { store, writable: true });
  assert.equal(all.ok, true, all.body);
  assert.match(all.body, /shipped-arc/);

  const closed = await run(["arc", "list", "--closed", "--pg"], { store, writable: true });
  assert.equal(closed.ok, true, closed.body);
  assert.match(closed.body, /shipped-arc/);
});
