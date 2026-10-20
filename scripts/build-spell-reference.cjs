// Convert a pinned SRD transcription into the app's editable spell fields.
// Run with a local source path, or without one to download the pinned source.
const fs = require('node:fs/promises');
const path = require('node:path');

const revision = 'a6212beb4b278917c2cff41c2b04c4ef4f3e0d6f';
const sourceURL = `https://raw.githubusercontent.com/5e-bits/5e-database/${revision}/src/2014/en/5e-SRD-Spells.json`;

function paragraphs(lines) {
  return lines.reduce((text, line, index) => {
    const separator =
      index === 0
        ? ''
        : line.startsWith('|') && lines[index - 1].startsWith('|')
          ? '\n'
          : '\n\n';
    return text + separator + line.replace(/^#{1,6}\s+/, '');
  }, '');
}

async function build() {
  let source;
  if (process.argv[2]) source = await fs.readFile(process.argv[2], 'utf8');
  else {
    const response = await fetch(sourceURL);
    if (!response.ok)
      throw Error(`Spell source request failed (${response.status}).`);
    source = await response.text();
  }

  const spells = JSON.parse(source)
    .map((spell) => ({
      id: spell.index,
      name: spell.name,
      level: spell.level,
      school: spell.school.name,
      time: spell.casting_time,
      range: spell.range,
      components:
        spell.components.join(', ') +
        (spell.material ? ` (${spell.material})` : ''),
      duration: spell.duration,
      concentration: spell.concentration,
      ritual: spell.ritual,
      description:
        paragraphs(spell.desc) +
        (spell.higher_level?.length
          ? `\n\nAt higher levels\n${paragraphs(spell.higher_level)}`
          : ''),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));

  const directory = path.join(__dirname, '../assets/reference');
  await fs.mkdir(directory, { recursive: true });
  await fs.writeFile(
    path.join(directory, 'spells.json'),
    JSON.stringify(spells, null, 2) + '\n',
  );
  console.log(`Built ${spells.length} SRD 5.1 spell references.`);
}

build().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
