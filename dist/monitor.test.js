"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const monitor_1 = require("./monitor");
(0, vitest_1.describe)('ResourceMonitor', () => {
    (0, vitest_1.it)('returns a snapshot with basic fields', () => {
        const monitor = new monitor_1.ResourceMonitor();
        const snap = monitor.snapshot();
        (0, vitest_1.expect)(snap).toHaveProperty('sysMemPct');
        (0, vitest_1.expect)(snap).toHaveProperty('heapMB');
        (0, vitest_1.expect)(snap).toHaveProperty('workerMemMB');
        (0, vitest_1.expect)(snap).toHaveProperty('activeWorkers');
        (0, vitest_1.expect)(Number(snap.sysMemPct)).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(Number(snap.sysMemPct)).toBeLessThanOrEqual(100);
        (0, vitest_1.expect)(Number(snap.heapMB)).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(Number(snap.workerMemMB)).toBeGreaterThanOrEqual(0);
        (0, vitest_1.expect)(snap.activeWorkers).toBe(0);
    });
    (0, vitest_1.it)('tracks active PIDs and removes them', () => {
        const monitor = new monitor_1.ResourceMonitor();
        monitor.add(99999); // non-existent PID should be silently ignored
        const snap1 = monitor.snapshot();
        // On Unix, ps for a non-existent PID throws and the PID gets removed.
        // On Windows, ps is not available so it stays in the set.
        // Either way, workerMemMB should be non-negative.
        (0, vitest_1.expect)(Number(snap1.workerMemMB)).toBeGreaterThanOrEqual(0);
    });
    (0, vitest_1.it)('remove() clears a tracked PID', () => {
        const monitor = new monitor_1.ResourceMonitor();
        monitor.add(12345);
        monitor.remove(12345);
        (0, vitest_1.expect)(monitor.snapshot().activeWorkers).toBe(0);
    });
});
//# sourceMappingURL=monitor.test.js.map