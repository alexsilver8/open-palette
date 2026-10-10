/** Messages between the main process and the extension host process. */
import type { CommandContext, Json } from './types';

export interface HostExtension {
  name: string;
  /** Absolute path of the module to import. */
  entry: string;
  /** The extension's folder. */
  dir: string;
  /** Writable folder for the extension's own data. */
  supportPath: string;
}

export interface CommandCall {
  extension: string;
  command: string;
  ctx: CommandContext;
}

export interface HostMethods {
  load: { params: { extensions: HostExtension[] }; result: LoadReport };
  view: { params: CommandCall; result: unknown };
  run: { params: CommandCall; result: unknown };
  action: { params: CommandCall & { actionId: string; payload?: Json }; result: unknown };
}

export type HostMethod = keyof HostMethods;

export interface HostRequest<M extends HostMethod = HostMethod> {
  id: number;
  method: M;
  params: HostMethods[M]['params'];
}

export type HostResponse = { id: number; ok: true; result: unknown } | { id: number; ok: false; error: string };

export interface LoadReport {
  loaded: string[];
  failed: Array<{ name: string; error: string }>;
}
