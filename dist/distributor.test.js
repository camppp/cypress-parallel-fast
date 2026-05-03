"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const distributor_1 = require("./distributor");
function makeTests(files) {
    const out = [];
    for (const [file, weight] of Object.entries(files)) {
        out.push({
            title: `test in ${file}`,
            file,
            line: 1,
            modifier: 'none',
            estimatedDurationMs: weight,
        });
    }
    return out;
}
function makeTaskQueue(files) {
    return (0, distributor_1.distributeTests)(makeTests(files));
}
/* ------------------------------------------------------------------ */
/* parseShardSpec                                                      */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('parseShardSpec', () => {
    (0, vitest_1.it)('parses valid specs', () => {
        (0, vitest_1.expect)((0, distributor_1.parseShardSpec)('1/4')).toEqual({ index: 1, total: 4 });
        (0, vitest_1.expect)((0, distributor_1.parseShardSpec)('4/4')).toEqual({ index: 4, total: 4 });
        (0, vitest_1.expect)((0, distributor_1.parseShardSpec)(' 2 / 8 ')).toEqual({ index: 2, total: 8 });
    });
    (0, vitest_1.it)('throws for out-of-range index', () => {
        (0, vitest_1.expect)(() => (0, distributor_1.parseShardSpec)('5/4')).toThrow(/Need 1 <= N <= M/);
        (0, vitest_1.expect)(() => (0, distributor_1.parseShardSpec)('0/4')).toThrow(/Need 1 <= N <= M/);
    });
    (0, vitest_1.it)('throws for malformed input', () => {
        (0, vitest_1.expect)(() => (0, distributor_1.parseShardSpec)('foo')).toThrow(/Expected format N\/M/);
        (0, vitest_1.expect)(() => (0, distributor_1.parseShardSpec)('2')).toThrow(/Expected format N\/M/);
        (0, vitest_1.expect)(() => (0, distributor_1.parseShardSpec)('/4')).toThrow(/Expected format N\/M/);
    });
});
/* ------------------------------------------------------------------ */
/* distributeTests (round-robin / file order)                          */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('distributeTests', () => {
    (0, vitest_1.it)('groups tests by file', () => {
        const tests = makeTests({ a: 100, b: 200, a2: 50 });
        // a and a2 are in the same file "a", wait no - each entry is a different file
        const q = (0, distributor_1.distributeTests)(tests);
        (0, vitest_1.expect)(q).toHaveLength(3);
        (0, vitest_1.expect)(q.map((t) => t.file).sort()).toEqual(['a', 'a2', 'b']);
    });
    (0, vitest_1.it)('keeps original file order', () => {
        const tests = makeTests({ z: 1, a: 2, m: 3 });
        const q = (0, distributor_1.distributeTests)(tests);
        (0, vitest_1.expect)(q.map((t) => t.file)).toEqual(['z', 'a', 'm']);
    });
});
/* ------------------------------------------------------------------ */
/* distributeTestsGreedy                                               */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('distributeTestsGreedy', () => {
    (0, vitest_1.it)('sorts by descending estimated duration', () => {
        const tests = makeTests({ a: 10, b: 100, c: 50 });
        const q = (0, distributor_1.distributeTestsGreedy)(tests);
        (0, vitest_1.expect)(q.map((t) => t.file)).toEqual(['b', 'c', 'a']);
    });
    (0, vitest_1.it)('uses cache over AST estimates when available', () => {
        const tests = makeTests({ a: 10, b: 100, c: 50 });
        const cache = { a: 999, b: 1 };
        const q = (0, distributor_1.distributeTestsGreedy)(tests, cache);
        (0, vitest_1.expect)(q.map((t) => t.file)).toEqual(['a', 'c', 'b']);
    });
    (0, vitest_1.it)('breaks ties by filename for determinism', () => {
        const tests = makeTests({ b: 50, a: 50, c: 50 });
        const q = (0, distributor_1.distributeTestsGreedy)(tests);
        (0, vitest_1.expect)(q.map((t) => t.file)).toEqual(['a', 'b', 'c']);
    });
});
/* ------------------------------------------------------------------ */
/* applyShard                                                          */
/* ------------------------------------------------------------------ */
(0, vitest_1.describe)('applyShard', () => {
    const tasks = makeTaskQueue({
        heavy: 100,
        medium: 50,
        light: 10,
    });
    (0, vitest_1.it)('returns all tasks for single shard', () => {
        (0, vitest_1.expect)((0, distributor_1.applyShard)(tasks, 1, 1)).toHaveLength(3);
    });
    (0, vitest_1.it)('distributes across shards deterministically', () => {
        const s1 = (0, distributor_1.applyShard)(tasks, 1, 2);
        const s2 = (0, distributor_1.applyShard)(tasks, 2, 2);
        // Every task appears exactly once across both shards
        const all = [...s1, ...s2].map((t) => t.file).sort();
        (0, vitest_1.expect)(all).toEqual(['heavy', 'light', 'medium']);
    });
    (0, vitest_1.it)('puts the heaviest task on shard 1 (largest bin first)', () => {
        const s1 = (0, distributor_1.applyShard)(tasks, 1, 2);
        (0, vitest_1.expect)(s1.map((t) => t.file)).toContain('heavy');
    });
    (0, vitest_1.it)('uses cache durations for bin-packing', () => {
        const cache = { medium: 999 };
        const s1 = (0, distributor_1.applyShard)(tasks, 1, 2, cache);
        // With cache, medium becomes heaviest
        (0, vitest_1.expect)(s1.map((t) => t.file)).toContain('medium');
    });
    (0, vitest_1.it)('returns empty array when no tasks match', () => {
        const s = (0, distributor_1.applyShard)(tasks, 5, 10);
        (0, vitest_1.expect)(s).toHaveLength(0);
    });
    (0, vitest_1.it)('handles more tasks than shards', () => {
        const many = makeTaskQueue({ a: 1, b: 2, c: 3, d: 4, e: 5 });
        const union = new Set();
        for (let i = 1; i <= 2; i++) {
            (0, distributor_1.applyShard)(many, i, 2).forEach((t) => union.add(t.file));
        }
        (0, vitest_1.expect)(union.size).toBe(5);
    });
});
//# sourceMappingURL=distributor.test.js.map