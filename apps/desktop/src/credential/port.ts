/**
 * The narrow keychain seam — the safety boundary of ADR-0109 §Decision 4. The broker
 * reaches the OS keychain ONLY through these three verbs; the real adapter
 * (@napi-rs/keyring → Keychain / Credential Manager / libsecret) and the in-memory
 * test fake both implement it. Keeping the surface this thin is what lets the broker's
 * contracts run offline in headless CI against a fake, while in production the
 * credential never leaves the keychain.
 */
export interface KeychainPort {
  /** Store (or overwrite) the secret under an account key. */
  set(account: string, secret: string): Promise<void>;
  /** Read the secret for an account key, or null if absent. */
  get(account: string): Promise<string | null>;
  /** Delete the secret for an account key; resolves true iff something was removed. */
  delete(account: string): Promise<boolean>;
}
