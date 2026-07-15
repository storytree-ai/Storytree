// The credential kinds the desktop client hosts. Each names the env var its
// operation reads when the credential is brokered from the OS keychain.
// Cursor API key was retired with the Cursor leaf (ADR-0198) — only Claude
// subscription (oauth) and Anthropic Console API key remain.

export type CredentialKind = "oauth" | "api-key";

/** The env var each kind populates for its scoped operation. */
export const CREDENTIAL_ENV_VAR: Record<CredentialKind, string> = {
  oauth: "CLAUDE_CODE_OAUTH_TOKEN",
  "api-key": "ANTHROPIC_API_KEY",
};

export const CREDENTIAL_KINDS: readonly CredentialKind[] = ["oauth", "api-key"];
