import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@heroui/react";
import { Icon } from "@iconify/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  /** Header copy — "Save as new variant" or "Edit variant" depending on context. */
  title: string;
  /** Initial values seeded into the form when opening. Cleared on close. */
  defaultName?: string;
  defaultDescription?: string;
  /** Confirm button label. */
  confirmLabel?: string;
  /** Receives both fields (trimmed) on confirm. Description may be empty. */
  onConfirm: (values: { name: string; description: string }) => void | Promise<void>;
}

const DESCRIPTION_MAX = 280;

// Two-field editor (name + optional description) used for "save as new" and
// "edit/rename" flows. Replaces the single-input PromptDialog where we need
// more than just a name.
export function VariantEditDialog({
  isOpen, onClose, title, defaultName = "", defaultDescription = "",
  confirmLabel = "Save", onConfirm,
}: Props) {
  const [name, setName] = useState(defaultName);
  const [description, setDescription] = useState(defaultDescription);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isOpen) {
      setName(defaultName);
      setDescription(defaultDescription);
      requestAnimationFrame(() => nameRef.current?.select());
    } else {
      setName("");
      setDescription("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, defaultName, defaultDescription]);

  const trimmedName = name.trim();
  const trimmedDesc = description.trim();
  const canSubmit = trimmedName.length > 0 && trimmedDesc.length <= DESCRIPTION_MAX;

  async function handleSubmit() {
    if (!canSubmit) return;
    await onConfirm({ name: trimmedName, description: trimmedDesc });
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[460px]">
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Name</label>
                <input
                  ref={nameRef}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  maxLength={60}
                  onKeyDown={(e) => {
                    // Enter on the name field submits if it's the only one populated;
                    // if user wants to add description, they can tab + type.
                    if (e.key === "Enter") handleSubmit();
                  }}
                  className="rounded-[2px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>
              <div className="flex flex-col gap-1">
                <div className="flex items-baseline justify-between">
                  <label className="text-[10px] uppercase tracking-wide text-white/50">
                    Description <span className="opacity-60 normal-case">(optional)</span>
                  </label>
                  <span className="text-[10px] text-white/35">
                    {trimmedDesc.length}/{DESCRIPTION_MAX}
                  </span>
                </div>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  maxLength={DESCRIPTION_MAX}
                  rows={3}
                  placeholder="What makes this variant different?"
                  className="resize-none rounded-[2px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none placeholder:text-white/30 focus:border-accent"
                />
              </div>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">Cancel</Button>
              <Button variant="primary" isDisabled={!canSubmit} onPress={handleSubmit}>
                <Icon icon="lucide:check" width={14} height={14} />
                {confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
