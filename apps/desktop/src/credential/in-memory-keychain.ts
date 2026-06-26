import type { KeychainPort } from "./port.js";

/**
 * An in-memory {@link KeychainPort} for the broker's offline contract tests — headless
 * CI has no real OS keychain. It holds secrets in a Map (never on disk), so a test can
 * both round-trip through it AND assert the broker put the credential nowhere else.
 */
export class InMemoryKeychain implements KeychainPort {
  readonly #store = new Map<string, string>();

  async set(account: string, secret: string): Promise<void> {
    this.#store.set(account, secret);
  }

  async get(account: string): Promise<string | null> {
    return this.#store.get(account) ?? null;
  }

  async delete(account: string): Promise<boolean> {
    return this.#store.delete(account);
  }

  /** Test-only: a copy of every (account → secret) currently held, to assert where a token lives. */
  snapshot(): ReadonlyMap<string, string> {
    return new Map(this.#store);
  }
}
