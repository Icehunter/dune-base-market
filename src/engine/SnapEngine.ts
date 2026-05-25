// Socket-based snap engine for the base designer.
//
// Working coordinate system: UE (Unreal Engine) space.
//   X = east, Y = south/right, Z = up
//   Rotation (degrees): positive = CW from above (left-handed)
//
// Key formulas:
//   socket_world_pos = piece_pos + rotate_ue(local_socket_pos, piece_rotation)
//   rotateUE transforms direction angle α to α − piece_rotation
//   new_piece_rotation for non-foundations = sock.yawDeg − piece.rotation − 90

import { PIECE_CATALOG } from '../data/catalog';
import { SOCKET_SETUPS, GROUP_DATA } from '../data/socketData.generated';
import type { SnapRotation } from '../data/socketData.generated';
import { GRID } from './GridSystem';

export interface UEPos { x: number; y: number; z: number }

export interface PlacedPieceForSnap {
  id: string;
  building_type: string;
  x: number; y: number; z: number;
  rotation: number; // UE degrees
}

export interface SnapResult {
  pos: UEPos;
  rotation: number;     // UE degrees to store
  snapRotation: SnapRotation; // behaviour hint for R-key cycling
}

// ── Coordinate helpers ────────────────────────────────────────────────────────

// Rotate a local (lx, ly) vector by UE yaw degrees (CW from above, left-handed)
function rotateUE(lx: number, ly: number, angleDeg: number): { rx: number; ry: number } {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    rx: lx * Math.cos(rad) + ly * Math.sin(rad),
    ry: -lx * Math.sin(rad) + ly * Math.cos(rad),
  };
}

// Socket world position from a placed piece
function socketWorldPos(
  piece: PlacedPieceForSnap,
  lx: number, ly: number, lz: number,
): UEPos {
  const { rx, ry } = rotateUE(lx, ly, piece.rotation);
  return { x: piece.x + rx, y: piece.y + ry, z: piece.z + lz };
}

// ── Catalog lookup ────────────────────────────────────────────────────────────

function catalogEntry(building_type: string) {
  return PIECE_CATALOG.find(p => p.templateId === building_type);
}

function groupType(building_type: string): string | undefined {
  return catalogEntry(building_type)?.buildableGroupType;
}

function getGroupData(building_type: string) {
  const gt = groupType(building_type);
  return gt ? GROUP_DATA[gt] : undefined;
}

function getSocketSetup(building_type: string) {
  const gd = getGroupData(building_type);
  if (!gd?.socketSetupName) return undefined;
  return SOCKET_SETUPS[gd.socketSetupName];
}

export function isFoundationPiece(building_type: string): boolean {
  return catalogEntry(building_type)?.isFoundation ?? false;
}

// Floor pieces: have Up edge sockets (BP_DuneBuildingSocket_C) but NO Down socket.
// Examples: Floor, Floor_Wedge, Floor_Quarter, Rooftop.
// Floor_Round_Corner has a Down socket (curved wall type) — handled by the wall path.
export function isFloorPiece(building_type: string): boolean {
  const setup = getSocketSetup(building_type);
  if (!setup) return false;
  if (setup.sockets.some(s => s.cost === 'Down')) return false;
  return setup.sockets.some(
    s => s.cost === 'Up' &&
         s.types.includes('BP_DuneBuildingSocket_C') &&
         (Math.abs(s.lx) > 1 || Math.abs(s.ly) > 1),
  );
}

// ── Collision detection ───────────────────────────────────────────────────────

function posKey(x: number, y: number, z: number): string {
  return `${Math.round(x)},${Math.round(y)},${Math.round(z)}`;
}

export function buildOccupiedSet(pieces: PlacedPieceForSnap[]): Set<string> {
  return new Set(pieces.map(p => posKey(p.x, p.y, p.z)));
}

export function isPositionOccupied(
  occupied: Set<string>,
  x: number, y: number, z: number,
): boolean {
  return occupied.has(posKey(x, y, z));
}

// ── Polygon collision (SAT) ──────────────────────────────────────────────────

interface Vec2 { x: number; y: number }

const WEDGE_VERTS: Vec2[] = [
  { x: 256, y: 147.8 },
  { x: -256, y: 147.8 },
  { x: 0, y: -295.6 },
];

const SQUARE_HALF = GRID.FOUNDATION_SIZE / 2; // 256
const SQUARE_VERTS: Vec2[] = [
  { x: SQUARE_HALF, y: SQUARE_HALF },
  { x: -SQUARE_HALF, y: SQUARE_HALF },
  { x: -SQUARE_HALF, y: -SQUARE_HALF },
  { x: SQUARE_HALF, y: -SQUARE_HALF },
];

function getFootprint(
  building_type: string, cx: number, cy: number, rotation: number,
): Vec2[] {
  const gd = getGroupData(building_type);
  const isWedge = gd?.socketSetupName === 'Foundation_Wedge' || gd?.socketSetupName === 'Floor_Wedge';
  const locals = isWedge ? WEDGE_VERTS : SQUARE_VERTS;
  return locals.map(v => {
    const { rx, ry } = rotateUE(v.x, v.y, rotation);
    return { x: cx + rx, y: cy + ry };
  });
}

// Separating Axis Theorem — returns true if two convex polygons overlap.
// Uses a small inset tolerance so shared edges (snapped pieces) don't trigger.
const SAT_TOLERANCE = 10; // UE units (~2% of a foundation side)

function polygonsOverlap(a: Vec2[], b: Vec2[]): boolean {
  for (const poly of [a, b]) {
    for (let i = 0; i < poly.length; i++) {
      const j = (i + 1) % poly.length;
      const nx = -(poly[j].y - poly[i].y);
      const ny = poly[j].x - poly[i].x;

      let minA = Infinity, maxA = -Infinity;
      for (const v of a) {
        const p = v.x * nx + v.y * ny;
        if (p < minA) minA = p;
        if (p > maxA) maxA = p;
      }
      let minB = Infinity, maxB = -Infinity;
      for (const v of b) {
        const p = v.x * nx + v.y * ny;
        if (p < minB) minB = p;
        if (p > maxB) maxB = p;
      }

      if (maxA <= minB + SAT_TOLERANCE || maxB <= minA + SAT_TOLERANCE) return false;
    }
  }
  return true;
}

export function isPlacementColliding(
  building_type: string,
  x: number, y: number, z: number,
  rotation: number,
  pieces: PlacedPieceForSnap[],
): boolean {
  if (!catalogEntry(building_type)?.isFoundation && !isFloorPiece(building_type)) return false;

  const ghost = getFootprint(building_type, x, y, rotation);
  for (const piece of pieces) {
    if (!catalogEntry(piece.building_type)?.isFoundation && !isFloorPiece(piece.building_type)) continue;
    if (Math.abs(piece.z - z) > 10) continue;
    if (polygonsOverlap(ghost, getFootprint(piece.building_type, piece.x, piece.y, piece.rotation))) {
      return true;
    }
  }
  return false;
}

// ── Snap radius ───────────────────────────────────────────────────────────────

const SNAP_RADIUS = GRID.FOUNDATION_SIZE * 0.8; // 410 UE units

// ── Socket compatibility ──────────────────────────────────────────────────────

// Returns the primary "Down" (attachment) socket of the given piece's socket setup.
function getAttachmentSocket(building_type: string) {
  const setup = getSocketSetup(building_type);
  if (!setup) return null;
  return setup.sockets.find(s => s.cost === 'Down') ?? null;
}

// Whether the two socket type arrays are compatible (any intersection)
function typesCompatible(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const set = new Set(b);
  return a.some(t => set.has(t));
}

// ── Rotation helpers ──────────────────────────────────────────────────────────

// Normalize to [-180, 180) without snapping to 90° multiples.
function normaliseAngle(deg: number): number {
  return ((deg % 360) + 540) % 360 - 180;
}


// ── Foundation snap ──────────────────────────────────────────────────────────

// Foundations (both square and wedge) have no Down socket — they connect
// edge-to-edge with other foundations via Foundation_Edge sockets.
//
// Position: new centroid = host edge midpoint + placingApothem × outward_unit
// Rotation:
//   wedge-on-wedge: host.rotation + 180° (standard alternating triangle tiling)
//   everything else: atan2(−rotX, −rotY) — connects via the placing piece's
//     primary edge (the one with lx≈0, which is the "south" edge for squares
//     and edge 1 for wedges)
function findFoundationSnapPoint(
  cursor: UEPos,
  placingType: string,
  pieces: PlacedPieceForSnap[],
  occupied: Set<string>,
): SnapResult | null {
  const placingGd = getGroupData(placingType);
  const isPlacingWedge = placingGd?.socketSetupName === 'Foundation_Wedge';
  const placingApothem = isPlacingWedge ? GRID.WEDGE_APOTHEM : GRID.FOUNDATION_SIZE / 2;

  const FACE_OCC_THRESHOLD = 260;

  let best: { dist: number; pos: UEPos; rotation: number } | null = null;

  for (const piece of pieces) {
    const setup = getSocketSetup(piece.building_type);
    if (!setup) continue;
    const gd = getGroupData(piece.building_type);
    const isHostWedge = gd?.socketSetupName === 'Foundation_Wedge';

    for (const sock of setup.sockets) {
      if (sock.cost !== 'Foundation_Edge') continue;
      if (!sock.types.includes('BP_DuneBuildingSocket_C')) continue;

      const localLen = Math.sqrt(sock.lx * sock.lx + sock.ly * sock.ly);
      if (localLen < 1) continue; // skip center sockets

      const { rx: rotX, ry: rotY } = rotateUE(sock.lx, sock.ly, piece.rotation);

      // Skip faces already connected to another foundation (walls/doors don't count).
      const faceMidX = piece.x + rotX;
      const faceMidY = piece.y + rotY;
      const faceConnected = pieces.some(other => {
        if (other.id === piece.id) return false;
        if (!catalogEntry(other.building_type)?.isFoundation) return false;
        const ddx = other.x - faceMidX;
        const ddy = other.y - faceMidY;
        return Math.sqrt(ddx * ddx + ddy * ddy) < FACE_OCC_THRESHOLD;
      });
      if (faceConnected) continue;

      // New piece centroid: offset from edge midpoint by the placing piece's apothem
      const scale = 1 + placingApothem / localLen;
      const wx = piece.x + scale * rotX;
      const wy = piece.y + scale * rotY;

      let rot: number;
      if (isHostWedge && isPlacingWedge) {
        rot = normaliseAngle(piece.rotation + 180);
      } else {
        // atan2(−rotX, −rotY) gives the rotation that makes the placing piece's
        // primary edge (the one at local (0, apothem)) face toward the host.
        rot = Math.atan2(-rotX, -rotY) * 180 / Math.PI;
      }

      const wz = piece.z;
      const dx = cursor.x - wx;
      const dy = cursor.y - wy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SNAP_RADIUS) continue;
      if (isPositionOccupied(occupied, wx, wy, wz)) continue;
      if (isPlacementColliding(placingType, wx, wy, wz, rot, pieces)) continue;

      if (!best || dist < best.dist) {
        best = { dist, pos: { x: wx, y: wy, z: wz }, rotation: rot };
      }
    }
  }

  if (!best) return null;
  return { pos: best.pos, rotation: best.rotation, snapRotation: 'SnapOne' };
}

// ── Floor snap ───────────────────────────────────────────────────────────────
//
// Floors have no Down socket — they connect via their edge Up sockets.
// A floor edge socket (lz=0) aligns with:
//   - Foundation_Edge sockets (lz=384) on foundations → floor.z = foundation.z + 384
//   - Up edge sockets (lz=0) on adjacent floors → floor.z = adjacent_floor.z (cantilevering)
//
// The floor rotation is determined so the connecting edge socket faces opposite to the host socket.
function findFloorSnapPoint(
  cursor: UEPos,
  placingType: string,
  pieces: PlacedPieceForSnap[],
  occupied: Set<string>,
): SnapResult | null {
  const placingSetup = getSocketSetup(placingType);
  if (!placingSetup) return null;

  // Floor's own edge sockets — these are the potential connection points
  const floorEdgeSocks = placingSetup.sockets.filter(
    s => s.cost === 'Up' &&
         s.types.includes('BP_DuneBuildingSocket_C') &&
         (Math.abs(s.lx) > 1 || Math.abs(s.ly) > 1),
  );
  if (!floorEdgeSocks.length) return null;

  const gd = getGroupData(placingType);
  const snapRotType = gd?.snapRotation ?? 'SnapOne';

  let best: { dist: number; pos: UEPos; rotation: number } | null = null;

  for (const piece of pieces) {
    const hostSetup = getSocketSetup(piece.building_type);
    if (!hostSetup) continue;

    for (const hostSock of hostSetup.sockets) {
      // Accept Foundation_Edge edge sockets (foundation top) and Up edge sockets (floor edges).
      // Center sockets (lx≈0, ly≈0) are excluded — wall center Up sockets don't support floors.
      const isSupportSocket =
        (hostSock.cost === 'Foundation_Edge' || hostSock.cost === 'Up') &&
        hostSock.types.includes('BP_DuneBuildingSocket_C') &&
        (Math.abs(hostSock.lx) > 1 || Math.abs(hostSock.ly) > 1);
      if (!isSupportSocket) continue;

      const hostWorld = socketWorldPos(piece, hostSock.lx, hostSock.ly, hostSock.lz);

      const hdx = cursor.x - hostWorld.x;
      const hdy = cursor.y - hostWorld.y;
      if (Math.sqrt(hdx * hdx + hdy * hdy) > SNAP_RADIUS) continue;

      for (const floorSock of floorEdgeSocks) {
        // Rotation: floorSock world yaw must oppose hostSock world yaw
        const rotation = normaliseAngle(
          floorSock.yawDeg - hostSock.yawDeg + piece.rotation - 180,
        );

        // Floor center: floor.pos + rotateUE(floorSock.lx, floorSock.ly, rotation) = hostWorld.xy
        // floor.z = hostWorld.z (floor lz=0 aligns at host socket's world z)
        const { rx, ry } = rotateUE(floorSock.lx, floorSock.ly, rotation);
        const wx = hostWorld.x - rx;
        const wy = hostWorld.y - ry;
        const wz = hostWorld.z;

        const cdx = cursor.x - wx;
        const cdy = cursor.y - wy;
        const centerDist = Math.sqrt(cdx * cdx + cdy * cdy);
        if (centerDist > SNAP_RADIUS) continue;

        if (isPositionOccupied(occupied, wx, wy, wz)) continue;
        if (isPlacementColliding(placingType, wx, wy, wz, rotation, pieces)) continue;

        if (!best || centerDist < best.dist) {
          best = { dist: centerDist, pos: { x: wx, y: wy, z: wz }, rotation };
        }
      }
    }
  }

  if (!best) return null;
  return { pos: best.pos, rotation: best.rotation, snapRotation: snapRotType };
}

// ── Main snap query ───────────────────────────────────────────────────────────

// Given a cursor UE position and list of placed pieces, find the best socket snap point
// for the piece being placed. Returns null if nothing is within snap range.
export function findSnapPoint(
  cursor: UEPos,
  placingType: string,
  pieces: PlacedPieceForSnap[],
  occupied: Set<string>,
): SnapResult | null {
  // Foundations (square and wedge) use edge-to-edge geometric snap
  const placingEntry = catalogEntry(placingType);
  if (placingEntry?.isFoundation) {
    return findFoundationSnapPoint(cursor, placingType, pieces, occupied);
  }

  // Floor pieces snap via their edge Up sockets (no Down socket)
  if (isFloorPiece(placingType)) {
    return findFloorSnapPoint(cursor, placingType, pieces, occupied);
  }

  const attachSocket = getAttachmentSocket(placingType);
  const gd = getGroupData(placingType);
  if (!attachSocket || !gd) return null;

  const snapRotType = gd.snapRotation;
  const isPillarType = placingEntry?.isPillar ?? false;
  const isFoundationType = false; // foundations are handled above

  let best: { dist: number; pos: UEPos; rotation: number } | null = null;

  for (const piece of pieces) {
    const hostSetup = getSocketSetup(piece.building_type);
    if (!hostSetup) continue;

    for (const sock of hostSetup.sockets) {
      // Skip the host's own attachment (Down) sockets
      if (sock.cost === 'Down') continue;
      // Centre sockets (lx≈0, ly≈0) are reserved for pillars and stacking foundations.
      // Walls, ramps, and other pieces must only use edge/corner sockets.
      const isCentreSocket = Math.abs(sock.lx) < 1 && Math.abs(sock.ly) < 1;
      if (isCentreSocket && !isPillarType && !isFoundationType) continue;
      // Pillar centre sockets only accept pillar pieces (not walls, floors, etc.)
      if (sock.types.includes('BP_DunePillarSocket_C') && !isPillarType) continue;
      // The host socket must target a type our attachment socket provides
      if (!typesCompatible(sock.targetTypes, attachSocket.types)) continue;
      // And our attachment socket must target what the host provides
      if (!typesCompatible(attachSocket.targetTypes, sock.types)) continue;

      const world = socketWorldPos(piece, sock.lx, sock.ly, sock.lz);

      // 2D cursor distance (ignore Z — player is on a flat grid)
      const dx = cursor.x - world.x;
      const dy = cursor.y - world.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > SNAP_RADIUS) continue;

      // The placed piece's Down socket must face opposite to the host socket.
      // General formula: attachSocket.yawDeg − sock.yawDeg + piece.rotation − 180
      const rotation = normaliseAngle(
        attachSocket.yawDeg - sock.yawDeg + piece.rotation - 180,
      );

      const snapZ = world.z;
      if (isPositionOccupied(occupied, world.x, world.y, snapZ)) continue;

      if (!best || dist < best.dist) {
        best = { dist, pos: { x: world.x, y: world.y, z: snapZ }, rotation };
      }
    }
  }

  if (!best) return null;
  return { pos: best.pos, rotation: best.rotation, snapRotation: snapRotType };
}

// ── SnapHalf rotation cycling (R key) ─────────────────────────────────────────

// For SnapHalf: toggle between base rotation and base + 180
export function cycleSnapHalf(current: number): number {
  return normaliseAngle(current + 180);
}

// For SnapAll: advance by 90°
export function cycleSnapAll(current: number): number {
  return normaliseAngle(current + 90);
}

// ── Grid fallback ─────────────────────────────────────────────────────────────

// When not snapping: round to foundation grid.
export function gridSnapPos(ueX: number, ueY: number, ueZ: number): UEPos {
  return {
    x: Math.round(ueX / GRID.FOUNDATION_SIZE) * GRID.FOUNDATION_SIZE,
    y: Math.round(ueY / GRID.FOUNDATION_SIZE) * GRID.FOUNDATION_SIZE,
    z: Math.round(ueZ / GRID.FLOOR_HEIGHT) * GRID.FLOOR_HEIGHT,
  };
}
