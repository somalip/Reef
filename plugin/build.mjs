import * as esbuild from 'esbuild';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const outDir = path.join(rootDir, 'reef-extension-chrome');

const watch = process.argv.includes('--watch');

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyStaticAssets() {
  const assets = [
    ['src/popup/popup.html', 'src/popup/popup.html'],
    ['src/popup/popup.css', 'src/popup/popup.css'],
    ['src/popup/reef-logo.png', 'src/popup/reef-logo.png'],
    ['src/options/options.html', 'src/options/options.html'],
    ['src/options/options.css', 'src/options/options.css'],
    ['src/options/reef-logo.png', 'src/options/reef-logo.png'],
  ];
  for (const [src, dest] of assets) {
    copyFile(path.join(__dirname, src), path.join(outDir, dest));
  }
}

async function build() {
  const common = {
    bundle: true,
    sourcemap: true,
    target: 'chrome120',
    tsconfig: path.join(__dirname, 'tsconfig.json'),
    absWorkingDir: rootDir,
  };

  await esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'src/background.ts')],
    outfile: path.join(outDir, 'background.js'),
    format: 'esm',
    platform: 'browser',
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'src/content.ts')],
    outfile: path.join(outDir, 'content.js'),
    format: 'iife',
    platform: 'browser',
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'src/popup/popup.ts')],
    outfile: path.join(outDir, 'src/popup/popup.js'),
    format: 'esm',
    platform: 'browser',
  });

  await esbuild.build({
    ...common,
    entryPoints: [path.join(__dirname, 'src/options/options.ts')],
    outfile: path.join(outDir, 'src/options/options.js'),
    format: 'esm',
    platform: 'browser',
  });

  console.log('[reef-ext] build complete');
}

if (watch) {
  const ctx = await esbuild.context({
    bundle: true,
    sourcemap: true,
    target: 'chrome120',
    tsconfig: path.join(__dirname, 'tsconfig.json'),
    absWorkingDir: rootDir,
    entryPoints: [
      path.join(__dirname, 'src/background.ts'),
      path.join(__dirname, 'src/content.ts'),
      path.join(__dirname, 'src/popup/popup.ts'),
      path.join(__dirname, 'src/options/options.ts'),
    ],
    outdir: outDir,
    platform: 'browser',
  });
  await ctx.watch();
  console.log('[reef-ext] watching...');
} else {
  build().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
