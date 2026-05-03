export interface TestCase {
    title: string;
    file: string;
    line: number;
    modifier?: 'only' | 'skip' | 'none';
    /** Rough per-test duration estimate (ms) derived from command frequency. */
    estimatedDurationMs?: number;
}
export interface ParsedFile {
    file: string;
    tests: TestCase[];
    /** Frequency map of detected heavy commands (e.g. cy.visit, page.goto). */
    commandCounts?: Record<string, number>;
    /** Sum of all command weights in this file. */
    totalCommandWeight?: number;
}
export interface FileResult {
    file: string;
    success: boolean;
    stdout: string;
    stderr: string;
    durationMs: number;
    attempts: number;
}
export interface RunResult {
    workerId: number;
    success: boolean;
    /** Null when process was killed by signal (crash/OOM). */
    exitCode: number | null;
    /** Signal name if process was killed (e.g. 'SIGKILL', 'SIGTERM'). */
    signal: string | null;
    /** True when the process crashed (killed by signal, not a normal exit). */
    crashed: boolean;
    stdout: string;
    stderr: string;
    durationMs: number;
    filesRun: string[];
    /** Per-file outcomes reported by the worker. */
    fileResults?: FileResult[];
}
export interface TaskQueueItem {
    file: string;
    tests: TestCase[];
    estimatedDurationMs: number;
}
export interface CLIOptions {
    threads: number;
    greedy: boolean;
    dryRun: boolean;
    verbose: boolean;
    spec?: string;
    logDir?: string;
    /** Path to a weights.json cache file (default: ./weights.json) */
    weights?: string;
    /** Per-worker videosFolder to avoid overwriting between slots */
    isolateVideos?: boolean;
    /** Path to write the merged JUnit XML report */
    mergeJunit?: string;
    /** Shard spec like "2/4" — run only this machine's portion of the tests */
    shard?: string;
    /** Show a live resource dashboard (system + worker memory) alongside progress. */
    showResources?: boolean;
}
//# sourceMappingURL=types.d.ts.map