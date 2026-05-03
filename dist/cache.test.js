"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const cache_1 = require("./cache");
(0, vitest_1.describe)('readCache', () => {
    (0, vitest_1.it)('reads a valid JSON cache file', () => {
        const tmp = path.join(os.tmpdir(), `cpf-test-${Date.now()}.json`);
        fs.writeFileSync(tmp, JSON.stringify({ '/foo.ts': 123, '/bar.ts': 456 }));
        const result = (0, cache_1.readCache)(tmp);
        (0, vitest_1.expect)(result).toEqual({ '/foo.ts': 123, '/bar.ts': 456 });
        fs.unlinkSync(tmp);
    });
    (0, vitest_1.it)('returns empty object when file does not exist', () => {
        const result = (0, cache_1.readCache)('/nonexistent/path/weights.json');
        (0, vitest_1.expect)(result).toEqual({});
    });
    (0, vitest_1.it)('returns empty object when file contains invalid JSON', () => {
        const tmp = path.join(os.tmpdir(), `cpf-test-invalid-${Date.now()}.json`);
        fs.writeFileSync(tmp, 'not json');
        const result = (0, cache_1.readCache)(tmp);
        (0, vitest_1.expect)(result).toEqual({});
        fs.unlinkSync(tmp);
    });
    (0, vitest_1.it)('returns empty object when JSON is not an object', () => {
        const tmp = path.join(os.tmpdir(), `cpf-test-array-${Date.now()}.json`);
        fs.writeFileSync(tmp, '[1, 2, 3]');
        const result = (0, cache_1.readCache)(tmp);
        (0, vitest_1.expect)(result).toEqual({});
        fs.unlinkSync(tmp);
    });
});
(0, vitest_1.describe)('writeCache', () => {
    (0, vitest_1.it)('writes cache to disk', () => {
        const tmp = path.join(os.tmpdir(), `cpf-write-${Date.now()}.json`);
        (0, cache_1.writeCache)(tmp, { '/a.ts': 100 });
        const raw = fs.readFileSync(tmp, 'utf-8');
        (0, vitest_1.expect)(JSON.parse(raw)).toEqual({ '/a.ts': 100 });
        fs.unlinkSync(tmp);
    });
    (0, vitest_1.it)('silently fails on permission errors', () => {
        // Writing to a directory that doesn't exist should not throw
        (0, cache_1.writeCache)('/nonexistent/dir/cache.json', { '/a.ts': 1 });
    });
});
(0, vitest_1.describe)('mergeCache', () => {
    (0, vitest_1.it)('merges new entries over existing ones', () => {
        const existing = { a: 1, b: 2 };
        const incoming = { b: 99, c: 3 };
        (0, vitest_1.expect)((0, cache_1.mergeCache)(existing, incoming)).toEqual({ a: 1, b: 99, c: 3 });
    });
    (0, vitest_1.it)('returns a new object without mutating inputs', () => {
        const existing = { a: 1 };
        const incoming = { b: 2 };
        const merged = (0, cache_1.mergeCache)(existing, incoming);
        (0, vitest_1.expect)(merged).not.toBe(existing);
        (0, vitest_1.expect)(merged).not.toBe(incoming);
        (0, vitest_1.expect)(existing).toEqual({ a: 1 });
        (0, vitest_1.expect)(incoming).toEqual({ b: 2 });
    });
});
//# sourceMappingURL=cache.test.js.map