// Per-piece extra rotation (UE-yaw degrees) for GLBs whose model orientation
// differs from the standard Babylon_yaw = UE_yaw + C formula.
// Applied as: ueYawToBabylonYaw(UE_yaw + extra). Positive extra → less Babylon
// rotation; negative extra → more Babylon rotation.
// Add entries here only when a piece renders rotated equally at ALL stored yaw values
// (constant offset across all rotations); yaw-dependent offsets belong in ueTransform.ts.
export const EXTRA_ROTATION: Partial<Record<string, number>> = {
  // Inclined wide walls are physically angled 37.5° from the standard default orientation.
  // This is a constant offset valid at all UE yaw values (cardinal and hex angles).
  Atreides_Outpost_Wall_Inclined_Wide_Left:  -37.5,
  Atreides_Outpost_Wall_Inclined_Wide_Right:  37.5,
};

// RotMap is still used by the dev-mode override system (bp.rotation_overrides in D1
// and the keyboard-tweak path in BlueprintDetailPage). Keep it exported.
export type RotMap = Partial<Record<number, number>>;

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
