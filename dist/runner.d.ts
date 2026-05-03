import { RunResult, TaskQueueItem } from './types';
export declare const cypressCommand: (file: string, titles: string[], cypressArgs: string[], extras?: {
    configOverrides?: string[];
    reporterArgs?: string[];
}) => string;
export declare function runWorkers(queue: TaskQueueItem[], cypressArgs: string[], options: {
    verbose: boolean;
    dryRun: boolean;
    concurrency?: number;
    logDir?: string;
    /** Per-worker videosFolder to avoid clobbering between slots. */
    isolateVideos?: boolean;
    /** If set, each worker writes a JUnit XML here and we merge into this path at the end. */
    junitPath?: string;
    /** Show live system + worker memory stats in the progress bar. */
    showResources?: boolean;
}): Promise<RunResult[]>;
//# sourceMappingURL=runner.d.ts.map