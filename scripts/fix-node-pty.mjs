import { chmod, stat } from 'node:fs/promises';
import os from 'node:os';

if (process.platform !== 'win32') {
  const helper = new URL(
    `../node_modules/node-pty/prebuilds/${process.platform}-${os.arch()}/spawn-helper`,
    import.meta.url
  );
  try {
    const current = await stat(helper);
    await chmod(helper, current.mode | 0o111);
  } catch {
    // Linux source builds place their executable helper elsewhere and already set its mode.
  }
}
