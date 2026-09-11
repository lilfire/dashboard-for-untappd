// Legger en versjon inn i updates.json (Firefox sin oppdateringsfil for selvdistribuerte utvidelser).
// Bruk: node scripts/update-manifest.js <versjon> <lenke-til-signert-xpi>
const fs = require('node:fs');
const path = require('node:path');

const [version, link] = process.argv.slice(2);
if (!version || !link) {
  console.error('Bruk: node scripts/update-manifest.js <versjon> <lenke>');
  process.exit(1);
}

const root = path.join(__dirname, '..');
const { browser_specific_settings: bss } = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const id = bss.gecko.id;
const file = path.join(root, 'updates.json');
const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { addons: {} };
const entry = (data.addons[id] ??= { updates: [] });
entry.updates = entry.updates.filter(u => u.version !== version);
entry.updates.push({ version, update_link: link });
fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
console.log(`updates.json: ${id} ${version} → ${link}`);
