// Chat reset route factory — POST /api/chat/reset dispatcher that clears the backend composition
// single-session guard so a wedged chat session can recover without restarting the app. No
// `electron` and no `dom` import; headlessly provable by node:test over a real node:http server —
// mirrors chat-sse-mount.ts's shape exactly (a new sibling dispatcher, not a re-open of it).
//
// READ/CONTROL ONLY, NO SIGNING, NO SESSION (ADR-0091). This route clears ONE flag
// (`compositionInFlight`, via drive's exported `resetCompositionGuard`) and returns 200. It starts
// no session, holds no signing key, hands in no verdict, triggers no build, opens no PR — and it
// never aborts an actually-running session, which is not this route's job (that flag stays owned by
// runHeadlessOrchestrator's own deeper per-session guard).

import type { IncomingMessage, ServerResponse } from "node:http";

import { resetCompositionGuard } from "@storytree/drive";

/**
 * Create the POST /api/chat/reset dispatcher.
 *
 * ROUTE TABLE:
 * - POST /api/chat/reset → clear the composition-level single-session guard, return 200
 * - *   (anything else)  → returns false (fall-through to the next dispatcher / the 404)
 *
 * Returns an async handler `(req, res, pathname) => Promise<boolean>`, the same shape
 * `createChatSseMount` returns, so it composes as a sibling dispatcher in the sidecar's route list.
 */
export function createChatResetMount(): (
  req: IncomingMessage,
  res: ServerResponse,
  pathname: string,
) => Promise<boolean> {
  return async (
    req: IncomingMessage,
    res: ServerResponse,
    pathname: string,
  ): Promise<boolean> => {
    // Only handle POST /api/chat/reset — fall through for every other route/method so the
    // existing 404 / sibling dispatchers (chat-sse-mount, boot-read-routes) still fire.
    if (pathname !== "/api/chat/reset" || req.method !== "POST") {
      return false;
    }

    resetCompositionGuard();

    res.statusCode = 200;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.end(JSON.stringify({ ok: true }));
    return true;
  };
}
