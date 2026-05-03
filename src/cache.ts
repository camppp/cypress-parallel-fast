import * as fs from 'fs';

/**
 * Simple JSON cache that stores per-file historical durations.
 * Each key is an absolute file path, each value is duration in milliseconds.
 *
 * On the first run there's nothing to read, so we fall back to AST estimates.
 * After every run we write actual durations back, so the next run is smarter.
 */

export type WeightsCache = Record<string, number>;

/** Read a weights.json file if it exists; return an empty object otherwise. */
export function readCache(filePath: string): WeightsCache {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return parsed as WeightsCache;
    }
  } catch {
    // File doesn't exist or is malformed — that's fine, we'll start fresh.
  }
  return {};
}

/** Write a weights.json file, only including successful runs. */
export function writeCache(filePath: string, entries: WeightsCache): void {
  try {
    fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + '\n');
  } catch {
    // Don't crash the whole run if we can't write the cache.
    // The user will just use AST estimates next time.
  }
}

/** Merge new durations into an existing cache, keeping the latest value for each file. */
export function mergeCache(existing: WeightsCache, newEntries: WeightsCache): WeightsCache {
  return { ...existing, ...newEntries };
}
