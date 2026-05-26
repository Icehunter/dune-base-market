// Blueprint 10 — building instances + placeables from the live DB export.
// Instances:  building_blueprint_instances (structure pieces)
// Placeables: building_blueprint_placeables (equipment / props)

import type { PlacedPiece } from '../stores/buildingStore';
import { DEFAULT_BASE_RAW } from './defaultBaseData';

// ── Building instances ────────────────────────────────────────────────────────

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

// ── Placeables ────────────────────────────────────────────────────────────────
// Source: building_blueprint_placeables  [0:5]={x,y,z,rx,ry,rz}
// rx/rz are 0 for all entries in blueprint 10; only ry (yaw) matters here.
const PLACEABLES_RAW = [
  { templateId: 'SurvivalFabricator_Placeable',            x: -149.54845, y:  968.9541,  z: 386.00003, ry:  175 },
  { templateId: 'Recycler_Placeable',                      x: -511.78857, y:  995.8256,  z: 386.00003, ry:  175 },
  { templateId: 'Generator_Placeable',                     x:  458.12042, y:  716.4585,  z: 962.0282,  ry:   90 },
  { templateId: 'Generator_Placeable',                     x:  149.93219, y:  696.3255,  z: 962.0282,  ry:   90 },
  { templateId: 'Generator_Placeable',                     x: -389.78888, y:  808.7101,  z: 962.0282,  ry:  -95 },
  { templateId: 'Choam_PentashieldSurfaceVertical_Placeable',   x: -768.0005,  y:  0.00031, z: 384,    ry:  -90 },
  { templateId: 'Choam_PentashieldSurfaceHorizontal_Placeable', x: -0.00092,   y: -0.000075, z: 2112,  ry: -180 },
];

// ── Combined ──────────────────────────────────────────────────────────────────

export function getDefaultBasePieces(): Omit<PlacedPiece, 'id'>[] {
  const instances: Omit<PlacedPiece, 'id'>[] = DEFAULT_BASE_RAW.map(raw => ({
    templateId: raw.templateId,
    transform: {
      position: { x: round3(raw.x), y: round3(raw.y), z: round3(raw.z) },
      rotation: cleanRotation(raw.rotation),
    },
    faction: 'Atreides',
    category: category(raw.templateId),
  }));

  const placeables: Omit<PlacedPiece, 'id'>[] = PLACEABLES_RAW.map(raw => ({
    templateId: raw.templateId,
    transform: {
      position: { x: round3(raw.x), y: round3(raw.y), z: round3(raw.z) },
      rotation: cleanRotation(raw.ry),
    },
    faction: 'Generic',
    category: 'Decoration',
  }));

  return [...instances, ...placeables];
}
