// Refresh the locally served browser bundles after updating these npm packages.
const { copyFileSync, mkdirSync } = require('node:fs');
const { join } = require('node:path');

const root = join(__dirname, '..');
const destination = join(root, 'assets', 'vendor');
mkdirSync(destination, { recursive: true });

for (const [source, target] of [
  ['pdf-lib/dist/pdf-lib.min.js', 'pdf-lib.min.js'],
  ['pdf-lib/LICENSE.md', 'pdf-lib.LICENSE.md'],
  ['@pdf-lib/fontkit/dist/fontkit.umd.min.js', 'fontkit.min.js'],
]) {
  copyFileSync(join(root, 'node_modules', source), join(destination, target));
}
