"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseShardSpec = parseShardSpec;
exports.applyShard = applyShard;
exports.distributeTests = distributeTests;
exports.distributeTestsGreedy = distributeTestsGreedy;
/**
 * Parse a shard spec like "2/4" into [index, total] (1-indexed index).
 * Throws on any malformed input — better to fail loudly than silently
 * run the wrong subset.
 */
function parseShardSpec(spec) {
    const match = /^(\d+)\s*\/\s*(\d+)$/.exec(spec.trim());
    if (!match) {
        throw new Error(`Invalid --shard value: "${spec}". Expected format N/M (e.g., 2/4).`);
    }
    const index = Number(match[1]);
    const total = Number(match[2]);
    if (index < 1 || total < 1 || index > total) {
        throw new Error(`Invalid --shard value: "${spec}". Need 1 <= N <= M.`);
    }
    return { index, total };
}
/** Resolve a task's duration using the cache if available, else the AST estimate. */
function durationOf(t, weightsCache) {
    return weightsCache?.[t.file] ?? t.estimatedDurationMs;
}
/**
 * Compare two tasks for scheduling priority.
 * Heavier (longer estimated) tasks come first.
 * Ties are broken by filename so results are deterministic across runs.
 */
function compareTasks(a, b, weightsCache) {
    const diff = durationOf(b, weightsCache) - durationOf(a, weightsCache);
    return diff !== 0 ? diff : a.file.localeCompare(b.file);
}
/**
 * Pick the subset of tasks assigned to this shard. We group by file
 * (same as the distributor) and use a longest-processing-time greedy
 * bin-pack so each shard ends up with roughly equal wall-clock time.
 * Cached weights take priority over AST estimates when available.
 */
function applyShard(tasks, shardIndex, shardTotal, weightsCache) {
    if (shardTotal <= 1)
        return tasks;
    // Heaviest first, then assign each file to the currently-lightest bin.
    const sorted = [...tasks].sort((a, b) => compareTasks(a, b, weightsCache));
    const bins = Array.from({ length: shardTotal }, () => []);
    const binTotals = Array(shardTotal).fill(0);
    for (const task of sorted) {
        // Find the lightest bin; tie-break on lower index for determinism.
        let lightest = 0;
        for (let i = 1; i < shardTotal; i++) {
            if (binTotals[i] < binTotals[lightest])
                lightest = i;
        }
        bins[lightest].push(task);
        binTotals[lightest] += durationOf(task);
    }
    return bins[shardIndex - 1];
}
function testWeight(t) {
    return t.estimatedDurationMs ?? 1;
}
function groupByFile(tests) {
    const groups = new Map();
    for (const test of tests) {
        if (!groups.has(test.file))
            groups.set(test.file, []);
        groups.get(test.file).push(test);
    }
    return [...groups.entries()].map(([file, tests]) => ({
        file,
        tests,
        estimatedDurationMs: tests.reduce((s, t) => s + testWeight(t), 0),
    }));
}
// Simple round-robin: keep the original file order in the queue.
function distributeTests(tests) {
    return groupByFile(tests);
}
// Greedy ordering: run the heaviest (slowest estimated) files first so
// they get picked up immediately and don't leave one worker doing all
// the heavy lifting at the end.
// If a cache is provided, we use historical durations instead of AST guesses.
function distributeTestsGreedy(tests, weightsCache) {
    const tasks = groupByFile(tests);
    return tasks.sort((a, b) => compareTasks(a, b, weightsCache));
}
//# sourceMappingURL=distributor.js.map