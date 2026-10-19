const $ = (s, root = document) => root.querySelector(s);
const esc = (v) =>
  String(v ?? '').replace(
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
let noteSearch = '',
  noteFilter = 'all',
  journalCharacterId = null;
let skillSearch = '';
let skillCharacterId = null;
const filteredSkills = () =>
  Object.entries(skills).filter(([name]) =>
    name.toLocaleLowerCase().includes(skillSearch.trim().toLocaleLowerCase()),
  );
const mod = (n) => Math.floor((Number(n) - 10) / 2);
const sign = (n) => (n >= 0 ? `+${n}` : String(n));
let state = { characters: [], selected: null },
  page = 'overview',
  librarySearch = '',
  noteId = null,
  db,
  saveTimer,
  saveQueue = Promise.resolve(),
  revision = 0,
  savedRevision = 0,
  saveFailed = false;
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
    attacks: [],
    resources: [],
    features: '',
    spells: [],
    spellAbility: 3,
    slots: Array(9).fill(0),
    usedSlots: Array(9).fill(0),
    spellNotes: '',
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
const get = (o, p) => p.split('.').reduce((a, k) => a?.[k], o);
function set(o, p, v) {
  const parts = p.split('.');
  const last = parts.pop();
  parts.reduce((a, k) => a[k], o)[last] = v;
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
function changed() {
  revision++;
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
function shell() {
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
                  >${button('open', 'Open folio ↗', 'text-button', `data-id="${c.id}"`)}</div
                ></div
              ></article
            >`,
        )
        .join('')}</div
    >${!characters.length ? empty(state.characters.length ? 'No matching characters' : 'No characters yet', state.characters.length ? 'Try a different search.' : 'Create a character to start your sheet and journal.') : ''}`;
}
function renderCharacter() {
  const c = current();
  if (skillCharacterId !== c.id) {
    skillCharacterId = c.id;
    skillSearch = '';
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
    >`;
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
const views = {
  overview: (c) =>
    /* HTML */ `<div class="sheet-grid overview-grid"
      ><div
        >${panel('Ability scores', abilityTiles(c), '<span class="muted">Modifiers calculated automatically</span>')}${panel('Character details', /* HTML */ `<div class="form-grid">${field('Character name', 'name')}${field('Class', 'class')}${field('Subclass', 'subclass')}${field('Level', 'level', 'number', { max: 20 })}${field('Species / race', 'species')}${field('Background', 'background')}${field('Alignment', 'alignment')}${field('Player name', 'player')}${field('Experience points', 'xp', 'number')}</div>`)}</div
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
    )}<div>${panel('Saving throws', abilities.map((a, i) => /* HTML */ `<label class="save-row"><input type="checkbox" data-save="${i}" ${c.saves.includes(i) ? 'checked' : ''} /><span>${a}</span><strong>${sign(mod(c.abilities[i]) + (c.saves.includes(i) ? prof(c) : 0))}</strong></label>`).join(''))}${panel('Other proficiencies & languages', area('Languages, tools, armor & weapons', 'proficiencies', 'Common, Elvish, thieves’ tools…'))}</div></div>`,
  combat: (c) =>
    /* HTML */ `<div class="combat-stats"
        >${field('Armor class', 'ac', 'number')}${field('Speed (ft)', 'speed', 'number')}${field('Initiative adjustment', 'initiativeBonus', 'number')}${field('Hit dice', 'hitDice')}${field('Hit dice remaining', 'hitDiceLeft', 'number')}</div
      ><div class="sheet-grid"
        >${panel('Attacks & actions', /* HTML */ `<div class="record-list">${c.attacks.map((a, i) => /* HTML */ `<div class="record"><div class="record-top">${field('Attack / action', `attacks.${i}.name`)}${button('remove', '×', 'icon-button', `data-list="attacks" data-index="${i}" aria-label="Remove attack"`)}</div><div class="form-grid three">${field('Attack bonus', `attacks.${i}.bonus`)}${field('Damage', `attacks.${i}.damage`)}${field('Type / range', `attacks.${i}.type`)}</div>${area('Notes', `attacks.${i}.notes`)}</div>`).join('') || '<p class="muted">Add your weapons, attacks, and special actions.</p>'}</div>`, button('add-attack', '＋ Add attack', 'text-button'))}<div
          >${panel('Health & recovery', `${healthControls(c)}<div class="form-grid">${field('Death save successes', 'deathSuccess', 'number', { max: 3 })}${field('Death save failures', 'deathFailure', 'number', { max: 3 })}</div>${field('Conditions', 'conditions')}${button('rest', 'Take a long rest', 'secondary full')}`)}${panel('Features & resources', area('Class features, feats & traits', 'features', 'Record your actions, traits, and limited-use abilities.') + c.resources.map((r, i) => /* HTML */ `<div class="record"><div class="record-top">${field('Resource', `resources.${i}.name`)}${button('remove', '×', 'icon-button', `data-list="resources" data-index="${i}" aria-label="Remove resource"`)}</div><div class="form-grid">${field('Remaining', `resources.${i}.remaining`, 'number')}${field('Maximum', `resources.${i}.max`, 'number')}</div></div>`).join(''), button('add-resource', '＋ Add', 'text-button'))}</div
        ></div
      >`,
  spells: (c) =>
    /* HTML */ `<div class="spellcasting-layout"
        >${spellSlots(c)}${spellcastingSummary(c)}</div
      >${panel(
        'Your spells',
        c.spells.length
          ? /* HTML */ `<div class="spell-grid"
              >${c.spells
                .map(
                  (s, i) =>
                    /* HTML */ `<div class="record"
                      ><div class="record-top"
                        >${field('Spell name', `spells.${i}.name`)}${button('remove', '×', 'icon-button', `data-list="spells" data-index="${i}" aria-label="Remove spell"`)}</div
                      ><div class="form-grid three"
                        >${field('Level (0 = cantrip)', `spells.${i}.level`, 'number', { max: 9 })}${field('School', `spells.${i}.school`)}${field('Casting time', `spells.${i}.time`)}${field('Range', `spells.${i}.range`)}${field('Components', `spells.${i}.components`)}${field('Duration', `spells.${i}.duration`)}</div
                      ><label class="check"
                        ><input
                          type="checkbox"
                          data-field="spells.${i}.prepared"
                          ${s.prepared ? 'checked' : ''}
                        />
                        Prepared</label
                      >${area('Effect / description', `spells.${i}.description`)}</div
                    >`,
                )
                .join('')}</div
            >`
          : empty(
              'An open spellbook',
              'Add your cantrips and spells, with the details you need at the table.',
            ),
        button('add-spell', '＋ Add spell', 'secondary'),
      )}${panel('Spellcasting notes', area('Rituals, pact magic & other details', 'spellNotes'))}`,
  equipment: (c) =>
    `${panel(
      'Currency',
      /* HTML */ `<div class="coins"
        >${Object.keys(c.coins)
          .map((k) => field(k.toUpperCase(), `coins.${k}`, 'number'))
          .join('')}</div
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
function journalList(c) {
  const query = noteSearch.trim().toLocaleLowerCase();
  const notes = c.notes.filter(
    (n) =>
      (noteFilter === 'all' || n.tag === noteFilter) &&
      `${n.title} ${n.body} ${n.tag}`.toLocaleLowerCase().includes(query),
  );
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
      /><select id="journal-filter" aria-label="Filter notes by category"
        ><option value="all">All categories</option
        >${noteCategories.map((tag) => /* HTML */ `<option ${noteFilter === tag ? 'selected' : ''}>${tag}</option>`).join('')}</select
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
                    ><strong>${esc(item.title || 'Untitled note')}</strong
                    ><time
                      datetime="${esc(item.updated)}"
                      title="${esc(new Date(item.updated).toLocaleString())}"
                      >${new Date(item.updated).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</time
                    ></div
                  ><span class="note-preview-excerpt"
                    ><span class="note-category"
                      >${esc(item.tag || 'General')}</span
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
  const n = c.notes.find((n) => n.id === noteId) || c.notes[0];
  if (n) noteId = n.id;
  return /* HTML */ `<div class="journal"
    ><section class="panel note-list">${journalList(c)}</section
    ><section class="panel note-editor"
      >${
        n
          ? /* HTML */ `<div class="panel-heading"
                ><span class="eyebrow">A PAGE IN YOUR ADVENTURE</span
                >${button('delete-note', 'Delete note', 'text-button danger')}</div
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
                ><span>Notes</span
                ><textarea
                  class="note-body"
                  data-note="body"
                  placeholder="What will you remember from this adventure?"
                >
${esc(n.body)}</textarea></label
              ><div class="note-attachments"
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
        }
        return clean;
      });
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
            c.notes.forEach((n) => (n.id = uid()));
          });
          state.characters.push(...copies);
        } else state.characters = copies;
        state.selected = null;
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
    case 'library':
      state.selected = null;
      shell();
      changed();
      break;
    case 'new':
      createModal();
      break;
    case 'open':
      state.selected = btn.dataset.id;
      page = 'overview';
      noteId = null;
      shell();
      changed();
      break;
    case 'backup':
      await exportBackup();
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
          >${button('duplicate', 'Duplicate character', 'secondary')}${button('remove-portrait', 'Remove portrait', 'secondary')}${button('delete-character', 'Delete character', 'secondary danger')}</div
        >`,
        () => {},
        'Done',
      );
      break;
    case 'duplicate': {
      const copy = structuredClone(c);
      copy.id = uid();
      copy.name += ' (copy)';
      copy.notes.forEach((n) => (n.id = uid()));
      state.characters.push(copy);
      state.selected = copy.id;
      $('#modal').close();
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
      changed();
      renderCharacter();
      break;
    case 'add-resource':
      c.resources.push({ name: '', remaining: 0, max: 0 });
      changed();
      renderCharacter();
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
      });
      changed();
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
      c[btn.dataset.list].splice(Number(btn.dataset.index), 1);
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
        'Restore HP to maximum, clear temporary HP and death saves, and reset used spell slots. Adjust hit dice and other limited resources manually to match your table’s rules.',
        () => {
          c.hp = c.maxHp;
          c.tempHp = 0;
          c.usedSlots.fill(0);
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
        tag: noteFilter === 'all' ? 'General' : noteFilter,
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
    changed();
    if (refreshesValues(el.dataset.field)) scheduleRefresh();
  }
  if (el.dataset.note) {
    const n = c.notes.find((n) => n.id === noteId);
    n[el.dataset.note] = el.value;
    n.updated = new Date().toISOString();
    changed();
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
    if (el.dataset.field === 'name' && !c.name.trim())
      c.name = 'Unnamed adventurer';
    if (el.type === 'number') el.value = get(c, el.dataset.field);
    if (el.dataset.field === 'maxHp' && c.hp > c.maxHp) {
      c.hp = c.maxHp;
      changed();
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
});
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
