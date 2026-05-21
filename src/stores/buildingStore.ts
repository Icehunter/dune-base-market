import { create } from 'zustand';
import type { Transform } from '../engine/GridSystem';
import { getDefaultBasePieces } from '../data/defaultBase';

export interface PlacedPiece {
  id: string;
  templateId: string;
  transform: Transform;
  faction: string;
  category: string;
  scale?: { x: number; y: number; z: number };
}

// Export format matching the dune-admin Go tool's JSON schema.
// Import reads named fields directly into the DB transform array:
//   instances:  ARRAY[x, y, z, rotation]  (x=PSV[0]=UE_X, y=PSV[1]=UE_Y)
//   placeables: ARRAY[x, y, z, rx, ry, rz]
export interface BlueprintExport {
  instances: { building_type: string; x: number; y: number; z: number; rotation: number }[];
  placeables: { building_type: string; x: number; y: number; z: number; rx: number; ry: number; rz: number }[];
}

// Raw blueprint JSON format (export/DB convention: raw.x = UE_X, raw.y = UE_Y)
export interface RawBlueprint {
  instances: { building_type: string; x: number; y: number; z: number; rotation: number }[];
  placeables: { building_type: string; x: number; y: number; z: number; rx?: number; ry?: number; rz?: number }[];
  pentashields?: { placeable_id: number; scale: [number, number, number] }[];
}

interface BuildingState {
  pieces: PlacedPiece[];
  loadDefaultBase: () => void;
  loadFromRaw: (raw: RawBlueprint) => void;
  exportBlueprint: () => BlueprintExport;
}

function withIds(pieces: Omit<PlacedPiece, 'id'>[]): PlacedPiece[] {
  return pieces.map((p, i) => ({ ...p, id: `p_${i}` }));
}

// Round to integer degrees to strip floating-point noise (e.g. 7e-15 → 0).
// Preserves non-90° values like 60°/120° used by wedge-based layouts.
function cleanRotation(rot: number): number {
  return Math.round(rot);
}

function round3(v: number) { return Math.round(v * 1000) / 1000; }

function category(id: string): string {
  const l = id.toLowerCase();
  if (l.includes('foundation')) return 'Foundation';
  if (l.includes('wall'))       return 'Wall';
  if (l.includes('floor'))      return 'Floor';
  if (l.includes('roof') || l.includes('rooftop')) return 'Rooftop';
  if (l.includes('ramp'))       return 'Ramp';
  if (l.includes('stair'))      return 'Stairs';
  if (l.includes('pillar') || l.includes('column')) return 'Pillar';
  if (l.includes('door') || l.includes('window'))   return 'Door';
  return 'Decoration';
}

const PLACEABLE_SUFFIX = '_Placeable';

export const useBuildingStore = create<BuildingState>()((set, get) => ({
  pieces: [],

  loadDefaultBase: () => {
    if (get().pieces.length === 0) {
      set({ pieces: withIds(getDefaultBasePieces()) });
    }
  },

  loadFromRaw: (raw: RawBlueprint) => {
    // Sample files use export/DB format: raw.x = UE_X, raw.y = UE_Y.
    // Internal convention: position.x = UE_Y, position.y = UE_X (SceneCanvas maps
    // Vector3(position.x, position.z, position.y) to Babylon axes).
    // Both instances and placeables need the x↔y swap.
    const instances: Omit<PlacedPiece, 'id'>[] = (raw.instances ?? []).map(r => ({
      templateId: r.building_type,
      transform: {
        position: { x: round3(r.y), y: round3(r.x), z: round3(r.z) },
        rotation: cleanRotation(-r.rotation),
      },
      faction: 'Atreides',
      category: category(r.building_type),
    }));

    const scaleMap = new Map<number, { x: number; y: number; z: number }>();
    for (const ps of raw.pentashields ?? []) {
      scaleMap.set(ps.placeable_id, { x: ps.scale[0], y: ps.scale[1], z: ps.scale[2] });
    }

    const placeables: Omit<PlacedPiece, 'id'>[] = (raw.placeables ?? []).map((r, i) => ({
      templateId: r.building_type,
      transform: {
        position: { x: round3(r.y ?? 0), y: round3(r.x), z: round3(r.z) },
        rotation: cleanRotation(r.ry ?? 0),
      },
      faction: 'Generic',
      category: 'Decoration',
      ...(scaleMap.has(i) ? { scale: scaleMap.get(i) } : {}),
    }));

    set({ pieces: withIds([...instances, ...placeables]) });
  },

  exportBlueprint: () => {
    const pieces = get().pieces;

    // Admin tool format: named fields x/y/z/rotation written directly into DB transform array.
    // Instances: defaultBaseData swaps PSV → position.x=PSV[1]=UE_Y, position.y=PSV[0]=UE_X.
    //   Export: x=position.y (UE_X=PSV[0]), y=position.x (UE_Y=PSV[1]).
    //   Rotation was negated on load, negate back.
    const instances = pieces
      .filter(p => !p.templateId.endsWith(PLACEABLE_SUFFIX))
      .map(p => ({
        building_type: p.templateId,
        x: p.transform.position.y,    // PSV[0] = UE_X
        y: p.transform.position.x,    // PSV[1] = UE_Y
        z: p.transform.position.z,
        rotation: -p.transform.rotation,
      }));

    // Placeables: loaded with x↔y swapped for display (position.x=PSV[1], position.y=PSV[0]).
    //   Undo swap on export: x=position.y (PSV[0]=UE_X), y=position.x (PSV[1]=UE_Y).
    //   ry not negated on load, export as-is.
    const placeables = pieces
      .filter(p => p.templateId.endsWith(PLACEABLE_SUFFIX))
      .map(p => ({
        building_type: p.templateId,
        x: p.transform.position.y,   // PSV[0] = UE_X
        y: p.transform.position.x,   // PSV[1] = UE_Y
        z: p.transform.position.z,
        rx: 0,
        ry: p.transform.rotation,
        rz: 0,
      }));

    return { instances, placeables };
  },
}));
