const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');
const PDFLib = require('pdf-lib');
const fontkit = require('@pdf-lib/fontkit');

const assets = {
  PDFLib,
  fontkit,
  template: fs.readFileSync('assets/templates/character-sheet.pdf'),
  fieldMap: JSON.parse(
    fs.readFileSync('assets/templates/character-sheet-fields.json', 'utf8'),
  ),
  font: fs.readFileSync('assets/fonts/Manrope-Regular.ttf'),
  fallbackFont: fs.readFileSync('assets/fonts/dejavu-sans/DejaVuSans.ttf'),
};

function setup() {
  const dom = new JSDOM(fs.readFileSync('index.html', 'utf8'), {
    runScripts: 'outside-only',
    url: 'https://example.test/Statfolio-5e/',
  });
  dom.window.Uint8Array = Uint8Array;
  dom.window.ArrayBuffer = ArrayBuffer;
  dom.window.eval(fs.readFileSync('assets/vendor/pdf-lib.min.js', 'utf8'));
  dom.window.eval(fs.readFileSync('assets/vendor/fontkit.min.js', 'utf8'));
  dom.window.eval(fs.readFileSync('text-format.js', 'utf8'));
  dom.window.eval(fs.readFileSync('pdf-sheet.js', 'utf8'));
  dom.window.eval(
    fs.readFileSync('app.js', 'utf8').replace(/init\(\);\s*$/, '') +
      '\nwindow.pdfTest = { blank, abilities, skills, mod, prof, sign, statValue };',
  );
  const api = {
    create: (character, rules) =>
      dom.window.StatfolioPDF.create(character, rules, {
        ...assets,
        PDFLib: dom.window.PDFLib,
        fontkit: dom.window.fontkit,
      }),
  };
  return { dom, api, rules: dom.window.pdfTest };
}

function sample(rules) {
  const character = rules.blank('Élowen Ashford');
  Object.assign(character, {
    class: 'Ranger',
    subclass: 'Hunter',
    species: 'Wood elf',
    background: 'Outlander',
    level: 5,
    player: 'Player',
    alignment: 'Chaotic good',
    xp: 6500,
    abilities: [12, 18, 14, 10, 16, 8],
    hp: 32,
    maxHp: 44,
    tempHp: 5,
    ac: 16,
    speed: 35,
    hitDice: '5d10',
    hitDiceLeft: 3,
    inspiration: true,
    skills: ['Stealth', 'Perception', 'Survival'],
    expertise: ['Stealth'],
    saves: [0, 1],
    deathSuccess: 2,
    deathFailure: 1,
    activeConditions: ['Poisoned'],
    exhaustionLevel: 2,
    conditions: 'Poison ends after the next turn.',
    personality: '● Watchful\n            ○ Follows the trail',
    ideals: 'Protect the wild places and the people who depend on them.',
    bonds: 'I will return to the northern watch with answers.',
    flaws: 'I trust a trail more readily than a stranger.',
    features:
      'Favored enemy: beasts\nNatural explorer: forest\nExtra Attack\nArchery fighting style',
    appearance: 'A weathered green cloak and a silver leaf pendant.',
    story:
      'Elowen follows a trail of scorched trees, gathering allies and searching for the missing wardens.',
    allies: 'The Northern Watch\nMira, keeper of the bridge',
    proficiencies:
      'Common, Elvish, Sylvan. Light and medium armor; shields; simple and martial weapons.',
    coins: { cp: 12, sp: 34, ep: 0, gp: 125, pp: 2 },
    spellAbility: 4,
    slots: [4, 2, 0, 0, 0, 0, 0, 0, 0],
    usedSlots: [1, 0, 0, 0, 0, 0, 0, 0, 0],
    spellNotes: 'Only one concentration spell can be maintained at a time.',
  });

  character.attacks = [
    {
      name: 'Longbow',
      bonus: '+9',
      damage: '1d8+4',
      type: 'Piercing / 150–600 ft',
      notes: 'Two attacks with the Attack action.',
    },
    {
      name: 'Shortsword',
      bonus: '+7',
      damage: '1d6+4',
      type: 'Piercing',
      notes: 'Finesse, light.',
    },
    {
      name: 'Hunter’s mark',
      bonus: '',
      damage: '+1d6',
      type: 'Weapon damage',
      notes: 'Against the marked target.',
    },
  ];
  character.equipment = [
    { name: 'Longbow', quantity: 1, weight: 2, equipped: true, notes: '' },
    {
      name: 'Arrows',
      quantity: 20,
      weight: 0.05,
      equipped: false,
      notes: 'In the quiver.',
    },
    {
      name: 'Rope',
      quantity: 1,
      weight: 5,
      equipped: false,
      notes: '50 feet of silk rope.',
    },
  ];
  character.resources = [{ name: 'Healing supplies', remaining: 2, max: 3 }];
  const spell = {
    name: 'Hunter’s mark',
    level: 1,
    school: 'Divination',
    time: '1 bonus action',
    range: '90 ft',
    components: 'V',
    duration: 'Concentration, up to 1 hour',
    description:
      'Recorded spell effects and targeting information.\n\nHigher-level effects can also be recorded here.',
    prepared: true,
  };
  character.spells = [
    spell,
    { ...spell, name: 'Cure wounds', prepared: false },
    { ...spell, name: 'Guidance', level: 0, prepared: false },
  ];
  return character;
}

function preview(name, bytes) {
  if (!process.env.STATFOLIO_PDF_PREVIEWS) return;
  fs.mkdirSync('tmp/pdfs', { recursive: true });
  fs.writeFileSync(`tmp/pdfs/${name}.pdf`, bytes);
}

test('fills the original editable template with correct stats, spell rows, prepared marks, and Unicode', async () => {
  const { dom, api, rules } = setup();

  try {
    const character = sample(rules);
    character.features = '**Extra Attack**\n*Archery* fighting style';
    const before = JSON.stringify(character);
    const bytes = await api.create(character, rules, assets);
    const pdf = await PDFLib.PDFDocument.load(bytes);
    const form = pdf.getForm();
    assert.equal(
      form.getTextField('CharacterName').getText(),
      'Élowen Ashford',
    );
    assert.equal(
      form.getTextField('CharacterName 2').getText(),
      'Élowen Ashford',
    );
    assert.equal(form.getTextField('DEX').getText(), '18');
    assert.equal(form.getTextField('DEXmod ').getText(), '+4');
    assert.equal(form.getTextField('Stealth ').getText(), '+10');
    assert.equal(form.getTextField('ST Dexterity').getText(), '+7');
    assert.equal(form.getTextField('Passive').getText(), '16');
    assert.equal(form.getTextField('HPCurrent').getText(), '32');
    assert.equal(form.getTextField('HPTemp').getText(), '5');
    assert.equal(form.getTextField('HDTotal').getText(), '5d10');
    assert.equal(form.getTextField('HD').getText(), '3');
    assert.equal(form.getTextField('GP').getText(), '125');
    assert.equal(form.getCheckBox('Check Box 39').isChecked(), true);
    assert.equal(form.getCheckBox('Check Box 18').isChecked(), true);
    assert.equal(form.getCheckBox('Check Box 12').isChecked(), true);
    assert.equal(form.getCheckBox('Check Box 13').isChecked(), true);
    assert.equal(form.getCheckBox('Check Box 14').isChecked(), false);
    assert.equal(form.getCheckBox('Check Box 15').isChecked(), true);
    assert.match(
      form.getTextField('PersonalityTraits ').getText(),
      /● Watchful/,
    );
    assert.match(form.getTextField('Feat+Traits').getText(), /Exhaustion 2/);
    assert.match(
      form.getTextField('Features and Traits').getText(),
      /Extra Attack/,
    );
    assert.equal(
      form.getTextField('Features and Traits').getText().includes('*'),
      false,
    );
    assert.equal(form.getTextField('SpellSaveDC  2').getText(), '14');
    assert.equal(form.getTextField('SpellAtkBonus 2').getText(), '+6');
    const group = assets.fieldMap.spellLevels[1];
    assert.equal(
      form.getTextField(group.rows[0].name).getText(),
      'Hunter’s mark',
    );
    assert.equal(form.getCheckBox(group.rows[0].prepared).isChecked(), true);
    assert.equal(form.getCheckBox(group.rows[1].prepared).isChecked(), false);
    assert.equal(form.getTextField(group.slotsTotal).getText(), '4');
    assert.equal(form.getTextField(group.slotsUsed).getText(), '1');
    assert.equal(
      form.getFields().length,
      (await PDFLib.PDFDocument.load(assets.template)).getForm().getFields()
        .length,
    );
    assert.ok(pdf.getPageCount() >= 4);
    assert.equal(JSON.stringify(character), before);

    for (const field of form.getFields()) {
      if (field instanceof PDFLib.PDFTextField && field.getText()) {
        for (const widget of field.acroField.getWidgets())
          assert.ok(widget.getAppearances()?.normal);
      }
    }
    preview('filled-template', bytes);
  } finally {
    dom.window.close();
  }
});

test('PDF exports include equipped item bonuses in skills, saves, spellcasting and reference stats', async () => {
  const { dom, api, rules } = setup();
  try {
    const c = sample(rules);
    c.equipment.push({
      name: 'Magic Ring',
      quantity: 1,
      weight: 0,
      notes: '',
      equipped: true,
      bonuses: [
        { target: 'ac', amount: 2 },
        { target: 'speed', amount: 5 },
        { target: 'initiative', amount: 1 },
        { target: 'skill.Stealth', amount: 3 },
        { target: 'save.2', amount: 2 },
        { target: 'passivePerception', amount: 1 },
        { target: 'spellDC', amount: 1 },
        { target: 'spellAttack', amount: 2 },
      ],
    });
    const before = JSON.stringify(c);
    const form = (
      await PDFLib.PDFDocument.load(await api.create(c, rules))
    ).getForm();
    for (const [name, expected] of [
      ['AC', '18'],
      ['Speed', '40'],
      ['Initiative', '+5'],
      ['Stealth ', '+13'],
      ['ST Constitution', '+4'],
      ['Passive', '17'],
      ['SpellSaveDC  2', '15'],
      ['SpellAtkBonus 2', '+8'],
    ])
      assert.equal(form.getTextField(name).getText(), expected, name);
    assert.equal(JSON.stringify(c), before);
  } finally {
    dom.window.close();
  }
});

test('long text, extra attacks, and overflowing spell lists produce continuation pages without changing the template', async () => {
  const { dom, api, rules } = setup();

  try {
    const character = sample(rules);
    character.features =
      'A very long feature description. '.repeat(250) + 'FEATURES END';
    character.story = 'An extended backstory. '.repeat(200) + 'STORY END';
    character.attacks = Array.from({ length: 12 }, (_, index) => ({
      ...character.attacks[0],
      name: `Attack ${index + 1}`,
      notes: `All attack notes ${index + 1}`,
    }));
    character.spells = Array.from({ length: 15 }, (_, index) => ({
      ...character.spells[0],
      name: `Spell ${index + 1}`,
      prepared: index === 0,
      description:
        index === 0 ? 'Full description. '.repeat(300) + 'SPELL END' : '',
    }));
    const bytes = await api.create(character, rules, assets);
    const pdf = await PDFLib.PDFDocument.load(bytes);
    assert.ok(pdf.getPageCount() > 4);
    assert.match(
      pdf.getForm().getTextField('Features and Traits').getText(),
      /See continuation/,
    );
    assert.match(
      pdf.getForm().getTextField('Backstory').getText(),
      /See continuation/,
    );
    assert.equal(
      (await PDFLib.PDFDocument.load(assets.template)).getPageCount(),
      3,
    );
    preview('filled-template-long', bytes);
  } finally {
    dom.window.close();
  }
});

test('unknown glyphs fail clearly instead of silently dropping character text', async () => {
  const { dom, api, rules } = setup();
  try {
    const character = sample(rules);
    character.name = '漢';
    await assert.rejects(
      api.create(character, rules, assets),
      /cannot display/,
    );
  } finally {
    dom.window.close();
  }
});

test('browser export loads local assets from a GitHub Pages subdirectory and caches them', async () => {
  const { dom, rules } = setup();
  try {
    const w = dom.window;
    delete w.PDFLib;
    delete w.fontkit;
    const requests = [];
    const append = w.document.head.append.bind(w.document.head);
    w.document.head.append = (script) => {
      append(script);
      const url = new URL(script.src);
      assert.ok(url.pathname.startsWith('/Statfolio-5e/assets/vendor/'));
      requests.push(url.pathname);
      w.eval(
        fs.readFileSync(url.pathname.replace('/Statfolio-5e/', ''), 'utf8'),
      );
      script.onload();
    };
    w.fetch = async (url) => {
      const path = new URL(url).pathname;
      assert.ok(path.startsWith('/Statfolio-5e/assets/'));
      requests.push(path);
      const data = fs.readFileSync(path.replace('/Statfolio-5e/', ''));
      return {
        ok: true,
        arrayBuffer: async () =>
          data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength),
        json: async () => JSON.parse(data.toString('utf8')),
      };
    };
    const character = sample(rules);
    character.image =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+c4ZkAAAAASUVORK5CYII=';
    const bytes = await w.StatfolioPDF.create(character, rules);
    const pdf = await PDFLib.PDFDocument.load(bytes);
    assert.ok(
      pdf
        .getForm()
        .getButton('CHARACTER IMAGE')
        .acroField.getWidgets()
        .every((widget) => widget.getAppearances()?.normal),
    );
    assert.equal(requests.length, 6);
    await w.StatfolioPDF.create(character, rules);
    assert.equal(requests.length, 6);
  } finally {
    dom.window.close();
  }
});
