// Fill the original sheet locally. The template itself is never modified.
(() => {
  let assetRequest;
  const scriptRequests = new Map();

  function loadScript(path, globalName) {
    if (window[globalName]) return Promise.resolve(window[globalName]);
    if (scriptRequests.has(path)) return scriptRequests.get(path);

    const request = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = new URL(path, document.baseURI).href;
      script.onload = () =>
        window[globalName]
          ? resolve(window[globalName])
          : reject(
              Error('The PDF library did not load. Reload and try again.'),
            );
      script.onerror = () => {
        script.remove();
        reject(
          Error(
            'The PDF library could not be loaded. Check your connection and try again.',
          ),
        );
      };
      document.head.append(script);
    }).catch((error) => {
      scriptRequests.delete(path);
      throw error;
    });

    scriptRequests.set(path, request);
    return request;
  }

  async function fetchAsset(path, json = false) {
    const response = await fetch(new URL(path, document.baseURI));
    if (!response.ok)
      throw Error(
        'A PDF export asset could not be loaded. Reload and try again.',
      );
    return json
      ? response.json()
      : new Uint8Array(await response.arrayBuffer());
  }

  function loadAssets() {
    assetRequest ||= Promise.all([
      loadScript('assets/vendor/pdf-lib.min.js', 'PDFLib'),
      loadScript('assets/vendor/fontkit.min.js', 'fontkit'),
      fetchAsset('assets/templates/character-sheet.pdf'),
      fetchAsset('assets/templates/character-sheet-fields.json', true),
      fetchAsset('assets/fonts/Manrope-Regular.ttf'),
      fetchAsset('assets/fonts/dejavu-sans/DejaVuSans.ttf'),
    ])
      .then(([PDFLib, fontkit, template, fieldMap, font, fallbackFont]) => ({
        PDFLib,
        fontkit,
        template,
        fieldMap,
        font,
        fallbackFont,
      }))
      .catch((error) => {
        assetRequest = null;
        throw error;
      });

    return assetRequest;
  }

  // Cache word widths so long descriptions do not repeatedly shape every prefix.
  const fontWidths = new WeakMap();

  function textWidth(text, font, size) {
    if (!fontWidths.has(font)) fontWidths.set(font, new Map());
    const widths = fontWidths.get(font);
    if (!widths.has(text)) widths.set(text, font.widthOfTextAtSize(text, 1));
    return widths.get(text) * size;
  }

  function wrapText(text, font, size, width) {
    return String(text)
      .replace(/\r\n?/g, '\n')
      .replace(/\t/g, '    ')
      .split('\n')
      .flatMap((paragraph) => {
        if (!paragraph) return [''];
        const lines = [];
        let line = '';
        let usedWidth = 0;

        function finishLine() {
          lines.push(line.trimEnd());
          line = '';
          usedWidth = 0;
        }

        for (const token of paragraph.match(/\s+|\S+/g)) {
          const space = !token.trim();
          const tokenWidth = textWidth(token, font, size);
          if (line && usedWidth + tokenWidth > width) finishLine();
          if (space && !line && lines.length) continue;

          if (tokenWidth <= width) {
            line += token;
            usedWidth += tokenWidth;
          } else {
            for (const character of token) {
              const characterWidth = textWidth(character, font, size);
              if (line && usedWidth + characterWidth > width) finishLine();
              line += character;
              usedWidth += characterWidth;
            }
          }
        }

        lines.push(line.trimEnd());
        return lines;
      });
  }

  function clipLine(text, font, size, width) {
    const characters = Array.from(text.replace(/\s+/g, ' '));
    if (font.widthOfTextAtSize(characters.join(''), size) <= width)
      return characters.join('');
    while (
      characters.length &&
      font.widthOfTextAtSize(characters.join('') + '…', size) > width
    )
      characters.pop();
    return characters.join('') + '…';
  }

  function fontPicker(primary, fallback) {
    const primaryCharacters = new Set(primary.getCharacterSet());
    const fallbackCharacters = new Set(fallback.getCharacterSet());

    return (text) => {
      const characters = Array.from(String(text)).filter(
        (character) => !['\n', '\r', '\t'].includes(character),
      );
      if (
        characters.every((character) =>
          primaryCharacters.has(character.codePointAt(0)),
        )
      )
        return primary;
      const unsupported = characters.find(
        (character) => !fallbackCharacters.has(character.codePointAt(0)),
      );
      if (unsupported)
        throw Error(
          `The PDF fonts cannot display “${unsupported}”. Replace that character before exporting.`,
        );
      return fallback;
    };
  }

  function fieldWriter(form, fonts, PDFLib, overflow) {
    const fields = new Map(
      form.getFields().map((field) => [field.getName().trim(), field]),
    );

    function text(name, value, { size = 10, minSize = 8, title = name } = {}) {
      const field = fields.get(name.trim());
      if (!(field instanceof PDFLib.PDFTextField))
        throw Error(`The template is missing the “${name}” text field.`);
      const content = String(value ?? '').replace(/\r\n?/g, '\n');
      const font = fonts(content);
      const widgets = field.acroField.getWidgets();
      const bounds = widgets.map((widget) => {
        const rectangle = widget.getRectangle();
        const padding = 2 * ((widget.getBorderStyle()?.getWidth() || 0) + 1);
        return {
          width: rectangle.width - padding,
          height: rectangle.height - padding,
        };
      });
      const width = Math.min(...bounds.map((bounds) => bounds.width));
      const height = Math.min(...bounds.map((bounds) => bounds.height));
      const multiline = field.isMultiline();
      const minimum = Math.min(minSize, size);
      let fontSize = size;
      let lines = [];
      let fits = false;

      for (; fontSize >= minimum; fontSize -= 0.5) {
        lines = multiline
          ? wrapText(content, font, fontSize, width)
          : [content.replace(/\n/g, ' ')];
        const lineHeight = font.heightAtSize(fontSize) * 1.2;
        fits =
          lines.every(
            (line) => font.widthOfTextAtSize(line, fontSize) <= width,
          ) &&
          (multiline
            ? lines.length * lineHeight <= height
            : font.heightAtSize(fontSize, { descender: false }) <= height);
        if (fits) break;
      }

      fontSize = Math.max(minimum, fontSize);
      let displayed = multiline ? lines.join('\n') : lines[0];
      if (!fits && content) {
        overflow.push({ title, text: content });
        if (multiline) {
          const capacity = Math.max(
            1,
            Math.floor(height / (font.heightAtSize(fontSize) * 1.2)),
          );
          displayed =
            capacity > 1
              ? [
                  ...lines.slice(0, capacity - 1),
                  'See continuation pages.',
                ].join('\n')
              : 'See continuation.';
        } else displayed = clipLine(content, font, fontSize, width);
      }

      for (const widget of widgets) widget.dict.delete(PDFLib.PDFName.of('DA'));
      field.acroField.setDefaultAppearance(`0 g /${font.name} ${fontSize} Tf`);
      field.setText(displayed);
      field.setFontSize(fontSize);
      field.disableScrolling();
      field.updateAppearances(font);
    }

    function check(name, checked) {
      const field = fields.get(name.trim());
      if (!(field instanceof PDFLib.PDFCheckBox))
        throw Error(`The template is missing the “${name}” checkbox.`);
      if (checked) field.check();
      else field.uncheck();
    }

    return { text, check };
  }

  function continuationWriter(pdf, fonts, characterName, PDFLib) {
    const margin = 40;
    const width = 532;
    let page;
    let y = 0;

    function newPage() {
      page = pdf.addPage([612, 792]);
      const font = fonts(characterName);
      page.drawText(clipLine(characterName, font, 14, width), {
        x: margin,
        y: 750,
        size: 14,
        font,
      });
      page.drawText('CHARACTER SHEET · CONTINUATION', {
        x: margin,
        y: 733,
        size: 8,
        font: fonts('CONTINUATION'),
      });
      page.drawLine({
        start: { x: margin, y: 724 },
        end: { x: 572, y: 724 },
        thickness: 0.7,
        color: PDFLib.rgb(0.2, 0.2, 0.2),
      });
      page.drawText(`Page ${pdf.getPageCount()}`, {
        x: margin,
        y: 24,
        size: 8,
        font: fonts('Page'),
      });
      y = 704;
    }

    return (title, content) => {
      const font = fonts(content);
      const titleFont = fonts(title);
      const lines = wrapText(content, font, 10, width);
      let index = 0;
      let continued = false;

      while (index < lines.length) {
        if (!page || y < 105) newPage();
        const heading = `${title}${continued ? ' (continued)' : ''}`;
        for (const line of wrapText(heading, titleFont, 12, width)) {
          if (y < 70) newPage();
          page.drawText(line, { x: margin, y, size: 12, font: titleFont });
          y -= 16;
        }
        y -= 6;

        while (index < lines.length && y >= 50) {
          page.drawText(lines[index++], { x: margin, y, size: 10, font });
          y -= 15;
        }
        y -= 16;
        if (index < lines.length) {
          newPage();
          continued = true;
        }
      }
    };
  }

  function fillStats(character, rules, writer) {
    const { text, check } = writer;
    const { abilities, mod, prof, sign, skills } = rules;
    const proficiency = prof(character);
    const identity = {
      CharacterName: character.name,
      'CharacterName 2': character.name,
      ClassLevel:
        `${character.class} ${character.level}${character.subclass ? ` · ${character.subclass}` : ''}`.trim(),
      Background: character.background,
      PlayerName: character.player,
      Race: character.species,
      Alignment: character.alignment,
      XP: character.xp,
      Inspiration: character.inspiration ? 'Yes' : '',
      ProfBonus: sign(proficiency),
      AC: character.ac,
      Initiative: sign(mod(character.abilities[1]) + character.initiativeBonus),
      Speed: character.speed,
      HPMax: character.maxHp,
      HPCurrent: character.hp,
      HPTemp: character.tempHp,
      HDTotal: character.hitDice,
      HD: character.hitDiceLeft,
    };

    for (const [field, value] of Object.entries(identity)) {
      text(field, value, {
        size:
          field === 'HDTotal' ? 7 : field.startsWith('CharacterName') ? 17 : 11,
        minSize: field === 'HDTotal' ? 5 : 7,
      });
    }

    const scoreFields = ['STR', 'DEX', 'CON', 'INT', 'WIS', 'CHA'];
    const modifierFields = [
      'STRmod',
      'DEXmod',
      'CONmod',
      'INTmod',
      'WISmod',
      'CHamod',
    ];
    const saveChecks = [11, 18, 19, 20, 21, 22];
    abilities.forEach((ability, index) => {
      text(scoreFields[index], character.abilities[index], {
        size: 18,
        minSize: 12,
      });
      text(modifierFields[index], sign(mod(character.abilities[index])), {
        size: 10,
        minSize: 7,
      });
      text(
        `ST ${ability}`,
        sign(
          mod(character.abilities[index]) +
            (character.saves.includes(index) ? proficiency : 0),
        ),
        { size: 7, minSize: 5.5 },
      );
      check(`Check Box ${saveChecks[index]}`, character.saves.includes(index));
    });

    const skillFields = [
      'Acrobatics',
      'Animal',
      'Arcana',
      'Athletics',
      'Deception',
      'History',
      'Insight',
      'Intimidation',
      'Investigation',
      'Medicine',
      'Nature',
      'Perception',
      'Performance',
      'Persuasion',
      'Religion',
      'SleightofHand',
      'Stealth',
      'Survival',
    ];
    Object.entries(skills).forEach(([skill, ability], index) => {
      const expert = character.expertise.includes(skill);
      const proficient = character.skills.includes(skill) || expert;
      text(
        skillFields[index],
        sign(
          mod(character.abilities[ability]) +
            (proficient ? proficiency : 0) +
            (expert ? proficiency : 0),
        ),
        { size: 7, minSize: 5.5 },
      );
      check(`Check Box ${23 + index}`, proficient);
    });

    text(
      'Passive',
      10 +
        mod(character.abilities[4]) +
        (character.skills.includes('Perception') ? proficiency : 0) +
        (character.expertise.includes('Perception') ? proficiency : 0),
      { size: 11, minSize: 7 },
    );
    for (let index = 0; index < 3; index++) {
      check(`Check Box ${12 + index}`, character.deathSuccess > index);
      check(`Check Box ${15 + index}`, character.deathFailure > index);
    }

    for (const [coin, amount] of Object.entries(character.coins))
      text(coin.toUpperCase(), amount, { size: 11, minSize: 7 });
  }

  function fillCharacterDetails(character, writer) {
    const { text } = writer;
    for (const [field, title, value] of [
      ['PersonalityTraits', 'Personality traits', character.personality],
      ['Ideals', 'Ideals', character.ideals],
      ['Bonds', 'Bonds', character.bonds],
      ['Flaws', 'Flaws', character.flaws],
      ['Features and Traits', 'Features & traits', character.features],
      ['Backstory', 'Backstory', character.story],
      ['Allies', 'Allies & organizations', character.allies],
    ])
      text(field, value, { title });

    const proficiencies = [
      character.proficiencies,
      character.expertise.length
        ? `Expertise: ${character.expertise.join(', ')}`
        : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    text('ProficienciesLang', proficiencies, {
      title: 'Proficiencies, languages & expertise',
    });

    const conditions = [...(character.activeConditions || [])];
    if (character.exhaustionLevel)
      conditions.push(`Exhaustion ${character.exhaustionLevel}`);
    const additional = [
      character.appearance ? `APPEARANCE\n${character.appearance}` : '',
      conditions.length || character.conditions
        ? `CONDITIONS\n${[conditions.join(', '), character.conditions].filter(Boolean).join('\n')}`
        : '',
      character.resources.length
        ? `RESOURCES\n${character.resources.map((resource) => `${resource.name || 'Unnamed resource'}: ${resource.remaining} / ${resource.max}`).join('\n')}`
        : '',
      character.spellNotes ? `SPELLCASTING NOTES\n${character.spellNotes}` : '',
    ]
      .filter(Boolean)
      .join('\n\n');
    text('Feat+Traits', additional, {
      title: 'Appearance, conditions & resources',
    });

    const equipment = character.equipment
      .map(
        (item) =>
          `${item.equipped ? '[E] ' : ''}${item.quantity} × ${item.name || 'Unnamed item'} (${item.weight} lb each)${item.notes ? `\n${item.notes}` : ''}`,
      )
      .join('\n\n');
    const weight = character.equipment
      .reduce((sum, item) => sum + item.quantity * item.weight, 0)
      .toFixed(1);
    text(
      'Equipment',
      `${equipment}${equipment ? '\n\n' : ''}Total weight: ${weight} lb (excludes coins).`,
      { title: 'Equipment' },
    );

    const attackFields = [
      ['Wpn Name', 'Wpn1 AtkBonus', 'Wpn1 Damage'],
      ['Wpn Name 2', 'Wpn2 AtkBonus', 'Wpn2 Damage'],
      ['Wpn Name 3', 'Wpn3 AtkBonus', 'Wpn3 Damage'],
    ];
    character.attacks.slice(0, 3).forEach((attack, index) => {
      const [name, bonus, damage] = attackFields[index];
      text(name, attack.name, {
        size: 9,
        minSize: 8,
        title: `Attack ${index + 1}: name`,
      });
      text(bonus, attack.bonus, {
        size: 9,
        minSize: 7,
        title: `Attack ${index + 1}: bonus`,
      });
      text(damage, [attack.damage, attack.type].filter(Boolean).join(' / '), {
        size: 9,
        minSize: 8,
        title: `Attack ${index + 1}: damage, type & range`,
      });
    });
    text(
      'AttacksSpellcasting',
      character.attacks
        .map(
          (attack) =>
            `${attack.name || 'Unnamed attack'}: ${[attack.actionType, attack.bonus, attack.damage, attack.type].filter(Boolean).join(' · ')}${attack.notes ? `\n${attack.notes}` : ''}`,
        )
        .join('\n\n'),
      { title: 'Attacks & actions — full details' },
    );
  }

  function fillSpells(character, rules, fieldMap, writer, overflow) {
    const { text, check } = writer;
    const bonus = rules.mod(character.abilities[character.spellAbility]);
    text('Spellcasting Class 2', character.class, { size: 15, minSize: 8 });
    text('SpellcastingAbility 2', rules.abilities[character.spellAbility], {
      size: 11,
      minSize: 8,
    });
    text('SpellSaveDC  2', 8 + rules.prof(character) + bonus, {
      size: 15,
      minSize: 10,
    });
    text('SpellAtkBonus 2', rules.sign(rules.prof(character) + bonus), {
      size: 15,
      minSize: 10,
    });

    for (const group of fieldMap.spellLevels) {
      const spells = character.spells.filter(
        (spell) => Number(spell.level) === group.level,
      );
      if (group.level) {
        text(group.slotsTotal, character.slots[group.level - 1], {
          size: 13,
          minSize: 9,
        });
        // This template labels its SlotsRemaining fields as "slots expended".
        text(group.slotsUsed, character.usedSlots[group.level - 1], {
          size: 13,
          minSize: 9,
        });
      }

      spells.slice(0, group.rows.length).forEach((spell, index) => {
        const row = group.rows[index];
        text(row.name, spell.name, {
          size: 8,
          minSize: 6.5,
          title: `Spell name: ${spell.name}`,
        });
        if (row.prepared) check(row.prepared, spell.prepared);
      });

      if (spells.length > group.rows.length)
        overflow.push({
          title: `${group.level ? `Level ${group.level}` : 'Cantrip'} spell list`,
          text: spells
            .map(
              (spell) =>
                `${spell.prepared ? '[Prepared] ' : ''}${spell.name || 'Unnamed spell'}`,
            )
            .join('\n'),
        });
    }
  }

  async function portraitImage(dataUrl, pdf) {
    if (/^data:image\/png;/i.test(dataUrl)) return pdf.embedPng(dataUrl);
    if (/^data:image\/jpeg;/i.test(dataUrl)) return pdf.embedJpg(dataUrl);

    const image = new Image();
    image.src = dataUrl;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = image.naturalWidth;
    canvas.height = image.naturalHeight;
    canvas.getContext('2d').drawImage(image, 0, 0);
    return pdf.embedPng(canvas.toDataURL('image/png'));
  }

  async function create(character, rules, suppliedAssets) {
    const assets = suppliedAssets || (await loadAssets());
    const { PDFLib } = assets;
    const pdf = await PDFLib.PDFDocument.load(assets.template);
    pdf.registerFontkit(assets.fontkit);
    const primary = await pdf.embedFont(assets.font, { subset: true });
    const fallback = await pdf.embedFont(assets.fallbackFont, { subset: true });
    const fonts = fontPicker(primary, fallback);
    const form = pdf.getForm();
    const overflow = [];

    // Remove template button scripts; values and fields remain editable.
    pdf.catalog.delete(PDFLib.PDFName.of('OpenAction'));
    pdf.catalog.delete(PDFLib.PDFName.of('AA'));
    const names = pdf.catalog.lookupMaybe(
      PDFLib.PDFName.of('Names'),
      PDFLib.PDFDict,
    );
    names?.delete(PDFLib.PDFName.of('JavaScript'));
    for (const field of form.getFields()) {
      field.acroField.dict.delete(PDFLib.PDFName.of('AA'));
      for (const widget of field.acroField.getWidgets()) {
        widget.dict.delete(PDFLib.PDFName.of('A'));
        widget.dict.delete(PDFLib.PDFName.of('AA'));
        widget.dict
          .lookupMaybe(PDFLib.PDFName.of('MK'), PDFLib.PDFDict)
          ?.delete(PDFLib.PDFName.of('BG'));
      }
      if (field instanceof PDFLib.PDFTextField) field.setText('');
      if (field instanceof PDFLib.PDFCheckBox) field.uncheck();
    }

    const writer = fieldWriter(form, fonts, PDFLib, overflow);
    fillStats(character, rules, writer);
    fillCharacterDetails(character, writer);
    fillSpells(character, rules, assets.fieldMap, writer, overflow);
    if (character.image)
      form
        .getButton('CHARACTER IMAGE')
        .setImage(await portraitImage(character.image, pdf));

    // The artwork already contains checkbox outlines. Draw only their filled dots.
    for (const field of form.getFields()) {
      if (!(field instanceof PDFLib.PDFCheckBox)) continue;
      field.updateAppearances((checkbox, widget) => {
        const { width, height } = widget.getRectangle();
        const radius = Math.min(width, height) * 0.3;
        const on = PDFLib.drawEllipse({
          x: width / 2,
          y: height / 2,
          xScale: radius,
          yScale: radius,
          borderWidth: 0,
          color: PDFLib.rgb(0, 0, 0),
        });
        return { normal: { on, off: [] } };
      });
    }
    form.updateFieldAppearances(primary);

    const continueSection = continuationWriter(
      pdf,
      fonts,
      character.name,
      PDFLib,
    );
    for (const section of overflow)
      continueSection(section.title, section.text);
    for (const spell of character.spells.filter(
      (spell) => spell.prepared || Number(spell.level) === 0,
    )) {
      const details = [
        Number(spell.level) === 0 ? 'Cantrip' : `Level ${spell.level}`,
        spell.school,
        spell.actionType && `Action type: ${spell.actionType}`,
        spell.time && `Casting time: ${spell.time}`,
        spell.range && `Range: ${spell.range}`,
        spell.components && `Components: ${spell.components}`,
        spell.duration && `Duration: ${spell.duration}`,
      ]
        .filter(Boolean)
        .join('\n');
      continueSection(
        spell.name || 'Unnamed spell',
        `${details}\n\n${spell.description || 'No description recorded.'}`,
      );
    }

    pdf.setTitle(`${character.name} — Character sheet`);
    pdf.setCreator('Statfolio 5e');
    return pdf.save({ updateFieldAppearances: false });
  }

  window.StatfolioPDF = { create, loadAssets };
})();
