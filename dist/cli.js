#!/usr/bin/env node
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
const commander_1 = require("commander");
const os = __importStar(require("os"));
const parser_1 = require("./parser");
const distributor_1 = require("./distributor");
const runner_1 = require("./runner");
const cache_1 = require("./cache");
const program = new commander_1.Command();
program
    .name('cypress-parallel-fast')
    .description('Parallelize Cypress test cases within and across spec files. ' +
    'Accepts all Cypress CLI arguments and passes them through.')
    .allowUnknownOption(true)
    .allowExcessArguments(true)
    .option('-t, --threads <n>', 'number of parallel workers', `${os.cpus().length}`)
    .option('--greedy', 'use greedy (duration-aware) distribution instead of round-robin')
    .option('--dry-run', 'print the commands that would be executed without running them')
    .option('-v, --verbose', 'inherit worker stdout/stderr')
    .option('--spec <pattern>', 'spec file pattern or path (defaults to **/*.{cy,spec}.{js,ts})')
    .option('--log-dir <path>', 'directory to write worker stdout/stderr logs (default: off)')
    .option('--weights <path>', 'path to historical timing cache for greedy scheduling', './weights.json')
    .option('--isolate-videos', 'write each worker\'s videos to cypress/videos/worker-<slot> to avoid overwrites')
    .option('--merge-junit <path>', 'merge per-worker JUnit XMLs into a single report at this path')
    .option('--shard <N/M>', 'run only this machine\'s portion (e.g. 2/4 for shard 2 of 4) — duration-aware when weights are available')
    .option('--show-resources', 'show live system + worker memory stats in the progress bar')
    .action(async (options, cmd) => {
    const threads = parseInt(String(options.threads), 10);
    if (isNaN(threads) || threads < 1) {
        console.error('Error: --threads must be a positive integer');
        process.exit(1);
    }
    // Anything we don't recognize gets forwarded straight to Cypress. We just
    // filter out paths that look like spec files (from shell glob expansion).
    const isFilePath = (arg) => arg.includes('/') || arg.endsWith('.ts') || arg.endsWith('.js') || arg.endsWith('.tsx') || arg.endsWith('.jsx');
    const cypressArgs = cmd.args.filter(arg => !isFilePath(arg));
    // Figure out which specs to look for — explicit glob, or default to everything.
    const specPattern = options.spec || '**/*.{cy,spec}.{js,ts}';
    console.log(`Parsing spec pattern: ${specPattern}...`);
    const parsed = await (0, parser_1.parseSpecs)([specPattern]);
    const allTests = parsed.flatMap((p) => p.tests);
    if (allTests.length === 0) {
        console.error('No test cases found in the provided spec files.');
        process.exit(1);
    }
    console.log(`Found ${allTests.length} test(s) across ${parsed.length} file(s).`);
    console.log(`Distributing across ${Math.min(threads, allTests.length)} worker(s).\n`);
    // We load the weights cache if either greedy scheduling OR sharding is
    // active — both benefit from historical timing data.
    const weightsPath = options.weights || './weights.json';
    const cache = options.greedy || options.shard ? (0, cache_1.readCache)(weightsPath) : {};
    let queue = options.greedy
        ? (0, distributor_1.distributeTestsGreedy)(allTests, cache)
        : (0, distributor_1.distributeTests)(allTests);
    if (options.shard) {
        let shard;
        try {
            shard = (0, distributor_1.parseShardSpec)(options.shard);
        }
        catch (err) {
            console.error(`Error: ${err.message}`);
            process.exit(1);
        }
        const beforeCount = queue.length;
        queue = (0, distributor_1.applyShard)(queue, shard.index, shard.total, cache);
        console.log(`Shard ${shard.index}/${shard.total}: ${queue.length} of ${beforeCount} task(s) assigned to this machine.\n`);
        if (queue.length === 0) {
            console.log('Nothing to do on this shard.');
            process.exit(0);
        }
    }
    const results = await (0, runner_1.runWorkers)(queue, cypressArgs, {
        verbose: options.verbose,
        dryRun: options.dryRun,
        concurrency: threads,
        logDir: options.logDir,
        isolateVideos: options.isolateVideos,
        junitPath: options.mergeJunit,
        showResources: options.showResources,
    });
    // Record actual per-file durations so the next run is smarter.
    const newEntries = {};
    for (const r of results) {
        if (r.success && r.filesRun[0]) {
            newEntries[r.filesRun[0]] = r.durationMs;
        }
    }
    if (Object.keys(newEntries).length > 0 && !options.dryRun) {
        const updated = (0, cache_1.mergeCache)(cache, newEntries);
        (0, cache_1.writeCache)(weightsPath, updated);
    }
    const failed = results.filter((r) => !r.success).length;
    process.exit(failed);
});
program.parse();
//# sourceMappingURL=cli.js.map