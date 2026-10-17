import { type ChildProcess, spawn } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, _electron as electron, expect, type Page, test } from '@playwright/test';

// The extensions that ship with Waypoint, driven through the launcher.

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let app: ElectronApplication;
let page: Page;

test.beforeEach(async () => {
  const userData = mkdtempSync(join(tmpdir(), 'waypoint-ext-'));
  // Copy rather than paste, so the tests never type into whatever app is in front.
  writeFileSync(join(userData, 'settings.json'), JSON.stringify({ hideOnBlur: false, pasteIntoApps: false }));
  app = await electron.launch({
    args: [join(import.meta.dirname, '..'), '--show', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, WAYPOINT_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await expect(page.getByRole('combobox')).toBeFocused();
  await expect(page.getByRole('option').first()).toBeVisible();
});

test.afterEach(async () => {
  await app.close();
});

async function open(command: string) {
  await page.keyboard.type(command);
  await expect(page.getByRole('option').first()).toContainText(command, { ignoreCase: true });
  await page.keyboard.press('Enter');
  await expect(page.locator('.search__crumb')).toBeVisible();
}

const clipboardText = () => app.evaluate(({ clipboard }) => clipboard.readText());
const launcherVisible = () => app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.isVisible());

test('stops the program listening on a port', async () => {
  // A stand-in for a forgotten dev server, in a process of its own.
  const server: ChildProcess = spawn(
    process.execPath,
    [
      '-e',
      "require('net').createServer().listen(0, '127.0.0.1', function () { process.stdout.write(String(this.address().port)) })",
    ],
    { stdio: ['ignore', 'pipe', 'inherit'] },
  );
  const exited = new Promise<void>((resolve) => server.once('exit', () => resolve()));
  try {
    const port = await new Promise<string>((resolve) =>
      server.stdout?.once('data', (data) => resolve(String(data).trim())),
    );

    await open('Open Ports');
    await page.keyboard.type(port);
    const row = page.getByRole('option', { name: `Port ${port}` });
    await expect(row).toBeVisible();
    await expect(page.getByRole('complementary')).toContainText('This computer only');

    await page.keyboard.press('Enter');
    await exited;
    await expect(page.locator('.toast')).toHaveText(new RegExp(`Stopped .+ on port ${port}`));
    await expect(row).toHaveCount(0);
  } finally {
    server.kill();
  }
});

test('copies a gitmoji when pasting into apps is turned off', async () => {
  await open('Search Gitmoji');
  await page.keyboard.type('bug');
  await expect(page.getByRole('option').first()).toContainText('Fix a bug');
  await page.keyboard.press('Enter');
  // ↵ pastes; with pasting turned off it copies and closes the launcher.
  await expect.poll(launcherVisible).toBe(false);
  expect(await clipboardText()).toBe('🐛');
});

test('copies a gitmoji code', async () => {
  await open('Search Gitmoji');
  await page.keyboard.type('sparkles');
  await expect(page.getByRole('option').first()).toContainText(':sparkles:');
  await page.keyboard.press(`${mod}+Shift+c`);
  await expect.poll(clipboardText).toBe(':sparkles:');
});

test('finds emoji and uses the chosen skin tone', async () => {
  await open('Search Emoji');
  await expect(page.locator('.results__heading').first()).toHaveText('Smileys & Emotion');

  await page.keyboard.press(`${mod}+Shift+t`);
  await page.getByRole('option', { name: /^Medium$/ }).click();
  await expect(page.locator('.toast')).toHaveText('Skin tone: Medium');

  await page.keyboard.type('waving hand');
  const wave = page.getByRole('option').first();
  await expect(wave).toContainText('Waving hand');
  await expect(wave.locator('.icon')).toHaveText('👋🏽');
  await page.keyboard.press(`${mod}+k`);
  await page
    .getByRole('dialog')
    .getByRole('option', { name: /Copy Emoji/ })
    .click();
  await expect.poll(clipboardText).toBe('👋🏽');
});

test('shows a whole emoji category', async () => {
  await open('Search Emoji');
  // Long lists only draw what's in view, so scroll down to it like a person would.
  const more = page.getByRole('option', { name: /All \d+ in Food & Drink/ });
  await page.locator('.content__list').hover();
  for (let i = 0; i < 40 && (await more.count()) === 0; i++) await page.mouse.wheel(0, 300);
  await more.click();
  await expect(page.locator('.results__heading')).toHaveText(['Food & Drink']);
  await expect(page.getByRole('option', { name: /Pizza/ })).toBeAttached();
});

test('writes a conventional commit message from a type', async () => {
  await open('Write Commit Message');
  await expect(page.getByRole('option').first()).toContainText('feat');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox')).toHaveValue('feat: ');
  await expect(page.getByRole('complementary')).toContainText('Describe the change after the colon');

  await page.keyboard.type('add emoji search');
  await expect(page.getByRole('option').first()).toContainText('feat: add emoji search');
  await expect(page.getByRole('complementary')).toContainText('Looks good');
  await page.keyboard.press('Enter');
  await expect.poll(clipboardText).toBe('feat: add emoji search');
});

test('suggests a type for a description typed in the launcher', async () => {
  await page.keyboard.type('fix the crash on start');
  await page.getByRole('option', { name: /Write Commit Message/ }).click();
  await expect(page.getByRole('option').first()).toContainText('fix: fix the crash on start');
  await expect(page.getByRole('option').first()).toContainText('Patch release');
});

test('shows this computer’s details in System Info and copies one', async () => {
  await open('system info');
  await expect(page.locator('.results__heading')).toContainText(['Hardware', 'Network', 'System']);
  await expect(page.getByRole('option', { name: /^CPU/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /^Memory/ })).toContainText(/of .* used/);
  await expect(page.getByRole('option', { name: /^Disk/ })).toContainText(/free of/);
  await page.keyboard.type('memory');
  await page.keyboard.press('Enter');
  await expect.poll(clipboardText).toMatch(/B of .*B used/);
});
