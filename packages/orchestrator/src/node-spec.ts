import { readFileSync, readdirSync, existsSync, statSync } from "node:fs";
import path from "node:path";

import { parse } from "yaml";
import { z } from "zod";
import { Status, Tier, ProofMode } from "@storytree/core";

/**
 * A LIGHT frontmatter loader for the `stories/<story>/<unit>.md` node specs (drive-machinery
 * Phase B). Deliberately NOT `@storytree/core`'s `loadUnit`: that parses a pure-YAML unit and the
 * full `Unit` zod requires body-borne fields (`integration_test`, `contracts`, `uat`) the
 * frontmatter-markdown seed format keeps as prose sections. Here we validate JUST the frontmatter
 * fields the resolver needs and carry the `## Guidance` prose along for prompt assembly.
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
    story: z.string().optional(),
    depends_on: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),
    decisions: z.array(z.number().int().positive()).default([]),
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
  story: string | undefined;
  dependsOn: string[];
  /** A story spec's `capabilities` frontmatter list (empty for capability/contract tiers). */
  capabilities: string[];
  /** A story spec's deciding ADR numbers (ADR-0037 §2; empty for capability/contract tiers). */
  decisions: number[];
  /** The `## Guidance` section's prose, when the body carries one (feeds prompt assembly). */
  guidance: string | undefined;
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
  return {
    id: fm.id,
    tier: fm.tier,
    title: fm.title,
    outcome: fm.outcome,
    status: fm.status,
    proofMode: fm.proof_mode,
    story: fm.story,
    dependsOn: fm.depends_on,
    capabilities: fm.capabilities,
    decisions: fm.decisions,
    guidance,
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
