// Grid constants matching Dune Awakening's building system
export const GRID = {
  FOUNDATION_SIZE: 512,  // X/Y tile spacing
  FLOOR_HEIGHT: 384,     // Z step per story (wall height)
  WALL_OFFSET: 256,      // Wall/edge offset from foundation center
  HALF_HEIGHT: 192,      // Half wall height (half of 384)
  VALID_ROTATIONS: [0, 90, -90, 180] as const,

  // Equilateral triangle (Foundation_Wedge) geometry — side = FOUNDATION_SIZE (512).
  // Values from DT_DuneSocketSetupData.json socket instance translations.
  WEDGE_APOTHEM: 147.80167,   // centroid → face midpoint = 512*√3/6
  WEDGE_CIRCUMRADIUS: 295.60333, // centroid → vertex = 512*√3/3
  // Distance from adjacent square center to wedge centroid (face-to-face connection):
  //   WALL_OFFSET (256) + WEDGE_APOTHEM (147.8) = 403.8
  WEDGE_FACE_SNAP: 256 + 147.80167,
} as const;

export type ValidRotation = typeof GRID.VALID_ROTATIONS[number];


export interface Transform {
  position: WorldPosition;
  rotation: number;
}

// Snap world position to nearest foundation grid point.
// Z uses HALF_HEIGHT (192) so half-floor structures snap correctly.
interface WorldPosition { x: number; y: number; z: number; }
export function snapToFoundationGrid(world: WorldPosition): WorldPosition {
  return {
    x: Math.round(world.x / GRID.FOUNDATION_SIZE) * GRID.FOUNDATION_SIZE,
    y: Math.round(world.y / GRID.FOUNDATION_SIZE) * GRID.FOUNDATION_SIZE,
    z: Math.round(world.z / GRID.HALF_HEIGHT) * GRID.HALF_HEIGHT,
  };
}


// Convert rotation degrees to radians
export function degreesToRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

