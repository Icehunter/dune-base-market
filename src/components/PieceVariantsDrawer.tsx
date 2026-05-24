import { useMemo } from "react";
import { Drawer, Select, ListBox } from "@heroui/react";
import { Icon } from "@iconify/react";
import { findEquivalents, getSetLabel, getDisplayName, getIconUrl } from "../data/pieceEquivalents";
import type { RawBlueprint } from "../stores/buildingStore";

interface TemplateBreakdownEntry {
  templateId: string;        // current (post-override) templateId in the displayed scene
  originalTemplateId: string; // pre-override templateId — key for overrides map
  count: number;
}

function buildTemplateBreakdown(
  raw: RawBlueprint | undefined,
  overrides: Record<string, string>,
): TemplateBreakdownEntry[] {
  if (!raw) return [];
  const counts: Record<string, number> = {};
  const all = [
    ...(raw.instances ?? []).map((i) => i.building_type),
    ...(raw.placeables ?? []).map((p) => p.building_type),
  ];
  for (const t of all) counts[t] = (counts[t] ?? 0) + 1;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([originalTemplateId, count]) => ({
      originalTemplateId,
      templateId: overrides[originalTemplateId] ?? originalTemplateId,
      count,
    }));
}

interface Props {
  open: boolean;
  onClose: () => void;
  raw: RawBlueprint | undefined;
  overrides: Record<string, string>;
  onChange: (next: Record<string, string>) => void;
  /** Hover-preview: swap scene to the hovered template without changing React state. */
  onPreview: (originalId: string, targetId: string) => void;
  /** Hover-leave: restore to whatever the committed override is for this piece. */
  onPreviewEnd: (originalId: string) => void;
  /** Pulled in via prop so this lazy chunk doesn't have to re-import the class preset. */
  btnGhost: string;
}

function PieceIcon({ src }: { src: string | undefined }) {
  if (!src) return <span className="w-6 h-6 shrink-0" />;
  return (
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      loading="lazy"
      className="w-6 h-6 shrink-0 rounded object-contain bg-white/5"
    />
  );
}

export function PieceVariantsDrawer({
  open, onClose, raw, overrides, onChange, onPreview, onPreviewEnd, btnGhost,
}: Props) {
  const breakdown = useMemo(() => buildTemplateBreakdown(raw, overrides), [raw, overrides]);
  const swappable = useMemo(
    () => breakdown.filter((row) => findEquivalents(row.originalTemplateId).length > 0),
    [breakdown],
  );
  const overrideCount = Object.keys(overrides).length;

  return (
    <Drawer
      isOpen={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      {/* Transparent backdrop — the user explicitly wanted no dimming behind the drawer. */}
      <Drawer.Backdrop variant="transparent">
        <Drawer.Content placement="right">
          <Drawer.Dialog className="w-full sm:w-[360px] max-w-full">
            <Drawer.CloseTrigger />
            <Drawer.Header>
              <Drawer.Heading>Piece variants</Drawer.Heading>
              <p className="text-xs text-muted">
                {swappable.length} piece types with alternates
                {overrideCount > 0 && ` · ${overrideCount} swapped`}
              </p>
            </Drawer.Header>

            <Drawer.Body className="flex flex-col gap-2">
              {overrideCount > 0 && (
                <button onClick={() => onChange({})} className={`${btnGhost} px-2.5 py-1.5 text-xs`}>
                  <Icon icon="lucide:rotate-ccw" width={12} height={12} />
                  Reset all swaps
                </button>
              )}

              {swappable.map((row) => {
                const equivalents = findEquivalents(row.originalTemplateId);
                const currentTemplate = overrides[row.originalTemplateId] ?? row.originalTemplateId;
                const isSwapped = currentTemplate !== row.originalTemplateId;
                return (
                  <div
                    key={row.originalTemplateId}
                    className={`flex flex-col gap-1.5 rounded-md border bg-white/5 p-2.5 ${
                      isSwapped ? "border-accent/60" : "border-white/10"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <PieceIcon src={getIconUrl(row.originalTemplateId)} />
                      <div className="flex items-baseline justify-between flex-1 min-w-0">
                        <span className="text-sm font-semibold text-white truncate">{getDisplayName(row.originalTemplateId)}</span>
                        <span className="text-xs text-white/40 ml-2 shrink-0">×{row.count}</span>
                      </div>
                    </div>
                    <div className="text-xs text-white/45">from {getSetLabel(row.originalTemplateId)}</div>
                    <Select
                      className="w-full"
                      selectedKey={currentTemplate}
                      onSelectionChange={(key) => {
                        const v = String(key);
                        const next = { ...overrides };
                        if (v === row.originalTemplateId) delete next[row.originalTemplateId];
                        else next[row.originalTemplateId] = v;
                        onChange(next);
                      }}
                      aria-label={`Variant for ${getDisplayName(row.originalTemplateId)}`}
                    >
                      <Select.Trigger>
                        <Select.Value />
                        <Select.Indicator />
                      </Select.Trigger>
                      <Select.Popover>
                        <ListBox onAction={() => {/* selection handled by Select.onSelectionChange */}}>
                          <ListBox.Item
                            id={row.originalTemplateId}
                            textValue={`${getSetLabel(row.originalTemplateId)} (original)`}
                            onHoverStart={() => onPreview(row.originalTemplateId, row.originalTemplateId)}
                            onHoverEnd={() => onPreviewEnd(row.originalTemplateId)}
                          >
                            <div className="flex items-center gap-2">
                              <PieceIcon src={getIconUrl(row.originalTemplateId)} />
                              <span>{getSetLabel(row.originalTemplateId)} (original)</span>
                            </div>
                            <ListBox.ItemIndicator />
                          </ListBox.Item>
                          {equivalents.map((eq) => (
                            <ListBox.Item
                              key={eq.templateId}
                              id={eq.templateId}
                              textValue={eq.setLabel}
                              onHoverStart={() => onPreview(row.originalTemplateId, eq.templateId)}
                              onHoverEnd={() => onPreviewEnd(row.originalTemplateId)}
                            >
                              <div className="flex items-center gap-2">
                                <PieceIcon src={eq.iconUrl} />
                                <span>{eq.setLabel}</span>
                              </div>
                              <ListBox.ItemIndicator />
                            </ListBox.Item>
                          ))}
                        </ListBox>
                      </Select.Popover>
                    </Select>
                  </div>
                );
              })}
            </Drawer.Body>
          </Drawer.Dialog>
        </Drawer.Content>
      </Drawer.Backdrop>
    </Drawer>
  );
}

export default PieceVariantsDrawer;
