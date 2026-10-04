import { insforge } from "./insforge";

let serverTimeOffsetMs: number | null = null;
let syncInProgress: Promise<void> | null = null;
let lastSyncPerfMs = 0;

/**
 * Synchronizes the client's clock offset against the authoritative database server.
 * Uses network round-trip time (RTT) midpoint estimation anchored to performance.now().
 * Since performance.now() is monotonic, this offset remains immune to client system clock skew/changes.
 */
export async function syncServerTime(force = false): Promise<void> {
  const nowPerf = performance.now();
  if (!force && serverTimeOffsetMs !== null && nowPerf - lastSyncPerfMs < 30000) {
    return;
  }

  if (syncInProgress) {
    return syncInProgress;
  }

  syncInProgress = (async () => {
    try {
      const t0 = performance.now();
      const res = await insforge.database.rpc("get_round2_server_time");
      const t1 = performance.now();

      if (res.data) {
        const serverTime = new Date(res.data as string).getTime();
        const rtt = t1 - t0;
        const midPointPerf = t0 + rtt / 2;
        serverTimeOffsetMs = serverTime - midPointPerf;
        lastSyncPerfMs = performance.now();
      }
    } catch (err) {
      console.warn("Failed to sync server time, falling back to local clock:", err);
    } finally {
      syncInProgress = null;
    }
  })();

  return syncInProgress;
}

/**
 * Returns the current authoritative server timestamp in epoch milliseconds.
 * If server time hasn't synced yet, falls back to local Date.now().
 */
export function getServerNow(): number {
  if (serverTimeOffsetMs !== null) {
    return performance.now() + serverTimeOffsetMs;
  }
  return Date.now();
}
