# cypress-parallel-fast

Run Cypress tests in parallel across individual `it()` blocks — not just entire spec files. Built on a dynamic task queue so workers stay busy and slow tests don't hold up the whole suite.

## Why not just `cypress-parallel`?

Most Cypress parallelization tools split by **spec file**. That's fine until you have one massive file with 40 tests and nine tiny ones. `cypress-parallel-fast` parses every `it()` / `test()` / `specify()` declaration, groups them by file, and feeds them into a shared queue that workers pull from continuously. Fast workers pick up extra tasks instead of sitting idle.

## Install

```bash
npm install -g cypress-parallel-fast
# or
npx cypress-parallel-fast ...
```

## Usage

```bash
cypress-parallel-fast [options] [cypress-args]
```

Any arguments `cypress-parallel-fast` doesn't recognize are passed straight through to `cypress run`. So `--browser chrome`, `--record`, `--env foo=bar` — they all just work.

### Examples

**Basic — 4 workers, default spec pattern**
```bash
npx cypress-parallel-fast --threads 4
```

**Chrome headless with a custom spec pattern**
```bash
npx cypress-parallel-fast --threads 4 --browser chrome --spec "cypress/e2e/**/*.cy.ts"
```

**Dry run — see what would execute without running it**
```bash
npx cypress-parallel-fast --threads 4 --dry-run
```

**Greedy scheduling — run slowest files first so workers stay busy**
```bash
npx cypress-parallel-fast --threads 4 --greedy
```

**Historical timing cache — learn from previous runs**
```bash
npx cypress-parallel-fast --threads 4 --greedy --weights ./weights.json
```

**Shard across CI machines — machine 2 of 4**
```bash
npx cypress-parallel-fast --shard 2/4 --threads 4
```

**Isolate video files per worker**
```bash
npx cypress-parallel-fast --threads 4 --isolate-videos
```

**Merge JUnit reports from all workers**
```bash
npx cypress-parallel-fast --threads 4 --merge-junit ./junit-results.xml
```

**Live resource dashboard**
```bash
npx cypress-parallel-fast --threads 4 --show-resources
```

**Write per-worker logs to a directory**
```bash
npx cypress-parallel-fast --threads 4 --log-dir ./logs
```

**Disable log writing explicitly**
```bash
npx cypress-parallel-fast --threads 4 --log-dir=false
```

## Options

| Flag | Description | Default |
|------|-------------|---------|
| `-t, --threads <n>` | Number of parallel worker slots | CPU count |
| `--spec <pattern>` | Spec glob or file path | `**/*.{cy,spec}.{js,ts}` |
| `--greedy` | Run heaviest (slowest estimated) files first | round-robin |
| `--weights <path>` | Path to historical timing cache for scheduling | `./weights.json` |
| `--shard <N/M>` | Run only this machine's portion across CI | — |
| `--isolate-videos` | Write each worker's videos to separate folders | — |
| `--merge-junit <path>` | Merge per-worker JUnit XMLs into one file | — |
| `--show-resources` | Show live memory stats in the progress bar | — |
| `--dry-run` | Print Cypress commands, don't execute | — |
| `-v, --verbose` | Echo worker stdout/stderr to the terminal | — |
| `--log-dir <path>` | Directory for per-worker log files | off |

Everything else is forwarded to Cypress automatically.

## How it works

1. **Parse** — We walk your spec files with Babel and collect every `it('...')` / `test('...')` / `specify('...')` whose title is a plain string. We also estimate how long each test will take by counting heavy commands (`cy.visit`, `cy.wait`, etc.) in the AST, including commands inside locally-defined helper functions.
2. **Queue** — Tests are grouped back into their original files (because Cypress needs `--spec` + `--env grep=...` to target specific tests). The queue is ordered round-robin by default, or greedily by estimated duration if you pass `--greedy`.
3. **Pull** — Each worker slot continuously grabs the next task from the shared queue, runs it, and grabs another until nothing is left. No pre-assigned batches, no idle workers.
4. **Crash recovery** — If a worker is killed by the OS (OOM, SIGKILL), the task is automatically requeued and retried up to 2 times. Normal test failures (exit code 1) are not retried — Cypress handles that.

### Scheduling strategies

**Round-robin** (default) preserves the original file order. Good when test durations are roughly equal.

**Greedy** (`--greedy`) sorts by estimated duration (heaviest first). Slow workers grab the big tasks early; fast workers clean up the small ones at the end. The estimate comes from AST command weights by default, or from a historical timing cache if available.

**Weights cache** (`--weights`) stores actual per-file durations after each run. On subsequent runs, greedy scheduling and sharding use real timing data instead of AST guesses. The cache is a simple JSON object: `{ "/path/to/spec.ts": 1234 }`.

### Sharding (`--shard N/M`)

For CI matrix builds, `--shard` splits the test queue across machines using a duration-aware greedy bin-packing algorithm. Combined with `--weights`, shards are balanced by actual wall-clock time. Each machine still runs its subset with the same dynamic worker pool.

### Video isolation (`--isolate-videos`)

Cypress writes one video per spec file. If two workers run tests from the same file, the second worker overwrites the first's video. With `--isolate-videos`, each worker gets its own `videosFolder`, so every run is preserved.

### JUnit merging (`--merge-junit`)

When `--merge-junit <path>` is passed, the runner temporarily overrides the reporter to `junit` for each worker, writes per-task XMLs, and stitches them into a single report at the given path at the end. Any conflicting `--reporter` arguments from the user are stripped automatically.

### Resource dashboard (`--show-resources`)

With `--show-resources`, the progress bar includes live memory stats:

```
[5/20] █████░░░░░░░░░░░░░░░ 25% | running: about.spec.ts | mem 42% sys · 890MB workers · 45MB heap
```

This helps diagnose memory pressure during large parallel runs.

## Requirements

- Node.js 16+
- Cypress 10+
- Your specs must use `it('string literal title', ...)` — dynamic / template-literal titles are skipped.

## License

MIT
