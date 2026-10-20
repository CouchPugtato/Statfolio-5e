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
let skillCharacterId = null;

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
                  ><span><strong>${c.ac}</strong> ARMOR CLASS</span
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
    >${!characters.length ? empty(state.characters.length ? 'No matching characters' : 'No characters yet', state.characters.length ? 'Try a different search.' : 'Create a character to start your sheet and journal.') : ''}`;
}

function renderCharacter() {
  hideSpellPopup();
  const c = current();
  if (skillCharacterId !== c.id) {
    skillCharacterId = c.id;
    skillSearch = '';
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

function growTextArea(el) {
  el.style.height = 'auto';
  const style = getComputedStyle(el);
  const borders =
    (parseFloat(style.borderTopWidth) || 0) +
    (parseFloat(style.borderBottomWidth) || 0);
  el.style.height = `${Math.ceil(el.scrollHeight + borders)}px`;
}

function growTextAreas(root = document) {
  root.querySelectorAll('textarea').forEach(growTextArea);
}

const noteIndent = ' '.repeat(12);

const noteBullet = (indent) =>
  ['●', '○', '■'][Math.min(2, Math.ceil(indent.length / noteIndent.length))];

// Journal list editing uses plain text so bullets survive backups and exports.
function formatNoteBullet(el) {
  if (el.selectionStart !== el.selectionEnd) return;
  const end = el.selectionStart;
  const start = el.value.lastIndexOf('\n', end - 1) + 1;
  const match = el.value.slice(start, end).match(/^([ \t]*)[-*] $/);
  if (!match) return;
  const indent = match[1].replace(/\t/g, noteIndent);
  el.setRangeText(`${indent}${noteBullet(indent)} `, start, end, 'end');
}

function handleNoteListKey(event) {
  const el = event.target;
  if (
    el.dataset.note !== 'body' ||
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
      ? match[1].slice(noteIndent.length)
      : match[1] + noteIndent;
    const prefix = `${indent}${noteBullet(indent)} `;
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
      const indent = match[1].slice(noteIndent.length);
      el.setRangeText(
        match[1] ? `${indent}${noteBullet(indent)} ` : '',
        start,
        end,
        'end',
      );
    } else {
      el.setRangeText(
        `\n${match[1]}${noteBullet(match[1])} `,
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
  sync(target, wrapper);
}

const panel = (title, body, extra = '') =>
  /* HTML */ `<section class="panel"
    ><div class="panel-heading"><h2>${title}</h2>${extra}</div
    ><div class="panel-body">${body}</div></section
  >`;

function abilityTiles(c) {
  return /* HTML */ `<div class="ability-grid"
    >${abilities.map((a, i) => /* HTML */ `<div class="ability-tile"><span>${a}</span><strong>${sign(mod(c.abilities[i]))}</strong><input type="number" min="1" max="30" aria-label="${a} score" data-field="abilities.${i}" value="${c.abilities[i]}" /></div>`).join('')}</div
  >`;
}

// Keep each damage source until the player resolves its concentration save.
function endConcentration(character) {
  character.concentrationSpell = '';
  character.concentrationDamage = [];
}

function concentrationTracker(character) {
  const active = character.concentrationSpell;
  const damage = character.concentrationDamage || [];
  const candidates = character.spells
    .map((spell, index) => ({ spell, index }))
    .filter(
      ({ spell }) => spellFlag(spell, 'concentration') && spell.name.trim(),
    );
  const saveBonus =
    mod(character.abilities[2]) +
    (character.saves.includes(2) ? prof(character) : 0);
  const reminder =
    active && damage.length
      ? `<div class="concentration-reminder" role="status"><span><strong>Constitution save · DC ${Math.max(10, Math.floor(damage[0] / 2))}</strong><small>${damage[0]} damage · Save bonus ${sign(saveBonus)}${damage.length > 1 ? ` · ${damage.length} saves pending` : ''}</small></span><div class="concentration-actions">${button('concentration-pass', 'Pass', 'secondary')}${button('concentration-fail', 'Fail', 'secondary danger')}</div></div>`
      : '';

  return `<div class="concentration-tracker"><div class="concentration-heading"><span>Concentration</span><strong>${esc(active || 'None')}</strong>${active ? button('end-concentration', 'End', 'text-button') : ''}</div>
    ${candidates.length ? `<select id="concentration-spell" aria-label="Start or switch concentration spell"><option value="">${active ? 'Switch spell…' : 'Start concentrating…'}</option>${candidates.map(({ spell, index }) => `<option value="${index}">${esc(spell.name)}${spell.level ? ` · Level ${spell.level}` : ' · Cantrip'}</option>`).join('')}</select>` : '<p class="help">Mark a spell as concentration in its editor to track it here.</p>'}
    ${reminder}</div>`;
}

function healthControls(c) {
  return /* HTML */ `<div class="hp-display">${healthReadout(c)}</div
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

  return `<div class="condition-tracker"><span class="condition-heading">Conditions</span><div class="condition-controls"><div id="active-conditions" class="condition-active">${activeConditionChips(character)}</div><div id="condition-picker" role="dialog" aria-label="Manage conditions" ${pickerOpen ? '' : 'hidden'}><div class="condition-picker-heading"><strong>Conditions</strong>${button('close-conditions', '×', 'icon-button', 'aria-label="Close conditions"')}</div><p class="help">2014 5e reference. Apply effects to rolls and stats manually.</p><input id="condition-search" type="search" aria-label="Search conditions" placeholder="Search conditions…" value="${esc(query)}" /><div class="condition-options">${options}</div><p id="condition-search-empty" class="help" role="status" ${matches ? 'hidden' : ''}>No matching conditions.</p><p class="help"><a href="./RULES-LICENSE.md" target="_blank" rel="noopener">SRD 5.1 attribution</a></p></div></div>${field('Condition notes', 'conditions')}</div>`;
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
        ><strong class="big-number"
          >${8 + prof(c) + mod(c.abilities[c.spellAbility])}</strong
        ></div
      ><div class="spell-stat"
        ><span>Attack bonus</span
        ><strong class="big-number"
          >${sign(prof(c) + mod(c.abilities[c.spellAbility]))}</strong
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
    'Spell slots',
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

function attackRecords(c) {
  if (!c.attacks.length)
    return '<p class="muted">Add your weapons, attacks, and special actions.</p>';
  return /* HTML */ `<div class="record-list"
    >${c.attacks
      .map((attack, index) => {
        if (editingAttack === attack) {
          return /* HTML */ `<div
            class="record attack-editor"
            data-attack-editor="${index}"
          >
            <div class="record-top">
              ${field('Attack / action', `attacks.${index}.name`)}
              ${button('remove', '×', 'icon-button', `data-list="attacks" data-index="${index}" aria-label="Remove attack"`)}
            </div>
            <div class="form-grid three">
              ${field('Attack bonus', `attacks.${index}.bonus`)}
              ${field('Damage', `attacks.${index}.damage`)}
              ${field('Type / range', `attacks.${index}.type`)}
            </div>
            ${area('Notes', `attacks.${index}.notes`)}
            <div class="attack-editor-actions"
              >${button('finish-attack', 'Done', 'secondary')}</div
            >
          </div>`;
        }
        const details = [
          ['Attack', attack.bonus],
          ['Damage', attack.damage],
          ['Type / range', attack.type],
        ]
          .filter(([, value]) => value.trim())
          .map(
            ([label, value]) =>
              /* HTML */ `<span
                ><small>${label}</small><b>${esc(value)}</b></span
              >`,
          )
          .join('');
        return /* HTML */ `<button
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
          ${attack.notes.trim() ? /* HTML */ `<span class="attack-summary-notes">${esc(attack.notes)}</span>` : ''}
        </button>`;
      })
      .join('')}</div
  >`;
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
  const spell =
    page === 'spells' ? current()?.spells[Number(card.dataset.index)] : null;
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
  $('.spell-popup-description', spellPopup).textContent = descriptionText;
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
  const card = event.target.closest('.spell-record-summary');
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
  const card = event.target.closest('.spell-record-summary');
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
  if (event.key === 'Enter' && event.target.id === 'related-notes-search') {
    event.preventDefault();
    return;
  }

  if (undoDeletedEntry(event)) return;
  handleNoteListKey(event);
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

function spellRecords(c) {
  if (!c.spells.length)
    return empty(
      'An open spellbook',
      'Add your cantrips and spells, with the details you need at the table.',
    );
  if (!c.spells.some(matchesSpell) && !c.spells.includes(editingSpell))
    return '<p class="muted" role="status">No matching spells. Try changing or clearing your filters.</p>';

  return /* HTML */ `<div class="spell-grid"
    >${c.spells
      .map((spell, index) => {
        if (!matchesSpell(spell) && editingSpell !== spell) return '';
        if (editingSpell === spell) {
          return /* HTML */ `<div
            class="record spell-editor"
            data-spell-editor="${index}"
          >
            <div class="record-top">
              ${field('Spell name', `spells.${index}.name`)}
              ${button('remove', '×', 'icon-button', `data-list="spells" data-index="${index}" aria-label="Remove spell"`)}
            </div>
            <div class="form-grid three">
              ${field('Level (0 = cantrip)', `spells.${index}.level`, 'number', { max: 9 })}
              ${field('School', `spells.${index}.school`)}
              ${field('Casting time', `spells.${index}.time`)}
              ${field('Range', `spells.${index}.range`)}
              ${field('Components', `spells.${index}.components`)}
              ${field('Duration', `spells.${index}.duration`)}
            </div>
            <div class="spell-flags"
              >${['prepared', 'concentration', 'ritual'].map((flag) => `<label class="check"><input type="checkbox" data-field="spells.${index}.${flag}" ${(flag === 'prepared' ? spell.prepared : spellFlag(spell, flag)) ? 'checked' : ''} /> ${flag[0].toUpperCase() + flag.slice(1)}</label>`).join('')}</div
            >
            ${area('Effect / description', `spells.${index}.description`)}
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
          ['Casting time', spell.time],
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
        return /* HTML */ `<button
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
          ${spell.description.trim() ? /* HTML */ `<span class="attack-summary-notes spell-description">${esc(spell.description)}</span>` : ''}
        </button>`;
      })
      .join('')}</div
  >`;
}

function savingThrows(character) {
  return abilities
    .map((ability, index) => {
      const proficient = character.saves.includes(index);
      const bonus =
        mod(character.abilities[index]) + (proficient ? prof(character) : 0);
      return /* HTML */ `<label class="save-row"
        ><input
          type="checkbox"
          data-save="${index}"
          ${proficient ? 'checked' : ''}
        /><span>${ability}</span><strong>${sign(bonus)}</strong></label
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
          >${field('Remaining', `${path}.remaining`, 'number')}${field('Maximum', `${path}.max`, 'number')}</div
        ></div
      >`;
    })
    .join('');
}

function characterDetails() {
  const fields = [
    field('Character name', 'name'),
    field('Class', 'class'),
    field('Subclass', 'subclass'),
    field('Level', 'level', 'number', { max: 20 }),

    field('Species / race', 'species'),
    field('Background', 'background'),
    field('Alignment', 'alignment'),
    field('Player name', 'player'),
    field('Experience points', 'xp', 'number'),
  ];

  return `<div class="form-grid">${fields.join('')}</div>`;
}

const views = {
  overview: (c) =>
    /* HTML */ `<div class="sheet-grid overview-grid"
      ><div
        >${panel('Ability scores', abilityTiles(c), '<span class="muted">Modifiers calculated automatically</span>')}${panel('Character details', characterDetails())}</div
      ><div
        >${panel(
          'Reference Stats',
          /* HTML */ `<div class="glance"
            ><div><span>Proficiency</span><strong>${sign(prof(c))}</strong></div
            ><div
              ><span>Passive perception</span
              ><strong
                >${10 + mod(c.abilities[4]) + (c.skills.includes('Perception') ? prof(c) : 0) + (c.expertise.includes('Perception') ? prof(c) : 0)}</strong
              ></div
            ><div
              ><span>Initiative</span
              ><strong
                >${sign(mod(c.abilities[1]) + c.initiativeBonus)}</strong
              ></div
            ><div><span>Armor class</span><strong>${c.ac}</strong></div></div
          >`,
          /* HTML */ `<label class="check inspiration"
            ><input
              type="checkbox"
              data-field="inspiration"
              ${c.inspiration ? 'checked' : ''}
            />
            Inspiration</label
          >`,
        )}${panel('Hit points', healthControls(c))}${panel('Quick journal', /* HTML */ `<p class="muted">Catch a name, a clue, or a moment before it slips away.</p>${button('new-note', '＋ Write a note', 'secondary full')}`)}</div
      ></div
    >`,
  abilities: (c) =>
    `${panel('Ability scores', abilityTiles(c))}<div class="sheet-grid">${panel(
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
                /><strong
                  >${sign(mod(c.abilities[a]) + (c.skills.includes(s) ? prof(c) : 0) + (c.expertise.includes(s) ? prof(c) : 0))}</strong
                ></div
              >`,
          )
          .join(
            '',
          )}${filteredSkills().length ? '' : '<p class="muted" role="status">No matching skills.</p>'}`,
    )}<div>${panel('Saving throws', savingThrows(c))}${panel('Other proficiencies & languages', area('Languages, tools, armor & weapons', 'proficiencies', 'Common, Elvish, thieves’ tools…'))}</div></div>`,
  combat: (c) =>
    /* HTML */ `<div class="combat-stats"
        >${field('Armor class', 'ac', 'number')}${field('Speed (ft)', 'speed', 'number')}${field('Initiative adjustment', 'initiativeBonus', 'number')}${field('Hit dice remaining', 'hitDiceLeft', 'number')}${field('Hit dice', 'hitDice')}</div
      ><div class="sheet-grid"
        >${panel('Attacks & actions', attackRecords(c), button('add-attack', '＋ Add attack', 'text-button'))}<div
          >${panel('Health & recovery', `${healthControls(c)}<div class="form-grid">${field('Death save successes', 'deathSuccess', 'number', { max: 3 })}${field('Death save failures', 'deathFailure', 'number', { max: 3 })}</div>${conditionsTracker(c)}${button('rest', 'Take a long rest', 'secondary full')}`)}${panel('Features & resources', area('Class features, feats & traits', 'features', 'Record your actions, traits, and limited-use abilities.') + resourceRecords(c), button('add-resource', '＋ Add', 'text-button'))}</div
        ></div
      >`,
  spells: (c) =>
    /* HTML */ `<div class="spellcasting-layout"
        >${spellSlots(c)}${spellcastingSummary(c)}</div
      >${panel(
        'Your spells',
        concentrationTracker(c) +
          spellFilterControls(c) +
          `<div id="spell-results">${spellRecords(c)}</div>`,
        button('add-spell', '＋ Add spell', 'secondary'),
      )}${panel('Spellcasting notes', area('Rituals, pact magic & other details', 'spellNotes'))}`,
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
      c.equipment.length
        ? '<div class="inventory-list">' +
            c.equipment
              .map(
                (e, i) =>
                  /* HTML */ `<div class="inventory-row"
                    ><label class="check"
                      ><input
                        aria-label="${esc(e.name || 'Item')} equipped"
                        type="checkbox"
                        data-field="equipment.${i}.equipped"
                        ${e.equipped ? 'checked' : ''} /></label
                    >${field('Item', `equipment.${i}.name`)}${field('Quantity', `equipment.${i}.quantity`, 'number')}${field('Weight (lb each)', `equipment.${i}.weight`, 'number')}${field('Notes', `equipment.${i}.notes`)}${button('remove', '×', 'icon-button', `data-list="equipment" data-index="${i}" aria-label="Remove item"`)}</div
                  >`,
              )
              .join('') +
            `</div><p class="help">Checkbox = equipped · Total carried weight: <strong>${c.equipment.reduce((n, e) => n + e.quantity * e.weight, 0).toFixed(1)} lb</strong> (all listed items; excludes coins)</p>`
        : empty(
            'Pack for the journey',
            'Track your gear, treasures, and the things you can’t leave behind.',
          ),
      button('add-item', '＋ Add item', 'secondary'),
    )}`,
  background: (c) =>
    /* HTML */ `<div class="sheet-grid background-grid"
      ><div
        >${panel('Personality', area('Personality traits', 'personality') + area('Ideals', 'ideals') + area('Bonds', 'bonds') + area('Flaws', 'flaws'))}</div
      ><div
        >${panel('Your story', area('Appearance', 'appearance') + area('Backstory', 'story') + area('Allies & organizations', 'allies'))}</div
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
        `${n.title} ${n.body} ${n.tag} ${(n.tags || []).join(' ')}`
          .toLocaleLowerCase()
          .includes(query),
    )
    .sort((a, b) => Number(!!b.pinned) - Number(!!a.pinned));
  return /* HTML */ `<div class="panel-heading"
      ><h2>Character journal</h2
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
                      >${esc(item.body.replace(/\s+/g, ' ').slice(0, 160) || 'No text yet.')}</span
                    ></span
                  ></button
                >`,
            )
            .join('')
        : empty(
            c.notes.length ? 'No matching notes' : 'No notes yet',
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
                ><span class="eyebrow">Note details</span
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
                  value="${esc((n.tags || []).join(', '))}"
                  placeholder="Separate tags with commas" /></label
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
              'The story is yours to write',
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
    'Delete entry?',
    'Are you sure you want to delete this entry? You can restore it with Ctrl+Z.',
    () => {
      const currentIndex = character[list].indexOf(item);
      if (currentIndex === -1) return;
      if (list === 'attacks') editingAttack = null;
      if (list === 'spells') editingSpell = null;
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
    'Begin a new adventure',
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
      'Restore your folio',
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
    page = nav.dataset.page;
    clearTimeout(saveTimer);
    persist().catch(() => {});
    shell();
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
      $('#modal').close();
      break;

    case 'portrait':
      chooseImage((data) => (c.image = data));
      break;

    case 'rename':
      modal(
        'Edit character identity',
        /* HTML */ `<div class="form-grid"
          >${['name', 'class', 'subclass', 'species'].map((k) => /* HTML */ `<label class="field"><span>${k === 'name' ? 'Character name' : k}</span><input name="${k}" value="${esc(c[k])}" ${k === 'name' ? 'required' : ''} /></label>`).join('')}</div
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
        'Character options',
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
        'Delete this character?',
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

    case 'add-attack':
      c.attacks.push({ name: '', bonus: '', damage: '', type: '', notes: '' });
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
      c.resources.push({ name: '', remaining: 0, max: 0 });
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

    case 'add-spell':
      c.spells.push({
        name: '',
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
      });
      editingSpell = c.spells.at(-1);
      changed();
      renderCharacter();
      $('[data-spell-editor] input')?.focus();
      break;

    case 'edit-spell':
      editingSpell = c.spells[Number(btn.dataset.index)];
      renderCharacter();
      $('[data-spell-editor] input')?.focus();
      break;

    case 'finish-spell':
      editingSpell = null;
      renderCharacter();
      break;

    case 'add-item':
      c.equipment.push({
        name: '',
        quantity: 1,
        weight: 0,
        notes: '',
        equipped: false,
      });
      changed();
      renderCharacter();
      break;

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
      $('#currency-amount').focus();
      break;
    }

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
      $('#hp-amount').value = '';
      changed();
      renderCharacter();
      $('#hp-amount').focus();
      break;
    }

    case 'rest':
      confirmAction(
        'Take a long rest?',
        'Restore HP to maximum, clear temporary HP and death saves, reset used spell slots, and end concentration. Adjust hit dice and other limited resources manually to match your table’s rules.',
        () => {
          c.hp = c.maxHp;
          c.tempHp = 0;
          c.usedSlots.fill(0);
          endConcentration(c);
          c.deathSuccess = 0;
          c.deathFailure = 0;
          changed();
          renderCharacter();
        },
        'Complete rest',
      );
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
        'Related notes',
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
        'Delete this note?',
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
    editingAttack &&
    !event.target.closest(
      '[data-attack-editor], [data-action="edit-attack"], [data-action="add-attack"]',
    )
  ) {
    editingAttack = null;
    refresh = page === 'combat';
  }
  if (
    editingSpell &&
    !event.target.closest(
      '[data-spell-editor], [data-action="edit-spell"], [data-action="add-spell"]',
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

document.addEventListener('input', (e) => {
  const el = e.target,
    c = current();
  if (el.dataset.note === 'body' && !e.isComposing) formatNoteBullet(el);
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
    set(c, el.dataset.field, value);
    pendingBackupEdits.add(el);
    changed(false);
    if (refreshesValues(el.dataset.field)) scheduleRefresh();
  }
  if (el.dataset.note) {
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
  if (el.id === 'concentration-spell') {
    if (el.value === '') return;
    const spell = c.spells[Number(el.value)];
    if (!spell || !spellFlag(spell, 'concentration')) return;
    if (c.hp === 0) {
      el.value = '';
      toast('Recover hit points before starting concentration.');
      return;
    }
    endConcentration(c);
    c.concentrationSpell = spell.name.trim();
    changed();
    renderCharacter();
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
        >Your folio couldn’t be opened</h1
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
