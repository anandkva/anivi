/**
 * Publishes the iOS Scriptable widget with the web app.
 *
 * Setting up the widget means getting a JavaScript file onto a phone, so the
 * app serves it at /anivi-widget.js: on the iPhone you open that URL, copy,
 * and paste into Scriptable. The file in widgets/ stays the single source —
 * this only copies it in before a build.
 */

import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(webDir, '..', 'widgets', 'ios-scriptable', 'anivi-widget.js');
const target = join(webDir, 'public', 'anivi-widget.js');

if (!existsSync(source)) {
  // A build should not fail over a convenience copy.
  console.warn(`anivi: ${source} not found, skipping widget script copy`);
  process.exit(0);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);
console.log('anivi: published widgets/ios-scriptable/anivi-widget.js -> public/anivi-widget.js');
