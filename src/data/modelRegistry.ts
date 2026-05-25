// Extra rotation offset (degrees) applied on top of the standard +90° correction,
// for pieces whose model orientation differs from the wall-facing convention.
// Simple per-templateId extra rotation (degrees) applied on top of base +90°.
export const EXTRA_ROTATION: Partial<Record<string, number>> = {
  Atreides_Outpost_Wall_02: 180, // exterior face on -Z
  Atreides_Outpost_Wall_04: 180, // exterior face on -Z
  Atreides_Outpost_Wall_Half: 180, // exterior face on -Z
  // Atreides_Outpost_Stairs_Half: 180, // front face on -Z
  Atreides_Outpost_Passageway: 180, // front face on -Z
  MTX_Atreides_Outpost_Bookshelf: 180,
  WindTurbineDirectional_Placeable: -90,
  LargeWindtrap_Placeable: -90,
  LargeOreRefinery_Placeable: -90,
  LargeSpiceRefinery_Placeable: 180,
  MediumChemicalRefinery_Placeable: 180,
  Advanced_VehiclesFabricator_Placeable: 180,
  RepairStation_Placeable: 180,
  LargeWaterCistern_Placeable: 180,
  Atreides_Outpost_Foundation_Wedge: 60,
  Harkonnen_Outpost_Foundation_Wedge: 60,
  Choam_Shelter_Foundation_Wedge_New: 60,
  Choam_Level2_Foundation_Wedge: 60,
  MTX_Neut_DesertMechanic_Foundation_Wedge: 60,
  MTX_Smug_Foundation_Wedge: 60,
};

// ── Rotation patterns ─────────────────────────────────────────────────────────
// N/S faces (stored ±90) need +180° vs E/W faces (stored 0/180) — caused by the
// x↔y position axis swap in loadFromRaw not being matched by a rotation swap.
export type RotMap = Partial<Record<number, number>>;

// Triangle wedges, inclined walls: N/S ±90 → flip 180°; E/W 0/180 → no change.
const NS_FLIP: RotMap = { 0: 0, 90: 180, 180: 0, [-90]: 180 };
// L-corner pieces: E/W faces → +90°; N/S faces → −90° (reversed sense).
const CORNER_SWAP: RotMap = { 0: 90, 90: -90, 180: 90, [-90]: 180 };
// Partial round-corner & railing corners: only 180°/−90° faces need correction.
const PARTIAL_CORNER: RotMap = { [180]: 90, [-90]: -90, [90]: -90, [0]: 90 };
// Rooftops, stairs, select walls: both front/back faces (0°/180°) need +180°.
const FB_FLIP: RotMap = { [0]: 180, [180]: 180 };
// Ramps: 0° → +180°; 180° → −180° (opposite sign keeps ramp slope direction).
const RAMP_FLIP: RotMap = { [0]: 180, [180]: 180 };
// Inclined railings: both N/S faces need +180°; E/W faces are fine.
const NS_INCLINED: RotMap = { [90]: 180, [-90]: 180 };

function group(ids: string[], pattern: RotMap): Array<[string, RotMap]> {
  return ids.map((id) => [id, pattern]);
}

// Per-stored-rotation extras for pieces whose offset depends on which face they're on.
export const ROTATION_BY_STORED: Partial<Record<string, RotMap>> = Object.fromEntries([
  // MTX_Neut_DesertMechanic_Window_01 gets a merged entry below (FB_FLIP + pending non-90° keys)
  // Triangle wedges — all factions (NS_FLIP)
  ...group(
    [
      // Atreides (Floor_Triangle_Wide_* get overriding entries below)
      "Atreides_Outpost_Wall_Triangle_Bottom_Half_Left",
      "Atreides_Outpost_Wall_Triangle_Bottom_Half_Right",
      "Atreides_Outpost_Wall_Triangle_Top_Left",
      "Atreides_Outpost_Wall_Triangle_Top_Half_Left",
      "Atreides_Outpost_Wall_Triangle_Top_Half_Right",
      "Atreides_Outpost_Wall_Triangle_Top_Wide_Left",
      "Atreides_Outpost_Wall_Triangle_Top_Wide_Right",
      // Choam Level2 (Bottom_Half_Left, Bottom_Half_Right, Top_Half_Right get overriding entries below)
      "Choam_Level2_Wall_Triangle_Bottom_Left",
      "Choam_Level2_Wall_Triangle_Bottom_Right",
      "Choam_Level2_Wall_Triangle_Top_Right",
      "Choam_Level2_Wall_Triangle_Top_Half_Left",
      // Choam Shelter (New)
      "Choam_Shelter_Wall_Triangle_Bottom_Left_New",
      "Choam_Shelter_Wall_Triangle_Bottom_Right_New",
      "Choam_Shelter_Wall_Triangle_Bottom_Half_Left_New",
      "Choam_Shelter_Wall_Triangle_Bottom_Half_Right_New",
      "Choam_Shelter_Wall_Triangle_Top_Left_New",
      "Choam_Shelter_Wall_Triangle_Top_Right_New",
      "Choam_Shelter_Wall_Triangle_Top_Half_Left_New",
      "Choam_Shelter_Wall_Triangle_Top_Half_Right_New",
      // Harkonnen
      "Harkonnen_Outpost_Wall_Triangle_Bottom_Left",
      "Harkonnen_Outpost_Wall_Triangle_Bottom_Right",
      "Harkonnen_Outpost_Wall_Triangle_Bottom_Half_Left",
      "Harkonnen_Outpost_Wall_Triangle_Bottom_Half_Right",
      "Harkonnen_Outpost_Wall_Triangle_Top_Left",
      "Harkonnen_Outpost_Wall_Triangle_Top_Right",
      "Harkonnen_Outpost_Wall_Triangle_Top_Half_Right",
      "Harkonnen_Outpost_Wall_Triangle_Top_Half-Left",
      // MTX Choam TwitchReward
      "MTX_Choam_TwitchReward_Triangle_Bottom_Left",
      "MTX_Choam_TwitchReward_Triangle_Bottom_Right",
      "MTX_Choam_TwitchReward_Triangle_Top_Left",
      "MTX_Choam_TwitchReward_Triangle_Top_Right",
      "MTX_Choam_TwitchReward_Half_Triangle_Bottom_Left",
      "MTX_Choam_TwitchReward_Half_Triangle_Bottom_Right",
      "MTX_Choam_TwitchReward_Half_Triangle_Top_Left",
      "MTX_Choam_TwitchReward_Half_Triangle_Top_Right",
      // MTX DesertMechanic
      "MTX_Neut_DesertMechanic_Wall_Triangle_Bottom_Left",
      "MTX_Neut_DesertMechanic_Wall_Triangle_Bottom_Right",
      "MTX_Neut_DesertMechanic_Wall_Triangle_Top_Left",
      "MTX_Neut_DesertMechanic_Wall_Triangle_Top_Right",
      // MTX Smug
      "MTX_Smug_Wall_Triangle_Bottom_Left",
      "MTX_Smug_Wall_Triangle_Bottom_Left_Half",
      "MTX_Smug_Wall_Triangle_Bottom_Right",
      "MTX_Smug_Wall_Triangle_Bottom_Right_Half",
      "MTX_Smug_Wall_Triangle_Top_Left",
      "MTX_Smug_Wall_Triangle_Top_Left_Half",
      "MTX_Smug_Wall_Triangle_Top_Right",
      "MTX_Smug_Wall_Triangle_Top_Right_Half",
    ],
    NS_FLIP,
  ),
  // L-corner floor/wall pieces (CORNER_SWAP) — Half and 03 get overriding merged entries below
  ...group(
    [
      "Atreides_Outpost_Floor_Round_Corner_Inverted",
    ],
    CORNER_SWAP,
  ),
  // Round corners — all factions (PARTIAL_CORNER)
  // Atreides_Outpost_Floor_Round_Corner and Harkonnen_Outpost_Floor_Round_Corner get merged entries below
  ...group(
    [
      "Atreides_Outpost_Railing_Round_Corner",
      "Choam_Shelter_Floor_Round_Corner_Inverted_New",
      "Choam_Shelter_Railing_Round_Corner_New",
      "Choam_Shelter_Wall_Round_Corner_Half_New",
      "MTX_Atre_BreakfastRoom_FloorRoundCorner",
      "MTX_Atre_BreakfastRoom_WallRoundCorner",
      "MTX_Choam_TwitchReward_Floor_Round",
      "MTX_Smug_Floor_Round_Corner",
      "MTX_Smug_Floor_Round_Corner_Inverted",
      "MTX_Smug_Railing_Round_Corner",
      "MTX_Smug_Wall_Round_Corner_02",
      "MTX_Smug_Wall_Round_Corner_Half",
      "MTX_Smug_Ramp_Corner",
      "MTX_Smug_Ramp_Corner_Half",
      "MTX_Smug_Ramp_Corner_Inverted",
    ],
    PARTIAL_CORNER,
  ),
  // Rooftops, stairs, select walls — verified (FB_FLIP)
  ...group(
    [
      "Harkonnen_Outpost_Roof_01",
      "MTX_Neut_DesertMechanic_Rooftop",
      "MTX_Neut_DesertMechanic_Staircase",
      // MTX_Neut_DesertMechanic_Wall excluded — merged individual entry below includes extra non-90° keys
      "MTX_Smug_Stairs",
      "MTX_Neut_Gunner_Railing_01",
      "Watershippers_Railing",
      "Choam_Level2_Window_01",
      "Choam_Shelter_Window",
    ],
    FB_FLIP,
  ),
  // Ramps — verified Smug only; other factions need visual testing (RAMP_FLIP)
  ...group(
    [
      "MTX_Smug_Ramp",
      "MTX_Smug_Ramp_Half",
      "MTX_Smug_Ramp_Stairs_Half",
      "MTX_Smug_Ramp_Corner",
      "MTX_Smug_Ramp_Corner_Half",
      "MTX_Smug_Ramp_Corner_Inverted",
      "MTX_Smug_Stairs_Half",
      "Choam_Level2_Ramp",
      "Choam_Shelter_Ramp",
    ],
    RAMP_FLIP,
  ),
  ...group(["MTX_Smug_Ramp_Corner_Inverted", "MTX_Neut_DesertMechanic_Rooftop_Corner_Inverted"], { [-90]: -90, [180]: 90 }),
  ...group(
    [
      "Harkonnen_Outpost_Roof_Corner",
      "MTX_Neut_DesertMechanic_Rooftop_Corner",
      "MTX_Smug_Ramp_Corner_Inverted_Half",
      "MTX_Smug_Ramp_Corner_Half",
    ],
    { [0]: 90, [90]: -90, [-90]: 270, [180]: 90 },
  ),
  // Inclined railings — all factions (NS_INCLINED)
  // Atreides_Outpost_Railing_Inclined gets a merged entry below
  ...group(
    [
      "Atreides_Outpost_Railing_Inclined_Half",
      "Choam_Level2_Railing_Inclined",
      "Choam_Level2_Railing_Inclined_Half",
      "Choam_Shelter_Railing_Inclined",
      "Choam_Shelter_Railing_Inclined_New",
      "Choam_Shelter_Railing_Inclined_Half_New",
      "Harkonnen_Outpost_Railing_Inclined",
      "MTX_Choam_TwitchReward_Railing_Inclined",
      "MTX_Smug_Railing_Inclined_Left",
      "MTX_Smug_Railing_Inclined_Half_Left",
      "MTX_Smug_Railing_Inclined_Right",
      "MTX_Smug_Railing_Inclined_Right_Half",
    ],
    NS_INCLINED,
  ),
  // Atreides_Outpost_Railing: base 90°-step keys merged with non-90° pending keys
  ["Atreides_Outpost_Railing", { 0: 180, 90: 0, 180: 180, [-90]: 0, [30]: 120, [60]: 60, [120]: 120, [150]: 60, [-30]: 60, [-60]: -60, [-120]: 60, [-150]: 120 }],
  ["Atreides_Outpost_Wall_Inclined_Wide_Left",  { [0]: 142.5, [90]: -37.5, [180]: -37.5, [-90]: -37.5 }],
  ["Atreides_Outpost_Wall_Inclined_Wide_Right", { [0]: -142.5, [90]: 37.5, [180]: 37.5, [-90]: 37.5 }],
  // Pieces from named groups that need extra keys merged in (last-write-wins):
  // CORNER_SWAP group overrides
  ["Atreides_Outpost_Wall_Round_Corner_Half",   { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Wall_Round_Corner_03",     { [0]: 90, [90]: -90, [180]: 90, [-90]: -90, [150]: 150 }],
  // PARTIAL_CORNER group overrides
  ["Atreides_Outpost_Floor_Round_Corner",       { [180]: 90, [-90]: -90, [90]: -90, [0]: 90, [150]: 150 }],
  ["Harkonnen_Outpost_Floor_Round_Corner",      { [180]: 90, [-90]: -90, [90]: -90, [0]: 90, [-30]: 150 }],
  // NS_FLIP group overrides (Floor_Triangle_Wide_* fully replaced by pending map)
  ["Atreides_Outpost_Floor_Triangle_Wide_Right", { [0]: 180, [90]: 0, [180]: 180, [-90]: 0 }],
  ["Atreides_Outpost_Floor_Triangle_Wide_Left",  { [0]: 180, [90]: 0, [180]: 180, [-90]: 0 }],
  ["Atreides_Outpost_Wall_Triangle_Bottom_Right", { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [-60]: 120 }],
  ["Atreides_Outpost_Wall_Triangle_Bottom_Left",  { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [120]: 120 }],
  ["Atreides_Outpost_Wall_Triangle_Top_Right",    { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [-150]: -60 }],
  ["Choam_Level2_Wall_Triangle_Bottom_Half_Left",  { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [-150]: -60 }],
  ["Choam_Level2_Wall_Triangle_Bottom_Half_Right", { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [-30]: 60 }],
  ["Choam_Level2_Wall_Triangle_Top_Half_Right",    { [0]: 0, [90]: 180, [180]: 0, [-90]: 180, [60]: 60, [120]: -60 }],
  // NS_INCLINED group override
  ["Atreides_Outpost_Railing_Inclined",         { [90]: 180, [-90]: 180, [120]: 120, [150]: 52.5, [-150]: -60 }],
  // FB_FLIP group override (MTX_Neut_DesertMechanic_Window_01)
  ["MTX_Neut_DesertMechanic_Window_01",         { [0]: 180, [180]: 180, [30]: 120, [150]: -120 }],
  // Pieces not previously in ROTATION_BY_STORED — all new individual entries:
  ["Atreides_Outpost_Floor_Round_Corner_Inverted", { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Roof_Cover_Top_Half_Left",  { [30]: -60, [150]: 52.5, [-30]: 60, [-60]: 120, [-90]: 180 }],
  ["Atreides_Outpost_Roof_Cover_Top_Half_Right", { [60]: -120, [150]: 67.5, [-90]: 180 }],
  ["Atreides_Outpost_Stairs_Half",               { [0]: 180, [90]: 0, [180]: 180 }],
  ["MTX_Neut_DesertMechanic_Ramp",               { [0]: 180, [180]: 180 }],
  ["Choam_Level2_Stairs_Corner_Inward",          { [180]: 90 }],
  ["Choam_Level2_Rooftop_Wedge",                 { [-120]: 180 }],
  ["Choam_Level2_Ramp_Half",                     { [180]: 180 }],
  ["Choam_Level2_Roof_Corner_Half_Inward",       { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Choam_Level2_Roof_Corner_Half",              { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Choam_Level2_Stairs_Half",                   { [0]: 180 }],
  ["Choam_Level2_Stairs",                        { [0]: 180 }],
  ["Atreides_Outpost_Foundation_Round_Corner",   { [0]: 90, [90]: -90, [-90]: -90 }],
  ["Atreides_Outpost_Wall_Round_Corner_02",      { [0]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Stairs",                    { [0]: 180, [180]: 180, [-60]: -60, [-120]: 60 }],
  ["Atreides_Outpost_Roof_Cover_Bottom_Half_Right", { [60]: -120, [90]: 180, [150]: 67.5, [-90]: 180 }],
  ["Atreides_Outpost_Roof_Cover_Bottom_Half_Left",  { [30]: -60, [90]: 180, [-30]: 52.5, [-60]: 120, [-90]: 180, [-120]: -120 }],
  ["Atreides_Outpost_Roof_Round_Corner_Half",    { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Roof_Half",                 { [0]: 180, [150]: -120, [180]: 180 }],
  ["Atreides_Outpost_Roof_Corner_Half",          { [0]: 90, [60]: -30, [90]: -90, [150]: 150, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Roof_Corner_Half_Inward",   { [0]: 90, [90]: -90 }],
  ["Atreides_Outpost_Ramp",                      { [0]: 180, [180]: 180, [-150]: 120 }],
  ["Atreides_Outpost_Ramp_Wide",                 { [0]: 180, [180]: 180 }],
  ["Atreides_Outpost_Floor_Wedge",               { [0]: 60, [60]: 60, [120]: 60, [180]: 60, [-120]: 60, [-60]: 60, [-150]: 0 }],
  ["Atreides_Outpost_Pillar_Top",                { [180]: 15 }],
  ["Atreides_Outpost_Foundation",                { [30]: 30, [60]: 150, [120]: 30, [-150]: 30, [-60]: 30 }],
  ["Atreides_Outpost_Wall_01",                   { [0]: 180, [180]: 180, [30]: 120, [120]: -60, [150]: -120, [-150]: 120, [-30]: -120 }],
  ["Atreides_Outpost_Ramp_Corner",               { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Ramp_Corner_Inward",        { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Ramp_Corner_Half",          { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Ramp_Corner_Half_Inward",   { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Atreides_Outpost_Stair_Wide",                { [0]: 180, [180]: 180 }],
  ["MTX_Atre_BreakfastRoom_Floor",               { [0]: 0 }],
  ["Atreides_Outpost_Ramp_Edge_Wide_Right",      { [0]: 180, [90]: 0, [180]: 180, [-90]: 0 }],
  ["Atreides_Outpost_Ramp_Edge_Wide_Left",       { [0]: 180, [90]: 0, [180]: 180 }],
  ["Atreides_Outpost_Ramp_Half",                 { [0]: 180, [180]: 180 }],
  ["Atreides_Outpost_Rooftop_Wedge",             { [0]: 60, [60]: 60, [-60]: 60, [-120]: 60 }],
  ["Atreides_Outpost_Window_04",                 { [120]: 120, [150]: 60, [-120]: 60, [-150]: -60 }],
  ["Atreides_Outpost_Window_01",                 { [120]: 120, [150]: 60, [-120]: 60, [-150]: 120 }],
  ["Atreides_Outpost_Rooftop_02",                { [-150]: 30, [-30]: -30, [-60]: 30 }],
  ["MTX_Atreides_Outpost_FloorLight_Movie",      { [30]: 30, [60]: 60, [120]: 30, [150]: 60 }],
  ["Atreides_Outpost_Floor",                     { [0]: 0, [30]: 30, [60]: 60, [150]: 60, [-60]: 30, [-30]: -30, [-120]: 60 }],
  ["MTX_Atre_BreakfastRoom_Wall_01",             { [0]: 180, [180]: 180, [30]: -60, [-30]: 60 }],
  ["Atreides_Outpost_Wall_Half",                 { [0]: 0, [90]: 0, [-90]: 0, [60]: 60, [150]: 60, [-60]: 120, [-120]: 67.5 }],
  // Foundation_Wedge pieces use EXTRA_ROTATION (constant +60° at all rotations)
  ["Atreides_Outpost_Rooftop_Round_Corner",      { [150]: 150 }],
  ["MediumOreRefinery_Placeable",                { [0]: -90, [90]: 90 }],
  ["SmallChemicalRefinery_Placeable",            { [0]: 180 }],
  ["VehiclesFabricator_Placeable",               { [180]: 180 }],
  ["Atre_CouchCorner_In_1_Placeable",            { [-45]: -135 }],
  ["Atre_Couch_1_Placeable",                     { [0]: 180, [-90]: 180 }],
  ["Atre_Chair_2_Placeable",                     { [5]: 180, [145]: 157.5, [180]: 180, [-150]: 180 }],
  ["Atre_Chair_1_Placeable",                     { [50]: 172.5 }],
  ["Harkonnen_Outpost_Floor_Wedge",              { [0]: 60, [60]: 60, [-60]: -60 }],
  ["Atreides_Outpost_Window_03",                 { [60]: 60, [-60]: 120 }],
  ["Atreides_Outpost_Window_02",                 { [60]: 60, [-30]: 60, [-60]: 120, [-90]: 0 }],
  ["Atreides_Outpost_Roof_Wedge_Top_Half",       { [180]: 180 }],
  ["Atreides_Outpost_Roof_Wedge_Bottom_Half",    { [0]: 180 }],
  ["Atreides_Outpost_Wall_04",                   { [60]: 60, [-60]: 120 }],
  ["MTX_Atreides_Outpost_Window_Movie",          { [60]: 60, [-30]: 60 }],
  ["MTX_Choam_TwitchReward_Railing_01",          { [150]: 60 }],
  ["Atreides_Outpost_Rooftop_Round_Corner_Inverted", { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["MTX_Choam_TwitchReward_Stairs",              { [180]: 180 }],
  ["Atreides_Outpost_Passageway",                { [-30]: 60 }],
  // Additional rotation fixes — promoted from user dev-mode session.
  ["Harkonnen_Outpost_Wall_Round_Corner_03",     { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["MTX_Choam_TwitchReward_Roof_Half",           { [180]: 180 }],
  ["Choam_Shelter_Roof_Cover_Bottom_Half_Right", { [-90]: 180 }],
  ["Choam_Shelter_Roof_Cover_Bottom_Half_Left",  { [90]: 180 }],
  ["Choam_Shelter_Wall_02",                      { [180]: 180 }],
  ["MTX_Smug_Railing",                           { [0]: 180, [180]: 180, [30]: -60, [150]: 60, [-30]: 60, [-150]: -67.5 }],
  ["Watershippers_Wall_01",                      { [150]: 60, [-150]: -60 }],
  ["Harkonnen_Outpost_Ramp",                     { [0]: 180, [180]: 180 }],
  ["Choam_Shelter_Roof_Corner_Half",             { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Choam_Level2_Roof_Round_Corner_Half",        { [90]: -90, [180]: 90 }],
  ["MTX_Neut_DesertMechanic_Railing",            { [30]: -60, [150]: 67.5, [-150]: -60, [-30]: 60, [-90]: 0 }],
  ["MTX_Smug_Wall_Round_Corner_01",              { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["Watershippers_Window_01",                    { [0]: 180, [180]: 180 }],
  ["Watershippers_Ramp",                         { [0]: 180, [180]: 180 }],
  ["MTX_Neut_DesertMechanic_Wall",               { [0]: 180, [180]: 180, [150]: -120, [-150]: 120 }],
  ["Watershippers_Floor_Round_Corner_01",        { [90]: -90, [180]: 82.5 }],
  ["MTX_Smug_Roof_Corner_Half_01",               { [0]: 90, [90]: -90, [180]: 90, [-90]: -90 }],
  ["MTX_Neut_DesertMechanic_Floor",              { [0]: 0 }],
  ["MTX_Smug_Roof_Round_Corner_Half_02",         { [90]: -90, [180]: 90 }],
  ["MTX_Smug_Wall_Half",                         { [180]: 0 }],
  ["MTX_Smug_Roof_Half_01",                      { [180]: 180 }],
  // New entries from rotation testing session:
  ["Choam_Level2_Wall_02",                       { [0]: 180 }],
  // Choam triangle walls — partial NS_FLIP (E/W keys not yet confirmed)
  ["Choam_Level2_Wall_Triangle_Top_Left",        { [90]: 180, [-90]: 180 }],
  ["Choam_Shelter_Wall_Triangle_Top_Left",       { [90]: 180, [-90]: 180 }],
  ["Choam_Shelter_Wall_Triangle_Top_Right",      { [90]: 180, [-90]: 180 }],
  ["Choam_Shelter_Wall_Triangle_Bottom_Right",   { [-90]: 180 }],
]);

// ── GLB auto-discovery ────────────────────────────────────────────────────────
// Vite resolves all GLBs under src/ to proper asset URLs at build time.
// Keys are the import paths; values are the served URLs.
const ALL_GLBS = import.meta.glob<string>("/src/**/*.glb", { query: "?url", import: "default", eager: true });

// lowercase filename stem (no extension) → URL
const GLB_BY_STEM = new Map<string, string>(
  Object.entries(ALL_GLBS).map(([path, url]) => [path.split("/").pop()!.slice(0, -4).toLowerCase(), url]),
);

// Explicit stem overrides for templateIds whose names differ from their files.
// Only needed for the Atreides structural pieces (Atreides_ → Atre_ in filenames)
// and a handful of renames. Everything else resolves automatically via auto-discovery.
const STEM_OVERRIDES: Record<string, string> = {
  Atreides_Outpost_Foundation: "sm_env_pb_atre_outpost_foundation",
  Atreides_Outpost_Floor: "sm_env_pb_atre_outpost_floor",
  Atreides_Outpost_Floor_Round_Corner_Inverted: "sm_env_pb_atre_outpost_floorroundcorner_inv",
  Atreides_Outpost_Wall_01: "sm_env_pb_atre_outpost_wall_01",
  Atreides_Outpost_Wall_02: "sm_env_pb_atre_outpost_wall_02",
  Atreides_Outpost_Wall_03: "sm_env_pb_atre_outpost_wall_03",
  Atreides_Outpost_Wall_04: "sm_env_pb_atre_outpost_wall_04",
  Atreides_Outpost_Wall_Half: "sm_env_pb_atre_outpost_wall_half",
  Atreides_Outpost_Wall_Round_Corner_Half: "sm_env_pb_atre_outpost_wallroundcorner_half",
  Atreides_Outpost_Wall_Round_Corner_03: "sm_env_pb_atre_outpost_windowroundcorner",
  Atreides_Outpost_Wall_Triangle_Top_Half_Left: "sm_env_pb_atre_outpost_walltrianglettop_half_l",
  Atreides_Outpost_Wall_Triangle_Top_Half_Right: "sm_env_pb_atre_outpost_walltriangletop_half_r",
  Atreides_Outpost_Wall_Triangle_Bottom_Right: "sm_env_pb_atre_outpost_walltrianglebottom_r",
  Atreides_Outpost_Window_03: "sm_env_pb_atre_outpost_window_03",
  Atreides_Outpost_Window_04: "sm_env_pb_atre_outpost_window_04",
  Atreides_Outpost_Ramp: "sm_env_pb_atre_outpost_ramp",
  Atreides_Outpost_Stairs: "sm_env_pb_atre_outpost_stairs",
  Atreides_Outpost_Stairs_Half: "sm_env_pb_atre_outpost_stairs_half",
  Atreides_Outpost_Railing: "sm_env_pb_atre_outpost_railing",
  Atreides_Outpost_Railing_Gate: "sm_env_pb_atre_outpost_railinggate",
  Atreides_Outpost_Railing_Inclined: "sm_env_pb_atre_outpost_railinginclined",
  Atreides_Outpost_Passageway: "sm_env_pb_atre_outpost_passageway",
  Atreides_Outpost_PrudenceDoor_Frame: "sm_env_pb_atre_outpost_doorframe",
  Atreides_Outpost_Column: "sm_env_pb_atre_outpost_column",
  Atreides_Outpost_Roof_Cover_Top_Half_Left: "sm_env_pb_atre_outpost_roofcovertop_half_l",
  MTX_Atreides_Outpost_Bookshelf: "sm_mtx_env_pb_atre_wall_bookshelf",
  MTX_Atre_BreakfastRoom_Floor: "sm_mtx_env_pb_atre_breakfastroom_floor",
  MTX_Smug_Ramp_Corner_Inverted: "sm_player_pb_smug_rampcorner_in",
  MTX_Smug_Ramp_Corner_Inverted_Half: "sm_player_pb_smug_rampcorner_in_half",
};

/**
 * Resolve a templateId to a GLB URL.
 *
 * Resolution order:
 *  1. Explicit STEM_OVERRIDES (for mismatched names like Atreides_ → Atre_)
 *  2. Stem contains the full normalized templateId as a substring
 *  3. Stem contains every token of the normalized templateId
 */
export function resolveGlb(templateId: string): string | undefined {
  // 1. Explicit override
  const overrideStem = STEM_OVERRIDES[templateId];
  if (overrideStem) return GLB_BY_STEM.get(overrideStem);

  // Normalize: strip _Placeable suffix, lowercase, remove underscores for compact match
  const base = templateId.replace(/_Placeable$/i, "").toLowerCase();
  const compact = base.replace(/_/g, "");

  // 2. Compact substring match (handles SM_/BP_ prefix + fused words like RampCorner)
  for (const [stem, url] of GLB_BY_STEM) {
    if (stem.replace(/_/g, "").includes(compact)) return url;
  }

  // 3. All tokens present (handles cases where underscore separators differ)
  const tokens = base.split("_").filter((t) => t.length > 2);
  if (tokens.length) {
    for (const [stem, url] of GLB_BY_STEM) {
      if (tokens.every((t) => stem.includes(t))) return url;
    }
  }

  return undefined;
}
