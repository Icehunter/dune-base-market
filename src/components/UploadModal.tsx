import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@clerk/react';
import { Modal, Button, toast } from '@heroui/react';
import { Icon } from '@iconify/react';
import { uploadBlueprint } from '../lib/api';
import type { BlueprintMeta } from '../lib/api';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  onUploaded: (blueprint: BlueprintMeta) => void;
}

export default function UploadModal({ isOpen, onClose, onUploaded }: Props) {
  const { getToken } = useAuth();
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Clear all form state when the modal closes so reopening starts fresh.
  useEffect(() => {
    if (!isOpen) {
      setTitle('');
      setFile(null);
      setIsPublic(true);
      setError(null);
    }
  }, [isOpen]);

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    const dropped = e.dataTransfer.files[0];
    if (dropped) validateAndSetFile(dropped);
  }

  function validateAndSetFile(f: File) {
    setError(null);
    if (!f.name.endsWith('.json')) { setError('File must be a .json blueprint'); return; }
    if (f.size > 2 * 1024 * 1024) { setError('File too large (max 2MB)'); return; }
    setFile(f);
  }

  async function handleSubmit() {
    if (!title.trim()) { setError('Title is required'); return; }
    if (title.length > 80) { setError('Title must be 80 characters or less'); return; }
    if (!file) { setError('Please select a blueprint JSON file'); return; }

    // Validate JSON client-side
    try {
      const text = await file.text();
      JSON.parse(text);
    } catch {
      setError('Invalid JSON file — could not parse blueprint');
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const result = await uploadBlueprint({ title: title.trim(), is_public: isPublic, file }, getToken);
      const newBlueprint: BlueprintMeta = {
        id: result.id,
        title: title.trim(),
        username: 'you',
        is_public: isPublic ? 1 : 0,
        piece_count: null,
        file_size: file.size,
        tags: [],
        download_count: 0,
        variant_count: 0,
        total_downloads: 0,
        rating_count: 0,
        snapshot_url: null,
        created_at: new Date().toISOString(),
      };
      onUploaded(newBlueprint);
      toast.success(`Uploaded "${title.trim()}"`);
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Upload failed';
      setError(msg);
      toast.danger(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Modal isOpen={isOpen} onOpenChange={(o) => { if (!o && !loading) onClose(); }}>
      <Modal.Backdrop>
        <Modal.Container>
          <Modal.Dialog className="sm:max-w-[460px]">
            <Modal.Header>
              <Modal.Heading>Upload Blueprint</Modal.Heading>
              <p className="m-0 mt-1 text-xs text-white/45">
                Share your Dune base with the community.
              </p>
            </Modal.Header>

            <Modal.Body className="flex flex-col gap-4">
              {/* Title */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide text-white/50">Blueprint Name</label>
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={80}
                  placeholder="My Fortress Design"
                  className="box-border w-full rounded-[2px] border border-white/15 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-accent"
                />
              </div>

              {/* File drop zone */}
              <div className="flex flex-col gap-1.5">
                <label className="text-[10px] uppercase tracking-wide text-white/50">JSON File</label>
                <div
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => inputRef.current?.click()}
                  className={`flex cursor-pointer flex-col items-center gap-1.5 rounded-[2px] border-2 border-dashed px-4 py-5 text-center text-xs transition-colors ${
                    file
                      ? 'border-[#c8a84b] bg-[rgba(200,168,75,0.05)] text-[#c8a84b]'
                      : 'border-white/15 bg-black/30 text-white/40 hover:border-white/25 hover:text-white/60'
                  }`}
                >
                  {file ? (
                    <>
                      <Icon icon="lucide:file-check-2" width={20} height={20} />
                      <span className="font-medium">{file.name}</span>
                      <span className="text-[10px] opacity-70">{(file.size / 1024).toFixed(1)} KB</span>
                    </>
                  ) : (
                    <>
                      <Icon icon="lucide:upload-cloud" width={22} height={22} />
                      <span>Drop a .json blueprint here, or click to browse</span>
                    </>
                  )}
                  <input
                    ref={inputRef}
                    type="file"
                    accept=".json"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
                  />
                </div>
              </div>

              {/* Visibility toggle */}
              <div className="flex items-center justify-between gap-3 rounded-[2px] border border-white/10 bg-black/25 px-3 py-2.5">
                <div className="flex flex-col">
                  <span className="text-sm text-white">Make public</span>
                  <span className="text-[11px] text-white/45">
                    Anyone can view and download this blueprint
                  </span>
                </div>
                <button
                  onClick={() => setIsPublic((v) => !v)}
                  aria-pressed={isPublic}
                  aria-label="Toggle public visibility"
                  className={`relative h-[22px] w-10 shrink-0 cursor-pointer rounded-full border-none transition-colors ${
                    isPublic ? 'bg-[#c8a84b]' : 'bg-white/15'
                  }`}
                >
                  <span
                    className="absolute top-[3px] h-4 w-4 rounded-full bg-white transition-[left]"
                    style={{ left: isPublic ? 21 : 3 }}
                  />
                </button>
              </div>

              {/* Error */}
              {error && (
                <div className="inline-flex items-start gap-2 rounded-[2px] border border-[#4a2a2a] bg-[#2e1a1a] px-2.5 py-2 text-xs text-[#e05555]">
                  <Icon icon="lucide:triangle-alert" width={14} height={14} className="mt-0.5 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </Modal.Body>

            <Modal.Footer>
              <Button slot="close" variant="secondary" isDisabled={loading}>
                Cancel
              </Button>
              <Button variant="primary" isDisabled={loading} onPress={handleSubmit}>
                {loading ? (
                  <>
                    <Icon icon="lucide:loader-2" width={14} height={14} className="animate-spin" />
                    Uploading…
                  </>
                ) : (
                  <>
                    <Icon icon="lucide:upload" width={14} height={14} />
                    Upload Blueprint
                  </>
                )}
              </Button>
            </Modal.Footer>
          </Modal.Dialog>
        </Modal.Container>
      </Modal.Backdrop>
    </Modal>
  );
}
