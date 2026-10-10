import { EventEmitter } from 'node:events';
import type { Platform } from '../../shared/types';
import { type AppEntry, scanApplications } from './scan';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000;

/** Keeps the list of installed applications, rescanning now and then. */
export class AppIndex extends EventEmitter<{ change: [] }> {
  private apps: AppEntry[] = [];
  private timer: NodeJS.Timeout | undefined;
  private scanning: Promise<void> | undefined;

  constructor(private readonly platform: Platform) {
    super();
  }

  list(): readonly AppEntry[] {
    return this.apps;
  }

  refresh(): Promise<void> {
    this.scanning ??= scanApplications(this.platform)
      .then((apps) => {
        const changed = JSON.stringify(apps) !== JSON.stringify(this.apps);
        this.apps = apps;
        if (changed) this.emit('change');
      })
      .catch((error: unknown) => console.error('[apps] Scan failed:', error))
      .finally(() => {
        this.scanning = undefined;
      });
    return this.scanning;
  }

  startAutoRefresh(): void {
    this.timer ??= setInterval(() => void this.refresh(), REFRESH_INTERVAL_MS);
  }

  stop(): void {
    clearInterval(this.timer);
    this.timer = undefined;
  }
}
