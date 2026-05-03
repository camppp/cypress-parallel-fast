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
exports.readCache = readCache;
exports.writeCache = writeCache;
exports.mergeCache = mergeCache;
const fs = __importStar(require("fs"));
/** Read a weights.json file if it exists; return an empty object otherwise. */
function readCache(filePath) {
    try {
        const raw = fs.readFileSync(filePath, 'utf-8');
        const parsed = JSON.parse(raw);
        if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            return parsed;
        }
    }
    catch {
        // File doesn't exist or is malformed — that's fine, we'll start fresh.
    }
    return {};
}
/** Write a weights.json file, only including successful runs. */
function writeCache(filePath, entries) {
    try {
        fs.writeFileSync(filePath, JSON.stringify(entries, null, 2) + '\n');
    }
    catch {
        // Don't crash the whole run if we can't write the cache.
        // The user will just use AST estimates next time.
    }
}
/** Merge new durations into an existing cache, keeping the latest value for each file. */
function mergeCache(existing, newEntries) {
    return { ...existing, ...newEntries };
}
//# sourceMappingURL=cache.js.map