import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { readCache, writeCache, mergeCache } from './cache';

describe('readCache', () => {
  it('reads a valid JSON cache file', () => {
    const tmp = path.join(os.tmpdir(), `cpf-test-${Date.now()}.json`);
    fs.writeFileSync(tmp, JSON.stringify({ '/foo.ts': 123, '/bar.ts': 456 }));
    const result = readCache(tmp);
    expect(result).toEqual({ '/foo.ts': 123, '/bar.ts': 456 });
    fs.unlinkSync(tmp);
  });

  it('returns empty object when file does not exist', () => {
    const result = readCache('/nonexistent/path/weights.json');
    expect(result).toEqual({});
  });

  it('returns empty object when file contains invalid JSON', () => {
    const tmp = path.join(os.tmpdir(), `cpf-test-invalid-${Date.now()}.json`);
    fs.writeFileSync(tmp, 'not json');
    const result = readCache(tmp);
    expect(result).toEqual({});
    fs.unlinkSync(tmp);
  });

  it('returns empty object when JSON is not an object', () => {
    const tmp = path.join(os.tmpdir(), `cpf-test-array-${Date.now()}.json`);
    fs.writeFileSync(tmp, '[1, 2, 3]');
    const result = readCache(tmp);
    expect(result).toEqual({});
    fs.unlinkSync(tmp);
  });
});

describe('writeCache', () => {
  it('writes cache to disk', () => {
    const tmp = path.join(os.tmpdir(), `cpf-write-${Date.now()}.json`);
    writeCache(tmp, { '/a.ts': 100 });
    const raw = fs.readFileSync(tmp, 'utf-8');
    expect(JSON.parse(raw)).toEqual({ '/a.ts': 100 });
    fs.unlinkSync(tmp);
  });

  it('silently fails on permission errors', () => {
    // Writing to a directory that doesn't exist should not throw
    writeCache('/nonexistent/dir/cache.json', { '/a.ts': 1 });
  });
});

describe('mergeCache', () => {
  it('merges new entries over existing ones', () => {
    const existing = { a: 1, b: 2 };
    const incoming = { b: 99, c: 3 };
    expect(mergeCache(existing, incoming)).toEqual({ a: 1, b: 99, c: 3 });
  });

  it('returns a new object without mutating inputs', () => {
    const existing = { a: 1 };
    const incoming = { b: 2 };
    const merged = mergeCache(existing, incoming);
    expect(merged).not.toBe(existing);
    expect(merged).not.toBe(incoming);
    expect(existing).toEqual({ a: 1 });
    expect(incoming).toEqual({ b: 2 });
  });
});
