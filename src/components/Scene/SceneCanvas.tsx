import { forwardRef, memo, useEffect, useImperativeHandle, useRef } from 'react';
import {
  Engine,
  Scene,
  UniversalCamera,
  ArcRotateCamera,
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
import type { RotMap } from '../../data/modelRegistry';

DracoCompression.Configuration = {
  decoder: {
    wasmUrl:       'https://cdn.babylonjs.com/draco_wasm_wrapper_gltf.js',
    wasmBinaryUrl: 'https://cdn.babylonjs.com/draco_decoder_gltf.wasm',
    fallbackUrl:   'https://cdn.babylonjs.com/draco_decoder_gltf.js',
  },
};

const FLY_SPEED       = 400;
const FLY_SPEED_FAST  = 1600;

export interface SceneCanvasHandle {
  applyDevOverrides: (devMap: Partial<Record<string, RotMap>>, userMap?: Partial<Record<string, RotMap>>) => void;
  setMode: (mode: 'orbit' | 'fly') => void;
  captureScreenshot: () => Promise<Blob>;
  // Replace every instance of `originalTemplateId` with `newTemplateId` in place.
  // Pass newTemplateId === originalTemplateId to revert to the original. No camera reset.
  swapTemplate: (originalTemplateId: string, newTemplateId: string) => Promise<void>;
  // Current (post-swap) templateId for a piece. Used by the page to keep selectedPiece
  // in sync after a variant swap so rotation overrides target the displayed template.
  getCurrentTemplateId: (pieceId: string) => string | null;
}

interface Props {
  ref?: React.Ref<SceneCanvasHandle>;
  onSelectPiece?: (piece: PlacedPiece | null) => void;
  onModeChange?: (mode: 'orbit' | 'fly') => void;
  // Fired once initial pieces have been placed — used by the page to apply
  // any persisted piece overrides imperatively without rebuilding the scene.
  onReady?: () => void;
  initialDistanceScale?: number;
  initialBlueprint?: RawBlueprint;
  userRotationOverrides?: Partial<Record<string, RotMap>>;
}

export const SceneCanvas = memo(forwardRef<SceneCanvasHandle, Props>(
  function SceneCanvas({ onSelectPiece, onModeChange, onReady, initialDistanceScale = 1, initialBlueprint, userRotationOverrides = {} }, ref) {
    const canvasRef     = useRef<HTMLCanvasElement>(null);
    const onSelectRef   = useRef(onSelectPiece);
    const pmRef         = useRef<PieceManager | null>(null);
    const selectedIdRef = useRef<string | null>(null);
    const modeRef              = useRef<'orbit' | 'fly'>('orbit');
    const onModeChangeRef      = useRef(onModeChange);
    const onReadyRef           = useRef(onReady);
    const userOverridesRef     = useRef(userRotationOverrides);
    const orbitCamRef     = useRef<ArcRotateCamera | null>(null);
    const flyCamRef       = useRef<UniversalCamera | null>(null);
    const babylonScene    = useRef<Scene | null>(null);

    // Selector-scoped subscriptions so internal Zustand events don't re-render
    // this component (which would trigger the heavy scene useEffect).
    const pieces      = useBuildingStore((s) => s.pieces);
    const loadFromRaw = useBuildingStore((s) => s.loadFromRaw);

    useImperativeHandle(ref, () => ({
      applyDevOverrides: (devMap, userMap = {}) => pmRef.current?.applyDevOverrides(devMap, userMap),
      captureScreenshot: () => new Promise<Blob>((resolve, reject) => {
        const canvas = canvasRef.current;
        if (!canvas) { reject(new Error('No canvas')); return; }
        // Cover images are used as gallery thumbnails and OG previews — full retina canvas
        // (often 3–4k wide) is wasteful. Downscale to 1280px on the long edge, output JPEG.
        const MAX_DIM = 1280;
        const srcW = canvas.width, srcH = canvas.height;
        const scale = Math.min(1, MAX_DIM / Math.max(srcW, srcH));
        const dstW = Math.round(srcW * scale);
        const dstH = Math.round(srcH * scale);
        const off = document.createElement('canvas');
        off.width = dstW; off.height = dstH;
        const ctx = off.getContext('2d');
        if (!ctx) { reject(new Error('2d context unavailable')); return; }
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(canvas, 0, 0, dstW, dstH);
        off.toBlob((blob) => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', 0.85);
      }),
      setMode: (mode) => {
        const orbitCam = orbitCamRef.current;
        const flyCam   = flyCamRef.current;
        const scene    = babylonScene.current;
        const canvas   = canvasRef.current;
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
      swapTemplate: async (originalTemplateId, newTemplateId) => {
        const pm = pmRef.current;
        if (!pm) return;
        await pm.swapTemplate(originalTemplateId, newTemplateId, userOverridesRef.current);
      },
      getCurrentTemplateId: (pieceId) => pmRef.current?.getPlaced(pieceId)?.templateId ?? null,
    }));

    useEffect(() => {
      if (initialBlueprint) loadFromRaw(initialBlueprint);
    }, [initialBlueprint, loadFromRaw]);

    // Keep callback ref current without re-running the heavy effect.
    useEffect(() => { onSelectRef.current = onSelectPiece; }, [onSelectPiece]);
    useEffect(() => { onModeChangeRef.current = onModeChange; }, [onModeChange]);
    useEffect(() => { onReadyRef.current   = onReady;        }, [onReady]);
    useEffect(() => { userOverridesRef.current = userRotationOverrides; }, [userRotationOverrides]);

    useEffect(() => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      // ── Engine & scene ──────────────────────────────────────────────────────
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

      // ── Auto-frame ──────────────────────────────────────────────────────────
      const TILE = GRID.FOUNDATION_SIZE;

      let cx = 0, cy = 200, cz = 0;
      let startPos: Vector3;
      let initRadius = 4000;

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

        const spanX = maxX - minX + TILE * 2;
        const spanY = maxY - minY + TILE * 2;
        const spanZ = maxZ - Math.min(...zs) + TILE;
        const diag  = Math.sqrt(spanX * spanX + spanY * spanY + spanZ * spanZ);
        initRadius  = (diag / 2) / Math.tan(Math.PI / 6) * 0.85 * initialDistanceScale;

        startPos = new Vector3(cx + initRadius * 0.6, cy + initRadius * 0.5, cz - initRadius * 0.6);
      } else {
        startPos = new Vector3(0, 500, -4000);
      }

      // ── Cameras ───────────────────────────────────────────────────────────────────
      const target = new Vector3(cx, cy, cz);

      // Orbit camera (default) — rotates around base, no pointer lock needed
      const orbitCam = new ArcRotateCamera('orbit', -Math.PI / 4, Math.PI / 4, initRadius, target, scene);
      orbitCam.lowerRadiusLimit = 100;
      orbitCam.upperRadiusLimit = 200000;
      orbitCam.wheelPrecision   = 0.5;
      orbitCam.panningSensibility = 200;
      orbitCam.minZ = 5;
      orbitCam.maxZ = 200000;

      // Fly camera (Ctrl+M) — free-fly, requires pointer lock
      const flyCam = new UniversalCamera('fly', startPos, scene);
      flyCam.setTarget(target);
      flyCam.keysUp    = [87, 38];
      flyCam.keysDown  = [83, 40];
      flyCam.keysLeft  = [65, 37];
      flyCam.keysRight = [68, 39];
      flyCam.speed              = FLY_SPEED;
      flyCam.angularSensibility = 600;
      flyCam.inertia            = 0.05;
      flyCam.minZ               = 5;
      flyCam.maxZ               = 200000;

      scene.activeCamera = orbitCam;
      orbitCam.attachControl(canvas, true);
      modeRef.current = 'orbit';

      orbitCamRef.current  = orbitCam;
      flyCamRef.current    = flyCam;
      babylonScene.current = scene;

      const onKeyDown = (e: KeyboardEvent) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          flyCam.speed = FLY_SPEED_FAST;
        }
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
        }
      };
      const onKeyUp = (e: KeyboardEvent) => {
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          flyCam.speed = FLY_SPEED;
        }
      };
      document.addEventListener('keydown', onKeyDown);
      document.addEventListener('keyup',   onKeyUp);

      // ── Pointer lock ────────────────────────────────────────────────────────
      const onLockChange = () => {
        if (modeRef.current !== 'fly') return;
        if (document.pointerLockElement === canvas) {
          flyCam.attachControl(canvas, true);
        } else {
          // Pointer lock released (Escape) — stay in fly mode, just pause controls.
          // Clicking the canvas will re-lock and resume flying.
          flyCam.detachControl();
        }
      };
      document.addEventListener('pointerlockchange', onLockChange);

      // ── Lighting ────────────────────────────────────────────────────────────
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

      // In orbit mode the sun orbits with the camera so shadows shift as you
      // spin — gives the illusion of rotating the model in front of a fixed sun.
      // In fly mode the sun direction is left unchanged (world-fixed).
      const SUN_HORIZ = Math.sqrt(0.3 * 0.3 + 0.5 * 0.5);
      const SUN_ALPHA_OFFSET = Math.atan2(0.5, 0.3) - orbitCam.alpha;
      scene.onBeforeRenderObservable.add(() => {
        if (modeRef.current !== 'orbit') return;
        const a = orbitCam.alpha + SUN_ALPHA_OFFSET;
        sun.direction = new Vector3(Math.cos(a) * SUN_HORIZ, -1.0, Math.sin(a) * SUN_HORIZ).normalize();
      });

      // ── Piece Manager ────────────────────────────────────────────────────────
      const pm = new PieceManager(scene);
      pmRef.current = pm;
      pm.setShadowGenerator(sg);

      // ── Load & place all pieces ─────────────────────────────────────────────
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
            {},
            userOverridesRef.current,
          );
        }
        onReadyRef.current?.();
      });

      // Build a PlacedPiece for a picked mesh. The store holds the *original* templateId;
      // the mesh metadata holds the *current* (post-swap) templateId — we use metadata so
      // rotation overrides key the actually rendered piece, not the original.
      const pieceFromPick = (pieceId: string): PlacedPiece | null => {
        const stored = pieces.find((p) => p.id === pieceId);
        if (!stored) return null;
        const placed = pm.getPlaced(pieceId);
        const currentTemplateId = placed?.templateId ?? stored.templateId;
        return { ...stored, templateId: currentTemplateId };
      };

      // ── Click: pick at crosshair when locked; re-lock when unlocked ─────────
      const onClick = () => {
        if (modeRef.current === 'fly') {
          if (document.pointerLockElement === canvas) {
            const pick = scene.pick(canvas.clientWidth / 2, canvas.clientHeight / 2);
            if (pick.hit && pick.pickedMesh?.metadata?.pieceId) {
              const pieceId = pick.pickedMesh.metadata.pieceId as string;
              pm.selectPiece(pieceId);
              selectedIdRef.current = pieceId;
              onSelectRef.current?.(pieceFromPick(pieceId));
            } else {
              pm.clearSelection();
              selectedIdRef.current = null;
              onSelectRef.current?.(null);
            }
          } else {
            canvas.requestPointerLock();
          }
        } else {
          // Orbit mode: pick at pointer position
          const pick = scene.pick(scene.pointerX, scene.pointerY);
          if (pick.hit && pick.pickedMesh?.metadata?.pieceId) {
            const pieceId = pick.pickedMesh.metadata.pieceId as string;
            pm.selectPiece(pieceId);
            selectedIdRef.current = pieceId;
            onSelectRef.current?.(pieceFromPick(pieceId));
          } else {
            pm.clearSelection();
            selectedIdRef.current = null;
            onSelectRef.current?.(null);
          }
        }
      };
      canvas.addEventListener('click', onClick);

      // ── Render loop ─────────────────────────────────────────────────────────
      engine.runRenderLoop(() => scene.render());

      const onResize = () => engine.resize();
      window.addEventListener('resize', onResize);

      return () => {
        cancelled = true;
        pmRef.current = null;
        selectedIdRef.current = null;
        orbitCamRef.current  = null;
        flyCamRef.current    = null;
        babylonScene.current = null;
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
));
