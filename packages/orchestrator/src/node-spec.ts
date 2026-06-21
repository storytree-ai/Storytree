import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";
import {
  Status,
  Tier,
  UatWitness,
  parseUatTests,
  parseReliabilityGates,
  type UatTest,
  type ReliabilityGate,
} from "@storytree/library";
import { ProofMode } from "@storytree/proof-protocol";

import { parseNodeBuildConfig } from "./proof-config.js";
import type { NodeBuildConfig } from "./proof-config.js";

/**
 * A LIGHT frontmatter loader for the `stories/<story>/<unit>.md` node specs (drive-machinery
 * Phase B). Deliberately NOT `@storytree/core`'s full `Unit` zod: that requires body-borne fields
 * (`integration_test`, `contracts`, `uat`) the frontmatter-markdown unit format (ADR-0039) keeps
 * as prose sections. Here we validate JUST the frontmatter fields the resolver needs and carry
 * the `## Guidance` prose along for prompt assembly.
 */

/** The frontmatter proof-mode vocabulary used by the stories/ seed files. */
const FrontmatterProofMode = z.enum([
  "UAT",
  "integration-test",
  "contract-test",
  "operator-attested",
]);

/** Just the frontmatter fields the resolver needs; unknown keys are tolerated (light by design). */
const Frontmatter = z
  .object({
    id: z.string(),
    tier: Tier,
    title: z.string(),
    outcome: z.string(),
    status: Status,
    proof_mode: FrontmatterProofMode,
    uat_witness: UatWitness.optional(),
    story: z.string().optional(),
    depends_on: z.array(z.string()).default([]),
    // The provider-side inbound edge declaration (ADR-0074 §4): the story ids that CONSUME this
    // organism. Complements `depends_on` (the consumer-side outbound edges) so a hub organism can
    // be de-noised — a spoke owns its "I am wired into the hub" edge here rather than forcing the
    // hub to list every spoke — and so each organism's full connection set is declared, not hidden
    // in package.json. The boundary gate (`check:boundaries`) covers a cross-story code edge A→B
    // when A declares B in `depends_on` OR B declares A in `consumed_by` (either endpoint).
    consumed_by: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    decisions: z.array(z.number().int().positive()).default([]),
    // Studio render hint (ADR-0076): a MANUAL, agent-authored tag (set during story writing /
    // review, NOT derived from degree/kind) marking a story as a "building" — a foundation
    // utility drawn as a building ON the map with NO connection lines, rather than its own
    // connected island/organism node. Presentation only; the gate/build ignore it. Absent =
    // a normal island. `library` is the first tagged building.
    render: z.enum(["building"]).optional(),
    // The spec-borne proof config (ADR-0057 keystone). Captured as unknown here and validated by
    // the strict `parseNodeBuildConfig` in `loadNodeSpec` (with the file path on the throw) — the
    // outer frontmatter stays passthrough/light, but the proof block is the load-bearing part.
    proof: z.unknown().optional(),
  })
  .passthrough();

/** A loaded node spec: the validated frontmatter + the prose the resolver assembles prompts from. */
export interface NodeSpec {
  id: string;
  tier: z.infer<typeof Tier>;
  title: string;
  outcome: string;
  status: z.infer<typeof Status>;
  /** The spec's own proof-mode word, mapped to core's {@link ProofMode} by the resolver. */
  proofMode: z.infer<typeof FrontmatterProofMode>;
  /**
   * Who witnesses a story's UAT (ADR-0040). The DECLARED value — absent means human; resolve
   * through core's `effectiveUatWitness`, never a local `?? "human"`.
   */
  uatWitness: z.infer<typeof UatWitness> | undefined;
  story: string | undefined;
  dependsOn: string[];
  /**
   * The provider-side inbound edges (ADR-0074 §4): the story ids that CONSUME this organism. The
   * complement of `dependsOn` — the boundary gate covers a cross-story code edge A→B when A's
   * `dependsOn` includes B OR B's `consumedBy` includes A. `[]` when unset (the common case; only
   * organisms that own a provider-side edge — chiefly the spokes feeding the cli/store hubs —
   * populate it). The studio forest renders `dependsOn` today; the radial world (ADR-0074 §6) will
   * read `consumedBy` to lay the hubs out centrally.
   */
  consumedBy: string[];
  /** A story spec's `capabilities` frontmatter list (empty for capability/contract tiers). */
  capabilities: string[];
  /** A story spec's deciding ADR numbers (ADR-0037 §2; empty for capability/contract tiers). */
  decisions: number[];
  /**
   * Studio render hint (ADR-0076): `"building"` marks a story as a foundation utility drawn as a
   * building on the map with NO connection lines (the manual, agent-authored building-vs-island
   * tag, owner steer 2026-06-20). Absent/`undefined` = a normal connected island. Presentation only.
   */
  render?: "building" | undefined;
  /**
   * The node's spec-borne proof config (ADR-0057 keystone): the proof command + per-phase write
   * scope + optional `real:` arm, declared in the spec's own `proof:` frontmatter block. `undefined`
   * = no block → the resolver falls back to the test-command registry. Authoring this block is what
   * makes a node buildable, with no orchestrator edit.
   */
  buildConfig: NodeBuildConfig | undefined;
  /** The `## Guidance` section's prose, when the body carries one (feeds prompt assembly). */
  guidance: string | undefined;
  /**
   * The story's UAT prose parsed into addressable test units (ADR-0044 `uat-test-units`): one per
   * `## Story UAT` numbered item, with a stable `<id>#uat-<n>` id and a witness kind. `[]` for a
   * capability/contract spec (no Story UAT section) — the attestation surface keys off these ids.
   */
  uatTests: UatTest[];
  /**
   * The story's `## Reliability Gates` prose parsed into addressable gate units (ADR-0085,
   * resolving ADR-0083 Fork B): one per numbered item, with a stable `<id>#gate-<n>` id, a
   * `kind` (`observe` | `build-tests` | `integrate`) and an optional `proofCommand`. `[]` when
   * the story declares none (the common case). The author-declared brownfield obligation set —
   * its ids roll into the story-green crown alongside the per-test UAT (ADR-0083 Fork A).
   */
  reliabilityGates: ReliabilityGate[];
  /** The file the spec was loaded from (for honest provenance in CLI output). */
  file: string;
}

/**
 * Parse one frontmatter-markdown node spec. Throws (loud) on a missing/odd frontmatter block or
 * frontmatter that fails the {@link Frontmatter} validation.
 */
export function loadNodeSpec(file: string): NodeSpec {
  const raw = readFileSync(file, "utf8").replace(/\r\n/g, "\n");
  if (!raw.startsWith("---\n")) {
    throw new Error(`${file}: no frontmatter block (the file must start with '---')`);
  }
  const end = raw.indexOf("\n---\n", 4);
  if (end < 0) {
    throw new Error(`${file}: unterminated frontmatter block (no closing '---')`);
  }
  const fm = Frontmatter.parse(parse(raw.slice(4, end + 1)));
  const body = raw.slice(end + 5);
  const guidance = guidanceSection(body);
  // The spec-borne proof config (ADR-0057): validate the optional `proof:` block here so a
  // malformed block fails LOUD with the file path (the loader's existing posture). Absent = the
  // node carries no build config (fail-closed default; the resolver falls back to the registry).
  let buildConfig: NodeBuildConfig | undefined;
  if (fm.proof !== undefined) {
    try {
      buildConfig = parseNodeBuildConfig(fm.proof);
    } catch (e) {
      throw new Error(`${file}: invalid 'proof:' block — ${(e as Error).message}`);
    }
  }
  return {
    id: fm.id,
    tier: fm.tier,
    title: fm.title,
    outcome: fm.outcome,
    status: fm.status,
    proofMode: fm.proof_mode,
    uatWitness: fm.uat_witness,
    story: fm.story,
    dependsOn: fm.depends_on,
    consumedBy: fm.consumed_by,
    capabilities: fm.capabilities,
    decisions: fm.decisions,
    render: fm.render,
    buildConfig,
    guidance,
    // Parsed off the same body — the join key the attestation surface (ADR-0044) writes against.
    uatTests: parseUatTests(fm.id, body),
    // ADR-0085: the brownfield `## Reliability Gates` obligations, parsed off the same body.
    reliabilityGates: parseReliabilityGates(fm.id, body),
    file,
  };
}

/** Extract the `## Guidance` section's prose (up to the next `##` heading), or undefined. */
function guidanceSection(body: string): string | undefined {
  const heading = /^## Guidance[^\n]*\n/m.exec(body);
  if (heading === null) return undefined;
  const rest = body.slice(heading.index + heading[0].length);
  const next = rest.search(/^## /m);
  const text = (next >= 0 ? rest.slice(0, next) : rest).trim();
  return text.length > 0 ? text : undefined;
}

/**
 * Locate a node spec by unit id under a stories/ root: a capability lives at
 * `stories/<story>/<id>.md`; a story's own spec is `stories/<id>/story.md`. Returns the path or
 * null (a miss is the caller's guidance to give, not a throw).
 */
export function findNodeSpecFile(storiesDir: string, unitId: string): string | null {
  if (!existsSync(storiesDir) || !statSync(storiesDir).isDirectory()) return null;
  const storyOwn = path.join(storiesDir, unitId, "story.md");
  if (existsSync(storyOwn)) return storyOwn;
  for (const entry of readdirSync(storiesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const candidate = path.join(storiesDir, entry.name, `${unitId}.md`);
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Map the stories-frontmatter proof-mode word onto core's {@link ProofMode} (ADR-0007): the
 * frontmatter names the TEST KIND (`integration-test`/`UAT`/`contract-test`), the core enum names
 * the TIER LADDER (`capability`/`story`/`contract`); `operator-attested` is shared.
 */
export function mapProofMode(
  fm: z.infer<typeof FrontmatterProofMode>,
): z.infer<typeof ProofMode> {
  switch (fm) {
    case "integration-test":
      return "capability";
    case "UAT":
      return "story";
    case "contract-test":
      return "contract";
    case "operator-attested":
      return "operator-attested";
  }
}
