// Reads this system's details for real. Off by default; the platform workflow runs it on
// macOS, Windows and Linux with WAYPOINT_SMOKE=1.
import { describe, expect, it } from 'vitest';
import extension from './index.js';

const enabled = process.env.WAYPOINT_SMOKE === '1';

describe.runIf(enabled)(`System Info on ${process.platform}`, () => {
  it('lists CPU, memory, disk, addresses and the system', { timeout: 30_000 }, async () => {
    const view = await extension.commands.info?.view?.(/** @type {any} */ ({ query: '', platform: process.platform }));
    const items = view?.sections.flatMap((section) => section.items) ?? [];
    for (const item of items) console.log(`${item.title}: ${item.subtitle} ${item.accessory ?? ''}`);
    const titles = items.map((item) => item.title);
    expect(titles).toEqual(expect.arrayContaining(['CPU', 'Memory', 'Disk', 'Public IP', 'System', 'Uptime']));
    expect(items.find((item) => item.id === 'os')?.subtitle).toMatch(/macOS|Windows|Ubuntu|Linux/);
  });
});
