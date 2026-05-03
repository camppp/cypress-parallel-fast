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
exports.ResourceMonitor = void 0;
const os = __importStar(require("os"));
const child_process_1 = require("child_process");
/**
 * Tracks system and per-process memory while workers are running.
 * On Unix-like systems it shells out to `ps` for per-child RSS;
 * on Windows per-child memory is approximated to zero.
 */
class ResourceMonitor {
    constructor() {
        this.activePids = new Set();
    }
    add(pid) {
        if (pid != null)
            this.activePids.add(pid);
    }
    remove(pid) {
        this.activePids.delete(pid);
    }
    snapshot() {
        const sysTotal = os.totalmem();
        const sysUsed = sysTotal - os.freemem();
        const sysMemPct = ((sysUsed / sysTotal) * 100).toFixed(0);
        const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);
        let workerMem = 0;
        const dead = [];
        for (const pid of this.activePids) {
            try {
                // macOS / Linux: RSS in kilobytes
                const rss = (0, child_process_1.execSync)(`ps -o rss= -p ${pid}`, {
                    encoding: 'utf-8',
                    timeout: 50,
                });
                workerMem += parseInt(rss.trim(), 10) * 1024;
            }
            catch {
                dead.push(pid);
            }
        }
        for (const pid of dead)
            this.activePids.delete(pid);
        const workerMemMB = (workerMem / 1024 / 1024).toFixed(0);
        return {
            sysMemPct,
            heapMB,
            workerMemMB,
            activeWorkers: this.activePids.size,
        };
    }
}
exports.ResourceMonitor = ResourceMonitor;
//# sourceMappingURL=monitor.js.map