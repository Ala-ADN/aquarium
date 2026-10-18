import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_APPEARANCE } from "../src/fih/appearance";
import { createSharedFihSync } from "../src/fih/shared-sync";
import { LEGACY_PENDING_FIH_KEY, PENDING_FIH_KEY, SHARED_SAVE_INTERVAL_MS } from "../src/fih/shared";
import { serializeFihDesign } from "../src/fih/design";

const design = { ...DEFAULT_APPEARANCE, count: 2 };
const nextDesign = { ...design, color: "#123456" };
let sync: ReturnType<typeof createSharedFihSync>;
const storage = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
};
beforeEach(() => vi.useFakeTimers());
afterEach(() => { sync?.destroy(); vi.useRealTimers(); });

describe("shared save outbox", () => {
  it("recovers the legacy outbox and removes it only after acknowledgement", async () => {
    const local = storage();
    const raw = JSON.stringify(design);
    local.setItem(LEGACY_PENDING_FIH_KEY, raw);
    let acknowledge!: () => void;
    const send = vi.fn(() => new Promise<void>((resolve) => { acknowledge = resolve; }));
    sync = createSharedFihSync({ send, onStatus: vi.fn(), storage: local });
    expect(local.getItem(LEGACY_PENDING_FIH_KEY)).toBe(raw);
    sync.retry();
    expect(send).toHaveBeenCalledWith(design);
    expect(local.getItem(LEGACY_PENDING_FIH_KEY)).toBe(raw);
    acknowledge();
    await vi.advanceTimersByTimeAsync(0);
    expect(local.getItem(LEGACY_PENDING_FIH_KEY)).toBeNull();
  });
  it.each([
    { ...design, schemaVersion: 2, effects: { glow: 1 } },
    { ...design, schemaVersion: 1, effects: { glow: 1 } },
  ])("never overwrites or publishes an unsupported outbox format", async (future) => {
    const local = storage();
    const raw = JSON.stringify(future);
    local.setItem(PENDING_FIH_KEY, raw);
    local.setItem(LEGACY_PENDING_FIH_KEY, JSON.stringify(design));
    const send = vi.fn();
    const onStatus = vi.fn();
    sync = createSharedFihSync({ send, onStatus, storage: local });
    sync.retry();
    sync.submit(nextDesign);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).not.toHaveBeenCalled();
    expect(local.getItem(PENDING_FIH_KEY)).toBe(raw);
    expect(onStatus).toHaveBeenLastCalledWith("unavailable");
  });
  it("protects an outbox upgraded by another tab after this tab loaded", async () => {
    const local = storage();
    const send = vi.fn().mockResolvedValue(undefined);
    const onStatus = vi.fn();
    sync = createSharedFihSync({ send, onStatus, storage: local });
    const future = JSON.stringify({ ...design, schemaVersion: 2 });
    local.setItem(PENDING_FIH_KEY, future);
    sync.submit(design);
    await vi.advanceTimersByTimeAsync(0);
    expect(send).not.toHaveBeenCalled();
    expect(local.getItem(PENDING_FIH_KEY)).toBe(future);
  });
  it("does not acknowledge before the server or clear a newer pending design", async () => {
    let acknowledge!: () => void;
    const send = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { acknowledge = resolve; }))
      .mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const local = storage();
    sync = createSharedFihSync({ send, onStatus, storage: local });
    sync.submit(design);
    sync.submit(nextDesign);
    expect(send).toHaveBeenCalledTimes(1);
    expect(onStatus).not.toHaveBeenCalledWith("saved");
    acknowledge();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(local.getItem(PENDING_FIH_KEY)!)).toEqual(serializeFihDesign(nextDesign));
    await vi.advanceTimersByTimeAsync(SHARED_SAVE_INTERVAL_MS + 100);
    expect(send).toHaveBeenLastCalledWith(nextDesign);
    expect(local.getItem(PENDING_FIH_KEY)).toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });
  it("keeps failures for an explicit retry, without a quota-error retry loop", async () => {
    const send = vi.fn().mockRejectedValueOnce(new Error("permission-denied")).mockResolvedValue(undefined);
    const onStatus = vi.fn();
    const local = storage();
    sync = createSharedFihSync({ send, onStatus, storage: local });
    sync.submit(design);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(send).toHaveBeenCalledTimes(1);
    expect(local.getItem(PENDING_FIH_KEY)).not.toBeNull();
    expect(onStatus).toHaveBeenLastCalledWith("unavailable");
    sync.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledTimes(2);
    expect(onStatus).toHaveBeenLastCalledWith("saved");
  });
  it("does not start concurrent writes when a slow operation is retried", async () => {
    const send = vi.fn(() => new Promise<void>(() => {}));
    const onStatus = vi.fn();
    sync = createSharedFihSync({ send, onStatus });
    sync.submit(design);
    await vi.advanceTimersByTimeAsync(8_000);
    expect(onStatus).toHaveBeenLastCalledWith("offline");
    sync.retry();
    sync.submit(nextDesign);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("does not remove a newer outbox entry written by another tab", async () => {
    let acknowledge!: () => void;
    const local = storage();
    sync = createSharedFihSync({
      send: () => new Promise<void>((resolve) => { acknowledge = resolve; }),
      onStatus: vi.fn(), storage: local,
    });
    sync.submit(design);
    local.setItem(PENDING_FIH_KEY, JSON.stringify(nextDesign));
    acknowledge();
    await vi.advanceTimersByTimeAsync(0);
    expect(JSON.parse(local.getItem(PENDING_FIH_KEY)!)).toEqual(nextDesign);
  });
  it("recovers an intended save across reloads without publishing ordinary local saves", async () => {
    const local = storage();
    local.setItem(PENDING_FIH_KEY, JSON.stringify(design));
    const send = vi.fn().mockResolvedValue(undefined);
    sync = createSharedFihSync({ send, onStatus: vi.fn(), storage: local });
    expect(send).not.toHaveBeenCalled();
    sync.retry();
    await vi.advanceTimersByTimeAsync(0);
    expect(send).toHaveBeenCalledWith(design);
    expect(local.getItem(PENDING_FIH_KEY)).toBeNull();
  });
  it("preserves the save cooldown when reloading with an edit still queued", async () => {
    const local = storage();
    const send = vi.fn().mockResolvedValue(undefined);
    sync = createSharedFihSync({ send, onStatus: vi.fn(), storage: local });
    sync.submit(design);
    await vi.advanceTimersByTimeAsync(0);
    sync.submit(nextDesign);
    await vi.advanceTimersByTimeAsync(5_000);
    sync.destroy();
    sync = createSharedFihSync({ send, onStatus: vi.fn(), storage: local });
    sync.retry();
    expect(send).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(SHARED_SAVE_INTERVAL_MS + 100 - 5_000);
    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenLastCalledWith(nextDesign);
    expect(local.getItem(PENDING_FIH_KEY)).toBeNull();
  });
  it("continues online when browser storage throws, and ignores acknowledgements after teardown", async () => {
    let acknowledge!: () => void;
    const onStatus = vi.fn();
    sync = createSharedFihSync({
      send: () => new Promise<void>((resolve) => { acknowledge = resolve; }), onStatus,
      storage: { getItem() { throw new Error(); }, setItem() { throw new Error(); }, removeItem() { throw new Error(); } },
    });
    sync.submit(design);
    sync.destroy();
    onStatus.mockClear();
    acknowledge();
    await vi.advanceTimersByTimeAsync(0);
    expect(onStatus).not.toHaveBeenCalled();
  });
});
