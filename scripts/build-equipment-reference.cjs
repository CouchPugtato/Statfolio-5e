// Map the same pinned SRD transcription used by the spell reference to inventory fields.
const fs = require('node:fs/promises');
const path = require('node:path');

const revision = 'a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f';
const sourceURL = `https://raw.githubusercontent.com/5e-bits/5e-database/${revision}/src/2014/en/5e-SRD-Equipment.json`;

async function build() {
  let source;
  if (process.argv[2]) source = await fs.readFile(process.argv[2], 'utf8');
  else {
    const response = await fetch(sourceURL);
    if (!response.ok)
      throw Error(`Equipment source request failed (${response.status}).`);
    source = await response.text();
  }

  const items = JSON.parse(source);
  const byId = new Map(items.map((item) => [item.index, item]));

  function unitWeight(item, visited = new Set()) {
    if (Number.isFinite(item.weight)) return item.weight / (item.quantity || 1);
    if (!item.contents?.length || visited.has(item.index)) return null;
    const branch = new Set([...visited, item.index]);
    let total = 0;
    for (const content of item.contents) {
      const child = byId.get(content.item.index);
      const weight = child ? unitWeight(child, branch) : null;
      if (weight === null) return null;
      total += content.quantity * weight;
    }
    return Number(total.toFixed(6));
  }

  const equipment = items
    .map((item) => {
      const quantity = item.quantity || 1;
      const weight = unitWeight(item);
      const cost = `${item.cost.quantity} ${item.cost.unit}${quantity > 1 ? ` for ${quantity}` : ''}`;
      const notes = [
        `Category: ${item.equipment_category.name}`,
        `Listed cost: ${cost}`,
      ];
      if (item.damage)
        notes.push(
          `Damage: ${item.damage.damage_dice} ${item.damage.damage_type.name.toLowerCase()}`,
        );
      if (item.two_handed_damage)
        notes.push(
          `Two-handed damage: ${item.two_handed_damage.damage_dice} ${item.two_handed_damage.damage_type.name.toLowerCase()}`,
        );
      if (item.properties?.length)
        notes.push(
          `Properties: ${item.properties.map((property) => property.name).join(', ')}`,
        );
      const range = item.throw_range || item.range;
      if (range)
        notes.push(
          `Range: ${range.normal}${range.long ? ` / ${range.long}` : ''} ft.`,
        );
      if (item.armor_class) {
        const ac = item.armor_class;
        notes.push(
          item.armor_category === 'Shield'
            ? `Armor class bonus: +${ac.base}`
            : `Armor class: ${ac.base}${ac.dex_bonus ? ` + DEX modifier${ac.max_bonus !== undefined ? ` (max +${ac.max_bonus})` : ''}` : ''}`,
        );
      }
      if (item.str_minimum) notes.push(`Minimum Strength: ${item.str_minimum}`);
      if (item.stealth_disadvantage)
        notes.push('Disadvantage on Stealth checks.');
      if (item.speed)
        notes.push(`Speed: ${item.speed.quantity} ${item.speed.unit}`);
      if (item.capacity) notes.push(`Capacity: ${item.capacity}`);
      if (item.contents?.length)
        notes.push(
          `Contents: ${item.contents.map((content) => `${content.quantity} × ${content.item.name}`).join(', ')}`,
        );
      if (weight === null)
        notes.push('Weight not listed in the reference; set it manually.');
      else if (item.weight === undefined)
        notes.push('Weight calculated from listed contents.');
      if (item.desc?.length) notes.push(item.desc.join('\n\n'));
      if (item.special?.length) notes.push(item.special.join('\n\n'));
      return {
        id: item.index,
        name: item.name,
        category: item.equipment_category.name,
        quantity,
        weight,
        cost,
        notes: notes.join('\n\n'),
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const directory = path.join(__dirname, '../assets/reference');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'equipment.json'),
    JSON.stringify(equipment, null, 2) + '\n',
  );
  console.log(`Built ${equipment.length} SRD 5.1 equipment references.`);
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
