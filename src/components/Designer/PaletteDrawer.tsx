// src/components/Designer/PaletteDrawer.tsx
import { useMemo, useState } from 'react';
import { Icon } from '@iconify/react';
import { FACTION_LABELS } from '../../data/pieceEquivalents';
import type { PieceDefinition } from '../../data/catalog';

const ORDERED_FACTIONS = [
  'Atreides', 'Harkonnen', 'Choam', 'Choam2', 'Choam3',
  'Smuggler', 'Watershippers', 'ExtraSets', 'Fremen', 'BeneGesserit', 'Generic',
];

const CATEGORY_ORDER = [
  'Foundation', 'Wall', 'Floor', 'Door', 'Pillar', 'Ramp', 'Rooftop', 'Decoration',
] as const;

interface ReplaceMode {
  instanceId: string;
  building_type: string;
  count: number;
}

interface Props {
  isOpen: boolean;
  onToggle: () => void;
  pieces: PieceDefinition[];
  placingTemplate: string | null;
  foundationPlaced: boolean;
  onSelectTemplate: (templateId: string) => void;
  replaceMode: ReplaceMode | null;
  selectedTile: string | null;
  onTileSelect: (id: string | null) => void;
  onExitReplaceMode: () => void;
}

export function PaletteDrawer({
  isOpen,
  onToggle,
  pieces,
  placingTemplate,
  foundationPlaced,
  onSelectTemplate,
  replaceMode,
  selectedTile,
  onTileSelect,
  onExitReplaceMode,
}: Props) {
  const [activeFaction, setActiveFaction] = useState<string | null>(null);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const catalogEntry = replaceMode
    ? (pieces.find(p => p.templateId === replaceMode.building_type) ?? null)
    : null;

  const factions = useMemo(
    () => ORDERED_FACTIONS.filter(f => pieces.some(p => p.faction === f)),
    [pieces],
  );

  const categories = useMemo(() => {
    const base = activeFaction ? pieces.filter(p => p.faction === activeFaction) : pieces;
    return CATEGORY_ORDER.filter(c => base.some(p => p.category === c));
  }, [pieces, activeFaction]);

  const filtered = useMemo(() => {
    const base = pieces.filter(p => {
      if (activeFaction && p.faction !== activeFaction) return false;
      if (activeCategory && p.category !== activeCategory) return false;
      return true;
    });

    // Sort: (when showing all categories) category order → subtype → name
    //       (when category filtered) subtype → name
    const catIndex = (p: PieceDefinition) =>
      activeCategory ? 0 : CATEGORY_ORDER.indexOf(p.category as typeof CATEGORY_ORDER[number]);

    return [...base].sort((a, b) => {
      const ci = catIndex(a) - catIndex(b);
      if (ci !== 0) return ci;
      const si = a.buildableGroupType.localeCompare(b.buildableGroupType);
      if (si !== 0) return si;
      return a.name.localeCompare(b.name);
    });
  }, [pieces, activeFaction, activeCategory]);

  const setFaction = (f: string | null) => {
    setActiveFaction(f);
    setActiveCategory(null);
  };

  return (
    <div
      className="shrink-0 overflow-hidden border-t border-[#c8a84b55] bg-[#13131af5] backdrop-blur-sm transition-[max-height] duration-200 ease-out"
      style={{ maxHeight: isOpen ? '220px' : '0px' }}
    >
      {/* Replace mode banner */}
      {replaceMode && (
        <div className="flex items-center gap-2 border-b border-[#c8a84b30] bg-[#c8a84b0a] px-3 py-2">
          {catalogEntry?.iconPath ? (
            <img src={catalogEntry.iconPath} width={18} height={18} alt="" className="shrink-0 rounded object-contain" />
          ) : (
            <Icon icon="lucide:box" width={16} height={16} className="shrink-0 text-white/30" />
          )}
          <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-[#c8a84b]">
            Replacing {catalogEntry?.name ?? replaceMode.building_type}
            <span className="ml-1 font-normal text-[#c8a84b70]">×{replaceMode.count}</span>
          </span>
          <button
            onClick={() => { onExitReplaceMode(); onTileSelect(null); }}
            className="shrink-0 cursor-pointer text-white/30 transition-colors hover:text-white/70"
          >
            <Icon icon="lucide:x" width={13} height={13} />
          </button>
        </div>
      )}

      {/* Faction tabs */}
      <div className="flex items-stretch overflow-x-auto border-b border-white/10">
        <button
          onClick={() => setFaction(null)}
          className={`shrink-0 cursor-pointer border-b-2 px-3 py-2 text-[11px] transition-colors ${
            activeFaction === null
              ? 'border-[#c8a84b] font-bold text-[#c8a84b]'
              : 'border-transparent text-white/40 hover:text-white/70'
          }`}
        >
          All
        </button>
        {factions.map(f => (
          <button
            key={f}
            onClick={() => setFaction(activeFaction === f ? null : f)}
            className={`shrink-0 cursor-pointer whitespace-nowrap border-b-2 px-3 py-2 text-[11px] transition-colors ${
              activeFaction === f
                ? 'border-[#c8a84b] font-bold text-[#c8a84b]'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {FACTION_LABELS[f] ?? f}
          </button>
        ))}
        <div className="flex-1" />
        <button
          onClick={onToggle}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 border-l border-white/10 px-3 py-2 text-[10px] text-white/30 transition-colors hover:text-white/60"
        >
          <Icon icon="lucide:chevron-down" width={12} height={12} />
          Space
        </button>
      </div>

      {/* Category sub-tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-white/10 px-3 py-2">
        <button
          onClick={() => setActiveCategory(null)}
          className={`shrink-0 cursor-pointer rounded-[2px] border border-transparent px-2.5 py-1 text-[10px] transition-colors ${
            activeCategory === null ? 'bg-white/15 text-white' : 'text-white/40 hover:text-white/70'
          }`}
        >
          All
        </button>
        {categories.map(c => (
          <button
            key={c}
            onClick={() => setActiveCategory(activeCategory === c ? null : c)}
            className={`shrink-0 cursor-pointer whitespace-nowrap rounded-[2px] border px-2.5 py-1 text-[10px] transition-colors ${
              activeCategory === c
                ? 'border-white/20 bg-white/15 text-white'
                : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {c}
          </button>
        ))}
      </div>

      {/* Icon row — 80px tiles, single scrollable row */}
      <div className="flex gap-2 overflow-x-auto px-3 py-2">
        {filtered.length === 0 ? (
          <p className="py-4 text-[11px] text-white/25">No pieces</p>
        ) : (
          filtered.map(p => {
            const locked = !replaceMode && !foundationPlaced && !p.isFoundation;
            const active = placingTemplate === p.templateId;
            const isSelected = selectedTile === p.templateId;

            return (
              <button
                key={p.templateId}
                onClick={() => {
                  if (replaceMode) {
                    onTileSelect(isSelected ? null : p.templateId);
                  } else if (!locked) {
                    onSelectTemplate(p.templateId);
                  }
                }}
                disabled={locked}
                title={p.name}
                className={[
                  'flex w-[80px] shrink-0 flex-col items-center gap-1 rounded-[2px] border p-1 transition-colors',
                  locked ? 'cursor-not-allowed opacity-30' : 'cursor-pointer',
                  isSelected || active
                    ? 'border-[#c8a84b] bg-[#c8a84b18]'
                    : !locked
                    ? 'border-white/10 bg-white/[0.03] hover:border-white/25 hover:bg-white/[0.06]'
                    : 'border-white/10',
                ].join(' ')}
              >
                <div className="flex h-[52px] w-[60px] items-center justify-center rounded-[2px] bg-white/5">
                  {p.iconPath ? (
                    <img
                      src={p.iconPath}
                      alt=""
                      width={52}
                      height={52}
                      loading="lazy"
                      className="object-contain"
                    />
                  ) : (
                    <Icon icon="lucide:box" width={20} height={20} className="text-white/20" />
                  )}
                </div>
                <span
                  className={`w-full truncate text-center text-[8px] leading-tight ${
                    isSelected || active ? 'text-[#c8a84b]' : 'text-white/50'
                  }`}
                >
                  {p.name}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
