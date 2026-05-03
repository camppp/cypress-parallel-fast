import * as os from 'os';
import { execSync } from 'child_process';

/** Lightweight cross-platform resource snapshot for live dashboards. */
export interface ResourceSnapshot {
  /** Percentage of total system memory currently in use (0-100). */
  sysMemPct: string;
  /** Node heap used by the runner process in megabytes. */
  heapMB: string;
  /** Combined RSS of all tracked child processes in megabytes. */
  workerMemMB: string;
  /** Number of currently tracked (active) child processes. */
  activeWorkers: number;
}

/**
 * Tracks system and per-process memory while workers are running.
 * On Unix-like systems it shells out to `ps` for per-child RSS;
 * on Windows per-child memory is approximated to zero.
 */
export class ResourceMonitor {
  private activePids = new Set<number>();

  add(pid: number) {
    if (pid != null) this.activePids.add(pid);
  }

  remove(pid: number) {
    this.activePids.delete(pid);
  }

  snapshot(): ResourceSnapshot {
    const sysTotal = os.totalmem();
    const sysUsed = sysTotal - os.freemem();
    const sysMemPct = ((sysUsed / sysTotal) * 100).toFixed(0);

    const heapMB = (process.memoryUsage().heapUsed / 1024 / 1024).toFixed(0);

    let workerMem = 0;
    const dead: number[] = [];
    for (const pid of this.activePids) {
      try {
        // macOS / Linux: RSS in kilobytes
        const rss = execSync(`ps -o rss= -p ${pid}`, {
          encoding: 'utf-8',
          timeout: 50,
        });
        workerMem += parseInt(rss.trim(), 10) * 1024;
      } catch {
        dead.push(pid);
      }
    }
    for (const pid of dead) this.activePids.delete(pid);

    const workerMemMB = (workerMem / 1024 / 1024).toFixed(0);

    return {
      sysMemPct,
      heapMB,
      workerMemMB,
      activeWorkers: this.activePids.size,
    };
  }
}
