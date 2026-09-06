const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

console.log('=== Step 1: Building Vite Web Bundle ===');
execSync('npm.cmd run build', { stdio: 'inherit' });

console.log('\n=== Step 2: Packaging Electron App with electron-builder ===');
const localOutDir = path.join(os.homedir(), 'dist_electron');
const npxCmd = `npx.cmd electron-builder build --win --x64 --config.directories.output="${localOutDir.replace(/\\/g, '/')}"`;

execSync(npxCmd, { stdio: 'inherit' });

console.log('\n=== Step 3: Copying output artifacts to project dist_electron ===');
try {
  execSync('taskkill /F /IM AthassMediSync.exe /T', { stdio: 'ignore' });
} catch {}

const targetDir = path.join(__dirname, '..', 'dist_electron');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

function copyWithRetry(src, dest, maxRetries = 6, delayMs = 1200) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      fs.copyFileSync(src, dest);
      return;
    } catch (err) {
      if ((err.code === 'EBUSY' || err.code === 'EPERM') && i < maxRetries - 1) {
        console.log(`[Notice] File temporarily busy (antivirus/system lock), waiting ${delayMs / 1000}s... (attempt ${i + 1}/${maxRetries})`);
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, delayMs);
      } else {
        throw err;
      }
    }
  }
}

const files = fs.readdirSync(localOutDir);
for (const file of files) {
  const src = path.join(localOutDir, file);
  const dest = path.join(targetDir, file);
  const stat = fs.statSync(src);
  if (stat.isFile()) {
    console.log(`Copying ${file}...`);
    copyWithRetry(src, dest);
  } else if (stat.isDirectory()) {
    console.log(`Copying directory ${file}...`);
    fs.cpSync(src, dest, { recursive: true, force: true });
  }
}

console.log('\n=== Build Complete! ===');
console.log(`Installer executable located at: ${path.join(targetDir, 'AthassMediSync Setup 1.0.0.exe')}`);
