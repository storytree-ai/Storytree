/**
 * The SHARED store half of context-traversal capture (ADR-0484 D1) — the Postgres event log and the
 * local-durable-then-asynchronous-ship path that fills it.
 *
 * A SUBPATH rather than a root-barrel export, on the `@storytree/notice-board/store` precedent: the
 * root barrel is what the studio and every capture caller import, and the shipper is not something
 * a capture caller should reach by completion. The command's own path deliberately reaches exactly
 * ONE function from here — {@link ensureShipBaseline}, which stamps the forward-only baseline and
 * writes nothing else — and everything else below runs out of band.
 *
 * Barrel only — un-asserted connective glue, claimed by no capability as proof.
 */
export {
  PgTraversalEventStore,
  type TraversalEventLocation,
  type TraversalEventStore,
  type TraversalPool,
} from "./traversal-event-store.js";

export {
  ensureShipBaseline,
  hasUnshippedEvents,
  isShipChildProcess,
  markShipAttempt,
  readShipCursor,
  shippableSessions,
  shipTraversalBacklog,
  shipTraversalSession,
  shouldAttemptShip,
  shouldStartShip,
  traversalShipBacklog,
  writeShipCursor,
  SHIP_CHILD_ENV,
  SHIP_CURSOR_EXT,
  SHIP_THROTTLE_MS,
  SHIP_WATCHDOG_MS,
  TRAVERSAL_DIR_ENV,
  type ShipCursor,
  type ShipDeps,
  type ShipReport,
  type ShipSessionOutcome,
  type ShipTriggerInput,
  type TraversalBacklog,
  type TraversalBacklogSession,
} from "./ship.js";
