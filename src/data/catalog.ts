// Merge layer: generated registry (primary) + manual entries (fallback) + inference.
// Import from here instead of pieces.ts or pieceRegistry.generated.ts.
import { PIECE_CATALOG as GENERATED, MODEL_PATHS as GENERATED_PATHS } from './pieceRegistry.generated';
import { inferPieceDefinition } from './pieces';
export type { PieceDefinition } from './pieces';

// CDN base URL — set VITE_CDN_BASE_URL at build time (e.g. https://cdn.layout.tools/dune).
// Falls back to serving from the local dev server's /src/... paths.
const CDN_BASE = import.meta.env.VITE_CDN_BASE_URL ?? '';

// All raw paths start with /src/. In production strip that prefix and prepend the CDN base.
function cdnPath(localPath: string): string {
  if (!CDN_BASE) return localPath;
  return CDN_BASE + localPath.replace(/^\/src/, '');
}

function cdnPaths(paths: Record<string, string>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(paths)) out[k] = cdnPath(v);
  return out;
}

// Placeable GLB paths — matched from Props folder structure.
// Path prefixes
const AP  = '/src/Dune/Environment/Props/Atre/';
const CP  = '/src/Dune/Environment/Props/Choam/';
const HP  = '/src/Dune/Environment/Props/Hark/';
const FP  = '/src/Dune/Environment/Props/Frem/';
const MAP = '/src/DLC/MTX/Environment/Props/Atre/';
const MNP = '/src/DLC/MTX/Environment/Props/Neut/';

const PLACEABLE_PATHS: Record<string, string> = {
  // ── Pentashields ──────────────────────────────────────────────────────────
  Choam_PentashieldSurfaceVertical_Placeable:   '/src/Dune/Effects/Abilities/Pentashield/SM_Ecolab_Pentashield.glb',
  Choam_PentashieldSurfaceHorizontal_Placeable: '/src/Dune/Effects/Abilities/Pentashield/SM_Ecolab_Pentashield_Horizontal.glb',

  // ── Atreides furniture ────────────────────────────────────────────────────
  Atre_Banner_Placeable:             AP + 'WallBanners/Meshes/SM_Env_Prop_Atre_Banner.glb',
  Atre_Bed_Placeable:                AP + 'Bed/Meshes/SM_Env_Prop_Atre_Bed.glb',
  Atre_Carpet_01_Placeable:          AP + 'Carpet/Meshes/SM_Env_Prop_Atre_Carpet_01.glb',
  Atre_Carpet_02_Placeable:          AP + 'Carpet/Meshes/SM_Env_Prop_Atre_Carpet_02.glb',
  Atre_Chair_1_Placeable:            AP + 'Chair/Meshes/SM_Env_Prop_Atre_Chair_01.glb',
  Atre_Chair_2_Placeable:            AP + 'Chair/Meshes/SM_Env_Prop_Atre_Chair_02.glb',
  Atre_Chandelier_Placeable:         AP + 'Lights/Meshes/SM_Env_Prop_Atre_Chandelier.glb',
  Atre_Couch_1_Placeable:            AP + 'Couch/Meshes/SM_Env_Prop_Atre_Couch.glb',
  Atre_CouchCorner_In_1_Placeable:   AP + 'Couch/Meshes/SM_Env_Prop_Atre_CouchCorner_In.glb',
  Atre_Deco_Books_01_Placeable:      AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Books_01.glb',
  Atre_Deco_Books_02_Placeable:      AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Books_02.glb',
  Atre_Deco_Books_03_Placeable:      AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Books_03.glb',
  Atre_Deco_Glass_Carafe_Placeable:  AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Glass_Carafe.glb',
  Atre_Deco_Glass_Cup_Placeable:     AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Glass_Cup_01.glb',
  Atre_Deco_Glass_SpiceJar_Placeable:AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Glass_Spicejar.glb',
  Atre_Deco_Hologram_Placeable:      AP + 'Projector/Meshes/SM_Env_Prop_Atre_Projector_Hologram_01.glb',
  Atre_Deco_Plate_01_Placeable:      AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Plate_01.glb',
  Atre_Deco_Plate_02_Placeable:      AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Plate_02.glb',
  Atre_Deco_Trophy_01_Placeable:     AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Trophy_01.glb',
  Atre_Deco_Vase_01_C_Placeable:     AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Vase_01_C.glb',
  Atre_Deco_Vase_02_A_Placeable:     AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Vase_02_A.glb',
  Atre_Deco_Vase_02_B_Placeable:     AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_Vase_02_B.glb',
  Atre_DiningTable_Placeable:        AP + 'Table/Meshes/SM_Env_Prop_Atre_DinnerTable.glb',
  Atre_LightCeiling_Placeable:       AP + 'Lights/Meshes/SM_Env_Prop_Atre_LightCeiling.glb',
  Atre_LightFloor_Placeable:         AP + 'Lights/Meshes/SM_Env_Prop_Atre_LightFloor.glb',
  Atre_LightWall_Placeable:          AP + 'Lights/Meshes/SM_Env_Prop_Atre_LightWall.glb',
  Atre_OfficeTable_Placeable:        AP + 'Table/Meshes/SM_Env_Prop_Atre_OfficeTable.glb',
  Atre_PlateDeco_Placeable:          AP + 'Deco/Meshes/SM_Env_Prop_Atre_Deco_WallPlate_01.glb',
  Atre_Shelves_01_Placeable:         AP + 'Shelves/Meshes/SM_Env_Prop_Atre_Shelves_01.glb',
  Atre_SideTable_Placeable:          AP + 'Table/Meshes/SM_Env_Prop_Atre_SideTable.glb',
  Atre_SmallStorageDrawer_Placeable: AP + 'Closet/Meshes/SM_Env_Prop_Atre_Drawer.glb',
  Atre_StandingLight_02_Placeable:   AP + 'Lights/Meshes/SM_Env_Prop_Atre_StandingLight_02.glb',
  Atre_WallPartition_Placeable:      AP + 'WallPartition/Meshes/SM_Env_Prop_Atre_WallPartition.glb',
  Atre_Wardrobe_Placeable:           AP + 'Closet/Meshes/SM_Env_Prop_Atre_Closet.glb',

  // ── CHOAM furniture & equipment ───────────────────────────────────────────
  Choam_Banner_Placeable:            CP + 'WallBanners/Meshes/SM_Env_Prop_Choam_Banner.glb',
  Choam_Carpet_02_Placeable:         CP + 'Carpet/Meshes/SM_Env_Prop_Choam_Carpet_02.glb',
  Choam_Chair_1_Placeable:           CP + 'Chair/Meshes/SM_Env_Prop_Choam_Chair_01.glb',
  Choam_Deco_Books_01_Placeable:     CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Books_01.glb',
  Choam_Deco_Books_02_Placeable:     CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Books_02.glb',
  Choam_Deco_Books_03_Placeable:     CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Books_03.glb',
  Choam_Deco_Carafe_Placeable:       CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Carafe.glb',
  Choam_Deco_Cup_02_Placeable:       CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Cup_02.glb',
  Choam_Deco_Hologram_Placeable:     CP + 'Projector/Meshes/SM_Env_Prop_Choam_Projector_Hologram_01.glb',
  Choam_Deco_Plate_02_Placeable:     CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Plate_02.glb',
  Choam_Deco_Trophy_Placeable:       CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Trophy.glb',
  Choam_Deco_Vase_01A_Placeable:     CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_Vase_01_A.glb',
  Choam_LightCeiling_01_Placeable:   CP + 'Lights/Meshes/SM_Env_Prop_Choam_LightCeiling.glb',
  Choam_LightCeiling_02_Placeable:   CP + 'Lights/Meshes/SM_Env_Prop_Choam_Light_Interior_02.glb',
  Choam_LightWall_Placeable:         CP + 'Lights/Meshes/SM_Env_Prop_Choam_LightWall.glb',
  Choam_OfficeTable_Placeable:       CP + 'Table/Meshes/SM_Env_Prop_Choam_OfficeTable.glb',
  Choam_Shelves_01_Placeable:        CP + 'Shelves/Meshes/SM_Env_Prop_Choam_Shelves.glb',
  Choam_SideTable_Placeable:         CP + 'Table/Meshes/SM_Env_Prop_Choam_SideTable.glb',
  Choam_StandingLight_02_Placeable:  CP + 'Lights/Meshes/SM_Env_Prop_Choam_StandingLight_02.glb',
  Choam_WallArt_01_Placeable:        CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_WallArt_01.glb',
  Choam_WallArt_02_Placeable:        CP + 'Deco/Meshes/SM_Env_Prop_Choam_Deco_WallArt_02.glb',
  Choam_WallPartition_Placeable:     CP + 'WallPartition/Meshes/SM_Env_Prop_Choam_WallPartition.glb',
  Choam_Wardrobe_Placeable:          CP + 'Wardrobe/Meshes/SM_Env_Prop_Choam_Wardrobe.glb',

  // ── Harkonnen furniture ───────────────────────────────────────────────────
  Hark_Deco_Books_02_Placeable:      HP + 'Deco/Meshes/SM_Env_Prop_Hark_Deco_Books_02.glb',
  Hark_Deco_Books_03_Placeable:      HP + 'Deco/Meshes/SM_Env_Prop_Hark_Deco_Books_03.glb',
  Hark_SideTable_Placeable:          HP + 'Table/Meshes/SM_Env_Prop_Hark_SideTable.glb',
  Hark_StandingLight_01_Placeable:   HP + 'Lights/Meshes/SM_Env_Prop_Hark_StandingLight_01.glb',

  // ── CHOAM functional buildings ────────────────────────────────────────────
  Fabricator_Placeable:                    CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Survival.glb',
  SurvivalFabricator_Placeable:            CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Survival.glb',
  Advanced_SurvivalFabricator_Placeable:   CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Survival_Advanced_Base.glb',
  WeaponsFabricator_Placeable:             CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Weapons.glb',
  AdvancedWeaponsFabricator_Placeable:     CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Weapons_Advanced.glb',
  VehiclesFabricator_Placeable:            CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Vehicles.glb',
  Advanced_VehiclesFabricator_Placeable:   CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Vehicles_Large.glb',
  WearablesFabricator_Placeable:           CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Wearables.glb',
  AdvancedWearablesFabricator_Placeable:   CP + 'Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Wearables_Advandced.glb',
  Generator_Placeable:                     CP + 'PowerGeneration/PowerGenerator/Meshes/SM_Env_Prop_Choam_PowerGenerator.glb',
  Recycler_Placeable:                      CP + 'Recycler/Meshes/SM_Env_Prop_Choam_Recycler.glb',
  RepairStation_Placeable:                 CP + 'RepairStation/Meshes/SM_Env_Prop_Choam_RepairStation.glb',
  StorageContainer_Placeable:              CP + 'Containers/Meshes/SM_Env_Prop_Choam_StorageContainer_Small.glb',
  MediumStorageContainer_Placeable:        CP + 'Containers/Meshes/SM_Env_Prop_Choam_StorageContainer_Medium.glb',
  LargeWaterCistern_Placeable:             CP + 'WaterCistern/Meshes/SM_Env_Prop_Choam_WaterCistern_Large.glb',
  MediumWaterCistern_Placeable:            CP + 'WaterCistern/Meshes/SM_Env_Prop_Choam_WaterCistern_Medium.glb',
  SpiceRefinery_Placeable:                 CP + 'SpiceRefinery/Meshes/SM_Env_Props_Choam_SpiceRefinery.glb',
  LargeSpiceRefinery_Placeable:            CP + 'SpiceRefinery/Meshes/SM_Env_Prop_Choam_SpiceRefinery_Large.glb',
  LargeOreRefinery_Placeable:              CP + 'OreRefinery/Meshes/SM_Env_Prop_Choam_OreRefinery_Large.glb',
  MediumOreRefinery_Placeable:             CP + 'OreRefinery/Meshes/SM_Env_Prop_Choam_OreRefinery_01.glb',
  SmallChemicalRefinery_Placeable:         CP + 'ChemicalRefinery/Meshes/SM_Env_Prop_Choam_ChemicalRefinery_Small.glb',
  MediumChemicalRefinery_Placeable:        CP + 'ChemicalRefinery/Meshes/SM_Env_Prop_Choam_ChemicalRefinery_Medium.glb',
  Windtrap_Placeable:                      CP + 'Windtrap/Meshes/SM_Env_Prop_Choam_Windtrap_Directional_01.glb',
  LargeWindtrap_Placeable:                 CP + 'Windtrap/Meshes/SM_Env_Prop_Choam_Windtrap_Omnidirectional_01.glb',
  WindTurbineDirectional_Placeable:        CP + 'WindTurbine/Meshes/SM_Env_Prop_Choam_Windturbine_Directional_01.glb',
  WindTurbineOmnidirectional_Placeable:    CP + 'WindTurbine/Meshes/SM_Env_Prop_Choam_Windturbine_Omnidirectional_01.glb',

  // ── Fremen ────────────────────────────────────────────────────────────────
  Deathstill_Placeable:                    FP + 'Deathstill/Meshes/SM_Env_Prop_Frem_Deathstill.glb',
  Fremen_Deathstill_Placeable:             FP + 'Deathstill/Meshes/SM_Env_Prop_Frem_Deathstill.glb',

  // ── Misc/generic ─────────────────────────────────────────────────────────
  OutpostChair_1_Placeable:                AP + 'Chair/Meshes/SM_Env_Prop_Atre_Chair_01.glb',
  GenericContainer_Placeable:              CP + 'Containers/Meshes/SM_Env_Prop_Choam_StorageContainer_Small.glb',

  // ── MTX: Atreides BreakfastRoom ("Movie" set) ─────────────────────────────
  MTX_Atre_Hologram_CaladanEmblem_Placeable:  MAP + 'Misc/Hologram/Meshes/SM_MTX_Env_Prop_Atre_Misc_Hologram_CaladanEmblem.glb',
  MTX_Atre_Movie_Bonsai_Placeable:            MAP + 'BreakfastRoom/Meshes/SM_MTX_Env_Prop_Atre_BreakfastRoom_Bonsai.glb',
  MTX_Atre_Movie_DecorativeBox_Placeable:     MAP + 'BreakfastRoom/Meshes/SM_MTX_Env_Prop_Atre_BreakfastRoom_DecorativeBox.glb',
  MTX_Atre_Movie_DecorativePlate_Placeable:   MAP + 'BreakfastRoom/Meshes/SM_MTX_Env_Prop_Atre_BreakfastRoom_DecorativePlate.glb',
  MTX_Atre_Movie_DecorativeWineBottle_Placeable: MAP + 'BreakfastRoom/Meshes/SM_MTX_Env_Prop_Atre_BreakfastRoom_DecorativeWineBottle.glb',
  MTX_Atre_Movie_LargeCarpet_Placeable:       MAP + 'BreakfastRoom/Meshes/SM_MTX_Env_Prop_Atre_BreakfastRoom_LargeCarpet.glb',

  // ── MTX: Neutral ──────────────────────────────────────────────────────────
  MTX_Neut_DesertMechanicSet_SandbikePainting_Placeable: MNP + 'DesertMechanicSet/Meshes/SM_MTX_Env_Prop_Neut_DesertMechanicSet_SandbikePainting.glb',
  MTX_Neut_MuadDibCage_Placeable:             MNP + 'Misc/Meshes/SM_MTX_Env_Prop_Neut_MuadDibCage.glb',
  MTX_Neut_StrategyRoomCarpet_Placeable:      MNP + 'StrategyRoomCarpet/Meshes/SM_MTX_Env_Prop_Neut_StrategyRoomCarpet.glb',
  Neut_Statue_DesertMouse_Placeable:          MNP + 'Statues/Meshes/SM_MTX_Env_Prop_Neut_Statue_DesertMouse.glb',
};

const GLB_SWAPS: Record<string, string> = {
  // L/R GLBs appear swapped vs blueprint data
  Atreides_Outpost_Floor_Triangle_Wide_Left:  GENERATED_PATHS['Atreides_Outpost_Floor_Triangle_Wide_Right'],
  Atreides_Outpost_Floor_Triangle_Wide_Right: GENERATED_PATHS['Atreides_Outpost_Floor_Triangle_Wide_Left'],
  Atreides_Outpost_Ramp_Edge_Wide_Left:       GENERATED_PATHS['Atreides_Outpost_Ramp_Edge_Wide_Right'],
  Atreides_Outpost_Ramp_Edge_Wide_Right:      GENERATED_PATHS['Atreides_Outpost_Ramp_Edge_Wide_Left'],
};

export const MODEL_PATHS: Record<string, string> = cdnPaths({ ...GENERATED_PATHS, ...PLACEABLE_PATHS, ...GLB_SWAPS });

export const PIECE_CATALOG = GENERATED;

export function getPieceDefinition(templateId: string) {
  return GENERATED.find(p => p.templateId === templateId) ?? inferPieceDefinition(templateId);
}
