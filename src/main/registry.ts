import { EventEmitter } from 'node:events';
import { join } from 'node:path';
import type { HostExtension } from '../shared/extension-protocol';
import type {
  Action,
  ActionContext,
  ActionResult,
  CommandContext,
  CommandImplementation,
  CommandManifest,
  CommandRef,
  ExtensionManifest,
  Platform,
  RootItem,
  View,
} from '../shared/types';
import { ActionError, performSystemAction } from './actions';
import type { AppIndex } from './apps/app-index';
import type { BuiltinExtension } from './commands/types';
import { discoverExtensions } from './extensions/discovery';
import type { ExtensionHostClient } from './extensions/host-client';
import { sanitizeActionResult, sanitizeView } from './extensions/validate';
import type { UsageTracker } from './usage';

export interface ExtensionInfo {
  manifest?: ExtensionManifest;
  source: 'builtin' | 'user';
  /** Folder of a user extension. */
  dir?: string;
  /** Why a user extension failed to load. */
  error?: string;
}

interface RegisteredExtension {
  manifest: ExtensionManifest;
  source: 'builtin' | 'user';
  dir?: string;
  /** Only for built-ins; user extensions run in the extension host. */
  commands?: Record<string, CommandImplementation>;
}

export interface RegistryOptions {
  platform: Platform;
  builtins: BuiltinExtension[];
  host: ExtensionHostClient;
  apps: AppIndex;
  usage: UsageTracker;
  /** Folders to load user extensions from. */
  extensionRoots: () => string[];
  /** Where extensions get their own writable folder. */
  supportRoot: string;
  /** More things the root search finds, like notes and clipboard entries. */
  rootSources?: Array<() => RootItem[] | Promise<RootItem[]>>;
}

const REVEAL_LABEL: Record<Platform, string> = {
  darwin: 'Show in Finder',
  win32: 'Show in File Explorer',
  linux: 'Show in Folder',
};

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Knows every command (built-in and from extensions) and every application, builds the
 * root search list, and routes actions to whoever handles them.
 */
export class CommandRegistry extends EventEmitter<{ change: [] }> {
  private readonly extensions = new Map<string, RegisteredExtension>();
  private failures: ExtensionInfo[] = [];
  private reloading: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: RegistryOptions) {
    super();
    for (const builtin of options.builtins) {
      this.extensions.set(builtin.manifest.name, {
        manifest: builtin.manifest,
        source: 'builtin',
        commands: builtin.commands,
      });
    }
    options.apps.on('change', () => this.emit('change'));
  }

  /**
   * (Re)discovers user extensions and loads them into a fresh extension host. Calls are
   * queued, so reloads triggered close together never interleave.
   */
  loadUserExtensions(): Promise<{ loaded: number; failed: number }> {
    const run = this.reloading.then(() => this.reloadNow());
    this.reloading = run.catch(() => undefined);
    return run;
  }

  private async reloadNow(): Promise<{ loaded: number; failed: number }> {
    const builtinNames = new Set(
      [...this.extensions.values()].filter((e) => e.source === 'builtin').map((e) => e.manifest.name),
    );
    const failures: ExtensionInfo[] = [];
    const toLoad: Array<{ host: HostExtension; manifest: ExtensionManifest }> = [];

    for (const found of discoverExtensions(this.options.extensionRoots())) {
      if (!found.parsed) {
        failures.push({ source: 'user', dir: found.dir, error: found.error });
        continue;
      }
      const { manifest, entry } = found.parsed;
      if (builtinNames.has(manifest.name) || toLoad.some((e) => e.manifest.name === manifest.name)) {
        failures.push({
          manifest,
          source: 'user',
          dir: found.dir,
          error: `Another extension is already called "${manifest.name}".`,
        });
        continue;
      }
      toLoad.push({
        manifest,
        host: {
          name: manifest.name,
          entry,
          dir: found.dir,
          supportPath: join(this.options.supportRoot, manifest.name),
        },
      });
    }

    const report = await this.options.host.load(toLoad.map((e) => e.host)).catch((error: unknown) => ({
      loaded: [] as string[],
      failed: toLoad.map((e) => ({ name: e.manifest.name, error: errorMessage(error) })),
    }));

    // Swap the new set in all at once.
    for (const [name, extension] of this.extensions) {
      if (extension.source === 'user') this.extensions.delete(name);
    }
    for (const { manifest, host } of toLoad) {
      const failure = report.failed.find((f) => f.name === manifest.name);
      if (failure) failures.push({ manifest, source: 'user', dir: host.dir, error: failure.error });
      else this.extensions.set(manifest.name, { manifest, source: 'user', dir: host.dir });
    }
    this.failures = failures;
    for (const failure of failures) {
      console.warn(`[extensions] ${failure.manifest?.name ?? failure.dir}: ${failure.error}`);
    }
    this.emit('change');
    return { loaded: report.loaded.length, failed: failures.length };
  }

  listExtensions(): ExtensionInfo[] {
    const loaded = [...this.extensions.values()].map(({ manifest, source, dir }) => ({ manifest, source, dir }));
    return [...loaded, ...this.failures];
  }

  /** Commands, apps and whatever the root sources add. A failing source is left out, not fatal. */
  async getRootItems(): Promise<RootItem[]> {
    const extra = await Promise.all(
      (this.options.rootSources ?? []).map(async (source) => {
        try {
          return await source();
        } catch (error) {
          console.error('[root search] A source failed:', error);
          return [];
        }
      }),
    );
    return [...this.commandAndAppItems(), ...extra.flat()];
  }

  private commandAndAppItems(): RootItem[] {
    const { platform, usage, apps } = this.options;
    const items: RootItem[] = [];

    for (const extension of this.extensions.values()) {
      for (const command of extension.manifest.commands) {
        if (command.platforms && !command.platforms.includes(platform)) continue;
        const ref = { extension: extension.manifest.name, command: command.name };
        const id = `command:${ref.extension}/${ref.command}`;
        const item: RootItem = {
          id,
          kind: 'command',
          title: command.title,
          subtitle: command.subtitle ?? extension.manifest.title,
          accessory: 'Command',
          frecency: usage.score(id),
          actions: [{ type: 'open-command', ref, title: command.mode === 'view' ? 'Open Command' : 'Run Command' }],
        };
        const icon = command.icon ?? extension.manifest.icon;
        if (icon) item.icon = icon;
        if (command.keywords) item.keywords = command.keywords;
        if (command.fallback) item.fallback = ref;
        items.push(item);
      }
    }

    for (const app of apps.list()) {
      const id = `app:${app.path}`;
      const item: RootItem = {
        id,
        kind: 'application',
        title: app.name,
        icon: { path: app.iconPath ?? app.path },
        accessory: 'Application',
        frecency: usage.score(id),
        actions: [
          { type: 'open-path', path: app.path, title: 'Open Application' },
          { type: 'reveal-path', path: app.path, title: REVEAL_LABEL[platform] },
          { type: 'copy', text: app.path, title: 'Copy Path' },
        ],
      };
      if (app.keywords) item.keywords = app.keywords;
      items.push(item);
    }
    return items;
  }

  /** Performs an action from the launcher. Failures come back as a toast, never as a throw. */
  async runAction(action: Action, context: ActionContext): Promise<ActionResult> {
    if (context.rootItemId) this.options.usage.record(context.rootItemId);
    const ctx: CommandContext = { query: context.query ?? '', platform: this.options.platform };
    try {
      switch (action.type) {
        case 'open-command':
          return await this.openCommand(action.ref, { ...ctx, query: '', argument: action.argument });
        case 'callback': {
          if (!context.ref) throw new ActionError('This action does not belong to a command.');
          const result = await this.invoke(context.ref, 'action', ctx, action.id, action.payload);
          return (result as ActionResult | undefined) ?? {};
        }
        default:
          return await performSystemAction(action);
      }
    } catch (error) {
      console.error('[actions]', error);
      return { toast: errorMessage(error), toastStyle: 'failure' };
    }
  }

  /** Renders a `filtering: false` view again for a new query. */
  async searchView(ref: CommandRef, query: string): Promise<View> {
    return (await this.invoke(ref, 'view', { query, platform: this.options.platform })) as View;
  }

  private async openCommand(ref: CommandRef, ctx: CommandContext): Promise<ActionResult> {
    const { command } = this.lookup(ref);
    if (command.mode === 'view') {
      return { push: (await this.invoke(ref, 'view', ctx)) as View };
    }
    const result = (await this.invoke(ref, 'run', ctx)) as ActionResult | undefined;
    return result ?? { hide: true };
  }

  private lookup(ref: CommandRef): { extension: RegisteredExtension; command: CommandManifest } {
    const extension = this.extensions.get(ref.extension);
    const command = extension?.manifest.commands.find((c) => c.name === ref.command);
    if (!extension || !command) throw new ActionError(`Unknown command ${ref.extension}/${ref.command}.`);
    return { extension, command };
  }

  /**
   * Calls a command method in-process for built-ins or through the extension host, and
   * validates what comes back from third-party code.
   */
  private async invoke(
    ref: CommandRef,
    method: 'view' | 'run' | 'action',
    ctx: CommandContext,
    actionId?: string,
    payload?: unknown,
  ): Promise<View | ActionResult | undefined> {
    const { extension } = this.lookup(ref);

    if (extension.commands) {
      const implementation = extension.commands[ref.command];
      if (!implementation) throw new ActionError(`${ref.extension}/${ref.command} is not implemented.`);
      if (method === 'view') {
        if (!implementation.view) throw new ActionError('This command has no view.');
        return implementation.view(ctx);
      }
      if (method === 'run') return (await implementation.run?.(ctx)) ?? undefined;
      return (await implementation.onAction?.(actionId ?? '', payload as never, ctx)) ?? undefined;
    }

    const call = { extension: ref.extension, command: ref.command, ctx };
    const raw =
      method === 'action'
        ? await this.options.host.call('action', { ...call, actionId: actionId ?? '', payload: payload as never })
        : await this.options.host.call(method, call);
    return method === 'view' ? sanitizeView(raw, extension.dir) : sanitizeActionResult(raw, extension.dir);
  }
}
