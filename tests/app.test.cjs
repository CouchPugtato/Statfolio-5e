const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const source = fs.readFileSync('app.js', 'utf8');
const pdfSource = fs.readFileSync('pdf-sheet.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const image = 'data:image/png;base64,iVBORw0KGgo=';
const settle = () => new Promise((resolve) => setTimeout(resolve, 25));

test('level-up drafts can navigate, import and remove spells, and cancel without saving', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Draft Review');
    a.api.use(c);
    const before = JSON.stringify(c);
    const revision = a.api.revision;
    a.w.fetch = async () => ({
      ok: true,
      json: async () =>
        JSON.parse(fs.readFileSync('assets/reference/spells.json', 'utf8')),
    });
    a.click('[data-action="level-up"]');
    a.input('[data-level-up="dieSides"]', 12);
    assert.equal(a.$('[data-level-up="hitDice"]').value, '1d8 + 1d12');
    a.input('[data-level-up="dieResult"]', 9);
    await a.submit();
    a.click('[data-action="level-up-reference"]');
    await settle();
    a.input('#level-up-spell-search', 'Fireball');
    assert.equal(a.$('#level-up-reference-select').options.length, 2);
    a.input('#level-up-reference-select', 'fireball');
    a.click('[data-action="level-up-add-reference"]');
    assert.match(a.$('.level-up-spells').textContent, /Fireball/);
    a.click('[data-action="level-up-remove-spell"]');
    assert.match(a.$('.level-up-spells').textContent, /No spells/);
    a.click('[data-action="level-up-back"]');
    assert.equal(a.$('[data-level-up="dieResult"]').value, '9');
    await a.submit();
    await a.submit();
    a.input('[data-level-up="features"]', 'A new feature');
    await a.submit();
    assert.match(a.$('#level-up-stage').textContent, /A new feature/);
    assert.equal(JSON.stringify(c), before);
    a.click('#modal [data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    assert.equal(a.api.revision, revision);
  } finally {
    a.close();
  }
});

test('level-up applies HP, retroactive Constitution, hit dice, proficiency, spells and features together and persists', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Level Five');
    Object.assign(c, {
      level: 4,
      maxHp: 30,
      hp: 15,
      hitDice: '4d8',
      hitDiceLeft: 2,
      image,
      features: 'Old feature',
    });
    c.abilities[2] = 14;
    c.slots[0] = 4;
    c.usedSlots[0] = 1;
    a.api.use(c);
    const history = a.api.state.backupHistory.changesSinceExport;
    a.click('[data-action="level-up"]');
    a.input('[data-level-up-ability="2"]', 16);
    assert.match(a.$('#level-up-hp-preview').textContent, /30\s*→\s*42/);
    await a.submit();
    a.input('[data-level-up-slot="2"]', 2);
    a.click('[data-action="level-up-custom-spell"]');
    a.input('[data-level-up-spell="0"][data-key="name"]', 'New Magic');
    a.input('[data-level-up-spell="0"][data-key="level"]', 3);
    a.input('[data-level-up-spell="0"][data-key="prepared"]', true);
    await a.submit();
    a.input('[data-level-up="features"]', 'Old feature\nNew feature');
    await a.submit();
    assert.match(a.$('#level-up-stage').textContent, /Proficiency: \+2 → \+3/);
    await a.submit();
    assert.equal(a.$('#modal').open, false);
    assert.equal(c.level, 5);
    assert.equal(c.maxHp, 42);
    assert.equal(c.hp, 15);
    assert.equal(c.hitDice, '5d8');
    assert.equal(c.hitDiceLeft, 3);
    assert.equal(c.usedSlots[0], 1);
    assert.equal(c.slots[2], 2);
    assert.equal(c.spells[0].prepared, true);
    assert.equal(c.spells[0].name, 'New Magic');
    assert.equal(c.features, 'Old feature\nNew feature');
    assert.equal(c.image, image);
    assert.equal(a.api.state.backupHistory.changesSinceExport, history + 1);
    await a.api.persist();
    reopened = await app(a.storage);
    assert.deepEqual(
      JSON.parse(JSON.stringify(reopened.api.current)),
      JSON.parse(JSON.stringify(c)),
    );
  } finally {
    reopened?.close();
    a.close();
  }
});

test('level-up rejects invalid input and stale reviews, caps at level 20, and can raise current HP', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Validation');
    c.hp = 4;
    a.api.use(c);
    a.click('[data-action="level-up"]');
    a.input('[data-level-up="dieResult"]', 9);
    await a.submit();
    assert.equal(a.$('#level-up-stage-title').textContent, 'HP & Abilities');
    a.input('[data-level-up="dieResult"]', 5);
    a.input('[data-level-up="raiseCurrent"]', true);
    await a.submit();
    a.input('[data-level-up-slot="0"]', -1);
    await a.submit();
    assert.equal(a.$('#level-up-stage-title').textContent, 'Spells');
    a.input('[data-level-up-slot="0"]', 0);
    await a.submit();
    await a.submit();
    c.hp = 3;
    await a.submit();
    assert.equal(a.$('#modal').open, true);
    assert.match(a.$('#toast').textContent, /changed during the review/);
    assert.equal(c.level, 1);
    assert.equal(c.hp, 3);
    a.click('#modal [data-action="close-modal"]');
    a.click('[data-action="level-up"]');
    a.input('[data-level-up="raiseCurrent"]', true);
    await a.submit();
    await a.submit();
    await a.submit();
    await a.submit();
    assert.equal(c.hp, 8);
    assert.equal(c.maxHp, 15);
    c.level = 20;
    a.api.shell();
    assert.equal(a.$('[data-action="level-up"]').disabled, true);
  } finally {
    a.close();
  }
});

async function app(storage = new IDBFactory()) {
  const dom = new JSDOM(html, {
    url: 'https://example.test/Statfolio-5e/',
    runScripts: 'outside-only',
  });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.indexedDB = storage;
  w.crypto.randomUUID = randomUUID;
  w.Blob = Blob;
  w.HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  w.HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  w.HTMLAnchorElement.prototype.click = function () {};
  let download;
  w.URL.createObjectURL = (blob) => {
    download = blob;
    return 'blob:test';
  };
  w.URL.revokeObjectURL = () => {};
  w.eval(pdfSource);
  w.eval(
    source.replace(/init\(\);\s*$/, '') +
      `
    globalThis.api = { blank, prof, mod, views, validateBackup, persist, shell, changed, exportBackup, backupRecommended, renderBackupStatus,
      get state(){return state;},get revision(){return revision;},get savedRevision(){return savedRevision;},
      get failed(){return saveFailed;},get db(){return db;},setPage(p){page=p;shell();},
      use(c){state.characters.push(c);state.selected=c.id;shell();},get current(){return current();} };
    globalThis.ready = init();`,
  );
  await w.ready;
  const $ = (s) => w.document.querySelector(s);
  const click = (s) => {
    assert.ok($(s), `Missing control ${s}`);
    $(s).click();
  };
  const input = (s, value, commit = true) => {
    const el = $(s);
    assert.ok(el, `Missing input ${s}`);
    if (el.type === 'checkbox') el.checked = value;
    else el.value = String(value);
    el.dispatchEvent(new w.Event('input', { bubbles: true }));
    if (commit) el.dispatchEvent(new w.Event('change', { bubbles: true }));
  };
  async function submit(values = {}) {
    const form = $('#modal-form');
    for (const [key, value] of Object.entries(values))
      form.elements.namedItem(key).value = value;
    await form.onsubmit({ preventDefault() {}, target: form });
  }
  async function restore(characters, mode = 'merge') {
    await $('#restore-file').onchange({
      target: {
        files: [
          {
            size: 100,
            text: async () =>
              JSON.stringify({ format: 'statfolio', version: 1, characters }),
          },
        ],
        value: '',
      },
    });
    if ($('#modal-form') && $('#modal').open) await submit({ mode });
  }
  return {
    dom,
    w,
    api: w.api,
    $,
    click,
    input,
    submit,
    restore,
    storage,
    download: () => download,
    close: () => dom.window.close(),
  };
}

test('PDF export uses a fresh character snapshot and downloads without changing character or backup history', async () => {
  const a = await app();

  try {
    const character = a.api.blank('PDF / Hero');
    a.api.use(character);
    a.input('[data-field="name"]', 'Updated / Hero', false);
    const before = JSON.stringify(character);
    const changes = a.api.state.backupHistory.changesSinceExport;
    let snapshot;
    a.w.StatfolioPDF.create = async (copy, rules) => {
      snapshot = copy;
      assert.equal(rules.prof(copy), 2);
      assert.notEqual(copy, character);
      return new Uint8Array([37, 80, 68, 70]);
    };
    a.click('[data-action="menu"]');
    a.click('[data-action="export-sheet-pdf"]');
    await settle();
    assert.equal(snapshot.name, 'Updated / Hero');
    assert.equal(a.download().type, 'application/pdf');
    assert.equal(await a.download().text(), '%PDF');
    assert.equal(a.$('#modal').open, false);
    assert.equal(JSON.stringify(character), before);
    assert.equal(a.api.state.backupHistory.changesSinceExport, changes);
    assert.equal(a.$('[data-field="name"]').value, 'Updated / Hero');
  } finally {
    a.close();
  }
});

test('PDF export errors keep the character and allow retry', async () => {
  const a = await app();

  try {
    a.api.use(a.api.blank('Retry PDF'));
    a.w.StatfolioPDF.create = async () => {
      throw Error('Template could not be loaded.');
    };
    a.click('[data-action="menu"]');
    a.click('[data-action="export-sheet-pdf"]');
    await settle();
    assert.equal(a.$('#modal').open, true);
    assert.equal(a.$('[data-action="export-sheet-pdf"]').disabled, false);
    assert.match(a.$('#toast').textContent, /Template could not be loaded/);
    assert.equal(a.download(), undefined);
  } finally {
    a.close();
  }
});

test('condition tracker selects conditions, expands references, tracks exhaustion, and preserves notes', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Conditions');
    character.conditions = 'A custom curse until dawn';
    a.api.use(character);
    a.api.setPage('combat');
    assert.equal(a.$('#condition-picker').hidden, true);
    assert.equal(
      a.$('[data-field="conditions"]').value,
      'A custom curse until dawn',
    );
    a.click('[data-action="toggle-conditions"]');
    const blindedRules = a
      .$('[data-condition="Blinded"]')
      .closest('.condition-option')
      .querySelector('details');
    blindedRules.open = true;
    assert.match(blindedRules.textContent, /Sight-based ability checks/);
    a.input('[data-condition="Blinded"]', true);
    a.input('[data-condition="Poisoned"]', true);
    assert.deepEqual(Array.from(character.activeConditions), [
      'Blinded',
      'Poisoned',
    ]);
    assert.match(a.$('#active-conditions').textContent, /Blinded/);
    assert.equal(a.$('#condition-picker').hidden, false);
    a.input('[data-field="exhaustionLevel"]', 3);
    assert.equal(character.exhaustionLevel, 3);
    assert.match(a.$('#active-conditions').textContent, /Exhaustion 3/);
    assert.equal(character.speed, 30);
    assert.equal(character.maxHp, 10);

    a.input('[data-field="ac"]', 12);
    await settle();
    assert.equal(a.$('#condition-picker').hidden, false);
    assert.equal(
      a
        .$('[data-condition="Blinded"]')
        .closest('.condition-option')
        .querySelector('details').open,
      true,
    );
    a.input('[data-condition="Blinded"]', false);
    a.input('[data-field="exhaustionLevel"]', 0);
    assert.deepEqual(Array.from(character.activeConditions), ['Poisoned']);
    assert.doesNotMatch(a.$('#active-conditions').textContent, /Exhaustion/);
    await a.api.persist();

    const b = await app(a.storage);
    try {
      b.api.setPage('combat');
      assert.equal(b.$('[data-condition="Poisoned"]').checked, true);
      assert.equal(b.api.current.conditions, 'A custom curse until dawn');
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('condition plus chip opens a dismissible pop-out and active chips show hover rules', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Condition popups');
    character.activeConditions = ['Blinded'];
    character.exhaustionLevel = 2;
    a.api.use(character);
    a.api.setPage('combat');
    const plus = a.$('[data-action="toggle-conditions"]');
    assert.equal(a.$('#active-conditions').lastElementChild, plus);
    a.click('[data-action="toggle-conditions"]');
    assert.equal(a.$('#condition-picker').hidden, false);
    assert.equal(plus.getAttribute('aria-expanded'), 'true');
    a.w.document.body.click();
    assert.equal(a.$('#condition-picker').hidden, true);
    assert.equal(plus.getAttribute('aria-expanded'), 'false');
    a.click('[data-action="toggle-conditions"]');
    a.$('#condition-picker').dispatchEvent(
      new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(a.$('#condition-picker').hidden, true);
    assert.equal(a.w.document.activeElement, plus);

    const chip = a.$('[data-condition-reference="Blinded"]');
    chip.dispatchEvent(new a.w.MouseEvent('pointerover', { bubbles: true }));
    const popup = a.$('.spell-popup');
    assert.equal(popup.hidden, false);
    assert.equal(a.$('.spell-popup-title').textContent, 'Blinded');
    assert.match(a.$('.spell-popup-description').textContent, /Sight-based/);
    chip.dispatchEvent(
      new a.w.MouseEvent('pointerout', { bubbles: true, relatedTarget: popup }),
    );
    assert.equal(popup.hidden, true);
    chip.focus();
    assert.equal(popup.hidden, false);
    chip.dispatchEvent(
      new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(popup.hidden, true);
    a.$('[data-condition-reference="Exhaustion"]').focus();
    assert.equal(a.$('.spell-popup-title').textContent, 'Exhaustion 2');
    assert.match(
      a.$('.spell-popup-description').textContent,
      /Effects accumulate/,
    );
    a.click('[data-condition-reference="Blinded"]');
    assert.equal(character.activeConditions.length, 0);
    assert.equal(a.$('[data-condition-reference="Blinded"]'), null);
    assert.equal(popup.hidden, true);
    assert.equal(a.$('[data-condition="Blinded"]').checked, false);
    a.click('[data-condition-reference="Exhaustion"]');
    assert.equal(character.exhaustionLevel, 0);
    assert.equal(a.$('[data-field="exhaustionLevel"]').value, '0');
    assert.match(a.$('#active-conditions').textContent, /No active conditions/);
    await a.api.persist();
    const reopened = await app(a.storage);
    try {
      assert.equal(reopened.api.current.activeConditions.length, 0);
      assert.equal(reopened.api.current.exhaustionLevel, 0);
    } finally {
      reopened.close();
    }
  } finally {
    a.close();
  }
});

test('condition search preserves selections and survives nearby stat edits', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Condition search');
    character.activeConditions = ['Prone'];
    a.api.use(character);
    a.api.setPage('combat');
    a.click('[data-action="toggle-conditions"]');
    assert.equal(a.w.document.activeElement, a.$('#condition-search'));
    a.input('#condition-search', ' BLINDED ');
    assert.equal(
      a.w.document.querySelectorAll('.condition-option:not([hidden])').length,
      1,
    );
    assert.equal(a.$('[data-condition="Prone"]').checked, true);
    a.input('[data-condition="Blinded"]', true);
    a.input('[data-field="ac"]', 15);
    await settle();
    assert.equal(a.$('#condition-search').value, ' BLINDED ');
    assert.equal(
      a.w.document.querySelectorAll('.condition-option:not([hidden])').length,
      1,
    );
    assert.equal(a.$('[data-condition="Blinded"]').checked, true);
    a.input('#condition-search', 'nonexistent condition');
    assert.equal(a.$('#condition-search-empty').hidden, false);
    a.input('#condition-search', '');
    assert.equal(a.$('#condition-search-empty').hidden, true);
    assert.equal(
      a.w.document.querySelectorAll('.condition-option:not([hidden])').length,
      15,
    );
    assert.deepEqual(Array.from(character.activeConditions), [
      'Prone',
      'Blinded',
    ]);
  } finally {
    a.close();
  }
});

test('conditions support old backups, duplication, and restore with strict validation', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Condition backup');
    character.conditions = 'Existing condition notes';
    character.activeConditions = ['Prone'];
    character.exhaustionLevel = 2;
    a.api.use(character);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    await a.restore(backup.characters, 'replace');
    assert.deepEqual(Array.from(a.api.state.characters[0].activeConditions), [
      'Prone',
    ]);
    assert.equal(a.api.state.characters[0].exhaustionLevel, 2);
    a.click(`[data-action="duplicate"][data-id="${character.id}"]`);
    assert.deepEqual(Array.from(a.api.current.activeConditions), ['Prone']);
    a.api.current.activeConditions.push('Poisoned');
    assert.deepEqual(Array.from(a.api.state.characters[0].activeConditions), [
      'Prone',
    ]);

    for (const invalid of [
      { activeConditions: ['Unknown'] },
      { activeConditions: ['Exhaustion'] },
      { activeConditions: [2] },
      { exhaustionLevel: 7 },
      { exhaustionLevel: 1.5 },
    ]) {
      const bad = structuredClone(backup);
      Object.assign(bad.characters[0], invalid);
      assert.throws(() => a.api.validateBackup(bad), /Invalid conditions/);
    }

    delete backup.characters[0].activeConditions;
    delete backup.characters[0].exhaustionLevel;
    const legacy = a.api.validateBackup(backup)[0];
    assert.equal(legacy.activeConditions.length, 0);
    assert.equal(legacy.exhaustionLevel, 0);
    assert.equal(legacy.conditions, 'Existing condition notes');
  } finally {
    a.close();
  }
});

test('backup reminders use age and completed edits while ignoring navigation and individual keystrokes', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Backup reminders');
    a.api.use(character);
    const history = a.api.state.backupHistory;
    const now = Date.now();
    const day = 86400000;
    history.lastExportAt = new Date(now - 2 * day).toISOString();
    history.changesSinceExport = 19;
    assert.equal(a.api.backupRecommended(now), false);

    a.input('[data-field="name"]', 'One', false);
    a.input('[data-field="name"]', 'One edit', false);
    assert.equal(history.changesSinceExport, 19);
    a.$('[data-field="name"]').dispatchEvent(
      new a.w.Event('change', { bubbles: true }),
    );
    assert.equal(history.changesSinceExport, 20);
    assert.equal(a.api.backupRecommended(now), true);
    assert.ok(a.$('.backup-reminder'));
    a.click('[data-action="library"]');
    a.click(`[data-action="open"][data-id="${character.id}"]`);
    assert.equal(history.changesSinceExport, 20);

    history.lastExportAt = new Date(now).toISOString();
    assert.equal(a.api.backupRecommended(now), false);
    history.changesSinceExport = 1;
    history.lastExportAt = new Date(now - 7 * day).toISOString();
    assert.equal(a.api.backupRecommended(now), true);
    history.changesSinceExport = 0;
    assert.equal(a.api.backupRecommended(now), false);

    history.lastExportAt = null;
    history.firstChangeAt = new Date(now - 7 * day).toISOString();
    history.changesSinceExport = 1;
    assert.equal(a.api.backupRecommended(now), true);
  } finally {
    a.close();
  }
});

test('backup dismissal persists for one day and exports reset local history without changing the backup format', async () => {
  const a = await app();

  try {
    a.api.use(a.api.blank('Backup date'));
    a.api.state.backupHistory = {
      lastExportAt: new Date(Date.now() - 8 * 86400000).toISOString(),
      firstChangeAt: null,
      changesSinceExport: 2,
      dismissedUntil: 0,
    };
    a.api.shell();
    a.click('[data-action="dismiss-backup-reminder"]');
    assert.equal(a.$('.backup-reminder'), null);
    await a.api.persist();

    const b = await app(a.storage);
    try {
      assert.equal(b.$('.backup-reminder'), null);
      const history = b.api.state.backupHistory;
      assert.equal(b.api.backupRecommended(history.dismissedUntil + 1), true);
      b.w.Date.now = () => history.dismissedUntil + 1;
      b.api.renderBackupStatus();
      assert.ok(b.$('.backup-reminder'));

      await b.api.exportBackup();
      assert.equal(b.$('.backup-reminder'), null);
      assert.equal(b.api.state.backupHistory.changesSinceExport, 0);
      assert.equal(b.api.state.backupHistory.dismissedUntil, 0);
      assert.ok(b.$('#backup-status time').dateTime);
      assert.match(b.$('#backup-status > span').title, /Download generated/);
      const backup = JSON.parse(await b.download().text());
      assert.deepEqual(Object.keys(backup).sort(), [
        'characters',
        'exportedAt',
        'format',
        'version',
      ]);
      assert.equal(backup.exportedAt, b.api.state.backupHistory.lastExportAt);
      await b.api.persist();

      const reopened = await app(b.storage);
      try {
        assert.equal(
          reopened.api.state.backupHistory.lastExportAt,
          backup.exportedAt,
        );
        assert.equal(reopened.api.state.backupHistory.changesSinceExport, 0);
      } finally {
        reopened.close();
      }
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('duplicate character copies all data with independent identities and persists separately', async () => {
  const a = await app();

  try {
    const original = a.api.blank('Elowen');
    original.image = image;
    original.level = 5;
    original.abilities[1] = 18;
    original.skills = ['Stealth'];
    original.attacks = [
      { name: 'Bow', bonus: '+7', damage: '1d8', type: 'Piercing', notes: '' },
    ];
    original.resources = [{ name: 'Charges', remaining: 2, max: 3 }];
    original.spells = [
      {
        name: 'Light',
        level: 0,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: 'Glow',
        prepared: true,
      },
    ];
    original.equipment = [
      { name: 'Rope', quantity: 1, weight: 5, notes: '', equipped: true },
    ];
    original.notes = [
      {
        id: randomUUID(),
        title: 'Session',
        body: 'A clue',
        tag: 'Session',
        updated: new Date().toISOString(),
        images: [image],
      },
    ];
    original.coins.gp = 20;
    a.api.use(original);

    assert.equal(a.$('.character-actions [data-action="duplicate"]'), null);
    a.click('[data-action="library"]');
    a.click(
      `.character-card [data-action="duplicate"][data-id="${original.id}"]`,
    );
    const copy = a.api.current;
    assert.notEqual(copy.id, original.id);
    assert.equal(copy.name, 'Elowen (copy)');
    assert.notEqual(copy.notes[0].id, original.notes[0].id);
    const expected = JSON.parse(JSON.stringify(original));
    expected.id = copy.id;
    expected.name = copy.name;
    expected.updated = copy.updated;
    expected.notes[0].id = copy.notes[0].id;
    assert.deepEqual(JSON.parse(JSON.stringify(copy)), expected);

    copy.abilities[1] = 20;
    copy.attacks[0].name = 'New bow';
    copy.resources[0].remaining = 0;
    copy.spells[0].description = 'Changed';
    copy.equipment[0].quantity = 2;
    copy.notes[0].body = 'Alternate story';
    copy.notes[0].images.push(image);
    copy.coins.gp = 0;
    assert.equal(original.abilities[1], 18);
    assert.equal(original.attacks[0].name, 'Bow');
    assert.equal(original.resources[0].remaining, 2);
    assert.equal(original.spells[0].description, 'Glow');
    assert.equal(original.equipment[0].quantity, 1);
    assert.equal(original.notes[0].body, 'A clue');
    assert.equal(original.notes[0].images.length, 1);
    assert.equal(original.coins.gp, 20);

    await a.api.persist();
    const b = await app(a.storage);
    try {
      assert.equal(b.api.state.characters.length, 2);
      assert.equal(b.api.current.id, copy.id);
      assert.equal(b.api.current.notes[0].body, 'Alternate story');
      assert.equal(
        b.api.state.characters.find((character) => character.id === original.id)
          .notes[0].body,
        'A clue',
      );
      b.click('[data-action="library"]');
      b.click(
        `.character-card [data-action="duplicate"][data-id="${original.id}"]`,
      );
      assert.equal(b.api.state.characters.length, 3);
      assert.equal(b.api.current.notes[0].body, 'A clue');
      assert.equal(b.$('#modal').open, false);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('create through the UI, edit stats, save, and reopen from IndexedDB', async () => {
  const a = await app();
  try {
    a.click('[data-action="new"]');
    await a.submit({
      name: 'Elowen Ashford',
      class: 'Ranger',
      species: 'Wood elf',
    });
    a.input('[data-field="level"]', 5);
    a.input('[data-field="abilities.1"]', 18);
    await settle();
    assert.equal(a.api.current.level, 5);
    assert.equal(a.api.prof(a.api.current), 3);
    assert.match(a.$('#page-content').textContent, /\+4/);
    await a.api.persist();
    assert.equal(a.api.revision, a.api.savedRevision);
    const b = await app(a.storage);
    try {
      assert.equal(b.api.current.name, 'Elowen Ashford');
      assert.equal(b.api.current.abilities[1], 18);
      assert.match(b.$('h1').textContent, /Elowen/);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('expertise implies proficiency, bonuses update, and removing proficiency clears expertise', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Scout');
    c.level = 5;
    c.abilities[1] = 18;
    a.api.use(c);
    a.api.setPage('abilities');
    const expertiseControl = a.$('[data-expertise="Stealth"]');
    a.input('[data-expertise="Stealth"]', true);
    await settle();
    assert.equal(
      a.$('[data-expertise="Stealth"]'),
      expertiseControl,
      'Stat refresh preserves existing controls and pending clicks',
    );
    assert.ok(c.skills.includes('Stealth'));
    assert.equal(
      a.$('[data-expertise="Stealth"]').parentElement.querySelector('strong')
        .textContent,
      '+10',
    );
    a.input('[data-skill="Stealth"]', false);
    await settle();
    assert.ok(!c.expertise.includes('Stealth'));
    assert.equal(
      a.$('[data-skill="Stealth"]').parentElement.querySelector('strong')
        .textContent,
      '+4',
    );
  } finally {
    a.close();
  }
});

test('currency spending breaks larger coins, combines smaller coins, and saves gains', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Treasurer');
    c.coins = { cp: 0, sp: 2, ep: 0, gp: 2, pp: 0 };
    a.api.use(c);
    a.api.setPage('equipment');
    a.input('#currency-unit', 'sp');
    a.input('#currency-amount', '5');
    a.click('[data-action="spend"]');
    assert.deepEqual({ ...c.coins }, { cp: 0, sp: 2, ep: 1, gp: 1, pp: 0 });
    assert.equal(a.$('#currency-unit').value, 'sp');
    assert.equal(a.$('#currency-amount').value, '');
    c.coins = { cp: 7, sp: 3, ep: 0, gp: 0, pp: 1 };
    a.api.setPage('equipment');
    a.input('#currency-unit', 'sp');
    a.input('#currency-amount', '5');
    a.click('[data-action="spend"]');
    assert.deepEqual({ ...c.coins }, { cp: 7, sp: 3, ep: 1, gp: 9, pp: 0 });
    c.coins = { cp: 10, sp: 9, ep: 0, gp: 0, pp: 0 };
    a.api.setPage('equipment');
    a.input('#currency-amount', '1');
    a.click('[data-action="spend"]');
    assert.deepEqual({ ...c.coins }, { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 });
    a.input('#currency-unit', 'ep');
    a.input('#currency-amount', '3');
    a.$('#currency-amount').focus();
    a.click('[data-action="gain"]');
    assert.equal(c.coins.ep, 3);
    assert.equal(a.$('#currency-amount').value, '');
    await a.api.persist();
    const b = await app(a.storage);
    try {
      assert.equal(b.api.current.coins.ep, 3);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('currency accepts comma-separated denominations and Enter gains once', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Mixed coins');
    a.api.use(c);
    a.api.setPage('equipment');
    a.input('#currency-amount', '10gp, 2 sp, 3CP, 1pp, 2ep, 5 gp');
    a.$('#currency-amount').focus();
    a.$('#currency-amount').dispatchEvent(
      new a.w.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.deepEqual({ ...c.coins }, { cp: 3, sp: 2, ep: 2, gp: 15, pp: 1 });
    assert.equal(a.$('#currency-amount').value, '');
    a.input('#currency-amount', '1gp, 2sp');
    a.$('#currency-amount').dispatchEvent(
      new a.w.KeyboardEvent('keydown', {
        key: 'Enter',
        repeat: true,
        bubbles: true,
      }),
    );
    assert.equal(c.coins.gp, 15);
    a.click('[data-action="spend"]');
    assert.deepEqual({ ...c.coins }, { cp: 3, sp: 0, ep: 2, gp: 14, pp: 1 });
    const before = JSON.stringify(c.coins);
    for (const amount of [
      '1gp, nope',
      '1gp,',
      '1gp,,2sp',
      '1gp, 2',
      '1xp',
      '1gp, -2sp',
      '1gp, 1.5sp',
      '1gp, 9007199254740992cp',
    ]) {
      a.input('#currency-amount', amount);
      a.click('[data-action="gain"]');
      assert.equal(JSON.stringify(c.coins), before);
      assert.equal(a.$('#currency-amount').value, amount);
    }
  } finally {
    a.close();
  }
});

test('journal bullets autoformat, continue, indent, outdent, and persist as plain text', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Lists');
    a.api.use(c);
    a.api.setPage('notes');
    a.click('[data-action="new-note"]');
    const body = a.$('[data-note="body"]');
    const type = (value) => {
      body.value = value;
      body.setSelectionRange(value.length, value.length);
      body.dispatchEvent(new a.w.Event('input', { bubbles: true }));
    };
    const key = (value, options = {}) =>
      body.dispatchEvent(
        new a.w.KeyboardEvent('keydown', {
          key: value,
          bubbles: true,
          cancelable: true,
          ...options,
        }),
      );
    type('- ');
    assert.equal(body.value, '● ');
    assert.equal(c.notes[0].body, '● ');
    type('● First');
    key('Enter');
    assert.equal(body.value, '● First\n● ');
    key('Tab');
    assert.equal(body.value, '● First\n            ○ ');
    type(body.value + 'Child');
    key('Enter');
    assert.equal(body.value, '● First\n            ○ Child\n            ○ ');
    key('Tab');
    assert.equal(
      body.value,
      '● First\n            ○ Child\n                        ■ ',
    );
    key('Tab', { shiftKey: true });
    assert.equal(body.value, '● First\n            ○ Child\n            ○ ');
    key('Enter');
    assert.equal(body.value, '● First\n            ○ Child\n● ');
    key('Enter');
    assert.equal(body.value, '● First\n            ○ Child\n');
    type('            * ');
    assert.equal(body.value, '            ○ ');
    type('Normal - ');
    assert.equal(body.value, 'Normal - ');
    type(' '.repeat(12) + '○ ');
    key('Backspace');
    assert.equal(body.value, '');
    assert.equal(c.notes[0].body, '');
    type('● Parent\n' + ' '.repeat(24) + '■ ');
    key('Backspace');
    assert.equal(body.value, '● Parent\n');
    type(' '.repeat(12) + '○ Child');
    body.setSelectionRange(14, 14);
    key('Backspace');
    assert.equal(body.value, 'Child');
    assert.equal(c.notes[0].body, 'Child');
    type('● Saved\n            ○ Child');
    await a.api.persist();
    const b = await app(a.storage);
    try {
      assert.equal(b.api.current.notes[0].body, '● Saved\n            ○ Child');
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('all removable boxes share confirmation, support cancellation, and undo with full data and order', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Undo entries');
    const cases = [
      [
        'attacks',
        'combat',
        {
          name: 'Sword',
          bonus: '+4',
          damage: '1d8',
          type: 'Melee',
          notes: 'Keep me',
        },
        '.attack-summary',
      ],
      ['resources', 'combat', { name: 'Ability', remaining: 2, max: 3 }, null],
      [
        'equipment',
        'equipment',
        { name: 'Rope', quantity: 2, weight: 5, notes: 'Silk', equipped: true },
        null,
      ],
      [
        'spells',
        'spells',
        {
          name: 'Light',
          level: 0,
          school: 'Evocation',
          time: 'Action',
          range: 'Touch',
          components: 'V',
          duration: '1 hour',
          description: 'Bright light',
          prepared: true,
          concentration: false,
          ritual: false,
        },
        '.spell-record-summary',
      ],
    ];
    a.api.use(c);
    let confirmation;
    for (const [list, page, item, editor] of cases) {
      c[list] = [
        structuredClone(item),
        { ...structuredClone(item), name: 'Second' },
      ];
      a.api.setPage(page);
      if (editor) a.click(editor);
      const selector = `[data-action="remove"][data-list="${list}"][data-index="0"]`;
      a.click(selector);
      assert.equal(c[list].length, 2);
      assert.equal(a.$('#modal').open, true);
      if (confirmation)
        assert.equal(a.$('#modal-form').innerHTML, confirmation);
      else confirmation = a.$('#modal-form').innerHTML;
      a.click('[data-action="close-modal"]');
      assert.equal(c[list].length, 2);
      if (editor) a.click(editor);
      a.click(selector);
      await a.submit();
      assert.equal(c[list].length, 1);
      assert.equal(c[list][0].name, 'Second');
      a.w.document.body.dispatchEvent(
        new a.w.KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
          cancelable: true,
        }),
      );
      assert.equal(c[list].length, 2);
      assert.deepEqual(JSON.parse(JSON.stringify(c[list][0])), item);
    }
    await a.api.persist();
    const b = await app(a.storage);
    try {
      for (const [list, , item] of cases)
        assert.deepEqual(
          JSON.parse(JSON.stringify(b.api.current[list][0])),
          item,
        );
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('deletion undo preserves text undo and stays with the character across pages', async () => {
  const a = await app();
  try {
    const c = a.api.blank('First');
    c.equipment = [
      { name: 'Pack', quantity: 1, weight: 1, notes: '', equipped: false },
      { name: 'Torch', quantity: 1, weight: 1, notes: '', equipped: false },
    ];
    a.api.use(c);
    a.api.setPage('equipment');
    for (let i = 0; i < 2; i++) {
      a.click('[data-action="remove"][data-list="equipment"]');
      await a.submit();
    }
    a.api.setPage('notes');
    a.click('[data-action="new-note"]');
    const field = a.$('[data-note="body"]');
    const textUndo = new a.w.KeyboardEvent('keydown', {
      key: 'z',
      ctrlKey: true,
      bubbles: true,
      cancelable: true,
    });
    field.dispatchEvent(textUndo);
    assert.equal(textUndo.defaultPrevented, false);
    assert.equal(c.equipment.length, 0);
    const other = a.api.blank('Other');
    a.api.use(other);
    a.w.document.body.dispatchEvent(
      new a.w.KeyboardEvent('keydown', {
        key: 'z',
        ctrlKey: true,
        bubbles: true,
      }),
    );
    assert.equal(other.equipment.length, 0);
    assert.equal(c.equipment.length, 0);
    a.api.state.selected = c.id;
    a.api.setPage('overview');
    for (let i = 0; i < 2; i++)
      a.w.document.body.dispatchEvent(
        new a.w.KeyboardEvent('keydown', {
          key: 'z',
          ctrlKey: true,
          bubbles: true,
        }),
      );
    assert.deepEqual(
      Array.from(c.equipment, (item) => item.name),
      ['Pack', 'Torch'],
    );
  } finally {
    a.close();
  }
});

test('currency rejects overspending and invalid amounts without changing balances', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Limited funds');
    c.coins.gp = 1;
    a.api.use(c);
    a.api.setPage('equipment');
    const before = JSON.stringify(c.coins);
    for (const amount of ['2', '0', '-1', '1.5', 'abc', '9007199254740992']) {
      a.input('#currency-amount', amount);
      a.click('[data-action="spend"]');
      assert.equal(JSON.stringify(c.coins), before);
      assert.equal(a.$('#currency-amount').value, amount);
    }
    for (const amount of ['0', '-1', '1.5', 'abc', '9007199254740992']) {
      a.input('#currency-amount', amount);
      a.click('[data-action="gain"]');
      assert.equal(JSON.stringify(c.coins), before);
    }
  } finally {
    a.close();
  }
});

test('skill search filters by name and preserves proficiency and expertise selections', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Skill search');
    c.skills = ['Arcana'];
    a.api.use(c);
    a.api.setPage('abilities');
    assert.ok(
      !a.$('#page-content').textContent.includes('Check P for proficiency'),
    );
    assert.equal(a.w.document.querySelectorAll('[data-skill]').length, 18);
    const search = a.$('#skill-search');
    search.focus();
    a.input('#skill-search', 'sTeAl', false);
    assert.equal(a.w.document.activeElement, search);
    assert.equal(a.w.document.querySelectorAll('[data-skill]').length, 1);
    assert.equal(a.$('[data-skill]').dataset.skill, 'Stealth');
    a.input('[data-expertise="Stealth"]', true);
    await settle();
    assert.equal(a.$('#skill-search').value, 'sTeAl');
    assert.ok(c.skills.includes('Stealth'));
    assert.ok(c.skills.includes('Arcana'));
    a.input('#skill-search', 'no matching name');
    assert.equal(a.$('[data-skill]'), null);
    assert.match(a.$('#page-content').textContent, /No matching skills/);
    a.input('#skill-search', '');
    assert.equal(a.w.document.querySelectorAll('[data-skill]').length, 18);
    assert.equal(a.$('[data-expertise="Stealth"]').checked, true);
    assert.equal(a.$('[data-skill="Arcana"]').checked, true);
  } finally {
    a.close();
  }
});

test('attacks collapse into readable summaries on Done or outside clicks without losing edits or the clicked action', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Attack editor');
    a.api.use(c);
    a.api.setPage('combat');
    a.click('[data-action="add-attack"]');
    assert.ok(a.$('[data-attack-editor]'));
    a.input('[data-field="attacks.0.name"]', 'Longsword');
    a.input('[data-field="attacks.0.bonus"]', '+5');
    a.input('[data-field="attacks.0.damage"]', '1d8 + 3');
    a.input('[data-field="attacks.0.type"]', 'Slashing · 5 ft');
    a.input('[data-field="attacks.0.notes"]', 'Versatile <img src=x>');
    a.click('[data-action="finish-attack"]');
    assert.equal(a.$('[data-attack-editor]'), null);
    assert.match(a.$('.attack-summary').textContent, /Longsword/);
    assert.match(a.$('.attack-summary').textContent, /1d8 \+ 3/);
    assert.match(a.$('.attack-summary').textContent, /Versatile <img src=x>/);
    assert.equal(a.$('.attack-summary img'), null);
    a.click('.attack-summary');
    assert.equal(a.$('[data-field="attacks.0.name"]').value, 'Longsword');
    a.input('[data-field="attacks.0.bonus"]', '+6');
    a.click('.combat-stats');
    assert.equal(a.$('[data-attack-editor]'), null);
    assert.match(a.$('.attack-summary').textContent, /\+6/);
    a.click('.attack-summary');
    a.input('[data-field="attacks.0.notes"]', 'Updated notes');
    a.$('#hp-amount').value = '1';
    a.click('[data-action="damage"]');
    assert.equal(c.hp, 9, 'The outside click must still apply damage');
    assert.equal(a.$('[data-attack-editor]'), null);
    assert.match(a.$('.attack-summary').textContent, /Updated notes/);
  } finally {
    a.close();
  }
});

test('only one attack is edited at a time and saved attacks reopen in compact mode', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Several attacks');
    a.api.use(c);
    a.api.setPage('combat');
    a.click('[data-action="add-attack"]');
    a.input('[data-field="attacks.0.name"]', 'Bow');
    a.click('[data-action="add-attack"]');
    a.input('[data-field="attacks.1.name"]', 'Dagger');
    assert.equal(
      a.w.document.querySelectorAll('[data-attack-editor]').length,
      1,
    );
    assert.match(a.$('.attack-summary').textContent, /Bow/);
    a.click('.attack-summary');
    assert.equal(a.$('[data-attack-editor]').dataset.attackEditor, '0');
    assert.match(a.$('.attack-summary').textContent, /Dagger/);
    a.click('[data-action="finish-attack"]');
    await a.api.persist();
    const b = await app(a.storage);
    try {
      b.api.setPage('combat');
      assert.equal(b.$('[data-attack-editor]'), null);
      assert.equal(b.w.document.querySelectorAll('.attack-summary').length, 2);
      b.click('.attack-summary');
      b.click('[data-action="remove"][data-list="attacks"]');
      await b.submit();
      assert.equal(b.api.current.attacks.length, 1);
      assert.equal(b.api.current.attacks[0].name, 'Dagger');
      assert.equal(b.$('[data-attack-editor]'), null);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('spells collapse on Done or outside clicks and retain descriptions, details, and prepared state', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Spell editor');
    a.api.use(c);
    a.api.setPage('spells');
    a.click('[data-action="add-spell"]');
    assert.ok(a.$('[data-spell-editor]'));
    const values = {
      name: 'Test ward',
      level: 1,
      school: 'Abjuration',
      time: '1 action',
      range: 'Touch',
      components: 'V, S',
      duration: '1 hour',
      description: 'A protective ward. <img src=x>',
      prepared: true,
    };
    for (const [key, value] of Object.entries(values))
      a.input(`[data-field="spells.0.${key}"]`, value);
    a.click('[data-action="finish-spell"]');
    assert.equal(a.$('[data-spell-editor]'), null);
    const summary = a.$('.spell-record-summary');
    assert.match(summary.textContent, /Test ward/);
    assert.match(summary.textContent, /Level 1 · Abjuration · Prepared/);
    assert.match(summary.textContent, /1 hour/);
    assert.match(summary.textContent, /<img src=x>/);
    assert.equal(summary.querySelector('img'), null);
    a.click('.spell-record-summary');
    assert.equal(a.$('[data-field="spells.0.prepared"]').checked, true);
    assert.equal(
      a.$('[data-field="spells.0.description"]').value,
      values.description,
    );
    a.input('[data-field="spells.0.range"]', '60 ft');
    a.click('.spell-summary');
    assert.equal(a.$('[data-spell-editor]'), null);
    assert.match(a.$('.spell-record-summary').textContent, /60 ft/);
    a.click('.spell-record-summary');
    a.input('[data-field="spells.0.prepared"]', false);
    a.click('[data-field="slots.0"]');
    a.input('[data-field="slots.0"]', 3);
    assert.equal(a.$('[data-spell-editor]'), null);
    assert.equal(c.slots[0], 3);
    assert.ok(!a.$('.spell-record-meta').textContent.includes('Prepared'));
  } finally {
    a.close();
  }
});

test('spell editors switch between entries and saved spells reload compactly', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Spellbook');
    a.api.use(c);
    a.api.setPage('spells');
    a.click('[data-action="add-spell"]');
    a.input('[data-field="spells.0.name"]', 'First spell');
    a.click('[data-action="add-spell"]');
    a.input('[data-field="spells.1.name"]', 'Second spell');
    assert.equal(
      a.w.document.querySelectorAll('[data-spell-editor]').length,
      1,
    );
    assert.match(a.$('.spell-record-summary').textContent, /First spell/);
    a.click('.spell-record-summary');
    assert.equal(a.$('[data-spell-editor]').dataset.spellEditor, '0');
    assert.match(a.$('.spell-record-summary').textContent, /Second spell/);
    a.click('[data-action="finish-spell"]');
    await a.api.persist();
    const b = await app(a.storage);
    try {
      b.api.setPage('spells');
      assert.equal(b.$('[data-spell-editor]'), null);
      assert.equal(
        b.w.document.querySelectorAll('.spell-record-summary').length,
        2,
      );
      b.click('.spell-record-summary');
      b.click('[data-action="remove"][data-list="spells"]');
      await b.submit();
      assert.equal(b.api.current.spells.length, 1);
      assert.equal(b.api.current.spells[0].name, 'Second spell');
      assert.equal(b.$('[data-spell-editor]'), null);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('spell hover popups show the full escaped description and close immediately when leaving the card', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Hover spells');
    const description =
      'A long description with several lines.\n'.repeat(30) +
      '<img src=x onerror=bad()>';
    c.spells = [
      {
        name: 'Detailed spell',
        level: 1,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description,
        prepared: false,
      },
    ];
    a.api.use(c);
    a.api.setPage('spells');
    const card = a.$('.spell-record-summary');
    card.dispatchEvent(new a.w.MouseEvent('pointerover', { bubbles: true }));
    const popup = a.$('.spell-popup');
    assert.ok(popup);
    assert.equal(popup.hidden, false);
    assert.equal(a.$('.spell-popup-description').textContent, description);
    assert.equal(a.$('.spell-popup-title').textContent, 'Detailed spell');
    assert.equal(popup.querySelector('img'), null);
    assert.equal(card.getAttribute('aria-describedby'), popup.id);
    card.dispatchEvent(
      new a.w.MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: card.firstElementChild,
      }),
    );
    assert.equal(popup.hidden, false);
    card.dispatchEvent(
      new a.w.MouseEvent('pointerout', { bubbles: true, relatedTarget: popup }),
    );
    assert.equal(popup.hidden, true);
    popup.dispatchEvent(
      new a.w.MouseEvent('pointerover', { bubbles: true, relatedTarget: card }),
    );
    assert.equal(popup.hidden, true);
    card.focus();
    assert.equal(popup.hidden, false);
    card.dispatchEvent(
      new a.w.MouseEvent('pointerout', {
        bubbles: true,
        relatedTarget: a.w.document.body,
      }),
    );
    assert.equal(popup.hidden, true);
    assert.equal(card.hasAttribute('aria-describedby'), false);
  } finally {
    a.close();
  }
});

test('spell popups support keyboard focus and Escape and dismiss when editing begins', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Keyboard spells');
    c.spells = [
      {
        name: 'Focused spell',
        level: 0,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: 'Full effect text.',
        prepared: false,
      },
    ];
    a.api.use(c);
    a.api.setPage('spells');
    const card = a.$('.spell-record-summary');
    card.focus();
    const popup = a.$('.spell-popup');
    assert.equal(popup.hidden, false);
    popup.focus();
    assert.equal(popup.hidden, false);
    a.$('[data-field="spellAbility"]').focus();
    assert.equal(popup.hidden, true);
    card.focus();
    assert.equal(popup.hidden, false);
    card.dispatchEvent(
      new a.w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    assert.equal(popup.hidden, true);
    card.blur();
    card.focus();
    assert.equal(popup.hidden, false);
    a.click('.spell-record-summary');
    assert.equal(popup.hidden, true);
    assert.ok(a.$('[data-spell-editor]'));
  } finally {
    a.close();
  }
});

test('text damage/heal controls work on both pages, absorb temporary HP, cap healing, and validate amounts', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Defender');
    c.hp = 20;
    c.maxHp = 30;
    c.tempHp = 5;
    c.usedSlots[0] = 2;
    a.api.use(c);
    a.api.setPage('combat');
    assert.equal(a.$('#hp-amount').type, 'text');
    assert.equal(a.$('[data-field="hp"]'), null);
    assert.equal(
      a.$('.health-actions').nextElementSibling.className,
      'form-grid hp-limits',
    );
    assert.equal(a.$('.hp-limits input').dataset.field, 'tempHp');
    assert.equal(a.$('.hp-display').textContent, '25/30');
    for (const invalid of ['', '-1', '2.5', 'abc', '1e2']) {
      a.$('#hp-amount').value = invalid;
      a.click('[data-action="damage"]');
      assert.equal(c.hp, 20);
      assert.equal(c.tempHp, 5);
    }
    a.$('#hp-amount').value = '8';
    a.click('[data-action="damage"]');
    assert.equal(c.hp, 17);
    assert.equal(c.tempHp, 0);
    assert.equal(a.$('.hp-display').textContent, '17/30');
    assert.equal(a.$('#hp-amount').value, '');
    a.api.setPage('overview');
    assert.equal(a.$('#hp-amount').type, 'text');
    assert.equal(a.$('[data-field="hp"]'), null);
    a.$('#hp-amount').value = '99';
    a.click('[data-action="heal"]');
    assert.equal(c.hp, 30);
    a.input('[data-field="maxHp"]', 40);
    await settle();
    assert.match(a.$('.hp-display').textContent, /\/40$/);
    a.api.setPage('combat');
    c.maxHp = 30;
    c.hp = 1;
    c.deathFailure = 2;
    a.api.setPage('overview');
    a.click('[data-action="rest"]');
    await a.submit();
    assert.equal(c.hp, 30);
    assert.equal(c.deathFailure, 0);
    assert.equal(c.usedSlots[0], 0);
  } finally {
    a.close();
  }
});

test('notes stay with their character, escape markup, and export all images', async () => {
  const a = await app();
  try {
    const c = a.api.blank('<img src=x onerror=alert(1)>');
    c.image = image;
    a.api.use(c);
    a.click('[data-action="new-note"]');
    a.input('[data-note="title"]', '<script>bad()</script>');
    a.input('[data-note="body"]', 'A clue in the old tower');
    await settle();
    c.notes[0].images = [image];
    assert.equal(a.$('h1 img'), null);
    assert.equal(a.$('.note-preview script'), null);
    const other = a.api.blank('Other');
    a.api.use(other);
    a.api.setPage('notes');
    assert.equal(other.notes.length, 0);
    assert.equal(a.$('.note-preview'), null);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    assert.equal(backup.characters.length, 2);
    assert.equal(backup.characters[0].image, image);
    assert.equal(backup.characters[0].notes[0].images[0], image);
    assert.equal(
      a.api.validateBackup(backup)[0].notes[0].body,
      'A clue in the old tower',
    );
  } finally {
    a.close();
  }
});

test('journal pins, custom tags, and related links work together and save independently', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Organized journal');
    const first = {
      id: randomUUID(),
      title: 'Ruins',
      body: 'An old tower',
      tag: 'Location',
      updated: new Date().toISOString(),
      images: [],
    };
    const second = {
      ...first,
      id: randomUUID(),
      title: 'Clue',
      body: 'A hidden door',
      images: [],
    };
    character.notes = [first, second];
    a.api.use(character);
    a.api.setPage('notes');

    a.click(`[data-action="select-note"][data-id="${second.id}"]`);
    a.click('[data-action="pin-note"]');
    assert.equal(second.pinned, true);
    assert.equal(a.$('.note-preview').dataset.id, second.id);
    assert.match(a.$('.pin-label').textContent, /Pinned/);
    assert.equal(character.notes[0].id, first.id);

    a.input('[data-note="tags"]', 'Important, mystery, Important, <img src=x>');
    await settle();
    assert.deepEqual(Array.from(second.tags), [
      'Important',
      'mystery',
      '<img src=x>',
    ]);
    assert.equal(a.$('.note-category img'), null);
    a.input('#journal-filter', 'tag:mystery');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 1);
    a.input('#journal-search', 'important');
    assert.equal(a.$('.note-preview').dataset.id, second.id);

    a.click('[data-action="link-notes"]');
    a.input(`#modal input[value="${first.id}"]`, true);
    await a.submit();
    assert.deepEqual(Array.from(second.links), [first.id]);
    assert.deepEqual(Array.from(first.links), [second.id]);
    a.click(`[data-action="open-related-note"][data-id="${first.id}"]`);
    assert.equal(a.$('[data-note="title"]').value, 'Ruins');
    assert.equal(a.$('#journal-search').value, '');
    assert.equal(a.$('#journal-filter').value, 'all');

    a.click('[data-action="link-notes"]');
    a.input(`#modal input[value="${second.id}"]`, false);
    await a.submit();
    assert.equal(first.links.length, 0);
    assert.equal(second.links.length, 0);

    a.click('[data-action="link-notes"]');
    a.input(`#modal input[value="${second.id}"]`, true);
    await a.submit();
    await a.api.persist();
    const b = await app(a.storage);
    try {
      const notes = b.api.current.notes;
      assert.equal(notes[1].pinned, true);
      assert.equal(notes[1].tags[0], 'Important');
      assert.equal(notes[0].links[0], notes[1].id);
      b.api.setPage('notes');
      b.click('[data-action="delete-note"]');
      await b.submit();
      assert.equal(b.api.current.notes.length, 1);
      assert.equal(b.api.current.notes[0].links.length, 0);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('journal organization survives export, duplication, and merge restore with remapped links', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Linked journal');
    const firstId = randomUUID();
    const secondId = randomUUID();
    character.notes = [
      {
        id: firstId,
        title: 'First',
        body: '',
        tag: 'General',
        updated: new Date().toISOString(),
        images: [image],
        pinned: true,
        tags: ['custom'],
        links: [secondId],
      },
      {
        id: secondId,
        title: 'Second',
        body: '',
        tag: 'General',
        updated: new Date().toISOString(),
        images: [],
        links: [firstId],
      },
    ];
    a.api.use(character);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    assert.equal(backup.characters[0].notes[0].pinned, true);
    assert.equal(backup.characters[0].notes[0].links[0], secondId);

    a.click('[data-action="library"]');
    a.click(`[data-action="duplicate"][data-id="${character.id}"]`);
    const copy = a.api.current;
    assert.notEqual(copy.notes[0].id, firstId);
    assert.equal(copy.notes[0].links[0], copy.notes[1].id);
    assert.equal(copy.notes[1].links[0], copy.notes[0].id);
    assert.equal(copy.notes[0].tags[0], 'custom');

    await a.restore(backup.characters, 'merge');
    const restored = a.api.state.characters.at(-1);
    assert.notEqual(restored.notes[0].id, firstId);
    assert.notEqual(restored.notes[0].id, copy.notes[0].id);
    assert.equal(restored.notes[0].links[0], restored.notes[1].id);
    assert.equal(restored.notes[1].links[0], restored.notes[0].id);
    assert.equal(restored.notes[0].pinned, true);
    assert.equal(restored.notes[0].images[0], image);

    for (const invalid of [
      { pinned: 'yes' },
      { tags: ['fine', 2] },
      { links: [123] },
    ]) {
      const bad = structuredClone(backup);
      Object.assign(bad.characters[0].notes[0], invalid);
      assert.throws(() => a.api.validateBackup(bad), /Invalid note/);
    }
  } finally {
    a.close();
  }
});

test('related note search filters without losing checked links and does not submit on Enter', async () => {
  const a = await app();

  try {
    const character = a.api.blank('Related search');
    const note = (title, body = '', tags = []) => ({
      id: randomUUID(),
      title,
      body,
      tag: 'General',
      updated: new Date().toISOString(),
      images: [],
      tags,
    });
    const active = note('Current');
    const first = note('Ruins', 'Hidden entrance');
    const second = note('Merchant', '', ['supplies']);
    active.links = [first.id];
    first.links = [active.id];
    character.notes = [active, first, second];
    a.api.use(character);
    a.api.setPage('notes');
    a.click('[data-action="link-notes"]');

    a.input('#related-notes-search', ' SUPPLIES ');
    assert.equal(a.$(`[data-note-link="${first.id}"]`).hidden, true);
    assert.equal(a.$(`[data-note-link="${second.id}"]`).hidden, false);
    a.input(`#modal input[value="${second.id}"]`, true);
    a.input('#related-notes-search', 'hidden entrance');
    assert.equal(a.$(`[data-note-link="${first.id}"]`).hidden, false);
    assert.equal(a.$(`#modal input[value="${second.id}"]`).checked, true);
    a.input('#related-notes-search', 'no such note');
    assert.equal(a.$('#related-notes-empty').hidden, false);
    const enter = new a.w.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    a.$('#related-notes-search').dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    assert.equal(a.$('#modal').open, true);
    a.input('#related-notes-search', '');
    assert.equal(a.$('#related-notes-empty').hidden, true);
    assert.equal(
      a.w.document.querySelectorAll('[data-note-link]:not([hidden])').length,
      2,
    );
    await a.submit();
    assert.deepEqual(Array.from(active.links), [first.id, second.id]);
    assert.deepEqual(Array.from(second.links), [active.id]);
  } finally {
    a.close();
  }
});

test('journal search combines with category filters without deleting or switching the open note', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Journal search');
    c.notes = [
      {
        id: randomUUID(),
        title: 'Arrival',
        body: 'An elven guide led us to town.',
        tag: 'Session',
        updated: '2026-10-19T12:00:00.000Z',
        images: [],
      },
      {
        id: randomUUID(),
        title: 'Elven ruins',
        body: 'Find the lost key.',
        tag: 'Quest',
        updated: '2026-10-18T12:00:00.000Z',
        images: [],
      },
      {
        id: randomUUID(),
        title: 'Mira',
        body: 'The local blacksmith.',
        tag: 'NPC',
        updated: '2026-10-17T12:00:00.000Z',
        images: [],
      },
    ];
    a.api.use(c);
    a.api.setPage('notes');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 3);
    assert.ok(a.$('.note-preview-heading time'));
    const search = a.$('#journal-search');
    search.focus();
    a.input('#journal-search', 'ELVEN', false);
    assert.equal(
      a.w.document.activeElement,
      search,
      'Searching keeps the input focused',
    );
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 2);
    a.input('#journal-filter', 'Quest');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 1);
    assert.equal(
      a.$('.note-preview-heading strong').textContent,
      'Elven ruins',
    );
    a.click('.note-preview');
    assert.equal(a.$('[data-note="title"]').value, 'Elven ruins');
    a.input('#journal-search', 'no matches');
    assert.equal(a.$('.note-preview'), null);
    assert.equal(a.$('[data-note="title"]').value, 'Elven ruins');
    assert.equal(c.notes.length, 3);
    a.click('[data-action="clear-note-filters"]');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 3);
    assert.equal(a.$('#journal-filter').value, 'all');
    assert.equal(a.$('#journal-search').value, '');
    a.input('#journal-filter', 'NPC');
    a.click('[data-action="new-note"]');
    assert.equal(c.notes[0].tag, 'NPC');
    assert.equal(a.$('#journal-filter').value, 'NPC');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 2);
  } finally {
    a.close();
  }
});

test('journal searches stay within the current character and reset when switching characters', async () => {
  const a = await app();
  try {
    const first = a.api.blank('First');
    first.notes = [
      {
        id: randomUUID(),
        title: 'Old quest',
        body: 'Old text',
        tag: 'Quest',
        updated: new Date().toISOString(),
        images: [],
      },
    ];
    a.api.use(first);
    a.api.setPage('notes');
    a.input('#journal-search', 'old');
    a.input('#journal-filter', 'Quest');
    const second = a.api.blank('Second');
    second.notes = [
      {
        id: randomUUID(),
        title: 'New session',
        body: 'A separate story',
        tag: 'Session',
        updated: new Date().toISOString(),
        images: [],
      },
    ];
    a.api.use(second);
    assert.equal(a.$('#journal-search').value, '');
    assert.equal(a.$('#journal-filter').value, 'all');
    assert.equal(a.w.document.querySelectorAll('.note-preview').length, 1);
    assert.equal(
      a.$('.note-preview-heading strong').textContent,
      'New session',
    );
    assert.equal(a.$('[data-note="title"]').value, 'New session');
    a.input('#journal-search', 'old');
    assert.equal(a.$('.note-preview'), null);
    assert.equal(first.notes.length, 1);
  } finally {
    a.close();
  }
});

test('restore merges as independent copies, then replacement persists exactly the backup', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Original');
    c.image = image;
    c.notes = [
      {
        id: randomUUID(),
        title: 'Session',
        body: 'Hello',
        tag: 'Session',
        updated: new Date().toISOString(),
        images: [image],
      },
    ];
    a.api.use(c);
    await a.restore([c]);
    assert.equal(a.api.state.characters.length, 2);
    const copy = a.api.state.characters[1];
    assert.notEqual(copy.id, c.id);
    assert.notEqual(copy.notes[0].id, c.notes[0].id);
    assert.equal(copy.notes[0].images[0], image);
    await a.restore([c], 'replace');
    assert.equal(a.api.state.characters.length, 1);
    assert.equal(a.api.state.characters[0].id, c.id);
    assert.equal(a.api.state.selected, null);
    const b = await app(a.storage);
    try {
      assert.equal(b.api.state.characters[0].image, image);
      assert.equal(b.api.state.characters.length, 1);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('invalid backups reject before modifying the library, including unsafe IDs and image types', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Safe');
    a.api.use(c);
    const wrap = (characters) => ({
      format: 'statfolio',
      version: 1,
      characters,
    });
    assert.throws(() => a.api.validateBackup({ ...wrap([c]), version: 99 }));
    for (const change of [
      { id: 'x" onclick="bad()' },
      { image: 'data:image/svg+xml;base64,PHN2Zz4=' },
      { abilities: [10] },
      { slots: [-1] },
      {
        notes: [
          {
            id: 'x',
            title: 'bad',
            body: '',
            tag: 'General',
            updated: '',
            images: ['https://tracker.test/x'],
          },
        ],
      },
    ])
      assert.throws(() => a.api.validateBackup(wrap([{ ...c, ...change }])));
    assert.throws(() => a.api.validateBackup(wrap([c, c])));
    await a.restore([{ ...c, abilities: 'invalid' }]);
    assert.equal(a.api.state.characters.length, 1);
    assert.equal(a.$('#modal').open, false);
    assert.match(a.$('#toast').textContent, /Invalid abilities/);
  } finally {
    a.close();
  }
});

test('all sheet pages render and inventory preserves fractional weights and negative initiative adjustments', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Versatile');
    a.api.use(c);
    for (const page of [
      'overview',
      'abilities',
      'combat',
      'spells',
      'equipment',
      'background',
      'notes',
    ]) {
      a.api.setPage(page);
      assert.ok(a.$('#page-content').textContent.length > 20);
    }
    a.api.setPage('equipment');
    a.click('[data-action="add-item"]');
    a.input('[data-field="equipment.0.weight"]', 0.5);
    await settle();
    assert.equal(c.equipment[0].weight, 0.5);
    assert.match(a.$('#page-content').textContent, /0.5 lb/);
    a.api.setPage('combat');
    a.input('[data-field="initiativeBonus"]', -2);
    await settle();
    assert.equal(c.initiativeBonus, -2);
    a.api.setPage('spells');
    a.click('[data-action="add-spell"]');
    a.input('[data-field="spells.0.name"]', 'A custom spell');
    assert.equal(c.spells[0].name, 'A custom spell');
  } finally {
    a.close();
  }
});

test('storage failure keeps in-memory data exportable and reports the save problem', async () => {
  const a = await app();
  try {
    a.w.console.error = () => {};
    const c = a.api.blank('Protected');
    a.api.use(c);
    a.api.changed();
    a.api.db.close();
    await assert.rejects(a.api.persist());
    assert.equal(a.api.failed, true);
    assert.match(a.$('#save-status').textContent, /Save failed/);
    await a.api.exportBackup();
    assert.equal(
      JSON.parse(await a.download().text()).characters[0].name,
      'Protected',
    );
  } finally {
    a.close();
  }
});

const glance = (a, label) =>
  [...a.w.document.querySelectorAll('.glance>div')]
    .find((el) => el.querySelector('span').textContent === label)
    .querySelector('strong').textContent;
const spellSummary = (a) =>
  [...a.w.document.querySelectorAll('.spell-summary .big-number')].map(
    (el) => el.textContent,
  );

test('10 current HP plus 2 temporary HP shows 12/10 everywhere and remains correct after damage and reload', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Temporary health');
    a.api.use(c);
    a.input('[data-field="tempHp"]', 2, false);
    await settle();
    assert.equal(a.$('.hp-display').textContent, '12/10');
    assert.equal(a.$('.hp-display strong').textContent, '12/10');
    a.click('[data-page="combat"]');
    assert.equal(a.$('.hp-display').textContent, '12/10');
    a.click('[data-action="library"]');
    assert.equal(a.$('.card-stats strong').textContent, '12/10');
    a.click('[data-action="open"]');
    a.$('#hp-amount').value = '1';
    a.click('[data-action="damage"]');
    assert.equal(a.$('.hp-display').textContent, '11/10');
    assert.equal(c.hp, 10);
    assert.equal(c.tempHp, 1);
    a.$('#hp-amount').value = '3';
    a.click('[data-action="damage"]');
    assert.equal(a.$('.hp-display').textContent, '8/10');
    assert.equal(c.hp, 8);
    assert.equal(c.tempHp, 0);
    await a.api.persist();
    const b = await app(a.storage);
    try {
      assert.equal(b.$('.hp-display').textContent, '8/10');
      b.click('[data-action="library"]');
      assert.equal(b.$('.card-stats strong').textContent, '8/10');
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('every ability score from 1 to 30 produces the correct modifier while editing', async () => {
  const a = await app();
  try {
    a.api.use(a.api.blank('Modifiers'));
    const expected = [
      -5, -4, -4, -3, -3, -2, -2, -1, -1, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6,
      6, 7, 7, 8, 8, 9, 9, 10,
    ];
    for (let i = 0; i < expected.length; i++) {
      const control = a.$('[data-field="abilities.1"]');
      control.focus();
      a.input('[data-field="abilities.1"]', i + 1, false);
      await settle();
      assert.equal(
        a.w.document.activeElement,
        control,
        'Recalculating preserves the edited input and its focus',
      );
      assert.equal(
        a.$('[data-field="abilities.1"]').parentElement.querySelector('strong')
          .textContent,
        String(expected[i] >= 0 ? `+${expected[i]}` : expected[i]),
        `Dexterity ${i + 1}`,
      );
      assert.equal(
        glance(a, 'Initiative'),
        expected[i] >= 0 ? `+${expected[i]}` : String(expected[i]),
      );
    }
  } finally {
    a.close();
  }
});

test('proficiency updates through all twenty levels and propagates to saves and spellcasting', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Levels');
    c.abilities = [16, 14, 12, 18, 8, 10];
    c.saves = [0];
    c.skills = ['Perception'];
    a.api.use(c);
    const expected = [
      2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 6, 6, 6, 6,
    ];
    for (let i = 0; i < expected.length; i++) {
      a.api.setPage('overview');
      a.input('[data-field="level"]', i + 1);
      await settle();
      assert.equal(glance(a, 'Proficiency'), `+${expected[i]}`);
      assert.equal(glance(a, 'Passive perception'), String(9 + expected[i]));
      a.api.setPage('abilities');
      assert.equal(
        a.$('[data-save="0"]').parentElement.querySelector('strong')
          .textContent,
        `+${3 + expected[i]}`,
      );
      a.api.setPage('spells');
      assert.deepEqual(spellSummary(a), [
        String(12 + expected[i]),
        `+${4 + expected[i]}`,
      ]);
    }
  } finally {
    a.close();
  }
});

test('all eighteen skills and six saving throws use the correct ability and proficiency', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Skills');
    c.level = 9;
    c.abilities = [6, 10, 14, 18, 22, 26];
    a.api.use(c);
    a.api.setPage('abilities');
    const expected = {
      Acrobatics: 0,
      'Animal Handling': 6,
      Arcana: 4,
      Athletics: -2,
      Deception: 8,
      History: 4,
      Insight: 6,
      Intimidation: 8,
      Investigation: 4,
      Medicine: 6,
      Nature: 4,
      Perception: 6,
      Performance: 8,
      Persuasion: 8,
      Religion: 4,
      'Sleight of Hand': 0,
      Stealth: 0,
      Survival: 6,
    };
    for (const [name, base] of Object.entries(expected)) {
      const selector = `[data-skill="${name}"]`;
      assert.equal(
        a.$(selector).parentElement.querySelector('strong').textContent,
        base >= 0 ? `+${base}` : String(base),
      );
      a.input(selector, true);
      await settle();
      assert.equal(
        a.$(selector).parentElement.querySelector('strong').textContent,
        `+${base + 4}`,
      );
      a.input(`[data-expertise="${name}"]`, true);
      await settle();
      assert.equal(
        a.$(selector).parentElement.querySelector('strong').textContent,
        `+${base + 8}`,
      );
    }
    const saveBase = [-2, 0, 2, 4, 6, 8];
    for (let i = 0; i < 6; i++) {
      a.input(`[data-save="${i}"]`, true);
      await settle();
      assert.equal(
        a.$(`[data-save="${i}"]`).parentElement.querySelector('strong')
          .textContent,
        `+${saveBase[i] + 4}`,
      );
      a.input(`[data-save="${i}"]`, false);
      await settle();
      assert.equal(
        a.$(`[data-save="${i}"]`).parentElement.querySelector('strong')
          .textContent,
        saveBase[i] >= 0 ? `+${saveBase[i]}` : String(saveBase[i]),
      );
    }
    a.api.setPage('overview');
    assert.equal(glance(a, 'Passive perception'), '24');
  } finally {
    a.close();
  }
});

test('changing the casting ability updates spell DC and attack for all six abilities', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Caster');
    c.level = 5;
    c.abilities = [6, 10, 14, 18, 22, 26];
    a.api.use(c);
    a.api.setPage('spells');
    const expected = [
      ['9', '+1'],
      ['11', '+3'],
      ['13', '+5'],
      ['15', '+7'],
      ['17', '+9'],
      ['19', '+11'],
    ];
    for (let i = 0; i < 6; i++) {
      a.$('[data-field="spellAbility"]').focus();
      a.input('[data-field="spellAbility"]', i);
      await settle();
      assert.deepEqual(spellSummary(a), expected[i]);
      assert.equal(a.$('[data-field="spellAbility"]').value, String(i));
    }
    a.api.setPage('overview');
    a.input('[data-field="level"]', 1);
    a.input('[data-field="abilities.0"]', 1);
    await settle();
    a.api.setPage('spells');
    a.input('[data-field="spellAbility"]', 0);
    await settle();
    assert.deepEqual(spellSummary(a), ['5', '-3']);
  } finally {
    a.close();
  }
});

test('inventory totals update on quantity edits before blur, removal, and reload', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Inventory');
    c.equipment = [
      { name: 'Rope', quantity: 2, weight: 0.5, notes: '', equipped: false },
      { name: 'Pack', quantity: 1, weight: 12.25, notes: '', equipped: true },
    ];
    a.api.use(c);
    a.api.setPage('equipment');
    a.input('[data-field="equipment.0.quantity"]', 3, false);
    await settle();
    assert.match(a.$('#page-content').textContent, /13.8 lb/);
    a.click('[data-action="remove"][data-index="1"]');
    await a.submit();
    assert.match(a.$('#page-content').textContent, /1.5 lb/);
    await a.api.persist();
    const b = await app(a.storage);
    try {
      b.api.setPage('equipment');
      assert.match(b.$('#page-content').textContent, /1.5 lb/);
    } finally {
      b.close();
    }
  } finally {
    a.close();
  }
});

test('health caps current HP when maximum decreases and clears death saves when healed from zero', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Recovery');
    c.hp = 20;
    c.maxHp = 30;
    a.api.use(c);
    a.input('[data-field="maxHp"]', '', false);
    await settle();
    assert.equal(c.hp, 20);
    assert.equal(
      c.maxHp,
      30,
      'Clearing a field while typing must not erase HP',
    );
    a.input('[data-field="maxHp"]', 10);
    await settle();
    assert.equal(c.hp, 10);
    assert.equal(a.$('.hp-display strong').textContent, '10/10');
    a.input('[data-field="maxHp"]', 0);
    await settle();
    assert.equal(c.hp, 0);
    assert.equal(a.$('.hp-track i').style.width, '0%');
    assert.ok(!/NaN|Infinity/.test(a.$('#page-content').innerHTML));
    a.input('[data-field="maxHp"]', 15);
    a.input('[data-field="tempHp"]', 12);
    await settle();
    c.deathSuccess = 2;
    c.deathFailure = 1;
    a.$('#hp-amount').value = '3';
    a.click('[data-action="heal"]');
    assert.equal(c.hp, 3);
    assert.equal(c.deathSuccess, 0);
    assert.equal(c.deathFailure, 0);
    assert.equal(c.tempHp, 12, 'Healing leaves temporary HP alone');
    a.api.setPage('combat');
    assert.equal(a.$('[data-field="deathFailure"]').value, '0');
  } finally {
    a.close();
  }
});

test('restored character calculations reject invalid indexes and preserve expertise bonuses', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Restored');
    const wrap = (characters) => ({
      format: 'statfolio',
      version: 1,
      characters,
    });
    for (const change of [
      { spellAbility: 6 },
      { spellAbility: 1.5 },
      { level: 2.5 },
      { hp: -1 },
      { maxHp: -1 },
      { tempHp: -1 },
    ])
      assert.throws(() => a.api.validateBackup(wrap([{ ...c, ...change }])));
    c.level = 5;
    c.abilities[4] = 16;
    c.expertise = ['Perception'];
    c.skills = [];
    await a.restore([c], 'replace');
    a.click('[data-action="open"]');
    assert.equal(glance(a, 'Passive perception'), '19');
    a.api.setPage('abilities');
    assert.equal(a.$('[data-skill="Perception"]').checked, true);
    assert.equal(
      a.$('[data-expertise="Perception"]').parentElement.querySelector('strong')
        .textContent,
      '+9',
    );
  } finally {
    a.close();
  }
});

test('spell filters combine without changing data, preserve original indexes, and reset per character', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Filtered spells');
    const spell = (name, level, school, prepared, concentration, ritual) => ({
      name,
      level,
      school,
      prepared,
      concentration,
      ritual,
      time: '',
      range: '',
      components: '',
      duration: '',
      description: '',
    });
    c.spells = [
      spell('Fire bolt', 0, 'Evocation', false, false, false),
      spell('Detect magic', 1, 'Divination', true, true, true),
      spell('Magic missile', 1, 'Evocation', true, false, false),
      spell('Detect thoughts', 2, 'Divination', false, true, false),
    ];
    a.api.use(c);
    a.api.setPage('spells');
    const before = JSON.stringify(c);
    const edits = a.api.state.backupHistory.changesSinceExport;
    const names = () =>
      [...a.w.document.querySelectorAll('.spell-record-summary strong')].map(
        (el) => el.textContent,
      );
    const filter = (key, value) =>
      a.input(`[data-spell-filter="${key}"]`, value);
    const search = a.$('[data-spell-filter="name"]');
    search.focus();
    filter('name', '  DETECT ');
    assert.equal(a.w.document.activeElement, search);
    assert.deepEqual(names(), ['Detect magic', 'Detect thoughts']);
    filter('school', 'divination');
    filter('prepared', 'yes');
    filter('concentration', 'yes');
    filter('ritual', 'yes');
    filter('level', '1');
    assert.deepEqual(names(), ['Detect magic']);
    assert.equal(a.$('.spell-record-summary').dataset.index, '1');
    assert.equal(JSON.stringify(c), before);
    assert.equal(a.api.state.backupHistory.changesSinceExport, edits);
    a.click('.spell-record-summary');
    a.input('[data-field="spells.1.name"]', 'Detect arcana');
    a.click('[data-action="finish-spell"]');
    assert.match(a.$('#spell-results').textContent, /Detect arcana/);
    filter('ritual', 'no');
    assert.match(a.$('#spell-results').textContent, /No matching spells/);
    a.click('[data-action="add-spell"]');
    assert.ok(a.$('[data-spell-editor="4"]'));
    a.input('[data-field="spells.4.name"]', 'New spell');
    a.click('[data-action="finish-spell"]');
    a.click('[data-action="clear-spell-filters"]');
    assert.equal(names().length, 5);
    filter('level', '0');
    assert.deepEqual(names(), ['Fire bolt', 'New spell']);
    filter('prepared', 'no');
    filter('concentration', 'no');
    filter('ritual', 'no');
    assert.deepEqual(names(), ['Fire bolt', 'New spell']);
    a.api.setPage('combat');
    a.api.setPage('spells');
    assert.equal(a.$('[data-spell-filter="level"]').value, '0');
    a.api.use(a.api.blank('Other character'));
    assert.equal(a.$('[data-spell-filter="level"]').value, '');
  } finally {
    a.close();
  }
});

test('spell flags migrate old text, preserve explicit choices in backups, and persist after reload', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Legacy spell');
    c.spells = [
      {
        name: 'Legacy ritual',
        level: 1,
        school: 'Divination',
        prepared: true,
        time: '1 action (ritual)',
        duration: 'Concentration, up to 1 minute',
        range: '',
        components: '',
        description: '',
      },
    ];
    const backup = () => ({ format: 'statfolio', version: 1, characters: [c] });
    let clean = a.api.validateBackup(backup())[0];
    assert.equal(clean.spells[0].ritual, true);
    assert.equal(clean.spells[0].concentration, true);
    c.spells[0].ritual = 'yes';
    assert.throws(() => a.api.validateBackup(backup()), /Invalid spell flag/);
    delete c.spells[0].ritual;
    a.api.use(clean);
    a.api.setPage('spells');
    a.click('.spell-record-summary');
    assert.equal(a.$('[data-field="spells.0.concentration"]').checked, true);
    a.input('[data-field="spells.0.concentration"]', false);
    a.input('[data-field="spells.0.ritual"]', false);
    a.click('[data-action="finish-spell"]');
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.spells[0].concentration, false);
    assert.equal(reopened.api.current.spells[0].ritual, false);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('concentration tracks one spell across pages and queues saves for each damage source including temporary HP', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Concentrating');
    c.hp = c.maxHp = 100;
    c.tempHp = 30;
    c.abilities[2] = 16;
    c.saves = [2];
    c.spells = ['Bless', 'Fly'].map((name) => ({
      name,
      level: 1,
      school: '',
      time: '',
      range: '',
      components: '',
      duration: '',
      description: '',
      prepared: true,
      concentration: true,
      ritual: false,
    }));
    a.api.use(c);
    a.api.setPage('spells');
    a.input('#concentration-spell', '0');
    assert.equal(c.concentrationSpell, 'Bless');
    assert.match(a.$('.concentration-heading').textContent, /Bless/);
    a.api.setPage('combat');
    a.input('#hp-amount', '9');
    a.click('[data-action="damage"]');
    assert.equal(c.hp, 100);
    assert.equal(c.tempHp, 21);
    assert.match(a.$('.concentration-reminder').textContent, /DC 10/);
    assert.match(a.$('.concentration-reminder').textContent, /Save bonus \+5/);
    a.input('#hp-amount', '31');
    a.click('[data-action="damage"]');
    assert.deepEqual(Array.from(c.concentrationDamage), [9, 31]);
    assert.match(a.$('.concentration-reminder').textContent, /2 saves pending/);
    a.input('#hp-amount', '3');
    a.click('[data-action="heal"]');
    assert.equal(c.concentrationDamage.length, 2);
    a.click('[data-action="concentration-pass"]');
    assert.match(a.$('.concentration-reminder').textContent, /DC 15/);
    assert.equal(c.concentrationSpell, 'Bless');
    a.api.setPage('overview');
    assert.match(a.$('.concentration-reminder').textContent, /DC 15/);
    a.click('[data-action="concentration-pass"]');
    assert.equal(a.$('.concentration-reminder'), null);
    assert.equal(c.concentrationSpell, 'Bless');
    a.input('#concentration-spell', '1');
    assert.equal(c.concentrationSpell, 'Fly');
    a.input('#hp-amount', '22');
    a.click('[data-action="damage"]');
    a.click('[data-action="concentration-fail"]');
    assert.equal(c.concentrationSpell, '');
    assert.equal(c.concentrationDamage.length, 0);
    assert.equal(a.$('.concentration-reminder'), null);
    a.input('#concentration-spell', '0');
    a.click('[data-action="end-concentration"]');
    assert.equal(c.concentrationSpell, '');
  } finally {
    a.close();
  }
});

test('concentration ends on zero HP and rest, and invalid damage never creates a save', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Concentration ends');
    c.spells = [
      {
        name: 'Ward',
        level: 1,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        prepared: true,
        concentration: true,
        ritual: false,
      },
    ];
    a.api.use(c);
    a.input('#concentration-spell', '0');
    for (const amount of ['0', '-1', 'bad', '1.5']) {
      a.input('#hp-amount', amount);
      a.click('[data-action="damage"]');
      assert.equal(c.concentrationDamage.length, 0);
    }
    a.input('#hp-amount', '10');
    a.click('[data-action="damage"]');
    assert.equal(c.hp, 0);
    assert.equal(c.concentrationSpell, '');
    assert.equal(a.$('.concentration-reminder'), null);
    a.input('#concentration-spell', '0');
    assert.equal(c.concentrationSpell, '');
    a.input('#hp-amount', '10');
    a.click('[data-action="heal"]');
    a.input('#concentration-spell', '0');
    a.api.setPage('combat');
    a.input('#hp-amount', '1');
    a.click('[data-action="damage"]');
    a.api.setPage('overview');
    a.click('[data-action="rest"]');
    await a.submit();
    assert.equal(c.concentrationSpell, '');
    assert.equal(c.concentrationDamage.length, 0);
  } finally {
    a.close();
  }
});

test('concentration and pending saves persist, survive backups, and stay with each character', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Saved concentration');
    c.concentrationSpell = '<Ward>';
    c.concentrationDamage = [23, 5];
    a.api.use(c);
    assert.equal(a.$('.concentration-heading strong').textContent, '<Ward>');
    assert.equal(a.$('.concentration-heading ward'), null);
    const backup = (character) => ({
      format: 'statfolio',
      version: 1,
      characters: [character],
    });
    const clean = a.api.validateBackup(backup(c))[0];
    assert.equal(clean.concentrationSpell, '<Ward>');
    assert.deepEqual(Array.from(clean.concentrationDamage), [23, 5]);
    const legacy = structuredClone(c);
    delete legacy.concentrationSpell;
    delete legacy.concentrationDamage;
    assert.equal(
      a.api.validateBackup(backup(legacy))[0].concentrationSpell,
      '',
    );
    for (const value of [[0], [-2], ['10'], [1.5]]) {
      assert.throws(
        () =>
          a.api.validateBackup(backup({ ...c, concentrationDamage: value })),
        /Invalid concentration damage/,
      );
    }
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.concentrationSpell, '<Ward>');
    assert.match(reopened.$('.concentration-reminder').textContent, /DC 11/);
    a.api.use(a.api.blank('Other'));
    assert.equal(a.$('.concentration-reminder'), null);
    assert.equal(c.concentrationDamage.length, 2);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('bundled spell reference has complete unique entries and SRD spell flags', () => {
  const reference = JSON.parse(
    fs.readFileSync('assets/reference/spells.json', 'utf8'),
  );
  assert.equal(reference.length, 319);
  assert.equal(
    new Set(reference.map((spell) => spell.id)).size,
    reference.length,
  );
  for (const spell of reference) {
    assert.ok(
      Number.isInteger(spell.level) && spell.level >= 0 && spell.level <= 9,
    );
    for (const field of [
      'id',
      'name',
      'school',
      'time',
      'range',
      'components',
      'duration',
      'description',
    ])
      assert.equal(typeof spell[field], 'string');
    assert.equal(typeof spell.concentration, 'boolean');
    assert.equal(typeof spell.ritual, 'boolean');
    assert.ok(spell.description.length > 0);
  }
  const detect = reference.find((spell) => spell.id === 'detect-magic');
  assert.equal(detect.concentration, true);
  assert.equal(detect.ritual, true);
  const fireball = reference.find((spell) => spell.id === 'fireball');
  assert.match(fireball.components, /bat guano/);
  assert.match(fireball.description, /At higher levels/);
});

test('spell reference searches, previews, and imports editable independent copies with every spell detail', async () => {
  const a = await app();
  let reopened;
  try {
    const reference = JSON.parse(
      fs.readFileSync('assets/reference/spells.json', 'utf8'),
    );
    const requests = [];
    a.w.fetch = async (url) => {
      requests.push(String(url));
      return { ok: true, json: async () => structuredClone(reference) };
    };
    const c = a.api.blank('Import spells');
    a.api.use(c);
    a.api.setPage('spells');
    a.click('[data-action="import-spell"]');
    await settle();
    assert.deepEqual(requests, [
      'https://example.test/Statfolio-5e/assets/reference/spells.json',
    ]);
    assert.equal(a.$('#modal').open, true);
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    assert.equal(a.$('#spell-reference-search'), a.w.document.activeElement);
    a.input('#spell-reference-search', '  FIREBALL ');
    assert.equal(
      a.w.document.querySelectorAll('.spell-reference-choice').length,
      2,
    );
    a.input('#spell-reference-level', 0);
    assert.match(
      a.$('#spell-reference-results').textContent,
      /No matching spells/,
    );
    a.input('#spell-reference-level', 3);
    a.click('[data-reference-id="fireball"]');
    assert.match(a.$('#spell-reference-preview').textContent, /8d6/);
    assert.match(a.$('#spell-reference-preview').textContent, /bat guano/);
    assert.match(
      a.$('#spell-reference-preview').textContent,
      /At higher levels/,
    );
    assert.equal(c.spells.length, 0);
    assert.equal(a.$('#modal button[type="submit"]').disabled, false);
    a.$('#spell-reference-search').dispatchEvent(
      new a.w.KeyboardEvent('keydown', {
        key: 'Enter',
        bubbles: true,
        cancelable: true,
      }),
    );
    assert.equal(c.spells.length, 0);
    await a.submit();
    const { id, ...expected } = reference.find(
      (spell) => spell.id === 'fireball',
    );
    assert.deepEqual(JSON.parse(JSON.stringify(c.spells[0])), {
      ...expected,
      actionType: 'Action',
      prepared: false,
    });
    assert.equal(a.$('[data-spell-editor]'), null);
    assert.match(a.$('.spell-record-summary').textContent, /Fireball/);
    a.click('.spell-record-summary');
    assert.equal(a.$('[data-field="spells.0.name"]').value, 'Fireball');
    a.input('[data-field="spells.0.name"]', 'Custom fireball');
    a.click('[data-action="finish-spell"]');
    a.click('[data-action="import-spell"]');
    await settle();
    a.input('#spell-reference-search', 'detect magic');
    a.click('[data-reference-id="detect-magic"]');
    await a.submit();
    assert.equal(a.$('[data-spell-editor]'), null);
    assert.equal(
      a.w.document.querySelectorAll('.spell-record-summary').length,
      2,
    );
    assert.equal(c.spells[1].concentration, true);
    assert.equal(c.spells[1].ritual, true);
    assert.equal(c.spells[0].name, 'Custom fireball');
    assert.equal(requests.length, 1);
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(
      reopened.api.current.spells[0].description,
      expected.description,
    );
    assert.equal(reopened.api.current.spells[1].concentration, true);
    assert.equal(reopened.api.current.spells[1].ritual, true);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('spell reference cancellation and failed loads preserve character data and allow retry', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Safe import');
    a.api.use(c);
    a.api.setPage('spells');
    const before = JSON.stringify(c);
    let requests = 0;
    a.w.fetch = async () => {
      requests++;
      if (requests === 1) return { ok: false };
      return {
        ok: true,
        json: async () =>
          JSON.parse(fs.readFileSync('assets/reference/spells.json', 'utf8')),
      };
    };
    a.click('[data-action="import-spell"]');
    await settle();
    assert.equal(a.$('[data-action="import-spell"]').disabled, false);
    assert.equal(a.$('#modal').open, false);
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="import-spell"]');
    await settle();
    assert.equal(requests, 2);
    a.click('[data-reference-id="fireball"]');
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="import-spell"]');
    await settle();
    assert.equal(requests, 2);
    assert.equal(a.$('#spell-reference-id').value, '');
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
  } finally {
    a.close();
  }
});

test('action types edit, display, infer spell timing, and persist with backup validation', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Action economy');
    a.api.use(c);
    a.api.setPage('combat');
    a.click('[data-action="add-attack"]');
    a.input('[data-field="attacks.0.name"]', 'Quick strike');
    a.input('[data-field="attacks.0.actionType"]', 'Bonus action');
    a.click('[data-action="finish-attack"]');
    assert.match(a.$('.attack-summary').textContent, /Bonus action/);
    a.click('.attack-summary');
    assert.equal(
      a.$('[data-field="attacks.0.actionType"]').value,
      'Bonus action',
    );
    a.api.setPage('spells');
    a.click('[data-action="add-spell"]');
    a.input('[data-field="spells.0.name"]', 'Quick spell');
    for (const [time, type] of [
      ['1 bonus action', 'Bonus action'],
      ['1 reaction, when attacked', 'Reaction'],
      ['1 action', 'Action'],
      ['10 minutes', 'Other'],
    ]) {
      a.input('[data-field="spells.0.time"]', time);
      assert.equal(a.$('[data-field="spells.0.actionType"]').value, type);
      assert.equal(c.spells[0].actionType, type);
    }
    a.input('[data-field="spells.0.actionType"]', 'Reaction');
    a.click('[data-action="finish-spell"]');
    assert.match(a.$('.spell-record-summary').textContent, /Reaction/);
    assert.match(a.$('.spell-record-summary').textContent, /10 minutes/);
    const backup = () => ({ format: 'statfolio', version: 1, characters: [c] });
    let restored = a.api.validateBackup(backup())[0];
    assert.equal(restored.attacks[0].actionType, 'Bonus action');
    assert.equal(restored.spells[0].actionType, 'Reaction');
    c.spells[0].actionType = 'invalid';
    assert.throws(() => a.api.validateBackup(backup()), /Invalid action type/);
    c.spells[0].actionType = 'Reaction';
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.attacks[0].actionType, 'Bonus action');
    assert.equal(reopened.api.current.spells[0].actionType, 'Reaction');
    // Older backups infer their selector and summary from the original casting time.
    delete c.spells[0].actionType;
    c.spells[0].time = '1 bonus action';
    a.api.setPage('combat');
    a.api.setPage('spells');
    a.click('.spell-record-summary');
    assert.equal(
      a.$('[data-field="spells.0.actionType"]').value,
      'Bonus action',
    );
  } finally {
    reopened?.close();
    a.close();
  }
});

test('combat shows compact known spells below attacks, ignores spellbook filters, and opens the original spell for editing', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Combat spells');
    a.api.use(c);
    a.api.setPage('combat');
    assert.equal(a.$('.combat-spells'), null);
    c.spells = [
      {
        name: 'Fire Bolt',
        level: 0,
        school: 'Evocation',
        time: '1 action',
        actionType: 'Action',
        range: '120 feet',
        components: 'V, S',
        duration: 'Instantaneous',
        description: 'Full bolt description',
        prepared: false,
        concentration: false,
        ritual: false,
      },
      {
        name: 'Ward <test>',
        level: 1,
        school: 'Abjuration',
        time: '1 bonus action',
        actionType: 'Bonus action',
        range: 'Self',
        components: 'V',
        duration: '1 minute',
        description: 'Full ward description <script>',
        prepared: true,
        concentration: true,
        ritual: true,
      },
    ];
    c.spells.reverse();
    const storedOrder = c.spells.map((spell) => spell.name);
    a.api.setPage('spells');
    a.input('[data-spell-filter="name"]', 'Fire Bolt');
    a.api.setPage('combat');
    const list = a.$('.combat-spells');
    assert.ok(list);
    const panel = list.closest('.panel');
    assert.equal(panel.querySelector('h2').textContent, 'Spells Known');
    assert.equal(
      panel.previousElementSibling.querySelector('h2').textContent,
      'Attacks & Actions',
    );
    assert.equal(list.querySelectorAll('.attack-summary').length, 2);
    assert.deepEqual(
      [...list.querySelectorAll('.attack-summary-heading strong')].map(
        (el) => el.textContent,
      ),
      ['Fire Bolt', 'Ward <test>'],
    );
    assert.deepEqual(
      c.spells.map((spell) => spell.name),
      storedOrder,
    );
    assert.match(list.textContent, /Fire Bolt/);
    assert.match(list.textContent, /Ward <test>/);
    assert.match(list.textContent, /Bonus action/);
    assert.match(list.textContent, /Prepared · Concentration · Ritual/);
    assert.match(
      list.querySelector(
        '[data-index="0"] .attack-summary-heading .spell-record-meta',
      ).textContent,
      /Level 1/,
    );
    assert.equal(
      list.querySelector('[data-index="0"] .attack-summary-notes').textContent,
      'Full ward description <script>',
    );
    assert.equal(list.querySelector('test'), null);
    const ward = list.querySelector('[data-index="0"]');
    ward.dispatchEvent(new a.w.Event('pointerover', { bubbles: true }));
    assert.equal(
      a.$('.spell-popup-description').textContent,
      'Full ward description <script>',
    );
    assert.equal(a.$('.spell-popup-description script'), null);
    a.click('.combat-spells [data-index="0"]');
    assert.ok(a.$('[data-spell-editor="0"]'));
    assert.equal(a.$('[data-field="spells.0.name"]').value, 'Ward <test>');
    a.input('[data-field="spells.0.name"]', 'Updated ward');
    a.click('[data-action="finish-spell"]');
    a.api.setPage('combat');
    assert.match(a.$('.combat-spells').textContent, /Updated ward/);
    c.spells = [];
    a.api.setPage('combat');
    assert.equal(a.$('.combat-spells'), null);
  } finally {
    a.close();
  }
});

test('concentrate buttons work from both spell lists without opening editors or clearing active saves', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Concentrate buttons');
    const spell = (name, level, concentration) => ({
      name,
      level,
      concentration,
      ritual: false,
      prepared: true,
      school: '',
      time: '1 action',
      range: '',
      components: '',
      duration: '',
      description: '',
    });
    c.spells = [
      spell('Higher ward', 3, true),
      spell('Bolt', 0, false),
      spell('Lower ward', 1, true),
    ];
    a.api.use(c);
    a.api.setPage('combat');
    assert.equal(
      a.w.document.querySelectorAll('[data-action="start-concentration"]')
        .length,
      2,
    );
    assert.equal(
      a.$('.combat-spells [data-index="1"][data-action="start-concentration"]'),
      null,
    );
    a.click(
      '.combat-spells [data-index="2"][data-action="start-concentration"]',
    );
    assert.equal(c.concentrationSpell, 'Lower ward');
    assert.ok(a.$('.combat-spells'));
    assert.equal(a.$('[data-spell-editor]'), null);
    assert.equal(
      a.$('[data-action="start-concentration"][data-index="2"]').textContent,
      'Concentrating',
    );
    assert.equal(
      a.$('[data-action="start-concentration"][data-index="2"]').disabled,
      true,
    );
    c.concentrationDamage = [25];
    a.api.setPage('spells');
    a.click('[data-action="start-concentration"][data-index="2"]');
    assert.deepEqual(Array.from(c.concentrationDamage), [25]);
    a.input('#concentration-spell', '2');
    assert.deepEqual(Array.from(c.concentrationDamage), [25]);
    a.click('[data-action="start-concentration"][data-index="0"]');
    assert.equal(c.concentrationSpell, 'Higher ward');
    assert.equal(c.concentrationDamage.length, 0);
    assert.equal(a.$('[data-spell-editor]'), null);
    a.click('[data-action="end-concentration"]');
    assert.equal(
      a.$('[data-action="start-concentration"][data-index="0"]').disabled,
      false,
    );
    c.hp = 0;
    a.click('[data-action="start-concentration"][data-index="0"]');
    assert.equal(c.concentrationSpell, '');
  } finally {
    a.close();
  }
});

test('combat log opens without edits, records actual health changes, and undoes newest first including concentration and death saves', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Combat history');
    c.tempHp = 5;
    c.concentrationSpell = 'Ward';
    a.api.use(c);
    a.api.setPage('combat');
    const initial = JSON.stringify(c);
    a.click('[data-action="combat-log"]');
    assert.equal(a.$('#modal').open, true);
    assert.match(a.$('.combat-log').textContent, /No combat activity/);
    assert.equal(JSON.stringify(c), initial);
    a.click('[data-action="close-modal"]');
    a.input('#hp-amount', '3');
    a.click('[data-action="damage"]');
    assert.equal(c.combatLog.length, 1);
    assert.equal(c.hp, 10);
    assert.equal(c.tempHp, 2);
    a.input('#hp-amount', '12');
    a.click('[data-action="damage"]');
    assert.equal(c.hp, 0);
    assert.equal(c.concentrationSpell, '');
    a.input('#hp-amount', '100');
    a.click('[data-action="heal"]');
    assert.equal(c.combatLog.length, 3);
    assert.equal(c.hp, 10);
    a.input('#hp-amount', '100');
    a.click('[data-action="heal"]');
    a.input('#hp-amount', '-3');
    a.click('[data-action="damage"]');
    assert.equal(c.combatLog.length, 3);
    a.click('[data-action="combat-log"]');
    const undo = () =>
      a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(
      a.w.document.querySelectorAll(
        '.combat-log [data-action="undo-combat-event"]:not(:disabled)',
      ).length,
      1,
    );
    assert.match(a.$('.combat-log-entry').textContent, /Healing: 100/);
    undo();
    assert.equal(c.hp, 0);
    assert.equal(a.$('#modal').open, true);
    undo();
    assert.equal(c.hp, 10);
    assert.equal(c.tempHp, 2);
    assert.equal(c.concentrationSpell, 'Ward');
    assert.deepEqual(Array.from(c.concentrationDamage), [3]);
    undo();
    assert.equal(c.tempHp, 5);
    assert.equal(c.concentrationDamage.length, 0);
    assert.equal(
      a.w.document.querySelectorAll('.combat-log-entry.is-undone').length,
      3,
    );
    assert.equal(a.$('.combat-log [data-action="undo-combat-event"]'), null);
    a.click('[data-action="close-modal"]');
    c.hp = 0;
    c.deathSuccess = 1;
    c.deathFailure = 2;
    a.input('#hp-amount', '4');
    a.click('[data-action="heal"]');
    assert.equal(c.deathFailure, 0);
    a.click('[data-action="combat-log"]');
    undo();
    assert.equal(c.hp, 0);
    assert.equal(c.deathSuccess, 1);
    assert.equal(c.deathFailure, 2);
  } finally {
    a.close();
  }
});

test('combat resource history groups typing, follows resource identity, and includes slots, hit dice, and rest', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Resource history');
    c.resources = [
      { name: 'Ki <points>', remaining: 12, max: 12 },
      { name: 'Other', remaining: 2, max: 2 },
    ];
    c.hitDiceLeft = 3;
    c.slots[0] = 3;
    a.api.use(c);
    a.api.setPage('combat');
    a.input('[data-field="resources.0.remaining"]', 1, false);
    a.input('[data-field="resources.0.remaining"]', 10, false);
    assert.equal(c.combatLog.length, 0);
    a.$('[data-field="resources.0.remaining"]').dispatchEvent(
      new a.w.Event('change', { bubbles: true }),
    );
    assert.equal(c.combatLog.length, 1);
    assert.equal(c.combatLog[0].label, 'Ki <points>: spent 2');
    const id = c.resources[0].id;
    c.resources.reverse();
    a.click('[data-action="combat-log"]');
    assert.equal(a.$('.combat-log points'), null);
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(
      c.resources.find((resource) => resource.id === id).remaining,
      12,
    );
    assert.equal(c.resources[0].remaining, 2);
    a.click('[data-action="close-modal"]');
    a.input('[data-field="hitDiceLeft"]', 2);
    a.api.setPage('spells');
    a.input('[data-field="usedSlots.0"]', 1);
    assert.match(c.combatLog[0].label, /spell slots: spent 1/);
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.usedSlots[0], 0);
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.hitDiceLeft, 3);
    a.click('[data-action="close-modal"]');
    a.api.setPage('combat');
    a.input('#hp-amount', 4);
    a.click('[data-action="damage"]');
    a.api.setPage('spells');
    a.input('[data-field="usedSlots.0"]', 2);
    a.api.setPage('combat');
    a.api.setPage('overview');
    a.click('[data-action="rest"]');
    await a.submit();
    assert.equal(c.combatLog[0].label, 'Long Rest');
    assert.equal(c.hp, 10);
    assert.equal(c.usedSlots[0], 0);
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.hp, 6);
    assert.equal(c.usedSlots[0], 2);
  } finally {
    a.close();
  }
});

test('combat history blocks undo over later manual edits, reduced maximum HP, or deleted resources', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Safe undo');
    a.api.use(c);
    a.input('#hp-amount', 4);
    a.click('[data-action="damage"]');
    a.input('[data-field="maxHp"]', 8);
    await settle();
    a.click('[data-action="combat-log"]');
    let undo = a.$('.combat-log [data-action="undo-combat-event"]');
    assert.equal(undo.disabled, true);
    assert.match(undo.title, /current maximum/);
    a.click('[data-action="close-modal"]');
    c.maxHp = 10;
    c.hp = 5;
    a.click('[data-action="combat-log"]');
    undo = a.$('.combat-log [data-action="undo-combat-event"]');
    assert.equal(undo.disabled, true);
    assert.match(undo.title, /Values have changed/);
    a.click('[data-action="close-modal"]');
    c.resources = [{ name: 'Charge', remaining: 3, max: 3 }];
    a.api.setPage('combat');
    a.input('[data-field="resources.0.remaining"]', 2);
    c.resources = [];
    a.click('[data-action="combat-log"]');
    assert.equal(
      a.$('.combat-log [data-action="undo-combat-event"]').disabled,
      true,
    );
  } finally {
    a.close();
  }
});

test('combat history survives save and backup restore with strict change validation and independent characters', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Persistent log');
    c.resources = [{ name: 'Charges', remaining: 3, max: 3 }];
    a.api.use(c);
    a.api.setPage('combat');
    a.input('[data-field="resources.0.remaining"]', 2);
    a.input('#hp-amount', 1);
    a.click('[data-action="damage"]');
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.combatLog.length, 2);
    reopened.click('[data-action="combat-log"]');
    reopened.click(
      '.combat-log [data-action="undo-combat-event"]:not(:disabled)',
    );
    assert.equal(reopened.api.current.hp, 10);
    reopened.click(
      '.combat-log [data-action="undo-combat-event"]:not(:disabled)',
    );
    assert.equal(reopened.api.current.resources[0].remaining, 3);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    assert.equal(backup.characters[0].combatLog.length, 2);
    const clean = a.api.validateBackup(backup)[0];
    assert.equal(clean.resources[0].id, c.resources[0].id);
    const bad = structuredClone(backup);
    bad.characters[0].combatLog[0].changes[0].target = '__proto__.polluted';
    assert.throws(() => a.api.validateBackup(bad), /Invalid combat log change/);
    bad.characters[0].combatLog[0].changes[0] = {
      target: 'hp',
      before: -1,
      after: 2,
    };
    assert.throws(() => a.api.validateBackup(bad), /Invalid combat log change/);
    const legacy = structuredClone(c);
    delete legacy.combatLog;
    assert.equal(
      a.api.validateBackup({
        format: 'statfolio',
        version: 1,
        characters: [legacy],
      })[0].combatLog.length,
      0,
    );
    a.api.use(a.api.blank('Other character'));
    a.click('[data-action="combat-log"]');
    assert.match(a.$('.combat-log').textContent, /No combat activity/);
    assert.equal(c.combatLog.length, 2);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('combat log retains only the latest 100 changes and validates its entry limit', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Bounded history');
    c.maxHp = c.hp = 200;
    a.api.use(c);
    for (let index = 0; index < 101; index++) {
      a.input('#hp-amount', 1);
      a.click('[data-action="damage"]');
    }
    assert.equal(c.hp, 99);
    assert.equal(c.combatLog.length, 100);
    assert.equal(
      c.combatLog.at(-1).changes.find((change) => change.target === 'hp')
        .before,
      199,
    );
    const backup = {
      format: 'statfolio',
      version: 1,
      characters: [structuredClone(c)],
    };
    backup.characters[0].combatLog.push({
      ...backup.characters[0].combatLog[0],
      id: 'extra',
    });
    assert.throws(() => a.api.validateBackup(backup), /Invalid combat log/);
  } finally {
    a.close();
  }
});

test('character actions open compact popups and short rest previews healing and eligible resources without changing combat state on cancel', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Rest actions');
    c.level = 5;
    c.hp = 7;
    c.maxHp = 30;
    c.tempHp = 5;
    c.hitDice = '5d8';
    c.hitDiceLeft = 4;
    c.usedSlots[0] = 2;
    c.concentrationSpell = 'Ward';
    c.resources = [
      { name: 'Ki', remaining: 0, max: 3, recovery: 'short' },
      { name: 'Daily', remaining: 0, max: 2, recovery: 'long' },
      { name: 'Manual', remaining: 0, max: 1 },
    ];
    a.api.use(c);
    assert.equal(a.$('.character-action-grid').children.length, 3);
    assert.equal(
      a
        .$('.character-action-grid')
        .closest('.panel')
        .previousElementSibling.querySelector('h2').textContent,
      'Character Details',
    );
    assert.equal(
      a.$('.character-action-grid [data-action="sheet-options"]'),
      null,
    );
    const before = JSON.stringify(c);
    a.click('[data-action="short-rest"]');
    a.input('[name="dice"]', 2);
    a.input('[name="healing"]', 99);
    assert.match(a.$('#rest-preview').textContent, /HP: 7 → 30/);
    assert.match(a.$('#rest-preview').textContent, /Hit dice remaining: 4 → 2/);
    assert.match(a.$('#rest-preview').textContent, /Ki: 0 → 3/);
    assert.doesNotMatch(a.$('#rest-preview').textContent, /Daily/);
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="short-rest"]');
    await a.submit({ dice: 2, healing: 12 });
    assert.equal(c.hp, 19);
    assert.equal(c.hitDiceLeft, 2);
    assert.equal(c.tempHp, 5);
    assert.equal(c.usedSlots[0], 2);
    assert.equal(c.concentrationSpell, 'Ward');
    assert.deepEqual(
      c.resources.map((resource) => resource.remaining),
      [3, 0, 0],
    );
    assert.ok(c.lastShortRest);
    assert.equal(a.$('.rest-history'), null);
    assert.equal(c.combatLog[0].label, 'Short Rest');
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.hp, 7);
    assert.equal(c.hitDiceLeft, 4);
    assert.equal(c.resources[0].remaining, 0);
    assert.equal(c.lastShortRest, '');
    a.click('[data-action="close-modal"]');
    a.api.setPage('combat');
    assert.equal(a.$('[data-action="rest"]'), null);
  } finally {
    a.close();
  }
});

test('long rest previews half-level hit dice, resource resets, optional exhaustion, and supports full undo and persistence', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Long recovery');
    c.level = 5;
    c.hp = 7;
    c.maxHp = 30;
    c.tempHp = 2;
    c.hitDiceLeft = 1;
    c.usedSlots[0] = 1;
    c.exhaustionLevel = 2;
    c.deathFailure = 1;
    c.concentrationSpell = 'Ward';
    c.resources = [
      { name: 'Short', remaining: 0, max: 3, recovery: 'short' },
      { name: 'Long', remaining: 1, max: 4, recovery: 'long' },
      { name: 'Manual', remaining: 0, max: 2 },
    ];
    a.api.use(c);
    const before = JSON.stringify(c);
    a.click('[data-action="rest"]');
    assert.equal(a.$('[name="dice"]').value, '2');
    assert.equal(a.$('[name="reduce-exhaustion"]').checked, false);
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="rest"]');
    a.input('[name="reduce-exhaustion"]', true);
    assert.match(a.$('#rest-preview').textContent, /Exhaustion: 2 → 1/);
    await a.submit();
    assert.equal(c.hp, 30);
    assert.equal(c.tempHp, 0);
    assert.equal(c.hitDiceLeft, 3);
    assert.equal(c.usedSlots[0], 0);
    assert.equal(c.deathFailure, 0);
    assert.equal(c.concentrationSpell, '');
    assert.equal(c.exhaustionLevel, 1);
    assert.deepEqual(
      c.resources.map((resource) => resource.remaining),
      [3, 4, 0],
    );
    assert.ok(c.lastLongRest);
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.lastLongRest, c.lastLongRest);
    assert.equal(reopened.api.current.resources[0].recovery, 'short');
    assert.equal(reopened.api.current.resources[1].recovery, 'long');
    reopened.click('[data-action="combat-log"]');
    reopened.click(
      '.combat-log [data-action="undo-combat-event"]:not(:disabled)',
    );
    const restored = reopened.api.current;
    assert.equal(restored.hp, 7);
    assert.equal(restored.tempHp, 2);
    assert.equal(restored.hitDiceLeft, 1);
    assert.equal(restored.usedSlots[0], 1);
    assert.equal(restored.exhaustionLevel, 2);
    assert.equal(restored.deathFailure, 1);
    assert.equal(restored.concentrationSpell, 'Ward');
    assert.equal(restored.lastLongRest, '');
    assert.deepEqual(
      Array.from(restored.resources, (resource) => resource.remaining),
      [0, 1, 0],
    );
  } finally {
    reopened?.close();
    a.close();
  }
});

test('rest inputs reject invalid spending and old resources default to manual recovery', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Valid rest');
    c.resources = [{ name: 'Legacy', remaining: 0, max: 3 }];
    a.api.use(c);
    const before = JSON.stringify(c);
    a.click('[data-action="short-rest"]');
    for (const values of [
      { dice: 0, healing: 3 },
      { dice: 2, healing: 3 },
      { dice: 0.5, healing: 3 },
      { dice: 1, healing: -1 },
    ]) {
      await a.submit(values);
      assert.equal(a.$('#modal').open, true);
      assert.equal(JSON.stringify(c), before);
    }
    a.click('[data-action="close-modal"]');
    a.api.setPage('combat');
    assert.equal(a.$('[data-field="resources.0.recovery"]').value, 'manual');
    a.input('[data-field="resources.0.recovery"]', 'long');
    assert.equal(c.resources[0].recovery, 'long');
    c.resources[0].recovery = 'invalid';
    assert.throws(
      () =>
        a.api.validateBackup({
          format: 'statfolio',
          version: 1,
          characters: [c],
        }),
      /Invalid resource recovery/,
    );
  } finally {
    a.close();
  }
});

test('bundled equipment reference preserves descriptions and stats with per-item ammunition and calculated pack weights', () => {
  const reference = JSON.parse(
    fs.readFileSync('assets/reference/equipment.json', 'utf8'),
  );
  assert.equal(reference.length, 237);
  assert.equal(
    new Set(reference.map((item) => item.id)).size,
    reference.length,
  );
  for (const item of reference) {
    for (const key of ['id', 'name', 'category', 'cost', 'notes'])
      assert.equal(typeof item[key], 'string');
    assert.ok(Number.isSafeInteger(item.quantity) && item.quantity > 0);
    assert.ok(
      item.weight === null ||
        (Number.isFinite(item.weight) && item.weight >= 0),
    );
  }
  const find = (id) => reference.find((item) => item.id === id);
  assert.equal(find('longsword').weight, 3);
  assert.match(find('longsword').notes, /Damage: 1d8 slashing/);
  assert.match(find('longsword').notes, /Two-handed damage: 1d10/);
  assert.match(find('chain-mail').notes, /Armor class: 16/);
  assert.match(find('shield').notes, /Armor class bonus: \+2/);
  assert.match(find('rope-hempen-50-feet').notes, /DC 17 Strength/);
  assert.equal(find('arrow').quantity, 20);
  assert.equal(find('arrow').weight, 0.05);
  assert.equal(find('sling-bullet').weight, 0.075);
  assert.equal(find('explorers-pack').weight, 59);
  assert.match(find('explorers-pack').notes, /Contents:/);
  assert.match(find('explorers-pack').notes, /Weight calculated/);
  assert.equal(find('horse-riding').weight, null);
  assert.match(find('horse-riding').notes, /Weight not listed/);
});

test('equipment reference searches, filters, previews, and imports editable items with correct quantity and weight', async () => {
  const a = await app();
  let reopened;
  try {
    const reference = JSON.parse(
      fs.readFileSync('assets/reference/equipment.json', 'utf8'),
    );
    const requests = [];
    a.w.fetch = async (url) => {
      requests.push(String(url));
      return { ok: true, json: async () => structuredClone(reference) };
    };
    const c = a.api.blank('Equipment import');
    c.coins.gp = 100;
    a.api.use(c);
    a.api.setPage('equipment');
    const before = JSON.stringify(c);
    a.click('[data-action="import-equipment"]');
    await settle();
    assert.deepEqual(requests, [
      'https://example.test/Statfolio-5e/assets/reference/equipment.json',
    ]);
    assert.equal(a.$('#modal').open, true);
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    const search = a.$('#equipment-reference-search');
    assert.equal(a.w.document.activeElement, search);
    a.input('#equipment-reference-search', ' HEMPEN ');
    assert.equal(
      a.w.document.querySelectorAll('.equipment-reference-choice').length,
      1,
    );
    assert.equal(a.w.document.activeElement, search);
    a.input('#equipment-reference-category', 'Armor');
    assert.match(
      a.$('#equipment-reference-results').textContent,
      /No matching equipment/,
    );
    a.input('#equipment-reference-category', '');
    a.click('[data-reference-id="rope-hempen-50-feet"]');
    assert.match(
      a.$('#equipment-reference-preview').textContent,
      /DC 17 Strength/,
    );
    assert.equal(JSON.stringify(c), before);
    const enter = new a.w.KeyboardEvent('keydown', {
      key: 'Enter',
      bubbles: true,
      cancelable: true,
    });
    search.dispatchEvent(enter);
    assert.equal(enter.defaultPrevented, true);
    await a.submit({ quantity: 2 });
    const rope = reference.find((item) => item.id === 'rope-hempen-50-feet');
    assert.deepEqual(JSON.parse(JSON.stringify(c.equipment[0])), {
      name: rope.name,
      quantity: 2,
      weight: 10,
      notes: rope.notes,
      equipped: false,
    });
    assert.equal(c.coins.gp, 100);
    assert.match(a.$('#page-content').textContent, /20.0 lb/);
    a.input('[data-field="equipment.0.name"]', 'My rope');
    a.click('[data-action="import-equipment"]');
    await settle();
    a.input('#equipment-reference-search', 'arrow');
    a.click('[data-reference-id="arrow"]');
    assert.equal(a.$('#equipment-reference-quantity').value, '20');
    await a.submit();
    assert.equal(c.equipment[1].quantity, 20);
    assert.equal(c.equipment[1].weight, 0.05);
    assert.match(a.$('#page-content').textContent, /21.0 lb/);
    assert.equal(requests.length, 1);
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.equipment[0].name, 'My rope');
    assert.equal(reopened.api.current.equipment[0].notes, rope.notes);
    assert.equal(reopened.api.current.equipment[1].weight, 0.05);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    assert.equal(
      a.api.validateBackup(backup)[0].equipment[0].notes,
      rope.notes,
    );
  } finally {
    reopened?.close();
    a.close();
  }
});

test('equipment import cancels safely, retries failed loads, rejects invalid quantities, and marks unknown weights', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Safe equipment');
    a.api.use(c);
    a.api.setPage('equipment');
    let requests = 0;
    a.w.fetch = async () => {
      requests++;
      return requests === 1
        ? { ok: false }
        : {
            ok: true,
            json: async () =>
              JSON.parse(
                fs.readFileSync('assets/reference/equipment.json', 'utf8'),
              ),
          };
    };
    const before = JSON.stringify(c);
    a.click('[data-action="import-equipment"]');
    await settle();
    assert.equal(a.$('[data-action="import-equipment"]').disabled, false);
    assert.equal(a.$('#modal').open, false);
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="import-equipment"]');
    await settle();
    a.click('[data-reference-id="horse-riding"]');
    assert.match(a.$('#equipment-reference-preview').textContent, /Not listed/);
    for (const quantity of [0, -1, 1.5]) {
      await a.submit({ quantity });
      assert.equal(a.$('#modal').open, true);
      assert.equal(JSON.stringify(c), before);
    }
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="import-equipment"]');
    await settle();
    assert.equal(a.$('#equipment-reference-id').value, '');
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    a.click('[data-reference-id="horse-riding"]');
    await a.submit({ quantity: 1 });
    assert.equal(c.equipment[0].weight, 0);
    assert.match(c.equipment[0].notes, /Weight not listed/);
    assert.equal(requests, 2);
  } finally {
    a.close();
  }
});

test('casting picks an available slot at or above spell level and atomically replaces concentration with combat-log undo', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Cast up');
    c.spells = [
      {
        name: 'Ward <new>',
        level: 2,
        school: 'Abjuration',
        time: '1 action',
        range: 'Self',
        components: 'V',
        duration: '1 minute',
        description: 'Ward effect',
        concentration: true,
        ritual: false,
        prepared: true,
      },
    ];
    c.slots = [4, 2, 2, 0, 0, 0, 0, 0, 0];
    c.usedSlots[1] = 2;
    c.concentrationSpell = 'Old ward';
    c.concentrationDamage = [25];
    a.api.use(c);
    a.api.setPage('spells');
    const initial = JSON.stringify(c);
    a.click('[data-action="cast-spell"][data-index="0"]');
    assert.equal(a.$('#cast-slot-level').value, '3');
    assert.equal(a.$('#cast-slot-level option[value="1"]'), null);
    assert.equal(a.$('#cast-slot-level option[value="2"]').disabled, true);
    assert.match(
      a.$('#cast-preview').textContent,
      /Level 3 slots remaining: 2 → 1/,
    );
    assert.match(
      a.$('#cast-preview').textContent,
      /Replace concentration on Old ward/,
    );
    assert.equal(a.$('.cast-popup new'), null);
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), initial);
    a.click('[data-action="cast-spell"][data-index="0"]');
    await a.submit();
    assert.equal(c.usedSlots[2], 1);
    assert.equal(c.usedSlots[1], 2);
    assert.equal(c.concentrationSpell, 'Ward <new>');
    assert.equal(c.concentrationDamage.length, 0);
    assert.equal(c.combatLog.length, 1);
    assert.match(c.combatLog[0].label, /Cast Ward <new> · Level 3/);
    assert.equal(a.$('[data-spell-editor]'), null);
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.usedSlots[2], 1);
    assert.equal(reopened.api.current.concentrationSpell, 'Ward <new>');
    reopened.click('[data-action="combat-log"]');
    reopened.click(
      '.combat-log [data-action="undo-combat-event"]:not(:disabled)',
    );
    assert.equal(reopened.api.current.usedSlots[2], 0);
    assert.equal(reopened.api.current.concentrationSpell, 'Old ward');
    assert.deepEqual(
      Array.from(reopened.api.current.concentrationDamage),
      [25],
    );
  } finally {
    reopened?.close();
    a.close();
  }
});

test('combat casting uses the original sorted spell index and cantrips spend no slot or unrelated concentration', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Combat cast');
    const spell = (name, level, concentration = false) => ({
      name,
      level,
      concentration,
      ritual: false,
      prepared: false,
      school: '',
      time: '1 action',
      range: '',
      components: '',
      duration: '',
      description: '',
    });
    c.spells = [
      spell('Magic missile', 1),
      spell('Fire bolt', 0),
      spell('Guidance', 0, true),
    ];
    c.slots[0] = 2;
    c.concentrationSpell = 'Existing';
    c.concentrationDamage = [8];
    a.api.use(c);
    a.api.setPage('combat');
    a.click('.combat-spells [data-action="cast-spell"][data-index="1"]');
    assert.equal(a.$('#cast-slot-level'), null);
    assert.match(a.$('#cast-preview').textContent, /no spell slot/);
    await a.submit();
    assert.equal(c.usedSlots[0], 0);
    assert.equal(c.concentrationSpell, 'Existing');
    assert.deepEqual(Array.from(c.concentrationDamage), [8]);
    assert.ok(a.$('.combat-spells'));
    a.click('.combat-spells [data-action="cast-spell"][data-index="0"]');
    await a.submit();
    assert.equal(c.usedSlots[0], 1);
    assert.equal(c.concentrationSpell, 'Existing');
    a.click('.combat-spells [data-action="cast-spell"][data-index="2"]');
    await a.submit();
    assert.equal(c.usedSlots[0], 1);
    assert.equal(c.concentrationSpell, 'Guidance');
    assert.equal(c.concentrationDamage.length, 0);
    c.concentrationDamage.push(10);
    a.click('.combat-spells [data-action="cast-spell"][data-index="2"]');
    await a.submit();
    assert.equal(c.concentrationDamage.length, 0);
  } finally {
    a.close();
  }
});

test('casting refuses exhausted, lower, invalid slots and zero HP without changing state', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Valid casting');
    c.spells = [
      {
        name: 'Level two',
        level: 2,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        concentration: true,
        ritual: false,
        prepared: true,
      },
    ];
    c.slots[0] = 2;
    a.api.use(c);
    a.api.setPage('spells');
    a.click('[data-action="cast-spell"]');
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    assert.match(a.$('#cast-preview').textContent, /No available spell slots/);
    const before = JSON.stringify(c);
    await a.submit();
    assert.equal(a.$('#modal').open, true);
    assert.equal(JSON.stringify(c), before);
    a.click('[data-action="close-modal"]');
    c.slots[1] = 1;
    a.click('[data-action="cast-spell"]');
    const validBefore = JSON.stringify(c);
    for (const level of ['1', '9', '1.5', '']) {
      await a.submit({ 'slot-level': level });
      assert.equal(a.$('#modal').open, true);
      assert.equal(JSON.stringify(c), validBefore);
    }
    a.click('[data-action="close-modal"]');
    c.hp = 0;
    a.click('[data-action="cast-spell"]');
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    await a.submit({ 'slot-level': 2 });
    assert.equal(c.usedSlots[1], 0);
    assert.equal(c.concentrationSpell, '');
  } finally {
    a.close();
  }
});

test('attack use limits are optional, show remaining uses only when configured, and survive editing and save', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Action uses');
    a.api.use(c);
    a.api.setPage('combat');
    a.click('[data-action="add-attack"]');
    a.input('[data-field="attacks.0.name"]', 'Second Wind');
    a.click('[data-action="finish-attack"]');
    assert.doesNotMatch(a.$('.attack-summary').textContent, /Uses/);
    a.click('[data-action="use-attack"]');
    const before = JSON.stringify(c);
    assert.equal(a.$('.cast-popup .rest-preview'), null);
    a.click('[data-action="close-modal"]');
    assert.equal(JSON.stringify(c), before);
    a.click('.attack-summary');
    a.input('[data-attack-use-limit="0"]', '2');
    a.input('[data-field="attacks.0.recovery"]', 'short');
    a.click('[data-action="finish-attack"]');
    assert.equal(a.$('.attack-card output').textContent, '2/2');
    assert.match(a.$('.resource-shortcuts').textContent, /Short or Long Rest/);
    a.click('[data-action="use-attack"]');
    await a.submit();
    assert.equal(c.attacks[0].usesSpent, 1);
    assert.equal(a.$('.attack-card output').textContent, '1/2');
    assert.equal(c.combatLog[0].label, 'Use Second Wind');
    a.click('[data-action="use-attack"]');
    await a.submit();
    assert.equal(c.attacks[0].usesSpent, 2);
    a.click('[data-action="use-attack"]');
    assert.equal(a.$('#modal button[type="submit"]').disabled, true);
    await a.submit();
    assert.equal(c.attacks[0].usesSpent, 2);
    a.click('[data-action="close-modal"]');
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.attacks[0].usesSpent, 1);
    a.click('[data-action="close-modal"]');
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.attacks[0].useLimit, 2);
    assert.equal(reopened.api.current.attacks[0].usesSpent, 1);
    assert.equal(reopened.api.current.attacks[0].recovery, 'short');
    a.click('.attack-summary');
    a.input('[data-attack-use-limit="0"]', '');
    a.click('[data-action="finish-attack"]');
    assert.doesNotMatch(a.$('.attack-summary').textContent, /Uses/);
    assert.equal(c.attacks[0].usesSpent, 0);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('limited actions recover on their selected rest and rest undo restores spent uses', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Action recovery');
    const attack = (name, recovery, usesSpent) => ({
      name,
      bonus: '',
      damage: '',
      type: '',
      notes: '',
      useLimit: 2,
      usesSpent,
      recovery,
    });
    c.attacks = [
      attack('Short', 'short', 2),
      attack('Long', 'long', 1),
      attack('Manual', '', 2),
      { name: 'Unlimited', bonus: '', damage: '', type: '', notes: '' },
    ];
    a.api.use(c);
    a.click('[data-action="short-rest"]');
    assert.match(a.$('#rest-preview').textContent, /Short uses: 0\/2 → 2\/2/);
    assert.doesNotMatch(a.$('#rest-preview').textContent, /Long uses/);
    await a.submit();
    assert.deepEqual(
      c.attacks.slice(0, 3).map((item) => item.usesSpent),
      [0, 1, 2],
    );
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.attacks[0].usesSpent, 2);
    a.click('[data-action="close-modal"]');
    a.click('[data-action="rest"]');
    await a.submit();
    assert.deepEqual(
      c.attacks.slice(0, 3).map((item) => item.usesSpent),
      [0, 0, 2],
    );
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.deepEqual(
      c.attacks.slice(0, 3).map((item) => item.usesSpent),
      [2, 1, 2],
    );
  } finally {
    a.close();
  }
});

test('attack counters reject invalid limits, validate backups, and retain stable identity for undo', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Safe action counters');
    c.attacks = [
      { name: 'Action', bonus: '', damage: '', type: '', notes: '' },
    ];
    a.api.use(c);
    a.api.setPage('combat');
    a.click('.attack-summary');
    for (const limit of ['0', '-1', '2.5', 'bad']) {
      a.input('[data-attack-use-limit="0"]', limit);
      assert.equal(c.attacks[0].useLimit, undefined);
    }
    a.input('[data-attack-use-limit="0"]', '3');
    a.input('[data-field="attacks.0.usesSpent"]', 1);
    assert.match(c.combatLog[0].label, /spent 1/);
    a.click('[data-action="finish-attack"]');
    c.attacks.unshift({
      name: 'Other',
      bonus: '',
      damage: '',
      type: '',
      notes: '',
    });
    a.api.setPage('combat');
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.attacks[1].usesSpent, 0);
    const backup = () => ({ format: 'statfolio', version: 1, characters: [c] });
    assert.equal(a.api.validateBackup(backup())[0].attacks[1].useLimit, 3);
    c.attacks[1].useLimit = -1;
    assert.throws(
      () => a.api.validateBackup(backup()),
      /Invalid attack use limit/,
    );
    c.attacks[1].useLimit = 3;
    c.attacks[1].usesSpent = 4;
    assert.throws(
      () => a.api.validateBackup(backup()),
      /Invalid attack uses spent/,
    );
    c.attacks[1].usesSpent = 0;
    c.attacks[1].recovery = 'invalid';
    assert.throws(
      () => a.api.validateBackup(backup()),
      /Invalid attack recovery/,
    );
  } finally {
    a.close();
  }
});

test('pins move attacks and spells to the top of their own sections without duplicating or changing data order', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Pinned sections');
    c.attacks = [
      { name: 'Sword', bonus: '', damage: '', type: '', notes: '' },
      {
        name: 'Burst',
        bonus: '',
        damage: '',
        type: '',
        notes: '',
        useLimit: 2,
        usesSpent: 0,
        recovery: 'short',
      },
    ];
    const spell = (name, level) => ({
      name,
      level,
      school: '',
      time: '',
      range: '',
      components: '',
      duration: '',
      description: 'Preview text',
      prepared: true,
      concentration: false,
      ritual: false,
    });
    c.spells = [spell('Bolt', 0), spell('Ward', 2), spell('Light', 0)];
    c.slots[1] = 1;
    a.api.use(c);
    a.api.setPage('combat');
    const names = (selector) =>
      [...a.w.document.querySelectorAll(selector)].map((el) => el.textContent);
    assert.equal(a.$('.attack-card .favorite-toggle'), null);
    a.click('.attack-card [data-action="edit-attack"][data-index="1"]');
    a.click('[data-attack-editor] .favorite-toggle');
    assert.ok(a.$('[data-attack-editor]'));
    a.click('[data-action="finish-attack"]');
    assert.equal(a.$('.combat-spells .favorite-toggle'), null);
    a.click('.combat-spells [data-action="edit-spell"][data-index="1"]');
    a.click('[data-spell-editor] .favorite-toggle');
    a.click('[data-action="finish-spell"]');
    a.api.setPage('combat');
    assert.equal(a.$('.combat-favorites'), null);
    assert.deepEqual(names('.attack-card .attack-summary-heading strong'), [
      'Burst',
      'Sword',
    ]);
    assert.deepEqual(names('.combat-spells .attack-summary-heading strong'), [
      'Ward',
      'Bolt',
      'Light',
    ]);
    assert.deepEqual(
      c.attacks.map((item) => item.name),
      ['Sword', 'Burst'],
    );
    assert.deepEqual(
      c.spells.map((item) => item.name),
      ['Bolt', 'Ward', 'Light'],
    );
    a.click('.attack-card [data-action="use-attack"][data-index="1"]');
    await a.submit();
    assert.equal(c.attacks[1].usesSpent, 1);
    a.click('.combat-spells [data-action="cast-spell"][data-index="1"]');
    await a.submit();
    assert.equal(c.usedSlots[1], 1);
    a.click('.combat-spells [data-action="edit-spell"][data-index="1"]');
    assert.equal(a.$('[data-field="spells.1.name"]').value, 'Ward');
    a.click('[data-action="finish-spell"]');
    assert.deepEqual(names('#spell-results .attack-summary-heading strong'), [
      'Ward',
      'Bolt',
      'Light',
    ]);
    assert.equal(a.$('#spell-results .favorite-toggle'), null);
    a.click('#spell-results [data-action="edit-spell"][data-index="1"]');
    a.click('[data-spell-editor] .favorite-toggle');
    a.click('[data-action="finish-spell"]');
    assert.deepEqual(names('#spell-results .attack-summary-heading strong'), [
      'Bolt',
      'Ward',
      'Light',
    ]);
    a.api.setPage('combat');
    assert.equal(a.$('.attack-card .favorite-toggle'), null);
    a.click('.attack-card [data-action="edit-attack"][data-index="1"]');
    a.click('[data-attack-editor] .favorite-toggle');
    assert.ok(a.$('[data-attack-editor]'));
    a.click('[data-action="finish-attack"]');
    assert.deepEqual(names('.attack-card .attack-summary-heading strong'), [
      'Sword',
      'Burst',
    ]);
    assert.deepEqual(names('.combat-spells .attack-summary-heading strong'), [
      'Bolt',
      'Light',
      'Ward',
    ]);
  } finally {
    a.close();
  }
});

test('favorite pins work from the spellbook, preserve search, persist and validate in backups, and stay per character', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Saved pins');
    c.spells = [
      {
        name: 'Ward',
        level: 1,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        prepared: true,
        concentration: false,
        ritual: false,
      },
    ];
    a.api.use(c);
    a.api.setPage('spells');
    a.input('[data-spell-filter="name"]', 'Ward');
    assert.equal(a.$('#spell-results .favorite-toggle'), null);
    a.click('#spell-results [data-action="edit-spell"]');
    a.click('[data-spell-editor] .favorite-toggle');
    assert.equal(c.spells[0].favorite, true);
    assert.equal(a.$('[data-spell-filter="name"]').value, 'Ward');
    assert.equal(
      a.$('#spell-results .favorite-toggle').getAttribute('aria-pressed'),
      'true',
    );
    assert.ok(a.$('[data-spell-editor]'));
    a.click('[data-action="finish-spell"]');
    assert.equal(a.$('#spell-results .favorite-toggle'), null);
    await a.api.persist();
    reopened = await app(a.storage);
    reopened.api.setPage('combat');
    assert.equal(reopened.$('.combat-spells .favorite-toggle'), null);
    assert.equal(reopened.api.current.spells[0].favorite, true);
    await a.api.exportBackup();
    const backup = JSON.parse(await a.download().text());
    assert.equal(a.api.validateBackup(backup)[0].spells[0].favorite, true);
    backup.characters[0].spells[0].favorite = 'yes';
    assert.throws(
      () => a.api.validateBackup(backup),
      /Invalid combat favorite/,
    );
    a.api.use(a.api.blank('Different character'));
    a.api.setPage('combat');
    assert.equal(a.$('.combat-favorites'), null);
    assert.equal(c.spells[0].favorite, true);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('resource shortcuts spend and restore one use within bounds and support combat-log undo', async () => {
  const a = await app();
  let reopened;
  try {
    const c = a.api.blank('Resource shortcuts');
    c.resources = [
      { name: 'Ki', remaining: 2, max: 2 },
      { name: 'Empty', remaining: 0, max: 0 },
    ];
    a.api.use(c);
    a.api.setPage('combat');
    const selector = (direction, index = 0) =>
      `[data-action="adjust-resource"][data-list="resources"][data-index="${index}"][data-direction="${direction}"]`;
    assert.equal(a.$(selector(1)).disabled, true);
    assert.equal(a.$(selector(-1, 1)).disabled, true);
    assert.equal(a.$(selector(1, 1)).disabled, true);
    const initial = JSON.stringify(c);
    a.click(selector(1));
    assert.equal(JSON.stringify(c), initial);
    a.click(selector(-1));
    assert.equal(c.resources[0].remaining, 1);
    assert.equal(c.combatLog[0].label, 'Ki: spent 1');
    assert.equal(a.$('[data-field="resources.0.remaining"]').value, '1');
    a.click(selector(-1));
    assert.equal(c.resources[0].remaining, 0);
    assert.equal(a.$(selector(-1)).disabled, true);
    a.click(selector(-1));
    assert.equal(c.combatLog.length, 2);
    a.click(selector(1));
    assert.equal(c.resources[0].remaining, 1);
    assert.equal(c.combatLog[0].label, 'Ki: restored 1');
    assert.equal(a.$('[data-attack-editor]'), null);
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.resources[0].remaining, 0);
    a.click('[data-action="close-modal"]');
    await a.api.persist();
    reopened = await app(a.storage);
    assert.equal(reopened.api.current.resources[0].remaining, 0);
    assert.equal(reopened.api.current.combatLog.length, 3);
  } finally {
    reopened?.close();
    a.close();
  }
});

test('attack shortcuts appear only for limited actions and adjust the correct pinned entry with undo and rest recovery', async () => {
  const a = await app();
  try {
    const c = a.api.blank('Action shortcuts');
    c.attacks = [
      { name: 'Unlimited', bonus: '', damage: '', type: '', notes: '' },
      {
        name: 'Limited',
        bonus: '',
        damage: '',
        type: '',
        notes: '',
        useLimit: 2,
        usesSpent: 0,
        recovery: 'short',
        favorite: true,
      },
    ];
    a.api.use(c);
    a.api.setPage('combat');
    const selector = (direction) =>
      `[data-action="adjust-resource"][data-list="attacks"][data-index="1"][data-direction="${direction}"]`;
    assert.equal(
      a.$(
        '[data-action="adjust-resource"][data-list="attacks"][data-index="0"]',
      ),
      null,
    );
    assert.equal(a.$('.attack-card output').textContent, '2/2');
    assert.equal(a.$(selector(1)).disabled, true);
    a.click(selector(-1));
    assert.equal(c.attacks[1].usesSpent, 1);
    assert.equal(a.$('.attack-card output').textContent, '1/2');
    assert.equal(c.combatLog[0].label, 'Limited: spent 1');
    assert.equal(a.$('[data-attack-editor]'), null);
    assert.equal(a.$('#modal').open, false);
    a.click(selector(-1));
    assert.equal(a.$(selector(-1)).disabled, true);
    a.click(selector(1));
    assert.equal(c.attacks[1].usesSpent, 1);
    a.click('[data-action="combat-log"]');
    a.click('.combat-log [data-action="undo-combat-event"]:not(:disabled)');
    assert.equal(c.attacks[1].usesSpent, 2);
    a.click('[data-action="close-modal"]');
    a.api.setPage('overview');
    a.click('[data-action="short-rest"]');
    await a.submit();
    assert.equal(c.attacks[1].usesSpent, 0);
    a.api.setPage('combat');
    assert.equal(a.$('.attack-card output').textContent, '2/2');
    assert.equal(a.$(selector(1)).disabled, true);
  } finally {
    a.close();
  }
});
