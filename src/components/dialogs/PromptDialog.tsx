import { useEffect, useRef, useState } from "react";
import { Modal, Button } from "@heroui/react";
import { Icon } from "@iconify/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  /** Initial value seeded into the input when the dialog opens. */
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /**
   * Called with the trimmed input string on confirm. Empty/whitespace input
   * keeps the confirm button disabled — callers don't need to validate non-empty.
   */
  onConfirm: (value: string) => void | Promise<void>;
}

// Text-input prompt modal. Replaces window.prompt() so the UX stays inside the app
// (themed, accessible, keyboard-friendly). Input clears on close so the next open
// starts fresh (unless caller seeds via defaultValue).
export function PromptDialog({
  isOpen, onClose, title, description, defaultValue = "",
  placeholder, confirmLabel = "Save", cancelLabel = "Cancel", onConfirm,
}: Props) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef<HTMLInputElement>(null);

  // Seed + focus when opening; clear on close so reopening starts blank.
  // (Sync-from-prop pattern; the alternative is wrapping every close path.)
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (isOpen) {
      setValue(defaultValue);
      // Wait a tick for the modal to mount before focusing.
      requestAnimationFrame(() => inputRef.current?.select());
    } else {
      setValue("");
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [isOpen, defaultValue]);

  const trimmed = value.trim();
  const canSubmit = trimmed.length > 0;

  async function handleSubmit() {
    if (!canSubmit) return;
    await onConfirm(trimmed);
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[420px]">
            <Modal.Header>
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body className="flex flex-col gap-3">
              {description && <p className="m-0 text-sm text-white/60">{description}</p>}
              <input
                ref={inputRef}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") handleSubmit(); }}
                placeholder={placeholder}
                className="rounded-[2px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
              />
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">{cancelLabel}</Button>
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
