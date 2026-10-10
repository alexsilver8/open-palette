/**
 * The extension host: runs in an Electron utility process, imports third-party extensions
 * and calls their commands on behalf of the main process. Keeping them here means a slow
 * or crashing extension can't take the launcher down with it.
 */
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import type { Extension, ExtensionContext } from '../shared/extension-api';
import type { CommandCall, HostExtension, HostRequest, HostResponse, LoadReport } from '../shared/extension-protocol';
import type { CommandImplementation } from '../shared/types';
import { createStorage } from './storage';

interface LoadedExtension {
  info: HostExtension;
  commands: Extension['commands'];
}

const extensions = new Map<string, LoadedExtension>();

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function load(list: HostExtension[]): Promise<LoadReport> {
  extensions.clear();
  const report: LoadReport = { loaded: [], failed: [] };
  for (const info of list) {
    try {
      const module = (await import(pathToFileURL(info.entry).href)) as {
        default?: Partial<Extension>;
        commands?: unknown;
      };
      const commands = module.default?.commands ?? module.commands;
      if (typeof commands !== 'object' || commands === null) {
        throw new Error('The entry module must export `commands`, or a default export with `commands`.');
      }
      extensions.set(info.name, { info, commands: commands as Extension['commands'] });
      report.loaded.push(info.name);
    } catch (error) {
      report.failed.push({ name: info.name, error: errorMessage(error) });
    }
  }
  return report;
}

function resolve(call: CommandCall): { command: CommandImplementation<ExtensionContext>; ctx: ExtensionContext } {
  const extension = extensions.get(call.extension);
  if (!extension) throw new Error(`Extension "${call.extension}" is not loaded.`);
  const command = extension.commands[call.command];
  if (!command) throw new Error(`Extension "${call.extension}" does not implement the command "${call.command}".`);
  const { info } = extension;
  mkdirSync(info.supportPath, { recursive: true });
  const ctx: ExtensionContext = {
    ...call.ctx,
    supportPath: info.supportPath,
    storage: createStorage(info.supportPath),
    extension: { name: info.name, path: info.dir },
  };
  return { command, ctx };
}

async function handle(request: HostRequest): Promise<unknown> {
  switch (request.method) {
    case 'load':
      return load((request as HostRequest<'load'>).params.extensions);
    case 'view': {
      const { command, ctx } = resolve((request as HostRequest<'view'>).params);
      if (!command.view) throw new Error('This command has no view() function.');
      return command.view(ctx);
    }
    case 'run': {
      const { command, ctx } = resolve((request as HostRequest<'run'>).params);
      if (!command.run) throw new Error('This command has no run() function.');
      return command.run(ctx);
    }
    case 'action': {
      const params = (request as HostRequest<'action'>).params;
      const { command, ctx } = resolve(params);
      if (!command.onAction) throw new Error('This command has no onAction() function.');
      return command.onAction(params.actionId, params.payload, ctx);
    }
    default:
      throw new Error(`Unknown method "${String((request as HostRequest).method)}".`);
  }
}

process.parentPort.on('message', async (event) => {
  const request = event.data as HostRequest;
  let response: HostResponse;
  try {
    const result = await handle(request);
    // Round-trip through JSON so functions or class instances never reach the main process.
    response = {
      id: request.id,
      ok: true,
      result: result === undefined ? undefined : JSON.parse(JSON.stringify(result)),
    };
  } catch (error) {
    response = { id: request.id, ok: false, error: errorMessage(error) };
  }
  process.parentPort.postMessage(response);
});

process.on('unhandledRejection', (reason) => {
  console.error('[extension-host] Unhandled rejection:', reason);
});
