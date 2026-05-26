import { create } from 'zustand';
import type { Transform } from '../engine/GridSystem';
import { getDefaultBasePieces } from '../data/defaultBase';

export interface PieceTransform extends Transform {
  pitch?: number; // UE pitch (rx)
  roll?: number;  // UE roll (rz)
}

export interface PlacedPiece {
  id: string;
  templateId: string;
  transform: PieceTransform;
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
    // Store all transforms in canonical UE coordinates:
    // position = { x: UE_X, y: UE_Y, z: UE_Z }, rotation = UE yaw.
    // Keep raw precision unchanged so game exports remain immutable.
    const instances: Omit<PlacedPiece, 'id'>[] = (raw.instances ?? []).map(r => ({
      templateId: r.building_type,
      transform: {
        position: { x: r.x, y: r.y, z: r.z },
        rotation: r.rotation,
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
        position: { x: r.x, y: r.y ?? 0, z: r.z },
        rotation: r.ry ?? 0,
        pitch: r.rx ?? 0,
        roll: r.rz ?? 0,
      },
      faction: 'Generic',
      category: 'Decoration',
      ...(scaleMap.has(i) ? { scale: scaleMap.get(i) } : {}),
    }));

    set({ pieces: withIds([...instances, ...placeables]) });
  },

  exportBlueprint: () => {
    const pieces = get().pieces;

    // Admin tool format: write canonical UE coordinates directly.
    const instances = pieces
      .filter(p => !p.templateId.endsWith(PLACEABLE_SUFFIX))
      .map(p => ({
        building_type: p.templateId,
        x: p.transform.position.x,
        y: p.transform.position.y,
        z: p.transform.position.z,
        rotation: p.transform.rotation,
      }));

    // Placeables export full UE rotator fields (rx, ry, rz).
    const placeables = pieces
      .filter(p => p.templateId.endsWith(PLACEABLE_SUFFIX))
      .map(p => ({
        building_type: p.templateId,
        x: p.transform.position.x,
        y: p.transform.position.y,
        z: p.transform.position.z,
        rx: p.transform.pitch ?? 0,
        ry: p.transform.rotation,
        rz: p.transform.roll ?? 0,
      }));

    return { instances, placeables };
  },
}));
