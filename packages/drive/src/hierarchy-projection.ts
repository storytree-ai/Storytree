import { existsSync, readdirSync } from "node:fs";
import path from "node:path";

import {
  ProjectedCapability,
  ProjectedStory,
  WORK_HIERARCHY_SCHEMA_VERSION,
  WorkHierarchySnapshot,
} from "@storytree/library";
import { loadNodeSpec } from "@storytree/orchestrator";

/**
 * THE PROJECTOR (ADR-0445 D1, `map-freshness-arc` inc-02): read one checkout's `stories/**` and
 * return the {@link WorkHierarchySnapshot} the live store mirrors.
 *
 * ## It walks the tree the way the RENDERING readers walk it
 *
 * Same layout (`stories/<story>/story.md`, `stories/<story>/<capability>.md`), same membership rule
 * (a capability is projected because the STORY'S FRONTMATTER names it, never because a `.md` happens
 * to sit in the directory), same authored order, and the same total posture toward a broken spec:
 * a missing or malformed file becomes an `error` node rather than a throw, because one bad spec must
 * not blank the forest. `readTree` (apps/studio/server/apiRouter.ts) is the reader this is a mirror
 * of, and `hierarchyProjectionParity.test.ts` beside it holds the two to each other over the same
 * tree — a mirror nothing compares is a mirror that drifts.
 *
 * ## What it deliberately does NOT do
 *
 * It applies no FOLD. Would-be criteria, retired gates and an undeclared `uat_witness` are projected
 * as authored; `activeReliabilityGates`, the would-be filter and `effectiveUatWitness` belong to the
 * reader. The reasoning is in `@storytree/library`'s `work-hierarchy-projection.ts` header, stated
 * once: folding here would put the LOADER's rule version into the store and give every reader a
 * second, invisible staleness axis.
 *
 * It also carries nothing the PROVING readers need and the rendering ones do not — no proof config,
 * no guidance prose, no contract bodies. That fence is the increment's, and its reason is
 * sequencing: modelling for the proving readers is what would invite a later "just read it live"
 * shortcut, and a story pulled live while CI tests a branch validates the wrong thing.
 *
 * ## It lives in `drive`
 *
 * It needs `loadNodeSpec`, which is the orchestrator's, and the SHAPE, which is the library's — and
 * the library sits below the orchestrator, so the projector cannot live with the shape. `drive` is
 * the package both the CLI and the studio server already reach through, which is the same reason
 * `work-hierarchy.ts`'s cite resolver sits here.
 */

/** Where a projection came from — supplied by the caller, which is the only thing that knows. */
export interface HierarchyStamp {
  /** Provenance: the commit the checkout is at. Never judged (a squash merge discards it). */
  readonly commitSha: string;
  /** The git TREE object id of `stories/` at that commit. The freshness key. */
  readonly storiesTreeSha: string;
  /** ISO-8601 wall clock of this run. */
  readonly generatedAt: string;
  /** What is generating it: `hierarchy:load`, a CI job, a test. */
  readonly generator: string;
}

/** An unreadable capability spec, projected as a node rather than thrown. */
function capabilityError(id: string, storyId: string, message: string): ProjectedCapability {
  return ProjectedCapability.parse({
    id,
    storyId,
    title: id,
    outcome: "",
    status: null,
    proofMode: "",
    dependsOn: [],
    contractCount: 0,
    error: message,
  });
}

function message(err: unknown): string {
  const text = err instanceof Error ? err.message : String(err);
  return text.length > 0 ? text : "unreadable spec";
}

/**
 * Project one story directory's capabilities, in the order the story's frontmatter declares them.
 *
 * A capability the story NAMES but whose file is missing is an error node, exactly as `readTree`
 * renders it. A `.md` in the directory the story does NOT name is not projected at all — the
 * frontmatter list is the membership rule, and inventing membership from the filesystem would make
 * the store disagree with the map about which capabilities a story has.
 */
function projectCapabilities(storyDir: string, storyId: string, ids: readonly string[]): ProjectedCapability[] {
  return ids.map((id) => {
    const file = path.join(storyDir, `${id}.md`);
    if (!existsSync(file)) return capabilityError(id, storyId, "spec file missing");
    try {
      const spec = loadNodeSpec(file);
      return ProjectedCapability.parse({
        id,
        storyId,
        title: spec.title,
        outcome: spec.outcome,
        status: spec.status,
        proofMode: spec.proofMode,
        dependsOn: spec.dependsOn,
        // The DECLARED `## Contracts` count — what the map renders. The bodies stay on disk for the
        // proving readers, which this projection does not serve.
        contractCount: spec.contracts.length,
      });
    } catch (err) {
      return capabilityError(id, storyId, message(err));
    }
  });
}

/** What one story directory yielded — its story row plus the capability rows it owns. */
interface ProjectedStoryDir {
  readonly story: ProjectedStory;
  readonly capabilities: readonly ProjectedCapability[];
}

function projectStoryDir(storiesDir: string, dir: string): ProjectedStoryDir | null {
  const storyDir = path.join(storiesDir, dir);
  const storyFile = path.join(storyDir, "story.md");
  // No `story.md` is not an error — it is not a story directory. `readTree` skips it silently and so
  // does this, or `stories/README.md`'s neighbours would arrive as broken stories.
  if (!existsSync(storyFile)) return null;
  try {
    const spec = loadNodeSpec(storyFile);
    return {
      story: ProjectedStory.parse({
        id: dir,
        title: spec.title,
        outcome: spec.outcome,
        status: spec.status,
        proofMode: spec.proofMode,
        uatWitness: spec.uatWitness ?? null,
        dependsOn: spec.dependsOn,
        consumedBy: spec.consumedBy,
        decisions: spec.decisions,
        building: spec.render === "building",
        capabilities: spec.capabilities,
        uatTestCriteria: spec.uatTestCriteria,
        reliabilityGates: spec.reliabilityGates,
      }),
      capabilities: projectCapabilities(storyDir, dir, spec.capabilities),
    };
  } catch (err) {
    // A story whose own spec will not parse still EXISTS. Projecting the error node keeps the store
    // and the disk read agreeing about a story that is merely broken — dropping it would make the
    // two disagree about whether the story is there at all.
    return {
      story: ProjectedStory.parse({
        id: dir,
        title: dir,
        outcome: "",
        status: null,
        proofMode: "",
        uatWitness: null,
        building: false,
        error: message(err),
      }),
      capabilities: [],
    };
  }
}

/**
 * Project a whole `stories/` tree. Total: never throws on a broken spec, and returns an EMPTY
 * snapshot for a directory that does not exist.
 *
 * An empty result is a legitimate answer here and a suspicious one to the caller — which is why the
 * stamp carries denominators and `check:hierarchy-drift` refuses to call an empty projection clean.
 * Stories are returned in directory order (sorted), so two runs over the same tree are byte-equal.
 */
export function projectWorkHierarchy(storiesDir: string, stamp: HierarchyStamp): WorkHierarchySnapshot {
  const stories: ProjectedStory[] = [];
  const capabilities: ProjectedCapability[] = [];
  if (existsSync(storiesDir)) {
    const dirs = readdirSync(storiesDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
    for (const dir of dirs) {
      const projected = projectStoryDir(storiesDir, dir);
      if (projected === null) continue;
      stories.push(projected.story);
      capabilities.push(...projected.capabilities);
    }
  }
  return WorkHierarchySnapshot.parse({
    schemaVersion: WORK_HIERARCHY_SCHEMA_VERSION,
    commitSha: stamp.commitSha,
    storiesTreeSha: stamp.storiesTreeSha,
    generatedAt: stamp.generatedAt,
    generator: stamp.generator,
    stories,
    capabilities,
  });
}
