/**
 * Capability 3 · Surfaces (stories/app.md): the smoke check's judgement. The surface on show says
 * what it drew, and the check passes only if that is every story and capability of the project.
 * (Stub: not built yet.)
 */
import type { AnnotatedTree } from "@storytree/library";

/**
 * What a surface says it drew, once it has drawn a project: which surface it is, and the ids of the
 * stories and capabilities it drew. It is written on the page as JSON, in the body's `data-drew`
 * attribute. A surface may add fields of its own; the smoke check reads only these.
 */
export interface Drawn {
  surface: string;
  stories: string[];
  capabilities: string[];
}

/**
 * What stops the smoke check passing, from the page's state (`data-state`), the project's tree, and
 * what the surface on show says it drew (`data-drew`'s text, undefined if it said nothing). No
 * problems means it passed.
 */
export function smokeProblems(_state: string, _tree: AnnotatedTree | undefined, _drew: string | undefined): string[] {
  return ["the smoke check's judgement is not built yet"];
}
