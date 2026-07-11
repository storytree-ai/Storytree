// compose-build-command: the pure string a forest-map Build click seeds into the terminal.
// A string builder, never a build engine — no @storytree/agent, no @storytree/drive, no spine,
// no model path. Mirrors the in-app dispatch (routedBuildRunner: real + pg for both kinds) by
// emitting the CLI's `--real --store pg` suffix; `openPr` and everything else stay CLI defaults,
// never encoded here.

export type BuildScope = 'story' | 'node';

export interface ComposeBuildCommandInput {
  unitId: string;
  scope: BuildScope;
}

export function composeBuildCommand({ unitId, scope }: ComposeBuildCommandInput): string {
  return `pnpm storytree ${scope} build ${unitId} --real --store pg`;
}
