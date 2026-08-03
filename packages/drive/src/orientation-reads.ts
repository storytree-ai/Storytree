/**
 * The drill-down READ views the orientation runner serves beyond the three dashboards
 * (the in-app orchestrator's "answer these sorts of questions" gap): a node's full spec
 * markdown, one Library artifact's body, a category listing, and the agent-guidance
 * renderer (self-onboarding). Every view returns an ADR-0023 {@link Envelope} — a miss is
 * `ok: false` WITH `next` guidance, never a throw — so the chat agent can follow the same
 * choose-your-own-adventure pointers the terminal session follows.
 *
 * READ-ONLY by construction: every function here only reads the stories/ filesystem or the
 * injected store; none takes a write verb. Shared by the composed orientation runner
 * (`orientation-runner.ts`, the desktop sidecar path) and the CLI (`tree spec <id>` parity).
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import { findNodeSpecFile } from "@storytree/orchestrator";
import type { Store } from "@storytree/storage-protocol";
import { KIND_SPECS, NODE_REF_PREFIX } from "@storytree/library";
import { renderStoredDoc, renderAgentEssentials, renderAgentStep } from "@storytree/library/store";

import { emitNodeEnvelope, type Envelope } from "./envelope.js";

/**
 * `tree spec <node-id>` — the FULL spec markdown for one story or capability, resolved off the
 * stories/ corpus via the same `findNodeSpecFile` the build path uses. This is the read the fixed
 * dashboards couldn't serve: "what does this capability actually do" is answered by its spec body,
 * not by a status glyph.
 */
export function specView(storiesDir: string, id: string | undefined): Envelope {
  if (id === undefined || id.trim() === "") {
    return {
      ok: false,
      body: "tree spec needs a node id: storytree tree spec <story-or-capability-id>",
      next: ["storytree tree"],
    };
  }
  const file = findNodeSpecFile(storiesDir, id);
  if (file === null) {
    return {
      ok: false,
      body: `no spec found for "${id}" under ${storiesDir} — not a story or capability id.`,
      next: ["storytree tree   (list the stories)", "storytree tree <story-id>   (one story's capabilities)"],
    };
  }
  const story = path.basename(path.dirname(file));
  return {
    ok: true,
    body: readFileSync(file, "utf8"),
    next: [
      `storytree tree ${story}   (the owning story's tree)`,
      "storytree tree spec <other-node-id>",
    ],
  };
}

/**
 * `library artifact <id>` — one Library artifact's rendered body (title, category, description,
 * body, references). Uses `renderStoredDoc`, which degrades rather than throws on a doc newer than
 * this code — the fail-soft contract every orientation surface holds.
 */
export async function artifactView(store: Store, id: string | undefined): Promise<Envelope> {
  if (id === undefined || id.trim() === "") {
    return {
      ok: false,
      body: "artifact needs an id: storytree library artifact <id>",
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const stored = await store.getDoc(id);
  if (!stored) {
    return {
      ok: false,
      body: `no artifact "${id}" in the Library.`,
      next: ["storytree library", "storytree library artifact list <category>"],
    };
  }
  const a = renderStoredDoc(stored);
  const lines = [`# ${a.title}    [${a.category}]`, `id: ${a.id}`, ""];
  if (a.description) lines.push(a.description, "");
  lines.push(a.body);
  const refs = a.references ?? [];
  if (refs.length > 0) {
    lines.push("", "references:", ...refs.map((r) => `  - ${r}`));
  }
  // The `next:` doors this artifact's citations open. `asset:` refs stay inside the Library;
  // `node:<id>` refs (ADR-0107 D2) open the work tree instead — an artifact attached to a story's
  // proving process could name that story but never offer a way to reach it.
  const doors: string[] = [];
  for (const r of refs) {
    if (r.startsWith("asset:")) doors.push(`storytree library artifact ${r.slice("asset:".length)}`);
    else if (r.startsWith(NODE_REF_PREFIX)) doors.push(`storytree tree ${r.slice(NODE_REF_PREFIX.length)}`);
  }
  return {
    ok: true,
    body: lines.join("\n"),
    next: doors.slice(0, 5),
  };
}

/**
 * `library artifact list <category>` — the ids + titles in one category (kind). An unknown or
 * missing category lists the available categories instead — guidance, not a dead end.
 *
 * The listable set is SCHEMA-derived (every kind `KIND_SPECS` defines, unioned with any kind the
 * store actually holds), because the population is not the authority on what exists: deriving it
 * from the rows present made a kind unlistable for exactly as long as it took someone to write its
 * first row, and read a lifecycle tier draining to zero — which for `proposal` is the SUCCESS state
 * — as `unknown category`. Both are false; an empty tier is a fact about the population, never a
 * fault in the query, so the two answers split: a kind outside the schema stays an `ok: false`
 * error with the available list, while a schema kind holding ZERO rows lists empty at `ok: true` in
 * the same `<kind> (n):` shape a populated tier uses. The UNION keeps store-only kinds listable —
 * `template` artifacts (ADR-0210) carry a kind the knowledge union does not name and they list
 * today — so the set is strictly widening and every invocation that works keeps working.
 *
 * The CLI's `listCategory` (`packages/cli/src/commands.ts`) holds the same rule for the terminal
 * surface; the CLI dispatch does not route through here, so the two are proven separately.
 */
export async function artifactList(store: Store, category: string | undefined): Promise<Envelope> {
  const docs = await store.queryDocs();
  const byKind = new Map<string, { id: string; title: string }[]>();
  for (const d of docs) {
    const doc = d.doc as Record<string, unknown> | null;
    const title = doc !== null && typeof doc["title"] === "string" ? doc["title"] : "";
    const list = byKind.get(d.kind) ?? [];
    list.push({ id: d.id, title });
    byKind.set(d.kind, list);
  }
  const kinds = [...new Set([...Object.keys(KIND_SPECS), ...byKind.keys()])].sort();
  if (category === undefined || !kinds.includes(category)) {
    const which = category === undefined ? "no category given" : `unknown category "${category}"`;
    return {
      ok: false,
      body: `${which}. available categories: ${kinds.join(", ")}.`,
      next: kinds.slice(0, 5).map((k) => `storytree library artifact list ${k}`),
    };
  }
  const entries = (byKind.get(category) ?? []).sort((x, y) => x.id.localeCompare(y.id));
  return {
    ok: true,
    body: [`${category} (${entries.length}):`, ...entries.map((e) => `  ${e.id}  ${e.title}`)].join("\n"),
    next: entries.slice(0, 3).map((e) => `storytree library artifact ${e.id}`),
  };
}

/**
 * `agents [<name>] [--step <s>]` — the Library agent-guidance renderer (ADR-0051 / ADR-0156):
 * bare lists the available agents; a name renders that agent's ESSENTIALS operating guidance
 * (the same essentials view the terminal `storytree agents <name>` serves — own prose + the
 * one-line floor + per-step doors, full bodies pulled just-in-time); `--step` serves ONE workflow
 * step's just-in-time refs (ADR-0161). This is the self-onboarding read — `agents
 * session-orchestrator` hands the chat agent its own charter.
 */
export async function agentsView(
  store: Store,
  name: string | undefined,
  step?: string,
): Promise<Envelope> {
  if (step !== undefined) {
    const r = await renderAgentStep(store, name, step);
    if (!r.ok) {
      const next =
        r.steps.length > 0
          ? r.steps.map((s) => `storytree agents ${name} --step ${s}`)
          : r.available.map((id) => `storytree agents ${id} --step <step>`);
      return { ok: false, body: r.reason, next };
    }
    return emitNodeEnvelope({
      id: `${r.agent}#${r.step}`,
      headline:
        `${r.agent} — step "${r.step}"\n\n` +
        (r.refs.length > 0
          ? "Pull just what this step needs, then follow each ceremony's own `next:` onward (ADR-0156 §4)."
          : "This step has no attached refs yet — proceed on the agent's own prose."),
      edges: r.refs.map((ref) => ({ ref })),
    });
  }
  const result = await renderAgentEssentials(store, name);
  if (!result.ok) {
    return {
      ok: false,
      body: result.reason,
      next: result.available.map((id) => `storytree agents ${id}`),
    };
  }
  const { agent } = result;
  return {
    ok: agent.missingRefs.length === 0,
    body:
      agent.prompt +
      (agent.missingRefs.length > 0
        ? `\n\n--- ${agent.missingRefs.length} dangling ref(s): ${agent.missingRefs.join(", ")} ---`
        : ""),
    next: [`storytree library artifact ${agent.name}   (the raw agent artifact)`],
  };
}
