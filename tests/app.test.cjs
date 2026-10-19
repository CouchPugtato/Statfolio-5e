const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { randomUUID } = require('node:crypto');
const { JSDOM } = require('jsdom');
const { IDBFactory } = require('fake-indexeddb');
const source = fs.readFileSync('app.js', 'utf8');
const html = fs.readFileSync('index.html', 'utf8');
const image = 'data:image/png;base64,iVBORw0KGgo=';
const settle = () => new Promise(resolve => setTimeout(resolve, 25));

async function app(storage = new IDBFactory()) {
  const dom = new JSDOM(html, { url: 'https://example.test/Statfolio-5e/', runScripts: 'outside-only' });
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.indexedDB = storage;
  w.crypto.randomUUID = randomUUID;
  w.Blob = Blob;
  w.HTMLDialogElement.prototype.showModal = function () { this.open = true; };
  w.HTMLDialogElement.prototype.close = function () { this.open = false; };
  w.HTMLAnchorElement.prototype.click = function () {};
  let download;
  w.URL.createObjectURL = blob => { download = blob; return 'blob:test'; };
  w.URL.revokeObjectURL = () => {};
  w.eval(source.replace(/init\(\);\s*$/, '') + `
    globalThis.api = { blank, prof, mod, views, validateBackup, persist, shell, changed, exportBackup,
      get state(){return state;},get revision(){return revision;},get savedRevision(){return savedRevision;},
      get failed(){return saveFailed;},get db(){return db;},setPage(p){page=p;shell();},
      use(c){state.characters.push(c);state.selected=c.id;shell();},get current(){return current();} };
    globalThis.ready = init();`);
  await w.ready;
  const $ = s => w.document.querySelector(s);
  const click = s => { assert.ok($(s), `Missing control ${s}`); $(s).click(); };
  const input = (s,value,commit=true) => { const el=$(s); assert.ok(el, `Missing input ${s}`); if(el.type==='checkbox')el.checked=value;else el.value=String(value);el.dispatchEvent(new w.Event('input',{bubbles:true}));if(commit)el.dispatchEvent(new w.Event('change',{bubbles:true})); };
  async function submit(values={}) { const form=$('#modal-form'); for(const [key,value] of Object.entries(values))form.elements.namedItem(key).value=value; await form.onsubmit({preventDefault(){},target:form}); }
  async function restore(characters,mode='merge') { await $('#restore-file').onchange({target:{files:[{size:100,text:async()=>JSON.stringify({format:'statfolio',version:1,characters})}],value:''}});if($('#modal-form')&&$('#modal').open)await submit({mode}); }
  return {dom,w,api:w.api,$,click,input,submit,restore,storage,download:()=>download,close:()=>dom.window.close()};
}

test('create through the UI, edit stats, save, and reopen from IndexedDB', async () => {
 const a=await app();
 try {
  a.click('[data-action="new"]');await a.submit({name:'Elowen Ashford',class:'Ranger',species:'Wood elf'});
  a.input('[data-field="level"]',5);a.input('[data-field="abilities.1"]',18);await settle();
  assert.equal(a.api.current.level,5);assert.equal(a.api.prof(a.api.current),3);
  assert.match(a.$('#page-content').textContent,/\+4/);
  await a.api.persist();assert.equal(a.api.revision,a.api.savedRevision);
  const b=await app(a.storage);
  try {assert.equal(b.api.current.name,'Elowen Ashford');assert.equal(b.api.current.abilities[1],18);assert.match(b.$('h1').textContent,/Elowen/);}finally{b.close();}
 }finally{a.close();}
});

test('expertise implies proficiency, bonuses update, and removing proficiency clears expertise', async()=>{
 const a=await app();try{const c=a.api.blank('Scout');c.level=5;c.abilities[1]=18;a.api.use(c);a.api.setPage('abilities');
 const expertiseControl=a.$('[data-expertise="Stealth"]');
 a.input('[data-expertise="Stealth"]',true);await settle();
 assert.equal(a.$('[data-expertise="Stealth"]'),expertiseControl,'Stat refresh preserves existing controls and pending clicks');
 assert.ok(c.skills.includes('Stealth'));assert.equal(a.$('[data-expertise="Stealth"]').parentElement.querySelector('strong').textContent,'+10');
 a.input('[data-skill="Stealth"]',false);await settle();assert.ok(!c.expertise.includes('Stealth'));assert.equal(a.$('[data-skill="Stealth"]').parentElement.querySelector('strong').textContent,'+4');
 }finally{a.close();}
});

test('text damage/heal controls work on both pages, absorb temporary HP, cap healing, and validate amounts', async()=>{
 const a=await app();try{const c=a.api.blank('Defender');c.hp=20;c.maxHp=30;c.tempHp=5;c.usedSlots[0]=2;a.api.use(c);a.api.setPage('combat');
 assert.equal(a.$('#hp-amount').type,'text');assert.equal(a.$('[data-field="hp"]'),null);
 assert.equal(a.$('.health-actions').nextElementSibling.className,'form-grid hp-limits');
 assert.equal(a.$('.hp-limits input').dataset.field,'tempHp');
 assert.equal(a.$('.hp-display').textContent,'25/30');
 for(const invalid of ['','-1','2.5','abc','1e2']){a.$('#hp-amount').value=invalid;a.click('[data-action="damage"]');assert.equal(c.hp,20);assert.equal(c.tempHp,5);}
 a.$('#hp-amount').value='8';a.click('[data-action="damage"]');assert.equal(c.hp,17);assert.equal(c.tempHp,0);
 assert.equal(a.$('.hp-display').textContent,'17/30');
 assert.equal(a.$('#hp-amount').value,'');
 a.api.setPage('overview');assert.equal(a.$('#hp-amount').type,'text');assert.equal(a.$('[data-field="hp"]'),null);
 a.$('#hp-amount').value='99';a.click('[data-action="heal"]');assert.equal(c.hp,30);
 a.input('[data-field="maxHp"]',40);await settle();assert.match(a.$('.hp-display').textContent,/\/40$/);
 a.api.setPage('combat');c.maxHp=30;
 c.hp=1;c.deathFailure=2;a.click('[data-action="rest"]');await a.submit();assert.equal(c.hp,30);assert.equal(c.deathFailure,0);assert.equal(c.usedSlots[0],0);
 }finally{a.close();}
});

test('notes stay with their character, escape markup, and export all images', async()=>{
 const a=await app();try{const c=a.api.blank('<img src=x onerror=alert(1)>');c.image=image;a.api.use(c);a.click('[data-action="new-note"]');
 a.input('[data-note="title"]','<script>bad()</script>');a.input('[data-note="body"]','A clue in the old tower');await settle();c.notes[0].images=[image];
 assert.equal(a.$('h1 img'),null);assert.equal(a.$('.note-preview script'),null);
 const other=a.api.blank('Other');a.api.use(other);a.api.setPage('notes');assert.equal(other.notes.length,0);assert.equal(a.$('.note-preview'),null);
 await a.api.exportBackup();const backup=JSON.parse(await a.download().text());assert.equal(backup.characters.length,2);assert.equal(backup.characters[0].image,image);assert.equal(backup.characters[0].notes[0].images[0],image);
 assert.equal(a.api.validateBackup(backup)[0].notes[0].body,'A clue in the old tower');
 }finally{a.close();}
});

test('restore merges as independent copies, then replacement persists exactly the backup', async()=>{
 const a=await app();try{const c=a.api.blank('Original');c.image=image;c.notes=[{id:randomUUID(),title:'Session',body:'Hello',tag:'Session',updated:new Date().toISOString(),images:[image]}];a.api.use(c);
 await a.restore([c]);assert.equal(a.api.state.characters.length,2);const copy=a.api.state.characters[1];assert.notEqual(copy.id,c.id);assert.notEqual(copy.notes[0].id,c.notes[0].id);assert.equal(copy.notes[0].images[0],image);
 await a.restore([c],'replace');assert.equal(a.api.state.characters.length,1);assert.equal(a.api.state.characters[0].id,c.id);assert.equal(a.api.state.selected,null);
 const b=await app(a.storage);try{assert.equal(b.api.state.characters[0].image,image);assert.equal(b.api.state.characters.length,1);}finally{b.close();}
 }finally{a.close();}
});

test('invalid backups reject before modifying the library, including unsafe IDs and image types', async()=>{
 const a=await app();try{const c=a.api.blank('Safe');a.api.use(c);const wrap=characters=>({format:'statfolio',version:1,characters});
 assert.throws(()=>a.api.validateBackup({...wrap([c]),version:99}));
 for(const change of [{id:'x" onclick="bad()'},{image:'data:image/svg+xml;base64,PHN2Zz4='},{abilities:[10]},{slots:[-1]},{notes:[{id:'x',title:'bad',body:'',tag:'General',updated:'',images:['https://tracker.test/x']}]}])assert.throws(()=>a.api.validateBackup(wrap([{...c,...change}])));
 assert.throws(()=>a.api.validateBackup(wrap([c,c])));
 await a.restore([{...c,abilities:'invalid'}]);assert.equal(a.api.state.characters.length,1);assert.equal(a.$('#modal').open,false);assert.match(a.$('#toast').textContent,/Invalid abilities/);
 }finally{a.close();}
});

test('all sheet pages render and inventory preserves fractional weights and negative initiative adjustments', async()=>{
 const a=await app();try{const c=a.api.blank('Versatile');a.api.use(c);
 for(const page of ['overview','abilities','combat','spells','equipment','background','notes']){a.api.setPage(page);assert.ok(a.$('#page-content').textContent.length>20);}
 a.api.setPage('equipment');a.click('[data-action="add-item"]');a.input('[data-field="equipment.0.weight"]',0.5);await settle();assert.equal(c.equipment[0].weight,0.5);assert.match(a.$('#page-content').textContent,/0.5 lb/);
 a.api.setPage('combat');a.input('[data-field="initiativeBonus"]',-2);await settle();assert.equal(c.initiativeBonus,-2);
 a.api.setPage('spells');a.click('[data-action="add-spell"]');a.input('[data-field="spells.0.name"]','A custom spell');assert.equal(c.spells[0].name,'A custom spell');
 }finally{a.close();}
});

test('storage failure keeps in-memory data exportable and reports the save problem', async()=>{
 const a=await app();try{a.w.console.error=()=>{};const c=a.api.blank('Protected');a.api.use(c);a.api.changed();a.api.db.close();
 await assert.rejects(a.api.persist());assert.equal(a.api.failed,true);assert.match(a.$('#save-status').textContent,/Save failed/);
 await a.api.exportBackup();assert.equal(JSON.parse(await a.download().text()).characters[0].name,'Protected');
 }finally{a.close();}
});

const glance = (a,label) => [...a.w.document.querySelectorAll('.glance>div')].find(el=>el.querySelector('span').textContent===label).querySelector('strong').textContent;
const spellSummary = a => [...a.w.document.querySelectorAll('.spell-summary .big-number')].map(el=>el.textContent);

test('10 current HP plus 2 temporary HP shows 12/10 everywhere and remains correct after damage and reload',async()=>{
 const a=await app();try{const c=a.api.blank('Temporary health');a.api.use(c);
 a.input('[data-field="tempHp"]',2,false);await settle();
 assert.equal(a.$('.hp-display').textContent,'12/10');assert.equal(a.$('.hp-display strong').textContent,'12/10');
 a.click('[data-page="combat"]');assert.equal(a.$('.hp-display').textContent,'12/10');
 a.click('[data-action="library"]');assert.equal(a.$('.card-stats strong').textContent,'12/10');
 a.click('[data-action="open"]');a.$('#hp-amount').value='1';a.click('[data-action="damage"]');
 assert.equal(a.$('.hp-display').textContent,'11/10');assert.equal(c.hp,10);assert.equal(c.tempHp,1);
 a.$('#hp-amount').value='3';a.click('[data-action="damage"]');assert.equal(a.$('.hp-display').textContent,'8/10');assert.equal(c.hp,8);assert.equal(c.tempHp,0);
 await a.api.persist();const b=await app(a.storage);try{assert.equal(b.$('.hp-display').textContent,'8/10');b.click('[data-action="library"]');assert.equal(b.$('.card-stats strong').textContent,'8/10');}finally{b.close();}
 }finally{a.close();}
});

test('every ability score from 1 to 30 produces the correct modifier while editing', async()=>{
 const a=await app();try{a.api.use(a.api.blank('Modifiers'));
 const expected=[-5,-4,-4,-3,-3,-2,-2,-1,-1,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10];
 for(let i=0;i<expected.length;i++){
  const control=a.$('[data-field="abilities.1"]');control.focus();
  a.input('[data-field="abilities.1"]',i+1,false);await settle();
  assert.equal(a.w.document.activeElement,control,'Recalculating preserves the edited input and its focus');
  assert.equal(a.$('[data-field="abilities.1"]').parentElement.querySelector('strong').textContent,String(expected[i]>=0?`+${expected[i]}`:expected[i]),`Dexterity ${i+1}`);
  assert.equal(glance(a,'Initiative'),expected[i]>=0?`+${expected[i]}`:String(expected[i]));
 }
 }finally{a.close();}
});

test('proficiency updates through all twenty levels and propagates to saves and spellcasting',async()=>{
 const a=await app();try{const c=a.api.blank('Levels');c.abilities=[16,14,12,18,8,10];c.saves=[0];c.skills=['Perception'];a.api.use(c);
 const expected=[2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,6,6,6,6];
 for(let i=0;i<expected.length;i++){
  a.api.setPage('overview');a.input('[data-field="level"]',i+1);await settle();
  assert.equal(glance(a,'Proficiency'),`+${expected[i]}`);
  assert.equal(glance(a,'Passive perception'),String(9+expected[i]));
  a.api.setPage('abilities');assert.equal(a.$('[data-save="0"]').parentElement.querySelector('strong').textContent,`+${3+expected[i]}`);
  a.api.setPage('spells');assert.deepEqual(spellSummary(a),[String(12+expected[i]),`+${4+expected[i]}`]);
 }
 }finally{a.close();}
});

test('all eighteen skills and six saving throws use the correct ability and proficiency',async()=>{
 const a=await app();try{const c=a.api.blank('Skills');c.level=9;c.abilities=[6,10,14,18,22,26];a.api.use(c);a.api.setPage('abilities');
 const expected={Acrobatics:0,'Animal Handling':6,Arcana:4,Athletics:-2,Deception:8,History:4,Insight:6,Intimidation:8,Investigation:4,Medicine:6,Nature:4,Perception:6,Performance:8,Persuasion:8,Religion:4,'Sleight of Hand':0,Stealth:0,Survival:6};
 for(const [name,base]of Object.entries(expected)){
  const selector=`[data-skill="${name}"]`;
  assert.equal(a.$(selector).parentElement.querySelector('strong').textContent,base>=0?`+${base}`:String(base));
  a.input(selector,true);await settle();assert.equal(a.$(selector).parentElement.querySelector('strong').textContent,`+${base+4}`);
  a.input(`[data-expertise="${name}"]`,true);await settle();assert.equal(a.$(selector).parentElement.querySelector('strong').textContent,`+${base+8}`);
 }
 const saveBase=[-2,0,2,4,6,8];
 for(let i=0;i<6;i++){a.input(`[data-save="${i}"]`,true);await settle();assert.equal(a.$(`[data-save="${i}"]`).parentElement.querySelector('strong').textContent,`+${saveBase[i]+4}`);a.input(`[data-save="${i}"]`,false);await settle();assert.equal(a.$(`[data-save="${i}"]`).parentElement.querySelector('strong').textContent,saveBase[i]>=0?`+${saveBase[i]}`:String(saveBase[i]));}
 a.api.setPage('overview');assert.equal(glance(a,'Passive perception'),'24');
 }finally{a.close();}
});

test('changing the casting ability updates spell DC and attack for all six abilities',async()=>{
 const a=await app();try{const c=a.api.blank('Caster');c.level=5;c.abilities=[6,10,14,18,22,26];a.api.use(c);a.api.setPage('spells');
 const expected=[['9','+1'],['11','+3'],['13','+5'],['15','+7'],['17','+9'],['19','+11']];
 for(let i=0;i<6;i++){a.$('[data-field="spellAbility"]').focus();a.input('[data-field="spellAbility"]',i);await settle();assert.deepEqual(spellSummary(a),expected[i]);assert.equal(a.$('[data-field="spellAbility"]').value,String(i));}
 a.api.setPage('overview');a.input('[data-field="level"]',1);a.input('[data-field="abilities.0"]',1);await settle();a.api.setPage('spells');a.input('[data-field="spellAbility"]',0);await settle();assert.deepEqual(spellSummary(a),['5','-3']);
 }finally{a.close();}
});

test('inventory totals update on quantity edits before blur, removal, and reload',async()=>{
 const a=await app();try{const c=a.api.blank('Inventory');c.equipment=[{name:'Rope',quantity:2,weight:0.5,notes:'',equipped:false},{name:'Pack',quantity:1,weight:12.25,notes:'',equipped:true}];a.api.use(c);a.api.setPage('equipment');
 a.input('[data-field="equipment.0.quantity"]',3,false);await settle();assert.match(a.$('#page-content').textContent,/13.8 lb/);
 a.click('[data-action="remove"][data-index="1"]');assert.match(a.$('#page-content').textContent,/1.5 lb/);
 await a.api.persist();const b=await app(a.storage);try{b.api.setPage('equipment');assert.match(b.$('#page-content').textContent,/1.5 lb/);}finally{b.close();}
 }finally{a.close();}
});

test('health caps current HP when maximum decreases and clears death saves when healed from zero',async()=>{
 const a=await app();try{const c=a.api.blank('Recovery');c.hp=20;c.maxHp=30;a.api.use(c);
 a.input('[data-field="maxHp"]','',false);await settle();assert.equal(c.hp,20);assert.equal(c.maxHp,30,'Clearing a field while typing must not erase HP');
 a.input('[data-field="maxHp"]',10);await settle();assert.equal(c.hp,10);assert.equal(a.$('.hp-display strong').textContent,'10/10');
 a.input('[data-field="maxHp"]',0);await settle();assert.equal(c.hp,0);assert.equal(a.$('.hp-track i').style.width,'0%');assert.ok(!/NaN|Infinity/.test(a.$('#page-content').innerHTML));
 a.input('[data-field="maxHp"]',15);a.input('[data-field="tempHp"]',12);await settle();c.deathSuccess=2;c.deathFailure=1;
 a.$('#hp-amount').value='3';a.click('[data-action="heal"]');assert.equal(c.hp,3);assert.equal(c.deathSuccess,0);assert.equal(c.deathFailure,0);
 assert.equal(c.tempHp,12,'Healing leaves temporary HP alone');
 a.api.setPage('combat');assert.equal(a.$('[data-field="deathFailure"]').value,'0');
 }finally{a.close();}
});

test('restored character calculations reject invalid indexes and preserve expertise bonuses',async()=>{
 const a=await app();try{const c=a.api.blank('Restored');const wrap=characters=>({format:'statfolio',version:1,characters});
 for(const change of [{spellAbility:6},{spellAbility:1.5},{level:2.5},{hp:-1},{maxHp:-1},{tempHp:-1}])assert.throws(()=>a.api.validateBackup(wrap([{...c,...change}])));
 c.level=5;c.abilities[4]=16;c.expertise=['Perception'];c.skills=[];
 await a.restore([c],'replace');a.click('[data-action="open"]');assert.equal(glance(a,'Passive perception'),'19');
 a.api.setPage('abilities');assert.equal(a.$('[data-skill="Perception"]').checked,true);assert.equal(a.$('[data-expertise="Perception"]').parentElement.querySelector('strong').textContent,'+9');
 }finally{a.close();}
});
