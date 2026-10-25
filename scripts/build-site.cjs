const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

function buildSite(destination = path.join(root, '_site')) {
  fs.mkdirSync(destination, { recursive: true });
  for (const file of [
    'index.html',
    'app.js',
    'text-format.js',
    'pdf-sheet.js',
    'style.css',
    'icon.svg',
    '.nojekyll',
  ]) {
    fs.copyFileSync(path.join(root, file), path.join(destination, file));
  }
  fs.cpSync(path.join(root, 'assets'), path.join(destination, 'assets'), {
    recursive: true,
  });
}

module.exports = { buildSite };
if (require.main === module) buildSite();
