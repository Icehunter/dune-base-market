import { useState, useRef } from 'react';
import { useAuth } from '@clerk/react';
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
        created_at: new Date().toISOString(),
      };
      onUploaded(newBlueprint);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    setTitle('');
    setFile(null);
    setIsPublic(true);
    setError(null);
    onClose();
  }

  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.7)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 1000,
      }}
      onClick={(e) => { if (e.target === e.currentTarget) handleClose(); }}
    >
      <div
        style={{
          background: '#13131a',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 12,
          padding: 24,
          maxWidth: 420,
          width: '100%',
          margin: '0 16px',
        }}
      >
        <h2 style={{ color: '#fff', fontSize: 16, fontWeight: 700, margin: '0 0 4px' }}>
          Upload Blueprint
        </h2>
        <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 12, margin: '0 0 20px' }}>
          Share your Dune base with the community
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Title */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              Blueprint Name
            </label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={80}
              placeholder="My Fortress Design"
              style={{
                width: '100%',
                background: '#0a0a0f',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: 4,
                padding: '7px 10px',
                color: '#fff',
                fontSize: 13,
                boxSizing: 'border-box',
              }}
            />
          </div>

          {/* File drop zone */}
          <div>
            <label style={{ display: 'block', color: 'rgba(255,255,255,0.5)', fontSize: 11, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
              JSON File
            </label>
            <div
              onDrop={handleDrop}
              onDragOver={(e) => e.preventDefault()}
              onClick={() => inputRef.current?.click()}
              style={{
                background: '#0a0a0f',
                border: `1.5px dashed ${file ? '#c8a84b' : 'rgba(255,255,255,0.15)'}`,
                borderRadius: 6,
                padding: '20px 16px',
                textAlign: 'center',
                cursor: 'pointer',
                color: file ? '#c8a84b' : 'rgba(255,255,255,0.3)',
                fontSize: 12,
                transition: 'border-color 0.2s',
              }}
            >
              {file
                ? `📄 ${file.name} · ${(file.size / 1024).toFixed(1)}KB`
                : '⬆ Drop .json blueprint here or click to browse'}
              <input
                ref={inputRef}
                type="file"
                accept=".json"
                style={{ display: 'none' }}
                onChange={(e) => e.target.files?.[0] && validateAndSetFile(e.target.files[0])}
              />
            </div>
          </div>

          {/* Visibility toggle */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#0a0a0f', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 6, padding: '10px 12px' }}>
            <div>
              <p style={{ color: '#fff', fontSize: 13, margin: 0 }}>Make public</p>
              <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 11, margin: '2px 0 0' }}>
                Anyone can view and download this blueprint
              </p>
            </div>
            <button
              onClick={() => setIsPublic(!isPublic)}
              style={{
                width: 40,
                height: 22,
                borderRadius: 11,
                background: isPublic ? '#c8a84b' : 'rgba(255,255,255,0.15)',
                border: 'none',
                cursor: 'pointer',
                position: 'relative',
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
            >
              <span style={{
                position: 'absolute',
                top: 3,
                left: isPublic ? 21 : 3,
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: '#fff',
                transition: 'left 0.2s',
              }} />
            </button>
          </div>

          {/* Error */}
          {error && (
            <p style={{ color: '#e05555', fontSize: 12, margin: 0 }}>{error}</p>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <button
            onClick={handleClose}
            disabled={loading}
            style={{
              background: 'transparent',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: 6,
              color: 'rgba(255,255,255,0.5)',
              padding: '7px 16px',
              fontSize: 13,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              background: loading ? 'rgba(200,168,75,0.5)' : '#c8a84b',
              border: 'none',
              borderRadius: 6,
              color: '#000',
              fontWeight: 700,
              padding: '7px 16px',
              fontSize: 13,
              cursor: loading ? 'default' : 'pointer',
            }}
          >
            {loading ? 'Uploading...' : 'Upload Blueprint'}
          </button>
        </div>
      </div>
    </div>
  );
}
