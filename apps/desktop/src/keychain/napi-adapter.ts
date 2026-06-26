import { AsyncEntry } from "@napi-rs/keyring";
import type { KeychainPort } from "../credential/port.js";

/**
 * The real {@link KeychainPort} — backed by the OS keychain through @napi-rs/keyring
 * (macOS Keychain / Windows Credential Manager / Linux libsecret). This is the operator-
 * attested adapter (ADR-0070): it is NOT exercised by CI (headless runners have no
 * keychain), so it never appears in a `*.test.ts`; the broker's logic is proven offline
 * against the in-memory fake, and this thin adapter is proven by an operator round-trip
 * on a real machine.
 *
 * It normalises the backend to the port contract: a missing entry reads back as `null`
 * (not a throw), exactly like the in-memory fake the contracts run against.
 */
const SERVICE = "storytree-desktop";

export class NapiKeychain implements KeychainPort {
  async set(account: string, secret: string): Promise<void> {
    await new AsyncEntry(SERVICE, account).setPassword(secret);
  }

  async get(account: string): Promise<string | null> {
    try {
      return (await new AsyncEntry(SERVICE, account).getPassword()) ?? null;
    } catch {
      return null;
    }
  }

  async delete(account: string): Promise<boolean> {
    try {
      return await new AsyncEntry(SERVICE, account).deleteCredential();
    } catch {
      return false;
    }
  }
}
