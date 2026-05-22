import {
  Scene,
  Vector3,
  Color3,
  StandardMaterial,
  PBRMaterial,
  ShaderMaterial,
  Effect,
  Matrix,
  Material,
  MeshBuilder,
  SceneLoader,
  AssetContainer,
  TransformNode,
  Mesh,
  ShadowGenerator,
  Quaternion,
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import { degreesToRadians } from "./GridSystem";
import { MODEL_PATHS } from "../data/catalog";
import { resolveGlb } from "../data/modelRegistry";
import { EXTRA_ROTATION, ROTATION_BY_STORED, type RotMap } from "../data/modelRegistry";

export interface PlacedMesh {
  id: string;
  templateId: string;
  root: TransformNode | Mesh;
  position: Vector3;
  rotation: number;
  baseQuaternion: Quaternion; // GLB coord-correction quat, captured before our yaw is applied
}

// ── Flat shader ───────────────────────────────────────────────────────────────
// Writes directly to gl_FragColor so it's immune to Babylon's image-processing
// pipeline crushing darks. Base luminance 0.72 ensures ALL faces are at least
// 72% bright regardless of orientation — the same logic as the backup build.
const FLAT_VERT = `
precision highp float;
attribute vec3 position;
attribute vec3 normal;
uniform mat4 worldViewProjection;
uniform mat4 world;
uniform mat4 uLightMatrix;
varying vec3 vN;
varying vec4 vLightSpacePos;
void main() {
  vec4 worldPos  = world * vec4(position, 1.0);
  gl_Position    = worldViewProjection * vec4(position, 1.0);
  vN             = normalize((world * vec4(normal, 0.0)).xyz);
  vLightSpacePos = uLightMatrix * worldPos;
}`;

const FLAT_FRAG = `
precision highp float;
varying vec3 vN;
varying vec4 vLightSpacePos;
uniform vec3  uColor;
uniform float uHasShadow;
uniform float uShadowBias;
uniform float uShadowMapSize;
uniform sampler2D uShadowMap;

float tap(vec2 uv, float depth) {
  float closest = texture2D(uShadowMap, uv).r;
  return depth > closest ? 0.0 : 1.0;
}
float sampleShadow() {
  if (uHasShadow < 0.5) return 1.0;
  vec3 proj = vLightSpacePos.xyz / vLightSpacePos.w;
  vec3 uvd  = proj * 0.5 + 0.5;
  if (uvd.x < 0.0 || uvd.x > 1.0 || uvd.y < 0.0 || uvd.y > 1.0 || uvd.z > 1.0) return 1.0;
  float depth = uvd.z - uShadowBias;
  float t = 1.0 / uShadowMapSize;
  float s = tap(uvd.xy, depth)
          + tap(uvd.xy + vec2( t, 0.0), depth)
          + tap(uvd.xy + vec2(-t, 0.0), depth)
          + tap(uvd.xy + vec2(0.0,  t), depth)
          + tap(uvd.xy + vec2(0.0, -t), depth);
  return max(0.5, s / 5.0);
}
void main() {
  vec3 N   = normalize(vN);
  float kd = max(0.0, dot(N, normalize(vec3( 0.4, 1.0, -0.3)))) * 0.25;
  float fd = max(0.0, dot(N, normalize(vec3(-0.6, 0.5,  0.4)))) * 0.15;
  float bd = max(0.0, dot(N, normalize(vec3( 0.0,-1.0,  0.0)))) * 0.10;
  float shadow = sampleShadow();
  float lum = clamp(0.72 + (kd + fd) * shadow + bd, 0.0, 1.0);
  gl_FragColor = vec4(uColor * lum, 1.0);
}`;

const FLAT_NAME = `flat_viewer_${Math.floor(Math.random() * 1_000_000)}`;
Effect.ShadersStore[`${FLAT_NAME}VertexShader`] = FLAT_VERT;
Effect.ShadersStore[`${FLAT_NAME}FragmentShader`] = FLAT_FRAG;

// Pentashield GLB native extents in meters (from FModel export).
// UE Actor Scale [s.x, s.y, s.z] maps to GLB axes as: UE-X→GLB-X, UE-Y→GLB-Z, UE-Z→GLB-Y.
// Normalizing by native extent converts scale values (target meters) to Babylon scale factors.
const PENTASHIELD_DIMS: Partial<Record<string, { x: number; y: number; z: number }>> = {
  Choam_PentashieldSurfaceHorizontal_Placeable: { x: 7.66, y: 0.4, z: 5.16 },
  Choam_PentashieldSurfaceVertical_Placeable: { x: 7.66, y: 5.16, z: 0.4 },
};

export class PieceManager {
  private scene: Scene;
  private placedMeshes: Map<string, PlacedMesh> = new Map();
  private containerCache: Map<string, AssetContainer> = new Map();
  private loadingPromises: Map<string, Promise<void>> = new Map();
  private shadowGenerator: ShadowGenerator | null = null;
  private matCache: Map<string, Material> = new Map();
  private flatMat: ShaderMaterial | null = null;
  private selectedId: string | null = null;

  constructor(scene: Scene) {
    this.scene = scene;
  }

  // Shared flat ShaderMaterial — warm neutral gray with baked 3-light rig.
  // Minimum luminance 0.72 ensures no face goes near-black regardless of
  // orientation. Shadow map is wired up in onBindObservable each frame.
  private getFlatShader(): ShaderMaterial {
    if (this.flatMat) return this.flatMat;
    const m = new ShaderMaterial(
      "flat_default",
      this.scene,
      { vertex: FLAT_NAME, fragment: FLAT_NAME },
      {
        attributes: ["position", "normal"],
        uniforms: [
          "worldViewProjection",
          "world",
          "uLightMatrix",
          "uColor",
          "uHasShadow",
          "uShadowBias",
          "uShadowMapSize",
        ],
        samplers: ["uShadowMap"],
      },
    );
    m.setColor3("uColor", new Color3(0.88, 0.9, 0.92));
    m.setFloat("uHasShadow", 0.0);
    m.setFloat("uShadowBias", 0.012);
    m.setFloat("uShadowMapSize", 2048);
    m.setMatrix("uLightMatrix", Matrix.Identity());
    m.backFaceCulling = true;
    m.onBindObservable.add(() => {
      const sg = this.shadowGenerator;
      if (!sg) return;
      const sm = sg.getShadowMap();
      if (!sm) return;
      m.setTexture("uShadowMap", sm);
      m.setMatrix("uLightMatrix", sg.getTransformMatrix());
      m.setFloat("uHasShadow", 1.0);
    });
    this.flatMat = m;
    return m;
  }

  // Returns a material matched to the GLB source material name.
  private getFlatMaterial(sourceName: string): Material {
    const n = (sourceName ?? "").toLowerCase();

    if (n.includes("glass") || n.includes("translucent")) {
      return this.getCached("glass", () => {
        const m = new PBRMaterial("flat_glass", this.scene);
        m.albedoColor = new Color3(0.45, 0.62, 0.75);
        m.alpha = 0.28;
        m.metallic = 0;
        m.roughness = 0.1;
        return m;
      });
    }
    if (
      n.includes("forcefield") ||
      n.includes("force_field") ||
      n.includes("hologram") ||
      n.includes("shield") ||
      n.includes("prudence_energy")
    ) {
      return this.getCached("ff", () => {
        const m = new PBRMaterial("flat_ff", this.scene);
        m.albedoColor = new Color3(0.2, 0.8, 0.9);
        m.emissiveColor = new Color3(0.08, 0.4, 0.5);
        m.alpha = 0.4;
        m.metallic = 0;
        m.roughness = 0.3;
        return m;
      });
    }
    // Skip light/color treatments for player-built wall materials — names like
    // MI_*_PB_*_Light_Blue_* and MI_*_PB_*_Lights are accent colors, not fixtures.
    const isPropLight = !n.includes("_pb_");
    if (isPropLight && (n.includes("light_blue") || n.includes("lightblue"))) {
      return this.getCached("lblue", () => {
        const m = new PBRMaterial("flat_lblue", this.scene);
        m.albedoColor = new Color3(0.2, 0.55, 0.7);
        m.emissiveColor = new Color3(0.4, 0.85, 1.0);
        m.alpha = 0.75;
        m.metallic = 0.1;
        m.roughness = 0.2;
        m.transparencyMode = 2;
        return m;
      });
    }
    if (isPropLight && /_lights?(\d+)?$/.test(n) && !n.includes("light_blue")) {
      return this.getCached("light", () => {
        const m = new PBRMaterial("flat_light", this.scene);
        m.albedoColor = new Color3(1.0, 0.92, 0.65);
        m.emissiveColor = new Color3(0.85, 0.7, 0.4);
        m.metallic = 0;
        m.roughness = 0.4;
        return m;
      });
    }

    return this.getFlatShader();
  }

  private getCached(key: string, build: () => Material): Material {
    let m = this.matCache.get(key);
    if (!m) {
      m = build();
      this.matCache.set(key, m);
    }
    return m;
  }

  setShadowGenerator(sg: ShadowGenerator | null): void {
    this.shadowGenerator = sg;
  }

  async preloadModel(templateId: string): Promise<void> {
    if (this.containerCache.has(templateId)) return;
    if (this.loadingPromises.has(templateId)) return this.loadingPromises.get(templateId);

    const url = MODEL_PATHS[templateId] ?? resolveGlb(templateId);
    if (!url) {
      console.warn(`[PieceManager] No GLB found for: ${templateId}`);
      return;
    }

    const promise = (async () => {
      try {
        const lastSlash = url.lastIndexOf("/");
        const rootUrl = url.substring(0, lastSlash + 1);
        const fileName = url.substring(lastSlash + 1);
        const container = await SceneLoader.LoadAssetContainerAsync(rootUrl, fileName, this.scene);
        this.containerCache.set(templateId, container);
      } catch (e) {
        console.warn(`[PieceManager] Could not load ${templateId}:`, e);
      }
    })();

    this.loadingPromises.set(templateId, promise);
    return promise;
  }

  placePiece(
    id: string,
    templateId: string,
    position: Vector3,
    rotation: number,
    scale?: { x: number; y: number; z: number },
    devOverrides: Partial<Record<string, RotMap>> = {},
    userOverrides: Partial<Record<string, RotMap>> = {},
  ): PlacedMesh | null {
    this.removePiece(id);

    const container = this.containerCache.get(templateId);
    if (!container) {
      // GLB not loaded (model not yet extracted from UE) — show a wireframe
      // placeholder so the piece position is still visible in the scene.
      return this.placePlaceholder(id, templateId, position, rotation);
    }

    const entries = container.instantiateModelsToScene((name) => `${id}_${name}`, false);
    if (!entries.rootNodes.length) return null;

    const root = entries.rootNodes[0] as TransformNode;

    root.getChildMeshes(false).forEach((m) => {
      // Replace the GLB's PBR material (which renders black without embedded
      // textures) with our flat material, dispatched by source material name.
      m.material = this.getFlatMaterial(m.material?.name ?? "");
      // GLB loader can set hasVertexAlpha from COLOR_0, forcing alpha blending.
      m.hasVertexAlpha = false;
      m.visibility = 1.0;
    });

    // FModel exports in meters; grid is in UE centimetres → scale ×100.
    // Pentashields carry a target-metres scale [s.x, s.y, s.z] (UE Actor Scale axes).
    // Normalise each axis by the native GLB extent so the panel renders at the correct size.
    // UE axis mapping to GLB: UE-X→GLB-X, UE-Y→GLB-Z, UE-Z→GLB-Y.
    const dims = PENTASHIELD_DIMS[templateId];
    if (dims && scale) {
      root.scaling = new Vector3((100 * scale.x) / dims.x, (100 * scale.z) / dims.y, (100 * scale.y) / dims.z);
    } else {
      const s = scale ?? { x: 1, y: 1, z: 1 };
      root.scaling = new Vector3(100 * s.x, 100 * s.y, 100 * s.z);
    }
    root.position = position;

    // Babylon's GLB loader applies a 180° Y + Z-flip coord correction to the root
    // (rotationQuaternion set on load). We add our yaw on top of that — do NOT
    // zero-reset rotation or the coord correction is lost.
    //
    // Canonicalize rotation to (-180, 180] so ROTATION_BY_STORED key lookups work
    // regardless of whether the stored value is -180 or 180, 270 or -90, etc.
    // Preserves non-90° values (60°, 120°) for wedge-based layouts.
    const n = ((rotation % 360) + 360) % 360;
    const key = n > 180 ? n - 360 : n;
    const staticMap  = ROTATION_BY_STORED[templateId];
    const userMap    = userOverrides[templateId];
    const devMap     = devOverrides[templateId];
    const byStored = (staticMap || userMap || devMap)
      ? { ...staticMap, ...userMap, ...devMap }
      : undefined;
    const extra = byStored != null ? (byStored[key] ?? 0) : (EXTRA_ROTATION[templateId] ?? 0);
    const baseQuaternion = (root.rotationQuaternion ?? Quaternion.Identity()).clone();
    root.addRotation(0, degreesToRadians(rotation + 90 + extra), 0);

    root.metadata = { pieceId: id, templateId };
    root.getChildMeshes(false).forEach((m) => {
      m.metadata = { pieceId: id, templateId };
    });

    if (this.shadowGenerator) {
      root.getChildMeshes(false).forEach((m) => {
        this.shadowGenerator!.addShadowCaster(m);
        m.receiveShadows = true;
      });
    }

    const placed: PlacedMesh = { id, templateId, root, position: position.clone(), rotation, baseQuaternion };
    this.placedMeshes.set(id, placed);
    return placed;
  }

  private placePlaceholder(id: string, templateId: string, position: Vector3, rotation: number): PlacedMesh {
    // 256-unit cube — half a foundation tile, enough to be noticeable.
    const box = MeshBuilder.CreateBox(`ph_${id}`, { size: 256 }, this.scene);
    box.position = position.add(new Vector3(0, 128, 0));
    box.rotation.y = degreesToRadians(rotation + 90);
    box.material = this.getCached("placeholder", () => {
      const m = new StandardMaterial("ph_mat", this.scene);
      m.diffuseColor = new Color3(0.35, 0.55, 0.75);
      m.wireframe = true;
      return m;
    });
    box.metadata = { pieceId: id, templateId };
    const placed: PlacedMesh = { id, templateId, root: box, position: position.clone(), rotation, baseQuaternion: Quaternion.Identity() };
    this.placedMeshes.set(id, placed);
    return placed;
  }

  selectPiece(id: string): void {
    this.clearSelection();
    const placed = this.placedMeshes.get(id);
    if (!placed) return;
    placed.root.getChildMeshes(false).forEach((m) => {
      if (m instanceof Mesh) {
        m.renderOutline = true;
        m.outlineColor = new Color3(1.0, 0.85, 0.1);
        m.outlineWidth = 0.04;
      }
    });
    this.selectedId = id;
  }

  clearSelection(): void {
    if (!this.selectedId) return;
    const placed = this.placedMeshes.get(this.selectedId);
    placed?.root.getChildMeshes(false).forEach((m) => {
      if (m instanceof Mesh) m.renderOutline = false;
    });
    this.selectedId = null;
  }

  applyDevOverrides(
    devOverrides: Partial<Record<string, RotMap>>,
    userOverrides: Partial<Record<string, RotMap>> = {},
  ): void {
    this.placedMeshes.forEach((placed) => {
      const devMap  = devOverrides[placed.templateId];
      const userMap = userOverrides[placed.templateId];
      if (!devMap && !userMap) return;
      const n = ((placed.rotation % 360) + 360) % 360;
      const key = n > 180 ? n - 360 : n;
      const staticMap = ROTATION_BY_STORED[placed.templateId];
      const byStored = { ...staticMap, ...userMap, ...devMap };
      const extra = byStored[key] ?? (EXTRA_ROTATION[placed.templateId] ?? 0);
      placed.root.rotationQuaternion = placed.baseQuaternion.clone();
      placed.root.addRotation(0, degreesToRadians(placed.rotation + 90 + extra), 0);
    });
  }

  removePiece(id: string): void {
    const placed = this.placedMeshes.get(id);
    if (placed) {
      placed.root.dispose();
      this.placedMeshes.delete(id);
    }
  }

  clearAll(): void {
    this.placedMeshes.forEach((p) => p.root.dispose());
    this.placedMeshes.clear();
  }

  dispose(): void {
    this.clearAll();
    this.containerCache.forEach((c) => c.dispose());
    this.containerCache.clear();
    this.matCache.forEach((m) => m.dispose());
    this.matCache.clear();
    this.flatMat?.dispose();
    this.flatMat = null;
  }
}
