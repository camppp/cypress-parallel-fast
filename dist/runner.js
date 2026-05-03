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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.cypressCommand = void 0;
exports.runWorkers = runWorkers;
const child_process_1 = require("child_process");
const p_limit_1 = __importDefault(require("p-limit"));
const fs = __importStar(require("fs"));
const os = __importStar(require("os"));
const path = __importStar(require("path"));
const junit_1 = require("./junit");
const monitor_1 = require("./monitor");
function runCommand(cmd, verbose, logFile) {
    let pid;
    const promise = new Promise((resolve) => {
        const start = Date.now();
        const child = (0, child_process_1.spawn)(cmd, {
            shell: true,
            stdio: 'pipe',
        });
        pid = child.pid;
        let stdout = '';
        let stderr = '';
        let logStream;
        if (logFile) {
            try {
                logStream = fs.createWriteStream(logFile);
            }
            catch {
                // silently skip on permission error
            }
        }
        child.stdout?.on('data', (d) => {
            const chunk = String(d);
            stdout += chunk;
            if (verbose)
                process.stdout.write(chunk);
            logStream?.write(chunk);
        });
        child.stderr?.on('data', (d) => {
            const chunk = String(d);
            stderr += chunk;
            if (verbose)
                process.stderr.write(chunk);
            logStream?.write(chunk);
        });
        child.on('close', (code, signal) => {
            logStream?.end();
            const crashed = signal !== null;
            resolve({
                workerId: -1,
                success: code === 0,
                exitCode: code,
                signal,
                crashed,
                stdout,
                stderr,
                durationMs: Date.now() - start,
                filesRun: [],
            });
        });
        child.on('error', (err) => {
            logStream?.end();
            resolve({
                workerId: -1,
                success: false,
                exitCode: null,
                signal: null,
                crashed: true,
                stdout,
                stderr: stderr + String(err),
                durationMs: Date.now() - start,
                filesRun: [],
            });
        });
    });
    return { pid, promise };
}
// When --junit is active we need a single reporter (ours). If the user has
// already passed --reporter / --reporter-options through, drop those flags
// and their values so Cypress doesn't choke on duplicates.
function stripReporterArgs(args) {
    const cleaned = [];
    const dropped = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--reporter' || a === '--reporter-options' || a === '-r') {
            dropped.push(a);
            if (i + 1 < args.length) {
                dropped.push(args[++i]);
            }
            continue;
        }
        if (a.startsWith('--reporter=') || a.startsWith('--reporter-options=')) {
            dropped.push(a);
            continue;
        }
        cleaned.push(a);
    }
    return { cleaned, dropped };
}
// Assemble a Cypress run command from our task and whatever extra
// flags the user passed through the CLI. We also splice in any per-worker
// overrides (isolated video folders, JUnit reporter) when requested.
const cypressCommand = (file, titles, cypressArgs, extras = {}) => {
    const grep = titles.join(';');
    const args = [...cypressArgs];
    if (extras.configOverrides && extras.configOverrides.length > 0) {
        args.push('--config', extras.configOverrides.join(','));
    }
    if (extras.reporterArgs && extras.reporterArgs.length > 0) {
        args.push(...extras.reporterArgs);
    }
    args.push('--spec', file);
    args.push('--env', `grep="${grep}"`);
    return `npx cypress run ${args.join(' ')}`;
};
exports.cypressCommand = cypressCommand;
/** Print a concise summary of worker run results to stdout. */
function printSummary(results, verbose) {
    console.log('=== SUMMARY ===');
    let passed = 0;
    let failed = 0;
    for (const r of results) {
        if (r.success) {
            passed++;
        }
        else {
            failed++;
            if (!verbose && r.stderr) {
                console.log(`[FAIL] ${r.filesRun[0]}:`);
                console.log(r.stderr.slice(0, 500));
            }
        }
    }
    const totalMs = results.reduce((s, r) => s + r.durationMs, 0);
    console.log(`\nTotal: ${passed} passed, ${failed} failed, ${totalMs}ms cumulative\n`);
}
async function runWorkers(queue, cypressArgs, options) {
    if (queue.length === 0) {
        console.log('No tests to run.');
        return [];
    }
    // Preview the commands that would actually be executed, including any
    // injected per-worker overrides (--config, --reporter). We show slot 1 as
    // a representative example since the exact slot assignment happens at runtime.
    if (options.dryRun) {
        console.log('\n=== DRY RUN ===\n');
        for (const item of queue) {
            const configOverrides = [];
            if (options.isolateVideos) {
                configOverrides.push('videosFolder=cypress/videos/worker-{slot}');
            }
            const reporterArgs = [];
            if (options.junitPath) {
                reporterArgs.push('--reporter', 'junit', '--reporter-options', 'mochaFile={temp}/output.xml');
            }
            const cmd = (0, exports.cypressCommand)(item.file, item.tests.map((t) => t.title), cypressArgs, {
                configOverrides,
                reporterArgs,
            });
            console.log(`  ${cmd}`);
        }
        console.log(`\n${queue.length} task(s) across ${options.concurrency ?? 1} worker slot(s)\n`);
        return [];
    }
    const concurrency = options.concurrency ?? 1;
    const total = queue.length;
    // Per-run temp dir for worker JUnit XMLs. Each task writes one file, and we
    // stitch them into a single report at the end.
    let junitTempDir;
    let junitCounter = 0;
    let effectiveCypressArgs = cypressArgs;
    if (options.junitPath) {
        junitTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cpf-junit-'));
        // If the user already configured a reporter via pass-through args, we need
        // to strip it — Cypress only accepts one --reporter, and ours needs to win
        // for the merge step to produce anything useful.
        const { cleaned, dropped } = stripReporterArgs(cypressArgs);
        if (dropped.length > 0) {
            console.warn(`Note: --junit overrides your existing reporter arg(s): ${dropped.join(' ')}`);
        }
        effectiveCypressArgs = cleaned;
    }
    // Set up log directory if the user asked for it. We treat --log-dir=false
    // as a polite "no thanks".
    let loggingEnabled = false;
    const logDir = options.logDir && options.logDir.toLowerCase() !== 'false'
        ? options.logDir
        : undefined;
    if (logDir) {
        try {
            fs.mkdirSync(logDir, { recursive: true });
            loggingEnabled = true;
        }
        catch {
            if (options.verbose) {
                console.warn(`Warning: could not create log directory ${logDir}, skipping log writing`);
            }
        }
    }
    // Track how far along we are so we can show a live progress bar.
    let completed = 0;
    const running = new Set();
    const monitor = options.showResources ? new monitor_1.ResourceMonitor() : undefined;
    function printProgress() {
        const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
        const filled = total > 0 ? Math.round((completed / total) * 20) : 0;
        const bar = '█'.repeat(filled) + '░'.repeat(20 - filled);
        const runningFiles = [...running].map((f) => path.basename(f)).join(', ');
        let line = `[${completed}/${total}] ${bar} ${pct}% | running: ${runningFiles}`;
        if (monitor) {
            const s = monitor.snapshot();
            line += ` | mem ${s.sysMemPct}% sys · ${s.workerMemMB}MB workers · ${s.heapMB}MB heap`;
        }
        const maxLen = process.stdout.columns || 80;
        process.stdout.write('\r' + line.slice(0, maxLen).padEnd(maxLen, ' '));
    }
    console.log(`Spawning ${concurrency} worker slot(s), ${total} task(s) in queue...\n`);
    // One shared queue that every worker pulls from. shift() is safe here
    // because Node.js is single-threaded — no race conditions.
    const remaining = [...queue];
    const allResults = [];
    const limit = (0, p_limit_1.default)(concurrency);
    const MAX_CRASH_RETRIES = 2;
    const crashRetryCounts = new Map();
    const workerPromises = [];
    for (let slotId = 1; slotId <= concurrency; slotId++) {
        workerPromises.push(limit(async () => {
            while (true) {
                const item = remaining.shift();
                if (!item)
                    break;
                const file = item.file;
                const titles = item.tests.map((t) => t.title);
                // Build per-task config overrides so workers don't stomp on each
                // other's video files. Cypress 10+ writes one video per spec file,
                // so two workers running different tests from the same file would
                // overwrite each other without this.
                const configOverrides = [];
                if (options.isolateVideos) {
                    configOverrides.push(`videosFolder=cypress/videos/worker-${slotId}`);
                }
                // Per-worker JUnit XML — counter guarantees uniqueness even if two
                // specs share a basename or two workers finish in the same ms.
                const reporterArgs = [];
                if (junitTempDir) {
                    const safeName = path.basename(file).replace(/[^a-zA-Z0-9._-]/g, '_');
                    const idx = ++junitCounter;
                    const xmlPath = path.join(junitTempDir, `worker-${slotId}-${String(idx).padStart(5, '0')}-${safeName}.xml`);
                    reporterArgs.push('--reporter', 'junit', '--reporter-options', `mochaFile=${xmlPath}`);
                }
                const cmd = (0, exports.cypressCommand)(file, titles, effectiveCypressArgs, {
                    configOverrides,
                    reporterArgs,
                });
                if (options.verbose) {
                    console.log(`[Slot ${slotId}] $ ${cmd}`);
                }
                running.add(file);
                printProgress();
                const logFile = loggingEnabled
                    ? path.join(logDir, `worker-${slotId}-${path.basename(file)}.log`)
                    : undefined;
                const start = Date.now();
                const { pid, promise } = runCommand(cmd, options.verbose, logFile);
                if (pid != null)
                    monitor?.add(pid);
                const result = await promise;
                if (pid != null)
                    monitor?.remove(pid);
                running.delete(file);
                completed++;
                printProgress();
                // OOM or SIGKILL? Don't count it as a failure — just put the task back
                // in the queue so another worker can have a go.
                if (result.crashed) {
                    const retries = (crashRetryCounts.get(file) ?? 0) + 1;
                    crashRetryCounts.set(file, retries);
                    if (retries <= MAX_CRASH_RETRIES) {
                        console.warn(`\n[Slot ${slotId}] CRASHED (${result.signal}) — requeueing ${file} (crash retry ${retries}/${MAX_CRASH_RETRIES})`);
                        remaining.unshift(item); // push back to front for another worker
                        continue;
                    }
                    else {
                        console.error(`\n[Slot ${slotId}] CRASHED (${result.signal}) — abandoned ${file} after ${MAX_CRASH_RETRIES} crash retries`);
                    }
                }
                allResults.push({
                    workerId: slotId,
                    success: result.success,
                    exitCode: result.exitCode,
                    signal: result.signal,
                    crashed: result.crashed,
                    stdout: result.stdout,
                    stderr: result.stderr,
                    durationMs: Date.now() - start,
                    filesRun: [file],
                    fileResults: [{
                            file,
                            success: result.success,
                            stdout: result.stdout,
                            stderr: result.stderr,
                            durationMs: result.durationMs,
                            attempts: 1,
                        }],
                });
            }
        }));
    }
    await Promise.all(workerPromises);
    // Wipe the progress bar before printing the final summary.
    process.stdout.write('\r' + ' '.repeat(process.stdout.columns || 80) + '\r');
    printSummary(allResults, options.verbose);
    if (loggingEnabled) {
        console.log(`Logs written to: ${logDir}`);
    }
    // Stitch all the per-worker JUnit XMLs into a single report.
    if (junitTempDir && options.junitPath) {
        try {
            const count = await (0, junit_1.mergeJUnitFiles)(junitTempDir, options.junitPath);
            if (count > 0) {
                console.log(`JUnit report written to: ${options.junitPath} (${count} suite(s))`);
            }
        }
        catch (err) {
            console.warn(`Warning: failed to merge JUnit reports: ${String(err)}`);
        }
        finally {
            try {
                fs.rmSync(junitTempDir, { recursive: true, force: true });
            }
            catch {
                // cleanup failure is not worth crashing over
            }
        }
    }
    return allResults;
}
//# sourceMappingURL=runner.js.map