import { PIECE_CATALOG, getPieceDefinition } from './catalog';

// Cross-faction piece equivalence lookup.
//
// Primary: uses CDT m_BuildableGroupType + m_BuildableFaction from PIECE_CATALOG so
// pieces with matching buildableGroupType are treated as equivalent.
//
// Fallback: string-parsing of templateId names (original approach) for pieces without
// a registered catalog entry.

// ── Faction → human-readable set label ───────────────────────────────────────

export const FACTION_LABELS: Record<string, string> = {
  Atreides:      'Atreides Outpost',
  Harkonnen:     'Harkonnen Outpost',
  Choam:         'Choam Shelter',
  Choam2:        'Choam Level 2',
  Choam3:        'Choam Outpost',
  Smuggler:      'Smuggler',
  Watershippers: 'Watershippers',
  ExtraSets:     'Desert Mechanic',
  Fremen:        'Fremen',
  BeneGesserit:  'Bene Gesserit',
  Generic:       'Generic',
};

// ── Registry-based index (grouped by buildableGroupType + faction) ─────────────

interface CatalogEntry {
  templateId: string;
  faction: string;
  buildableGroupType: string;
  name: string;
  iconPath?: string;
}

let groupTypeIndex: Map<string, CatalogEntry[]> | null = null;

function getGroupTypeIndex(): Map<string, CatalogEntry[]> {
  if (groupTypeIndex) return groupTypeIndex;
  const idx = new Map<string, CatalogEntry[]>();
  for (const p of PIECE_CATALOG) {
    if (!p.buildableGroupType) continue;
    const bucket = idx.get(p.buildableGroupType);
    if (bucket) bucket.push(p as CatalogEntry);
    else idx.set(p.buildableGroupType, [p as CatalogEntry]);
  }
  groupTypeIndex = idx;
  return idx;
}

// ── Fallback: string-parsing (original approach) ──────────────────────────────

const SHAPE_KEYWORDS = [
  'Foundation',
  'Floor',
  'Wall',
  'Window',
  'Garage',
  'Door',
  'PrudenceDoor',
  'Hatch',
  'Pillar',
  'Column',
  'Rooftop',
  'Roof',
  'Ramp',
  'Stairs',
  'Railing',
  'Gate',
];

interface Parsed {
  templateId: string;
  prefix: string;
  shape: string;
  normalizedShape: string;
  variant: string;
}

function splitVariant(shape: string): { normalized: string; variant: string } {
  if (shape.endsWith('_New')) return { normalized: shape.slice(0, -4), variant: 'New' };
  const m = shape.match(/^(.*?)_(\d+)$/);
  if (!m) return { normalized: shape, variant: '' };
  return { normalized: m[1], variant: m[2] };
}

const SHAPE_ALIASES: Record<string, string> = {
  'Stairs_Corner_In':             'Stairs_Corner_Inward',
  'Stairs_Corner_Half_In':        'Stairs_Corner_Half_Inward',
  'Ramp_Corner_In':               'Ramp_Corner_Inward',
  'Ramp_Corner_Half_In':          'Ramp_Corner_Half_Inward',
  'Ramp_Corner_Inwards':          'Ramp_Corner_Inward',
  'Ramp_Corner_Half_Inwards':     'Ramp_Corner_Half_Inward',
  'Stairs_Corner_Inverted':       'Stairs_Corner_Inward',
  'Stairs_Corner_Inverted_Half':  'Stairs_Corner_Half_Inward',
  'Ramp_Corner_Inverted':         'Ramp_Corner_Inward',
  'Ramp_Corner_Inverted_Half':    'Ramp_Corner_Half_Inward',
};

function canonicalizeShape(shape: string): string {
  const expanded = shape.replace(/_([LR])$/, (_, lr) => (lr === 'L' ? '_Left' : '_Right'));
  return SHAPE_ALIASES[expanded] ?? expanded;
}

function parseTemplate(id: string): Parsed | null {
  let bestStart = Number.POSITIVE_INFINITY;
  for (const kw of SHAPE_KEYWORDS) {
    const re = new RegExp(`(?:^|_)${kw}(?:_|$)`);
    const m = id.match(re);
    if (!m || m.index === undefined) continue;
    const start = m.index + (m[0].startsWith('_') ? 1 : 0);
    if (start < bestStart) bestStart = start;
  }
  if (!Number.isFinite(bestStart)) return null;
  const prefix = bestStart === 0 ? '' : id.slice(0, bestStart - 1);
  const shape  = id.slice(bestStart);
  const { normalized, variant } = splitVariant(shape);
  return { templateId: id, prefix, shape, normalizedShape: canonicalizeShape(normalized), variant };
}

let shapeIndex: Map<string, Parsed[]> | null = null;

function getShapeIndex(): Map<string, Parsed[]> {
  if (shapeIndex) return shapeIndex;
  const idx = new Map<string, Parsed[]>();
  for (const p of PIECE_CATALOG) {
    const parsed = parseTemplate(p.templateId);
    if (!parsed) continue;
    const bucket = idx.get(parsed.normalizedShape);
    if (bucket) bucket.push(parsed);
    else        idx.set(parsed.normalizedShape, [parsed]);
  }
  shapeIndex = idx;
  return idx;
}

// ── Public types ──────────────────────────────────────────────────────────────

export interface Equivalent {
  templateId: string;
  setLabel: string;
  iconUrl: string | undefined;
  displayName: string;
}

// ── Public API ────────────────────────────────────────────────────────────────

export function formatSetLabel(prefix: string): string {
  if (!prefix) return '(generic)';
  return prefix.replace(/_/g, ' ');
}

export function findEquivalents(templateId: string): Equivalent[] {
  const sourceDef = getPieceDefinition(templateId);

  // Registry path: CDT groupType narrows to the right category; string-parsing
  // then picks the best shape+variant match within each faction's bucket.
  const sourceParsed = parseTemplate(templateId);
  if (sourceDef?.buildableGroupType) {
    const idx = getGroupTypeIndex();
    const bucket = idx.get(sourceDef.buildableGroupType) ?? [];
    if (bucket.length > 1) {
      const byFaction = new Map<string, CatalogEntry[]>();
      for (const entry of bucket) {
        if (entry.faction === sourceDef.faction) continue;
        const arr = byFaction.get(entry.faction);
        if (arr) arr.push(entry);
        else byFaction.set(entry.faction, [entry]);
      }
      if (byFaction.size > 0) {
        const result: Equivalent[] = [];
        for (const [faction, entries] of byFaction) {
          let pick = entries[0];
          if (sourceParsed) {
            // Prefer same normalizedShape, then same variant within that shape.
            const sameShape = entries.filter((e) => {
              const p = parseTemplate(e.templateId);
              return p?.normalizedShape === sourceParsed.normalizedShape;
            });
            const pool = sameShape.length > 0 ? sameShape : entries;
            pick = pool.find((e) => parseTemplate(e.templateId)?.variant === sourceParsed.variant) ?? pool[0];
          }
          result.push({
            templateId: pick.templateId,
            setLabel: FACTION_LABELS[faction] ?? formatSetLabel(faction),
            iconUrl: pick.iconPath,
            displayName: pick.name || pick.templateId,
          });
        }
        return result.sort((a, b) => a.setLabel.localeCompare(b.setLabel));
      }
    }
  }

  // Fallback: string-parsing
  const parsed = parseTemplate(templateId);
  if (!parsed) return [];
  const bucket = getShapeIndex().get(parsed.normalizedShape);
  if (!bucket || bucket.length <= 1) return [];

  const bySet = new Map<string, Parsed[]>();
  for (const p of bucket) {
    if (p.prefix === parsed.prefix) continue;
    const arr = bySet.get(p.prefix);
    if (arr) arr.push(p);
    else     bySet.set(p.prefix, [p]);
  }

  const result: Equivalent[] = [];
  for (const [prefix, variants] of bySet) {
    const sameVariant = variants.find((v) => v.variant === parsed.variant);
    const sorted = [...variants].sort((a, b) => a.variant.localeCompare(b.variant));
    const pick = sameVariant ?? sorted[0];
    const def = getPieceDefinition(pick.templateId);
    result.push({
      templateId: pick.templateId,
      setLabel: formatSetLabel(prefix),
      iconUrl: def?.iconPath,
      displayName: def?.name || pick.templateId,
    });
  }
  return result.sort((a, b) => a.setLabel.localeCompare(b.setLabel));
}

export function getSetLabel(templateId: string): string {
  const def = getPieceDefinition(templateId);
  if (def?.faction) return FACTION_LABELS[def.faction] ?? formatSetLabel(def.faction);
  const parsed = parseTemplate(templateId);
  return formatSetLabel(parsed?.prefix ?? '');
}

export function getShape(templateId: string): string {
  const parsed = parseTemplate(templateId);
  return parsed?.shape ?? templateId;
}

export function getDisplayName(templateId: string): string {
  const def = getPieceDefinition(templateId);
  return def?.name || getShape(templateId);
}

export function getIconUrl(templateId: string): string | undefined {
  return getPieceDefinition(templateId)?.iconPath;
}
