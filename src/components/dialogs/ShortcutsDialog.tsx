import { Modal } from "@heroui/react";
import { Icon } from "@iconify/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Owner-only shortcuts (rotation edit mode) are hidden for non-owners. */
  showOwnerShortcuts?: boolean;
}

interface Shortcut { keys: string[]; label: string }
interface Section { title: string; icon: string; items: Shortcut[] }

const SECTIONS: Section[] = [
  {
    title: "View",
    icon: "lucide:eye",
    items: [
      { keys: ["Left drag"],  label: "Rotate base (orbit mode)" },
      { keys: ["Right drag"], label: "Pan (orbit mode)" },
      { keys: ["Scroll"],     label: "Zoom in / out" },
      { keys: ["Click"],      label: "Select piece" },
      { keys: ["Ctrl", "M"],  label: "Toggle fly mode" },
    ],
  },
  {
    title: "Fly mode",
    icon: "lucide:plane",
    items: [
      { keys: ["W A S D"],   label: "Move horizontally" },
      { keys: ["Space"],     label: "Move up" },
      { keys: ["Shift"],     label: "Move down (or move faster)" },
      { keys: ["Esc"],       label: "Release mouse (stay in fly)" },
      { keys: ["Click"],     label: "Re-lock pointer / select piece" },
    ],
  },
];

const OWNER_SECTION: Section = {
  title: "Rotation edit mode",
  icon: "lucide:rotate-3d",
  items: [
    { keys: ["Ctrl", "R"],     label: "Toggle edit mode" },
    { keys: ["R"],             label: "Cycle rotation fix (selected piece)" },
    { keys: ["Shift", "R"],    label: "Cycle backwards" },
    { keys: ["Backspace"],     label: "Clear override at current rotation" },
  ],
};

export function ShortcutsDialog({ isOpen, onClose, showOwnerShortcuts }: Props) {
  const sections = showOwnerShortcuts ? [...SECTIONS, OWNER_SECTION] : SECTIONS;

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[480px]">
            <Modal.Header>
              <Modal.Heading>Keyboard shortcuts</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-4">
              {sections.map((sec) => (
                <div key={sec.title} className="flex flex-col gap-2">
                  <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-white/45">
                    <Icon icon={sec.icon} width={12} height={12} />
                    {sec.title}
                  </div>
                  <div className="flex flex-col">
                    {sec.items.map((it) => (
                      <div
                        key={it.label}
                        className="flex items-center justify-between border-b border-white/5 py-1.5 last:border-b-0"
                      >
                        <span className="text-xs text-white/75">{it.label}</span>
                        <span className="flex shrink-0 gap-1">
                          {it.keys.map((k) => (
                            <kbd
                              key={k}
                              className="inline-flex min-w-[22px] items-center justify-center rounded-[2px] border border-white/15 bg-black/40 px-1.5 py-0.5 text-[10px] font-mono text-white/80"
                            >
                              {k}
                            </kbd>
                          ))}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </Modal.Body>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
