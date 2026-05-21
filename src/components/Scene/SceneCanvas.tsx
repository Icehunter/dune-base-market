import { useEffect, useRef } from 'react';
import {
  Engine,
  Scene,
  UniversalCamera,
  HemisphericLight,
  DirectionalLight,
  ShadowGenerator,
  Vector3,
  Color3,
  Color4,
  DracoCompression,
} from '@babylonjs/core';
import { GRID } from '../../engine/GridSystem';
import { PieceManager } from '../../engine/PieceManager';
import { useBuildingStore, type PlacedPiece, type RawBlueprint } from '../../stores/buildingStore';

DracoCompression.Configuration = {
  decoder: {
    wasmUrl:       'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
    wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
    fallbackUrl:   'https://cdn.babylonjs.com/draco_decoder_gltf.js',
  },
};

const FLY_SPEED       = 400;
const FLY_SPEED_FAST  = 1600;

interface Props {
  onSelectPiece?: (piece: PlacedPiece | null) => void;
  initialDistanceScale?: number;
  initialBlueprint?: RawBlueprint;
}

export function SceneCanvas({ onSelectPiece, initialDistanceScale = 1, initialBlueprint }: Props) {
  const canvasRef        = useRef<HTMLCanvasElement>(null);
  const onSelectRef      = useRef(onSelectPiece);
  const { pieces }       = useBuildingStore();
  const loadFromRaw = useBuildingStore((s) => s.loadFromRaw);

  useEffect(() => {
    if (initialBlueprint) loadFromRaw(initialBlueprint);
  }, [initialBlueprint, loadFromRaw]);

  // Keep callback ref current without re-running the heavy effect.
  useEffect(() => { onSelectRef.current = onSelectPiece; }, [onSelectPiece]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // ── Engine & scene ────────────────────────────────────────────────────────
    const engine = new Engine(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
    const scene = new Scene(engine);
    scene.clearColor = new Color4(0.08, 0.08, 0.10, 1);
    scene.ambientColor = new Color3(1, 1, 1);
    scene.environmentIntensity = 0;
    scene.imageProcessingConfiguration.isEnabled = false;
    scene.imageProcessingConfiguration.toneMappingEnabled = false;

    // ── Auto-frame ────────────────────────────────────────────────────────────
    const TILE = GRID.FOUNDATION_SIZE;

    let cx = 0, cy = 200, cz = 0;
    let startPos: Vector3;

    if (pieces.length > 0) {
      const xs = pieces.map(p => p.transform.position.x);
      const ys = pieces.map(p => p.transform.position.y);
      const zs = pieces.map(p => p.transform.position.z);

      const minX = Math.min(...xs), maxX = Math.max(...xs);
      const minY = Math.min(...ys), maxY = Math.max(...ys);
      const maxZ = Math.max(...zs);

      cx = (minX + maxX) / 2;
      cz = (minY + maxY) / 2;
      cy = maxZ * 0.35;

      const spanH = Math.max(maxX - minX, maxY - minY) + TILE * 2;
      const dist  = (spanH / 2) / Math.tan(0.4) * 1.3 * initialDistanceScale;
      const hDist = dist * Math.cos(Math.PI / 4);
      const vDist = dist * Math.sin(Math.PI / 4);

      startPos = new Vector3(cx + hDist, cy + vDist, cz - hDist);
    } else {
      startPos = new Vector3(0, 500, -4000);
    }

    // ── Fly camera ────────────────────────────────────────────────────────────
    const camera = new UniversalCamera('fps', startPos, scene);
    camera.setTarget(new Vector3(cx, cy, cz));

    camera.keysUp    = [87, 38]; // W / ↑
    camera.keysDown  = [83, 40]; // S / ↓
    camera.keysLeft  = [65, 37]; // A / ←
    camera.keysRight = [68, 39]; // D / →
    // Space and Shift are NOT bound to vertical movement —
    // Shift is used as a speed modifier instead (see below).

    camera.speed              = FLY_SPEED;
    camera.angularSensibility = 600;
    camera.inertia            = 0.05;
    camera.minZ               = 5;
    camera.maxZ               = 200000;

    // Shift = fast mode while held.
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        camera.speed = FLY_SPEED_FAST;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        camera.speed = FLY_SPEED;
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup',   onKeyUp);

    // ── Pointer lock ──────────────────────────────────────────────────────────
    const onLockChange = () => {
      if (document.pointerLockElement === canvas) {
        camera.attachControl(canvas, true);
      } else {
        camera.detachControl();
      }
    };
    document.addEventListener('pointerlockchange', onLockChange);

    // ── Lighting ──────────────────────────────────────────────────────────────
    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity   = 0.6;
    hemi.diffuse     = new Color3(0.9, 0.88, 0.84);
    hemi.groundColor = new Color3(0.4, 0.38, 0.35);

    const sun = new DirectionalLight('sun', new Vector3(0.3, -1.0, 0.5).normalize(), scene);
    sun.intensity = 1.2;
    sun.diffuse   = new Color3(1.0, 0.97, 0.90);
    sun.specular  = new Color3(0.3, 0.28, 0.24);

    const sg = new ShadowGenerator(2048, sun);
    sg.usePoissonSampling = true;
    sg.bias = 0.0008;

    // ── Piece Manager ─────────────────────────────────────────────────────────
    const pm = new PieceManager(scene);
    pm.setShadowGenerator(sg);

    // ── Load & place all pieces ───────────────────────────────────────────────
    let cancelled = false;
    const uniqueTemplates = [...new Set(pieces.map(p => p.templateId))];

    Promise.all(uniqueTemplates.map(t => pm.preloadModel(t))).then(() => {
      if (cancelled) return;
      for (const piece of pieces) {
        if (piece.templateId.toLowerCase().includes('pentashield')) continue;
        pm.placePiece(
          piece.id,
          piece.templateId,
          new Vector3(piece.transform.position.x, piece.transform.position.z, piece.transform.position.y),
          piece.transform.rotation,
          piece.scale,
        );
      }
    });

    // ── Click: pick at crosshair when locked; re-lock when unlocked ──────────
    const onClick = () => {
      if (document.pointerLockElement === canvas) {
        // Pick at the crosshair (canvas centre) while flying.
        const pick = scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2);
        if (pick.hit && pick.pickedMesh?.metadata?.pieceId) {
          const pieceId = pick.pickedMesh.metadata.pieceId as string;
          pm.selectPiece(pieceId);
          const piece = pieces.find(p => p.id === pieceId) ?? null;
          onSelectRef.current?.(piece);
        } else {
          pm.clearSelection();
          onSelectRef.current?.(null);
        }
      } else {
        // Unlocked (post-Escape): click just re-enters fly mode, no selection.
        canvas.requestPointerLock();
      }
    };
    canvas.addEventListener('click', onClick);

    // ── Render loop ───────────────────────────────────────────────────────────
    engine.runRenderLoop(() => scene.render());

    const onResize = () => engine.resize();
    window.addEventListener('resize', onResize);

    return () => {
      cancelled = true;
      canvas.removeEventListener('click', onClick);
      document.removeEventListener('pointerlockchange', onLockChange);
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup',   onKeyUp);
      window.removeEventListener('resize', onResize);
      pm.dispose();
      scene.dispose();
      engine.dispose();
    };
  }, [pieces, initialDistanceScale]);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: '100%', height: '100%', display: 'block', outline: 'none' }}
    />
  );
}
