import type { FihDesign } from "../types";
import { parseSharedDesign, PENDING_FIH_KEY, SHARED_RETRY_AT_KEY, SHARED_SAVE_INTERVAL_MS } from "./shared";
import type { FihSaveStatus } from "./shared";

interface SyncOptions {
  send: (design: FihDesign) => Promise<void>;
  onStatus: (status: FihSaveStatus) => void;
  storage?: Pick<Storage, "getItem" | "setItem" | "removeItem"> | null;
}

// Serialize writes, coalesce rapid edits, and retain an outbox across reloads.
// A slow Firebase operation stays in flight: starting another could publish stale data.
export function createSharedFihSync({ send, onStatus, storage }: SyncOptions) {
  let pending: FihDesign | null = null;
  let nextSaveAt = 0;
  try {
    pending = parseSharedDesign(JSON.parse(storage?.getItem(PENDING_FIH_KEY) ?? "null"));
    const retryAt = Number(storage?.getItem(SHARED_RETRY_AT_KEY));
    if (Number.isFinite(retryAt) && retryAt > 0) {
      // A stale/edited local clock must not defer sharing indefinitely.
      nextSaveAt = Math.min(retryAt, Date.now() + SHARED_SAVE_INTERVAL_MS + 100);
    }
  }
  catch { /* Browser storage is optional. */ }
  let revision = 0;
  let inFlight = false;
  let destroyed = false;
  let scheduled: ReturnType<typeof setTimeout> | undefined;
  let slow: ReturnType<typeof setTimeout> | undefined;

  function rememberCooldown() {
    nextSaveAt = Date.now() + SHARED_SAVE_INTERVAL_MS + 100;
    try { storage?.setItem(SHARED_RETRY_AT_KEY, String(nextSaveAt)); } catch { /* Server rules still enforce it. */ }
  }

  function schedule() {
    if (destroyed || inFlight || !pending || scheduled !== undefined) return;
    const delay = Math.max(0, nextSaveAt - Date.now());
    if (delay) scheduled = setTimeout(() => { scheduled = undefined; void flush(); }, delay);
    else void flush();
  }
  async function flush() {
    if (destroyed || inFlight || !pending) return;
    inFlight = true;
    const sentRevision = revision;
    const design = pending;
    rememberCooldown();
    onStatus("saving");
    slow = setTimeout(() => { if (!destroyed) onStatus("offline"); }, 8_000);
    try {
      await send(design);
      // Wait after acknowledgement so latency cannot accidentally bypass the cooldown.
      rememberCooldown();
      if (!destroyed && sentRevision === revision) {
        pending = null;
        try {
          // Another tab may have queued a newer design in the same browser.
          if (storage?.getItem(PENDING_FIH_KEY) === JSON.stringify(design)) storage.removeItem(PENDING_FIH_KEY);
        } catch { /* Local release is still saved separately. */ }
        onStatus("saved");
      }
    } catch {
      if (!destroyed) onStatus("unavailable");
      // No retry loop on permission/quota errors. Retry on another release, reconnect, or user action.
    } finally {
      clearTimeout(slow);
      inFlight = false;
      if (!destroyed && pending && sentRevision !== revision) schedule();
    }
  }
  return {
    submit(value: FihDesign) {
      const design = parseSharedDesign(value);
      if (destroyed || !design) return;
      pending = design;
      revision++;
      try { storage?.setItem(PENDING_FIH_KEY, JSON.stringify(design)); } catch { /* Saving can still work online. */ }
      onStatus("saving");
      schedule();
    },
    retry() {
      if (!destroyed && pending) onStatus("saving");
      schedule();
    },
    destroy() {
      destroyed = true;
      clearTimeout(scheduled);
      clearTimeout(slow);
    },
  };
}
