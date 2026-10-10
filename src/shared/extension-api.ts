/**
 * Types for extension authors. An extension is a folder with a package.json (see
 * docs/extensions.md) whose entry module exports its commands:
 *
 *   export default {
 *     commands: {
 *       greet: { view: (ctx) => ({ type: 'list', items: [...] }) },
 *     },
 *   };
 *
 * Extensions run in a separate Node.js process (Electron's utility process), so a slow or
 * crashing extension can't freeze the launcher. They have full Node.js access — only
 * install extensions you trust.
 */
import type { CommandContext, CommandImplementation, Json } from './types';

export type * from './types';

/** A small persistent key-value store, private to each extension. */
export interface ExtensionStorage {
  get<T extends Json = Json>(key: string): T | undefined;
  set(key: string, value: Json): void;
  remove(key: string): void;
}

export interface ExtensionContext extends CommandContext {
  /** A folder this extension may write to; it survives updates and restarts. */
  supportPath: string;
  storage: ExtensionStorage;
  extension: { name: string; path: string };
}

export interface Extension {
  /** Keyed by the command names declared in package.json. */
  commands: Record<string, CommandImplementation<ExtensionContext>>;
}
