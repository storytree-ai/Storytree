import type { KeychainPort } from "./port.js";
import type { CredentialKind } from "./kinds.js";

/**
 * The credential broker — the heart of ADR-0109 Step 1. It stores and reads the
 * member's Claude credential, BY KIND, through a {@link KeychainPort}, and does
 * nothing else: it imports no filesystem and references no localStorage, so the
 * credential's only home is the OS keychain (the safety boundary, §Decision 4). The
 * renderer never sees it; the broker lives in the Electron main process.
 *
 * The keychain backend is injected, so the same broker is proven offline against an
 * in-memory fake in CI and runs against the real OS keychain (@napi-rs/keyring) in the
 * shipped app — the seam that keeps the safety contract testable.
 */
export class CredentialBroker {
  readonly #keychain: KeychainPort;
  readonly #service: string;

  constructor(keychain: KeychainPort, service = "storytree-desktop") {
    this.#keychain = keychain;
    this.#service = service;
  }

  /** The keychain account key for a credential kind — namespaced by service so the two kinds never collide. */
  account(kind: CredentialKind): string {
    return `${this.#service}:${kind}`;
  }

  /** Store (or overwrite) the credential for a kind in the keychain. */
  async store(kind: CredentialKind, token: string): Promise<void> {
    await this.#keychain.set(this.account(kind), token);
  }

  /** Read the credential for a kind from the keychain, or null if none is held. */
  async read(kind: CredentialKind): Promise<string | null> {
    return this.#keychain.get(this.account(kind));
  }

  /** Remove the credential for a kind; resolves true iff one was held. */
  async clear(kind: CredentialKind): Promise<boolean> {
    return this.#keychain.delete(this.account(kind));
  }
}
