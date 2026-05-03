/** Lightweight cross-platform resource snapshot for live dashboards. */
export interface ResourceSnapshot {
    /** Percentage of total system memory currently in use (0-100). */
    sysMemPct: string;
    /** Node heap used by the runner process in megabytes. */
    heapMB: string;
    /** Combined RSS of all tracked child processes in megabytes. */
    workerMemMB: string;
    /** Number of currently tracked (active) child processes. */
    activeWorkers: number;
}
/**
 * Tracks system and per-process memory while workers are running.
 * On Unix-like systems it shells out to `ps` for per-child RSS;
 * on Windows per-child memory is approximated to zero.
 */
export declare class ResourceMonitor {
    private activePids;
    add(pid: number): void;
    remove(pid: number): void;
    snapshot(): ResourceSnapshot;
}
//# sourceMappingURL=monitor.d.ts.map