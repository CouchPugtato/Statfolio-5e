# Statfolio 5e

A static, browser-saved character companion for fifth-edition tabletop games. No account, API keys, build tools, or server required.

## Use

Create a character from the library. Each character has separate pages for the core sheet, abilities and skills, combat, spellbook, equipment, background, and journal. Portraits and journal attachments support PNG, JPEG, WebP, and GIF files up to 8 MB each.

Changes save automatically in **IndexedDB** on the current browser and website origin. Export backups regularly: clearing site data, using another browser, changing the website URL, or leaving a private browsing session can make browser saves unavailable. Wait for “All changes saved” before closing the tab. Storage errors are shown explicitly so you can export your in-memory work.

The sheet computes ability modifiers, level-based proficiency, saving throws, proficient/expert skills, passive perception, initiative, and spell DC/attack bonuses. Enter your own class features, spells, attack bonuses, AC, and equipment; this is a flexible sheet rather than a rules database or automatic character builder. Initiative adjustment supports additional bonuses. Long rest restores HP, clears temporary HP/death saves, and resets spell slots; hit dice and class resources are managed manually for your table’s rules.

Calculated values refresh while you edit. Carried weight includes every listed item’s quantity × weight (including unequipped items), excludes coins, and displays to one decimal place. Lowering maximum HP caps current HP when you finish editing; raising the maximum does not heal you. Regaining HP clears death-save counters, and temporary HP absorbs damage first. Imported expertise automatically includes proficiency so skill and passive Perception bonuses stay consistent.

Formula references: the official [ability-score rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/using-ability-scores), [spellcasting rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/spellcasting), and [health rules](https://www.dndbeyond.com/sources/dnd/basic-rules-2014/combat). Conditional bonuses, advantage/disadvantage adjustments, class features, and magic-item bonuses are not inferred automatically.

## Backup and restore

**Export backup** downloads `statfolio-backup-YYYY-MM-DD.json`. It contains every character, portrait, journal entry, and attached image. Images are embedded data URLs: no external image files are needed. Keep backups private if your notes contain personal information.

**Restore backup** validates the file before offering either:

- **Add as copies**: preserve all existing characters and import new copies with fresh IDs.
- **Replace entire library**: replace all current characters with the backup’s contents.

The portable format is `{ "format": "statfolio", "version": 1, "exportedAt": "ISO date", "characters": [...] }`. Unknown format versions and malformed records are rejected before changes are made.

Use one editing tab at a time. There is no account synchronization or cross-tab merge; each tab holds its own working library.

## GitHub Pages

1. Push this repository to GitHub on `main` or `master`.
2. In **Settings → Pages → Build and deployment**, select **GitHub Actions** as the source.
3. The included `.github/workflows/pages.yml` deploys the app on pushes to either branch; run it manually from **Actions** if needed.
4. Open the Pages URL after the deployment succeeds.

All application paths are relative, so project sites such as `https://USERNAME.github.io/Statfolio-5e/` work without extra configuration. The app can also be deployed through Pages’ “Deploy from a branch” option using the repository root.

## Local development

Serve the repository over HTTP:

```sh
python -m http.server 4173
```

Open `http://localhost:4173`. No installation or compilation is required. Manrope is bundled locally and applied throughout the interface, including form controls and dialogs. Its SIL Open Font License is included in `assets/fonts/OFL.txt`; no Google Fonts connection is needed. The application uses no remote APIs, tracking, or external data storage. It requires a modern browser with IndexedDB and `crypto.randomUUID` on HTTPS or localhost. There is no service worker, so reopening the site offline is not guaranteed.

For development checks, install the test-only dependencies with `npm ci`, then run `npm test`. These DOM and IndexedDB integration tests cover saving/reopening, all ability modifiers from 1–30, every proficiency tier from levels 1–20, all 18 skills, six saving throws, all six spellcasting abilities, live updates, health limits, inventory totals, note isolation, embedded-image backups, merge/replace restore, and invalid-file handling. The deployed app has no runtime dependencies.

This is an independent character-sheet tool. It does not reproduce commercial rulebooks or provide an included spell/rules compendium.
