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

// Placeable GLB paths — extracted from CDT_PlaceableData.json UE asset refs.
const PLACEABLE_PATHS: Record<string, string> = {
  Generator_Placeable:
    '/src/Dune/Environment/Props/Choam/PowerGeneration/PowerGenerator/Meshes/SM_Env_Prop_Choam_PowerGenerator.glb',
  SurvivalFabricator_Placeable:
    '/src/Dune/Environment/Props/Choam/Fabricator/Meshes/SM_Env_Prop_Choam_Fabricator_Survival.glb',
  Recycler_Placeable:
    '/src/Dune/Environment/Props/Choam/Recycler/Meshes/SM_Env_Prop_Choam_Recycler.glb',
  Choam_PentashieldSurfaceVertical_Placeable:
    '/src/Dune/Effects/Abilities/Pentashield/SM_Ecolab_Pentashield.glb',
  Choam_PentashieldSurfaceHorizontal_Placeable:
    '/src/Dune/Effects/Abilities/Pentashield/SM_Ecolab_Pentashield_Horizontal.glb',
};

export const MODEL_PATHS: Record<string, string> = cdnPaths({ ...GENERATED_PATHS, ...PLACEABLE_PATHS });

export const PIECE_CATALOG = GENERATED;

export function getPieceDefinition(templateId: string) {
  return GENERATED.find(p => p.templateId === templateId) ?? inferPieceDefinition(templateId);
}
