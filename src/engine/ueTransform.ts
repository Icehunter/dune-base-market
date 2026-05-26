import { Vector3 } from "@babylonjs/core";

export interface UEPosition {
  x: number;
  y: number;
  z: number;
}

export interface UERotator {
  pitch: number;
  yaw: number;
  roll: number;
}

// UE5 (X forward=North, Y right=East, Z up) → Babylon (X=UE_Y, Y=UE_Z, Z=UE_X)
// Both UE5 and Babylon use left-handed coordinate systems.
export function ueToBabylonPosition(pos: UEPosition): Vector3 {
  return new Vector3(pos.y, pos.z, pos.x);
}

export function babylonToUEPosition(pos: UEPosition): UEPosition {
  return { x: pos.z, y: pos.x, z: pos.y };
}

// Viewer stores UE yaw directly — sign handling is in ueYawToBabylonYaw.
export function toViewerStoredYaw(_templateId: string, ueYawDeg: number): number {
  return ueYawDeg;
}

// UE→Babylon yaw mapping: Babylon_yaw = UE_yaw + C
//
// Derivation: the GLB import applies a baseQuaternion (≈180° on root) and the
// UE↔Babylon axis remap together produce a per-class constant C. The result is
// a linear, monotonic function valid at all UE yaw values — cardinal (0/90/180/−90)
// and non-cardinal hex angles (30°, 60°, 120°, 150°, …) alike.
//
// Class constants (empirically verified at all 4 cardinals):
//   Corner:               C = +180
//   Triangle wedge        C = +90
//     (name contains top|bottom AND left|right)
//   Railing:              C = +90
//   Everything else:      C = -90
export function ueYawToBabylonYaw(templateId: string, yawDeg: number): number {
  const lc = templateId.toLowerCase();
  if (lc.includes("corner")) return yawDeg + 180;
  if (
    (lc.includes("top") || lc.includes("bottom")) &&
    (lc.includes("left") || lc.includes("right"))
  ) return yawDeg + 90;
  if (lc.includes("railing")) return yawDeg + 90;
  return yawDeg - 90;
}

export function uePitchToBabylonPitch(pitchDeg: number): number {
  return -pitchDeg;
}

export function ueRollToBabylonRoll(rollDeg: number): number {
  return rollDeg;
}
