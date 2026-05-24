import { MODEL_PATHS } from './pieceRegistry.generated';

// Cross-faction piece equivalence lookup.
//
// Pieces in the generated registry follow patterns like:
//   <Faction>_<Group>_<Shape>            — Choam_Shelter_Wall_01, Atreides_Outpost_Foundation
//   MTX_<FactionShort>_<Group?>_<Shape>  — MTX_Atre_BreakfastRoom_Wall_01, MTX_Smug_Foundation
//   <Faction>_<Shape>                    — Watershippers_Wall_01
//   <Shape>                              — Door_Frame, Floor_Round_Corner
//
// We treat the trailing shape signature (Wall_01, Wall_Triangle_Bottom_Left, etc.) as
// the cross-faction key. Two templates with the same shape signature are considered
// equivalent and can be swapped for one another. The portion before the shape is the
// "set label" we show in the swap UI (e.g. "Choam Shelter", "Atreides Outpost").

// Ordered list of keywords that indicate the start of a shape signature. We pick the
// FIRST match at a word boundary so e.g. "Wall_Triangle_Bottom_Left" stays intact.
const SHAPE_KEYWORDS = [
  'Foundation',
  'Floor',
  'Wall',
  'Window',
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
  prefix: string;          // e.g. "Choam_Shelter", "MTX_Atre", "" for generic
  shape: string;           // raw trailing shape: "Wall_01", "Wall_Round_Corner_03"
  normalizedShape: string; // shape with trailing numeric variant stripped: "Wall", "Wall_Round_Corner"
  variant: string;         // the stripped suffix (e.g. "01", "03"); '' when no variant
}

// Strip a single trailing _NN segment so art variants (Wall_01/02/03,
// Wall_Round_Corner_01/02/03) collapse to one normalized shape. Descriptive
// suffixes like _Half / _Left / _Round_Corner are preserved.
function splitVariant(shape: string): { normalized: string; variant: string } {
  const m = shape.match(/^(.*?)_(\d+)$/);
  if (!m) return { normalized: shape, variant: '' };
  return { normalized: m[1], variant: m[2] };
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
  return { templateId: id, prefix, shape, normalizedShape: normalized, variant };
}

// Indexed by normalizedShape so e.g. Wall_01, Wall_02, Wall_03 all share a bucket.
let shapeIndex: Map<string, Parsed[]> | null = null;
function getIndex(): Map<string, Parsed[]> {
  if (shapeIndex) return shapeIndex;
  const idx = new Map<string, Parsed[]>();
  for (const id of Object.keys(MODEL_PATHS)) {
    const parsed = parseTemplate(id);
    if (!parsed) continue;
    const bucket = idx.get(parsed.normalizedShape);
    if (bucket) bucket.push(parsed);
    else        idx.set(parsed.normalizedShape, [parsed]);
  }
  shapeIndex = idx;
  return idx;
}

export function formatSetLabel(prefix: string): string {
  if (!prefix) return '(generic)';
  return prefix.replace(/_/g, ' ');
}

export interface Equivalent {
  templateId: string;
  setLabel: string;
}

export function findEquivalents(templateId: string): Equivalent[] {
  const parsed = parseTemplate(templateId);
  if (!parsed) return [];
  const bucket = getIndex().get(parsed.normalizedShape);
  if (!bucket || bucket.length <= 1) return [];

  // Group variants by prefix (set) so each set appears at most once in the dropdown.
  const bySet = new Map<string, Parsed[]>();
  for (const p of bucket) {
    if (p.prefix === parsed.prefix) continue; // skip source set entirely
    const arr = bySet.get(p.prefix);
    if (arr) arr.push(p);
    else     bySet.set(p.prefix, [p]);
  }

  // Pick a representative variant per set: prefer same variant as source, else lowest.
  const result: Equivalent[] = [];
  for (const [prefix, variants] of bySet) {
    const sameVariant = variants.find((v) => v.variant === parsed.variant);
    const sorted = [...variants].sort((a, b) => a.variant.localeCompare(b.variant));
    const pick = sameVariant ?? sorted[0];
    result.push({ templateId: pick.templateId, setLabel: formatSetLabel(prefix) });
  }
  return result.sort((a, b) => a.setLabel.localeCompare(b.setLabel));
}

export function getSetLabel(templateId: string): string {
  const parsed = parseTemplate(templateId);
  return formatSetLabel(parsed?.prefix ?? '');
}

export function getShape(templateId: string): string {
  const parsed = parseTemplate(templateId);
  return parsed?.shape ?? templateId;
}
