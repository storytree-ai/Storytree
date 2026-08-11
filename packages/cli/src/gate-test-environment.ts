// The credential-free boundary for the standard local test leg.
//
// `pnpm -r test` must mean the same thing on a hydrated laptop as it does in CI: an
// accidental real Library read is a failed test, never a green result purchased by a
// developer's local secrets. A deliberately unreachable local store-door URL wins before the CLI
// considers the direct Cloud SQL path, so `loadLocalSecrets()` cannot restore that access.
// Tests that need a hermetic store door already set STORYTREE_STORE_URL explicitly; that
// explicit child environment replaces this sentinel with its local fixture door.

/**
 * A syntactically valid door preserves startup for commands that do not read the corpus, while TCP
 * port 0 makes a real store read fail locally and deterministically. It never dials an external host.
 */
export const CREDENTIAL_FREE_STORE_DOOR_URL = "http://127.0.0.1:0/credential-free";

/**
 * The two forms the gate executes for its standard test leg: the declared recursive form and
 * the affected-project rewrite. Keep this deliberately narrower than a generic `endsWith("test")`:
 * `pnpm check:unit-test` is a check command, not the package test suite whose environment we own.
 */
const STANDARD_TEST_LEG =
  /^pnpm(?:\s+(?:-r|--no-bail|--filter\s+\S+))+\s+test$/;

export function isStandardTestLeg(command: string): boolean {
  return STANDARD_TEST_LEG.test(command.trim());
}

/**
 * Preserve every ordinary execution setting while replacing any ambient store door for the
 * standard package-test leg. The unreachable door is intentional: it wins source selection before
 * the CLI can hydrate direct-connector secrets, while a command that never reads the store can run.
 */
export function credentialFreeTestEnvironment(
  command: string,
  env: NodeJS.ProcessEnv,
): NodeJS.ProcessEnv {
  if (!isStandardTestLeg(command)) return env;
  return { ...env, STORYTREE_STORE_URL: CREDENTIAL_FREE_STORE_DOOR_URL };
}
