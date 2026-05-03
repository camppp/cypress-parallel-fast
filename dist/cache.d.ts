/**
 * Simple JSON cache that stores per-file historical durations.
 * Each key is an absolute file path, each value is duration in milliseconds.
 *
 * On the first run there's nothing to read, so we fall back to AST estimates.
 * After every run we write actual durations back, so the next run is smarter.
 */
export type WeightsCache = Record<string, number>;
/** Read a weights.json file if it exists; return an empty object otherwise. */
export declare function readCache(filePath: string): WeightsCache;
/** Write a weights.json file, only including successful runs. */
export declare function writeCache(filePath: string, entries: WeightsCache): void;
/** Merge new durations into an existing cache, keeping the latest value for each file. */
export declare function mergeCache(existing: WeightsCache, newEntries: WeightsCache): WeightsCache;
//# sourceMappingURL=cache.d.ts.map