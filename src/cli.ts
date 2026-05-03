#!/usr/bin/env node

import { Command } from 'commander';
import * as os from 'os';
import { parseSpecs } from './parser';
import { distributeTests, distributeTestsGreedy, applyShard, parseShardSpec } from './distributor';
import { runWorkers } from './runner';
import { CLIOptions } from './types';
import { readCache, writeCache, mergeCache } from './cache';

const program = new Command();

program
  .name('cypress-parallel-fast')
  .description(
    'Parallelize Cypress test cases within and across spec files. ' +
      'Accepts all Cypress CLI arguments and passes them through.'
  )
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
  .action(async (options: CLIOptions, cmd: Command) => {
    const threads = parseInt(String(options.threads), 10);
    if (isNaN(threads) || threads < 1) {
      console.error('Error: --threads must be a positive integer');
      process.exit(1);
    }

    // Anything we don't recognize gets forwarded straight to Cypress. We just
    // filter out paths that look like spec files (from shell glob expansion).
    const isFilePath = (arg: string) => arg.includes('/') || arg.endsWith('.ts') || arg.endsWith('.js') || arg.endsWith('.tsx') || arg.endsWith('.jsx');
    const cypressArgs = cmd.args.filter(arg => !isFilePath(arg));

    // Figure out which specs to look for — explicit glob, or default to everything.
    const specPattern = options.spec || '**/*.{cy,spec}.{js,ts}';

    console.log(`Parsing spec pattern: ${specPattern}...`);
    const parsed = await parseSpecs([specPattern]);

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
    const cache = options.greedy || options.shard ? readCache(weightsPath) : {};

    let queue = options.greedy
      ? distributeTestsGreedy(allTests, cache)
      : distributeTests(allTests);

    if (options.shard) {
      let shard;
      try {
        shard = parseShardSpec(options.shard);
      } catch (err) {
        console.error(`Error: ${(err as Error).message}`);
        process.exit(1);
      }
      const beforeCount = queue.length;
      queue = applyShard(queue, shard.index, shard.total, cache);
      console.log(
        `Shard ${shard.index}/${shard.total}: ${queue.length} of ${beforeCount} task(s) assigned to this machine.\n`
      );
      if (queue.length === 0) {
        console.log('Nothing to do on this shard.');
        process.exit(0);
      }
    }

    const results = await runWorkers(
      queue,
      cypressArgs,
      {
        verbose: options.verbose,
        dryRun: options.dryRun,
        concurrency: threads,
        logDir: options.logDir,
        isolateVideos: options.isolateVideos,
        junitPath: options.mergeJunit,
        showResources: options.showResources,
      },
    );

    // Record actual per-file durations so the next run is smarter.
    const newEntries: Record<string, number> = {};
    for (const r of results) {
      if (r.success && r.filesRun[0]) {
        newEntries[r.filesRun[0]] = r.durationMs;
      }
    }
    if (Object.keys(newEntries).length > 0 && !options.dryRun) {
      const updated = mergeCache(cache, newEntries);
      writeCache(weightsPath, updated);
    }

    const failed = results.filter((r) => !r.success).length;
    process.exit(failed);
  });

program.parse();
