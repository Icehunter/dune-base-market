import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Engine,
  Scene,
  ArcRotateCamera,
  UniversalCamera,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Color3,
  Color4,
  MeshBuilder,
  DracoCompression,
  PointerEventTypes,
  Mesh,
  HighlightLayer,
  StandardMaterial,
} from '@babylonjs/core';
import '@babylonjs/loaders/glTF';
import { GRID } from '../../engine/GridSystem';
import { PieceManager } from '../../engine/PieceManager';
import {
  findSnapPoint,
  buildOccupiedSet,
  isPositionOccupied,
  isPlacementColliding,
  isFoundationPiece,
  isFloorPiece,
  gridSnapPos,
  cycleSnapHalf,
  cycleSnapAll,
  type SnapResult,
} from '../../engine/SnapEngine';

DracoCompression.Configuration = {
  decoder: {
    wasmUrl: 'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
    wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
    fallbackUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.js',
  },
};

export interface DesignerPiece {
  id: string;
  building_type: string;
  x: number; // UE_X
  y: number; // UE_Y
  z: number; // UE_Z
  rotation: number; // UE degrees (0, 90, 180, -90)
}

interface Props {
  pieces: DesignerPiece[];
  placingTemplate: string | null;
  placingRotation: number;
  selectedPieceId: string | null;
  onPlace: (x: number, y: number, z: number, rotation: number) => void;
  onSelectPiece: (id: string | null) => void;
  onDeleteSelected: (id: string) => void;
  onRotatePlacing: () => void;
  onCancelPlacing: () => void;
  onModeChange?: (mode: 'orbit' | 'fly') => void;
  onRotateSelected?: (id: string) => void;
}

export interface DesignerCanvasHandle {
  setMode: (mode: 'orbit' | 'fly') => void;
}

const TILE = GRID.FOUNDATION_SIZE; // 512
const GRID_COUNT = 22;
const GHOST_ID = '__ghost__';
const FLY_SPEED = 400;
const FLY_SPEED_FAST = 1600;

function buildGrid(scene: Scene): void {
  const half = TILE * GRID_COUNT;
  const lines: Vector3[][] = [];

  for (let i = -GRID_COUNT; i <= GRID_COUNT; i++) {
    const pos = i * TILE;
    lines.push([new Vector3(-half, 0, pos), new Vector3(half, 0, pos)]);
    lines.push([new Vector3(pos, 0, -half), new Vector3(pos, 0, half)]);
  }

  const mesh = MeshBuilder.CreateLineSystem('grid', { lines }, scene);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (mesh as any).color = new Color3(0.28, 0.20, 0.09);
  mesh.isPickable = false;
}

// Apply ghost visuals — semi-transparent, non-pickable.
// When `blocked` the ghost turns translucent red with a bright red highlight outline.
function applyGhostStyle(
  pm: PieceManager,
  blocked: boolean,
  highlightLayer: HighlightLayer | null,
  blockedMat: StandardMaterial | null,
): void {
  const placed = pm.getPlaced(GHOST_ID);
  if (!placed) return;
  const meshes = placed.root.getChildMeshes(false);
  const targets = meshes.length > 0 ? meshes : (placed.root instanceof Mesh ? [placed.root] : []);
  for (const m of targets) {
    m.isPickable = false;
    if (blocked && blockedMat) {
      if (!m.metadata) m.metadata = {};
      if (!m.metadata._origMat) m.metadata._origMat = m.material;
      m.material = blockedMat;
      m.visibility = 1;
    } else {
      if (m.metadata?._origMat) {
        m.material = m.metadata._origMat;
        m.metadata._origMat = null;
      }
      m.visibility = 0.42;
    }
    if (highlightLayer) {
      if (blocked && m instanceof Mesh) {
        highlightLayer.addMesh(m, Color3.Red());
      } else if (m instanceof Mesh) {
        highlightLayer.removeMesh(m);
      }
    }
  }
}

// Babylon coords → UE coords
function babylonToUE(bx: number, by: number, bz: number) {
  return { x: bz, y: bx, z: by };
}

// UE coords → Babylon coords
function ueToBabylon(ueX: number, ueY: number, ueZ: number) {
  return { bx: ueY, by: ueZ, bz: ueX };
}

export const DesignerCanvas = memo(forwardRef<DesignerCanvasHandle, Props>(
  function DesignerCanvas({
    pieces,
    placingTemplate,
    placingRotation,
    selectedPieceId,
    onPlace,
    onSelectPiece,
    onDeleteSelected,
    onRotatePlacing,
    onCancelPlacing,
    onModeChange,
    onRotateSelected,
  }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const pmRef = useRef<PieceManager | null>(null);
    const prevPiecesRef = useRef<DesignerPiece[]>([]);
    const selectedIdRef = useRef<string | null>(null);

    // Camera / mode state
    const modeRef = useRef<'orbit' | 'fly'>('orbit');
    const orbitCamRef = useRef<ArcRotateCamera | null>(null);
    const flyCamRef = useRef<UniversalCamera | null>(null);
    const babylonSceneRef = useRef<Scene | null>(null);

    // Current snap result (or null for grid snap). Updated every pointer move.
    const snapResultRef = useRef<SnapResult | null>(null);
    // Ghost cursor position in UE coords — start far off-screen so ghost doesn't appear at scene origin
    const ghostUERef = useRef({ x: -999999, y: -999999, z: 0 });
    // Occupied set for collision detection
    const occupiedRef = useRef<Set<string>>(new Set());
    // Whether the current ghost position collides with existing pieces
    const ghostBlockedRef = useRef(false);

    // Stored by scene effect so template/rotation effects can call it
    const refreshGhostRef = useRef<((template: string, bx: number, bz: number, rot: number) => void) | null>(null);

    // Prop refs — keep scene effect stable while props change
    const placingTemplateRef = useRef(placingTemplate);
    const placingRotationRef = useRef(placingRotation);
    const onPlaceRef = useRef(onPlace);
    const onSelectRef = useRef(onSelectPiece);
    const onDeleteRef = useRef(onDeleteSelected);
    const onRotateRef = useRef(onRotatePlacing);
    const onCancelRef = useRef(onCancelPlacing);
    const onModeChangeRef = useRef(onModeChange);
    const onRotateSelectedRef = useRef(onRotateSelected);
    const piecesRef = useRef(pieces);

    useEffect(() => { placingTemplateRef.current = placingTemplate; }, [placingTemplate]);
    useEffect(() => { placingRotationRef.current = placingRotation; }, [placingRotation]);
    useEffect(() => { onPlaceRef.current = onPlace; }, [onPlace]);
    useEffect(() => { onSelectRef.current = onSelectPiece; }, [onSelectPiece]);
    useEffect(() => { onDeleteRef.current = onDeleteSelected; }, [onDeleteSelected]);
    useEffect(() => { onRotateRef.current = onRotatePlacing; }, [onRotatePlacing]);
    useEffect(() => { onCancelRef.current = onCancelPlacing; }, [onCancelPlacing]);
    useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
    useEffect(() => { onRotateSelectedRef.current = onRotateSelected; }, [onRotateSelected]);
    useEffect(() => { piecesRef.current = pieces; }, [pieces]);

    // Rebuild occupied set whenever pieces change
    useEffect(() => {
      occupiedRef.current = buildOccupiedSet(pieces);
    }, [pieces]);

    useImperativeHandle(ref, () => ({
      setMode: (mode) => {
        const orbitCam = orbitCamRef.current;
        const flyCam = flyCamRef.current;
        const scene = babylonSceneRef.current;
        const canvas = canvasRef.current;
        if (!orbitCam || !flyCam || !scene || !canvas) return;
        if (mode === modeRef.current) return;
        if (mode === 'fly') {
          orbitCam.detachControl();
          scene.activeCamera = flyCam;
          modeRef.current = 'fly';
          canvas.requestPointerLock();
          onModeChangeRef.current?.('fly');
        } else {
          if (document.pointerLockElement === canvas) document.exitPointerLock();
          flyCam.detachControl();
          scene.activeCamera = orbitCam;
          orbitCam.attachControl(canvas, true);
          modeRef.current = 'orbit';
          onModeChangeRef.current?.('orbit');
        }
      },
    }));

    // ── Scene setup (mount only) ──────────────────────────────────────────────
    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const engine = new Engine(canvas, true, {
        preserveDrawingBuffer: true,
        stencil: true,
        adaptToDeviceRatio: true,
      });
      const scene = new Scene(engine);
      babylonSceneRef.current = scene;
      scene.clearColor = new Color4(0.05, 0.05, 0.08, 1);
      scene.ambientColor = new Color3(1, 1, 1);
      scene.environmentIntensity = 0;
      scene.imageProcessingConfiguration.isEnabled = false;
      scene.imageProcessingConfiguration.toneMappingEnabled = false;

      // ── Cameras ───────────────────────────────────────────────────────────────
      const orbitCam = new ArcRotateCamera('designer', -Math.PI / 4, Math.PI / 3.5, 5500, Vector3.Zero(), scene);
      orbitCam.lowerRadiusLimit = 200;
      orbitCam.upperRadiusLimit = 80000;
      orbitCam.wheelPrecision = 0.3;
      orbitCam.panningSensibility = 150;
      orbitCam.minZ = 5;
      orbitCam.maxZ = 150000;
      orbitCam.attachControl(canvas, true);
      orbitCamRef.current = orbitCam;

      const flyCam = new UniversalCamera('fly', new Vector3(0, 3000, -5000), scene);
      flyCam.setTarget(Vector3.Zero());
      flyCam.keysUp    = [87, 38];
      flyCam.keysDown  = [83, 40];
      flyCam.keysLeft  = [65, 37];
      flyCam.keysRight = [68, 39];
      flyCam.speed              = FLY_SPEED;
      flyCam.angularSensibility = 600;
      flyCam.inertia            = 0.05;
      flyCam.minZ               = 5;
      flyCam.maxZ               = 150000;
      flyCamRef.current = flyCam;

      scene.activeCamera = orbitCam;
      modeRef.current = 'orbit';

      // ── Lighting ────────────────────────────────────────────────────────────
      const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
      hemi.intensity = 0.6;
      hemi.diffuse = new Color3(0.9, 0.88, 0.84);
      hemi.groundColor = new Color3(0.4, 0.38, 0.35);

      const sun = new DirectionalLight('sun', new Vector3(0.3, -1.0, 0.5).normalize(), scene);
      sun.intensity = 1.2;
      sun.diffuse = new Color3(1.0, 0.97, 0.90);
      sun.specular = new Color3(0.3, 0.28, 0.24);

      const sg = new ShadowGenerator(2048, sun);
      sg.usePoissonSampling = true;
      sg.bias = 0.0008;

      // Sun orbits with orbit cam only — gives the illusion of rotating the model.
      const SUN_HORIZ = Math.sqrt(0.3 * 0.3 + 0.5 * 0.5);
      const SUN_ALPHA_OFFSET = Math.atan2(0.5, 0.3) - orbitCam.alpha;
      scene.onBeforeRenderObservable.add(() => {
        if (modeRef.current !== 'orbit') return;
        const a = orbitCam.alpha + SUN_ALPHA_OFFSET;
        sun.direction = new Vector3(Math.cos(a) * SUN_HORIZ, -1.0, Math.sin(a) * SUN_HORIZ).normalize();
      });

      buildGrid(scene);

      // Invisible ground plane for cursor picking
      const ground = MeshBuilder.CreateGround('ground', {
        width: TILE * GRID_COUNT * 2,
        height: TILE * GRID_COUNT * 2,
      }, scene);
      ground.isPickable = true;
      ground.visibility = 0;

      // PieceManager
      const pm = new PieceManager(scene);
      pmRef.current = pm;
      pm.setShadowGenerator(sg);

      // Ghost collision visuals
      const highlightLayer = new HighlightLayer('ghostHL', scene);
      highlightLayer.outerGlow = true;
      highlightLayer.innerGlow = false;

      const blockedMat = new StandardMaterial('blockedGhost', scene);
      blockedMat.diffuseColor = new Color3(0.7, 0.08, 0.08);
      blockedMat.emissiveColor = new Color3(0.35, 0.02, 0.02);
      blockedMat.alpha = 0.5;
      blockedMat.backFaceCulling = false;

      // refreshGhost — places the active template as a semi-transparent ghost preview.
      const refreshGhost = async (template: string, bx: number, bz: number, rot: number) => {
        pm.removePiece(GHOST_ID);
        await pm.preloadModel(template);
        if (!pmRef.current || placingTemplateRef.current !== template) return;
        pm.placePiece(GHOST_ID, template, new Vector3(bx, 0, bz), -rot);
        ghostBlockedRef.current = false;
        applyGhostStyle(pm, false, highlightLayer, blockedMat);
      };
      refreshGhostRef.current = refreshGhost;

      // ── Pointer lock ─────────────────────────────────────────────────────────
      const onLockChange = () => {
        if (modeRef.current !== 'fly') return;
        if (document.pointerLockElement === canvas) {
          flyCam.attachControl(canvas, true);
        } else {
          flyCam.detachControl();
        }
      };
      document.addEventListener('pointerlockchange', onLockChange);

      // ── Pointer move: compute snap or grid-snap, move ghost ───────────────
      scene.onPointerObservable.add((info) => {
        if (info.type !== PointerEventTypes.POINTERMOVE) return;
        if (modeRef.current === 'fly') return; // pointer is locked; no ground picking
        const tmpl = placingTemplateRef.current;
        if (!tmpl) return;

        const pick = scene.pick(scene.pointerX, scene.pointerY, (m) => m.name === 'ground');
        if (!pick.hit || !pick.pickedPoint) return;
        const pt = pick.pickedPoint;

        // Raw cursor in UE coords
        const rawUE = babylonToUE(pt.x, pt.y, pt.z);

        // Try socket snap
        const snap = findSnapPoint(
          rawUE,
          tmpl,
          piecesRef.current,
          occupiedRef.current,
        );
        snapResultRef.current = snap;

        let finalBx: number, finalBy: number, finalBz: number, finalRot: number;
        let forceBlocked = false;

        if (snap) {
          const bab = ueToBabylon(snap.pos.x, snap.pos.y, snap.pos.z);
          finalBx = bab.bx; finalBy = bab.by; finalBz = bab.bz;
          finalRot = snap.rotation;
          ghostUERef.current = snap.pos;
        } else if (isFoundationPiece(tmpl)) {
          // Foundations follow cursor freely when not snapping
          ghostUERef.current = rawUE;
          const bab = ueToBabylon(rawUE.x, rawUE.y, rawUE.z);
          finalBx = bab.bx; finalBy = bab.by; finalBz = bab.bz;
          finalRot = placingRotationRef.current;
        } else if (isFloorPiece(tmpl)) {
          // Floors with no snap: show at grid height, always blocked (no support = invalid placement)
          const gx = Math.round(rawUE.x / TILE) * TILE;
          const gy = Math.round(rawUE.y / TILE) * TILE;
          ghostUERef.current = { x: gx, y: gy, z: GRID.FLOOR_HEIGHT };
          const bab = ueToBabylon(gx, gy, GRID.FLOOR_HEIGHT);
          finalBx = bab.bx; finalBy = bab.by; finalBz = bab.bz;
          finalRot = placingRotationRef.current;
          forceBlocked = true;
        } else {
          // Non-foundation pieces grid-snap when not near a socket
          const gridPos = gridSnapPos(rawUE.x, rawUE.y, rawUE.z);
          if (isPositionOccupied(occupiedRef.current, gridPos.x, gridPos.y, gridPos.z)) return;
          ghostUERef.current = gridPos;
          const bab = ueToBabylon(gridPos.x, gridPos.y, gridPos.z);
          finalBx = bab.bx; finalBy = bab.by; finalBz = bab.bz;
          finalRot = placingRotationRef.current;
        }

        // Polygon collision check (foundations + floors)
        const blocked = forceBlocked || isPlacementColliding(
          tmpl, ghostUERef.current.x, ghostUERef.current.y, ghostUERef.current.z,
          finalRot, piecesRef.current,
        );
        ghostBlockedRef.current = blocked;

        const placed = pm.getPlaced(GHOST_ID);
        if (placed) {
          placed.root.position.x = finalBx;
          placed.root.position.y = finalBy;
          placed.root.position.z = finalBz;
          if (placed.rotation !== -finalRot) {
            pm.updatePieceYaw(GHOST_ID, -finalRot);
          }
          applyGhostStyle(pm, blocked, highlightLayer, blockedMat);
        }
      });

      // ── Click: place piece, select existing, or re-lock in fly mode ─────────
      const onClick = (evt: MouseEvent) => {
        if (evt.button !== 0) return;

        if (modeRef.current === 'fly') {
          if (document.pointerLockElement !== canvas) {
            canvas.requestPointerLock();
            return;
          }
          // Pointer locked in fly mode — pick at crosshair (canvas center)
          const pick = scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2,
            (m) => !!(m.metadata?.pieceId) && m.metadata.pieceId !== GHOST_ID,
          );
          if (pick.hit && pick.pickedMesh?.metadata?.pieceId) {
            const id = pick.pickedMesh.metadata.pieceId as string;
            pm.selectPiece(id);
            selectedIdRef.current = id;
            onSelectRef.current(id);
          } else {
            pm.clearSelection();
            selectedIdRef.current = null;
            onSelectRef.current(null);
          }
          return;
        }

        // Orbit mode
        if (placingTemplateRef.current) {
          if (ghostBlockedRef.current) return;

          const snap = snapResultRef.current;
          let ueX: number, ueY: number, ueZ: number, rot: number;

          if (snap) {
            ueX = snap.pos.x; ueY = snap.pos.y; ueZ = snap.pos.z;
            rot = snap.rotation;
          } else {
            const ue = ghostUERef.current;
            ueX = ue.x; ueY = ue.y; ueZ = ue.z;
            rot = placingRotationRef.current;
          }

          if (!isPositionOccupied(occupiedRef.current, ueX, ueY, ueZ)) {
            onPlaceRef.current(ueX, ueY, ueZ, rot);
          }
        } else {
          // Pick only real pieces (exclude ghost and ground)
          const pick = scene.pick(scene.pointerX, scene.pointerY,
            (m) => !!(m.metadata?.pieceId) && m.metadata.pieceId !== GHOST_ID,
          );
          if (pick.hit && pick.pickedMesh?.metadata?.pieceId) {
            const id = pick.pickedMesh.metadata.pieceId as string;
            pm.selectPiece(id);
            selectedIdRef.current = id;
            onSelectRef.current(id);
          } else {
            pm.clearSelection();
            selectedIdRef.current = null;
            onSelectRef.current(null);
          }
        }
      };
      canvas.addEventListener('click', onClick);

      // ── Keyboard ──────────────────────────────────────────────────────────────
      const onKeyDown = (e: KeyboardEvent) => {
        // Ctrl+M — toggle orbit / fly
        if ((e.ctrlKey || e.metaKey) && e.key === 'm') {
          e.preventDefault();
          if (modeRef.current === 'orbit') {
            orbitCam.detachControl();
            scene.activeCamera = flyCam;
            modeRef.current = 'fly';
            canvas.requestPointerLock();
            onModeChangeRef.current?.('fly');
          } else {
            if (document.pointerLockElement === canvas) document.exitPointerLock();
            flyCam.detachControl();
            scene.activeCamera = orbitCam;
            orbitCam.attachControl(canvas, true);
            modeRef.current = 'orbit';
            onModeChangeRef.current?.('orbit');
          }
          return;
        }

        // Shift speeds up fly camera
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          flyCam.speed = FLY_SPEED_FAST;
        }

        // R — rotate ghost (placing) or rotate selected piece
        if (e.key === 'r' || e.key === 'R') {
          if (placingTemplateRef.current) {
            e.preventDefault();
            const snap = snapResultRef.current;
            if (snap) {
              if (snap.snapRotation === 'SnapHalf') {
                snap.rotation = cycleSnapHalf(snap.rotation);
              } else if (snap.snapRotation === 'SnapAll') {
                snap.rotation = cycleSnapAll(snap.rotation);
              } else {
                return; // SnapOne — locked
              }
              if (pmRef.current) {
                pmRef.current.updatePieceYaw(GHOST_ID, -snap.rotation);
                const blocked = isPlacementColliding(
                  placingTemplateRef.current!, snap.pos.x, snap.pos.y, snap.pos.z,
                  snap.rotation, piecesRef.current,
                );
                ghostBlockedRef.current = blocked;
                applyGhostStyle(pmRef.current, blocked, highlightLayer, blockedMat);
              }
            } else {
              onRotateRef.current();
            }
          } else if (selectedIdRef.current) {
            e.preventDefault();
            onRotateSelectedRef.current?.(selectedIdRef.current);
          }
          return;
        }

        if (e.key === 'Escape') {
          onCancelRef.current();
          return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIdRef.current) {
          const id = selectedIdRef.current;
          selectedIdRef.current = null;
          pm.clearSelection();
          onDeleteRef.current(id);
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          flyCam.speed = FLY_SPEED;
        }
      };
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup', onKeyUp);

      engine.runRenderLoop(() => scene.render());
      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);

      return () => {
        pmRef.current = null;
        refreshGhostRef.current = null;
        prevPiecesRef.current = [];
        orbitCamRef.current = null;
        flyCamRef.current = null;
        babylonSceneRef.current = null;
        canvas.removeEventListener('click', onClick);
        document.removeEventListener('pointerlockchange', onLockChange);
        document.removeEventListener('keydown', onKeyDown);
        document.removeEventListener('keyup', onKeyUp);
        window.removeEventListener('resize', onResize);
        pm.dispose();
        scene.dispose();
        engine.dispose();
      };
    }, []);

    // ── Sync placed pieces (incremental add/remove/rotate) ────────────────────
    useEffect(() => {
      const pm = pmRef.current;
      if (!pm) return;

      const prev = prevPiecesRef.current;
      const curr = pieces;
      const prevIds = new Set(prev.map(p => p.id));
      const currIds = new Set(curr.map(p => p.id));

      for (const id of prevIds) {
        if (!currIds.has(id)) pm.removePiece(id);
      }

      for (const p of curr) {
        if (!prevIds.has(p.id)) {
          const snap = { ...p };
          pm.preloadModel(snap.building_type).then(() => {
            if (!pmRef.current) return;
            if (!piecesRef.current.find(x => x.id === snap.id)) return;
            // UE → Babylon: Vector3(UE_Y, UE_Z, UE_X); rotation negated
            pmRef.current.placePiece(
              snap.id,
              snap.building_type,
              new Vector3(snap.y, snap.z, snap.x),
              -snap.rotation,
            );
          });
        } else {
          const prevPiece = prev.find(x => x.id === p.id);
          if (prevPiece && prevPiece.building_type !== p.building_type) {
            pm.removePiece(p.id);
            const snap = { ...p };
            pm.preloadModel(snap.building_type).then(() => {
              if (!pmRef.current) return;
              if (!piecesRef.current.find(x => x.id === snap.id)) return;
              pmRef.current.placePiece(
                snap.id,
                snap.building_type,
                new Vector3(snap.y, snap.z, snap.x),
                -snap.rotation,
              );
            });
          } else if (prevPiece && prevPiece.rotation !== p.rotation) {
            pm.updatePieceYaw(p.id, -p.rotation);
          }
        }
      }

      prevPiecesRef.current = curr;
    }, [pieces]);

    // ── Ghost: refresh when placing template changes ───────────────────────────
    useEffect(() => {
      const pm = pmRef.current;
      if (!pm) return;
      pm.removePiece(GHOST_ID);
      snapResultRef.current = null;
      if (!placingTemplate) return;
      // Reset ghost to off-screen so it doesn't flash at scene origin or last position
      ghostUERef.current = { x: -999999, y: -999999, z: 0 };
      refreshGhostRef.current?.(placingTemplate, -999999, -999999, placingRotationRef.current);
    }, [placingTemplate]);

    // ── Ghost: refresh when rotation changes (R key, free-grid mode only) ────
    useEffect(() => {
      const tmpl = placingTemplateRef.current;
      if (!tmpl || snapResultRef.current) return; // snap controls rotation; skip
      const ue = ghostUERef.current;
      const { bx, bz } = ueToBabylon(ue.x, ue.y, ue.z);
      refreshGhostRef.current?.(tmpl, bx, bz, placingRotation);
    }, [placingRotation]);

    // ── External selection sync ───────────────────────────────────────────────
    useEffect(() => {
      const pm = pmRef.current;
      if (!pm) return;
      if (selectedPieceId) {
        pm.selectPiece(selectedPieceId);
        selectedIdRef.current = selectedPieceId;
      } else {
        pm.clearSelection();
        selectedIdRef.current = null;
      }
    }, [selectedPieceId]);

    return (
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
      />
    );
  }
));
