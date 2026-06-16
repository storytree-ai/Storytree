/**
 * The ChangeStore seam's behavioural contract (ADR-0016 §2) held for InMemoryStore through the
 * REUSABLE {@link changeStoreParitySuite} — the SAME suite packages/store runs for PgChangeStore,
 * so the two backends are proven equivalent on append/read/filter/order/empty (exactly how
 * `storeParitySuite` proves PgLibraryStore ≡ InMemoryStore). Wiring InMemoryStore through the
 * exported suite — rather than re-asserting the contracts inline — is what makes the suite the single
 * source of the ChangeStore contract both backends meet.
 */
import { InMemoryStore, changeStoreParitySuite } from "./store.js";

changeStoreParitySuite("InMemoryStore", () => new InMemoryStore());
