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
const targetDir = path.join(__dirname, '..', 'dist_electron');
if (!fs.existsSync(targetDir)) {
  fs.mkdirSync(targetDir, { recursive: true });
}

const files = fs.readdirSync(localOutDir);
for (const file of files) {
  const src = path.join(localOutDir, file);
  const dest = path.join(targetDir, file);
  if (fs.statSync(src).isFile()) {
    console.log(`Copying ${file}...`);
    fs.copyFileSync(src, dest);
  }
}

console.log('\n=== Build Complete! ===');
console.log(`Installer executable located at: ${path.join(targetDir, 'AthassMediSync Setup 1.0.0.exe')}`);
