// Temporary: Quick Look icons for apps, with symlinks resolved first.
const { realpathSync } = require('node:fs');
const { app, nativeImage } = require('electron');
const apps = ['/Applications/Safari.app', '/System/Applications/Utilities/Terminal.app', '/System/Applications/Utilities/Activity Monitor.app', '/Applications/Xcode.app'];
const say = (kind, title, text) => console.log(`::${kind} title=${title}::${text}`);
app.whenReady().then(async () => {
  say('warning', 'macOS', `${process.getSystemVersion()}`);
  for (const path of apps) {
    const name = path.split('/').pop().replace('.app', '');
    try {
      const real = realpathSync(path);
      const thumb = await nativeImage.createThumbnailFromPath(real, { width: 32, height: 32 });
      say('notice', `QL ${name}`, thumb.resize({ width: 24, height: 24 }).toPNG().toString('base64'));
      say('warning', `real ${name}`, real);
    } catch (error) {
      say('warning', `QL ${name}`, error.message);
    }
  }
  app.quit();
});
