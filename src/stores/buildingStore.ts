import { create } from 'zustand';
import type { Transform } from '../engine/GridSystem';
import { getDefaultBasePieces } from '../data/defaultBase';

export interface PlacedPiece {
  id: string;
  templateId: string;
  transform: Transform;
  faction: string;
  category: string;
}

// Export format matching the dune-admin Go tool's JSON schema.
// Import reads named fields directly into the DB transform array:
//   instances:  ARRAY[x, y, z, rotation]  (x=PSV[0]=UE_X, y=PSV[1]=UE_Y)
//   placeables: ARRAY[x, y, z, rx, ry, rz]
export interface BlueprintExport {
  instances: { building_type: string; x: number; y: number; z: number; rotation: number }[];
  placeables: { building_type: string; x: number; y: number; z: number; rx: number; ry: number; rz: number }[];
}

interface BuildingState {
  pieces: PlacedPiece[];
  loadDefaultBase: () => void;
  exportBlueprint: () => BlueprintExport;
}

function withIds(pieces: Omit<PlacedPiece, 'id'>[]): PlacedPiece[] {
  return pieces.map((p, i) => ({ ...p, id: `p_${i}` }));
}

const PLACEABLE_SUFFIX = '_Placeable';

export const useBuildingStore = create<BuildingState>()((set, get) => ({
  pieces: withIds(getDefaultBasePieces()),

  loadDefaultBase: () => {
    if (get().pieces.length === 0) {
      set({ pieces: withIds(getDefaultBasePieces()) });
    }
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
