import type { CredentialKind } from "../credential/kinds.js";

/**
 * The subscription-login seam (ADR-0109 §Decision 2). The desktop client's added job
 * over the browser is hosting the **subscription** OAuth token (`CLAUDE_CODE_OAUTH_TOKEN`),
 * which a browser tab cannot hold safely — so the shell captures the credential and hands
 * it to the {@link CredentialBroker}, which keeps it in the OS keychain.
 *
 * Step 1 ships this seam plus the keychain round-trip behind it. The LIVE embedded Claude
 * OAuth handshake (open the auth URL, PKCE exchange, refresh) is operator-attested glue
 * layered behind this interface — its real execution can't run in headless CI, so it is
 * not asserted here. The minimal honest path captures a token the member already obtained
 * (e.g. via `claude setup-token`) or pastes their API key.
 */
export interface CapturedCredential {
  readonly kind: CredentialKind;
  readonly token: string;
}

export interface SubscriptionLogin {
  /** Run the login flow and resolve the captured credential to hand to the broker. */
  run(): Promise<CapturedCredential>;
}

/**
 * The minimal Step-1 login: accept a credential the member supplies directly (a
 * subscription OAuth token or an API key) and normalise it for the broker. The richer
 * embedded OAuth browser flow is the operator-attested follow-on behind {@link SubscriptionLogin}.
 */
export function capturedFromInput(kind: CredentialKind, rawToken: string): CapturedCredential {
  const token = rawToken.trim();
  if (token.length === 0) throw new Error("empty credential — nothing to store");
  return { kind, token };
}
