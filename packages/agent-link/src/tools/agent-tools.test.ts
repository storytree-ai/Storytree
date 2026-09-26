/**
 * Capability 6 · Agent tools (the MCP server): one test per contract 6.1-6.6 in
 * stories/agent-link.md. A test client talks to the server inside the test itself, over an
 * in-memory transport, with no real agent and no network, as Claude Code or Codex would: Claude
 * Code's session id reaches the server in its environment, Codex's on each call's `_meta`.
 *
 * The server works in a throwaway folder set up as a project (named with uniqueProjectName(), its
 * library dropped afterwards), and finds storytree from the test Postgres's own owner record.
 * What the tests check is read back through the library and the activity log themselves.
 */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";

import { Client } from "@modelcontextprotocol/client";
import { InMemoryTransport } from "@modelcontextprotocol/server";
import { connect, type Library } from "@storytree/library";

import { openActivityLog, type ActivityLog, type Line } from "../activity/index.js";
import { readClaims } from "../claims/index.js";
import { MARKER_FILE } from "../routing/index.js";
import { withTempDir } from "../testing/folders.js";
import { dropTestProjects, testServerDataDir, testServerUrl, uniqueProjectName } from "../testing/pg.js";
import { createAgentTools, NOT_RUNNING_ANSWER } from "./index.js";

/** The toolbox: every tool the server offers. */
const TOOLS = [
  "claim",
  "edit_plan",
  "land",
  "open",
  "plan_arc",
  "plan_capability",
  "plan_contract",
  "plan_story",
  "release",
  "report",
  "search_notes",
  "show_plan",
  "write_note",
];

interface Answer {
  text: string;
  isError: boolean;
  /** What the tool handed back as data, beside its sentence. */
  data: Record<string, unknown>;
}

interface Agent {
  call(tool: string, args?: Record<string, unknown>, meta?: Record<string, unknown>): Promise<Answer>;
  tools(): Promise<string[]>;
  close(): Promise<void>;
}

interface AgentOptions {
  /** The client's name: `claude-code` (the default) or `codex-mcp-client`, as each harness calls itself. */
  readonly client?: string;
  /** The server's environment. Claude Code's session id is there. */
  readonly env?: Record<string, string>;
  /** Sent on every call, as Codex sends its session id. */
  readonly meta?: Record<string, unknown>;
  readonly dataDir?: string;
  readonly quietMs?: number;
}

/** A tool server for `folder`, and a client connected to it in memory, as a harness would be. */
async function agentIn(folder: string, options: AgentOptions = {}): Promise<Agent> {
  const tools = createAgentTools({
    folder,
    dataDir: options.dataDir ?? testServerDataDir(),
    env: options.env ?? {},
    ...(options.quietMs === undefined ? {} : { quietMs: options.quietMs }),
  });
  const [serverSide, clientSide] = InMemoryTransport.createLinkedPair();
  await tools.server.connect(serverSide);
  const client = new Client({ name: options.client ?? "claude-code", version: "test" });
  await client.connect(clientSide);
  return {
    async call(tool, args = {}, meta) {
      const sent = meta ?? options.meta;
      const result = await client.callTool({ name: tool, arguments: args, ...(sent === undefined ? {} : { _meta: sent }) });
      const content = result.content as { type: string; text?: string }[];
      return {
        text: content.map((block) => block.text ?? "").join("\n"),
        isError: result.isError === true,
        data: (result.structuredContent ?? {}) as Record<string, unknown>,
      };
    },
    async tools() {
      return (await client.listTools()).tools.map((tool) => tool.name).sort();
    },
    async close() {
      await client.close();
      await tools.close();
    },
  };
}

/** Claude Code, session `session`: its id in the server's environment. */
function claudeCode(session: string, extra: AgentOptions = {}): AgentOptions {
  return { client: "claude-code", env: { CLAUDE_CODE_SESSION_ID: session }, ...extra };
}

/** Codex, session `session`: its id on every call, as Codex 0.155 sends it. */
function codex(session: string, extra: AgentOptions = {}): AgentOptions {
  return { client: "codex-mcp-client", meta: { threadId: session, sessionId: session }, ...extra };
}

interface World {
  folder: string;
  project: string;
  library: Library;
  log: ActivityLog;
}

/** Run `body` with a throwaway folder set up as a fresh project, and that project's library and log. */
async function withProject(body: (world: World) => Promise<void>): Promise<void> {
  const project = uniqueProjectName();
  await withTempDir(async (dir) => {
    const folder = path.join(dir, "site");
    mkdirSync(folder);
    writeFileSync(path.join(folder, MARKER_FILE), `${JSON.stringify({ project })}\n`);
    const storytree = await connect({ url: testServerUrl() });
    const log = await openActivityLog(testServerUrl());
    try {
      await body({ folder, project, library: await storytree.openProject(project), log });
    } finally {
      try {
        await log.close();
        await storytree.close();
      } finally {
        await dropTestProjects([project]);
      }
    }
  });
}

/** Run `body` with an agent, and close it afterwards. */
async function withAgent(folder: string, options: AgentOptions, body: (agent: Agent) => Promise<void>): Promise<void> {
  const agent = await agentIn(folder, options);
  try {
    await body(agent);
  } finally {
    await agent.close();
  }
}

/** The id a planning or writing tool handed back. */
function idOf(answer: Answer): string {
  assert.equal(answer.isError, false, answer.text);
  const { id } = answer.data;
  assert.equal(typeof id, "string", `an id in ${JSON.stringify(answer.data)}`);
  return id as string;
}

test("6.1 a test client lists the tools, then plans an arc, a story, a capability and a contract, which appear in the library's tree, and it can correct each of them", async () => {
  await withProject(async ({ folder, library }) => {
    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      assert.deepEqual(await agent.tools(), TOOLS);

      const story = idOf(await agent.call("plan_story", { title: "Visitor can sign up" }));
      const arc = idOf(await agent.call("plan_arc", { title: "Launch v1", stories: [story] }));
      const capability = idOf(await agent.call("plan_capability", { story, title: "Email form" }));
      const contract = idOf(await agent.call("plan_contract", { capability, title: "Rejects a bad email" }));

      const planned = await library.projectTree();
      assert.deepEqual(planned.stories.map((node) => [node.id, node.title]), [[story, "Visitor can sign up"]]);
      assert.deepEqual(planned.stories[0]?.capabilities.map((node) => [node.id, node.title]), [[capability, "Email form"]]);
      assert.deepEqual(planned.stories[0]?.capabilities[0]?.contracts.map((node) => [node.id, node.title]), [[contract, "Rejects a bad email"]]);
      assert.deepEqual(planned.arcs.map((node) => [node.id, node.title, node.stories]), [[arc, "Launch v1", [story]]]);

      for (const [id, title] of [
        [story, "Visitor can sign up with email"],
        [arc, "Launch v1.0"],
        [capability, "Signup form"],
        [contract, "Rejects an email with no @"],
      ] as const) {
        assert.equal(idOf(await agent.call("edit_plan", { id, title })), id);
      }
      const corrected = await library.projectTree();
      assert.equal(corrected.stories[0]?.title, "Visitor can sign up with email");
      assert.equal(corrected.arcs[0]?.title, "Launch v1.0");
      assert.equal(corrected.stories[0]?.capabilities[0]?.title, "Signup form");
      assert.equal(corrected.stories[0]?.capabilities[0]?.contracts[0]?.title, "Rejects an email with no @");
    });
  });
});

test("6.2 it claims the capability, sees who is on what, reports the contract red then green (reported moves from failing to passing, verified stays not checked), and reports it landed, which ends the claim", async () => {
  await withProject(async ({ folder, project, library, log }) => {
    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      const story = idOf(await agent.call("plan_story", { title: "Visitor can sign up" }));
      const capability = idOf(await agent.call("plan_capability", { story, title: "Email form" }));
      const contract = idOf(await agent.call("plan_contract", { capability, title: "Rejects a bad email" }));

      const claimed = await agent.call("claim", { capability, reason: "building the email form" });
      assert.equal(claimed.isError, false, claimed.text);
      const plan = await agent.call("show_plan");
      assert.deepEqual(
        (plan.data.claims as { capability: string; session: string; label: string; reason: string }[]).map(({ capability: held, session, label, reason }) => ({
          held,
          session,
          label,
          reason,
        })),
        [{ held: capability, session: "claude-1", label: "Claude Code", reason: "building the email form" }],
      );
      assert.deepEqual((plan.data.sessions as { session: string; state: string }[]).map(({ session, state }) => ({ session, state })), [
        { session: "claude-1", state: "live" },
      ]);

      assert.equal((await agent.call("report", { contract, result: "red" })).isError, false);
      assert.deepEqual(await library.health(contract).then(({ reported, verified }) => [reported.state, verified.state]), ["failing", "not-checked"]);
      assert.equal((await agent.call("report", { contract, result: "green" })).isError, false);
      assert.deepEqual(await library.health(contract).then(({ reported, verified }) => [reported.state, verified.state]), ["passing", "not-checked"]);

      assert.equal((await agent.call("land", { capability })).isError, false);
      assert.deepEqual(await readClaims(log, project), [], "landing ended the claim");
      const landed = (await log.since(project, 0)).lines.filter((line) => line.kind === "landed");
      assert.deepEqual(landed.map((line) => line.session), ["claude-1"]);
    });
  });
});

test("6.3 every call is recorded against the session that made it, using the session id the harness passes", async () => {
  await withProject(async ({ folder, project, log }) => {
    await withAgent(folder, claudeCode("claude-1"), async (claude) => {
      await withAgent(folder, codex("codex-1"), async (codexAgent) => {
        await claude.call("show_plan");
        await codexAgent.call("show_plan");
        // Codex before 0.155 sends only the thread's id, which is its hooks' session id.
        await codexAgent.call("plan_story", { title: "Visitor can sign in" }, { threadId: "codex-2" });
      });
    });
    const calls = (await log.since(project, 0)).lines.filter((line): line is Extract<Line, { kind: "tool-called" }> => line.kind === "tool-called");
    assert.deepEqual(
      calls.map(({ session, harness, source, tool, folder: where }) => ({ session, harness, source, tool, where })),
      [
        { session: "claude-1", harness: "claude-code", source: "tool", tool: "show_plan", where: folder },
        { session: "codex-1", harness: "codex", source: "tool", tool: "show_plan", where: folder },
        { session: "codex-2", harness: "codex", source: "tool", tool: "plan_story", where: folder },
      ],
    );
  });
});

test('6.4 a bad call gets a readable refusal rather than a crash, and with storytree stopped every tool answers "storytree isn\'t running, carry on without it"', async () => {
  await withProject(async ({ folder }) => {
    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      const unknown = await agent.call("claim", { capability: "capability_000000000000", reason: "building it" });
      assert.equal(unknown.isError, true);
      assert.ok(unknown.text.includes("capability_000000000000"), `the refusal names what it refused: ${unknown.text}`);
      const malformed = await agent.call("report", { contract: 42, result: "amber" });
      assert.equal(malformed.isError, true, "arguments of the wrong shape are refused");
      const story = await agent.call("plan_story", { title: "Still answering" });
      assert.equal(story.isError, false, "and the server carries on");
    });

    // The same folder with storytree stopped: nowhere the app's owner record would be.
    await withAgent(folder, claudeCode("claude-1", { dataDir: path.join(folder, "..", "stopped", "pgdata") }), async (agent) => {
      const calls: [string, Record<string, unknown>][] = [
        ["plan_arc", { title: "Launch v1" }],
        ["plan_story", { title: "Visitor can sign up" }],
        ["plan_capability", { story: "story_000000000000", title: "Email form" }],
        ["plan_contract", { capability: "capability_000000000000", title: "Rejects a bad email" }],
        ["edit_plan", { id: "story_000000000000", title: "Renamed" }],
        ["show_plan", {}],
        ["claim", { capability: "capability_000000000000", reason: "building it" }],
        ["release", { capability: "capability_000000000000" }],
        ["report", { contract: "contract_000000000000", result: "red" }],
        ["land", { capability: "capability_000000000000" }],
        ["search_notes", { query: "mailgun" }],
        ["open", { id: "decision_000000000000" }],
        ["write_note", { kind: "memory", text: "Mailgun needs a verified domain" }],
      ];
      assert.deepEqual(calls.map(([tool]) => tool).sort(), TOOLS, "every tool is tried");
      for (const [tool, args] of calls) {
        const answer = await agent.call(tool, args);
        assert.deepEqual({ text: answer.text, isError: answer.isError }, { text: NOT_RUNNING_ANSWER, isError: false }, tool);
      }
    });
  });
});

test("6.5 a note written with no place named while holding a claim goes onto that capability's shelf (ADR-0627 D4), and one written with no claim gets no default place", async () => {
  await withProject(async ({ folder, library }) => {
    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      const story = idOf(await agent.call("plan_story", { title: "Visitor can sign up" }));
      const form = idOf(await agent.call("plan_capability", { story, title: "Email form" }));
      const link = idOf(await agent.call("plan_capability", { story, title: "Confirmation link" }));

      // No claim: no default place.
      const loose = idOf(await agent.call("write_note", { kind: "memory", text: "Written before any claim" }));
      assert.deepEqual((await noteFields(library, loose)).links, undefined);

      await agent.call("claim", { capability: form, reason: "building the email form" });
      // A decision becomes a front cover of the claimed capability: the founding book.
      const founding = idOf(await agent.call("write_note", { kind: "decision", title: "Send through Mailgun", text: "Its API is the simplest" }));
      // A memory, with no cover opened yet this session, goes inside the shelf's first book.
      const first = idOf(await agent.call("write_note", { kind: "memory", text: "Mailgun needs a verified domain" }));
      // A second cover; once this session has opened it, a new memory goes inside that one.
      const second = idOf(await agent.call("write_note", { kind: "decision", title: "Validate on the client first", text: "Before any request" }));
      await agent.call("open", { id: second });
      const latest = idOf(await agent.call("write_note", { kind: "definition", term: "Bounce", meaning: "An email that could not be delivered" }));
      // A place the agent names itself always wins.
      const named = idOf(await agent.call("write_note", { kind: "memory", text: "Filed where I say", links: [founding] }));

      assert.deepEqual((await library.frontCovers(form)).map((cover) => cover.id), [founding, second]);
      assert.deepEqual((await noteFields(library, first)).links, [founding]);
      assert.deepEqual((await noteFields(library, latest)).links, [second]);
      assert.deepEqual((await noteFields(library, named)).links, [founding]);

      // Holding a capability whose shelf is empty: nothing is added, and the agent is told.
      await agent.call("claim", { capability: link, reason: "building the confirmation link" });
      const unshelved = await agent.call("write_note", { kind: "memory", text: "Links expire after a day" });
      assert.equal(unshelved.isError, false);
      assert.deepEqual((await noteFields(library, idOf(unshelved))).links, undefined);
      assert.equal(unshelved.data.shelf, "empty", "the answer says the shelf is empty");
    });
  });
});

test("the sentence travels with the data: a harness that shows the agent a tool's data instead of its text, as Claude Code 2.1.212 did, still shows the sentence (regression: the agent link's live check, 2026-09-26)", async () => {
  await withProject(async ({ folder }) => {
    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      const story = await agent.call("plan_story", { title: "Visitor can sign up" });
      const refused = await agent.call("claim", { capability: "capability_000000000000", reason: "building it" });
      const plan = await agent.call("show_plan");
      for (const [tool, answer] of [["plan_story", story], ["claim", refused], ["show_plan", plan]] as const) {
        assert.equal(answer.data.message, answer.text, `${tool}'s data carries its sentence`);
      }
    });
  });
});

test("6.6 searching and opening a note leaves a log line saying which session read it, how it was found (search, link, id or shelf) and whether it took a peek or the whole note", async () => {
  await withProject(async ({ folder, project, library, log }) => {
    const story = await library.addStory({ title: "Visitor can sign up" });
    const form = await library.addCapability({ title: "Email form", story: story.id });
    const cover = await library.recordDecision({ title: "Send through Mailgun", text: "Its API is the simplest", frontCoverOf: form.id });
    const inside = await library.writeMemory({ text: "Mailgun needs a verified domain", links: [cover.id] });
    const other = await library.writeMemory({ text: "Bounces arrive by webhook" });
    const unrelated = await library.defineTerm({ term: "Double opt-in", meaning: "Confirming a signup by email" });

    await withAgent(folder, claudeCode("claude-1"), async (agent) => {
      const before = (await log.since(project, 0)).cursor;
      await agent.call("search_notes", { query: "bounces" }); // a peek at `other`, found by search
      await agent.call("open", { id: other.id }); // opened from the search
      await agent.call("open", { id: form.id }); // the capability's shelf: a peek at its cover
      await agent.call("open", { id: cover.id }); // opened from the shelf, showing what links in: `inside`
      await agent.call("open", { id: inside.id }); // opened from that link, showing what it links to: the cover
      await agent.call("open", { id: unrelated.id }); // never shown: opened by id

      const reads = (await log.since(project, before)).lines.filter((line): line is Extract<Line, { kind: "note-read" }> => line.kind === "note-read");
      assert.deepEqual(
        reads.map(({ session, note, found, read }) => ({ session, note, found, read })),
        [
          { session: "claude-1", note: other.id, found: "search", read: "peek" },
          { session: "claude-1", note: other.id, found: "search", read: "whole" },
          { session: "claude-1", note: cover.id, found: "shelf", read: "peek" },
          { session: "claude-1", note: cover.id, found: "shelf", read: "whole" },
          { session: "claude-1", note: inside.id, found: "link", read: "peek" },
          { session: "claude-1", note: inside.id, found: "link", read: "whole" },
          { session: "claude-1", note: cover.id, found: "link", read: "peek" },
          { session: "claude-1", note: unrelated.id, found: "id", read: "whole" },
        ],
      );
    });
  });
});

/** A note's fields, as the library holds them. */
async function noteFields(library: Library, id: string): Promise<{ links?: string[] }> {
  const found = (await library.search("")).find((note) => note.id === id);
  assert.ok(found !== undefined, `note ${id} is in the library`);
  return found.fields as { links?: string[] };
}
