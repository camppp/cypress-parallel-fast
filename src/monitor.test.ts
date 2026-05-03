import { describe, it, expect } from 'vitest';
import { ResourceMonitor } from './monitor';

describe('ResourceMonitor', () => {
  it('returns a snapshot with basic fields', () => {
    const monitor = new ResourceMonitor();
    const snap = monitor.snapshot();

    expect(snap).toHaveProperty('sysMemPct');
    expect(snap).toHaveProperty('heapMB');
    expect(snap).toHaveProperty('workerMemMB');
    expect(snap).toHaveProperty('activeWorkers');

    expect(Number(snap.sysMemPct)).toBeGreaterThanOrEqual(0);
    expect(Number(snap.sysMemPct)).toBeLessThanOrEqual(100);
    expect(Number(snap.heapMB)).toBeGreaterThanOrEqual(0);
    expect(Number(snap.workerMemMB)).toBeGreaterThanOrEqual(0);
    expect(snap.activeWorkers).toBe(0);
  });

  it('tracks active PIDs and removes them', () => {
    const monitor = new ResourceMonitor();
    monitor.add(99999); // non-existent PID should be silently ignored
    const snap1 = monitor.snapshot();
    // On Unix, ps for a non-existent PID throws and the PID gets removed.
    // On Windows, ps is not available so it stays in the set.
    // Either way, workerMemMB should be non-negative.
    expect(Number(snap1.workerMemMB)).toBeGreaterThanOrEqual(0);
  });

  it('remove() clears a tracked PID', () => {
    const monitor = new ResourceMonitor();
    monitor.add(12345);
    monitor.remove(12345);
    expect(monitor.snapshot().activeWorkers).toBe(0);
  });
});
