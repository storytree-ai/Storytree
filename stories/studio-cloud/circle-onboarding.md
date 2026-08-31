---
id: "circle-onboarding"
tier: capability
story: studio-cloud
title: "RETIRED — the IAM-allowlist circle: adding a trusted dev is one grant, removing them is one revoke"
outcome: "Retired by ADR-0043: membership is no longer an IAM allowlist. IAP grants allAuthenticatedUsers and authenticates only; invite, role and revoke are in-app operations owned by stories/studio-members (invite-ui, user-directory, app-authorization)."
status: retired
proof_mode: integration-test
depends_on: [cloud-run-iap]
---

# RETIRED — the IAM-allowlist circle: adding a trusted dev is one grant, removing them is one revoke

**Retired 2026-08-31** (`prove-unproven-capabilities-arc-inc-25`). **This capability's outcome is not
merely unbuilt — its mechanism was superseded, and the outcome is delivered elsewhere.**

**What it claimed —** *"The circle is managed as an enumerable IAM allowlist with a runbook: invite,
sign-in, first comment — and revoke — each a single documented step."* Both of its contracts
(`one-step-grant-revoke`, `allowlist-enumerable`) asserted operations on the production IAP IAM
policy.

**Why that is dead —** ADR-0043 made identity **app-owned**: IAP authenticates, the studio
authorizes. [`stories/studio-members`](../studio-members/story.md) says so in terms — *"This
supersedes the hosted studio's first access model (ADR-0042's IAP allowlist + env admin list)"* —
and delivers every half of this capability's outcome under a different implementation:

| this capability's step | now owned by |
|---|---|
| invite a trusted dev | [`invite-ui`](../studio-members/invite-ui.md) — an admin invites by email from the studio |
| the enumerable circle | [`user-directory`](../studio-members/user-directory.md) — the member drawer IS the list |
| what each member may do, and revoke | [`app-authorization`](../studio-members/app-authorization.md) — `resolveAccess`, roles, the last-admin guard |

**And the IAM half is not just superseded — it no longer WORKS as described.** Verified 2026-08-31
in [`infra/studio-cloud.md`](../../infra/studio-cloud.md): `roles/iap.httpsResourceAccessor` on this
service is granted to **`allAuthenticatedUsers`**. So granting an individual user that role changes
nothing observable, and revoking it denies nobody — the edge still admits them and the app's
membership check is what refuses. A "one revoke" contract asserting the dev loses access is not a
hard contract to satisfy; it is a contract that cannot be satisfied at all.

**Nothing depends on this.** It is a leaf: no capability or story declares `depends_on:
circle-onboarding` (it only depends on [`cloud-run-iap`](cloud-run-iap.md), which survives,
re-scoped by the same pass). Its id is removed from `studio-cloud`'s `capabilities:` list.

⚠ **What this retirement does NOT settle, flagged rather than swept:** `studio-cloud`'s story UAT
legs 1 (**Grant**) and 7 (**Revoke**) still author the superseded per-user IAP grant/revoke walk, and
leg 7's success condition — *"Google's edge denies the next visit before any studio API is
reached"* — is false against the `allAuthenticatedUsers` grant. Both are already `UNBOUND — fails
closed` under ADR-0294 D4, so nothing reads them as proven. Re-authoring them is a STORY-tier UAT
call with `(criterion-id:)` / `(revision-id:)` identity to advance, and was deliberately left to
whoever takes that up rather than half-done here.

**The runbook is a separate question.** [`infra/studio-cloud.md`](../../infra/studio-cloud.md) §5
still documents the `gcloud iap web add/remove-iam-policy-binding` grant/revoke/enumerate commands as
the membership path, contradicting §"What a passing token gets you" three sections later. That is an
infra-doc correction, not a work-hierarchy one, and is out of this pass's scope.
