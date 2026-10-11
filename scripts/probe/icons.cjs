// Temporary: compares ways of getting an app's icon on macOS. One notice per image (24 px).
const { execFileSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const { app, nativeImage } = require('electron');
const apps = ['/System/Applications/Calculator.app', '/System/Applications/App Store.app', '/Applications/Safari.app'];
const say = (kind, title, text) => console.log(`::${kind} title=${title}::${text}`);
app.whenReady().then(async () => {
  say('warning', 'macOS', `${process.getSystemVersion()} electron ${process.versions.electron}`);
  for (const path of apps) {
    const name = path.split('/').pop().replace('.app', '');
    try {
      const started = Date.now();
      const thumb = await nativeImage.createThumbnailFromPath(path, { width: 32, height: 32 });
      say('notice', `QL ${name}`, thumb.resize({ width: 24, height: 24 }).toPNG().toString('base64'));
      say('warning', `QL size ${name}`, `${JSON.stringify(thumb.getSize())} ${Date.now() - started}ms`);
    } catch (error) {
      say('warning', `QL ${name}`, error.message);
    }
    try {
      const started = Date.now();
      const out = `/tmp/${name.replace(/ /g, '_')}.png`;
      execFileSync('osascript', ['-l', 'JavaScript', `${__dirname}/nsworkspace-icon.js`, path, out, '24']);
      say('notice', `NSW ${name}`, readFileSync(out).toString('base64'));
      say('warning', `NSW time ${name}`, `${Date.now() - started}ms`);
    } catch (error) {
      say('warning', `NSW ${name}`, String(error.message).slice(0, 300));
    }
  }
  app.quit();
});
