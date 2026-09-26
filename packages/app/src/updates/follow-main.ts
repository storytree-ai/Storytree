/** Capability 4 · Updates: the app follows merged main (contracts 4.1 and 4.2). Not yet built. */
export interface RunningBuild {
  readonly slot: "a" | "b";
  readonly dir: string;
  readonly sha: string;
}

export async function setUpRuntime(_options: { runtimeDir: string; origin: string; build: (dir: string) => Promise<void> }): Promise<RunningBuild> {
  throw new Error("not built");
}

export async function updateToMain(_options: { runtimeDir: string; running: RunningBuild; build: (dir: string) => Promise<void> }): Promise<RunningBuild | undefined> {
  throw new Error("not built");
}
