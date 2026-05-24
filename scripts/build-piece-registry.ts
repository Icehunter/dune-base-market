/**
 * ETL script: reads CDT_BuildingData.json + scans src/ for GLBs and dune-awakening/ for
 * icon PNGs, emits src/data/pieceRegistry.generated.ts with MODEL_PATHS and PIECE_CATALOG.
 *
 * Run: npm run build:registry
 * Or:  SYSTEMS_DIR=/absolute/path ICON_DIR=/absolute/path npx tsx scripts/build-piece-registry.ts
 *
 * SYSTEMS_DIR — parent of Building/Data/CDT_BuildingData.json
 *               default: ../dune-item-data/dune-awakening/Dune/Systems
 * ICON_DIR    — CDN-mirror root whose directory layout becomes /src/<relative> URLs
 *               default: ../dune-item-data/dune-awakening
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.resolve(__dirname, '..');
const SYSTEMS_DIR = process.env.SYSTEMS_DIR ?? path.resolve(PROJECT_ROOT, '../dune-item-data/dune-awakening/Dune/Systems');
const ICON_DIR    = process.env.ICON_DIR    ?? path.resolve(PROJECT_ROOT, '../dune-item-data/dune-awakening');
const SRC_DIR = path.join(PROJECT_ROOT, 'src');
const OUT_FILE = path.join(SRC_DIR, 'data', 'pieceRegistry.generated.ts');

// ── Asset index (GLBs and PNGs) ───────────────────────────────────────────────

// relRoot: directory used as the base for computing relative URL paths.
// urlPrefix: prepended before the relative path (GLBs use '/', icons use '/src/').
//   GLBs live in src/ which is inside PROJECT_ROOT → '/' + relative(PROJECT_ROOT, file) = /src/...
//   PNGs live in ICON_DIR (CDN mirror) → '/src/' + relative(ICON_DIR, file) = /src/Dune/...
//   catalog.ts's cdnPath() strips the leading /src and prepends CDN_BASE.
function scanByExtension(dir: string, ext: string, relRoot: string, urlPrefix = '/'): Map<string, string> {
  const index = new Map<string, string>();
  function walk(current: string) {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      if (!entry.name.endsWith(ext)) continue;
      const stem = entry.name.slice(0, -ext.length);
      const urlPath = urlPrefix + path.relative(relRoot, full).replaceAll(path.sep, '/');
      if (!index.has(stem)) index.set(stem, urlPath);
    }
  }
  walk(dir);
  return index;
}

// ── CDT parsing ───────────────────────────────────────────────────────────────

interface CdtRow {
  m_StaticMesh: { AssetPathName: string };
  m_BuildableIcon?: { AssetPathName: string };
  m_bIsFoundation: boolean;
  m_bIsPillar: boolean;
  m_BuildableGroupType: { Name: string };
  m_BuildingMenuOrderWeight: number;
  m_BuildableTier: { Name: string };
  m_BuildableFaction: { Name: string };
  m_DisplayName: { LocalizedString: string };
  m_bShowInList?: boolean;
}

function readCdt(): Record<string, CdtRow> {
  const file = path.join(SYSTEMS_DIR, 'Building/Data/CDT_BuildingData.json');
  const raw = fs.readFileSync(file, 'utf-8').replace(/^﻿/, '');
  const data = JSON.parse(raw) as Array<{ Rows: Record<string, CdtRow> }>;
  return data[0].Rows;
}

// ── Cost derivation ───────────────────────────────────────────────────────────

const WALL_EDGE_GROUPS = new Set([
  'Wall', 'Wall_Half', 'Wall_Round_Corner', 'Wall_Round_Corner_Half',
  'Wall_Round_Corner_Sideless', 'Wall_Triangle_Bottom_Left', 'Wall_Triangle_Bottom_Right',
  'Wall_Triangle_Top_Left', 'Wall_Triangle_Top_Right', 'Wall_Triangle_Bottom_Half_Left',
  'Wall_Triangle_Bottom_Half_Right', 'Wall_Triangle_Top_Half_Left', 'Wall_Triangle_Top_Half_Right',
  'Wall_Protuding', 'Wall_Inclined_Tall', 'Wall_Inclined_Corner_Tall',
  'Door_Frame', 'Door_Frame_Tall', 'Door_Frame_Wide', 'Door_Frame_Garage',
  'PrudenceDoor_Frame', 'Gate_Big', 'Pillar', 'Pillar_Corner', 'Tower',
  'Arch', 'Passageway',
]);

const FLOOR_FREE_GROUPS = new Set([
  'Floor', 'Rooftop', 'Floor_Round_Corner', 'Floor_Round_Corner_Inverted', 'Floor_Wedge',
]);

const FOUNDATION_TIER_HEALTH: Record<string, number> = {
  Tier0: 5000, Tier1: 7000, Tier2: 10000, Tier3: 12000,
};

function connectionCost(row: CdtRow): number {
  if (row.m_bIsFoundation) return 0;
  const g = row.m_BuildableGroupType.Name;
  if (WALL_EDGE_GROUPS.has(g)) return 100;
  if (FLOOR_FREE_GROUPS.has(g)) return 0;
  return 10;
}

// ── Category mapping ──────────────────────────────────────────────────────────

type Category = 'Foundation' | 'Wall' | 'Rooftop' | 'Floor' | 'Pillar' | 'Ramp' | 'Door' | 'Decoration';

const GROUP_TO_CATEGORY: Record<string, Category> = {
  Foundation: 'Foundation', Foundation_Round_Corner: 'Foundation', Foundation_Wedge: 'Foundation',
  Wall: 'Wall', Wall_Half: 'Wall', Wall_Round_Corner: 'Wall', Wall_Round_Corner_Half: 'Wall',
  Wall_Round_Corner_Sideless: 'Wall', Wall_Protuding: 'Wall',
  Wall_Triangle_Bottom_Left: 'Wall', Wall_Triangle_Bottom_Right: 'Wall',
  Wall_Triangle_Top_Left: 'Wall', Wall_Triangle_Top_Right: 'Wall',
  Wall_Triangle_Bottom_Half_Left: 'Wall', Wall_Triangle_Bottom_Half_Right: 'Wall',
  Wall_Triangle_Top_Half_Left: 'Wall', Wall_Triangle_Top_Half_Right: 'Wall',
  Wall_Inclined_Tall: 'Wall', Wall_Inclined_Corner_Tall: 'Wall',
  Arch: 'Wall', Passageway: 'Wall', Window_Wide: 'Wall',
  Floor: 'Floor', Floor_Round_Corner: 'Floor', Floor_Round_Corner_Inverted: 'Floor', Floor_Wedge: 'Floor',
  Rooftop: 'Rooftop', Roof: 'Rooftop', Roof_Half: 'Rooftop', Roof_Corner: 'Rooftop',
  Roof_Corner_Half: 'Rooftop', Roof_Corner_Inward: 'Rooftop', Roof_Corner_Half_Inward: 'Rooftop',
  Roof_Round_Corner: 'Rooftop', Roof_Round_Corner_Half: 'Rooftop',
  Angled_Wedge_Bottom: 'Rooftop', Angled_Wedge_Top: 'Rooftop',
  Pillar: 'Pillar', Pillar_Corner: 'Pillar', Tower: 'Pillar',
  Ramp: 'Ramp', Ramp_Half: 'Ramp', Ramp_Corner: 'Ramp', Ramp_Corner_Half: 'Ramp',
  Ramp_Corner_Inward: 'Ramp', Ramp_Corner_Half_Inward: 'Ramp',
  Ramp_Round_Corner: 'Ramp', Ramp_Round_Corner_Half: 'Ramp',
  Stairs: 'Ramp', Stairs_Half: 'Ramp', Stairs_Corner: 'Ramp', Stairs_Corner_Half: 'Ramp',
  Stairs_Corner_Inward: 'Ramp', Stairs_Corner_Half_Inward: 'Ramp',
  Angled: 'Ramp', Angled_Half: 'Ramp', Angled_Corner: 'Ramp', Angled_Corner_Half: 'Ramp',
  Angled_Corner_Inward: 'Ramp', Angled_Corner_Half_Inward: 'Ramp',
  Angled_Round_Corner: 'Ramp', Angled_Round_Corner_Half: 'Ramp',
  Door_Frame: 'Door', Door_Frame_Tall: 'Door', Door_Frame_Wide: 'Door', Door_Frame_Garage: 'Door',
  PrudenceDoor_Frame: 'Door', Gate_Big: 'Door', Hatch_Frame: 'Door',
};

function toCategory(groupType: string): Category {
  return GROUP_TO_CATEGORY[groupType] ?? 'Decoration';
}

// ── Faction color palette ─────────────────────────────────────────────────────

const FACTION_COLORS: Record<string, string> = {
  Atreides: '#4A6741', Smuggler: '#8B7355', Harkonnen: '#2D2D2D',
  Choam: '#C4A35A', Watershippers: '#2A5A8B', Fremen: '#C8A86B',
  BeneGesserit: '#4A2D6B', Generic: '#777777', Blockout: '#444444',
};

function factionColor(faction: string): string {
  return FACTION_COLORS[faction] ?? '#777777';
}

// ── Size heuristics ───────────────────────────────────────────────────────────

function sizeFor(cat: Category): { x: number; y: number; z: number } {
  switch (cat) {
    case 'Foundation': return { x: 1, y: 1, z: 1 };
    case 'Wall':       return { x: 1, y: 0.1, z: 1 };
    case 'Floor':      return { x: 1, y: 1, z: 0.05 };
    case 'Rooftop':    return { x: 1, y: 1, z: 0.15 };
    case 'Pillar':     return { x: 0.15, y: 0.15, z: 1 };
    case 'Ramp':       return { x: 1, y: 1, z: 1 };
    case 'Door':       return { x: 1, y: 0.1, z: 1 };
    default:           return { x: 1, y: 0.5, z: 0.5 };
  }
}

// ── Mesh stem extraction ──────────────────────────────────────────────────────

function meshStem(assetPath: string): string {
  // "/Game/Dune/.../SM_Foo.SM_Foo" → "SM_Foo"
  const afterSlash = assetPath.split('/').pop() ?? '';
  return afterSlash.split('.')[0];
}

// ── Main ──────────────────────────────────────────────────────────────────────

console.log('Scanning GLBs in', SRC_DIR, '...');
const glbIndex = scanByExtension(SRC_DIR, '.glb', PROJECT_ROOT);
console.log('Scanning icon PNGs in', ICON_DIR, '...');
const pngIndex = scanByExtension(ICON_DIR, '.png', ICON_DIR, '/src/');
console.log(`Found ${glbIndex.size} GLB files, ${pngIndex.size} PNG files`);

console.log('Reading CDT_BuildingData.json ...');
const rows = readCdt();
const templateIds = Object.keys(rows);
console.log(`Found ${templateIds.length} CDT rows`);

const modelPaths: Record<string, string> = {};
const catalogEntries: string[] = [];
let withGlb = 0, withoutGlb = 0;

for (const templateId of templateIds) {
  const row = rows[templateId];

  // Skip Blockout placeholder pieces
  if (row.m_BuildableFaction.Name === 'Blockout') continue;
  // Skip pieces not shown in the build menu
  if (row.m_bShowInList === false) continue;

  const stem = meshStem(row.m_StaticMesh.AssetPathName);
  const glbPath = glbIndex.get(stem);
  const hasGlb = !!glbPath;

  if (hasGlb) {
    modelPaths[templateId] = glbPath!;
    withGlb++;
  } else {
    withoutGlb++;
  }

  // Icon PNG from m_BuildableIcon
  const iconAsset = row.m_BuildableIcon?.AssetPathName ?? '';
  const iconStem = iconAsset ? iconAsset.split('/').pop()!.split('.')[0] : '';
  const iconPath = iconStem ? (pngIndex.get(iconStem) ?? null) : null;

  const faction = row.m_BuildableFaction.Name;
  const groupType = row.m_BuildableGroupType.Name;
  const category = toCategory(groupType);
  const tier = (row.m_BuildableTier.Name || 'Tier1') as 'Tier0' | 'Tier1' | 'Tier2' | 'Tier3';
  const isFoundation = row.m_bIsFoundation;
  const isPillar = row.m_bIsPillar;
  const cost = connectionCost(row);
  const capacity = isFoundation ? (FOUNDATION_TIER_HEALTH[tier] ?? 7000) : undefined;
  const name = row.m_DisplayName.LocalizedString || templateId.replaceAll('_', ' ');
  const color = factionColor(faction);
  const size = sizeFor(category);

  const capacityLine = capacity !== undefined ? `\n    foundationCapacity: ${capacity},` : '';
  const iconLine = iconPath ? `\n    iconPath: ${JSON.stringify(iconPath)},` : '';

  catalogEntries.push(
    `  {\n    templateId: ${JSON.stringify(templateId)},\n    name: ${JSON.stringify(name)},\n    faction: ${JSON.stringify(faction)},\n    category: ${JSON.stringify(category)},\n    tier: ${JSON.stringify(tier)},\n    isFoundation: ${isFoundation},\n    isPillar: ${isPillar},\n    buildableGroupType: ${JSON.stringify(groupType)},\n    connectionCost: ${cost},${capacityLine}\n    hasGlb: ${hasGlb},${iconLine}\n    size: ${JSON.stringify(size)},\n    color: ${JSON.stringify(color)},\n  }`,
  );
}

console.log(`  With GLB: ${withGlb}, without GLB: ${withoutGlb}`);

const modelPathsLines = Object.entries(modelPaths)
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)
  .join('\n');

const output = `// AUTO-GENERATED by scripts/build-piece-registry.ts — do not edit manually
// Re-run: npm run build:registry
import type { PieceDefinition } from './pieces.js';

export const MODEL_PATHS: Record<string, string> = {\n${modelPathsLines}\n};

export const PIECE_CATALOG: PieceDefinition[] = [\n${catalogEntries.join(',\n')},\n];
`;

fs.writeFileSync(OUT_FILE, output, 'utf-8');
console.log(`Written: ${OUT_FILE}`);
console.log(`Total pieces in catalog: ${catalogEntries.length}`);
