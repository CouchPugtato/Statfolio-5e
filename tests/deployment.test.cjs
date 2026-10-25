const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { buildSite } = require('../scripts/build-site.cjs');

test('published site includes every local entry asset and working text/PDF helpers', () => {
  const destination = fs.mkdtempSync(path.join(os.tmpdir(), 'statfolio-site-'));
  try {
    buildSite(destination);
    const html = fs.readFileSync(path.join(destination, 'index.html'), 'utf8');
    for (const match of html.matchAll(/(?:src|href)="\.\/([^"?#]+)[^"]*"/g)) {
      assert.ok(
        fs.statSync(path.join(destination, match[1])).isFile(),
        `Missing published asset: ${match[1]}`,
      );
    }
    const context = vm.createContext({ window: {} });
    for (const file of ['text-format.js', 'pdf-sheet.js']) {
      vm.runInContext(fs.readFileSync(path.join(destination, file), 'utf8'), context);
    }
    assert.equal(context.window.StatfolioText.html('**Ready**'), '<strong>Ready</strong>');
    assert.equal(typeof context.window.StatfolioPDF.create, 'function');
    assert.ok(fs.existsSync(path.join(destination, '.nojekyll')));
  } finally {
    fs.rmSync(destination, { recursive: true, force: true });
  }
});
