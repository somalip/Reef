import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const pluginDir = path.dirname(__filename);
const distDir = path.join(pluginDir, 'dist');
const watchMode = process.argv.includes('--watch');

// Ensure dist directory structure exists
fs.mkdirSync(distDir, { recursive: true });
fs.mkdirSync(path.join(distDir, 'src/popup'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'src/options'), { recursive: true });
fs.mkdirSync(path.join(distDir, '_locales/en'), { recursive: true });
fs.mkdirSync(path.join(distDir, 'icons'), { recursive: true });

// Copy static assets to dist
function copyAssets() {
  fs.copyFileSync(path.join(pluginDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
  fs.copyFileSync(path.join(pluginDir, '_locales/en/messages.json'), path.join(distDir, '_locales/en/messages.json'));
  fs.copyFileSync(path.join(pluginDir, 'src/popup/popup.html'), path.join(distDir, 'src/popup/popup.html'));
  fs.copyFileSync(path.join(pluginDir, 'src/popup/popup.css'), path.join(distDir, 'src/popup/popup.css'));
  fs.copyFileSync(path.join(pluginDir, 'src/options/options.html'), path.join(distDir, 'src/options/options.html'));
  fs.copyFileSync(path.join(pluginDir, 'src/options/options.css'), path.join(distDir, 'src/options/options.css'));

  const icons = ['icon-16.png', 'icon-32.png', 'icon-48.png', 'icon-128.png'];
  icons.forEach(icon => {
    const srcPath = path.join(pluginDir, 'icons', icon);
    if (fs.existsSync(srcPath)) {
      fs.copyFileSync(srcPath, path.join(distDir, 'icons', icon));
    }
  });

  // Copy logo for use in popup and options pages
  const logoSrc = path.join(pluginDir, 'icons', 'reef-logo.png');
  if (fs.existsSync(logoSrc)) {
    fs.copyFileSync(logoSrc, path.join(distDir, 'src/popup/reef-logo.png'));
    fs.copyFileSync(logoSrc, path.join(distDir, 'src/options/reef-logo.png'));
    fs.copyFileSync(logoSrc, path.join(distDir, 'icons', 'reef-logo.png'));
  }
}

copyAssets();

// Content script MUST be IIFE – Chrome content scripts cannot be ES modules
const contentBuildConfig = {
  entryPoints: [
    { in: path.join(pluginDir, 'src/content.ts'), out: 'content' },
  ],
  outdir: distDir,
  bundle: true,
  format: 'iife',
  target: ['es2020'],
  sourcemap: true,
  minify: false,
};

// Background, popup, and options can be ESM (background uses "type": "module")
const moduleBuildConfig = {
  entryPoints: [
    { in: path.join(pluginDir, 'src/background.ts'), out: 'background' },
    { in: path.join(pluginDir, 'src/popup/popup.ts'), out: 'src/popup/popup' },
    { in: path.join(pluginDir, 'src/options/options.ts'), out: 'src/options/options' },
  ],
  outdir: distDir,
  bundle: true,
  format: 'esm',
  target: ['es2020'],
  sourcemap: true,
  minify: false,
};

async function runBuild() {
  if (watchMode) {
    const ctx1 = await esbuild.context(contentBuildConfig);
    const ctx2 = await esbuild.context(moduleBuildConfig);
    await Promise.all([ctx1.watch(), ctx2.watch()]);
    console.log('[Reef Plugin] Watching for changes...');
  } else {
    await Promise.all([esbuild.build(contentBuildConfig), esbuild.build(moduleBuildConfig)]);
    console.log('[Reef Plugin] Build complete in plugin/dist/');

    // Copy built extension to root reef-extension-chrome folder for Chrome
    const rootTarget = path.join(process.cwd(), 'reef-extension-chrome');
    fs.rmSync(rootTarget, { recursive: true, force: true });
    fs.cpSync(distDir, rootTarget, { recursive: true });

    // Packaging Firefox & Chrome zips if zip command exists
    try {
      const distPath = path.join(pluginDir, 'dist');
      execSync(`cd "${distPath}" && zip -r ../reef-extension-chrome.zip .`, { stdio: 'ignore' });
      execSync(`cd "${distPath}" && zip -r ../reef-extension-firefox.zip .`, { stdio: 'ignore' });
      console.log('[Reef Plugin] Created extension zips and synced reef-extension-chrome folder.');
    } catch {
      console.log('[Reef Plugin] Zip utility not available; skipped creating .zip packages.');
    }
  }
}

runBuild().catch(err => {
  console.error(err);
  process.exit(1);
});
