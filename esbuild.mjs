import * as esbuild from 'esbuild';

const watch = process.argv.includes('--watch');

const extensionOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node20',
  outfile: 'dist/extension.js',
  external: ['vscode', 'node-pty'],
  sourcemap: true,
  logLevel: 'info'
};

const webviewOptions = {
  entryPoints: ['src/webview.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  outfile: 'dist/webview.js',
  sourcemap: true,
  loader: {
    '.css': 'css'
  },
  logLevel: 'info'
};

const sidebarWebviewOptions = {
  entryPoints: ['src/sidebarWebview.ts'],
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['chrome120'],
  outfile: 'dist/sidebarWebview.js',
  sourcemap: true,
  loader: {
    '.css': 'css'
  },
  logLevel: 'info'
};

if (watch) {
  const contexts = await Promise.all([
    esbuild.context(extensionOptions),
    esbuild.context(webviewOptions),
    esbuild.context(sidebarWebviewOptions)
  ]);
  await Promise.all(contexts.map((context) => context.watch()));
  console.log('Watching extension and webview bundles...');
} else {
  await Promise.all([
    esbuild.build(extensionOptions),
    esbuild.build(webviewOptions),
    esbuild.build(sidebarWebviewOptions)
  ]);
}
