const fs = require('fs-extra');
const path = require('path');

async function copyAssets() {
  const rootDir = path.join(__dirname, '..');
  const standaloneDir = path.join(rootDir, '.next', 'standalone');

  const publicDir = path.join(rootDir, 'public');
  const targetPublicDir = path.join(standaloneDir, 'public');

  const staticDir = path.join(rootDir, '.next', 'static');
  const targetStaticDir = path.join(standaloneDir, '.next', 'static');

  if (fs.existsSync(publicDir)) {
    console.log('Copying public folder to standalone...');
    await fs.copy(publicDir, targetPublicDir);
  }

  if (fs.existsSync(staticDir)) {
    console.log('Copying .next/static folder to standalone...');
    await fs.copy(staticDir, targetStaticDir);
  }

  console.log('Standalone assets copied successfully!');
}

copyAssets().catch(console.error);
