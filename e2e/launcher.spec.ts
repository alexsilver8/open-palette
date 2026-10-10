import { mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { type ElectronApplication, _electron as electron, expect, type Page, test } from '@playwright/test';

const mod = process.platform === 'darwin' ? 'Meta' : 'Control';

let app: ElectronApplication;
let page: Page;
let userData: string;

/** Text of every note file, so tests can check what really landed on disk. */
function savedNotes(): string[] {
  const dir = join(userData, 'notes');
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => readFileSync(join(dir, name), 'utf8'));
}

test.beforeEach(async () => {
  userData = mkdtempSync(join(tmpdir(), 'open-palette-e2e-'));
  if (test.info().title.includes('no cap')) {
    mkdirSync(join(userData, 'notes'));
    for (let i = 1; i <= 12; i++) writeFileSync(join(userData, 'notes', `note-${i}.md`), `Note number ${i}`);
  }
  writeFileSync(
    join(userData, 'settings.json'),
    JSON.stringify({ hideOnBlur: false, clipboardHistory: { enabled: false } }),
  );
  app = await electron.launch({
    // Launch the project folder (package.json "main" points at the build) so the app path
    // is the repo root and the example extensions get loaded.
    args: [join(import.meta.dirname, '..'), '--show', ...(process.platform === 'linux' ? ['--no-sandbox'] : [])],
    env: { ...process.env, OPEN_PALETTE_USER_DATA: userData },
  });
  page = await app.firstWindow();
  await expect(page.getByRole('combobox')).toBeFocused();
  // Root items arrive asynchronously; wait for them before typing.
  await expect(page.getByRole('option').first()).toBeVisible();
});

test.afterEach(async () => {
  await app.close();
});

test('lists commands at the root', async () => {
  await expect(page.getByRole('option', { name: /Clipboard History/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Search Google/ })).toBeVisible();
});

test('calculates inline', async () => {
  await page.keyboard.type('12 * (3 + 4)');
  await expect(page.locator('.calc__result')).toHaveText('84');
});

test('opens a command and goes back', async () => {
  await page.keyboard.type('clipboard hist');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search__crumb')).toHaveText('Clipboard History');
  await expect(page.getByText('Clipboard history is turned off in settings.')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.search__crumb')).toHaveCount(0);
  await expect(page.getByRole('combobox')).toHaveValue('clipboard hist');
});

test('runs an extension command in the extension host', async () => {
  await page.keyboard.type('generate uuid');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search__crumb')).toHaveText('Generate UUID');
  const rows = page.getByRole('option');
  await expect(rows).toHaveCount(5);
  await expect(rows.first()).toHaveText(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-/);
});

test('shows the actions of the selected item', async () => {
  await page.keyboard.type('quit');
  await page.keyboard.press(`${mod}+k`);
  const panel = page.getByRole('dialog', { name: /Actions for Quit Open Palette/ });
  await expect(panel).toBeVisible();
  await expect(panel.getByRole('option')).toHaveText([/^Run Command/]);
  await page.keyboard.press('Escape');
  await expect(panel).toHaveCount(0);
});

test('acts on what was typed even when ↵ comes before a self-filtering list catches up', async () => {
  await page.keyboard.type('to-dos');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search__crumb')).toHaveText('To-dos');
  await page.keyboard.type('buy oat milk');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('option', { name: /buy oat milk/ })).toBeVisible();
  await expect(page.getByRole('combobox')).toHaveValue('');
});

test('creates a note and saves it as a Markdown file', async () => {
  await page.keyboard.type('create note');
  const [notes] = await Promise.all([app.waitForEvent('window'), page.keyboard.press('Enter')]);
  const editor = notes.getByRole('textbox', { name: 'Note', exact: true });
  await expect(editor).toBeFocused();
  await editor.pressSequentially('Groceries\n- oat milk');
  await expect(notes.locator('.notes__item[aria-current]')).toContainText('Groceries');
  await expect.poll(savedNotes).toEqual(['Groceries\n- oat milk']);
});

test('turns launcher text into a note with the Create Note fallback', async () => {
  await page.keyboard.type('remember to call the bank');
  const createNote = page.getByRole('option', { name: /Create Note/ }).last();
  const [notes] = await Promise.all([app.waitForEvent('window'), createNote.click()]);
  await expect(notes.getByRole('textbox', { name: 'Note', exact: true })).toHaveValue('remember to call the bank\n');
  expect(savedNotes()).toEqual(['remember to call the bank\n']);
});

test('lists every note, with no cap', async () => {
  await page.keyboard.type('search notes');
  await page.keyboard.press('Enter');
  await expect(page.locator('.search__crumb')).toHaveText('Notes');
  await expect(page.locator('.results__heading')).toHaveText('12 notes');
  await expect(page.getByRole('option')).toHaveCount(12);
  await page.keyboard.type('number 7');
  await expect(page.getByRole('option')).toHaveCount(1);
});

test('changes settings in the Settings window', async () => {
  const settingsFile = () => JSON.parse(readFileSync(join(userData, 'settings.json'), 'utf8'));
  await page.keyboard.type('open settings');
  const [settings] = await Promise.all([app.waitForEvent('window'), page.keyboard.press('Enter')]);
  await expect(settings.getByRole('heading', { name: 'General' })).toBeVisible();

  await settings.getByText('Dark', { exact: true }).click();
  await expect.poll(() => settingsFile().theme).toBe('dark');

  await settings.getByRole('button', { name: /^Shortcut:/ }).click();
  await expect(settings.getByText('Press a shortcut…')).toBeVisible();
  await settings.keyboard.press('Control+Shift+K');
  await expect.poll(() => settingsFile().hotkey).toBe('Control+Shift+K');

  await settings.getByRole('button', { name: 'Clipboard' }).click();
  await settings.getByRole('switch', { name: 'Save clipboard history' }).click();
  await settings.getByLabel('Entries to keep').selectOption('500');
  await expect.poll(() => settingsFile().clipboardHistory).toEqual({ enabled: true, maxItems: 500 });
});
