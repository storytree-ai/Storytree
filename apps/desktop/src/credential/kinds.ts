// The two credential kinds the desktop client hosts (ADR-0109 §Decision 2): the
// long-lived subscription OAuth token and the metered API key. Each names the env
// var the worker reads when the credential is later brokered to it per build (Step 2,
// out of scope here) — named now so the dual support the ADR requires is explicit.

export type CredentialKind = "oauth" | "api-key";

/** The env var each kind populates downstream (Step 2 wiring); the dual support, named. */
export const CREDENTIAL_ENV_VAR: Record<CredentialKind, string> = {
  oauth: "CLAUDE_CODE_OAUTH_TOKEN",
  "api-key": "ANTHROPIC_API_KEY",
};

export const CREDENTIAL_KINDS: readonly CredentialKind[] = ["oauth", "api-key"];
