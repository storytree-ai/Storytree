// Production wiring for the pure Cloud SQL Admin client (ADR-0063): supply the real I/O — an ADC
// access token minted by google-auth-library (NO gcloud subprocess: ambient ADC locally, the
// runtime service account on Cloud Run) and a request over Node's global fetch. The pure
// describe/patch decisions stay in cloud-sql-admin.ts (offline-tested); THIS file is the thin I/O
// shell — like apps/studio/server/dbWake.ts's createMetadataDbWaker, it is not offline-unit-testable
// because it touches real ADC + the network (the inner-loop envelope gap ADR-0063 names).

import { GoogleAuth } from "google-auth-library";
import {
  createCloudSqlAdmin,
  type CloudSqlAdmin,
  type HttpResponse,
} from "./cloud-sql-admin.js";

/** The scope the Cloud SQL Admin API requires (the same cloud-platform scope the connector uses). */
const CLOUD_PLATFORM_SCOPE = "https://www.googleapis.com/auth/cloud-platform";

/** Mint an ADC access token with no subprocess; GoogleAuth caches + refreshes across calls. */
function adcTokenFetcher(): () => Promise<string> {
  const auth = new GoogleAuth({ scopes: [CLOUD_PLATFORM_SCOPE] });
  return async (): Promise<string> => {
    const token = await auth.getAccessToken();
    if (!token) {
      throw new Error(
        "no ADC access token — run `gcloud auth application-default login` locally, or ensure a " +
          "runtime service account is attached (Cloud Run).",
      );
    }
    return token;
  };
}

/** Real HTTP over Node's global fetch (Node 24); never throws on a non-2xx — returns the response. */
async function httpRequest(
  method: "GET" | "PATCH",
  url: string,
  token: string,
  body: string,
): Promise<HttpResponse> {
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(method === "PATCH" ? { "Content-Type": "application/json" } : {}),
    },
    ...(method === "PATCH" && body !== "" ? { body } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  return { status: res.status, body: await res.text() };
}

/** Options for {@link createAdcCloudSqlAdmin}. */
export interface AdcCloudSqlAdminOptions {
  project: string;
  instance: string;
  /** Override the Admin API base (staging/tests); defaults to SQLADMIN_BASE. */
  baseUrl?: string;
}

/**
 * The production Cloud SQL Admin client: an ADC token + a real fetch against the live instance,
 * keyless (ADR-0021). The describe/patch decisions live in the pure {@link createCloudSqlAdmin}; this
 * just injects the real effects. Replaces the gcloud subprocess on the db-control hot path (ADR-0063).
 */
export function createAdcCloudSqlAdmin(opts: AdcCloudSqlAdminOptions): CloudSqlAdmin {
  return createCloudSqlAdmin({
    fetchToken: adcTokenFetcher(),
    request: httpRequest,
    project: opts.project,
    instance: opts.instance,
    ...(opts.baseUrl !== undefined ? { baseUrl: opts.baseUrl } : {}),
  });
}
