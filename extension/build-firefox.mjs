/**
 * Build the Firefox package of Rem Companion.
 *
 * Chrome and Firefox disagree on two manifest keys:
 *  - Chrome MV3 uses background.service_worker; Firefox uses background.scripts.
 *  - declarativeNetRequestWithHostAccess is a Chrome-only permission alias.
 *
 * Everything else (DNR rules, content script, bridge) is shared.
 *
 * Usage: node build-firefox.mjs
 * Output: dist/rem-companion-firefox-<version>.xpi
 */

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(fileURLToPath(import.meta.url));
const sourceManifest = JSON.parse(await readFile(path.join(root, 'manifest.json'), 'utf8'));

const outDir = path.join(root, 'dist', 'firefox');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const manifest = {
  ...sourceManifest,
  background: {
    scripts: ['background.js'],
  },
  permissions: sourceManifest.permissions.filter(
    (permission) => permission !== 'declarativeNetRequestWithHostAccess'
  ),
  browser_specific_settings: {
    ...(sourceManifest.browser_specific_settings ?? {}),
    gecko: {
      ...(sourceManifest.browser_specific_settings?.gecko ?? {}),
      id: 'companion@rem-mocha.vercel.app',
      strict_min_version: '140.0',
      data_collection_permissions: {
        required: ['none'],
      },
    },
    gecko_android: {
      strict_min_version: '142.0',
    },
  },
};

await writeFile(path.join(outDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);
await cp(path.join(root, 'background.js'), path.join(outDir, 'background.js'));
await cp(path.join(root, 'content.js'), path.join(outDir, 'content.js'));

const zip = path.join(root, 'dist', `rem-companion-firefox-${manifest.version}.zip`);
const xpi = path.join(root, 'dist', `rem-companion-firefox-${manifest.version}.xpi`);
await rm(zip, { force: true });
await rm(xpi, { force: true });

// Compress-Archive puts the selected files at the archive root, which is what
// Firefox expects in an XPI (manifest.json must be at the top level). It only
// accepts .zip, so rename the result afterwards.
execFileSync(
  'powershell.exe',
  [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Compress-Archive -Path '${outDir}\\*' -DestinationPath '${zip}' -Force; Move-Item -LiteralPath '${zip}' -Destination '${xpi}' -Force`,
  ],
  { stdio: 'inherit' }
);

console.log(`Firefox manifest: ${path.join(outDir, 'manifest.json')}`);
console.log(`Firefox package:  ${xpi}`);
