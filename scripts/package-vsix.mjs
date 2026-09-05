import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const platformNames = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'win32'
};
const architectureNames = {
  arm64: 'arm64',
  x64: 'x64'
};
const platform = platformNames[process.platform];
const architecture = architectureNames[os.arch()];
if (!platform || !architecture) {
  throw new Error(`Unsupported VSIX build host: ${process.platform}-${os.arch()}`);
}

const manifest = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
const target = `${platform}-${architecture}`;
const executable = path.resolve(
  `node_modules/.bin/vsce${process.platform === 'win32' ? '.cmd' : ''}`
);
const result = spawnSync(
  executable,
  [
    'package',
    '--target',
    target,
    '--out',
    `terminal-folder-${manifest.version}-${target}.vsix`
  ],
  { stdio: 'inherit' }
);

if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
