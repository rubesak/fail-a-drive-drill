// Builds dist/ from src/ with no dependencies:
//   dist/fail-a-drive.mjs   ES module
//   dist/fail-a-drive.js    classic script: sets window.FailADrive and mounts [data-fail-a-drive] on load
//   dist/fail-a-drive.css   styles
//   dist/fail-a-drive.d.ts  TypeScript types
// With --check, nothing is written; the command fails if dist/ does not match src/.
import { readFile, writeFile, mkdir } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (path) => readFile(new URL(path, root), 'utf8');
const check = process.argv.includes('--check');

const src = await read('src/fail-a-drive.mjs');
const css = await read('src/fail-a-drive.css');
const dts = await read('src/fail-a-drive.d.ts');
const { version } = JSON.parse(await read('package.json'));

const banner = `/*! fail-a-drive v${version} | MIT License */\n`;
const stripBanner = (text) => text.replace(/^\/\*![\s\S]*?\*\/\n/, '');
const body = stripBanner(src);
if (!/^export /m.test(body)) throw new Error('src/fail-a-drive.mjs has no exports');

const classic = `${banner}(function () {
  'use strict';
${body.replace(/^export (const|function) /gm, '$1 ')}
  window.FailADrive = { mount, autoInit, defaults, strings };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => autoInit());
  else autoInit();
})();
`;

const outputs = {
  'dist/fail-a-drive.mjs': banner + body,
  'dist/fail-a-drive.js': classic,
  'dist/fail-a-drive.css': banner + stripBanner(css),
  'dist/fail-a-drive.d.ts': dts,
};

if (check) {
  const stale = [];
  for (const [path, text] of Object.entries(outputs)) {
    const current = await read(path).catch(() => null);
    if (current !== text) stale.push(path);
  }
  if (stale.length) {
    console.error(`dist/ is out of date, run "npm run build": ${stale.join(', ')}`);
    process.exit(1);
  }
  console.log('dist/ is up to date');
} else {
  await mkdir(new URL('dist/', root), { recursive: true });
  for (const [path, text] of Object.entries(outputs)) await writeFile(new URL(path, root), text);
  console.log(`built dist/ for v${version}`);
}
