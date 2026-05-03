import { describe, it, expect } from 'vitest';
import {
  distributeTests,
  distributeTestsGreedy,
  applyShard,
  parseShardSpec,
} from './distributor';
import { TestCase, TaskQueueItem } from './types';

function makeTests(files: Record<string, number>): TestCase[] {
  const out: TestCase[] = [];
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

function makeTaskQueue(files: Record<string, number>): TaskQueueItem[] {
  return distributeTests(makeTests(files));
}

/* ------------------------------------------------------------------ */
/* parseShardSpec                                                      */
/* ------------------------------------------------------------------ */
describe('parseShardSpec', () => {
  it('parses valid specs', () => {
    expect(parseShardSpec('1/4')).toEqual({ index: 1, total: 4 });
    expect(parseShardSpec('4/4')).toEqual({ index: 4, total: 4 });
    expect(parseShardSpec(' 2 / 8 ')).toEqual({ index: 2, total: 8 });
  });

  it('throws for out-of-range index', () => {
    expect(() => parseShardSpec('5/4')).toThrow(/Need 1 <= N <= M/);
    expect(() => parseShardSpec('0/4')).toThrow(/Need 1 <= N <= M/);
  });

  it('throws for malformed input', () => {
    expect(() => parseShardSpec('foo')).toThrow(/Expected format N\/M/);
    expect(() => parseShardSpec('2')).toThrow(/Expected format N\/M/);
    expect(() => parseShardSpec('/4')).toThrow(/Expected format N\/M/);
  });
});

/* ------------------------------------------------------------------ */
/* distributeTests (round-robin / file order)                          */
/* ------------------------------------------------------------------ */
describe('distributeTests', () => {
  it('groups tests by file', () => {
    const tests = makeTests({ a: 100, b: 200, a2: 50 });
    // a and a2 are in the same file "a", wait no - each entry is a different file
    const q = distributeTests(tests);
    expect(q).toHaveLength(3);
    expect(q.map((t) => t.file).sort()).toEqual(['a', 'a2', 'b']);
  });

  it('keeps original file order', () => {
    const tests = makeTests({ z: 1, a: 2, m: 3 });
    const q = distributeTests(tests);
    expect(q.map((t) => t.file)).toEqual(['z', 'a', 'm']);
  });
});

/* ------------------------------------------------------------------ */
/* distributeTestsGreedy                                               */
/* ------------------------------------------------------------------ */
describe('distributeTestsGreedy', () => {
  it('sorts by descending estimated duration', () => {
    const tests = makeTests({ a: 10, b: 100, c: 50 });
    const q = distributeTestsGreedy(tests);
    expect(q.map((t) => t.file)).toEqual(['b', 'c', 'a']);
  });

  it('uses cache over AST estimates when available', () => {
    const tests = makeTests({ a: 10, b: 100, c: 50 });
    const cache = { a: 999, b: 1 };
    const q = distributeTestsGreedy(tests, cache);
    expect(q.map((t) => t.file)).toEqual(['a', 'c', 'b']);
  });

  it('breaks ties by filename for determinism', () => {
    const tests = makeTests({ b: 50, a: 50, c: 50 });
    const q = distributeTestsGreedy(tests);
    expect(q.map((t) => t.file)).toEqual(['a', 'b', 'c']);
  });
});

/* ------------------------------------------------------------------ */
/* applyShard                                                          */
/* ------------------------------------------------------------------ */
describe('applyShard', () => {
  const tasks: TaskQueueItem[] = makeTaskQueue({
    heavy: 100,
    medium: 50,
    light: 10,
  });

  it('returns all tasks for single shard', () => {
    expect(applyShard(tasks, 1, 1)).toHaveLength(3);
  });

  it('distributes across shards deterministically', () => {
    const s1 = applyShard(tasks, 1, 2);
    const s2 = applyShard(tasks, 2, 2);

    // Every task appears exactly once across both shards
    const all = [...s1, ...s2].map((t) => t.file).sort();
    expect(all).toEqual(['heavy', 'light', 'medium']);
  });

  it('puts the heaviest task on shard 1 (largest bin first)', () => {
    const s1 = applyShard(tasks, 1, 2);
    expect(s1.map((t) => t.file)).toContain('heavy');
  });

  it('uses cache durations for bin-packing', () => {
    const cache = { medium: 999 };
    const s1 = applyShard(tasks, 1, 2, cache);
    // With cache, medium becomes heaviest
    expect(s1.map((t) => t.file)).toContain('medium');
  });

  it('returns empty array when no tasks match', () => {
    const s = applyShard(tasks, 5, 10);
    expect(s).toHaveLength(0);
  });

  it('handles more tasks than shards', () => {
    const many = makeTaskQueue({ a: 1, b: 2, c: 3, d: 4, e: 5 });
    const union = new Set<string>();
    for (let i = 1; i <= 2; i++) {
      applyShard(many, i, 2).forEach((t) => union.add(t.file));
    }
    expect(union.size).toBe(5);
  });
});
