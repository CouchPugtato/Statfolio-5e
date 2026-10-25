// Shared DOM helpers and fifth-edition rules.

const $ = (selector, root = document) => root.querySelector(selector);

const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );

const uid = () => crypto.randomUUID();
const formatText = (value, limit) => window.StatfolioText.html(value, limit);

const abilities = [
  'Strength',
  'Dexterity',
  'Constitution',
  'Intelligence',
  'Wisdom',
  'Charisma',
];

const skills = {
  Acrobatics: 1,
  'Animal Handling': 4,
  Arcana: 3,
  Athletics: 0,
  Deception: 5,
  History: 3,
  Insight: 4,
  Intimidation: 5,
  Investigation: 3,
  Medicine: 4,
  Nature: 3,
  Perception: 4,
  Performance: 5,
  Persuasion: 5,
  Religion: 3,
  'Sleight of Hand': 1,
  Stealth: 1,
  Survival: 4,
};

const bonusTargets = new Map([
  ['ac', 'Armor Class'],
  ['speed', 'Speed'],
  ['initiative', 'Initiative'],
  ['proficiency', 'Proficiency Bonus'],
  ['passivePerception', 'Passive Perception'],
  ['spellDC', 'Spell Save DC'],
  ['spellAttack', 'Spell Attack Bonus'],
  ...abilities.map((name, index) => [`ability.${index}`, `${name} Modifier`]),
  ...abilities.map((name, index) => [`save.${index}`, `${name} Save`]),
  ...Object.keys(skills).map((name) => [`skill.${name}`, name]),
]);

function statValue(character, target) {
  const proficiency = () => statValue(character, 'proficiency');
  let base;
  if (target.startsWith('ability.')) {
    base = mod(character.abilities[Number(target.slice(8))]);
  } else if (target.startsWith('save.')) {
    const index = Number(target.slice(5));
    base =
      statValue(character, `ability.${index}`) +
      (character.saves.includes(index) ? proficiency() : 0);
  } else if (target.startsWith('skill.')) {
    const name = target.slice(6);
    const expert = character.expertise.includes(name);
    base =
      statValue(character, `ability.${skills[name]}`) +
      (expert ? 2 : character.skills.includes(name) ? 1 : 0) * proficiency();
  } else {
    switch (target) {
      case 'ac':
        base = character.ac;
        break;
      case 'speed':
        base = character.speed;
        break;
      case 'initiative':
        base = statValue(character, 'ability.1') + character.initiativeBonus;
        break;
      case 'proficiency':
        base = prof(character);
        break;
      case 'passivePerception':
        base = 10 + statValue(character, 'skill.Perception');
        break;
      case 'spellDC':
        base =
          8 +
          proficiency() +
          statValue(character, `ability.${character.spellAbility}`);
        break;
      case 'spellAttack':
        base =
          proficiency() +
          statValue(character, `ability.${character.spellAbility}`);
        break;
      default:
        throw Error('Unknown item bonus target.');
    }
  }
  return (
    base +
    (character.equipment || [])
      .filter((item) => item.equipped)
      .reduce(
        (total, item) =>
          total +
          (item.bonuses || [])
            .filter((bonus) => bonus.target === target)
            .reduce((sum, bonus) => sum + bonus.amount, 0),
        0,
      )
  );
}

function statHint(character, target) {
  const base = { ...character, equipment: [] };
  const initial = statValue(base, target);
  const contributions = (character.equipment || [])
    .filter((item) => item.equipped)
    .map((item) => ({
      name: item.name || 'Unnamed Item',
      amount: statValue({ ...base, equipment: [item] }, target) - initial,
    }))
    .filter((entry) => entry.amount);
  if (!contributions.length) return '';
  const breakdown = `${initial} base ${contributions.map((entry) => `${sign(entry.amount)} ${entry.name}`).join(' ')} = ${statValue(character, target)}`;
  return `tabindex="0" aria-label="${esc(breakdown)}" data-stat-breakdown="${esc(breakdown)}"`;
}

function baseStatField(character, label, path, target) {
  const effective = statValue(character, target);
  const original = statValue({ ...character, equipment: [] }, target);
  if (effective === original) return field(label, path, 'number');
  return `<div class="item-stat-field">${field(label, path, 'number')}<small ${statHint(character, target)}>${target === 'initiative' ? sign(effective) : effective} total</small></div>`;
}

const pages = [
  ['overview', 'Character', '◈'],
  ['abilities', 'Skills', '◇'],
  ['combat', 'Combat', '⚔'],
  ['spells', 'Spellbook', '✧'],
  ['equipment', 'Equipment', '▣'],
  ['background', 'Background', '☷'],
  ['notes', 'Journal', '✎'],
];

const noteCategories = [
  'General',
  'Session',
  'Quest',
  'NPC',
  'Location',
  'Lore',
];

// Paraphrased from SRD 5.1 (2014 rules). See RULES-LICENSE.md.
const conditionRules = {
  Blinded: [
    'Sight-based ability checks fail automatically. You cannot see.',
    'Your attacks have disadvantage; attacks against you have advantage.',
  ],
  Charmed: [
    'You cannot attack the charmer or direct harmful abilities or magic at them.',
    'The charmer has advantage on social ability checks involving you.',
  ],
  Deafened: [
    'You cannot hear. Hearing-based ability checks fail automatically.',
  ],
  Exhaustion: [
    'Effects accumulate: level 1, disadvantage on ability checks; level 2, half speed; level 3, disadvantage on attacks and saves; level 4, half maximum HP; level 5, speed 0; level 6, death.',
    'A long rest removes one level if you also had food and drink. Track recovery manually here.',
  ],
  Frightened: [
    'While you can see the source of your fear, your attacks and ability checks have disadvantage.',
    'You cannot willingly approach the source of your fear.',
  ],
  Grappled: [
    'Your speed is 0, including speed bonuses.',
    'Ends if the grappler becomes incapacitated or an effect puts you outside the grappler’s reach.',
  ],
  Incapacitated: ['You cannot take actions or reactions.'],
  Invisible: [
    'Normal sight cannot detect you; hiding treats you as heavily obscured. Noise and tracks can still reveal your location.',
    'Your attacks have advantage; attacks against you have disadvantage.',
  ],
  Paralyzed: [
    'You are incapacitated and cannot move or speak.',
    'Strength and Dexterity saves fail automatically. Attacks against you have advantage; a hit is critical if the attacker is within 5 feet.',
  ],
  Petrified: [
    'Your body and carried nonmagical objects become solid material; weight multiplies by 10 and aging stops.',
    'You are incapacitated, cannot move or speak, and do not perceive your surroundings.',
    'Strength and Dexterity saves fail automatically; attacks against you have advantage.',
    'You resist all damage and are immune to poison and disease. Existing poison or disease is suspended.',
  ],
  Poisoned: ['Your attacks and ability checks have disadvantage.'],
  Prone: [
    'You can crawl or stand to end this condition; standing normally costs half your speed.',
    'Your attacks have disadvantage. Attacks against you have advantage within 5 feet, and disadvantage from farther away.',
  ],
  Restrained: [
    'Your speed is 0, including speed bonuses.',
    'Your attacks and Dexterity saves have disadvantage; attacks against you have advantage.',
  ],
  Stunned: [
    'You are incapacitated, cannot move, and can only speak with difficulty.',
    'Strength and Dexterity saves fail automatically; attacks against you have advantage.',
  ],
  Unconscious: [
    'You are incapacitated, cannot move or speak, and do not perceive your surroundings.',
    'You drop held objects and fall prone.',
    'Strength and Dexterity saves fail automatically. Attacks against you have advantage; a hit is critical if the attacker is within 5 feet.',
  ],
};

// View state stays in memory; character data is saved to IndexedDB.

let noteSearch = '';
let noteFilter = 'all';
let journalCharacterId = null;
let editingAttack = null;
let editingSpell = null;
let editingItem = null;
let spellFilters = {
  name: '',
  level: '',
  school: '',
  prepared: '',
  concentration: '',
  ritual: '',
};

// Older spells stored these details as free text rather than checkboxes.
function spellFlag(spell, flag) {
  return (
    spell[flag] ??
    new RegExp(`\\b${flag}\\b`, 'i').test(
      flag === 'concentration' ? spell.duration : spell.time,
    )
  );
}

function matchesSpell(spell) {
  return (
    spell.name
      .toLocaleLowerCase()
      .includes(spellFilters.name.trim().toLocaleLowerCase()) &&
    (spellFilters.level === '' || spell.level === Number(spellFilters.level)) &&
    (spellFilters.school === '' ||
      spell.school.trim().toLocaleLowerCase() === spellFilters.school) &&
    ['prepared', 'concentration', 'ritual'].every(
      (flag) =>
        spellFilters[flag] === '' ||
        Boolean(
          flag === 'prepared' ? spell.prepared : spellFlag(spell, flag),
        ) ===
          (spellFilters[flag] === 'yes'),
    )
  );
}

function spellFilterControls(c) {
  const select = (key, label, options) =>
    `<select data-spell-filter="${key}" aria-label="${label}">${[['', label], ...options].map(([value, text]) => `<option value="${esc(value)}" ${spellFilters[key] === value ? 'selected' : ''}>${esc(text)}</option>`).join('')}</select>`;
  const schools = [
    ...new Set(
      c.spells
        .map((spell) => spell.school.trim().toLocaleLowerCase())
        .filter(Boolean),
    ),
  ].sort();

  return `<div class="spell-filters"><input type="search" data-spell-filter="name" aria-label="Search spells by name" placeholder="Search spells…" value="${esc(spellFilters.name)}" />
    ${select(
      'level',
      'All levels',
      Array.from({ length: 10 }, (_, level) => [
        String(level),
        level ? `Level ${level}` : 'Cantrip',
      ]),
    )}
    ${select(
      'school',
      'All schools',
      schools.map((school) => [
        school,
        school[0].toLocaleUpperCase() + school.slice(1),
      ]),
    )}
    ${select('prepared', 'Any preparation', [
      ['yes', 'Prepared'],
      ['no', 'Not prepared'],
    ])}
    ${select('concentration', 'Any concentration', [
      ['yes', 'Concentration'],
      ['no', 'No concentration'],
    ])}
    ${select('ritual', 'Any ritual status', [
      ['yes', 'Ritual'],
      ['no', 'Not ritual'],
    ])}
    ${button('clear-spell-filters', 'Clear', 'text-button')}</div>`;
}

function renderSpellResults(c) {
  hideSpellPopup();
  $('#spell-results').innerHTML = spellRecords(c);
  growTextAreas($('#spell-results'));
}

const deletedEntries = [];

let spellPopup = null;
let spellPopupCard = null;
let skillSearch = '';
let inventorySearch = '';
let inventoryModifiersOnly = false;
const expandedItemNotes = new WeakSet();
const expandedItemBonuses = new WeakSet();
let skillCharacterId = null;

function bonusStatPicker(bonus, itemIndex, bonusIndex) {
  const id = `bonus-stat-options-${itemIndex}-${bonusIndex}`;
  return `<div class="bonus-stat-picker"><input type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="${id}" autocomplete="off" aria-label="Bonus stat" placeholder="Find a stat…" data-item-bonus-target="${itemIndex}" data-bonus-index="${bonusIndex}" value="${esc(bonusTargets.get(bonus.target))}" /><button type="button" class="bonus-stat-toggle" aria-label="Show all bonus stats" aria-expanded="false">▾</button><div class="bonus-stat-options" role="listbox" aria-label="Bonus stats" id="${id}" hidden></div></div>`;
}

function closeBonusStatPickers() {
  for (const picker of document.querySelectorAll('.bonus-stat-picker')) {
    $('.bonus-stat-options', picker).hidden = true;
    $('input', picker).setAttribute('aria-expanded', 'false');
    $('input', picker).removeAttribute('aria-activedescendant');
    $('.bonus-stat-toggle', picker).setAttribute('aria-expanded', 'false');
  }
}

function openBonusStatPicker(picker, query = '') {
  closeBonusStatPickers();
  const input = $('input', picker);
  const options = $('.bonus-stat-options', picker);
  const matches = [...bonusTargets].filter(([, label]) =>
    label.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()),
  );
  options.innerHTML =
    matches
      .map(
        ([target, label], index) =>
          `<button type="button" role="option" tabindex="-1" id="${options.id}-${index}" data-bonus-stat-option="${esc(target)}" aria-selected="false">${esc(label)}</button>`,
      )
      .join('') || '<span class="muted">No matching stats.</span>';
  options.hidden = false;
  input.setAttribute('aria-expanded', 'true');
  $('.bonus-stat-toggle', picker).setAttribute('aria-expanded', 'true');
}

function chooseBonusStat(option) {
  const picker = option.closest('.bonus-stat-picker');
  const input = $('input', picker);
  input.value = bonusTargets.get(option.dataset.bonusStatOption);
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
  closeBonusStatPickers();
  input.focus();
  closeBonusStatPickers();
}

document.addEventListener('pointerdown', (event) => {
  if (event.target.closest('.bonus-stat-toggle, [data-bonus-stat-option]'))
    event.preventDefault();
});

document.addEventListener('focusin', (event) => {
  if (event.target.matches('[data-item-bonus-target]'))
    openBonusStatPicker(event.target.closest('.bonus-stat-picker'));
  else if (!event.target.closest('.bonus-stat-picker')) closeBonusStatPickers();
});

document.addEventListener('click', (event) => {
  const picker = event.target.closest('.bonus-stat-picker');
  if (!picker) {
    closeBonusStatPickers();
    return;
  }
  const option = event.target.closest('[data-bonus-stat-option]');
  if (option) {
    chooseBonusStat(option);
    return;
  }
  const input = $('input', picker);
  if (event.target.closest('.bonus-stat-toggle')) {
    const wasOpen = !$('.bonus-stat-options', picker).hidden;
    input.focus();
    if (wasOpen) closeBonusStatPickers();
    else openBonusStatPicker(picker);
  } else if (event.target === input) openBonusStatPicker(picker);
});

document.addEventListener('keydown', (event) => {
  const input = event.target;
  if (!input.matches('[data-item-bonus-target]')) return;
  const picker = input.closest('.bonus-stat-picker');
  const list = $('.bonus-stat-options', picker);
  if (event.key === 'Escape') {
    event.preventDefault();
    closeBonusStatPickers();
    return;
  }
  if (event.key === 'Tab') {
    closeBonusStatPickers();
    return;
  }
  if (!['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) return;
  if (event.key === 'Enter' && list.hidden) return;
  event.preventDefault();
  if (list.hidden) openBonusStatPicker(picker);
  const options = [...list.querySelectorAll('[role="option"]')];
  if (!options.length) return;
  const active = options.findIndex(
    (option) => option.id === input.getAttribute('aria-activedescendant'),
  );
  if (event.key === 'Enter') {
    chooseBonusStat(options[Math.max(0, active)]);
    return;
  }
  const next =
    active < 0
      ? event.key === 'ArrowDown'
        ? 0
        : options.length - 1
      : (active + (event.key === 'ArrowDown' ? 1 : -1) + options.length) %
        options.length;
  options.forEach((option, index) =>
    option.setAttribute('aria-selected', String(index === next)),
  );
  input.setAttribute('aria-activedescendant', options[next].id);
  options[next].scrollIntoView?.({ block: 'nearest' });
});

function itemBonuses(item, index, editing = false) {
  const bonuses = item.bonuses || [];
  const summary =
    bonuses
      .map((bonus) => `${bonusTargets.get(bonus.target)} ${sign(bonus.amount)}`)
      .join(' · ') || 'Add Bonus…';
  if (!editing) {
    if (!bonuses.length) return '';
    return `<details class="inventory-bonuses" data-item-bonuses="${index}" ${expandedItemBonuses.has(item) ? 'open' : ''}><summary><span>Bonuses</span><span class="inventory-notes-preview">${esc(summary)}</span></summary><div class="item-bonus-summary">${bonuses.map((bonus) => `<span>${esc(bonusTargets.get(bonus.target))} <strong>${sign(bonus.amount)}</strong></span>`).join('')}</div></details>`;
  }
  if (!bonuses.length)
    return button(
      'add-item-bonus',
      '＋ Add Bonus',
      'text-button',
      `data-index="${index}"`,
    );
  return `<details class="inventory-bonuses" data-item-bonuses="${index}" ${expandedItemBonuses.has(item) ? 'open' : ''}><summary><span>Bonuses</span><span class="inventory-notes-preview">${esc(summary)}</span></summary><div class="item-bonus-list">${bonuses.map((bonus, bonusIndex) => `<div class="item-bonus-row">${bonusStatPicker(bonus, index, bonusIndex)}<input type="number" step="1" aria-label="Bonus amount" data-item-bonus-amount="${index}" data-bonus-index="${bonusIndex}" value="${bonus.amount}" />${button('remove-item-bonus', '×', 'icon-button', `data-index="${index}" data-bonus-index="${bonusIndex}" aria-label="Remove bonus"`)}</div>`).join('')}${button('add-item-bonus', '＋ Add Bonus', 'text-button', `data-index="${index}"`)}</div></details>`;
}

function itemNotes(item, index) {
  if (!item.notes.trim()) return '';
  const preview = item.notes.trim().replace(/\s+/g, ' ') || 'Add notes…';
  return /* HTML */ `<details
    class="inventory-notes"
    data-item-notes="${index}"
    ${expandedItemNotes.has(item) ? 'open' : ''}
  >
    <summary
      ><span>Notes</span
      ><span class="inventory-notes-preview"
        >${formatText(preview)}</span
      ></summary
    >
    <div class="item-note-content"
      >${formatText(item.notes) || '<span class="muted">No notes.</span>'}</div
    >
  </details>`;
}

function inventoryRecord(item, index) {
  const editing = editingItem === item;
  const name = esc(item.name || 'Unnamed Item');
  const details = itemNotes(item, index) + itemBonuses(item, index);
  const editor = `<div class="inventory-item-edit" data-item-editor="${index}"><div class="item-edit-top"><input class="inventory-item-name" type="text" data-field="equipment.${index}.name" value="${esc(item.name)}" aria-label="Item name" placeholder="Item name" />${button('finish-item', 'Done', 'secondary compact-button')}${button('remove', '×', 'icon-button', `data-list="equipment" data-index="${index}" aria-label="Remove item"`)}</div><div class="form-grid">${field('Quantity', `equipment.${index}.quantity`, 'number')}${field('Weight (lb Each)', `equipment.${index}.weight`, 'number')}</div><div class="inventory-item-details has-bonuses">${area('Notes', `equipment.${index}.notes`)}${itemBonuses(item, index, true)}</div></div>`;
  const compact = `<button type="button" class="inventory-item-summary" data-action="edit-item" data-index="${index}" aria-label="Edit ${name}"><strong>${name}</strong><span class="inventory-item-meta"><strong>${item.quantity}</strong> × · ${item.weight} lb each</span><span class="attack-edit-label">Edit</span></button>${details ? `<div class="inventory-item-details ${item.notes.trim() && item.bonuses?.length ? 'has-bonuses' : ''}">${details}</div>` : ''}`;
  return `<div class="inventory-row" data-inventory-index="${index}" ${inventoryMatches(item) ? '' : 'hidden'}><div class="inventory-item-controls"><button type="button" class="inventory-drag-handle icon-button" aria-label="Move ${name}" title="Drag to reorder; use Up or Down arrow keys when focused"><svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true"><path d="M3 5h12M3 9h12M3 13h12" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" /></svg></button><label class="check"><input aria-label="${name} equipped" type="checkbox" data-field="equipment.${index}.equipped" ${item.equipped ? 'checked' : ''} /></label></div><div class="inventory-item-content">${editing ? editor : compact}</div></div>`;
}

function inventoryMatches(item) {
  const query = inventorySearch.trim().toLocaleLowerCase();
  return (
    (!inventoryModifiersOnly || Boolean(item.bonuses?.length)) &&
    `${item.name} ${window.StatfolioText.plain(item.notes)}`
      .toLocaleLowerCase()
      .includes(query)
  );
}

// Keep item objects intact so expanded notes and other item data follow the move.
function moveInventoryItem(character, item, target, before) {
  const from = character.equipment.indexOf(item);
  const targetIndex = character.equipment.indexOf(target);
  if (from < 0 || targetIndex < 0 || item === target) return;
  let destination = targetIndex + (before ? 0 : 1);
  if (from < destination) destination--;
  if (from === destination) return;
  character.equipment.splice(from, 1);
  character.equipment.splice(destination, 0, item);
  changed();
  renderCharacter();
  $(`[data-inventory-index="${destination}"] .inventory-drag-handle`)?.focus();
}

let inventoryDrag = null;

function clearInventoryDrag() {
  document
    .querySelectorAll(
      '.inventory-dragging, .inventory-drop-before, .inventory-drop-after',
    )
    .forEach((row) => {
      row.classList.remove(
        'inventory-dragging',
        'inventory-drop-before',
        'inventory-drop-after',
      );
    });
  inventoryDrag = null;
}

document.addEventListener('pointerdown', (event) => {
  const handle = event.target.closest('.inventory-drag-handle');
  if (!handle || event.button !== 0) return;
  const character = current();
  const row = handle.closest('[data-inventory-index]');
  inventoryDrag = {
    character,
    item: character.equipment[Number(row.dataset.inventoryIndex)],
    row,
    pointerId: event.pointerId,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    target: null,
  };
  handle.setPointerCapture?.(event.pointerId);
});

document.addEventListener('pointermove', (event) => {
  const drag = inventoryDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  if (current() !== drag.character || page !== 'equipment') {
    clearInventoryDrag();
    return;
  }
  if (
    !drag.moved &&
    Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 5
  )
    return;
  drag.moved = true;
  drag.row.classList.add('inventory-dragging');
  document
    .querySelectorAll('.inventory-drop-before, .inventory-drop-after')
    .forEach((row) =>
      row.classList.remove('inventory-drop-before', 'inventory-drop-after'),
    );
  const row = document
    .elementFromPoint(event.clientX, event.clientY)
    ?.closest('[data-inventory-index]');
  drag.target = null;
  if (!row || row.hidden || row === drag.row) return;
  drag.target = drag.character.equipment[Number(row.dataset.inventoryIndex)];
  const bounds = row.getBoundingClientRect();
  drag.before = event.clientY < bounds.top + bounds.height / 2;
  row.classList.add(
    drag.before ? 'inventory-drop-before' : 'inventory-drop-after',
  );
});

document.addEventListener('pointerup', (event) => {
  const drag = inventoryDrag;
  if (!drag || event.pointerId !== drag.pointerId) return;
  clearInventoryDrag();
  if (
    drag.moved &&
    drag.target &&
    current() === drag.character &&
    page === 'equipment'
  )
    moveInventoryItem(drag.character, drag.item, drag.target, drag.before);
});

document.addEventListener('pointercancel', clearInventoryDrag);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && inventoryDrag) {
    clearInventoryDrag();
    return;
  }
  const handle = event.target.closest('.inventory-drag-handle');
  if (!handle || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
  event.preventDefault();
  const character = current();
  const item =
    character.equipment[
      Number(handle.closest('[data-inventory-index]').dataset.inventoryIndex)
    ];
  const visible = character.equipment.filter(inventoryMatches);
  const before = event.key === 'ArrowUp';
  const target = visible[visible.indexOf(item) + (before ? -1 : 1)];
  if (target) moveInventoryItem(character, item, target, before);
});

function filterInventory(character) {
  for (const row of document.querySelectorAll('[data-inventory-index]')) {
    row.hidden = !inventoryMatches(
      character.equipment[Number(row.dataset.inventoryIndex)],
    );
    if (!row.hidden) growTextAreas(row);
  }
  $('#inventory-search-empty').hidden =
    !character.equipment.length || character.equipment.some(inventoryMatches);
}

const filteredSkills = () =>
  Object.entries(skills).filter(([name]) =>
    name.toLocaleLowerCase().includes(skillSearch.trim().toLocaleLowerCase()),
  );

const mod = (n) => Math.floor((Number(n) - 10) / 2);

const sign = (n) => (n >= 0 ? `+${n}` : String(n));

let state = { characters: [], selected: null };
let page = 'overview';
let librarySearch = '';
let noteId = null;
let db;
let saveTimer;
let saveQueue = Promise.resolve();
let revision = 0;
let savedRevision = 0;
let saveFailed = false;

const dayInMilliseconds = 24 * 60 * 60 * 1000;
const pendingBackupEdits = new WeakSet();

function backupHistory() {
  state.backupHistory ||= {
    lastExportAt: null,
    firstChangeAt: null,
    changesSinceExport: 0,
    dismissedUntil: 0,
  };

  return state.backupHistory;
}

function backupRecommended(now = Date.now()) {
  const history = backupHistory();
  const baseline = history.lastExportAt || history.firstChangeAt;
  if (
    !state.characters.length ||
    !history.changesSinceExport ||
    !baseline ||
    history.dismissedUntil > now
  )
    return false;

  const age = now - Date.parse(baseline);
  return (
    age >= 7 * dayInMilliseconds ||
    (age >= dayInMilliseconds && history.changesSinceExport >= 20)
  );
}

function backupStatus() {
  const history = backupHistory();
  const date = history.lastExportAt ? new Date(history.lastExportAt) : null;
  const lastExport = date
    ? `<span title="Download generated ${esc(date.toLocaleString())}">Last backup: <time datetime="${esc(history.lastExportAt)}">${esc(date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))}</time></span>`
    : '<span>No backup exported</span>';

  return `${lastExport}${backupRecommended() ? `<span class="backup-reminder" role="status">Backup recommended ${button('dismiss-backup-reminder', 'Dismiss', 'text-button', 'aria-label="Dismiss backup reminder for one day"')}</span>` : ''}`;
}

function renderBackupStatus() {
  const target = $('#backup-status');
  if (target) target.innerHTML = backupStatus();
}

function recordBackupChange() {
  const history = backupHistory();
  history.firstChangeAt ||= new Date().toISOString();
  history.changesSinceExport++;
  renderBackupStatus();
}

function loadBackupHistory(saved = {}) {
  const validDate = (value) =>
    typeof value === 'string' && Number.isFinite(Date.parse(value));

  return {
    lastExportAt: validDate(saved?.lastExportAt) ? saved.lastExportAt : null,
    firstChangeAt: validDate(saved?.firstChangeAt) ? saved.firstChangeAt : null,
    changesSinceExport:
      Number.isSafeInteger(saved?.changesSinceExport) &&
      saved.changesSinceExport >= 0
        ? saved.changesSinceExport
        : 0,
    dismissedUntil:
      Number.isFinite(saved?.dismissedUntil) && saved.dismissedUntil >= 0
        ? saved.dismissedUntil
        : 0,
  };
}

// Character defaults and browser storage.
function blank(name = 'New adventurer') {
  return {
    id: uid(),
    name,
    class: '',
    subclass: '',
    level: 1,
    species: '',
    background: '',
    alignment: '',
    player: '',
    xp: 0,
    image: '',

    abilities: [10, 10, 10, 10, 10, 10],
    saves: [],
    skills: [],
    expertise: [],

    hp: 10,
    maxHp: 10,
    tempHp: 0,
    ac: 10,
    speed: 30,
    initiativeBonus: 0,
    hitDice: '1d8',
    hitDiceLeft: 1,
    inspiration: false,
    deathSuccess: 0,
    deathFailure: 0,
    conditions: '',
    activeConditions: [],
    exhaustionLevel: 0,

    attacks: [],
    resources: [],
    combatLog: [],
    lastShortRest: '',
    lastLongRest: '',
    features: '',

    spells: [],
    spellAbility: 3,
    slots: Array(9).fill(0),
    usedSlots: Array(9).fill(0),
    spellNotes: '',
    concentrationSpell: '',
    concentrationDamage: [],

    equipment: [],
    coins: { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 },
    proficiencies: '',

    appearance: '',
    personality: '',
    ideals: '',
    bonds: '',
    flaws: '',
    story: '',
    allies: '',

    notes: [],
    updated: new Date().toISOString(),
  };
}

const current = () => state.characters.find((c) => c.id === state.selected);

const prof = (c) => 2 + Math.floor((c.level - 1) / 4);

const healthTotal = (c) => c.hp + c.tempHp;

const healthReadout = (c) =>
  /* HTML */ `<strong title="${c.hp} current HP + ${c.tempHp} temporary HP"
    >${healthTotal(c)}/${c.maxHp}</strong
  >`;

const get = (object, path) =>
  path.split('.').reduce((value, key) => value?.[key], object);

function set(object, path, value) {
  const parts = path.split('.');
  const property = parts.pop();
  const parent = parts.reduce((value, key) => value[key], object);

  parent[property] = value;
}

function toast(message) {
  $('#toast').textContent = message;
  $('#toast').classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 4000);
}

function status(message, error = false) {
  const el = $('#save-status');
  if (el) {
    el.textContent = message;
    el.classList.toggle('error', error);
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = null;
  const snapshot = structuredClone(state),
    version = revision;
  saveQueue = saveQueue
    .catch(() => {})
    .then(
      () =>
        new Promise((resolve, reject) => {
          const tx = db.transaction('folio', 'readwrite');
          tx.objectStore('folio').put(snapshot, 'state');
          tx.oncomplete = () => {
            savedRevision = version;
            saveFailed = false;
            if (version === revision) status('● All changes saved');
            resolve();
          };
          tx.onerror = () => reject(tx.error);
          tx.onabort = () => reject(tx.error || new Error('Save interrupted'));
        }),
    )
    .catch((e) => {
      saveFailed = true;
      status('Save failed · export a backup', true);
      toast('Browser save failed. Export a backup to protect your changes.');
      console.error(e);
      throw e;
    });
  saveQueue.catch(() => {});
  return saveQueue;
}

function changed(trackBackup = true) {
  revision++;
  if (trackBackup) recordBackupChange();
  const c = current();
  if (c) c.updated = new Date().toISOString();
  status('● Saving…');
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    persist().catch(() => {});
  }, 250);
}

const field = (label, path, type = 'text', opts = {}) =>
  /* HTML */ `<label class="field ${opts.wide ? 'wide' : ''}"
    ><span>${label}</span
    ><input
      ${type === 'number' ? `${path === 'initiativeBonus' ? '' : `min="${path === 'level' ? 1 : 0}"`} ${path.endsWith('.weight') ? 'step="any"' : ''}` : ''}
      ${opts.max !== undefined ? `max="${opts.max}"` : ''}
      type="${type}"
      data-field="${path}"
      value="${esc(get(current(), path))}"
      ${opts.placeholder ? `placeholder="${esc(opts.placeholder)}"` : ''}
  /></label>`;

const area = (label, path, placeholder = '') =>
  /* HTML */ `<label class="field wide"
    ><span>${label}</span
    ><textarea rows="2" data-field="${path}" placeholder="${esc(placeholder)}">
${esc(get(current(), path))}</textarea>
  </label>`;

const empty = (title, sub, action = '') =>
  /* HTML */ `<div class="empty"
    ><div class="empty-mark">✧</div><h3>${title}</h3><p>${sub}</p>${action}</div
  >`;

const button = (action, label, cls = '', data = '') =>
  /* HTML */ `<button class="${cls}" data-action="${action}" ${data}
    >${label}</button
  >`;

// Page rendering and form layout.
function shell() {
  hideSpellPopup();
  const c = current();
  $('#app').innerHTML = /* HTML */ `<div class="workspace"
    ><main id="main"></main
    ><footer class="page-footer"
      ><div class="storage-info"
        ><span>Saved in this browser</span
        ><span
          id="save-status"
          class="save-status ${saveFailed ? 'error' : ''}"
          role="status"
          >${saveFailed ? 'Save failed · export a backup' : revision !== savedRevision ? '● Saving…' : '● All changes saved'}</span
        ></div
      ><div class="backup-actions"
        ><span id="backup-status">${backupStatus()}</span
        >${button('backup', 'Export backup', 'text-button')}${button('restore', 'Restore backup', 'text-button')}</div
      ></footer
    ></div
  >`;
  if (c) renderCharacter();
  else renderLibrary();
}

function renderLibrary() {
  const characters = state.characters.filter((c) =>
    `${c.name} ${c.class} ${c.species}`
      .toLowerCase()
      .includes(librarySearch.toLowerCase()),
  );
  $('#main').innerHTML = /* HTML */ `<section class="page-heading"
      ><div><h1>Characters</h1><p>Your 5e sheets and notes.</p></div
      >${button('new', '＋ Create character', 'primary')}</section
    ><div class="library-tools"
      ><span class="muted"
        >${state.characters.length}
        character${state.characters.length === 1 ? '' : 's'}</span
      ><input
        aria-label="Search characters"
        id="library-search"
        class="search"
        placeholder="⌕  Search your characters…"
        value="${esc(librarySearch)}" /></div
    ><div class="character-grid"
      >${characters
        .map(
          (c) =>
            /* HTML */ `<article class="character-card"
              ><button
                class="card-art ${c.image ? 'has-image' : ''}"
                data-action="open"
                data-id="${c.id}"
                aria-label="Open ${esc(c.name)}"
                >${c.image ? /* HTML */ `<img src="${esc(c.image)}" alt="Portrait of ${esc(c.name)}" />` : /* HTML */ `<div class="sigil">${esc(c.name.slice(0, 1).toUpperCase())}</div><div class="art-lines">✧</div>`}<span
                  class="level-tag"
                  >LEVEL ${c.level}</span
                ></button
              ><div class="card-body"
                ><div class="card-kicker"
                  >${esc(c.species || 'Species unwritten')}
                  <span>•</span> ${esc(c.class || 'Class unwritten')}</div
                ><h3
                  ><button
                    class="text-button"
                    data-action="open"
                    data-id="${c.id}"
                    >${esc(c.name)}</button
                  ></h3
                ><div class="card-stats"
                  ><span>${healthReadout(c)} HIT POINTS</span
                  ><span
                    ><strong ${statHint(c, 'ac')}>${statValue(c, 'ac')}</strong>
                    ARMOR CLASS</span
                  ><span><strong>${c.notes.length}</strong> NOTES</span></div
                ><div class="card-bottom"
                  ><span
                    >Updated
                    ${new Date(c.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span
                  ><div class="card-actions"
                    >${button('duplicate', 'Duplicate', 'text-button', `data-id="${c.id}" aria-label="Duplicate ${esc(c.name)}"`)}${button('open', 'Open folio ↗', 'text-button', `data-id="${c.id}"`)}</div
                  ></div
                ></div
              ></article
            >`,
        )
        .join('')}</div
    >${!characters.length ? empty(state.characters.length ? 'No Matching Characters' : 'No Characters Yet', state.characters.length ? 'Try a different search.' : 'Create a character to start your sheet and journal.') : ''}`;
}

function renderCharacter() {
  hideSpellPopup();
  const c = current();
  if (skillCharacterId !== c.id) {
    skillCharacterId = c.id;
    skillSearch = '';
    inventorySearch = '';
    inventoryModifiersOnly = false;
    spellFilters = {
      name: '',
      level: '',
      school: '',
      prepared: '',
      concentration: '',
      ritual: '',
    };
    editingAttack = null;
    editingSpell = null;
    editingItem = null;
  }
  const html = /* HTML */ `<button
      class="back-link text-button"
      data-action="library"
      >← Characters</button
    ><section class="character-heading"
      ><button
        class="portrait"
        data-action="portrait"
        aria-label="Change portrait"
        >${c.image ? /* HTML */ `<img src="${esc(c.image)}" alt="Character portrait" />` : /* HTML */ `<span>${esc(c.name[0] || '✧')}</span>`}<small
          >EDIT</small
        ></button
      ><div class="character-title"
        ><div class="eyebrow">YOUR ADVENTURER · LEVEL ${c.level}</div
        ><h1>${esc(c.name)}</h1
        ><p
          >${esc([c.species, c.class, c.subclass].filter(Boolean).join(' · ') || 'An unwritten story. Make it yours.')}</p
        ></div
      ><div class="character-actions"
        >${button('rename', 'Edit identity', 'secondary')}${button('menu', '•••', 'secondary', 'aria-label="Character options"')}</div
      ></section
    ><div class="section-tabs"
      >${pages.map(([id, label]) => /* HTML */ `<button data-page="${id}" class="${page === id ? 'selected' : ''}">${label}</button>`).join('')}</div
    ><div id="page-content">${views[page](c)}</div>`;
  patchContent($('#main'), html);
  growTextAreas($('#main'));
}

function renderPage(nextPage) {
  const c = current();
  const content = $('#page-content');
  if (!c || !content || !Object.hasOwn(views, nextPage)) return;

  // Build the next view before changing the live DOM. A page-specific render
  // should never tear down the workspace or leave an empty shell behind.
  const template = document.createElement('template');
  const previousPage = page;
  try {
    page = nextPage;
    template.innerHTML = views[nextPage](c);
    prepareTextEditors(template.content);
  } finally {
    page = previousPage;
  }
  hideSpellPopup();
  page = nextPage;
  for (const tab of document.querySelectorAll('.section-tabs [data-page]'))
    tab.classList.toggle('selected', tab.dataset.page === page);
  content.replaceChildren(template.content);
  growTextAreas(content);
}

function growTextArea(el) {
  if (el.hidden) return;
  el.style.height = 'auto';
  const style = getComputedStyle(el);
  const borders =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  el.style.height = `${Math.ceil(el.scrollHeight + borders)}px`;
}

function growTextAreas(root = document) {
  prepareTextEditors(root);
  // Batch writes and reads so each field doesn't force a fresh page layout.
  const fields = [...root.querySelectorAll('textarea')].filter(
    (el) => !el.hidden,
  );
  fields.forEach((el) => {
    el.style.height = 'auto';
  });
  const heights = fields.map((el) => {
    const style = getComputedStyle(el);
    return Math.ceil(
      el.scrollHeight +
        (parseFloat(style.borderTopWidth) || 0) +
        (parseFloat(style.borderBottomWidth) || 0),
    );
  });
  fields.forEach((el, index) => {
    el.style.height = `${heights[index]}px`;
  });
}

// Unfocused fields show formatted text; focusing reveals the Markdown source.
function prepareTextEditors(root) {
  for (const textarea of root.querySelectorAll('textarea')) {
    if (textarea.parentElement?.classList.contains('markdown-editor')) continue;
    const editor = document.createElement('div');
    editor.className = 'markdown-editor';
    const preview = document.createElement('div');
    preview.className = 'markdown-preview';
    preview.tabIndex = 0;
    preview.setAttribute('role', 'textbox');
    preview.setAttribute('aria-multiline', 'true');
    preview.setAttribute(
      'aria-label',
      textarea.getAttribute('aria-label') ||
        textarea.closest('label')?.querySelector('span')?.textContent ||
        'Text',
    );
    preview.title = 'Click to edit';
    textarea.before(editor);
    editor.append(textarea, preview);
    showTextPreview(editor, document.activeElement !== textarea);
  }
}

function showTextPreview(editor, visible) {
  const textarea = $('textarea', editor);
  const preview = $('.markdown-preview', editor);
  textarea.hidden = visible;
  preview.hidden = !visible;
  preview.innerHTML = formatText(textarea.value);
  if (!textarea.value) {
    const placeholder = document.createElement('span');
    placeholder.className = 'muted';
    placeholder.textContent = textarea.placeholder || 'Click to add text…';
    preview.append(placeholder);
  }
}

function applyTextFormat(textarea, kind) {
  const marker = kind === 'bold' ? '**' : '*';
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const hasFormat = (left, right) =>
    kind === 'bold'
      ? left >= 2 && right >= 2
      : left % 2 === 1 && right % 2 === 1;
  const surrounding = hasFormat(
    textarea.value.slice(0, start).match(/\*+$/)?.[0].length || 0,
    textarea.value.slice(end).match(/^\*+/)?.[0].length || 0,
  );
  let replacement;
  let from = start;
  let to = end;
  let selectionStart;
  let selectionEnd;
  if (surrounding) {
    from -= marker.length;
    to += marker.length;
    replacement = selected;
    selectionStart = from;
    selectionEnd = from + selected.length;
  } else if (
    selected.length > marker.length * 2 &&
    hasFormat(
      selected.match(/^\*+/)?.[0].length || 0,
      selected.match(/\*+$/)?.[0].length || 0,
    )
  ) {
    replacement = selected.slice(marker.length, -marker.length);
    selectionStart = start;
    selectionEnd = start + replacement.length;
  } else {
    replacement = marker + selected + marker;
    selectionStart = start + marker.length;
    selectionEnd = selectionStart + selected.length;
  }
  textarea.focus();
  textarea.setSelectionRange(from, to);
  // Native insertion preserves the browser's undo history where supported.
  const nativeInsert =
    typeof document.execCommand === 'function' &&
    document.execCommand('insertText', false, replacement);
  if (!nativeInsert) textarea.setRangeText(replacement, from, to, 'preserve');
  textarea.setSelectionRange(selectionStart, selectionEnd);
  if (!nativeInsert)
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
  textarea.dispatchEvent(new Event('change', { bubbles: true }));
}

function editFormattedText(preview) {
  const editor = preview.closest('.markdown-editor');
  const textarea = $('textarea', editor);
  showTextPreview(editor, false);
  textarea.focus();
  growTextArea(textarea);
}

document.addEventListener('click', (event) => {
  const preview = event.target.closest('.markdown-preview');
  if (!preview) return;
  event.preventDefault();
  editFormattedText(preview);
});

document.addEventListener('focusin', (event) => {
  const target = event.target;
  if (target.classList.contains('markdown-preview')) editFormattedText(target);
  else if (target.tagName === 'TEXTAREA' && target.closest('.markdown-editor'))
    showTextPreview(target.closest('.markdown-editor'), false);
});

document.addEventListener('focusout', (event) => {
  const textarea = event.target;
  if (textarea.tagName === 'TEXTAREA' && textarea.closest('.markdown-editor'))
    showTextPreview(textarea.closest('.markdown-editor'), true);
});

document.addEventListener('keydown', (event) => {
  const textarea = event.target;
  if (
    textarea.tagName !== 'TEXTAREA' ||
    event.isComposing ||
    event.altKey ||
    !(event.ctrlKey || event.metaKey) ||
    !['b', 'i'].includes(event.key.toLowerCase())
  )
    return;
  event.preventDefault();
  applyTextFormat(
    textarea,
    event.key.toLowerCase() === 'b' ? 'bold' : 'italic',
  );
});

const bulletIndent = ' '.repeat(12);

const bulletForIndent = (indent) =>
  ['●', '○', '■'][Math.min(2, Math.ceil(indent.length / bulletIndent.length))];

// Multiline lists use plain text so bullets survive backups and exports.
function formatTextBullet(el) {
  if (el.selectionStart !== el.selectionEnd) return;
  const end = el.selectionStart;
  const start = el.value.lastIndexOf('\n', end - 1) + 1;
  const match = el.value.slice(start, end).match(/^([ \t]*)[-*] $/);
  if (!match) return;
  const indent = match[1].replace(/\t/g, bulletIndent);
  el.setRangeText(`${indent}${bulletForIndent(indent)} `, start, end, 'end');
}

function handleTextListKey(event) {
  const el = event.target;
  if (
    el.tagName !== 'TEXTAREA' ||
    event.isComposing ||
    event.ctrlKey ||
    event.metaKey ||
    event.altKey
  )
    return;
  const cursor = el.selectionStart;
  const start = cursor === 0 ? 0 : el.value.lastIndexOf('\n', cursor - 1) + 1;
  const next = el.value.indexOf('\n', cursor);
  const end = next === -1 ? el.value.length : next;
  const line = el.value.slice(start, end);
  const match = line.match(/^( *)([●○■•◦▪]) (.*)$/);
  if (
    event.key === 'Backspace' &&
    match &&
    cursor === el.selectionEnd &&
    cursor === start + match[1].length + 2
  ) {
    event.preventDefault();
    el.setRangeText('', start, cursor, 'end');
    el.dispatchEvent(new Event('input', { bubbles: true }));
    return;
  }
  if (
    event.key === 'Tab' &&
    match &&
    !el.value.slice(cursor, el.selectionEnd).includes('\n')
  ) {
    event.preventDefault();
    const indent = event.shiftKey
      ? match[1].slice(bulletIndent.length)
      : match[1] + bulletIndent;
    const prefix = `${indent}${bulletForIndent(indent)} `;
    const oldLength = match[1].length + 2;
    const selectionEnd = el.selectionEnd;
    el.setRangeText(prefix, start, start + oldLength, 'preserve');
    el.setSelectionRange(
      Math.max(start + prefix.length, cursor + prefix.length - oldLength),
      Math.max(start + prefix.length, selectionEnd + prefix.length - oldLength),
    );
  } else if (event.key === 'Enter' && !event.shiftKey && match) {
    event.preventDefault();
    if (!match[3].trim()) {
      const indent = match[1].slice(bulletIndent.length);
      el.setRangeText(
        match[1] ? `${indent}${bulletForIndent(indent)} ` : '',
        start,
        end,
        'end',
      );
    } else {
      el.setRangeText(
        `\n${match[1]}${bulletForIndent(match[1])} `,
        cursor,
        el.selectionEnd,
        'end',
      );
    }
  } else return;
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

let textAreaFrame;

window.addEventListener('resize', () => {
  cancelAnimationFrame(textAreaFrame);
  textAreaFrame = requestAnimationFrame(() => growTextAreas());
});

// Preserve existing controls during stat updates so blur events don't swallow a click

// and editing one field doesn't discard focus or the user's selection in another.
function patchContent(target, html) {
  const template = document.createElement('template');
  template.innerHTML = html;
  function sync(oldNode, newNode) {
    if (
      oldNode.nodeType !== newNode.nodeType ||
      oldNode.nodeName !== newNode.nodeName
    ) {
      oldNode.replaceWith(newNode.cloneNode(true));
      return;
    }
    if (oldNode.nodeType === 3) {
      if (oldNode.textContent !== newNode.textContent)
        oldNode.textContent = newNode.textContent;
      return;
    }
    if (oldNode.nodeType !== 1) return;
    if (
      oldNode.classList.contains('markdown-editor') &&
      newNode.classList.contains('markdown-editor') &&
      $('textarea', oldNode) === document.activeElement &&
      !$('textarea', oldNode).hidden
    )
      showTextPreview(newNode, false);
    for (const attr of [...oldNode.attributes])
      if (!newNode.hasAttribute(attr.name)) oldNode.removeAttribute(attr.name);
    for (const attr of newNode.attributes)
      if (oldNode.getAttribute(attr.name) !== attr.value)
        oldNode.setAttribute(attr.name, attr.value);
    if (oldNode.tagName === 'TEXTAREA') {
      if (oldNode !== document.activeElement) oldNode.value = newNode.value;
      return;
    }
    if (oldNode.tagName === 'INPUT') {
      if (oldNode.type === 'checkbox') oldNode.checked = newNode.checked;
      else if (oldNode !== document.activeElement)
        oldNode.value = newNode.value;
      return;
    }
    while (oldNode.childNodes.length > newNode.childNodes.length)
      oldNode.lastChild.remove();
    for (let i = 0; i < newNode.childNodes.length; i++) {
      const oldChild = oldNode.childNodes[i],
        newChild = newNode.childNodes[i];
      if (!oldChild) oldNode.appendChild(newChild.cloneNode(true));
      else sync(oldChild, newChild);
    }
    if (oldNode.tagName === 'SELECT' && oldNode !== document.activeElement)
      oldNode.value = newNode.value;
  }
  const wrapper = document.createElement(target.tagName);
  for (const attr of target.attributes)
    wrapper.setAttribute(attr.name, attr.value);
  wrapper.append(template.content);
  prepareTextEditors(wrapper);
  sync(target, wrapper);
}

const panel = (title, body, extra = '') =>
  /* HTML */ `<section class="panel"
    ><div class="panel-heading"><h2>${title}</h2>${extra}</div
    ><div class="panel-body">${body}</div></section
  >`;

function abilityTiles(c) {
  return /* HTML */ `<div class="ability-grid"
    >${abilities.map((a, i) => /* HTML */ `<div class="ability-tile"><span>${a}</span><strong ${statHint(c, `ability.${i}`)}>${sign(statValue(c, `ability.${i}`))}</strong><input type="number" min="1" max="30" aria-label="${a} score" data-field="abilities.${i}" value="${c.abilities[i]}" /></div>`).join('')}</div
  >`;
}

// Keep each damage source until the player resolves its concentration save.
function endConcentration(character) {
  character.concentrationSpell = '';
  character.concentrationDamage = [];
}

function startConcentration(character, index) {
  const spell = character.spells[index];
  if (!spell || !spellFlag(spell, 'concentration') || !spell.name.trim())
    return;
  if (character.hp === 0) {
    toast('Recover hit points before starting concentration.');
    return;
  }
  // Selecting the active spell must not discard unresolved saves.
  if (character.concentrationSpell === spell.name.trim()) return;
  endConcentration(character);
  character.concentrationSpell = spell.name.trim();
  changed();
  renderCharacter();
}

function favoriteButton(list, entry, index) {
  const name =
    entry.name.trim() ||
    (list === 'spells' ? 'unnamed spell' : 'unnamed attack');
  return button(
    'toggle-combat-favorite',
    entry.favorite ? '★' : '☆',
    'favorite-toggle',
    `data-list="${list}" data-index="${index}" aria-label="${entry.favorite ? 'Unpin' : 'Pin'} ${esc(name)}" aria-pressed="${Boolean(entry.favorite)}" title="${entry.favorite ? 'Unpin from' : 'Pin to'} Top of Section"`,
  );
}

function spellCardActions(character, spell, index) {
  if (!spell.name.trim()) return '';
  const cast = button(
    'cast-spell',
    'Cast',
    'secondary cast-button',
    `data-index="${index}" aria-label="Cast ${esc(spell.name)}"`,
  );
  const active = character.concentrationSpell === spell.name.trim();
  const canEnd = active && page === 'spells';
  const concentration = spellFlag(spell, 'concentration')
    ? button(
        canEnd ? 'end-concentration' : 'start-concentration',
        canEnd ? 'End' : active ? 'Concentrating' : 'Concentrate',
        'secondary',
        `data-index="${index}" aria-label="${canEnd ? 'End concentration on' : active ? 'Concentrating on' : 'Concentrate on'} ${esc(spell.name)}" aria-pressed="${active}" ${active && !canEnd ? 'disabled' : ''}`,
      )
    : '';
  return `<div class="spell-card-actions">${cast}${concentration}</div>`;
}

function castSpellPreview(character, spell, level) {
  const lines = [];
  if (character.hp === 0) lines.push('Recover hit points before casting.');
  if (spell.level === 0) lines.push('Cantrip: no spell slot is spent.');
  else if (Number.isInteger(level) && level >= spell.level && level <= 9) {
    const remaining = Math.max(
      0,
      character.slots[level - 1] - character.usedSlots[level - 1],
    );
    lines.push(
      `Level ${level} slots remaining: ${remaining} → ${Math.max(0, remaining - 1)}`,
    );
  } else lines.push('No available spell slots at this level or higher.');
  if (spellFlag(spell, 'concentration')) {
    lines.push(
      character.concentrationSpell
        ? `Replace concentration on ${character.concentrationSpell} with ${spell.name}.`
        : `Start concentrating on ${spell.name}.`,
    );
  }
  return `<ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>`;
}

function openCastSpellModal(character, index) {
  const spell = character.spells[index];
  if (!spell || !spell.name.trim()) return;
  const levels = Array.from(
    { length: 10 - Math.max(1, spell.level) },
    (_, offset) => Math.max(1, spell.level) + offset,
  );
  const available = (level) =>
    Math.max(0, character.slots[level - 1] - character.usedSlots[level - 1]);
  const firstLevel =
    spell.level === 0 ? 0 : levels.find((level) => available(level) > 0);
  const selector =
    spell.level === 0
      ? '<input type="hidden" name="slot-level" value="0" />'
      : `<label class="field"><span>Slot Level</span><select name="slot-level" id="cast-slot-level">${firstLevel === undefined ? '<option value="">No available slots</option>' : ''}${levels.map((level) => `<option value="${level}" ${level === firstLevel ? 'selected' : ''} ${available(level) === 0 ? 'disabled' : ''}>Level ${level} · ${available(level)} available${level > spell.level ? ' · Upcast' : ''}</option>`).join('')}</select></label>`;
  modal(
    'Cast Spell',
    /* HTML */ `<div class="cast-popup"
      ><h3>${esc(spell.name)}</h3>${selector}<section
        class="rest-preview"
        aria-live="polite"
        ><h3>Casting Preview</h3
        ><div id="cast-preview"
          >${castSpellPreview(character, spell, firstLevel)}</div
        ></section
      ></div
    >`,
    (data) => {
      if (!character.spells.includes(spell))
        throw Error('This spell is no longer in your spellbook.');
      if (character.hp === 0) throw Error('Recover hit points before casting.');
      const level = Number(data.get('slot-level'));
      if (
        spell.level === 0
          ? level !== 0
          : !Number.isInteger(level) ||
            level < spell.level ||
            level > 9 ||
            available(level) < 1
      )
        throw Error('Choose an available slot at the spell’s level or higher.');
      const before = combatSnapshot(character, [
        'concentrationSpell',
        'concentrationDamage',
        ...(level > 0 ? [`usedSlots.${level - 1}`] : []),
      ]);
      if (level > 0) character.usedSlots[level - 1]++;
      if (spellFlag(spell, 'concentration')) {
        endConcentration(character);
        character.concentrationSpell = spell.name.trim();
      }
      const recorded = recordCombatEvent(
        character,
        `Cast ${spell.name}${level > 0 ? ` · Level ${level}` : ' · Cantrip'}`,
        before,
      );
      if (recorded) changed();
      renderCharacter();
      toast(`${spell.name} cast${level > 0 ? ` at level ${level}` : ''}.`);
    },
    'Cast Spell',
  );
  $('#modal button[type="submit"]').disabled =
    firstLevel === undefined || character.hp === 0;
  $('#cast-slot-level')?.addEventListener('change', (event) => {
    $('#cast-preview').innerHTML = castSpellPreview(
      character,
      spell,
      Number(event.target.value),
    );
  });
}

function concentrationTracker(character, showLabel = true) {
  const active = character.concentrationSpell;
  const damage = character.concentrationDamage || [];
  const candidates = character.spells
    .map((spell, index) => ({ spell, index }))
    .filter(
      ({ spell }) => spellFlag(spell, 'concentration') && spell.name.trim(),
    );
  const saveBonus = statValue(character, 'save.2');
  const reminder =
    active && damage.length
      ? `<div class="concentration-reminder" role="status"><span><strong>Constitution save · DC ${Math.max(10, Math.floor(damage[0] / 2))}</strong><small>${damage[0]} damage · Save bonus ${sign(saveBonus)}${damage.length > 1 ? ` · ${damage.length} saves pending` : ''}</small></span><div class="concentration-actions">${button('concentration-pass', 'Pass', 'secondary')}${button('concentration-fail', 'Fail', 'secondary danger')}</div></div>`
      : '';

  return `<div class="concentration-tracker"><div class="concentration-heading">${showLabel ? '<span>Concentration</span>' : ''}<strong>${esc(active || 'None')}</strong>${active ? button('end-concentration', 'End', 'text-button') : ''}</div>
    ${candidates.length ? `<select id="concentration-spell" aria-label="Start or switch concentration spell"><option value="">${active ? 'Switch spell…' : 'Start concentrating…'}</option>${candidates.map(({ spell, index }) => `<option value="${index}">${esc(spell.name)}${spell.level ? ` · Level ${spell.level}` : ' · Cantrip'}</option>`).join('')}</select>` : ''}
    ${reminder}</div>`;
}

// Combat history stores only reversible changes to a small, explicit set of fields.
const pendingCombatEdits = new WeakMap();
const healthLogFields = [
  'hp',
  'tempHp',
  'deathSuccess',
  'deathFailure',
  'concentrationSpell',
  'concentrationDamage',
];

function combatTarget(character, target) {
  if (
    healthLogFields.includes(target) ||
    [
      'hitDiceLeft',
      'exhaustionLevel',
      'lastShortRest',
      'lastLongRest',
    ].includes(target)
  )
    return { object: character, key: target };
  const slot = target.match(/^usedSlots\.([0-8])$/);
  if (slot) return { object: character.usedSlots, key: Number(slot[1]) };
  if (target.startsWith('attack:')) {
    const attack = character.attacks.find(
      (entry) => entry.id === target.slice(7),
    );
    if (attack) return { object: attack, key: 'usesSpent' };
  }
  if (target.startsWith('resource:')) {
    const resource = character.resources.find(
      (entry) => entry.id === target.slice(9),
    );
    if (resource) return { object: resource, key: 'remaining' };
  }
  return null;
}

function combatSnapshot(character, targets = healthLogFields) {
  return targets.map((target) => {
    const location = combatTarget(character, target);
    return { target, before: structuredClone(location.object[location.key]) };
  });
}

function recordCombatEvent(character, label, snapshot) {
  const changes = snapshot
    .map(({ target, before }) => {
      const location = combatTarget(character, target);
      return {
        target,
        before,
        after: structuredClone(location.object[location.key]),
      };
    })
    .filter(
      ({ before, after }) => JSON.stringify(before) !== JSON.stringify(after),
    );
  if (!changes.length) return false;
  character.combatLog.unshift({
    id: uid(),
    at: new Date().toISOString(),
    label,
    changes,
    undone: false,
  });
  character.combatLog.length = Math.min(character.combatLog.length, 100);
  return true;
}

function combatUndoReason(character, entry) {
  if (entry.undone) return 'Already undone.';
  if (character.combatLog.find((item) => !item.undone) !== entry)
    return 'Undo newer entries first.';
  for (const change of entry.changes) {
    const location = combatTarget(character, change.target);
    if (
      !location ||
      JSON.stringify(location.object[location.key]) !==
        JSON.stringify(change.after)
    )
      return 'Values have changed since this entry.';
    if (change.target.startsWith('attack:')) {
      const attack = character.attacks.find(
        (item) => item.id === change.target.slice(7),
      );
      if (!attackHasUses(attack) || change.before > attack.useLimit)
        return 'The use limit has changed since this entry.';
    }
    if (change.target === 'hp' && change.before > character.maxHp)
      return 'Previous HP exceeds the current maximum.';
    if (
      change.target === 'concentrationSpell' &&
      change.before &&
      character.hp === 0 &&
      !entry.changes.some((item) => item.target === 'hp' && item.before > 0)
    )
      return 'Concentration cannot resume at 0 HP.';
  }
  return '';
}

function combatChangeText(change) {
  const labels = {
    hp: 'HP',
    tempHp: 'Temp HP',
    deathSuccess: 'Death saves passed',
    deathFailure: 'Death saves failed',
    concentrationSpell: 'Concentration',
    concentrationDamage: 'Pending saves',
    hitDiceLeft: 'Hit dice',
    exhaustionLevel: 'Exhaustion',
    lastShortRest: 'Last short rest',
    lastLongRest: 'Last long rest',
  };
  const label =
    labels[change.target] ||
    (change.target.startsWith('usedSlots.')
      ? `Level ${Number(change.target.split('.')[1]) + 1} slots used`
      : change.target.startsWith('attack:')
        ? 'Uses Spent'
        : 'Remaining');
  const value = (item) =>
    Array.isArray(item)
      ? String(item.length)
      : typeof item === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(item)
        ? new Date(item).toLocaleString()
        : String(item || (typeof item === 'string' ? 'None' : 0));
  return `${label}: ${value(change.before)} → ${value(change.after)}`;
}

function combatLogEntries(character) {
  if (!character.combatLog.length)
    return '<p class="muted">No combat activity yet. Damage, healing, hit dice, spell slots, and resource changes will appear here.</p>';
  return character.combatLog
    .map((entry) => {
      const reason = combatUndoReason(character, entry);
      const date = new Date(entry.at);
      return /* HTML */ `<article
        class="combat-log-entry ${entry.undone ? 'is-undone' : ''}"
        ><div class="combat-log-entry-heading"
          ><strong>${esc(entry.label)}</strong
          ><time
            datetime="${esc(entry.at)}"
            title="${esc(date.toLocaleString())}"
            >${esc(date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</time
          ></div
        ><div class="combat-log-entry-details"
          >${entry.changes.map((change) => `<span>${esc(combatChangeText(change))}</span>`).join('')}</div
        ><div class="combat-log-entry-actions"
          >${entry.undone ? '<span class="muted">Undone</span>' : button('undo-combat-event', 'Undo', 'secondary', `data-entry-id="${entry.id}" ${reason ? `disabled title="${esc(reason)}"` : ''}`)}</div
        ></article
      >`;
    })
    .join('');
}

function openCombatLog(character) {
  modal(
    'Combat Log',
    /* HTML */ `<p class="help"
        >Latest 100 entries · Undo newest first. Later edits to affected values
        can prevent undo.</p
      ><div class="combat-log" tabindex="0" aria-label="Recent combat activity"
        >${combatLogEntries(character)}</div
      >`,
    () => {},
    'Done',
  );
}

function trackCombatFieldInput(character, element) {
  if (pendingCombatEdits.has(element)) return;
  const path = element.dataset.field;
  let target;
  let label;
  const attackMatch = path.match(/^attacks\.(\d+)\.usesSpent$/);
  if (attackMatch) {
    const attack = character.attacks[Number(attackMatch[1])];
    if (!attackHasUses(attack)) return;
    attack.id ||= uid();
    attack.usesSpent ||= 0;
    pendingCombatEdits.set(element, {
      character,
      label: attack.name || 'Attack / Action',
      snapshot: combatSnapshot(character, [`attack:${attack.id}`]),
    });
    return;
  }
  const resourceMatch = path.match(/^resources\.(\d+)\.remaining$/);
  if (resourceMatch) {
    const resource = character.resources[Number(resourceMatch[1])];
    resource.id ||= uid();
    target = `resource:${resource.id}`;
    label = resource.name.trim() || 'Resource';
  } else if (/^usedSlots\.[0-8]$/.test(path)) {
    target = path;
    label = `Level ${Number(path.split('.')[1]) + 1} spell slots`;
  } else if (path === 'hitDiceLeft') {
    target = path;
    label = 'Hit dice';
  } else return;
  pendingCombatEdits.set(element, {
    character,
    label,
    snapshot: combatSnapshot(character, [target]),
  });
}

// Treat all input events before blur as one resource change.
function commitCombatField(element) {
  const pending = pendingCombatEdits.get(element);
  if (!pending) return;
  pendingCombatEdits.delete(element);
  const { character, label, snapshot } = pending;
  const location = combatTarget(character, snapshot[0].target);
  if (!location) return;
  const delta = location.object[location.key] - snapshot[0].before;
  const slots = snapshot[0].target.startsWith('usedSlots.');
  const spent =
    slots || snapshot[0].target.startsWith('attack:') ? delta > 0 : delta < 0;
  recordCombatEvent(
    character,
    `${label}: ${spent ? 'spent' : 'restored'} ${Math.abs(delta)}`,
    snapshot,
  );
}

function validCombatValue(target, value) {
  if (['lastShortRest', 'lastLongRest'].includes(target))
    return (
      typeof value === 'string' &&
      (value === '' || Number.isFinite(Date.parse(value)))
    );
  if (target === 'exhaustionLevel')
    return Number.isInteger(value) && value >= 0 && value <= 6;
  if (target === 'concentrationSpell') return typeof value === 'string';
  if (target === 'concentrationDamage')
    return (
      Array.isArray(value) &&
      value.every((amount) => Number.isSafeInteger(amount) && amount > 0)
    );
  if (
    !['hp', 'tempHp', 'hitDiceLeft', 'deathSuccess', 'deathFailure'].includes(
      target,
    ) &&
    !/^usedSlots\.[0-8]$/.test(target) &&
    !/^resource:[a-zA-Z0-9_-]{1,100}$/.test(target) &&
    !/^attack:[a-zA-Z0-9_-]{1,100}$/.test(target)
  )
    return false;
  const max = target.startsWith('usedSlots.')
    ? 20
    : ['deathSuccess', 'deathFailure'].includes(target)
      ? 3
      : Number.MAX_SAFE_INTEGER;
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function validateCombatLog(entries) {
  const ids = new Set();
  if (entries.length > 100) throw Error('Invalid combat log.');
  return entries.map((entry) => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.at !== 'string' ||
      !Number.isFinite(Date.parse(entry.at)) ||
      typeof entry.label !== 'string' ||
      typeof entry.undone !== 'boolean' ||
      !Array.isArray(entry.changes) ||
      !entry.changes.length
    )
      throw Error('Invalid combat log entry.');
    ids.add(entry.id);
    const targets = new Set();
    const changes = entry.changes.map((change) => {
      if (
        !change ||
        typeof change.target !== 'string' ||
        targets.has(change.target) ||
        !validCombatValue(change.target, change.before) ||
        !validCombatValue(change.target, change.after)
      )
        throw Error('Invalid combat log change.');
      targets.add(change.target);
      return {
        target: change.target,
        before: structuredClone(change.before),
        after: structuredClone(change.after),
      };
    });
    return {
      id: entry.id,
      at: entry.at,
      label: entry.label,
      undone: entry.undone,
      changes,
    };
  });
}

function healthControls(c) {
  return /* HTML */ `<div class="health-heading"
      ><div class="hp-display">${healthReadout(c)}</div
      >${button('combat-log', 'Combat log', 'secondary compact-button')}</div
    ><div class="hp-track"
      ><i
        style="width:${c.maxHp > 0 ? Math.min(100, Math.max(0, (healthTotal(c) / c.maxHp) * 100)) : 0}%"
      ></i></div
    ><div class="health-actions"
      ><label class="field hp-amount-label" for="hp-amount"
        ><span>Amount</span></label
      ><input
        id="hp-amount"
        type="text"
        inputmode="numeric"
        pattern="[0-9]+"
        placeholder="Enter amount"
        autocomplete="off"
        aria-label="Damage or healing amount"
      />${button('damage', 'Damage', 'secondary')}${button('heal', 'Heal', 'secondary')}</div
    ><div class="form-grid hp-limits"
      >${field('Temporary HP', 'tempHp', 'number')}${field('Maximum HP', 'maxHp', 'number')}</div
    >${concentrationTracker(c)}`;
}

function activeConditionChips(character) {
  const active = (character.activeConditions || []).map((name) => ({
    name,
    label: name,
  }));
  if (character.exhaustionLevel)
    active.push({
      name: 'Exhaustion',
      label: `Exhaustion ${character.exhaustionLevel}`,
    });

  const chips = active.length
    ? active
        .map(({ name, label }) =>
          button(
            'remove-condition',
            esc(label),
            'condition-chip',
            `data-condition-reference="${name}" aria-label="Remove ${esc(label)}"`,
          ),
        )
        .join('')
    : '<span class="condition-chip condition-empty">No active conditions</span>';

  return `${chips}${button('toggle-conditions', '+', 'condition-chip condition-add', `aria-label="Manage conditions" aria-haspopup="dialog" aria-controls="condition-picker" aria-expanded="${$('#condition-picker')?.hidden === false}"`)}`;
}

function conditionsTracker(character) {
  const pickerOpen = $('#condition-picker')?.hidden === false;
  const query = $('#condition-search')?.value || '';
  const normalizedQuery = query.trim().toLocaleLowerCase();
  let matches = 0;
  const options = Object.entries(conditionRules)
    .map(([name, rules], index) => {
      const ruleId = `condition-rule-${index}`;
      const ruleOpen = $(`#${ruleId}`)?.open;
      const control =
        name === 'Exhaustion'
          ? `<label class="condition-exhaustion"><span>Exhaustion</span><select data-field="exhaustionLevel" data-number="true" aria-label="Exhaustion level">${Array.from({ length: 7 }, (_, level) => `<option value="${level}" ${character.exhaustionLevel === level ? 'selected' : ''}>${level === 0 ? 'None' : `Level ${level}`}</option>`).join('')}</select></label>`
          : `<label class="check"><input type="checkbox" data-condition="${name}" ${(character.activeConditions || []).includes(name) ? 'checked' : ''} /><span>${name}</span></label>`;

      const visible = `${name} ${rules.join(' ')}`
        .toLocaleLowerCase()
        .includes(normalizedQuery);
      if (visible) matches++;

      return `<div class="condition-option" ${visible ? '' : 'hidden'}>${control}<details class="condition-rule" id="${ruleId}" ${ruleOpen ? 'open' : ''}><summary aria-label="${name} rules">Rules</summary><ul>${rules.map((rule) => `<li>${esc(rule)}</li>`).join('')}</ul></details></div>`;
    })
    .join('');

  return `<div class="condition-tracker"><span class="condition-heading">Conditions</span><div class="condition-controls"><div id="active-conditions" class="condition-active">${activeConditionChips(character)}</div><div id="condition-picker" role="dialog" aria-label="Manage conditions" ${pickerOpen ? '' : 'hidden'}><div class="condition-picker-heading"><strong>Conditions</strong>${button('close-conditions', '×', 'icon-button', 'aria-label="Close conditions"')}</div><p class="help">2014 5e reference. Apply effects to rolls and stats manually.</p><input id="condition-search" type="search" aria-label="Search conditions" placeholder="Search conditions…" value="${esc(query)}" /><div class="condition-options">${options}</div><p id="condition-search-empty" class="help" role="status" ${matches ? 'hidden' : ''}>No matching conditions.</p><p class="help"><a href="./RULES-LICENSE.md" target="_blank" rel="noopener">SRD 5.1 attribution</a></p></div></div>${field('Condition Notes', 'conditions')}</div>`;
}

function filterConditions(query) {
  const normalized = query.trim().toLocaleLowerCase();
  let matches = 0;

  for (const option of document.querySelectorAll(
    '#condition-picker .condition-option',
  )) {
    option.hidden = !option.textContent
      .toLocaleLowerCase()
      .includes(normalized);
    if (!option.hidden) matches++;
  }

  $('#condition-search-empty').hidden = matches > 0;
}

function closeConditionsPicker() {
  const picker = $('#condition-picker');
  if (picker) picker.hidden = true;
  $('[data-action="toggle-conditions"]')?.setAttribute(
    'aria-expanded',
    'false',
  );
}

const coinValues = { cp: 1, sp: 10, ep: 50, gp: 100, pp: 1000 };

function parseCurrency(raw, defaultUnit) {
  const amounts = { cp: 0, sp: 0, ep: 0, gp: 0, pp: 0 };
  const parts = raw.split(',');

  for (const part of parts) {
    const match = part.trim().match(/^(\d+)\s*(cp|sp|ep|gp|pp)?$/i);
    if (!match || (!match[2] && parts.length > 1)) return null;

    const amount = Number(match[1]);
    const unit = match[2]?.toLowerCase() || defaultUnit;
    if (!Number.isSafeInteger(amount) || amount <= 0) return null;

    amounts[unit] += amount;
    if (!Number.isSafeInteger(amounts[unit])) return null;
  }

  const cost = Object.entries(coinValues).reduce(
    (sum, [unit, value]) => sum + amounts[unit] * value,
    0,
  );

  return Number.isSafeInteger(cost) ? { amounts, cost } : null;
}

function spendCoins(coins, cost) {
  const remainingCoins = { ...coins };
  const denominations = Object.keys(coinValues);
  let remaining = cost;

  // Use exact change first, then break the smallest larger coins available.
  for (const unit of [...denominations].reverse()) {
    const used = Math.min(
      remainingCoins[unit],
      Math.floor(remaining / coinValues[unit]),
    );
    remainingCoins[unit] -= used;
    remaining -= used * coinValues[unit];
  }

  for (let i = 0; remaining > 0 && i < denominations.length; i++) {
    const unit = denominations[i];
    if (!remainingCoins[unit]) continue;

    const used = Math.min(
      remainingCoins[unit],
      Math.ceil(remaining / coinValues[unit]),
    );

    remainingCoins[unit] -= used;
    let change = used * coinValues[unit] - remaining;

    if (change < 0) {
      remaining = -change;
      continue;
    }

    remaining = 0;
    for (let j = i - 1; j >= 0; j--) {
      const smaller = denominations[j];
      const count = Math.floor(change / coinValues[smaller]);
      remainingCoins[smaller] += count;
      change -= count * coinValues[smaller];
    }
  }

  return remaining === 0 ? remainingCoins : null;
}

function spellcastingSummary(c) {
  return /* HTML */ `<section
    class="spell-summary panel"
    aria-label="Spellcasting"
    ><div class="spell-metrics"
      ><div class="spell-stat"
        ><span>Save DC</span
        ><strong class="big-number" ${statHint(c, 'spellDC')}
          >${statValue(c, 'spellDC')}</strong
        ></div
      ><div class="spell-stat"
        ><span>Attack bonus</span
        ><strong class="big-number" ${statHint(c, 'spellAttack')}
          >${sign(statValue(c, 'spellAttack'))}</strong
        ></div
      ></div
    ><label class="field casting-ability"
      ><span>Ability</span
      ><select data-field="spellAbility" data-number="true"
        >${abilities.map((a, i) => /* HTML */ `<option value="${i}" ${c.spellAbility === i ? 'selected' : ''}>${a}</option>`).join('')}</select
      ></label
    ></section
  >`;
}

function spellSlots(c) {
  const header = c.slots
    .map((_, i) => /* HTML */ `<th scope="col">${i + 1}</th>`)
    .join('');
  const row = (label, path, values) =>
    /* HTML */ `<tr
      ><th scope="row">${label}</th
      >${values.map((v, i) => /* HTML */ `<td><input type="number" min="0" max="20" data-field="${path}.${i}" value="${v}" aria-label="Level ${i + 1} ${label.toLowerCase()} slots" /></td>`).join('')}</tr
    >`;
  return panel(
    'Spell Slots',
    /* HTML */ `<div
      class="slot-table-wrap"
      role="region"
      aria-label="Spell slots by level"
      tabindex="0"
      ><table class="slot-table"
        ><thead
          ><tr><th scope="col">Level</th>${header}</tr></thead
        ><tbody
          >${row('Total', 'slots', c.slots)}${row('Used', 'usedSlots', c.usedSlots)}</tbody
        ></table
      ></div
    >`,
    '<span class="muted">Used slots reset on a long rest.</span>',
  );
}

const actionTypes = ['', 'Action', 'Bonus action', 'Reaction', 'Other'];

function castingActionType(time = '') {
  const timing = time.trim().toLocaleLowerCase();
  if (/^(?:1 )?bonus action\b/.test(timing)) return 'Bonus action';
  if (/^(?:1 )?reaction\b/.test(timing)) return 'Reaction';
  if (/^(?:1 )?action\b/.test(timing)) return 'Action';
  return timing ? 'Other' : '';
}

function actionTypeField(path, entry) {
  const selected = entry.actionType ?? castingActionType(entry.time);
  return `<label class="field"><span>Action Type</span><select data-field="${path}.actionType">${actionTypes.map((type) => `<option value="${type}" ${type === selected ? 'selected' : ''}>${type || 'Not set'}</option>`).join('')}</select></label>`;
}

function attackHasUses(attack) {
  return Number.isSafeInteger(attack.useLimit) && attack.useLimit > 0;
}

function attackUsesRemaining(attack) {
  return Math.max(0, attack.useLimit - (attack.usesSpent || 0));
}

function attackUseFields(attack, index) {
  return `<div class="form-grid three"><label class="field"><span>Uses per Rest</span><input type="text" inputmode="numeric" pattern="[0-9]*" placeholder="Unlimited" data-attack-use-limit="${index}" value="${esc(attack.useLimit ?? '')}" /></label><label class="field"><span>Resets On</span><select data-field="attacks.${index}.recovery">${[
    ['', 'Manual'],
    ['short', 'Short or Long Rest'],
    ['long', 'Long Rest'],
  ]
    .map(
      ([value, label]) =>
        `<option value="${value}" ${(attack.recovery || '') === value ? 'selected' : ''}>${label}</option>`,
    )
    .join(
      '',
    )}</select></label><label class="field"><span>Uses Spent</span><input type="number" min="0" max="${attackHasUses(attack) ? attack.useLimit : 0}" value="${attack.usesSpent || 0}" data-field="attacks.${index}.usesSpent" /></label></div>`;
}

function openUseAttackModal(character, index) {
  const attack = character.attacks[index];
  if (!attack) return;
  const limited = attackHasUses(attack);
  modal(
    'Use Attack / Action',
    `<div class="cast-popup"><h3>${esc(attack.name.trim() || 'Unnamed Attack')}</h3>${limited ? `<section class="rest-preview"><h3>Uses</h3><p>${attackUsesRemaining(attack)}/${attack.useLimit} remaining${attack.recovery ? ` · ${attack.recovery === 'short' ? 'Short or Long' : 'Long'} Rest` : ''}. This spends one use.</p></section>` : '<p class="help">No use limit is set.</p>'}</div>`,
    () => {
      if (!character.attacks.includes(attack))
        throw Error('This attack or action is no longer on your sheet.');
      if (character.hp === 0)
        throw Error('Recover hit points before using an attack or action.');
      if (attackHasUses(attack)) {
        if (attackUsesRemaining(attack) < 1) throw Error('No uses remaining.');
        attack.id ||= uid();
        attack.usesSpent ||= 0;
        const before = combatSnapshot(character, [`attack:${attack.id}`]);
        attack.usesSpent++;
        recordCombatEvent(
          character,
          `Use ${attack.name || 'Unnamed Attack'}`,
          before,
        );
        changed();
      }
      renderCharacter();
      toast(`${attack.name || 'Attack / action'} used.`);
    },
    'Use',
  );
  $('#modal button[type="submit"]').disabled =
    (limited && attackUsesRemaining(attack) === 0) || character.hp === 0;
}

function resourceShortcutButton(list, entry, index, direction) {
  const remaining =
    list === 'attacks' ? attackUsesRemaining(entry) : entry.remaining;
  const maximum = list === 'attacks' ? entry.useLimit : entry.max;
  const disabled = direction < 0 ? remaining <= 0 : remaining >= maximum;
  const name =
    entry.name.trim() || (list === 'attacks' ? 'attack / action' : 'resource');
  return button(
    'adjust-resource',
    direction < 0 ? '−' : '+',
    'resource-step-button',
    `data-list="${list}" data-index="${index}" data-direction="${direction}" aria-label="${direction < 0 ? 'Spend' : 'Regain'} one use of ${esc(name)}" ${disabled ? 'disabled' : ''}`,
  );
}

function attackUseShortcuts(attack, index) {
  if (!attackHasUses(attack)) return '';
  return `<div class="resource-shortcuts"><span>Uses</span><div class="resource-stepper" role="group" aria-label="${esc(attack.name || 'Attack / Action')} uses">${resourceShortcutButton('attacks', attack, index, -1)}<output aria-live="polite">${attackUsesRemaining(attack)}/${attack.useLimit}</output>${resourceShortcutButton('attacks', attack, index, 1)}</div>${attack.recovery ? `<small>${attack.recovery === 'short' ? 'Short or Long' : 'Long'} Rest</small>` : ''}</div>`;
}

function resourceRemainingField(resource, index) {
  return `<div class="field resource-remaining-field"><span>Remaining</span><div class="resource-stepper" role="group" aria-label="${esc(resource.name || 'Resource')} remaining uses">${resourceShortcutButton('resources', resource, index, -1)}<input type="number" min="0" step="1" data-field="resources.${index}.remaining" value="${resource.remaining}" aria-label="${esc(resource.name || 'Resource')} remaining" />${resourceShortcutButton('resources', resource, index, 1)}</div></div>`;
}

function adjustResource(character, list, index, direction) {
  if (!['attacks', 'resources'].includes(list) || ![-1, 1].includes(direction))
    return;
  const entry = character[list][index];
  if (!entry || (list === 'attacks' && !attackHasUses(entry))) return;
  const remaining =
    list === 'attacks' ? attackUsesRemaining(entry) : entry.remaining;
  const maximum = list === 'attacks' ? entry.useLimit : entry.max;
  // At either bound, clicking or dispatching the action has no side effects.
  if (direction > 0 ? remaining >= maximum : remaining <= 0) return;
  const next =
    direction > 0
      ? Math.min(maximum, remaining + 1)
      : Math.max(0, remaining - 1);
  entry.id ||= uid();
  if (list === 'attacks') entry.usesSpent ||= 0;
  const target = `${list === 'attacks' ? 'attack' : 'resource'}:${entry.id}`;
  const before = combatSnapshot(character, [target]);
  if (list === 'attacks') entry.usesSpent = entry.useLimit - next;
  else entry.remaining = next;
  recordCombatEvent(
    character,
    `${entry.name || 'Resource'}: ${direction < 0 ? 'spent' : 'restored'} ${Math.abs(next - remaining)}`,
    before,
  );
  changed();
  renderCharacter();
}

function attackRecords(c) {
  if (!c.attacks.length)
    return '<p class="muted">Add your weapons, attacks, and special actions.</p>';
  return /* HTML */ `<div class="record-list"
    >${c.attacks
      .map((attack, index) => ({ attack, index }))
      .sort(
        (a, b) =>
          Number(Boolean(b.attack.favorite)) -
          Number(Boolean(a.attack.favorite)),
      )
      .map(({ attack, index }) => {
        if (editingAttack === attack) {
          return /* HTML */ `<div
            class="record attack-editor"
            data-attack-editor="${index}"
          >
            <div class="record-top">
              ${field('Attack / Action', `attacks.${index}.name`)}
              ${favoriteButton('attacks', attack, index)}
              ${button('remove', '×', 'icon-button', `data-list="attacks" data-index="${index}" aria-label="Remove attack"`)}
            </div>
            <div class="form-grid three">
              ${field('Attack Bonus', `attacks.${index}.bonus`)}
              ${field('Damage', `attacks.${index}.damage`)}
              ${field('Type / Range', `attacks.${index}.type`)}
            </div>
            ${actionTypeField(`attacks.${index}`, attack)}
            ${attackUseFields(attack, index)}
            ${area('Notes', `attacks.${index}.notes`)}
            <div class="attack-editor-actions"
              >${button('finish-attack', 'Done', 'secondary')}</div
            >
          </div>`;
        }
        const details = [
          ['Action Type', attack.actionType || ''],
          ['Attack', attack.bonus],
          ['Damage', attack.damage],
          ['Type / Range', attack.type],
        ]
          .filter(([, value]) => value.trim())
          .map(
            ([label, value]) =>
              /* HTML */ `<span
                ><small>${label}</small><b>${esc(value)}</b></span
              >`,
          )
          .join('');
        return /* HTML */ `<div class="spell-card attack-card"
          ><button
            class="attack-summary"
            data-action="edit-attack"
            data-index="${index}"
            aria-label="Edit ${esc(attack.name || 'unnamed attack')}"
          >
            <span class="attack-summary-heading"
              ><strong>${esc(attack.name.trim() || 'Unnamed attack')}</strong
              ><span class="attack-edit-label">Edit</span></span
            >
            ${details ? /* HTML */ `<span class="attack-summary-stats">${details}</span>` : '<span class="muted">Click to add attack details.</span>'}
            ${attack.notes.trim() ? /* HTML */ `<span class="attack-summary-notes">${formatText(attack.notes)}</span>` : ''} </button
          >${attackUseShortcuts(attack, index)}<div class="spell-card-actions"
            >${button('use-attack', 'Use', 'secondary cast-button', `data-index="${index}" aria-label="Use ${esc(attack.name || 'attack / action')}"`)}</div
          ></div
        >`;
      })
      .join('')}</div
  >`;
}

// Combat lists every known spell independently of the spellbook's filters.
function combatSpells(character) {
  if (!character.spells.length) return '';

  const records = character.spells
    .map((spell, index) => ({ spell, index }))
    .sort(
      (a, b) =>
        Number(Boolean(b.spell.favorite)) - Number(Boolean(a.spell.favorite)) ||
        a.spell.level - b.spell.level,
    )
    .map(({ spell, index }) => {
      const metadata = [
        spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`,
        spell.school.trim(),
        spell.prepared ? 'Prepared' : '',
        spellFlag(spell, 'concentration') ? 'Concentration' : '',
        spellFlag(spell, 'ritual') ? 'Ritual' : '',
      ]
        .filter(Boolean)
        .join(' · ');
      const details = [
        ['Action Type', spell.actionType ?? castingActionType(spell.time)],
        ['Casting Time', spell.time],
        ['Range', spell.range],
        ['Duration', spell.duration],
      ]
        .filter(([, value]) => value.trim())
        .map(
          ([label, value]) =>
            `<span><small>${label}</small><b>${esc(value)}</b></span>`,
        )
        .join('');

      return /* HTML */ `<div class="spell-card"
        ><button
          class="attack-summary combat-spell-summary"
          data-action="edit-spell"
          data-index="${index}"
          aria-label="Edit ${esc(spell.name || 'unnamed spell')} in spellbook"
        >
          <span class="attack-summary-heading"
            ><span class="combat-spell-title"
              ><strong>${esc(spell.name.trim() || 'Unnamed spell')}</strong
              ><span class="spell-record-meta">${esc(metadata)}</span></span
            ><span class="attack-edit-label">Edit</span></span
          >
          ${details ? `<span class="attack-summary-stats">${details}</span>` : ''}
          ${spell.description.trim() ? `<span class="attack-summary-notes spell-description">${formatText(spell.description)}</span>` : ''} </button
        >${spellCardActions(character, spell, index)}</div
      >`;
    })
    .join('');

  return panel(
    'Spells Known',
    `<div class="record-list combat-spells">${records}</div>`,
  );
}

function hideSpellPopup() {
  if (
    spellPopupCard?.getAttribute('aria-describedby') ===
    'spell-description-popup'
  ) {
    spellPopupCard.removeAttribute('aria-describedby');
  }
  spellPopupCard = null;
  if (spellPopup) spellPopup.hidden = true;
}

function showSpellPopup(card) {
  const spell = ['spells', 'combat'].includes(page)
    ? current()?.spells[Number(card.dataset.index)]
    : null;
  if (!spell?.description.trim()) {
    hideSpellPopup();
    return;
  }
  showReferencePopup(
    card,
    spell.name.trim() || 'Unnamed spell',
    spell.description,
  );
}

function showConditionPopup(chip) {
  const rules = conditionRules[chip.dataset.conditionReference];
  if (rules) showReferencePopup(chip, chip.textContent, rules.join('\n\n'));
}

function showReferencePopup(card, title, descriptionText) {
  if (spellPopupCard === card && !spellPopup.hidden) return;
  hideSpellPopup();
  if (!spellPopup) {
    spellPopup = document.createElement('aside');
    spellPopup.id = 'spell-description-popup';
    spellPopup.className = 'spell-popup';
    spellPopup.setAttribute('role', 'tooltip');
    spellPopup.tabIndex = 0;
    const heading = document.createElement('h3');
    heading.className = 'spell-popup-title';
    const description = document.createElement('p');
    description.className = 'spell-popup-description';
    spellPopup.append(heading, description);
    document.body.append(spellPopup);
  }
  $('.spell-popup-title', spellPopup).textContent = title;
  $('.spell-popup-description', spellPopup).innerHTML =
    formatText(descriptionText);
  spellPopup.hidden = false;
  spellPopupCard = card;
  card.setAttribute('aria-describedby', spellPopup.id);
  const cardRect = card.getBoundingClientRect();
  const popupRect = spellPopup.getBoundingClientRect();
  const width = document.documentElement.clientWidth || window.innerWidth;
  const height = document.documentElement.clientHeight || window.innerHeight;
  const margin = 12;
  const clamp = (value, maximum) => Math.max(margin, Math.min(value, maximum));
  let left = cardRect.right + margin;
  let top = cardRect.top;
  if (left + popupRect.width > width - margin)
    left = cardRect.left - popupRect.width - margin;
  if (left < margin) {
    left = clamp(cardRect.left, width - popupRect.width - margin);
    top = cardRect.bottom + margin;
    if (top + popupRect.height > height - margin)
      top = cardRect.top - popupRect.height - margin;
  }
  spellPopup.style.left = `${clamp(left, width - popupRect.width - margin)}px`;
  spellPopup.style.top = `${clamp(top, height - popupRect.height - margin)}px`;
}

document.addEventListener('pointerover', (event) => {
  if (event.pointerType === 'touch') return;
  const stat = event.target.closest('[data-stat-breakdown]');
  if (stat) {
    showReferencePopup(stat, 'Item Bonuses', stat.dataset.statBreakdown);
    return;
  }
  const card = event.target.closest(
    '.spell-record-summary, .combat-spell-summary',
  );
  if (card) showSpellPopup(card);
  const chip = event.target.closest('[data-condition-reference]');
  if (chip) showConditionPopup(chip);
});

document.addEventListener('pointerout', (event) => {
  if (!spellPopupCard) return;
  const next = event.relatedTarget;
  if (next instanceof Node && spellPopupCard.contains(next)) return;
  if (
    spellPopupCard.contains(event.target) ||
    spellPopup.contains(event.target)
  )
    hideSpellPopup();
});

document.addEventListener('focusin', (event) => {
  const stat = event.target.closest('[data-stat-breakdown]');
  if (stat) {
    showReferencePopup(stat, 'Item Bonuses', stat.dataset.statBreakdown);
    return;
  }
  const card = event.target.closest(
    '.spell-record-summary, .combat-spell-summary',
  );
  const chip = event.target.closest('[data-condition-reference]');
  if (card) showSpellPopup(card);
  else if (chip) showConditionPopup(chip);
  else if (!spellPopup?.contains(event.target)) hideSpellPopup();
});

document.addEventListener('focusout', (event) => {
  const next = event.relatedTarget;
  if (
    next instanceof Node &&
    (spellPopupCard?.contains(next) || spellPopup?.contains(next))
  )
    return;
  hideSpellPopup();
});

function undoDeletedEntry(event) {
  const isUndo =
    (event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z';
  const isEditingText = event.target.closest(
    'input, textarea, select, [contenteditable="true"]',
  );
  if (
    !isUndo ||
    event.shiftKey ||
    event.altKey ||
    event.isComposing ||
    $('#modal').open ||
    isEditingText
  )
    return false;

  const character = current();
  const historyIndex = deletedEntries.findLastIndex(
    (entry) => entry.character === character,
  );
  if (historyIndex === -1) return false;

  event.preventDefault();
  const [entry] = deletedEntries.splice(historyIndex, 1);
  const entries = character[entry.list];
  entries.splice(Math.min(entry.index, entries.length), 0, entry.item);
  changed();
  renderCharacter();
  toast('Deleted entry restored.');
  return true;
}

document.addEventListener('keydown', (event) => {
  if (
    event.key === 'Enter' &&
    [
      'related-notes-search',
      'spell-reference-search',
      'equipment-reference-search',
      'level-up-spell-search',
    ].includes(event.target.id)
  ) {
    event.preventDefault();
    return;
  }

  if (undoDeletedEntry(event)) return;
  handleTextListKey(event);
  if (event.key === 'Escape') {
    hideSpellPopup();
    if ($('#condition-picker')?.hidden === false) {
      closeConditionsPicker();
      $('[data-action="toggle-conditions"]')?.focus();
    }
  }
  if (
    event.key === 'Enter' &&
    event.target.id === 'currency-amount' &&
    !event.isComposing
  ) {
    event.preventDefault();
    if (!event.repeat) $('.currency-actions [data-action="gain"]')?.click();
  }
});

window.addEventListener('resize', hideSpellPopup);

document.addEventListener(
  'scroll',
  (event) => {
    if (!spellPopup?.contains(event.target)) hideSpellPopup();
  },
  true,
);

// The licensed reference is bundled with the site and loaded only when requested.
let spellReferencePromise;
let spellReference = [];

async function loadSpellReference() {
  if (!spellReferencePromise) {
    spellReferencePromise = (async () => {
      const response = await fetch(
        new URL('./assets/reference/spells.json', document.baseURI),
      );
      if (!response.ok)
        throw Error('Could not load the spell reference. Please try again.');
      spellReference = await response.json();
      return spellReference;
    })().catch((error) => {
      spellReferencePromise = null;
      throw error;
    });
  }
  return spellReferencePromise;
}

function renderSpellReferenceResults() {
  const query = $('#spell-reference-search').value.trim().toLocaleLowerCase();
  const level = $('#spell-reference-level').value;
  const selected = $('#spell-reference-id').value;
  const matches = spellReference.filter(
    (spell) =>
      spell.name.toLocaleLowerCase().includes(query) &&
      (level === '' || spell.level === Number(level)),
  );

  $('#spell-reference-results').innerHTML =
    matches
      .map(
        (spell) =>
          /* HTML */ `<button
            type="button"
            class="spell-reference-choice reference-choice"
            data-action="preview-reference-spell"
            data-reference-id="${esc(spell.id)}"
            aria-pressed="${spell.id === selected}"
            ><strong>${esc(spell.name)}</strong
            ><small
              >${spell.level ? `Level ${spell.level}` : 'Cantrip'} ·
              ${esc(spell.school)}${spell.concentration ? ' · Concentration' : ''}${spell.ritual ? ' · Ritual' : ''}</small
            ></button
          >`,
      )
      .join('') || '<p class="muted" role="status">No matching spells.</p>';
  $('#spell-reference-count').textContent = `${matches.length} spells`;
}

function previewReferenceSpell(id) {
  const spell = spellReference.find((entry) => entry.id === id);
  if (!spell) return;
  $('#spell-reference-id').value = id;
  $('#spell-reference-preview').innerHTML = /* HTML */ `<h3
      >${esc(spell.name)}</h3
    ><dl
      >${[
        ['Casting Time', spell.time],
        ['Range', spell.range],
        ['Components', spell.components],
        ['Duration', spell.duration],
      ]
        .map(
          ([label, value]) =>
            `<div><dt>${label}</dt><dd>${esc(value)}</dd></div>`,
        )
        .join('')}</dl
    ><div class="spell-reference-description reference-description"
      >${formatText(spell.description)}</div
    >`;
  $('#modal button[type="submit"]').disabled = false;
  for (const choice of document.querySelectorAll('.spell-reference-choice')) {
    choice.setAttribute(
      'aria-pressed',
      String(choice.dataset.referenceId === id),
    );
  }
}

async function importSpellModal(character, trigger) {
  const label = trigger.textContent;
  trigger.disabled = true;
  trigger.textContent = 'Loading…';
  try {
    await loadSpellReference();
    if (current() !== character || page !== 'spells') return;
    modal(
      'Import Spell',
      /* HTML */ `<div class="spell-reference reference-picker"
        ><p class="help"
          >SRD 5.1 · 2014 rules. Preview a spell, then import an editable copy.
          <a href="./RULES-LICENSE.md" target="_blank" rel="noopener"
            >Source & license</a
          ></p
        ><input type="hidden" name="reference-id" id="spell-reference-id" /><div
          class="spell-reference-filters reference-filters"
          ><input
            type="search"
            id="spell-reference-search"
            aria-label="Search spell reference by name"
            placeholder="Search spells…" /><select
            id="spell-reference-level"
            aria-label="Filter reference by level"
            ><option value="">All levels</option
            >${Array.from({ length: 10 }, (_, level) => `<option value="${level}">${level ? `Level ${level}` : 'Cantrip'}</option>`).join('')}</select
          ><small id="spell-reference-count" role="status"></small></div
        ><div class="spell-reference-layout reference-layout"
          ><div
            id="spell-reference-results"
            class="reference-results"
            aria-label="Spell reference results"
          ></div
          ><section
            id="spell-reference-preview"
            class="reference-preview"
            tabindex="0"
            aria-label="Selected spell preview"
            ><p class="muted"
              >Select a spell to preview its details.</p
            ></section
          ></div
        ></div
      >`,
      (data) => {
        const reference = spellReference.find(
          (spell) => spell.id === data.get('reference-id'),
        );
        if (!reference) throw Error('Choose a spell to import.');
        const { id, ...fields } = reference;
        const spell = {
          ...fields,
          actionType: castingActionType(fields.time),
          prepared: false,
        };
        character.spells.push(spell);
        editingSpell = null;
        changed();
        renderCharacter();
        toast(`${spell.name} imported.`);
      },
      'Import spell',
    );
    $('#modal button[type="submit"]').disabled = true;
    renderSpellReferenceResults();
    $('#spell-reference-search').focus();
  } catch (error) {
    toast(
      error.message || 'Could not load the spell reference. Please try again.',
    );
  } finally {
    trigger.disabled = false;
    trigger.textContent = label;
  }
}

// Equipment uses the same local reference picker layout as spells.
let equipmentReferencePromise;
let equipmentReference = [];

async function loadEquipmentReference() {
  if (!equipmentReferencePromise) {
    equipmentReferencePromise = (async () => {
      const response = await fetch(
        new URL('./assets/reference/equipment.json', document.baseURI),
      );
      if (!response.ok)
        throw Error(
          'Could not load the equipment reference. Please try again.',
        );
      equipmentReference = await response.json();
      return equipmentReference;
    })().catch((error) => {
      equipmentReferencePromise = null;
      throw error;
    });
  }
  return equipmentReferencePromise;
}

function renderEquipmentReferenceResults() {
  const query = $('#equipment-reference-search')
    .value.trim()
    .toLocaleLowerCase();
  const category = $('#equipment-reference-category').value;
  const selected = $('#equipment-reference-id').value;
  const matches = equipmentReference.filter(
    (item) =>
      item.name.toLocaleLowerCase().includes(query) &&
      (!category || item.category === category),
  );
  $('#equipment-reference-results').innerHTML =
    matches
      .map(
        (item) =>
          /* HTML */ `<button
            type="button"
            class="reference-choice equipment-reference-choice"
            data-action="preview-reference-equipment"
            data-reference-id="${esc(item.id)}"
            aria-pressed="${item.id === selected}"
            ><strong>${esc(item.name)}</strong
            ><small
              >${esc(item.category)} ·
              ${item.weight === null ? 'Weight not listed' : `${item.weight} lb each`}</small
            ></button
          >`,
      )
      .join('') || '<p class="muted" role="status">No matching equipment.</p>';
  $('#equipment-reference-count').textContent = `${matches.length} items`;
}

function previewReferenceEquipment(id) {
  const item = equipmentReference.find((entry) => entry.id === id);
  if (!item) return;
  $('#equipment-reference-id').value = id;
  $('#equipment-reference-quantity').value = item.quantity;
  $('#equipment-reference-preview').innerHTML = /* HTML */ `<h3
      >${esc(item.name)}</h3
    ><dl
      ><div
        ><dt>Weight Each</dt
        ><dd
          >${item.weight === null ? 'Not listed — set manually after import' : `${item.weight} lb`}</dd
        ></div
      ><div><dt>Listed Cost</dt><dd>${esc(item.cost)}</dd></div></dl
    ><div class="reference-description">${formatText(item.notes)}</div>`;
  $('#modal button[type="submit"]').disabled = false;
  for (const choice of document.querySelectorAll('.equipment-reference-choice'))
    choice.setAttribute(
      'aria-pressed',
      String(choice.dataset.referenceId === id),
    );
}

async function importEquipmentModal(character, trigger) {
  const label = trigger.textContent;
  trigger.disabled = true;
  trigger.textContent = 'Loading…';
  try {
    await loadEquipmentReference();
    if (current() !== character || page !== 'equipment') return;
    const categories = [
      ...new Set(equipmentReference.map((item) => item.category)),
    ].sort();
    modal(
      'Import Equipment',
      /* HTML */ `<div class="reference-picker equipment-reference"
        ><p class="help"
          >SRD 5.1 · 2014 rules. Preview equipment, then add an editable
          inventory entry.
          <a href="./RULES-LICENSE.md" target="_blank" rel="noopener"
            >Source & License</a
          ></p
        ><input
          type="hidden"
          name="reference-id"
          id="equipment-reference-id"
        /><div class="reference-filters"
          ><input
            type="search"
            id="equipment-reference-search"
            aria-label="Search equipment reference by name"
            placeholder="Search equipment…" /><select
            id="equipment-reference-category"
            aria-label="Filter equipment by category"
            ><option value="">All categories</option
            >${categories.map((category) => `<option>${esc(category)}</option>`).join('')}</select
          ><small id="equipment-reference-count" role="status"></small></div
        ><label class="field equipment-import-quantity"
          ><span>Quantity</span
          ><input
            id="equipment-reference-quantity"
            name="quantity"
            type="number"
            min="1"
            max="${Number.MAX_SAFE_INTEGER}"
            step="1"
            value="1"
            required /></label
        ><div class="reference-layout"
          ><div
            id="equipment-reference-results"
            class="reference-results"
            aria-label="Equipment reference results"
          ></div
          ><section
            id="equipment-reference-preview"
            class="reference-preview"
            tabindex="0"
            aria-label="Selected equipment preview"
            ><p class="muted"
              >Select an item to preview its details.</p
            ></section
          ></div
        ></div
      >`,
      (data) => {
        const reference = equipmentReference.find(
          (item) => item.id === data.get('reference-id'),
        );
        if (!reference) throw Error('Choose equipment to import.');
        const quantity = Number(data.get('quantity'));
        if (!Number.isSafeInteger(quantity) || quantity < 1)
          throw Error('Enter a positive whole-number quantity.');
        character.equipment.push({
          name: reference.name,
          quantity,
          weight: reference.weight ?? 0,
          notes: reference.notes,
          equipped: false,
        });
        inventorySearch = '';
        inventoryModifiersOnly = false;
        changed();
        renderCharacter();
        toast(`${reference.name} imported.`);
      },
      'Import Equipment',
    );
    $('#modal button[type="submit"]').disabled = true;
    renderEquipmentReferenceResults();
    $('#equipment-reference-search').focus();
  } catch (error) {
    toast(
      error.message ||
        'Could not load the equipment reference. Please try again.',
    );
  } finally {
    trigger.disabled = false;
    trigger.textContent = label;
  }
}

function spellRecords(c) {
  if (!c.spells.length)
    return empty(
      'An Open Spellbook',
      'Add your cantrips and spells, with the details you need at the table.',
    );
  if (!c.spells.some(matchesSpell) && !c.spells.includes(editingSpell))
    return '<p class="muted" role="status">No matching spells. Try changing or clearing your filters.</p>';

  return /* HTML */ `<div class="spell-grid"
    >${c.spells
      .map((spell, index) => ({ spell, index }))
      .sort(
        (a, b) =>
          Number(Boolean(b.spell.favorite)) - Number(Boolean(a.spell.favorite)),
      )
      .map(({ spell, index }) => {
        if (!matchesSpell(spell) && editingSpell !== spell) return '';
        if (editingSpell === spell) {
          return /* HTML */ `<div
            class="record spell-editor"
            data-spell-editor="${index}"
          >
            <div class="record-top">
              ${field('Spell Name', `spells.${index}.name`)}
              ${favoriteButton('spells', spell, index)}
              ${button('remove', '×', 'icon-button', `data-list="spells" data-index="${index}" aria-label="Remove spell"`)}
            </div>
            <div class="form-grid three">
              ${field('Level (0 = Cantrip)', `spells.${index}.level`, 'number', { max: 9 })}
              ${field('School', `spells.${index}.school`)}
              ${actionTypeField(`spells.${index}`, spell)}
              ${field('Casting Time', `spells.${index}.time`)}
              ${field('Range', `spells.${index}.range`)}
              ${field('Components', `spells.${index}.components`)}
              ${field('Duration', `spells.${index}.duration`)}
            </div>
            <div class="spell-flags"
              >${['prepared', 'concentration', 'ritual'].map((flag) => `<label class="check"><input type="checkbox" data-field="spells.${index}.${flag}" ${(flag === 'prepared' ? spell.prepared : spellFlag(spell, flag)) ? 'checked' : ''} /> ${flag[0].toUpperCase() + flag.slice(1)}</label>`).join('')}</div
            >
            ${area('Effect / Description', `spells.${index}.description`)}
            <div class="attack-editor-actions"
              >${button('finish-spell', 'Done', 'secondary')}</div
            >
          </div>`;
        }
        const metadata = [
          spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`,
          spell.school.trim(),
          spell.prepared ? 'Prepared' : '',
          spellFlag(spell, 'concentration') ? 'Concentration' : '',
          spellFlag(spell, 'ritual') ? 'Ritual' : '',
        ]
          .filter(Boolean)
          .join(' · ');
        const details = [
          ['Action Type', spell.actionType ?? castingActionType(spell.time)],
          ['Casting Time', spell.time],
          ['Range', spell.range],
          ['Components', spell.components],
          ['Duration', spell.duration],
        ]
          .filter(([, value]) => value.trim())
          .map(
            ([label, value]) =>
              /* HTML */ `<span
                ><small>${label}</small><b>${esc(value)}</b></span
              >`,
          )
          .join('');
        return /* HTML */ `<div class="spell-card"
          ><button
            class="attack-summary spell-record-summary"
            data-action="edit-spell"
            data-index="${index}"
            aria-label="Edit ${esc(spell.name || 'unnamed spell')}"
          >
            <span class="attack-summary-heading"
              ><strong>${esc(spell.name.trim() || 'Unnamed spell')}</strong
              ><span class="attack-edit-label">Edit</span></span
            >
            <span class="spell-record-meta">${esc(metadata)}</span>
            ${details ? /* HTML */ `<span class="attack-summary-stats">${details}</span>` : ''}
            ${spell.description.trim() ? /* HTML */ `<span class="attack-summary-notes spell-description">${formatText(spell.description)}</span>` : ''} </button
          >${spellCardActions(c, spell, index)}</div
        >`;
      })
      .join('')}</div
  >`;
}

function savingThrows(character) {
  return abilities
    .map((ability, index) => {
      const proficient = character.saves.includes(index);
      const bonus = statValue(character, `save.${index}`);
      return /* HTML */ `<label class="save-row"
        ><input
          type="checkbox"
          data-save="${index}"
          ${proficient ? 'checked' : ''}
        /><span>${ability}</span
        ><strong ${statHint(character, `save.${index}`)}
          >${sign(bonus)}</strong
        ></label
      >`;
    })
    .join('');
}

function resourceRecords(character) {
  return character.resources
    .map((resource, index) => {
      const path = `resources.${index}`;
      const removeButton = button(
        'remove',
        '×',
        'icon-button',
        `data-list="resources" data-index="${index}" aria-label="Remove resource"`,
      );
      return /* HTML */ `<div class="record"
        ><div class="record-top"
          >${field('Resource', `${path}.name`)}${removeButton}</div
        ><div class="form-grid"
          >${resourceRemainingField(resource, index)}${field('Maximum', `${path}.max`, 'number')}</div
        ><label class="field"
          ><span>Resets on</span
          ><select data-field="${path}.recovery"
            >${[
              ['manual', 'Manual'],
              ['short', 'Short or long rest'],
              ['long', 'Long rest'],
            ]
              .map(
                ([value, label]) =>
                  `<option value="${value}" ${(resource.recovery || 'manual') === value ? 'selected' : ''}>${label}</option>`,
              )
              .join('')}</select
          ></label
        ></div
      >`;
    })
    .join('');
}

// Rest dialogs preview changes, then record one undoable event on confirmation.
function characterActions() {
  return panel(
    'Rest & Recovery',
    /* HTML */ `<div class="character-action-grid"
      >${button('short-rest', '<strong>Short Rest</strong>', 'secondary character-action')}${button('rest', '<strong>Long Rest</strong>', 'secondary character-action')}${button('combat-log', '<strong>Combat Log</strong>', 'secondary character-action')}</div
    >`,
  );
}

function restResources(character, type) {
  return character.resources.filter(
    (resource) =>
      resource.recovery === 'short' ||
      (type === 'long' && resource.recovery === 'long'),
  );
}

function restAttacks(character, type) {
  return character.attacks.filter(
    (attack) =>
      attackHasUses(attack) &&
      (attack.recovery === 'short' ||
        (type === 'long' && attack.recovery === 'long')),
  );
}

function restPreview(character, type, dice, healing, reduceExhaustion) {
  const changes =
    type === 'long'
      ? [
          `HP: ${character.hp} → ${character.maxHp}`,
          `Temporary HP: ${character.tempHp} → 0`,
          `Hit dice remaining: ${character.hitDiceLeft} → ${character.hitDiceLeft + dice}`,
          'Clear death saves and used spell slots.',
          'End concentration.',
        ]
      : [
          `HP: ${character.hp} → ${Math.min(character.maxHp, character.hp + healing)}`,
          `Hit dice remaining: ${character.hitDiceLeft} → ${Math.max(0, character.hitDiceLeft - dice)}`,
        ];
  for (const resource of restResources(character, type))
    changes.push(
      `${resource.name || 'Resource'}: ${resource.remaining} → ${Math.max(resource.remaining, resource.max)}`,
    );
  for (const attack of restAttacks(character, type))
    changes.push(
      `${attack.name || 'Attack / action'} uses: ${attackUsesRemaining(attack)}/${attack.useLimit} → ${attack.useLimit}/${attack.useLimit}`,
    );
  if (reduceExhaustion)
    changes.push(
      `Exhaustion: ${character.exhaustionLevel} → ${Math.max(0, character.exhaustionLevel - 1)}`,
    );
  return `<ul>${changes.map((change) => `<li>${esc(change)}</li>`).join('')}</ul>`;
}

function updateRestPreview(character) {
  const popup = $('.rest-popup');
  if (!popup) return;
  const form = $('#modal-form');
  $('#rest-preview').innerHTML = restPreview(
    character,
    popup.dataset.restType,
    Math.max(0, Number(form.elements.namedItem('dice').value) || 0),
    Math.max(0, Number(form.elements.namedItem('healing')?.value) || 0),
    Boolean(form.elements.namedItem('reduce-exhaustion')?.checked),
  );
}

function openRestModal(character, type) {
  const long = type === 'long';
  const missingDice = Math.max(0, character.level - character.hitDiceLeft);
  const defaultDice = long
    ? Math.min(missingDice, Math.max(1, Math.floor(character.level / 2)))
    : 0;
  const number = (name, label, value, max) =>
    `<label class="field"><span>${label}</span><input name="${name}" type="number" min="0" max="${max}" step="1" value="${value}" required /></label>`;
  const body = /* HTML */ `<div class="rest-popup" data-rest-type="${type}"
    ><p class="help"
      >${long ? 'Review recovery before completing your long rest. Hit dice default to half your level (minimum one), capped by spent dice.' : `Hit dice: ${esc(character.hitDice)} · ${character.hitDiceLeft} remaining. Roll the dice you spend, then enter total healing including Constitution modifiers.`}</p
    ><div class="form-grid"
      >${number('dice', long ? 'Hit Dice Recovered' : 'Hit Dice Spent', defaultDice, long ? missingDice : character.hitDiceLeft)}${long ? '' : number('healing', 'Rolled Healing Total', 0, Number.MAX_SAFE_INTEGER)}</div
    >${long && character.exhaustionLevel ? '<label class="check"><input type="checkbox" name="reduce-exhaustion" /> Reduce exhaustion by 1 (food and drink)</label>' : ''}<section
      class="rest-preview"
      aria-live="polite"
      ><h3>Recovery Preview</h3
      ><div id="rest-preview"
        >${restPreview(character, type, defaultDice, 0, false)}</div
      ></section
    ><p class="help"
      >Limited actions and resources recover according to their reset setting.
      Other effects can be adjusted manually.</p
    ></div
  >`;
  modal(
    long ? 'Long Rest' : 'Short Rest',
    body,
    (data) => {
      const dice = Number(data.get('dice'));
      const healing = long ? 0 : Number(data.get('healing'));
      const limit = long
        ? Math.max(0, character.level - character.hitDiceLeft)
        : character.hitDiceLeft;
      if (
        !String(data.get('dice')).trim() ||
        !Number.isSafeInteger(dice) ||
        dice < 0 ||
        dice > limit ||
        !Number.isSafeInteger(healing) ||
        healing < 0 ||
        (!long &&
          (!String(data.get('healing')).trim() || (dice === 0 && healing > 0)))
      )
        throw Error(
          'Enter valid hit dice and healing amounts. Healing requires spending hit dice.',
        );
      const attacks = restAttacks(character, type);
      for (const attack of attacks) {
        attack.id ||= uid();
        attack.usesSpent ||= 0;
      }
      const resources = restResources(character, type);
      for (const resource of resources) resource.id ||= uid();
      const before = combatSnapshot(character, [
        ...healthLogFields,
        'hitDiceLeft',
        long ? 'lastLongRest' : 'lastShortRest',
        'exhaustionLevel',
        ...(long
          ? character.usedSlots.map((_, index) => `usedSlots.${index}`)
          : []),
        ...resources.map((resource) => `resource:${resource.id}`),
        ...attacks.map((attack) => `attack:${attack.id}`),
      ]);
      if (long) {
        character.hp = character.maxHp;
        character.tempHp = 0;
        character.usedSlots.fill(0);
        character.deathSuccess = 0;
        character.deathFailure = 0;
        character.hitDiceLeft += dice;
        endConcentration(character);
        if (data.has('reduce-exhaustion'))
          character.exhaustionLevel = Math.max(
            0,
            character.exhaustionLevel - 1,
          );
        character.lastLongRest = new Date().toISOString();
      } else {
        const regained = Math.min(
          healing,
          Math.max(0, character.maxHp - character.hp),
        );
        character.hp += regained;
        character.hitDiceLeft -= dice;
        if (regained > 0) {
          character.deathSuccess = 0;
          character.deathFailure = 0;
        }
        character.lastShortRest = new Date().toISOString();
      }
      for (const attack of attacks) attack.usesSpent = 0;
      for (const resource of resources)
        resource.remaining = Math.max(resource.remaining, resource.max);
      recordCombatEvent(character, long ? 'Long Rest' : 'Short Rest', before);
      changed();
      renderCharacter();
    },
    'Complete rest',
  );
}

// A level-up is an isolated draft; only the final review writes character data.
let levelUpSession = null;
const levelUpSteps = ['HP & Abilities', 'Spells', 'Features', 'Review'];
const levelUpKeys = [
  'level',
  'abilities',
  'maxHp',
  'hp',
  'hitDice',
  'hitDiceLeft',
  'slots',
  'spells',
  'spellNotes',
  'features',
  'class',
  'subclass',
];

function levelUpBaseline(character) {
  return Object.fromEntries(
    levelUpKeys.map((key) => [key, structuredClone(character[key])]),
  );
}

function addLevelHitDie(pool, sides) {
  const terms = pool.trim().split(/\s*\+\s*/);
  if (terms.every((term) => /^\d+d(?:6|8|10|12)$/i.test(term))) {
    const existing = terms.findIndex(
      (term) => Number(term.split(/d/i)[1]) === sides,
    );
    if (existing >= 0)
      terms[existing] =
        `${Number(terms[existing].split(/d/i)[0]) + 1}d${sides}`;
    else terms.push(`1d${sides}`);
    return terms.join(' + ');
  }
  return `${pool.trim()}${pool.trim() ? ' + ' : ''}1d${sides}`;
}

function levelUpPatch(session) {
  const { base, draft } = session;
  const constitution = mod(draft.abilities[2]);
  const gained =
    Math.max(1, draft.dieResult + constitution) +
    base.level * (constitution - mod(base.abilities[2])) +
    draft.extraHp;
  const maxHp = base.maxHp + gained;
  return {
    level: draft.level,
    abilities: [...draft.abilities],
    maxHp,
    hp: Math.min(
      maxHp,
      draft.raiseCurrent ? Math.max(0, base.hp + gained) : base.hp,
    ),
    hitDice: draft.hitDice,
    hitDiceLeft: draft.hitDiceLeft,
    slots: [...draft.slots],
    spells: structuredClone(draft.spells),
    spellNotes: draft.spellNotes,
    features: draft.features,
    class: draft.class,
    subclass: draft.subclass,
  };
}

function validateLevelUp(session, step) {
  const { draft, character } = session;
  if (step === 0 || step === 3) {
    if (
      draft.abilities.some(
        (value) => !Number.isInteger(value) || value < 1 || value > 30,
      ) ||
      ![6, 8, 10, 12].includes(draft.dieSides) ||
      !Number.isInteger(draft.dieResult) ||
      draft.dieResult < 1 ||
      draft.dieResult > draft.dieSides ||
      !Number.isSafeInteger(draft.extraHp) ||
      !Number.isSafeInteger(draft.hitDiceLeft) ||
      draft.hitDiceLeft < 0 ||
      !draft.hitDice.trim()
    )
      throw Error(
        'Check the ability scores, hit die result, and hit dice fields.',
      );
    const patch = levelUpPatch(session);
    if (!Number.isSafeInteger(patch.maxHp) || patch.maxHp < 1)
      throw Error('Maximum HP must be a positive whole number.');
  }
  if (step === 1 || step === 3) {
    if (
      draft.slots.some(
        (value, index) =>
          !Number.isInteger(value) ||
          value < character.usedSlots[index] ||
          value > 20,
      )
    )
      throw Error(
        'Slot totals must be whole numbers from 0 to 20, and cannot be below slots already used.',
      );
    if (
      draft.spells.some(
        (spell) =>
          !Number.isInteger(spell.level) || spell.level < 0 || spell.level > 9,
      )
    )
      throw Error('Spell levels must be whole numbers from 0 to 9.');
  }
}

function levelUpField(label, key, value, type = 'text', extra = '') {
  return /* HTML */ `<label class="field"
    ><span>${label}</span
    ><input
      data-level-up="${key}"
      type="${type}"
      value="${esc(value)}"
      ${extra}
  /></label>`;
}

function levelUpHealthPreview(session) {
  const patch = levelUpPatch(session);
  const gain = patch.maxHp - session.base.maxHp;
  return /* HTML */ `<span
      >Maximum HP:
      <strong
        >${session.base.maxHp} →
        ${Number.isFinite(patch.maxHp) ? patch.maxHp : '—'}</strong
      ></span
    ><span
      >Current HP:
      <strong
        >${session.base.hp} →
        ${Number.isFinite(patch.hp) ? patch.hp : '—'}</strong
      ></span
    ><small
      >HP change: ${Number.isFinite(gain) ? sign(gain) : '—'}. Includes the new
      hit die, Constitution changes for prior levels, and your extra
      adjustment.</small
    >`;
}

function levelUpHealthStage(session) {
  const { draft } = session;
  return /* HTML */ `<p class="help"
      >Review ability increases and choose the hit die gained. The die result
      defaults to its average; enter your roll if you roll HP.</p
    ><div class="level-up-abilities"
      >${abilities.map((ability, index) => /* HTML */ `<label><span>${ability}</span><input type="number" min="1" max="30" data-level-up-ability="${index}" value="${draft.abilities[index]}" /></label>`).join('')}</div
    ><div class="form-grid"
      ><label class="field"
        ><span>New Hit Die</span
        ><select data-level-up="dieSides"
          >${[6, 8, 10, 12].map((sides) => /* HTML */ `<option value="${sides}" ${draft.dieSides === sides ? 'selected' : ''}>d${sides}</option>`).join('')}</select
        ></label
      >${levelUpField('Hit Die Result', 'dieResult', draft.dieResult, 'number', `min="1" max="${draft.dieSides}"`)}${levelUpField('Extra HP Adjustment', 'extraHp', draft.extraHp, 'number')}${levelUpField('Hit Dice After Level Up', 'hitDice', draft.hitDice)}${levelUpField('Hit Dice Remaining', 'hitDiceLeft', draft.hitDiceLeft, 'number', 'min="0"')}</div
    ><label class="check"
      ><input
        type="checkbox"
        data-level-up="raiseCurrent"
        ${draft.raiseCurrent ? 'checked' : ''}
      />
      Increase current HP by the same amount</label
    ><div id="level-up-hp-preview" class="level-up-summary"
      >${levelUpHealthPreview(session)}</div
    >`;
}

function levelUpSpellRows(session) {
  return (
    session.draft.spells
      .map(
        (spell, index) =>
          /* HTML */ `<div class="level-up-spell-row"
            ><details
              ><summary
                >${esc(spell.name || 'Unnamed Spell')} ·
                ${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}</summary
              ><div class="level-up-spell-fields"
                ><label class="field"
                  ><span>Name</span
                  ><input
                    data-level-up-spell="${index}"
                    data-key="name"
                    value="${esc(spell.name)}" /></label
                ><label class="field"
                  ><span>Level</span
                  ><input
                    type="number"
                    min="0"
                    max="9"
                    data-level-up-spell="${index}"
                    data-key="level"
                    value="${spell.level}" /></label
                ><label class="check"
                  ><input
                    type="checkbox"
                    data-level-up-spell="${index}"
                    data-key="prepared"
                    ${spell.prepared ? 'checked' : ''}
                  />
                  Prepared</label
                ><label class="field"
                  ><span>Description</span
                  ><textarea
                    data-level-up-spell="${index}"
                    data-key="description"
                  >
${esc(spell.description)}</textarea>
                </label></div
              ></details
            >${button('level-up-remove-spell', '×', 'icon-button', `data-index="${index}" aria-label="Remove ${esc(spell.name || 'spell')} from level-up draft"`)}</div
          >`,
      )
      .join('') || '<p class="muted">No spells in this draft.</p>'
  );
}

function levelUpSpellsStage(session) {
  const { draft } = session;
  return /* HTML */ `<p class="help"
      >Enter slot totals from your class table. Already used slots stay spent.
      Add, replace, or prepare spells for this level.</p
    ><div class="level-up-slot-grid"
      >${draft.slots.map((value, index) => /* HTML */ `<label class="field"><span>Level ${index + 1}</span><input type="number" min="${session.character.usedSlots[index]}" max="20" data-level-up-slot="${index}" value="${value}" /></label>`).join('')}</div
    ><div class="level-up-spell-tools"
      >${button('level-up-reference', 'Browse SRD Spells', 'secondary compact-button')}${button('level-up-custom-spell', 'Add Custom Spell', 'secondary compact-button')}</div
    >${session.referenceLoaded ? '<div class="level-up-reference"><input type="search" id="level-up-spell-search" placeholder="Search reference spells…" aria-label="Search level-up spell reference" /><select id="level-up-reference-select" aria-label="Choose reference spell"></select>' + button('level-up-add-reference', 'Add Spell', 'secondary compact-button') + '</div>' : ''}<div
      class="level-up-spells"
      >${levelUpSpellRows(session)}</div
    ><label class="field"
      ><span>Spellcasting Notes</span
      ><textarea data-level-up="spellNotes">${esc(draft.spellNotes)}</textarea>
    </label>`;
}

function levelUpReview(session) {
  const { base, draft } = session;
  const patch = levelUpPatch(session);
  const lines = [
    `Level: ${base.level} → ${patch.level}`,
    `Proficiency: ${sign(statValue({ ...session.character, ...base }, 'proficiency'))} → ${sign(statValue({ ...session.character, ...patch }, 'proficiency'))}`,
    `Maximum HP: ${base.maxHp} → ${patch.maxHp}`,
    `Current HP: ${base.hp} → ${patch.hp}`,
    `Hit dice: ${base.hitDice} → ${patch.hitDice}`,
    `Hit dice remaining: ${base.hitDiceLeft} → ${patch.hitDiceLeft}`,
  ];
  abilities.forEach((ability, index) => {
    if (base.abilities[index] !== draft.abilities[index])
      lines.push(
        `${ability}: ${base.abilities[index]} → ${draft.abilities[index]}`,
      );
  });
  draft.slots.forEach((value, index) => {
    if (base.slots[index] !== value)
      lines.push(
        `Level ${index + 1} slot total: ${base.slots[index]} → ${value}`,
      );
  });
  if (base.class !== draft.class)
    lines.push(`Class: ${base.class || 'None'} → ${draft.class || 'None'}`);
  if (base.subclass !== draft.subclass)
    lines.push(
      `Subclass: ${base.subclass || 'None'} → ${draft.subclass || 'None'}`,
    );
  return /* HTML */ `<div class="rest-preview"
      ><h3>Changes to Apply</h3
      ><ul
        >${lines.map((line) => /* HTML */ `<li>${esc(line)}</li>`).join('')}</ul
      ></div
    ><details class="level-up-review-details"
      ><summary>Spells: ${base.spells.length} → ${draft.spells.length}</summary
      ><p class="help"
        >Before:
        ${esc(base.spells.map((spell) => spell.name || 'Unnamed Spell').join(', ') || 'None')}</p
      >${draft.spells.map((spell) => /* HTML */ `<div><strong>${esc(spell.name || 'Unnamed Spell')} · ${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}${spell.prepared ? ' · Prepared' : ''}</strong><p>${formatText(spell.description)}</p></div>`).join('')}</details
    >${base.features !== draft.features ? /* HTML */ `<section class="level-up-review-details"><h3>Features After Level Up</h3><p>${formatText(draft.features || 'None')}</p></section>` : '<p class="help">Features unchanged.</p>'}${base.spellNotes !== draft.spellNotes ? /* HTML */ `<section class="level-up-review-details"><h3>Spellcasting Notes After Level Up</h3><p>${formatText(draft.spellNotes || 'None')}</p></section>` : ''}`;
}

function renderLevelUpStep() {
  const session = levelUpSession;
  if (!session) return;
  const { draft, step } = session;
  $('#level-up-progress').textContent =
    `Level ${session.base.level} → ${draft.level} · Proficiency ${sign(statValue({ ...session.character, ...session.base }, 'proficiency'))} → ${sign(statValue({ ...session.character, ...draft }, 'proficiency'))} · ${step + 1} of 4`;
  $('#level-up-stage-title').textContent = levelUpSteps[step];
  $('#level-up-stage').innerHTML =
    step === 0
      ? levelUpHealthStage(session)
      : step === 1
        ? levelUpSpellsStage(session)
        : step === 2
          ? /* HTML */ `<p class="help"
                >Review your class and subclass choices and record new features,
                feats, or other changes. Adjust limited actions and resources on
                Combat as needed.</p
              ><div class="form-grid"
                >${levelUpField('Class', 'class', draft.class)}${levelUpField('Subclass', 'subclass', draft.subclass)}</div
              ><label class="field"
                ><span>Features, Feats & Traits</span
                ><textarea data-level-up="features">
${esc(draft.features)}</textarea>
              </label>`
          : levelUpReview(session);
  $('#level-up-back').disabled = step === 0;
  $('#modal button[type="submit"]').textContent =
    step === 3 ? 'Apply Level Up' : 'Next';
  if ($('#level-up-reference-select')) filterLevelUpReference();
  growTextAreas($('#level-up-stage'));
  $('.level-up-wizard').scrollTop = 0;
}

function filterLevelUpReference() {
  const query = $('#level-up-spell-search').value.trim().toLocaleLowerCase();
  const matches = spellReference.filter((spell) =>
    spell.name.toLocaleLowerCase().includes(query),
  );
  $('#level-up-reference-select').innerHTML =
    matches
      .map(
        (spell) =>
          /* HTML */ `<option value="${esc(spell.id)}"
            >${esc(spell.name)} ·
            ${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}</option
          >`,
      )
      .join('') || '<option value="">No matching spells</option>';
}

function handleLevelUpInput(element) {
  const session = levelUpSession;
  if (!session) return;
  const { draft } = session;
  const value =
    element.type === 'checkbox'
      ? element.checked
      : element.type === 'number' || element.dataset.levelUp === 'dieSides'
        ? element.value === ''
          ? NaN
          : Number(element.value)
        : element.value;
  if (element.id === 'level-up-spell-search') {
    filterLevelUpReference();
    return;
  }
  if (element.dataset.levelUpAbility !== undefined)
    draft.abilities[Number(element.dataset.levelUpAbility)] = value;
  else if (element.dataset.levelUpSlot !== undefined)
    draft.slots[Number(element.dataset.levelUpSlot)] = value;
  else if (element.dataset.levelUpSpell !== undefined) {
    const spell = draft.spells[Number(element.dataset.levelUpSpell)];
    if (
      ['name', 'level', 'description', 'prepared'].includes(element.dataset.key)
    )
      spell[element.dataset.key] = value;
    element
      .closest('.level-up-spell-row')
      .querySelector('summary').textContent =
      `${spell.name || 'Unnamed Spell'} · ${spell.level === 0 ? 'Cantrip' : `Level ${spell.level}`}`;
  } else if (
    [
      'dieSides',
      'dieResult',
      'extraHp',
      'hitDice',
      'hitDiceLeft',
      'raiseCurrent',
      'spellNotes',
      'features',
      'class',
      'subclass',
    ].includes(element.dataset.levelUp)
  ) {
    draft[element.dataset.levelUp] = value;
    if (element.dataset.levelUp === 'hitDice') session.poolEdited = true;
    if (element.dataset.levelUp === 'dieSides') {
      draft.dieResult = draft.dieSides / 2 + 1;
      if (!session.poolEdited)
        draft.hitDice = addLevelHitDie(session.base.hitDice, draft.dieSides);
      $('[data-level-up="dieResult"]').value = draft.dieResult;
      $('[data-level-up="dieResult"]').max = draft.dieSides;
      $('[data-level-up="hitDice"]').value = draft.hitDice;
    }
  }
  if ($('#level-up-hp-preview'))
    $('#level-up-hp-preview').innerHTML = levelUpHealthPreview(session);
}

function openLevelUp(character) {
  if (character.level >= 20) {
    toast('This character is already level 20.');
    return;
  }
  const base = levelUpBaseline(character);
  const sides = Number(
    [...character.hitDice.matchAll(/d(6|8|10|12)/gi)].at(-1)?.[1] || 8,
  );
  levelUpSession = {
    character,
    base,
    step: 0,
    poolEdited: false,
    referenceLoaded: false,
    draft: {
      ...structuredClone(base),
      level: character.level + 1,
      dieSides: sides,
      dieResult: sides / 2 + 1,
      extraHp: 0,
      raiseCurrent: false,
      hitDice: addLevelHitDie(character.hitDice, sides),
      hitDiceLeft: character.hitDiceLeft + 1,
    },
  };
  modal(
    'Level-Up Review',
    '<div class="level-up-wizard" tabindex="-1"><p id="level-up-progress" class="help"></p><h3 id="level-up-stage-title"></h3><div id="level-up-stage"></div></div>',
    () => {
      const session = levelUpSession;
      if (!session || session.step !== 3 || current() !== character)
        throw Error('Complete the review before applying changes.');
      if (
        JSON.stringify(levelUpBaseline(character)) !==
        JSON.stringify(session.base)
      )
        throw Error(
          'The character changed during the review. Cancel and reopen Level Up to review the latest values.',
        );
      validateLevelUp(session, 3);
      const patch = levelUpPatch(session);
      validateBackup({
        format: 'statfolio',
        version: 1,
        characters: [{ ...character, ...patch }],
      });
      Object.assign(character, patch);
      editingSpell = null;
      levelUpSession = null;
      changed();
      renderCharacter();
      toast(`Advanced to level ${character.level}.`);
    },
    'Next',
  );
  const form = $('#modal-form');
  const apply = form.onsubmit;
  form.onsubmit = async (event) => {
    const session = levelUpSession;
    if (session && session.step < 3) {
      event.preventDefault();
      try {
        validateLevelUp(session, session.step);
        session.step++;
        renderLevelUpStep();
      } catch (error) {
        toast(error.message);
      }
      return;
    }
    return apply(event);
  };
  const back = document.createElement('button');
  back.type = 'button';
  back.id = 'level-up-back';
  back.className = 'secondary';
  back.dataset.action = 'level-up-back';
  back.textContent = 'Back';
  $('.modal-actions').insertBefore(back, $('#modal button[type="submit"]'));
  renderLevelUpStep();
}

function characterDetails() {
  const fields = [
    field('Character Name', 'name'),
    field('Class', 'class'),
    field('Subclass', 'subclass'),
    field('Level', 'level', 'number', { max: 20 }),

    field('Species / Race', 'species'),
    field('Background', 'background'),
    field('Alignment', 'alignment'),
    field('Player Name', 'player'),
    field('Experience Points', 'xp', 'number'),
  ];

  return `<div class="form-grid">${fields.join('')}</div>`;
}

const views = {
  overview: (c) =>
    /* HTML */ `<div class="sheet-grid overview-grid"
      ><div
        >${panel('Ability Scores', abilityTiles(c), '<span class="muted">Modifiers calculated automatically</span>')}${panel('Character Details', characterDetails(), button('level-up', 'Level Up', 'secondary compact-button', c.level >= 20 ? 'disabled title="Maximum Level Reached"' : ''))}${characterActions()}</div
      ><div
        >${panel(
          'Reference Stats',
          /* HTML */ `<div class="glance"
            ><div
              ><span>Proficiency</span
              ><strong ${statHint(c, 'proficiency')}
                >${sign(statValue(c, 'proficiency'))}</strong
              ></div
            ><div
              ><span>Passive perception</span
              ><strong ${statHint(c, 'passivePerception')}
                >${statValue(c, 'passivePerception')}</strong
              ></div
            ><div
              ><span>Initiative</span
              ><strong ${statHint(c, 'initiative')}
                >${sign(statValue(c, 'initiative'))}</strong
              ></div
            ><div
              ><span>Armor Class</span
              ><strong ${statHint(c, 'ac')}>${statValue(c, 'ac')}</strong></div
            ></div
          >`,
          /* HTML */ `<label class="check inspiration"
            ><input
              type="checkbox"
              data-field="inspiration"
              ${c.inspiration ? 'checked' : ''}
            />
            Inspiration</label
          >`,
        )}${panel('Hit Points', healthControls(c))}${panel('Quick Journal', button('new-note', '＋ Write a note', 'secondary full'))}</div
      ></div
    >`,
  abilities: (c) =>
    `${panel('Ability Scores', abilityTiles(c))}<div class="sheet-grid">${panel(
      'Skills',
      /* HTML */ `<input
          id="skill-search"
          type="search"
          aria-label="Search skills"
          placeholder="Search skills…"
          value="${esc(skillSearch)}"
        /><div class="skill-row skill-head"
          ><span>SKILL</span><span>P</span><span>E</span><span>BONUS</span></div
        >${filteredSkills()
          .map(
            ([s, a]) =>
              /* HTML */ `<div class="skill-row"
                ><span
                  >${s}<small
                    >${abilities[a].slice(0, 3).toUpperCase()}</small
                  ></span
                ><input
                  aria-label="${s} proficiency"
                  type="checkbox"
                  data-skill="${s}"
                  ${c.skills.includes(s) ? 'checked' : ''}
                /><input
                  aria-label="${s} expertise"
                  type="checkbox"
                  data-expertise="${s}"
                  ${c.expertise.includes(s) ? 'checked' : ''}
                /><strong ${statHint(c, `skill.${s}`)}
                  >${sign(statValue(c, `skill.${s}`))}</strong
                ></div
              >`,
          )
          .join(
            '',
          )}${filteredSkills().length ? '' : '<p class="muted" role="status">No matching skills.</p>'}`,
    )}<div>${panel('Saving Throws', savingThrows(c))}${panel('Other Proficiencies & Languages', area('Languages, Tools, Armor & Weapons', 'proficiencies', 'Common, Elvish, thieves’ tools…'))}</div></div>`,
  combat: (c) =>
    /* HTML */ `<div class="combat-stats"
        >${baseStatField(c, 'Armor Class', 'ac', 'ac')}${baseStatField(c, 'Speed (ft)', 'speed', 'speed')}${baseStatField(c, 'Initiative Adjustment', 'initiativeBonus', 'initiative')}${field('Hit Dice Remaining', 'hitDiceLeft', 'number')}${field('Hit Dice', 'hitDice')}</div
      ><div class="sheet-grid"
        ><div
          >${panel('Attacks & Actions', attackRecords(c), button('add-attack', '＋ Add attack', 'text-button'))}${combatSpells(c)}</div
        ><div
          >${panel('Health & Recovery', `${healthControls(c)}<div class="form-grid">${field('Death Save Successes', 'deathSuccess', 'number', { max: 3 })}${field('Death Save Failures', 'deathFailure', 'number', { max: 3 })}</div>${conditionsTracker(c)}`)}${panel('Features & Resources', area('Class Features, Feats & Traits', 'features', 'Record your actions, traits, and limited-use abilities.') + resourceRecords(c), button('add-resource', '＋ Add', 'text-button'))}</div
        ></div
      >`,
  spells: (c) =>
    /* HTML */ `<div class="spellcasting-layout"
        >${spellSlots(c)}${spellcastingSummary(c)}</div
      ><div class="spellbook-controls"
        >${panel('Search & Filters', spellFilterControls(c))}</div
      >${panel(
        'Known Spells',
        `<div id="spell-results">${spellRecords(c)}</div>`,
        `<div class="spellbook-actions">${button('combat-log', 'Combat log', 'secondary')}${button('import-spell', 'Import spell', 'secondary')}${button('add-spell', '＋ Add spell', 'secondary')}</div>`,
      )}${panel('Spellcasting Notes', area('Rituals, Pact Magic & Other Details', 'spellNotes'))}`,
  equipment: (c) =>
    `${panel(
      'Currency',
      /* HTML */ `<div class="currency-layout"
        ><div class="coins"
          >${Object.keys(c.coins)
            .map((k) => field(k.toUpperCase(), `coins.${k}`, 'number'))
            .join('')}</div
        ><div class="currency-actions health-actions"
          ><input
            id="currency-amount"
            type="text"
            placeholder="10gp, 2sp"
            autocomplete="off"
            aria-label="Currency amount"
            title="Enter an amount using the selected coin type, or a list such as 10gp, 2sp. Press Enter to gain."
          /><select id="currency-unit" aria-label="Currency denomination"
            >${Object.keys(coinValues)
              .map(
                (unit) =>
                  `<option value="${unit}" ${unit === 'gp' ? 'selected' : ''}>${unit.toUpperCase()}</option>`,
              )
              .join('')}</select
          >${button('spend', 'Spend', 'secondary')}${button('gain', 'Gain', 'secondary')}</div
        ></div
      >`,
    )}${panel(
      'Inventory',
      `<div class="inventory-search-tools"><input id="inventory-search" type="search" aria-label="Search items by name or notes" placeholder="Search items…" value="${esc(inventorySearch)}" />${button('filter-item-modifiers', '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2 4h3m4 0h5M2 12h7m4 0h1" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /><circle cx="7" cy="4" r="2" stroke="currentColor" stroke-width="1.4" /><circle cx="11" cy="12" r="2" stroke="currentColor" stroke-width="1.4" /></svg>Modifiers Only', 'secondary inventory-modifier-filter', `aria-pressed="${inventoryModifiersOnly}" title="Show only items with stat bonuses"`)}</div>` +
        (c.equipment.length
          ? '<div class="inventory-list">' +
            c.equipment.map(inventoryRecord).join('') +
            `</div><p class="help">Checkbox = equipped · Total carried weight: <strong>${c.equipment.reduce((n, e) => n + e.quantity * e.weight, 0).toFixed(1)} lb</strong> (all listed items; excludes coins)</p>`
          : empty(
              'Pack for the Journey',
              'Track your gear, treasures, and the things you can’t leave behind.',
            )) +
        `<p id="inventory-search-empty" class="muted" role="status" ${!c.equipment.length || c.equipment.some(inventoryMatches) ? 'hidden' : ''}>No matching items.</p>`,
      `<div class="inventory-actions">${button('import-equipment', 'Import Equipment', 'secondary')}${button('add-item', '＋ Add item', 'secondary')}</div>`,
    )}`,
  background: (c) =>
    /* HTML */ `<div class="sheet-grid background-grid"
      ><div
        >${panel('Personality', area('Personality Traits', 'personality') + area('Ideals', 'ideals') + area('Bonds', 'bonds') + area('Flaws', 'flaws'))}</div
      ><div
        >${panel('Your Story', area('Appearance', 'appearance') + area('Backstory', 'story') + area('Allies & Organizations', 'allies'))}</div
      ></div
    >`,
  notes: journalView,
};

// Journal search, note previews, and the active note editor.
function journalTags(character) {
  return [...new Set(character.notes.flatMap((note) => note.tags || []))].sort(
    (a, b) => a.localeCompare(b),
  );
}

function noteTagOptions(character, value) {
  const comma = value.lastIndexOf(',');
  const query = value.slice(comma + 1).trim().toLocaleLowerCase();
  const selected = new Set(
    value.split(',').map((tag) => tag.trim().toLocaleLowerCase()),
  );
  const prefix = comma < 0 ? '' : `${value.slice(0, comma + 1)} `;
  return journalTags(character)
    .filter((tag) => {
      const normalized = tag.toLocaleLowerCase();
      return !selected.has(normalized) && normalized.includes(query);
    })
    .map(
      (tag) =>
        `<option value="${esc(prefix + tag)}" label="${esc(tag)}"></option>`,
    )
    .join('');
}

function remapNoteIds(character) {
  const ids = new Map(character.notes.map((note) => [note.id, uid()]));

  for (const note of character.notes) {
    note.id = ids.get(note.id);
    if (note.links)
      note.links = note.links.map((id) => ids.get(id)).filter(Boolean);
  }
}

function relatedNotes(character, note) {
  const linked = character.notes.filter((other) =>
    note.links?.includes(other.id),
  );

  return /* HTML */ `<div class="related-notes"
    ><div class="related-notes-heading"
      ><span>Related notes</span
      >${button('link-notes', 'Manage links', 'text-button')}</div
    ><div class="note-links"
      >${linked.length ? linked.map((other) => button('open-related-note', esc(other.title || 'Untitled note'), 'secondary', `data-id="${other.id}"`)).join('') : '<span class="muted">No linked notes.</span>'}</div
    ></div
  >`;
}

function journalList(c) {
  const query = noteSearch.trim().toLocaleLowerCase();
  const notes = c.notes
    .filter(
      (n) =>
        (noteFilter === 'all' ||
          (noteFilter.startsWith('tag:')
            ? n.tags?.includes(noteFilter.slice(4))
            : n.tag === noteFilter)) &&
        `${n.title} ${window.StatfolioText.plain(n.body)} ${n.tag} ${(n.tags || []).join(' ')}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  return /* HTML */ `<div class="panel-heading"
      ><h2>Character Journal</h2
      >${button('new-note', '＋ New', 'text-button')}</div
    ><div class="journal-tools"
      ><input
        id="journal-search"
        type="search"
        aria-label="Search journal notes"
        placeholder="Search notes…"
        value="${esc(noteSearch)}"
      /><select id="journal-filter" aria-label="Filter notes by category or tag"
        ><option value="all">All categories</option
        >${noteCategories.map((tag) => /* HTML */ `<option ${noteFilter === tag ? 'selected' : ''}>${tag}</option>`).join('')}${
          journalTags(c).length
            ? `<optgroup label="Custom tags">${journalTags(c)
                .map(
                  (tag) =>
                    `<option value="tag:${esc(tag)}" ${noteFilter === `tag:${tag}` ? 'selected' : ''}>${esc(tag)}</option>`,
                )
                .join('')}</optgroup>`
            : ''
        }</select
      ></div
    ><p class="journal-count" role="status"
      >${notes.length === c.notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : `${notes.length} of ${c.notes.length} notes`}</p
    >${
      notes.length
        ? notes
            .map(
              (item) =>
                /* HTML */ `<button
                  class="note-preview ${noteId === item.id ? 'active' : ''}"
                  data-action="select-note"
                  data-id="${item.id}"
                  aria-pressed="${noteId === item.id}"
                  ><div class="note-preview-heading"
                    ><strong
                      >${item.pinned ? '<span class="pin-label">Pinned · </span>' : ''}${esc(item.title || 'Untitled note')}</strong
                    ><time
                      datetime="${esc(item.updated)}"
                      title="${esc(new Date(item.updated).toLocaleString())}"
                      >${new Date(item.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time
                    ></div
                  ><span class="note-preview-excerpt"
                    ><span class="note-category"
                      >${esc([item.tag || 'General', ...(item.tags || [])].join(' · '))}</span
                    ><span
                      >${formatText(item.body.replace(/\s+/g, ' ') || 'No text yet.', 160)}</span
                    ></span
                  ></button
                >`,
            )
            .join('')
        : empty(
            c.notes.length ? 'No Matching Notes' : 'No Notes Yet',
            c.notes.length
              ? 'Try another search or category.'
              : 'Keep your sessions, quests, and discoveries here.',
            c.notes.length
              ? button(
                  'clear-note-filters',
                  'Clear search & filter',
                  'text-button',
                )
              : '',
          )
    }`;
}

function renderJournalList(c) {
  const list = $('.note-list');
  if (!list) return;
  patchContent(list, journalList(c));
  const search = $('#journal-search');
  if (search.value !== noteSearch) search.value = noteSearch;
  $('#journal-filter').value = noteFilter;
}

function journalView(c) {
  if (journalCharacterId !== c.id) {
    journalCharacterId = c.id;
    noteSearch = '';
    noteFilter = 'all';
  }
  if (
    noteFilter.startsWith('tag:') &&
    !journalTags(c).includes(noteFilter.slice(4))
  ) {
    noteFilter = 'all';
  }
  const n = c.notes.find((n) => n.id === noteId) || c.notes[0];
  if (n) noteId = n.id;
  return /* HTML */ `<div class="journal"
    ><section class="panel note-list">${journalList(c)}</section
    ><section class="panel note-editor"
      >${
        n
          ? /* HTML */ `<div class="panel-heading"
                ><span class="eyebrow">Note Details</span
                ><div class="note-editor-actions"
                  >${button('pin-note', n.pinned ? 'Unpin note' : 'Pin note', 'text-button', `aria-pressed="${!!n.pinned}"`)}${button('delete-note', 'Delete note', 'text-button danger')}</div
                ></div
              ><label class="field"
                ><span>Title</span
                ><input
                  class="note-title"
                  data-note="title"
                  value="${esc(n.title)}"
                  placeholder="Untitled note" /></label
              ><label class="field"
                ><span>Category</span
                ><select data-note="tag"
                  >${noteCategories.map((t) => /* HTML */ `<option ${n.tag === t ? 'selected' : ''}>${t}</option>`).join('')}</select
                ></label
              ><label class="field"
                ><span>Tags</span
                ><input
                  data-note="tags"
                  list="note-tag-suggestions"
                  autocomplete="off"
                  value="${esc((n.tags || []).join(', '))}"
                  placeholder="Separate tags with commas" /><datalist
                  id="note-tag-suggestions"
                  >${noteTagOptions(c, (n.tags || []).join(', '))}</datalist></label
              ><label class="field"
                ><span>Notes</span
                ><textarea
                  class="note-body"
                  data-note="body"
                  placeholder="Write your notes here…"
                >
${esc(n.body)}</textarea></label
              >${relatedNotes(c, n)}<div class="note-attachments"
                >${(n.images || []).map((img, i) => /* HTML */ `<div><img src="${esc(img)}" alt="Journal attachment ${i + 1}" /><button data-action="remove-note-image" data-index="${i}" aria-label="Remove attachment">×</button></div>`).join('')}</div
              >${button('note-image', '＋ Attach image', 'secondary')}`
          : empty(
              'The Story Is Yours to Write',
              'Create a note to start keeping track of your adventure.',
              button('new-note', '＋ Write your first note', 'primary'),
            )
      }</section
    ></div
  >`;
}

// Export an editable copy of the original PDF template, entirely in the browser.
async function exportCharacterPDF(button) {
  const character = current();
  if (!character) return;

  const label = button.textContent;
  button.disabled = true;
  button.textContent = 'Creating PDF…';

  try {
    const snapshot = structuredClone(character);
    const bytes = await window.StatfolioPDF.create(snapshot, {
      abilities,
      skills,
      mod,
      prof,
      sign,
      statValue,
    });
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    const filename =
      snapshot.name
        .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
        .trim()
        .slice(0, 100)
        .replace(/[. ]+$/, '') || 'Character';
    link.href = url;
    link.download = `${filename}-character-sheet.pdf`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    $('#modal').close();
    toast('Character sheet PDF downloaded.');
  } catch (error) {
    toast(error.message || 'Could not export the character sheet PDF.');
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// All dialogs share the same markup and styling.
function modal(title, body, submit, label = 'Save') {
  const dialog = $('#modal');
  dialog.innerHTML = /* HTML */ `<form id="modal-form"
    ><div class="modal-head"
      ><h2>${title}</h2
      ><button
        type="button"
        class="icon-button"
        data-action="close-modal"
        aria-label="Close dialog"
        >×</button
      ></div
    >${body}<div class="modal-actions"
      ><button type="button" class="secondary" data-action="close-modal"
        >Cancel</button
      ><button class="primary" type="submit">${label}</button></div
    ></form
  >`;
  $('#modal-form').onsubmit = async (e) => {
    e.preventDefault();
    const submitButton = $('button[type="submit"]', dialog);
    submitButton.disabled = true;
    try {
      await submit(new FormData(e.target));
      dialog.close();
    } catch (err) {
      toast(err.message);
      submitButton.disabled = false;
    }
  };
  dialog.showModal();
  growTextAreas(dialog);
}

function confirmAction(title, description, action, label = 'Confirm') {
  modal(title, /* HTML */ `<p>${description}</p>`, action, label);
}

function confirmEntryDeletion(character, list, index) {
  const removableLists = ['attacks', 'resources', 'equipment', 'spells'];
  if (!removableLists.includes(list)) return;
  const item = character[list][index];
  if (!item) return;

  confirmAction(
    'Delete Entry?',
    'Are you sure you want to delete this entry? You can restore it with Ctrl+Z.',
    () => {
      const currentIndex = character[list].indexOf(item);
      if (currentIndex === -1) return;
      if (list === 'attacks') editingAttack = null;
      if (list === 'spells') editingSpell = null;
      if (list === 'equipment') editingItem = null;
      character[list].splice(currentIndex, 1);
      deletedEntries.push({ character, list, index: currentIndex, item });
      if (deletedEntries.length > 50) deletedEntries.shift();
      changed();
      renderCharacter();
      toast('Entry deleted. Press Ctrl+Z to undo.');
    },
    'Delete',
  );
}

function createModal() {
  modal(
    'Begin a New Adventure',
    /* HTML */ `<p
        >Every legend starts with a name. You can fill in the rest as you go.</p
      ><label class="field"
        ><span>Character name</span
        ><input
          name="name"
          required
          maxlength="100"
          placeholder="Your adventurer’s name"
          autofocus /></label
      ><div class="form-grid"
        ><label class="field"
          ><span>Class</span
          ><input name="class" placeholder="e.g. Ranger" /></label
        ><label class="field"
          ><span>Species / race</span
          ><input name="species" placeholder="e.g. Wood elf" /></label
      ></div>`,
    async (data) => {
      const c = blank(data.get('name').trim() || 'New adventurer');
      c.class = data.get('class');
      c.species = data.get('species');
      state.characters.push(c);
      state.selected = c.id;
      page = 'overview';
      changed();
      await persist();
      shell();
    },
    'Create character',
  );
}

function chooseImage(callback) {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = 'image/png,image/jpeg,image/webp,image/gif';
  input.onchange = async () => {
    const file = input.files[0];
    if (!file) return;
    if (
      !['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(
        file.type,
      ) ||
      file.size > 8 * 1024 * 1024
    ) {
      toast('Choose a PNG, JPEG, WebP, or GIF image under 8 MB.');
      return;
    }
    try {
      const data = await new Promise((resolve, reject) => {
        const r = new FileReader();
        r.onload = () => resolve(r.result);
        r.onerror = () => reject(r.error);
        r.readAsDataURL(file);
      });
      callback(data);
      changed();
      shell();
    } catch {
      toast('Could not read this image.');
    }
  };
  input.click();
}

async function exportBackup() {
  clearTimeout(saveTimer);
  const backup = {
    format: 'statfolio',
    version: 1,
    exportedAt: new Date().toISOString(),
    characters: state.characters,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = `statfolio-backup-${new Date().toISOString().slice(0, 10)}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  state.backupHistory = {
    lastExportAt: backup.exportedAt,
    firstChangeAt: null,
    changesSinceExport: 0,
    dismissedUntil: 0,
  };
  revision++;
  renderBackupStatus();
  persist().catch(() => {});
  toast(
    `Backup exported with ${state.characters.length} character${state.characters.length === 1 ? '' : 's'} and all images.`,
  );
}

function imageValid(s) {
  return (
    typeof s === 'string' &&
    (s === '' ||
      /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(s))
  );
}

function validateBackup(input) {
  if (
    input?.format !== 'statfolio' ||
    input.version !== 1 ||
    !Array.isArray(input.characters)
  )
    throw Error('This is not a supported Statfolio backup (version 1).');
  const ids = new Set();
  return input.characters.map((raw) => {
    if (
      !raw ||
      typeof raw !== 'object' ||
      typeof raw.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id) ||
      ids.has(raw.id) ||
      typeof raw.name !== 'string'
    )
      throw Error('The backup contains invalid or duplicate characters.');
    ids.add(raw.id);
    const base = blank();
    const c = {};
    for (const [key, value] of Object.entries(base)) {
      const v = raw[key] ?? value;
      if (Array.isArray(value)) {
        if (!Array.isArray(v)) throw Error(`Invalid ${key} in backup.`);
        c[key] = v;
      } else if (typeof value === 'object') {
        if (typeof v !== 'object' || Array.isArray(v) || !v)
          throw Error(`Invalid ${key}.`);
        c[key] = { ...value };
        for (const coin of Object.keys(value)) {
          if (
            v[coin] !== undefined &&
            (!Number.isFinite(v[coin]) || v[coin] < 0)
          )
            throw Error('Invalid currency.');
          c[key][coin] = v[coin] ?? 0;
        }
      } else {
        if (
          typeof v !== typeof value ||
          (typeof v === 'number' && !Number.isFinite(v))
        )
          throw Error(`Invalid ${key} in backup.`);
        c[key] = v;
      }
    }
    if (
      !imageValid(c.image) ||
      !Number.isInteger(c.level) ||
      c.level < 1 ||
      c.level > 20 ||
      !Number.isInteger(c.spellAbility) ||
      c.spellAbility < 0 ||
      c.spellAbility > 5 ||
      ['hp', 'maxHp', 'tempHp', 'ac', 'speed', 'hitDiceLeft', 'xp'].some(
        (key) => !Number.isSafeInteger(c[key]) || c[key] < 0,
      ) ||
      !Number.isSafeInteger(c.initiativeBonus) ||
      ['deathSuccess', 'deathFailure'].some(
        (key) => !Number.isInteger(c[key]) || c[key] < 0 || c[key] > 3,
      ) ||
      c.abilities.length !== 6 ||
      c.abilities.some((n) => !Number.isInteger(n) || n < 1 || n > 30) ||
      c.slots.length !== 9 ||
      c.usedSlots.length !== 9 ||
      [...c.slots, ...c.usedSlots].some(
        (n) => !Number.isInteger(n) || n < 0 || n > 20,
      ) ||
      c.saves.some((n) => !Number.isInteger(n) || n < 0 || n > 5) ||
      [...c.skills, ...c.expertise].some((s) => !Object.hasOwn(skills, s))
    )
      throw Error(
        'Invalid character scores, slots, proficiencies, or portrait.',
      );
    if (
      c.activeConditions.some(
        (name) =>
          typeof name !== 'string' ||
          name === 'Exhaustion' ||
          !Object.hasOwn(conditionRules, name),
      ) ||
      !Number.isInteger(c.exhaustionLevel) ||
      c.exhaustionLevel < 0 ||
      c.exhaustionLevel > 6
    )
      throw Error('Invalid conditions or exhaustion level.');

    if (
      c.concentrationDamage.some(
        (amount) => !Number.isSafeInteger(amount) || amount <= 0,
      )
    )
      throw Error('Invalid concentration damage.');
    if (!c.concentrationSpell || c.hp === 0) endConcentration(c);

    if (
      [c.lastShortRest, c.lastLongRest].some(
        (value) => value !== '' && !Number.isFinite(Date.parse(value)),
      )
    )
      throw Error('Invalid rest date.');
    c.combatLog = validateCombatLog(c.combatLog);
    c.activeConditions = [...new Set(c.activeConditions)];
    c.skills = [...new Set([...c.skills, ...c.expertise])];
    c.hp = Math.min(c.hp, c.maxHp);
    const schemas = {
      attacks: {
        name: 'string',
        bonus: 'string',
        damage: 'string',
        type: 'string',
        notes: 'string',
      },
      resources: { name: 'string', remaining: 'number', max: 'number' },
      spells: {
        name: 'string',
        level: 'number',
        school: 'string',
        time: 'string',
        range: 'string',
        components: 'string',
        duration: 'string',
        description: 'string',
        prepared: 'boolean',
      },
      equipment: {
        name: 'string',
        quantity: 'number',
        weight: 'number',
        notes: 'string',
        equipped: 'boolean',
      },
      notes: {
        id: 'string',
        title: 'string',
        body: 'string',
        tag: 'string',
        updated: 'string',
      },
    };
    for (const [key, schema] of Object.entries(schemas)) {
      const noteIds = new Set();
      const resourceIds = new Set();
      const attackIds = new Set();
      c[key] = c[key].map((item) => {
        if (!item || typeof item !== 'object')
          throw Error(`Invalid ${key} entry.`);
        const clean = {};
        for (const [k, type] of Object.entries(schema)) {
          if (
            typeof item[k] !== type ||
            (type === 'number' && (!Number.isFinite(item[k]) || item[k] < 0))
          )
            throw Error(`Invalid ${key} entry.`);
          clean[k] = item[k];
        }
        if (key === 'equipment' && item.bonuses !== undefined) {
          if (!Array.isArray(item.bonuses))
            throw Error('Invalid item bonuses.');
          clean.bonuses = item.bonuses.map((bonus) => {
            if (
              !bonus ||
              !bonusTargets.has(bonus.target) ||
              !Number.isSafeInteger(bonus.amount)
            )
              throw Error('Invalid item bonus target or amount.');
            return { target: bonus.target, amount: bonus.amount };
          });
        }
        if (key === 'resources' && item.recovery !== undefined) {
          if (!['manual', 'short', 'long'].includes(item.recovery))
            throw Error('Invalid resource recovery.');
          clean.recovery = item.recovery;
        }
        if (key === 'resources' && item.id !== undefined) {
          if (
            typeof item.id !== 'string' ||
            !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
            resourceIds.has(item.id)
          )
            throw Error('Invalid resource ID.');
          resourceIds.add(item.id);
          clean.id = item.id;
        }
        if (key === 'attacks') {
          if (item.id !== undefined) {
            if (
              typeof item.id !== 'string' ||
              !/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) ||
              attackIds.has(item.id)
            )
              throw Error('Invalid attack ID.');
            attackIds.add(item.id);
            clean.id = item.id;
          }
          if (item.useLimit !== undefined) {
            if (
              item.useLimit !== '' &&
              (!Number.isSafeInteger(item.useLimit) || item.useLimit < 1)
            )
              throw Error('Invalid attack use limit.');
            clean.useLimit = item.useLimit;
          }
          if (item.usesSpent !== undefined) {
            if (
              !Number.isSafeInteger(item.usesSpent) ||
              item.usesSpent < 0 ||
              item.usesSpent > (attackHasUses(item) ? item.useLimit : 0)
            )
              throw Error('Invalid attack uses spent.');
            clean.usesSpent = item.usesSpent;
          }
          if (item.recovery !== undefined) {
            if (!['', 'short', 'long'].includes(item.recovery))
              throw Error('Invalid attack recovery.');
            clean.recovery = item.recovery;
          }
        }
        if (
          (key === 'attacks' || key === 'spells') &&
          item.favorite !== undefined
        ) {
          if (typeof item.favorite !== 'boolean')
            throw Error('Invalid combat favorite.');
          clean.favorite = item.favorite;
        }
        if (key === 'attacks' || key === 'spells') {
          if (item.actionType !== undefined) {
            if (!actionTypes.includes(item.actionType))
              throw Error('Invalid action type.');
            clean.actionType = item.actionType;
          }
        }
        if (key === 'spells') {
          for (const flag of ['concentration', 'ritual']) {
            if (item[flag] !== undefined && typeof item[flag] !== 'boolean')
              throw Error('Invalid spell flag.');
            clean[flag] = spellFlag(item, flag);
          }
        }
        if (key === 'notes') {
          if (!/^[a-zA-Z0-9_-]{1,100}$/.test(item.id) || noteIds.has(item.id))
            throw Error('Invalid or duplicate note ID.');
          noteIds.add(item.id);
          if (
            item.images !== undefined &&
            (!Array.isArray(item.images) ||
              item.images.some((s) => !imageValid(s)))
          )
            throw Error('Invalid note images.');
          clean.images = item.images || [];
          if (item.pinned !== undefined) {
            if (typeof item.pinned !== 'boolean')
              throw Error('Invalid note pin.');
            clean.pinned = item.pinned;
          }

          if (item.tags !== undefined) {
            if (
              !Array.isArray(item.tags) ||
              item.tags.some((tag) => typeof tag !== 'string')
            )
              throw Error('Invalid note tags.');
            clean.tags = [
              ...new Set(item.tags.map((tag) => tag.trim()).filter(Boolean)),
            ];
          }

          if (item.links !== undefined) {
            if (
              !Array.isArray(item.links) ||
              item.links.some(
                (id) =>
                  typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id),
              )
            )
              throw Error('Invalid note links.');
            clean.links = [...new Set(item.links)].filter(
              (id) => id !== item.id,
            );
          }
        }
        return clean;
      });
    }
    const validNoteIds = new Set(c.notes.map((note) => note.id));
    for (const note of c.notes) {
      if (note.links)
        note.links = note.links.filter((id) => validNoteIds.has(id));
    }

    if (
      [...bonusTargets.keys()].some(
        (target) => !Number.isSafeInteger(statValue(c, target)),
      )
    )
      throw Error('Item bonuses produce a value outside the supported range.');
    return c;
  });
}
$('#restore-file').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    if (file.size > 250 * 1024 * 1024)
      throw Error('This backup is too large (maximum 250 MB).');
    const chars = validateBackup(JSON.parse(await file.text()));
    modal(
      'Restore Your Folio',
      /* HTML */ `<p
          >This backup contains
          <strong
            >${chars.length} character${chars.length === 1 ? '' : 's'}</strong
          >, including portraits and journal images.</p
        ><label class="field"
          ><span>Restore method</span
          ><select name="mode"
            ><option value="merge"
              >Add as copies — keep all existing characters</option
            ><option value="replace"
              >Replace entire library with this backup</option
            ></select
          ></label
        ><p class="help"
          >Replacing removes your current library. Export a backup first if you
          want to keep it.</p
        >`,
      async (data) => {
        const previous = structuredClone(state);
        const copies = structuredClone(chars);
        if (data.get('mode') === 'merge') {
          copies.forEach((c) => {
            c.id = uid();
            remapNoteIds(c);
          });
          state.characters.push(...copies);
        } else state.characters = copies;
        state.selected = null;
        recordBackupChange();
        revision++;
        try {
          await persist();
          shell();
          toast('Backup restored, including all images.');
        } catch (err) {
          state = previous;
          throw Error(
            'Restore could not be saved. Your existing library is still intact.',
          );
        }
      },
      'Restore backup',
    );
  } catch (err) {
    toast(
      err instanceof SyntaxError ? 'This file is not valid JSON.' : err.message,
    );
  }
};

document.addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-page]');
  if (nav) {
    e.preventDefault();
    if (!Object.hasOwn(views, nav.dataset.page) || nav.dataset.page === page)
      return;
    clearTimeout(refreshTimer);
    try {
      renderPage(nav.dataset.page);
      editingAttack = null;
      editingSpell = null;
      editingItem = null;
    } catch (error) {
      console.error(error);
      toast(
        'This page could not be opened. Your current page and character are still available.',
      );
    }
    // Edits already schedule autosave. Navigation changes no saved data, and
    // cloning a library with portraits/attachments on every click blocks input.
    return;
  }
  const btn = e.target.closest('[data-action]');
  if (!btn) return;
  e.preventDefault();
  const action = btn.dataset.action,
    c = current();
  switch (action) {
    case 'toggle-conditions': {
      const picker = $('#condition-picker');
      picker.hidden = !picker.hidden;
      btn.setAttribute('aria-expanded', String(!picker.hidden));
      if (!picker.hidden) {
        $('#condition-search').value = '';
        filterConditions('');
        $('#condition-search').focus();
      }
      break;
    }

    case 'close-conditions':
      closeConditionsPicker();
      $('[data-action="toggle-conditions"]')?.focus();
      break;

    case 'remove-condition': {
      const name = btn.dataset.conditionReference;
      if (name === 'Exhaustion') c.exhaustionLevel = 0;
      else
        c.activeConditions = (c.activeConditions || []).filter(
          (condition) => condition !== name,
        );
      hideSpellPopup();
      changed();
      renderCharacter();
      $('[data-action="toggle-conditions"]')?.focus();
      break;
    }

    case 'library':
      state.selected = null;
      shell();
      changed(false);
      break;

    case 'new':
      createModal();
      break;

    case 'open':
      state.selected = btn.dataset.id;
      page = 'overview';
      noteId = null;
      shell();
      changed(false);
      break;

    case 'backup':
      await exportBackup();
      break;

    case 'dismiss-backup-reminder':
      backupHistory().dismissedUntil = Date.now() + dayInMilliseconds;
      revision++;
      renderBackupStatus();
      persist().catch(() => {});
      break;

    case 'restore':
      $('#restore-file').click();
      break;

    case 'close-modal':
      levelUpSession = null;
      $('#modal').close();
      break;

    case 'level-up':
      openLevelUp(c);
      break;

    case 'level-up-back':
      if (levelUpSession?.step > 0) {
        levelUpSession.step--;
        renderLevelUpStep();
      }
      break;

    case 'level-up-reference': {
      const session = levelUpSession;
      btn.disabled = true;
      try {
        await loadSpellReference();
        if (session === levelUpSession && $('#modal').open) {
          session.referenceLoaded = true;
          renderLevelUpStep();
        }
      } catch (error) {
        toast(error.message);
      } finally {
        btn.disabled = false;
      }
      break;
    }

    case 'level-up-add-reference': {
      const reference = spellReference.find(
        (spell) => spell.id === $('#level-up-reference-select')?.value,
      );
      if (!levelUpSession || !reference) break;
      const { id, ...fields } = reference;
      levelUpSession.draft.spells.push({
        ...structuredClone(fields),
        prepared: false,
        actionType: castingActionType(fields.time),
      });
      renderLevelUpStep();
      break;
    }

    case 'level-up-custom-spell':
      if (!levelUpSession) break;
      levelUpSession.draft.spells.push({
        name: 'New Spell',
        level: 0,
        school: '',
        time: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        prepared: false,
        concentration: false,
        ritual: false,
        actionType: '',
      });
      renderLevelUpStep();
      break;

    case 'level-up-remove-spell':
      if (!levelUpSession) break;
      levelUpSession.draft.spells.splice(Number(btn.dataset.index), 1);
      renderLevelUpStep();
      break;

    case 'portrait':
      chooseImage((data) => (c.image = data));
      break;

    case 'rename':
      modal(
        'Edit Character Identity',
        /* HTML */ `<div class="form-grid"
          >${['name', 'class', 'subclass', 'species'].map((k) => /* HTML */ `<label class="field"><span>${k === 'name' ? 'Character Name' : k[0].toUpperCase() + k.slice(1)}</span><input name="${k}" value="${esc(c[k])}" ${k === 'name' ? 'required' : ''} /></label>`).join('')}</div
        >`,
        (data) => {
          for (const k of ['name', 'class', 'subclass', 'species'])
            c[k] = data.get(k).trim();
          changed();
          shell();
        },
      );
      break;

    case 'menu':
      modal(
        'Character Options',
        /* HTML */ `<div class="option-buttons"
          >${button('export-sheet-pdf', 'Export sheet PDF', 'secondary')}${button('remove-portrait', 'Remove portrait', 'secondary')}${button('delete-character', 'Delete character', 'secondary danger')}</div
        >`,
        () => {},
        'Done',
      );
      break;

    case 'export-sheet-pdf':
      await exportCharacterPDF(btn);
      break;

    case 'duplicate': {
      const source = state.characters.find(
        (character) => character.id === btn.dataset.id,
      );
      if (!source) break;

      const copy = structuredClone(source);
      copy.id = uid();
      copy.name += ' (copy)';
      remapNoteIds(copy);
      state.characters.push(copy);
      state.selected = copy.id;
      if ($('#modal').open) $('#modal').close();
      changed();
      shell();
      toast('Character duplicated.');
      break;
    }

    case 'remove-portrait':
      c.image = '';
      $('#modal').close();
      changed();
      shell();
      break;

    case 'delete-character':
      $('#modal').close();
      confirmAction(
        'Delete This Character?',
        `Permanently remove <strong>${esc(c.name)}</strong>, their notes, and images from this browser?`,
        () => {
          state.characters = state.characters.filter((x) => x.id !== c.id);
          state.selected = null;
          changed();
          shell();
        },
        'Delete character',
      );
      break;

    case 'toggle-combat-favorite': {
      const list = btn.dataset.list;
      if (!['attacks', 'spells'].includes(list)) break;
      const entry = c[list][Number(btn.dataset.index)];
      if (!entry) break;
      entry.favorite = !entry.favorite;
      changed();
      renderCharacter();
      break;
    }

    case 'adjust-resource':
      adjustResource(
        c,
        btn.dataset.list,
        Number(btn.dataset.index),
        Number(btn.dataset.direction),
      );
      break;

    case 'use-attack':
      openUseAttackModal(c, Number(btn.dataset.index));
      break;

    case 'add-attack':
      c.attacks.push({
        name: '',
        bonus: '',
        damage: '',
        type: '',
        actionType: '',
        useLimit: '',
        usesSpent: 0,
        recovery: '',
        notes: '',
      });
      editingAttack = c.attacks.at(-1);
      changed();
      renderCharacter();
      $('[data-attack-editor] input')?.focus();
      break;

    case 'edit-attack':
      editingAttack = c.attacks[Number(btn.dataset.index)];
      renderCharacter();
      $('[data-attack-editor] input')?.focus();
      break;

    case 'finish-attack':
      editingAttack = null;
      renderCharacter();
      break;

    case 'add-resource':
      c.resources.push({ name: '', remaining: 0, max: 0, recovery: 'manual' });
      changed();
      renderCharacter();
      break;

    case 'clear-spell-filters':
      spellFilters = {
        name: '',
        level: '',
        school: '',
        prepared: '',
        concentration: '',
        ritual: '',
      };
      renderCharacter();
      $('[data-spell-filter="name"]')?.focus();
      break;

    case 'import-spell':
      await importSpellModal(c, btn);
      break;

    case 'preview-reference-spell':
      previewReferenceSpell(btn.dataset.referenceId);
      break;

    case 'add-spell':
      c.spells.push({
        name: '',
        level: 0,
        school: '',
        time: '',
        actionType: '',
        range: '',
        components: '',
        duration: '',
        description: '',
        prepared: false,
        concentration: false,
        ritual: false,
      });
      editingSpell = c.spells.at(-1);
      changed();
      renderCharacter();
      $('[data-spell-editor] input')?.focus();
      break;

    case 'edit-spell':
      page = 'spells';
      editingSpell = c.spells[Number(btn.dataset.index)];
      renderCharacter();
      $('[data-spell-editor] input')?.focus();
      break;

    case 'finish-spell':
      editingSpell = null;
      renderCharacter();
      break;

    case 'import-equipment':
      await importEquipmentModal(c, btn);
      break;

    case 'preview-reference-equipment':
      previewReferenceEquipment(btn.dataset.referenceId);
      break;

    case 'add-item':
      inventorySearch = '';
      inventoryModifiersOnly = false;
      c.equipment.push({
        name: '',
        quantity: 1,
        weight: 0,
        notes: '',
        equipped: false,
      });
      editingItem = c.equipment.at(-1);
      changed();
      renderCharacter();
      $('[data-item-editor] .inventory-item-name')?.focus();
      break;

    case 'filter-item-modifiers':
      inventoryModifiersOnly = !inventoryModifiersOnly;
      btn.setAttribute('aria-pressed', String(inventoryModifiersOnly));
      filterInventory(c);
      break;

    case 'edit-item':
      editingItem = c.equipment[Number(btn.dataset.index)];
      if (editingItem.bonuses?.length) expandedItemBonuses.add(editingItem);
      renderCharacter();
      $('[data-item-editor] .inventory-item-name')?.focus();
      break;

    case 'finish-item':
      editingItem = null;
      renderCharacter();
      break;

    case 'add-item-bonus': {
      const item = c.equipment[Number(btn.dataset.index)];
      item.bonuses ||= [];
      item.bonuses.push({ target: 'ac', amount: 1 });
      expandedItemBonuses.add(item);
      changed();
      renderCharacter();
      $(
        `[data-item-bonuses="${btn.dataset.index}"] .item-bonus-row:last-of-type input`,
      )?.focus();
      break;
    }

    case 'remove-item-bonus': {
      const item = c.equipment[Number(btn.dataset.index)];
      item.bonuses.splice(Number(btn.dataset.bonusIndex), 1);
      changed();
      renderCharacter();
      break;
    }

    case 'remove':
      confirmEntryDeletion(c, btn.dataset.list, Number(btn.dataset.index));
      break;

    case 'spend':
    case 'gain': {
      const raw = $('#currency-amount').value.trim();
      const unit = $('#currency-unit').value;
      const parsed = parseCurrency(raw, unit);
      if (!parsed) {
        toast('Enter a positive whole-number amount or a list like 10gp, 2sp.');
        break;
      }
      const { amounts, cost } = parsed;
      const total = Object.entries(coinValues).reduce(
        (sum, [key, value]) => sum + c.coins[key] * value,
        0,
      );
      if (
        !Object.values(c.coins).every(
          (count) => Number.isSafeInteger(count) && count >= 0,
        ) ||
        !Number.isSafeInteger(total) ||
        (action === 'gain' && !Number.isSafeInteger(total + cost))
      ) {
        toast(
          'Coin balances must be whole numbers within the supported range.',
        );
        break;
      }
      if (action === 'spend') {
        const coins = spendCoins(c.coins, cost);
        if (!coins) {
          toast('Not enough currency.');
          break;
        }
        c.coins = coins;
      } else {
        for (const key of Object.keys(coinValues)) c.coins[key] += amounts[key];
      }
      changed();
      renderCharacter();
      $('#currency-unit').value = unit;
      $('#currency-amount').value = '';
      $('#currency-amount').focus();
      break;
    }

    case 'combat-log':
      openCombatLog(c);
      break;

    case 'undo-combat-event': {
      const entry = c.combatLog.find((item) => item.id === btn.dataset.entryId);
      if (!entry || combatUndoReason(c, entry)) break;
      for (const change of entry.changes) {
        const location = combatTarget(c, change.target);
        location.object[location.key] = structuredClone(change.before);
      }
      entry.undone = true;
      changed();
      renderCharacter();
      const list = $('.combat-log');
      const scroll = list.scrollTop;
      list.innerHTML = combatLogEntries(c);
      list.scrollTop = scroll;
      toast('Combat change undone.');
      break;
    }

    case 'cast-spell':
      openCastSpellModal(c, Number(btn.dataset.index));
      break;

    case 'start-concentration':
      startConcentration(c, Number(btn.dataset.index));
      break;

    case 'end-concentration':
    case 'concentration-fail':
      endConcentration(c);
      changed();
      renderCharacter();
      break;

    case 'concentration-pass':
      c.concentrationDamage.shift();
      changed();
      renderCharacter();
      break;

    case 'heal':
    case 'damage': {
      const raw = $('#hp-amount').value.trim(),
        amount = Number(raw);
      if (
        !/^[0-9]+$/.test(raw) ||
        !Number.isSafeInteger(amount) ||
        amount <= 0
      ) {
        toast('Enter a positive whole-number amount.');
        break;
      }
      const before = combatSnapshot(c);
      if (action === 'heal') {
        const regained = Math.min(amount, Math.max(0, c.maxHp - c.hp));
        c.hp += regained;
        if (regained > 0) {
          c.deathSuccess = 0;
          c.deathFailure = 0;
        }
      } else {
        const absorbed = Math.min(c.tempHp, amount);
        c.tempHp -= absorbed;
        c.hp = Math.max(0, c.hp - (amount - absorbed));
        if (c.concentrationSpell) {
          if (c.hp === 0) {
            endConcentration(c);
            toast('Concentration ended at 0 HP.');
          } else c.concentrationDamage.push(amount);
        }
      }
      recordCombatEvent(
        c,
        `${action === 'heal' ? 'Healing' : 'Damage'}: ${amount}`,
        before,
      );
      $('#hp-amount').value = '';
      changed();
      renderCharacter();
      $('#hp-amount').focus();
      break;
    }

    case 'rest':
      openRestModal(c, 'long');
      break;

    case 'short-rest':
      openRestModal(c, 'short');
      break;

    case 'new-note': {
      if (journalCharacterId !== c.id) {
        journalCharacterId = c.id;
        noteFilter = 'all';
      }
      noteSearch = '';
      const n = {
        id: uid(),
        title: '',
        body: '',
        tag:
          noteFilter === 'all' || noteFilter.startsWith('tag:')
            ? 'General'
            : noteFilter,
        pinned: false,
        tags: noteFilter.startsWith('tag:') ? [noteFilter.slice(4)] : [],
        links: [],
        updated: new Date().toISOString(),
        images: [],
      };
      c.notes.unshift(n);
      noteId = n.id;
      page = 'notes';
      changed();
      shell();
      $('.note-title')?.focus();
      break;
    }

    case 'select-note':
      noteId = btn.dataset.id;
      renderCharacter();
      break;

    case 'pin-note': {
      const note = c.notes.find((note) => note.id === noteId);
      if (!note) break;
      note.pinned = !note.pinned;
      note.updated = new Date().toISOString();
      changed();
      renderCharacter();
      break;
    }

    case 'open-related-note':
      if (!c.notes.some((note) => note.id === btn.dataset.id)) break;
      noteId = btn.dataset.id;
      noteSearch = '';
      noteFilter = 'all';
      renderCharacter();
      break;

    case 'link-notes': {
      const note = c.notes.find((note) => note.id === noteId);
      if (!note) break;
      const others = c.notes.filter((other) => other !== note);

      modal(
        'Related Notes',
        others.length
          ? `<input id="related-notes-search" type="search" aria-label="Search related notes" placeholder="Search notes…" /><div class="note-link-options">${others.map((other) => `<label class="check" data-note-link="${other.id}"><input type="checkbox" name="links" value="${other.id}" ${note.links?.includes(other.id) ? 'checked' : ''} /><span>${esc(other.title || 'Untitled note')}</span></label>`).join('')}</div><p id="related-notes-empty" role="status" hidden>No matching notes.</p>`
          : '<p>Create another note to link it here.</p>',
        (data) => {
          const links = new Set(data.getAll('links'));
          note.links = others
            .filter((other) => links.has(other.id))
            .map((other) => other.id);
          note.updated = new Date().toISOString();
          for (const other of others) {
            other.links = (other.links || []).filter((id) => id !== note.id);
            if (links.has(other.id)) other.links.push(note.id);
          }
          changed();
          renderCharacter();
        },
        'Save links',
      );
      break;
    }

    case 'clear-note-filters':
      noteSearch = '';
      noteFilter = 'all';
      renderJournalList(c);
      $('#journal-search')?.focus();
      break;

    case 'delete-note':
      confirmAction(
        'Delete This Note?',
        'This removes the note and its attached images.',
        () => {
          c.notes = c.notes.filter((n) => n.id !== noteId);
          for (const note of c.notes) {
            if (note.links)
              note.links = note.links.filter((id) => id !== noteId);
          }
          noteId = null;
          changed();
          shell();
        },
        'Delete note',
      );
      break;

    case 'note-image': {
      const n = c.notes.find((n) => n.id === noteId);
      chooseImage((data) => {
        n.images ||= [];
        n.images.push(data);
        n.updated = new Date().toISOString();
      });
      break;
    }

    case 'remove-note-image':
      c.notes
        .find((n) => n.id === noteId)
        .images.splice(Number(btn.dataset.index), 1);
      changed();
      renderCharacter();
      break;
  }
});

// Closing an editor changes only its presentation; field edits already autosave.

document.addEventListener('click', (event) => {
  if (
    !event.target.closest(
      '#condition-picker, [data-action="toggle-conditions"]',
    )
  )
    closeConditionsPicker();
  let refresh = false;
  if (
    editingItem &&
    !event.target.closest(
      '[data-item-editor], [data-action="edit-item"], [data-action="add-item"], [data-action="add-item-bonus"], [data-action="remove-item-bonus"], [data-bonus-stat-option], .inventory-item-controls',
    )
  ) {
    editingItem = null;
    refresh = page === 'equipment';
  }
  if (
    editingAttack &&
    !event.target.closest(
      '[data-attack-editor], [data-action="edit-attack"], [data-action="add-attack"], [data-action="toggle-combat-favorite"]',
    )
  ) {
    editingAttack = null;
    refresh = page === 'combat';
  }
  if (
    editingSpell &&
    !event.target.closest(
      '[data-spell-editor], [data-action="edit-spell"], [data-action="add-spell"], [data-action="toggle-combat-favorite"]',
    )
  ) {
    editingSpell = null;
    refresh = refresh || page === 'spells';
  }
  if (current() && refresh) renderCharacter();
});

function refreshesValues(path) {
  return (
    path.startsWith('abilities.') ||
    path.startsWith('equipment.') ||
    [
      'name',
      'class',
      'subclass',
      'species',
      'level',
      'spellAbility',
      'initiativeBonus',
      'tempHp',
      'maxHp',
      'ac',
    ].includes(path)
  );
}

document.addEventListener(
  'toggle',
  (event) => {
    const details = event.target;
    if (
      !details.matches?.('.inventory-notes, .inventory-bonuses') ||
      !details.isConnected
    )
      return;
    const item =
      current()?.equipment[
        Number(details.dataset.itemNotes ?? details.dataset.itemBonuses)
      ];
    if (!item) return;
    const expanded = details.matches('.inventory-bonuses')
      ? expandedItemBonuses
      : expandedItemNotes;
    if (details.open) {
      expanded.add(item);
      growTextAreas(details);
    } else {
      expanded.delete(item);
    }
  },
  true,
);

document.addEventListener('input', (e) => {
  const el = e.target,
    c = current();
  if (el.tagName === 'TEXTAREA' && !e.isComposing) formatTextBullet(el);
  if (el.tagName === 'TEXTAREA') growTextArea(el);
  if (el.id === 'library-search') {
    const pos = el.selectionStart;
    librarySearch = el.value;
    renderLibrary();
    $('#library-search').focus();
    $('#library-search').setSelectionRange(pos, pos);
    return;
  }
  if (!c) return;
  if (
    el.dataset.itemBonusTarget !== undefined ||
    el.dataset.itemBonusAmount !== undefined
  ) {
    const item =
      c.equipment[
        Number(el.dataset.itemBonusTarget ?? el.dataset.itemBonusAmount)
      ];
    const bonus = item.bonuses[Number(el.dataset.bonusIndex)];
    const previous = { ...bonus };
    if (el.dataset.itemBonusTarget !== undefined) {
      openBonusStatPicker(el.closest('.bonus-stat-picker'), el.value);
      const target = [...bonusTargets].find(
        ([, label]) =>
          label.toLocaleLowerCase() === el.value.trim().toLocaleLowerCase(),
      )?.[0];
      el.setCustomValidity(target ? '' : 'Choose a stat from the suggestions.');
      if (!target) return;
      bonus.target = target;
    } else {
      const amount = el.value === '' ? NaN : Number(el.value);
      el.setCustomValidity(
        Number.isSafeInteger(amount) ? '' : 'Enter a whole-number bonus.',
      );
      if (!Number.isSafeInteger(amount)) return;
      bonus.amount = amount;
    }
    if (
      [...bonusTargets.keys()].some(
        (target) => !Number.isSafeInteger(statValue(c, target)),
      )
    ) {
      Object.assign(bonus, previous);
      el.setCustomValidity(
        'This bonus produces a value outside the supported range.',
      );
      return;
    }
    pendingBackupEdits.add(el);
    changed(false);
    scheduleRefresh();
    return;
  }
  if (el.closest('.level-up-wizard')) {
    handleLevelUpInput(el);
    return;
  }
  if (el.dataset.attackUseLimit !== undefined) {
    const attack = c.attacks[Number(el.dataset.attackUseLimit)];
    const raw = el.value.trim();
    const limit = raw === '' ? '' : Number(raw);
    if (
      raw !== '' &&
      (!/^[0-9]+$/.test(raw) || !Number.isSafeInteger(limit) || limit < 1)
    ) {
      el.setCustomValidity(
        'Enter a positive whole number, or leave blank for unlimited.',
      );
      return;
    }
    el.setCustomValidity('');
    attack.useLimit = limit;
    attack.usesSpent =
      limit === '' ? 0 : Math.min(attack.usesSpent || 0, limit);
    const spent = $(
      `[data-field="attacks.${el.dataset.attackUseLimit}.usesSpent"]`,
    );
    if (spent) {
      spent.max = limit || 0;
      spent.value = attack.usesSpent;
    }
    pendingBackupEdits.add(el);
    changed(false);
    return;
  }
  if (el.closest('.rest-popup')) {
    updateRestPreview(c);
    return;
  }
  if (
    el.id === 'equipment-reference-search' ||
    el.id === 'equipment-reference-category'
  ) {
    renderEquipmentReferenceResults();
    return;
  }
  if (el.id === 'spell-reference-search' || el.id === 'spell-reference-level') {
    renderSpellReferenceResults();
    return;
  }
  if (el.id === 'condition-search') {
    filterConditions(el.value);
    return;
  }
  if (el.id === 'related-notes-search') {
    const query = el.value.trim().toLocaleLowerCase();
    const notesById = new Map(c.notes.map((note) => [note.id, note]));
    let matches = 0;

    for (const option of document.querySelectorAll('#modal [data-note-link]')) {
      const note = notesById.get(option.dataset.noteLink);
      const text = `${note.title || 'Untitled note'} ${note.body} ${note.tag} ${(note.tags || []).join(' ')}`;
      option.hidden = !text.toLocaleLowerCase().includes(query);
      if (!option.hidden) matches++;
    }

    $('#related-notes-empty').hidden = matches > 0;
    return;
  }
  if (el.dataset.spellFilter) {
    spellFilters[el.dataset.spellFilter] = el.value;
    renderSpellResults(c);
    return;
  }
  if (el.id === 'skill-search') {
    skillSearch = el.value;
    renderCharacter();
    return;
  }
  if (el.id === 'inventory-search') {
    inventorySearch = el.value;
    filterInventory(c);
    return;
  }
  if (el.id === 'journal-search') {
    noteSearch = el.value;
    renderJournalList(c);
    return;
  }
  if (el.dataset.field) {
    if (el.type === 'number' && el.value === '') return;
    let value =
      el.type === 'checkbox'
        ? el.checked
        : el.type === 'number' || el.dataset.number
          ? Number(el.value)
          : el.value;
    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return;
      if (el.type === 'number') {
        if (el.min !== '') value = Math.max(Number(el.min), value);
        if (el.max !== '') value = Math.min(Number(el.max), value);
        value = Math.min(
          Number.MAX_SAFE_INTEGER,
          Math.max(-Number.MAX_SAFE_INTEGER, value),
        );
        if (el.step !== 'any') value = Math.round(value);
      }
    }
    trackCombatFieldInput(c, el);
    set(c, el.dataset.field, value);
    if (el.closest('.inventory-notes')) {
      el
        .closest('.inventory-notes')
        .querySelector('.inventory-notes-preview').innerHTML = formatText(
        String(value).trim().replace(/\s+/g, ' ') || 'Add notes…',
      );
    }
    const timingField = el.dataset.field.match(/^spells\.(\d+)\.time$/);
    if (timingField) {
      const spell = c.spells[Number(timingField[1])];
      spell.actionType = castingActionType(value);
      const selector = $(`[data-field="spells.${timingField[1]}.actionType"]`);
      if (selector) selector.value = spell.actionType;
    }
    pendingBackupEdits.add(el);
    changed(false);
    if (refreshesValues(el.dataset.field)) scheduleRefresh();
  }
  if (el.dataset.note) {
    if (el.dataset.note === 'tags')
      $('#note-tag-suggestions').innerHTML = noteTagOptions(c, el.value);
    const n = c.notes.find((n) => n.id === noteId);
    n[el.dataset.note] =
      el.dataset.note === 'tags'
        ? [
            ...new Set(
              el.value
                .split(',')
                .map((tag) => tag.trim())
                .filter(Boolean),
            ),
          ]
        : el.value;
    n.updated = new Date().toISOString();
    pendingBackupEdits.add(el);
    changed(false);
  }
});

let refreshTimer;

function scheduleRefresh() {
  clearTimeout(refreshTimer);
  refreshTimer = setTimeout(() => {
    if (!current()) return;
    const active = document.activeElement,
      field = active?.dataset?.field,
      note = active?.dataset?.note,
      start = active?.selectionStart,
      end = active?.selectionEnd;
    renderCharacter();
    const replacement = field
      ? Array.from(document.querySelectorAll('[data-field]')).find(
          (el) => el.dataset.field === field,
        )
      : note
        ? $(`[data-note="${note}"]`)
        : null;
    if (replacement) {
      replacement.focus({ preventScroll: true });
      if (typeof start === 'number' && replacement.type !== 'number')
        replacement.setSelectionRange(start, end);
    }
  }, 0);
}

document.addEventListener('change', (e) => {
  const el = e.target,
    c = current();
  if (!c) return;
  if (el.dataset.attackUseLimit !== undefined && !el.validity.valid) {
    el.value = c.attacks[Number(el.dataset.attackUseLimit)].useLimit ?? '';
    el.setCustomValidity('');
    toast('Enter a positive whole number, or leave blank for unlimited.');
  }
  if (
    (el.dataset.itemBonusTarget !== undefined ||
      el.dataset.itemBonusAmount !== undefined) &&
    !el.validity.valid
  ) {
    const bonus =
      c.equipment[
        Number(el.dataset.itemBonusTarget ?? el.dataset.itemBonusAmount)
      ].bonuses[Number(el.dataset.bonusIndex)];
    toast(el.validationMessage);
    el.value =
      el.dataset.itemBonusTarget !== undefined
        ? bonusTargets.get(bonus.target)
        : bonus.amount;
    el.setCustomValidity('');
  }

  if (el.id === 'equipment-reference-category') {
    renderEquipmentReferenceResults();
    return;
  }
  if (el.id === 'spell-reference-level') {
    renderSpellReferenceResults();
    return;
  }
  if (el.id === 'concentration-spell') {
    if (el.value === '') return;
    const index = Number(el.value);
    el.value = '';
    startConcentration(c, index);
    return;
  }
  if (el.dataset.spellFilter) {
    spellFilters[el.dataset.spellFilter] = el.value;
    renderSpellResults(c);
    return;
  }
  if (el.dataset.condition) {
    const name = el.dataset.condition;
    if (name === 'Exhaustion' || !Object.hasOwn(conditionRules, name)) return;
    const active = new Set(c.activeConditions || []);
    if (el.checked) active.add(name);
    else active.delete(name);
    c.activeConditions = [...active];
    changed();
    $('#active-conditions').innerHTML = activeConditionChips(c);
    return;
  }
  commitCombatField(el);
  if (pendingBackupEdits.has(el)) {
    pendingBackupEdits.delete(el);
    recordBackupChange();
    changed(false);
  }
  if (el.id === 'journal-filter') {
    noteFilter = el.value;
    renderJournalList(c);
    return;
  }
  if (el.dataset.skill || el.dataset.expertise || el.dataset.save) {
    const key =
        el.dataset.save !== undefined
          ? 'saves'
          : el.dataset.expertise
            ? 'expertise'
            : 'skills',
      v =
        key === 'saves'
          ? Number(el.dataset.save)
          : el.dataset.skill || el.dataset.expertise;
    c[key] = el.checked
      ? [...new Set([...c[key], v])]
      : c[key].filter((x) => x !== v);
    if (key === 'expertise' && el.checked && !c.skills.includes(v))
      c.skills.push(v);
    if (key === 'skills' && !el.checked)
      c.expertise = c.expertise.filter((x) => x !== v);
    changed();
    scheduleRefresh();
  } else if (el.dataset.field) {
    if (el.dataset.field === 'exhaustionLevel') {
      $('#active-conditions').innerHTML = activeConditionChips(c);
    }
    if (el.dataset.field === 'name' && !c.name.trim())
      c.name = 'Unnamed adventurer';
    if (el.type === 'number') el.value = get(c, el.dataset.field);
    if (el.dataset.field === 'maxHp' && c.hp > c.maxHp) {
      c.hp = c.maxHp;
      if (c.hp === 0) endConcentration(c);
      changed(false);
    }
    if (refreshesValues(el.dataset.field)) scheduleRefresh();
  } else if (el.dataset.note) scheduleRefresh();
});

window.addEventListener('beforeunload', (e) => {
  if (revision !== savedRevision || saveFailed) {
    e.preventDefault();
    e.returnValue = '';
  }
});

document.addEventListener('visibilitychange', () => {
  if (document.hidden) persist().catch(() => {});
  else renderBackupStatus();
});

window.addEventListener('focus', renderBackupStatus);

async function init() {
  try {
    db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('statfolio', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('folio');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const saved = await new Promise((resolve, reject) => {
      const req = db.transaction('folio').objectStore('folio').get('state');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (saved) {
      state = {
        characters: validateBackup({
          format: 'statfolio',
          version: 1,
          characters: saved.characters,
        }),
        selected: saved.selected,
        backupHistory: loadBackupHistory(saved.backupHistory),
      };
      if (!current()) state.selected = null;
    }
    shell();
  } catch (err) {
    $('#app').innerHTML = /* HTML */ `<div class="startup-error"
      ><img src="./icon.svg" width="64" alt="" /><h1
        >Your Folio Couldn’t Be Opened</h1
      ><p
        >Browser storage may be disabled or the saved data may be unreadable.
        Enable site storage, then reload. Existing data has not been
        overwritten.</p
      ><p>${esc(err.message)}</p
      ><button class="secondary" onclick="location.reload()"
        >Try again</button
      ></div
    >`;
  }
}
init();
