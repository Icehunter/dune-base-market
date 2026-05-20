// Extra rotation offset (degrees) applied on top of the standard +90° correction,
// for pieces whose model orientation differs from the wall-facing convention.
// Simple per-templateId extra rotation (degrees) applied on top of base +90°.
export const EXTRA_ROTATION: Partial<Record<string, number>> = {
  Atreides_Outpost_Wall_02:       180,  // exterior face on -Z
  Atreides_Outpost_Wall_04:       180,  // exterior face on -Z
  Atreides_Outpost_Wall_Half:     180,  // exterior face on -Z
  Atreides_Outpost_Stairs_Half:   180,  // front face on -Z
  Atreides_Outpost_Passageway:    180,  // front face on -Z
  MTX_Atreides_Outpost_Bookshelf: 180,
};

// Per-stored-rotation extras for pieces whose offset depends on which face they're on.
export const ROTATION_BY_STORED: Partial<Record<string, Partial<Record<number, number>>>> = {
  // L-corner: stored=0/180 (front-back) → +90°; stored=±90 (left-right) → -90° (reversed)
  Atreides_Outpost_Wall_Round_Corner_03:        { 0: 90, 90: -90, 180: 90, [-90]: -90 },
  Atreides_Outpost_Floor_Round_Corner_Inverted: { 0: 90, 90: -90, 180: 90, [-90]: -90 },
  // Triangle wedges: N/S faces (stored ±90) → +180°; E/W faces → 0°
  Atreides_Outpost_Wall_Triangle_Top_Half_Left:  { 0: 0, 90: 180, 180: 0, [-90]: 180 },
  Atreides_Outpost_Wall_Triangle_Top_Half_Right: { 0: 0, 90: 180, 180: 0, [-90]: 180 },
  Atreides_Outpost_Wall_Triangle_Bottom_Right:   { 0: 0, 90: 180, 180: 0, [-90]: 180 },
  // Railing: E/W faces (stored 0/180) need +180° flip; N/S (±90) are fine.
  Atreides_Outpost_Railing:                      { 0: 180, 90: 0, 180: 180, [-90]: 0 },
};

// Maps templateId → served path of the .glb file.
// Files live under src/Dune/ and src/DLC/ and are served by Vite's dev server
// at the same path relative to the project root.

const ATRE = '/src/Dune/Environment/PlayerBuilt/Atre/Outpost/Meshes/';
const MTX_BR = '/src/DLC/MTX/Environment/PlayerBuilt/Atre/BreakfastRoom/Meshes/';
const MTX_MISC = '/src/DLC/MTX/Environment/PlayerBuilt/Atre/Misc/Meshes/';

export const MODEL_PATHS: Record<string, string> = {
  Atreides_Outpost_Foundation:               ATRE + 'SM_Env_PB_Atre_Outpost_Foundation.glb',
  Atreides_Outpost_Floor:                    ATRE + 'SM_Env_PB_Atre_Outpost_Floor.glb',
  Atreides_Outpost_Floor_Round_Corner_Inverted: ATRE + 'SM_Env_PB_Atre_Outpost_FloorRoundCorner_Inv.glb',
  Atreides_Outpost_Wall_01:                  ATRE + 'SM_Env_PB_Atre_Outpost_Wall_01.glb',
  Atreides_Outpost_Wall_02:                  ATRE + 'SM_Env_PB_Atre_Outpost_Wall_02.glb',
  Atreides_Outpost_Wall_03:                  ATRE + 'SM_Env_PB_Atre_Outpost_Wall_03.glb',
  Atreides_Outpost_Wall_04:                  ATRE + 'SM_Env_PB_Atre_Outpost_Wall_04.glb',
  Atreides_Outpost_Wall_Half:                ATRE + 'SM_Env_PB_Atre_Outpost_Wall_Half.glb',
  Atreides_Outpost_Wall_Round_Corner_03:     ATRE + 'SM_Env_PB_Atre_Outpost_WindowRoundCorner.glb',
  Atreides_Outpost_Wall_Triangle_Top_Half_Left:  ATRE + 'SM_Env_PB_Atre_Outpost_WallTriangleTop_Half_L.glb',
  Atreides_Outpost_Wall_Triangle_Top_Half_Right: ATRE + 'SM_Env_PB_Atre_Outpost_WallTriangleTop_Half_R.glb',
  Atreides_Outpost_Wall_Triangle_Bottom_Right:   ATRE + 'SM_Env_PB_Atre_Outpost_WallTriangleBottom_R.glb',
  Atreides_Outpost_Window_03:                ATRE + 'SM_Env_PB_Atre_Outpost_Window_03.glb',
  Atreides_Outpost_Window_04:                ATRE + 'SM_Env_PB_Atre_Outpost_Window_04.glb',
  Atreides_Outpost_Ramp:                     ATRE + 'SM_Env_PB_Atre_Outpost_Ramp.glb',
  Atreides_Outpost_Stairs:                   ATRE + 'SM_Env_PB_Atre_Outpost_Stairs.glb',
  Atreides_Outpost_Stairs_Half:              ATRE + 'SM_Env_PB_Atre_Outpost_Stairs_Half.glb',
  Atreides_Outpost_Railing:                  ATRE + 'SM_Env_PB_Atre_Outpost_Railing.glb',
  Atreides_Outpost_Railing_Gate:             ATRE + 'SM_Env_PB_Atre_Outpost_RailingGate.glb',
  Atreides_Outpost_Railing_Inclined:         ATRE + 'SM_Env_PB_Atre_Outpost_RailingInclined.glb',
  Atreides_Outpost_Passageway:               ATRE + 'SM_Env_PB_Atre_Outpost_Passageway.glb',
  Atreides_Outpost_PrudenceDoor_Frame:       ATRE + 'SM_Env_PB_Atre_Outpost_DoorFrame.glb',
  Atreides_Outpost_Column:                   ATRE + 'SM_Env_PB_Atre_Outpost_Column.glb',
  Atreides_Outpost_Roof_Cover_Top_Half_Left: ATRE + 'SM_Env_PB_Atre_Outpost_RoofCoverTop_Half_L.glb',
  MTX_Atre_BreakfastRoom_Floor:              MTX_BR   + 'SM_MTX_Env_PB_Atre_BreakfastRoom_Floor.glb',
  MTX_Atreides_Outpost_Bookshelf:            MTX_MISC + 'SM_MTX_Env_PB_Atre_Wall_Bookshelf.glb',
};
