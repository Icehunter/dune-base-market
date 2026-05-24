import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const FONTS_SRC = process.env.FONTS_DIR ?? path.resolve(PROJECT_ROOT, '../dune-item-data/dune-awakening/Dune/Fonts');
const FONTS_DST = path.join(PROJECT_ROOT, 'public', 'fonts');

fs.mkdirSync(FONTS_DST, { recursive: true });

let copied = 0;
for (const file of fs.readdirSync(FONTS_SRC)) {
  if (!file.endsWith('.ufont')) continue;
  const dst = path.join(FONTS_DST, file.replace('.ufont', '.ttf'));
  fs.copyFileSync(path.join(FONTS_SRC, file), dst);
  console.log(`Copied: ${file} → ${path.relative(PROJECT_ROOT, dst)}`);
  copied++;
}

console.log(`Done. Copied ${copied} font(s) to ${path.relative(PROJECT_ROOT, FONTS_DST)}/`);
