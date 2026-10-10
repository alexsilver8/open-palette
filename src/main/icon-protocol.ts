import { extname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, net, protocol } from 'electron';
import { fileIconSize, IconCache } from './icon-cache';

/** `palette-icon://icon?path=/Applications/Safari.app` serves the icon for that file. */
export const ICON_SCHEME = 'palette-icon';

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico']);

const osIcons = new IconCache(async (path) => {
  const icon = await app.getFileIcon(path, { size: fileIconSize(process.platform) });
  if (icon.isEmpty()) throw new Error(`No icon for ${path}`);
  return new Uint8Array(icon.toPNG());
});

/** Must run before the app is ready. */
export function registerIconScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: ICON_SCHEME, privileges: { standard: true, secure: true, supportFetchAPI: true } },
  ]);
}

/** Image files are served as they are; for anything else the OS file icon is used. */
export function handleIconProtocol(): void {
  protocol.handle(ICON_SCHEME, async (request) => {
    const path = new URL(request.url).searchParams.get('path');
    if (!path) return new Response(null, { status: 400 });
    try {
      if (IMAGE_EXTENSIONS.has(extname(path).toLowerCase())) {
        const response = await net.fetch(pathToFileURL(path).toString());
        return new Response(response.body, {
          status: response.status,
          headers: {
            'content-type': response.headers.get('content-type') ?? 'application/octet-stream',
            'cache-control': 'max-age=3600',
          },
        });
      }
      return new Response(await osIcons.get(path), {
        headers: { 'content-type': 'image/png', 'cache-control': 'max-age=3600' },
      });
    } catch {
      return new Response(null, { status: 404 });
    }
  });
}
