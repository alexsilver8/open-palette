import { type KeyboardEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import type { Settings } from '../../../shared/settings';
import type { SettingsState } from '../../../shared/settings-ipc';
import type { BuiltinIconName, Tint } from '../../../shared/types';
import { ItemIcon } from '../components/ItemIcon';
import { Keycaps } from '../components/Keycaps';
import { PaletteMark } from '../components/PaletteMark';
import { acceleratorFromKeyPress, acceleratorKeys, heldModifiers } from './accelerator';

const api = window.settings;
const { platform } = api;
const REVEAL = platform === 'darwin' ? 'Show in Finder' : platform === 'win32' ? 'Show in Explorer' : 'Show Folder';
const HISTORY_SIZES = [50, 100, 200, 500, 1000, 5000];

type SectionId = 'general' | 'clipboard' | 'notes' | 'extensions' | 'about';

const SECTIONS: Array<{ id: SectionId; label: string; icon: BuiltinIconName; tint: Tint }> = [
  { id: 'general', label: 'General', icon: 'settings', tint: 'gray' },
  { id: 'clipboard', label: 'Clipboard', icon: 'clipboard', tint: 'orange' },
  { id: 'notes', label: 'Notes', icon: 'note', tint: 'yellow' },
  { id: 'extensions', label: 'Extensions', icon: 'extension', tint: 'purple' },
  { id: 'about', label: 'About', icon: 'sparkles', tint: 'pink' },
];

// ── Controls ────────────────────────────────────────────────

function Row({ label, description, children }: { label: string; description?: ReactNode; children: ReactNode }) {
  return (
    <div className="row-setting">
      <div className="row-setting__text">
        <span className="row-setting__label">{label}</span>
        {description && <span className="row-setting__description">{description}</span>}
      </div>
      <div className="row-setting__control">{children}</div>
    </div>
  );
}

function Toggle({
  label,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange(checked: boolean): void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      className="toggle"
      disabled={disabled}
      onClick={() => onChange(!checked)}
    >
      <span className="toggle__thumb" />
    </button>
  );
}

function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<{ value: T; label: string }>;
  onChange(value: T): void;
}) {
  return (
    <fieldset className="segmented">
      <legend className="visually-hidden">{label}</legend>
      {options.map((option) => (
        <label key={option.value} className="segmented__option" data-checked={option.value === value || undefined}>
          <input
            type="radio"
            name={label}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
          />
          {option.label}
        </label>
      ))}
    </fieldset>
  );
}

function Button({
  children,
  onClick,
  tone,
  disabled,
}: {
  children: ReactNode;
  onClick(): void;
  tone?: 'destructive';
  disabled?: boolean;
}) {
  return (
    <button type="button" className="button" data-tone={tone} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}

/** A button that asks "are you sure" by changing its own label, instead of a dialog. */
function ConfirmButton({
  children,
  confirm,
  disabled,
  onConfirm,
}: {
  children: ReactNode;
  confirm: string;
  disabled?: boolean;
  onConfirm(): void;
}) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);
  return (
    <Button
      tone="destructive"
      disabled={disabled}
      onClick={() => {
        if (armed) {
          setArmed(false);
          onConfirm();
        } else setArmed(true);
      }}
    >
      {armed ? confirm : children}
    </Button>
  );
}

function HotkeyRecorder({ value, active }: { value: string; active?: string }) {
  const [recording, setRecording] = useState(false);
  const [held, setHeld] = useState<string[]>([]);
  const [error, setError] = useState<string>();

  const stop = useCallback(() => {
    setRecording(false);
    setHeld([]);
    api.pauseHotkey(false);
  }, []);

  const start = () => {
    setError(undefined);
    setRecording(true);
    api.pauseHotkey(true);
  };

  const onKeyDown = async (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!recording) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.key === 'Escape' && !event.metaKey && !event.ctrlKey && !event.altKey && !event.shiftKey) {
      stop();
      return;
    }
    const result = acceleratorFromKeyPress(event, platform);
    if (result.kind === 'pending') {
      setHeld(result.modifiers);
    } else if (result.kind === 'invalid') {
      setError(result.reason);
    } else {
      setRecording(false);
      setHeld([]);
      const { error: problem } = await api.setHotkey(result.accelerator);
      setError(problem);
    }
  };

  const notWorking = !recording && active !== value;
  return (
    <div className="hotkey">
      <button
        type="button"
        className="hotkey__field"
        data-recording={recording || undefined}
        onClick={() => (recording ? stop() : start())}
        onKeyDown={onKeyDown}
        onKeyUp={(event) => {
          if (recording) setHeld(heldModifiers(event, platform));
        }}
        onBlur={() => recording && stop()}
        aria-label={recording ? 'Press the new shortcut, or Escape to cancel' : `Shortcut: ${value}. Click to change`}
      >
        {recording ? (
          held.length > 0 ? (
            <Keycaps keys={acceleratorKeys(held.join('+'), platform)} />
          ) : (
            <span className="hotkey__prompt">Press a shortcut…</span>
          )
        ) : (
          <Keycaps keys={acceleratorKeys(value, platform)} />
        )}
      </button>
      {error && <span className="hotkey__message">{error}</span>}
      {!error && notWorking && (
        <span className="hotkey__message">
          {active
            ? `Couldn’t register this one, so ${active} is in use.`
            : 'This shortcut isn’t working. Pick another.'}
        </span>
      )}
    </div>
  );
}

function PathRow({ path }: { path: string }) {
  return (
    <span className="path" title={path}>
      {path}
    </span>
  );
}

// ── Sections ────────────────────────────────────────────────

interface SectionProps {
  state: SettingsState;
  update(patch: Partial<Settings>): void;
  setState(state: SettingsState): void;
}

function General({ state, update }: SectionProps) {
  const { settings, info } = state;
  return (
    <>
      <Row label="Open Palette shortcut" description="Press it anywhere to open the launcher.">
        <HotkeyRecorder value={settings.hotkey} active={state.activeHotkey} />
      </Row>
      <Row label="Close when you click elsewhere" description="Hide the launcher as soon as it loses focus.">
        <Toggle
          label="Close when you click elsewhere"
          checked={settings.hideOnBlur}
          onChange={(hideOnBlur) => update({ hideOnBlur })}
        />
      </Row>
      <Row
        label="Open at login"
        description={info.canLaunchAtLogin ? 'Start Open Palette when you log in.' : 'Not available on Linux yet.'}
      >
        <Toggle
          label="Open at login"
          checked={settings.launchAtLogin}
          disabled={!info.canLaunchAtLogin}
          onChange={(launchAtLogin) => update({ launchAtLogin })}
        />
      </Row>
      <Row label="Appearance">
        <Segmented
          label="Appearance"
          value={settings.theme}
          options={[
            { value: 'system', label: 'System' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ]}
          onChange={(theme) => update({ theme })}
        />
      </Row>
    </>
  );
}

function Clipboard({ state, update, setState }: SectionProps) {
  const { clipboardHistory } = state.settings;
  const sizes = HISTORY_SIZES.includes(clipboardHistory.maxItems)
    ? HISTORY_SIZES
    : [...HISTORY_SIZES, clipboardHistory.maxItems].sort((a, b) => a - b);
  const entries = state.info.clipboardEntries;
  return (
    <>
      <Row
        label="Save clipboard history"
        description="Keep text you copy so you can find it again. Anything a password manager marks as private is skipped."
      >
        <Toggle
          label="Save clipboard history"
          checked={clipboardHistory.enabled}
          onChange={(enabled) => update({ clipboardHistory: { ...clipboardHistory, enabled } })}
        />
      </Row>
      <Row label="Keep" description="Older entries are removed once the history is full.">
        <select
          className="select"
          aria-label="Entries to keep"
          value={clipboardHistory.maxItems}
          onChange={(event) =>
            update({ clipboardHistory: { ...clipboardHistory, maxItems: Number(event.target.value) } })
          }
        >
          {sizes.map((size) => (
            <option key={size} value={size}>
              {size.toLocaleString()} entries
            </option>
          ))}
        </select>
      </Row>
      <Row
        label="Saved entries"
        description={entries === 0 ? 'Nothing saved.' : `${entries.toLocaleString()} saved on this computer.`}
      >
        <ConfirmButton
          confirm="Click again to clear"
          disabled={entries === 0}
          onConfirm={async () => setState(await api.clearClipboard())}
        >
          Clear History
        </ConfirmButton>
      </Row>
    </>
  );
}

function Notes({ state, update }: SectionProps) {
  const custom = state.settings.notesDirectory !== '';
  const choose = async () => {
    const folder = await api.chooseFolder('Choose a folder for your notes');
    if (folder) update({ notesDirectory: folder });
  };
  return (
    <>
      <p className="section__intro">
        Each note is a Markdown file in this folder, and there’s no limit on how many you keep. Pick a synced folder
        (iCloud Drive, Dropbox, a git repo) to have them everywhere. Markdown files already in the folder show up as
        notes too.
      </p>
      <Row label="Notes folder" description={<PathRow path={state.info.notesDirectory} />}>
        <div className="button-row">
          <Button onClick={() => api.open('notesDirectory')}>{REVEAL}</Button>
          <Button onClick={() => void choose()}>Change…</Button>
        </div>
      </Row>
      {custom && (
        <Row label="Use the default folder" description="Notes already in your folder stay where they are.">
          <Button onClick={() => update({ notesDirectory: '' })}>Use Default</Button>
        </Row>
      )}
    </>
  );
}

function Extensions({ state, update, setState }: SectionProps) {
  const folders = state.settings.extensionDirectories;
  const user = state.extensions.filter((e) => e.source === 'user');
  const builtin = state.extensions.filter((e) => e.source === 'builtin');
  const [reloading, setReloading] = useState(false);

  const addFolder = async () => {
    const folder = await api.chooseFolder('Choose an extension folder');
    if (folder && !folders.includes(folder)) update({ extensionDirectories: [...folders, folder] });
  };
  const reload = async () => {
    setReloading(true);
    try {
      setState(await api.reloadExtensions());
    } finally {
      setReloading(false);
    }
  };

  return (
    <>
      <p className="section__intro">
        Extensions add commands to the launcher. They run in a separate process with full access to your computer, so
        only install ones you trust.{' '}
        <button type="button" className="link" onClick={() => api.openLink('extensionDocs')}>
          Write your own
        </button>
      </p>
      <div className="button-row button-row--start">
        <Button onClick={() => api.open('extensionsDirectory')}>Open Extensions Folder</Button>
        <Button onClick={() => void reload()} disabled={reloading}>
          {reloading ? 'Reloading…' : 'Reload Extensions'}
        </Button>
      </div>

      <h2 className="section__subheading">Installed</h2>
      {user.length === 0 ? (
        <p className="section__empty">
          No extensions yet. Put an extension’s folder in the extensions folder, then reload.
        </p>
      ) : (
        <ul className="extension-list">
          {user.map((extension) => (
            <li
              key={`${extension.name}:${extension.dir}`}
              className="extension"
              data-failed={extension.error ? '' : undefined}
            >
              <span className="extension__title">{extension.title}</span>
              <span className="extension__meta">
                {extension.error ??
                  `${extension.commands} command${extension.commands === 1 ? '' : 's'}, from ${extension.dir}`}
              </span>
            </li>
          ))}
        </ul>
      )}

      <h2 className="section__subheading">Also load extensions from</h2>
      {folders.length === 0 ? (
        <p className="section__empty">
          Only the extensions folder. Add a folder to work on an extension in its own repo.
        </p>
      ) : (
        <ul className="folder-list">
          {folders.map((folder) => (
            <li key={folder} className="folder">
              <PathRow path={folder} />
              <Button onClick={() => update({ extensionDirectories: folders.filter((f) => f !== folder) })}>
                Remove
              </Button>
            </li>
          ))}
        </ul>
      )}
      <div className="button-row button-row--start">
        <Button onClick={() => void addFolder()}>Add Folder…</Button>
      </div>

      <h2 className="section__subheading">Built in</h2>
      <ul className="extension-list">
        {builtin.map((extension) => (
          <li key={extension.name} className="extension">
            <span className="extension__title">{extension.title}</span>
            <span className="extension__meta">
              {extension.commands} command{extension.commands === 1 ? '' : 's'}
            </span>
          </li>
        ))}
      </ul>
    </>
  );
}

function About({ state }: SectionProps) {
  const { info } = state;
  return (
    <>
      <div className="about">
        <PaletteMark size={56} />
        <div>
          <p className="about__name">Open Palette</p>
          <p className="about__version">
            Version {info.version}, on Electron {info.electron} and Node.js {info.node}
          </p>
        </div>
      </div>
      <div className="button-row button-row--start">
        <Button onClick={() => api.openLink('repository')}>View on GitHub</Button>
        <Button onClick={() => api.openLink('issues')}>Report an Issue</Button>
      </div>
      <h2 className="section__subheading">Your data</h2>
      <Row label="Data folder" description={<PathRow path={info.dataDirectory} />}>
        <Button onClick={() => api.open('dataDirectory')}>{REVEAL}</Button>
      </Row>
      <Row
        label="Settings file"
        description="Everything on these pages, as JSON. Changes you save there apply right away."
      >
        <Button onClick={() => api.open('settingsFile')}>Edit settings.json</Button>
      </Row>
    </>
  );
}

const SECTION_VIEWS: Record<SectionId, (props: SectionProps) => ReactNode> = {
  general: General,
  clipboard: Clipboard,
  notes: Notes,
  extensions: Extensions,
  about: About,
};

// ── Window ──────────────────────────────────────────────────

export function SettingsApp() {
  const [state, setState] = useState<SettingsState | null>(null);
  const [section, setSection] = useState<SectionId>('general');

  useEffect(() => {
    const load = () => void api.get().then(setState);
    load();
    const off = api.onChanged(load);
    // Clipboard counts and extension lists change while the window sits in the background.
    window.addEventListener('focus', load);
    return () => {
      off();
      window.removeEventListener('focus', load);
    };
  }, []);

  const update = useCallback((patch: Partial<Settings>) => {
    void api.update(patch).then(setState);
  }, []);

  const onNavKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const index = SECTIONS.findIndex((s) => s.id === section);
    const next = SECTIONS[Math.min(SECTIONS.length - 1, Math.max(0, index + (event.key === 'ArrowDown' ? 1 : -1)))];
    if (next) {
      setSection(next.id);
      document.getElementById(`nav-${next.id}`)?.focus();
    }
  };

  const current = SECTIONS.find((s) => s.id === section) ?? SECTIONS[0];
  const View = SECTION_VIEWS[section];

  return (
    <div className="settings">
      <header className="settings__titlebar">Settings</header>
      <nav className="settings__nav" aria-label="Settings sections" onKeyDown={onNavKeyDown}>
        {SECTIONS.map((item) => (
          <button
            key={item.id}
            id={`nav-${item.id}`}
            type="button"
            className="settings__nav-item"
            data-tint={item.tint}
            aria-current={item.id === section ? 'page' : undefined}
            onClick={() => setSection(item.id)}
          >
            <ItemIcon icon={{ builtin: item.icon, tint: item.tint }} />
            {item.label}
          </button>
        ))}
      </nav>
      <main className="settings__content">
        <h1 className="settings__heading">{current?.label}</h1>
        {state ? <View state={state} update={update} setState={setState} /> : null}
      </main>
    </div>
  );
}
