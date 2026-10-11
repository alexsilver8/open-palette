// Temporary: compares app.getFileIcon with nativeImage.createThumbnailFromPath on real apps.
const { createHash } = require('node:crypto');
const { app, nativeImage } = require('electron');
const apps = [
  '/System/Applications/Calculator.app',
  '/System/Applications/App Store.app',
  '/Applications/Safari.app',
  '/System/Applications/Utilities/Activity Monitor.app',
  '/Applications/Xcode.app',
];
const hash = (buffer) => createHash('sha1').update(buffer).digest('hex').slice(0, 10);
app.whenReady().then(async () => {
  for (const path of apps) {
    const name = path.split('/').pop();
    try {
      const fileIcon = await app.getFileIcon(path, { size: 'normal' });
      const png = fileIcon.toPNG();
      console.log(`::notice title=getFileIcon ${name}::${hash(png)} ${JSON.stringify(fileIcon.getSize())}`);
      if (name === 'Calculator.app') console.log(`::notice title=PNG getFileIcon ${name}::${png.toString('base64')}`);
    } catch (error) {
      console.log(`::warning title=getFileIcon ${name}::${error.message}`);
    }
    try {
      const started = Date.now();
      const thumb = await nativeImage.createThumbnailFromPath(path, { width: 48, height: 48 });
      const png = thumb.resize({ width: 48 }).toPNG();
      console.log(`::notice title=thumbnail ${name}::${hash(thumb.toPNG())} ${JSON.stringify(thumb.getSize())} ${Date.now() - started}ms`);
      if (name === 'Calculator.app' || name === 'Safari.app') console.log(`::notice title=PNG thumbnail ${name}::${png.toString('base64')}`);
    } catch (error) {
      console.log(`::warning title=thumbnail ${name}::${error.message}`);
    }
  }
  console.log(`::notice title=macOS::${process.getSystemVersion()} electron ${process.versions.electron}`);
  app.quit();
});
