import { Modal, Button } from "@heroui/react";
import { Icon } from "@iconify/react";

interface Props {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Set true for destructive confirms — switches the action button to the danger variant. */
  destructive?: boolean;
  onConfirm: () => void | Promise<void>;
}

// Yes/no confirmation modal. Replaces window.confirm() so the look matches the
// rest of the app and destructive actions get visual weight via danger styling.
export function ConfirmDialog({
  isOpen, onClose, title, message,
  confirmLabel = "Confirm", cancelLabel = "Cancel",
  destructive = false, onConfirm,
}: Props) {
  async function handleConfirm() {
    await onConfirm();
    onClose();
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[400px]">
            <Modal.Header>
              {destructive && (
                <Modal.Icon className="bg-[#3a1f1f] text-[#e05555]">
                  <Icon icon="lucide:triangle-alert" width={18} height={18} />
                </Modal.Icon>
              )}
              <Modal.Heading>{title}</Modal.Heading>
            </Modal.Header>
            <Modal.Body>
              <p className="m-0 text-sm text-white/70">{message}</p>
            </Modal.Body>
            <Modal.Footer>
              <Button slot="close" variant="secondary">{cancelLabel}</Button>
              <Button variant={destructive ? "danger" : "primary"} onPress={handleConfirm}>
                {confirmLabel}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
