// Piece definitions extracted from game data
// These will use placeholder meshes until real glTF models are available

export interface PieceDefinition {
  templateId: string;
  name: string;
  faction: string;
  category: 'Foundation' | 'Wall' | 'Rooftop' | 'Floor' | 'Pillar' | 'Ramp' | 'Door' | 'Decoration';
  tier: 'Tier0' | 'Tier1' | 'Tier2' | 'Tier3';
  isFoundation: boolean;
  isPillar: boolean;
  buildableGroupType: string;
  /** Socket weight cost when this piece is placed (Foundation_Edge=100, floor=0, others=10) */
  connectionCost: number;
  /** Budget units this foundation provides (tier health; only set when isFoundation) */
  foundationCapacity?: number;
  /** Whether a GLB mesh file is available for this piece */
  hasGlb: boolean;
  /** Game UI icon PNG path (from m_BuildableIcon), if available */
  iconPath?: string;
  // Dimensions in grid units for placeholder mesh
  size: { x: number; y: number; z: number };
  // Color for placeholder
  color: string;
}

type PartialPiece = Omit<PieceDefinition, 'buildableGroupType' | 'connectionCost' | 'hasGlb'> & Partial<Pick<PieceDefinition, 'buildableGroupType' | 'connectionCost' | 'hasGlb' | 'foundationCapacity'>>;

function piece(p: PartialPiece): PieceDefinition {
  const cost = p.isFoundation ? 0 : p.category === 'Wall' || p.category === 'Pillar' || p.category === 'Door' ? 100 : p.category === 'Floor' || p.category === 'Rooftop' ? 0 : 10;
  return {
    buildableGroupType: p.category,
    connectionCost: cost,
    hasGlb: false,
    foundationCapacity: p.isFoundation ? 7000 : undefined,
    ...p,
  };
}

// Placeholder piece catalog - based on actual game data from systems/Building/
const PIECE_CATALOG_RAW: PartialPiece[] = [
  // === FOUNDATIONS ===
  {
    templateId: 'MTX_Smug_Foundation_Full',
    name: 'Foundation (Full)',
    faction: 'Smuggler',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#8B7355',
  },
  {
    templateId: 'MTX_Smug_Foundation_Half',
    name: 'Foundation (Half)',
    faction: 'Smuggler',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 0.5, y: 1, z: 1 },
    color: '#8B7355',
  },
  {
    templateId: 'MTX_Smug_Foundation_Quarter',
    name: 'Foundation (Quarter)',
    faction: 'Smuggler',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 0.5, y: 0.5, z: 1 },
    color: '#8B7355',
  },
  
  // === WALLS ===
  {
    templateId: 'MTX_Smug_Wall_Full',
    name: 'Wall (Full)',
    faction: 'Smuggler',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },  // Full height wall
    color: '#A0926C',
  },
  {
    templateId: 'MTX_Smug_Wall_Half',
    name: 'Wall (Half Height)',
    faction: 'Smuggler',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 0.5 },  // Half HEIGHT, not width
    color: '#A0926C',
  },
  {
    templateId: 'MTX_Smug_Wall_Window',
    name: 'Wall (Window)',
    faction: 'Smuggler',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#A0926C',
  },
  {
    templateId: 'MTX_Smug_Wall_Door',
    name: 'Wall (Door Frame)',
    faction: 'Smuggler',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#A0926C',
  },
  
  // === ROOFTOPS ===
  {
    templateId: 'MTX_Smug_Rooftop_01',
    name: 'Rooftop',
    faction: 'Smuggler',
    category: 'Rooftop',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.15 },
    color: '#6B5B4F',
  },
  {
    templateId: 'MTX_Smug_Rooftop_Half',
    name: 'Rooftop (Half)',
    faction: 'Smuggler',
    category: 'Rooftop',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 0.5, y: 1, z: 0.15 },
    color: '#6B5B4F',
  },
  
  // === FLOORS ===
  {
    templateId: 'MTX_Smug_Floor_Full',
    name: 'Floor',
    faction: 'Smuggler',
    category: 'Floor',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.05 },
    color: '#7A6B5A',
  },
  
  // === PILLARS ===
  {
    templateId: 'MTX_Smug_Pillar_Bottom',
    name: 'Pillar (Bottom)',
    faction: 'Smuggler',
    category: 'Pillar',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: true,
    size: { x: 0.15, y: 0.15, z: 1 },
    color: '#5C5346',
  },
  {
    templateId: 'MTX_Smug_Pillar_Middle',
    name: 'Pillar (Middle)',
    faction: 'Smuggler',
    category: 'Pillar',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: true,
    size: { x: 0.15, y: 0.15, z: 1 },
    color: '#5C5346',
  },
  {
    templateId: 'MTX_Smug_Pillar_Top',
    name: 'Pillar (Top)',
    faction: 'Smuggler',
    category: 'Pillar',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: true,
    size: { x: 0.15, y: 0.15, z: 1 },
    color: '#5C5346',
  },
  
  // === RAMPS ===
  {
    templateId: 'MTX_Smug_Ramp_Full',
    name: 'Ramp',
    faction: 'Smuggler',
    category: 'Ramp',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#8B7B6B',
  },
  {
    templateId: 'MTX_Smug_Ramp_Half',
    name: 'Ramp (Half)',
    faction: 'Smuggler',
    category: 'Ramp',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 0.5, y: 1, z: 1 },
    color: '#8B7B6B',
  },
  
  // === ATREIDES ===
  {
    templateId: 'Atre_Foundation_Full',
    name: 'Foundation (Full)',
    faction: 'Atreides',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#4A6741',
  },
  {
    templateId: 'Atre_Wall_Full',
    name: 'Wall (Full)',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atre_Rooftop_01',
    name: 'Rooftop',
    faction: 'Atreides',
    category: 'Rooftop',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.15 },
    color: '#3A5731',
  },
  
  // === ATREIDES OUTPOST ===
  {
    templateId: 'Atreides_Outpost_Foundation',
    name: 'Foundation',
    faction: 'Atreides',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#4A6741',
  },
  {
    templateId: 'Atreides_Outpost_Floor',
    name: 'Floor',
    faction: 'Atreides',
    category: 'Floor',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.05 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_01',
    name: 'Wall 01',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_02',
    name: 'Wall 02',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_03',
    name: 'Wall 03',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_04',
    name: 'Wall 04',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_Half',
    name: 'Wall Half',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 0.5 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Window_03',
    name: 'Window 03',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#6A8761',
  },
  {
    templateId: 'Atreides_Outpost_Ramp',
    name: 'Ramp',
    faction: 'Atreides',
    category: 'Ramp',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#4A6741',
  },
  {
    templateId: 'Atreides_Outpost_Stairs',
    name: 'Stairs',
    faction: 'Atreides',
    category: 'Ramp',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#4A6741',
  },
  {
    templateId: 'Atreides_Outpost_Stairs_Half',
    name: 'Stairs (Half)',
    faction: 'Atreides',
    category: 'Ramp',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 0.5, y: 1, z: 1 },
    color: '#4A6741',
  },
  {
    templateId: 'MTX_Atreides_Outpost_Bookshelf',
    name: 'Bookshelf',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'MTX_Atre_BreakfastRoom_Floor',
    name: 'Breakfast Room Floor',
    faction: 'Atreides',
    category: 'Floor',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.05 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Column',
    name: 'Column',
    faction: 'Atreides',
    category: 'Pillar',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: true,
    size: { x: 0.15, y: 0.15, z: 1 },
    color: '#3A5731',
  },
  {
    templateId: 'Atreides_Outpost_Railing',
    name: 'Railing',
    faction: 'Atreides',
    category: 'Decoration',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.05, z: 0.3 },
    color: '#6A8761',
  },
  {
    templateId: 'Atreides_Outpost_PrudenceDoor_Frame',
    name: 'Door Frame',
    faction: 'Atreides',
    category: 'Door',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_Round_Corner_03',
    name: 'Wall Corner (Round)',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Floor_Round_Corner_Inverted',
    name: 'Floor Corner (Round)',
    faction: 'Atreides',
    category: 'Floor',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.05 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_Triangle_Top_Half_Left',
    name: 'Wall Triangle Top Half Left',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 0.5 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_Triangle_Top_Half_Right',
    name: 'Wall Triangle Top Half Right',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 0.5 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Wall_Triangle_Bottom_Right',
    name: 'Wall Triangle Bottom Right',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 0.5 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Window_04',
    name: 'Window 04',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#6A8761',
  },
  {
    templateId: 'Atreides_Outpost_Railing_Gate',
    name: 'Railing Gate',
    faction: 'Atreides',
    category: 'Decoration',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.05, z: 0.3 },
    color: '#6A8761',
  },
  {
    templateId: 'Atreides_Outpost_Railing_Inclined',
    name: 'Railing (Inclined)',
    faction: 'Atreides',
    category: 'Decoration',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.05, z: 0.3 },
    color: '#6A8761',
  },
  {
    templateId: 'Atreides_Outpost_Passageway',
    name: 'Passageway',
    faction: 'Atreides',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.2, z: 1 },
    color: '#5A7751',
  },
  {
    templateId: 'Atreides_Outpost_Roof_Cover_Top_Half_Left',
    name: 'Roof Cover Top Half',
    faction: 'Atreides',
    category: 'Rooftop',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.5 },
    color: '#3A5731',
  },

  // === HARKONNEN ===
  {
    templateId: 'Hark_Foundation_Full',
    name: 'Foundation (Full)',
    faction: 'Harkonnen',
    category: 'Foundation',
    tier: 'Tier1',
    isFoundation: true,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#2D2D2D',
  },
  {
    templateId: 'Hark_Wall_Full',
    name: 'Wall (Full)',
    faction: 'Harkonnen',
    category: 'Wall',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#3D3D3D',
  },
  {
    templateId: 'Hark_Rooftop_01',
    name: 'Rooftop',
    faction: 'Harkonnen',
    category: 'Rooftop',
    tier: 'Tier1',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 1, z: 0.15 },
    color: '#1D1D1D',
  },
  
  // === CHOAM ===
  {
    templateId: 'Choam_Foundation_Full',
    name: 'Foundation (Full)',
    faction: 'Choam',
    category: 'Foundation',
    tier: 'Tier2',
    isFoundation: true,
    isPillar: false,
    size: { x: 1, y: 1, z: 1 },
    color: '#C4A35A',
  },
  {
    templateId: 'Choam_Wall_Full',
    name: 'Wall (Full)',
    faction: 'Choam',
    category: 'Wall',
    tier: 'Tier2',
    isFoundation: false,
    isPillar: false,
    size: { x: 1, y: 0.1, z: 1 },
    color: '#D4B36A',
  },
];

export const PIECE_CATALOG: PieceDefinition[] = PIECE_CATALOG_RAW.map(piece);

// Group pieces by category
export function getPiecesByCategory(): Record<string, PieceDefinition[]> {
  const groups: Record<string, PieceDefinition[]> = {};
  for (const p of PIECE_CATALOG) {
    if (!groups[p.category]) groups[p.category] = [];
    groups[p.category].push(p);
  }
  return groups;
}

// Group pieces by faction
export function getPiecesByFaction(): Record<string, PieceDefinition[]> {
  const groups: Record<string, PieceDefinition[]> = {};
  for (const p of PIECE_CATALOG) {
    if (!groups[p.faction]) groups[p.faction] = [];
    groups[p.faction].push(p);
  }
  return groups;
}

// Get piece definition by template ID
export function getPieceDefinition(templateId: string): PieceDefinition | undefined {
  const existing = PIECE_CATALOG.find(p => p.templateId === templateId);
  if (existing) return existing;
  return inferPieceDefinition(templateId);
}

// Get all categories
export function getCategories(): string[] {
  return [...new Set(PIECE_CATALOG.map(p => p.category))];
}

// Get all factions
export function getFactions(): string[] {
  return [...new Set(PIECE_CATALOG.map(p => p.faction))];
}

export function inferPieceDefinition(templateId: string): PieceDefinition {
  const id = templateId.toLowerCase();

  let category: PieceDefinition['category'] = 'Decoration';
  let size: PieceDefinition['size'] = { x: 1, y: 1, z: 0.5 };
  let isFoundation = false;
  let isPillar = false;
  let connectionCost = 10;

  if (id.includes('foundation')) {
    category = 'Foundation';
    size = { x: 1, y: 1, z: 1 };
    isFoundation = true;
    connectionCost = 0;
  } else if (id.includes('wall_half')) {
    category = 'Wall';
    size = { x: 1, y: 0.1, z: 0.5 };
    connectionCost = 100;
  } else if (id.includes('wall') || id.includes('window') || id.includes('door') || id.includes('passageway') || id.includes('bookshelf')) {
    category = 'Wall';
    size = { x: 1, y: 0.1, z: 1 };
    connectionCost = 100;
  } else if (id.includes('floor')) {
    category = 'Floor';
    size = { x: 1, y: 1, z: 0.05 };
    connectionCost = 0;
  } else if (id.includes('roof')) {
    category = 'Rooftop';
    size = { x: 1, y: 1, z: 0.15 };
    connectionCost = 0;
  } else if (id.includes('stair') && id.includes('half')) {
    category = 'Ramp';
    size = { x: 0.5, y: 1, z: 1 };
  } else if (id.includes('stair') || id.includes('ramp')) {
    category = 'Ramp';
    size = { x: 1, y: 1, z: 1 };
  } else if (id.includes('column') || id.includes('pillar')) {
    category = 'Pillar';
    size = { x: 0.15, y: 0.15, z: 1 };
    isPillar = true;
    connectionCost = 100;
  } else if (id.includes('railing')) {
    category = 'Decoration';
    size = { x: 1, y: 0.05, z: 0.3 };
  }

  const faction = id.includes('atreides') || id.includes('atre_')
    ? 'Atreides'
    : id.includes('hark')
      ? 'Harkonnen'
      : id.includes('choam')
        ? 'Choam'
        : id.includes('smug')
          ? 'Smuggler'
          : id.includes('waters')
            ? 'Watershippers'
            : 'Generic';

  return {
    templateId,
    name: templateId.replaceAll('_', ' '),
    faction,
    category,
    tier: 'Tier1',
    isFoundation,
    isPillar,
    buildableGroupType: category,
    connectionCost,
    foundationCapacity: isFoundation ? 7000 : undefined,
    hasGlb: false,
    size,
    color: faction === 'Atreides' ? '#5A7751' : '#777777',
  };
}
