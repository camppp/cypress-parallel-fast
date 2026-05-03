import { TestCase, TaskQueueItem } from './types';
/**
 * Parse a shard spec like "2/4" into [index, total] (1-indexed index).
 * Throws on any malformed input — better to fail loudly than silently
 * run the wrong subset.
 */
export declare function parseShardSpec(spec: string): {
    index: number;
    total: number;
};
/**
 * Pick the subset of tasks assigned to this shard. We group by file
 * (same as the distributor) and use a longest-processing-time greedy
 * bin-pack so each shard ends up with roughly equal wall-clock time.
 * Cached weights take priority over AST estimates when available.
 */
export declare function applyShard(tasks: TaskQueueItem[], shardIndex: number, shardTotal: number, weightsCache?: Record<string, number>): TaskQueueItem[];
export declare function distributeTests(tests: TestCase[]): TaskQueueItem[];
export declare function distributeTestsGreedy(tests: TestCase[], weightsCache?: Record<string, number>): TaskQueueItem[];
//# sourceMappingURL=distributor.d.ts.map