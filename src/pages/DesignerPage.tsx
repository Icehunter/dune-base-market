import { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '@clerk/react';
import { toast } from '@heroui/react';
import { Icon } from '@iconify/react';
import { PIECE_CATALOG } from '../data/catalog';
import { DesignerCanvas, type DesignerPiece, type DesignerCanvasHandle } from '../components/Designer/DesignerCanvas';
import { PaletteDrawer } from '../components/Designer/PaletteDrawer';
import { ActionsMenu } from '../components/Designer/ActionsMenu';
import { ViewerHUD } from '../components/Scene/ViewerHUD';

// ── Rotation helpers ───────────────────────────────────────────────────────────

const UE_ROTATIONS = [0, 90, 180, -90] as const;
function nextRotation(r: number): number {
  const idx = UE_ROTATIONS.indexOf(r as typeof UE_ROTATIONS[number]);
  return UE_ROTATIONS[(idx === -1 ? 0 : idx + 1) % 4];
}

// ── Catalog ────────────────────────────────────────────────────────────────────

const STRUCTURE_CATALOG = PIECE_CATALOG.filter(
  p => !p.templateId.toLowerCase().includes('_placeable'),
);

// ── Foundation guard ───────────────────────────────────────────────────────────

function hasFoundation(pieces: DesignerPiece[]): boolean {
  return pieces.some(p => {
    const entry = STRUCTURE_CATALOG.find(c => c.templateId === p.building_type);
    return entry?.isFoundation ?? p.building_type.toLowerCase().includes('foundation');
  });
}

// ── Component ──────────────────────────────────────────────────────────────────

export default function DesignerPage() {
  const { isSignedIn, getToken } = useAuth();

  const [pieces, setPieces] = useState<DesignerPiece[]>([]);
  const [placingTemplate, setPlacingTemplate] = useState<string | null>(null);
  const [placingRotation, setPlacingRotation] = useState(0);
  const [selectedPieceId, setSelectedPieceId] = useState<string | null>(null);
  const [viewerMode, setViewerMode] = useState<'orbit' | 'fly'>('orbit');
  const [locked, setLocked] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(true);
  const [replaceSourceId, setReplaceSourceId] = useState<string | null>(null);

  const counterRef = useRef(0);
  const importInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<DesignerCanvasHandle | null>(null);

  // Track pointer lock for crosshair
  useEffect(() => {
    const onChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onChange);
    return () => document.removeEventListener('pointerlockchange', onChange);
  }, []);

  // Space toggles the palette (skip when focus is in an input or pointer is locked)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== ' ') return;
      const tag = (document.activeElement as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (document.pointerLockElement) return;
      e.preventDefault();
      setPaletteOpen(p => !p);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, []);

  // ── Piece placement ────────────────────────────────────────────────────────

  const handlePlace = (x: number, y: number, z: number, rotation: number) => {
    if (!placingTemplate) return;
    const id = `d_${++counterRef.current}`;
    setPieces(prev => [...prev, { id, building_type: placingTemplate, x, y, z, rotation }]);
  };

  const handleSelectPiece = (id: string | null) => {
    if (id !== replaceSourceId) setReplaceSourceId(null);
    setSelectedPieceId(id);
    if (id) setPlacingTemplate(null);
  };

  const handleDeleteSelected = (id: string) => {
    setPieces(prev => prev.filter(p => p.id !== id));
    setSelectedPieceId(null);
  };

  const handleRotateSelected = (id: string) => {
    setPieces(prev => prev.map(p =>
      p.id === id ? { ...p, rotation: nextRotation(p.rotation) } : p,
    ));
  };

  const replaceMode = useMemo(() => {
    if (!replaceSourceId) return null;
    const src = pieces.find(p => p.id === replaceSourceId);
    if (!src) return null;
    const count = pieces.filter(p => p.building_type === src.building_type).length;
    return { instanceId: replaceSourceId, building_type: src.building_type, count };
  }, [replaceSourceId, pieces]);

  const handleStartReplace = (instanceId: string) => {
    setReplaceSourceId(instanceId);
    setPaletteOpen(true);
  };

  const handleReplaceOne = (newType: string) => {
    if (!replaceMode) return;
    setPieces(prev =>
      prev.map(p => p.id === replaceMode.instanceId ? { ...p, building_type: newType } : p),
    );
    toast.success('Replaced 1 piece');
  };

  const handleReplaceAll = (newType: string) => {
    if (!replaceMode) return;
    const { building_type: oldType, count } = replaceMode;
    setPieces(prev =>
      prev.map(p => p.building_type === oldType ? { ...p, building_type: newType } : p),
    );
    toast.success(`Replaced ${count} piece${count !== 1 ? 's' : ''}`);
  };

  const handleExitReplaceMode = () => setReplaceSourceId(null);

  const foundationPlaced = hasFoundation(pieces);

  const selectTemplate = (templateId: string) => {
    const entry = STRUCTURE_CATALOG.find(c => c.templateId === templateId);
    if (!foundationPlaced && !entry?.isFoundation) return;
    setReplaceSourceId(null);
    setPlacingTemplate(templateId);
    setPlacingRotation(0);
    setSelectedPieceId(null);
  };

  // ── Import / Export / Save ─────────────────────────────────────────────────

  const handleImport = (text: string) => {
    try {
      const solido = JSON.parse(text) as {
        instances?: { building_type: string; x: number; y: number; z: number; rotation?: number }[];
      };
      const imported: DesignerPiece[] = (solido.instances ?? []).map(inst => ({
        id: `d_${++counterRef.current}`,
        building_type: inst.building_type,
        x: inst.x,
        y: inst.y,
        z: inst.z,
        rotation: inst.rotation ?? 0,
      }));
      setPieces(imported);
      setSelectedPieceId(null);
      setPlacingTemplate(null);
      toast.success(`Imported ${imported.length} piece${imported.length !== 1 ? 's' : ''}`);
    } catch {
      toast.danger('Could not parse blueprint — is it a valid Solido JSON file?');
    }
  };

  const handleExport = () => {
    const solido = {
      instances: pieces.map(p => ({
        building_type: p.building_type,
        x: p.x,
        y: p.y,
        z: p.z,
        rotation: p.rotation,
      })),
      placeables: [],
      pentashields: [],
    };
    const blob = new Blob([JSON.stringify(solido, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'blueprint.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSave = async () => {
    if (!isSignedIn) return;
    const token = await getToken();
    if (!token) return;
    const solido = {
      instances: pieces.map(p => ({
        building_type: p.building_type,
        x: p.x,
        y: p.y,
        z: p.z,
        rotation: p.rotation,
      })),
      placeables: [],
      pentashields: [],
    };
    const blob = new Blob([JSON.stringify(solido, null, 2)], { type: 'application/json' });
    const form = new FormData();
    form.append('title', 'Untitled Design');
    form.append('is_public', '0');
    form.append('file', blob, 'blueprint.json');
    try {
      const res = await fetch('/api/blueprints', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) throw new Error(`Save failed: ${res.status}`);
      const data = await res.json() as { id: string };
      toast.success(`Blueprint saved — view it in your account (ID: ${data.id})`);
    } catch {
      toast.danger('Could not save blueprint');
    }
  };

  // ── Derived ────────────────────────────────────────────────────────────────

  const selectedPiece = selectedPieceId
    ? (pieces.find(p => p.id === selectedPieceId) ?? null)
    : null;

  const selectedCatalogEntry = selectedPiece
    ? (STRUCTURE_CATALOG.find(c => c.templateId === selectedPiece.building_type) ?? null)
    : null;

  const placingEntry = placingTemplate
    ? (STRUCTURE_CATALOG.find(p => p.templateId === placingTemplate) ?? null)
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-[calc(100vh-52px)] flex-col overflow-hidden bg-[#0a0a0f]">

      {/* Beta banner */}
      <div className="flex shrink-0 items-center gap-3 border-b border-amber-900/40 bg-amber-950/50 px-4 py-2.5 backdrop-blur-sm">
        <Icon icon="lucide:flask-conical" width={14} height={14} className="shrink-0 text-amber-400/80" />
        <p className="text-[12px] text-amber-200/75">
          <span className="font-semibold text-amber-300">Designer is in beta.</span>
          {' '}Layouts and snapping logic are still evolving — exported files may not produce valid Solido designs and are subject to change. Some actions may cause the server to restart or client to crash. Use at your own risk.
        </p>
      </div>

      {/* Canvas + Palette stacked vertically */}
      <div className="flex flex-1 flex-col overflow-hidden">

        {/* Canvas area */}
        <div className="relative flex-1 overflow-hidden">
          <DesignerCanvas
            ref={canvasRef}
            pieces={pieces}
            placingTemplate={placingTemplate}
            placingRotation={placingRotation}
            selectedPieceId={selectedPieceId}
            onPlace={handlePlace}
            onSelectPiece={handleSelectPiece}
            onDeleteSelected={handleDeleteSelected}
            onRotatePlacing={() => setPlacingRotation(r => nextRotation(r))}
            onCancelPlacing={() => setPlacingTemplate(null)}
            onModeChange={setViewerMode}
            onRotateSelected={handleRotateSelected}
          />

          {/* Hidden file input for import */}
          <input
            ref={importInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={e => {
              const f = e.target.files?.[0];
              if (!f) return;
              f.text().then(handleImport).catch(() => toast.danger('Could not read file'));
              e.target.value = '';
            }}
          />

          {/* Actions menu — top right */}
          <ActionsMenu
            isSignedIn={!!isSignedIn}
            pieceCount={pieces.length}
            onSave={handleSave}
            onExport={handleExport}
            onImport={() => importInputRef.current?.click()}
            onClear={() => { setPieces([]); setSelectedPieceId(null); setPlacingTemplate(null); }}
          />

          {/* Crosshair in fly+locked mode */}
          {locked && (
            <div className="pointer-events-none absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 select-none text-white/70">
              <Icon icon="lucide:crosshair" width={20} height={20} />
            </div>
          )}

          {/* Control tips */}
          <ViewerHUD
            mode={viewerMode}
            locked={locked}
            pieceSelected={!!selectedPiece}
            isOwner={false}
            isEditMode={false}
            paletteClosed={!paletteOpen}
          />

          {/* Placing indicator — top left, shows active piece name */}
          {placingTemplate && (
            <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 rounded-[2px] border border-white/10 bg-black/60 px-3 py-1.5 backdrop-blur-sm">
              {placingEntry?.iconPath && (
                <img
                  src={placingEntry.iconPath}
                  alt=""
                  width={18}
                  height={18}
                  className="shrink-0 rounded object-contain"
                />
              )}
              <span className="text-[11px] text-[#c8a84b]">
                {placingEntry?.name ?? placingTemplate}
              </span>
              <button
                className="pointer-events-auto cursor-pointer text-white/40 hover:text-white/70"
                onClick={() => setPlacingTemplate(null)}
              >
                <Icon icon="lucide:x" width={12} height={12} />
              </button>
            </div>
          )}

          {/* Placement HUD — bottom centre */}
          {placingTemplate && (
            <div className="pointer-events-none absolute bottom-5 left-1/2 -translate-x-1/2 rounded-[2px] border border-white/10 bg-black/70 px-4 py-2 text-center text-[12px] text-white/70 backdrop-blur-sm">
              <span className="text-white/90">Click</span> to place
              &nbsp;·&nbsp;
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono text-white/80">R</kbd> rotate ({placingRotation}°)
              &nbsp;·&nbsp;
              <span className="text-[#c8a84b]/80">snaps to sockets</span>
              &nbsp;·&nbsp;
              <kbd className="rounded bg-white/10 px-1.5 py-0.5 text-[11px] font-mono text-white/80">Esc</kbd> cancel
            </div>
          )}

          {/* Selected piece info — bottom left */}
          {selectedPiece && !placingTemplate && (
            <div className="pointer-events-none absolute bottom-4 left-4 flex max-w-[280px] select-none flex-col gap-1 rounded-[2px] border border-white/15 bg-[rgba(20,20,28,0.92)] px-3.5 py-2.5 text-[11px] text-white backdrop-blur">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/40">
                <Icon icon="lucide:box-select" width={11} height={11} />
                {selectedCatalogEntry?.faction ?? 'Piece'}
              </div>
              <div className="break-all text-xs font-semibold text-[#ffd84a]">
                {selectedCatalogEntry?.name ?? selectedPiece.building_type}
              </div>
              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-white/55">
                <span className="inline-flex items-center gap-1">
                  <Icon icon="lucide:rotate-cw" width={10} height={10} />
                  {selectedPiece.rotation}°
                </span>
                <span className="inline-flex items-center gap-1">
                  <Icon icon="lucide:move-3d" width={10} height={10} />
                  {selectedPiece.x}, {selectedPiece.y}, {selectedPiece.z}
                </span>
              </div>
              <div className="text-[10px] text-white/30">
                <kbd className="rounded bg-white/10 px-1 py-px font-mono text-white/50">R</kbd> rotate
                &nbsp;·&nbsp;
                <kbd className="rounded bg-white/10 px-1 py-px font-mono text-white/50">Del</kbd> remove
              </div>
              <div className="flex gap-1.5 pt-0.5">
                <button
                  className="pointer-events-auto cursor-pointer rounded-[2px] border border-[#c8a84b55] bg-[#c8a84b12] px-2 py-0.5 text-[10px] text-[#c8a84b] transition-colors hover:bg-[#c8a84b22]"
                  onClick={() => handleStartReplace(selectedPiece.id)}
                >
                  Replace
                </button>
                <button
                  className="pointer-events-auto cursor-pointer rounded-[2px] border border-white/15 bg-white/5 px-2 py-0.5 text-[10px] text-white/60 transition-colors hover:bg-white/10 hover:text-white/90"
                  onClick={() => handleStartReplace(selectedPiece.id)}
                >
                  Replace All ({pieces.filter(p => p.building_type === selectedPiece.building_type).length})
                </button>
              </div>
            </div>
          )}

          {/* Empty state */}
          {pieces.length === 0 && !placingTemplate && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <div className="text-center">
                <Icon icon="lucide:layout-grid" width={40} height={40} className="mx-auto mb-3 text-white/10" />
                <p className="text-sm text-white/20">Press Space to open the palette and start building</p>
              </div>
            </div>
          )}

          {/* Pull tab — visible when palette is closed */}
          {!paletteOpen && (
            <button
              onClick={() => setPaletteOpen(true)}
              className="absolute bottom-0 left-1/2 z-30 -translate-x-1/2 cursor-pointer rounded-t-[2px] border border-b-0 border-white/15 bg-[#13131a] px-6 py-1 text-[10px] text-white/35 transition-colors hover:text-white/60"
            >
              ▲ Palette · Space
            </button>
          )}
        </div>

        {/* Palette Drawer */}
        <PaletteDrawer
          isOpen={paletteOpen}
          onToggle={() => setPaletteOpen(p => !p)}
          pieces={STRUCTURE_CATALOG}
          placingTemplate={placingTemplate}
          foundationPlaced={foundationPlaced}
          onSelectTemplate={selectTemplate}
          replaceMode={replaceMode}
          onExitReplaceMode={handleExitReplaceMode}
          onReplaceOne={handleReplaceOne}
          onReplaceAll={handleReplaceAll}
        />

      </div>
    </div>
  );
}
