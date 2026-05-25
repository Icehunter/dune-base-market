// src/components/Designer/ActionsMenu.tsx
import { useEffect, useRef, useState } from 'react';
import { Icon } from '@iconify/react';

interface Props {
  isSignedIn: boolean;
  pieceCount: number;
  onSave: () => void;
  onExport: () => void;
  onImport: () => void;
  onClear: () => void;
}

export function ActionsMenu({ isSignedIn, pieceCount, onSave, onExport, onImport, onClear }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={ref} className="absolute right-2.5 top-2.5 z-20">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex cursor-pointer items-center gap-1.5 rounded-[2px] border border-white/20 bg-[#13131a]/90 px-3 py-1.5 text-[13px] text-white/70 backdrop-blur transition-colors hover:border-white/35 hover:text-white"
      >
        <Icon icon="lucide:hexagon" width={12} height={12} className="text-[#c8a84b]" />
        Actions
        <Icon icon="lucide:chevron-down" width={10} height={10} className="text-white/40" />
      </button>

      {open && (
        <div className="absolute right-0 top-[calc(100%+4px)] w-[188px] overflow-hidden rounded-[2px] border border-white/15 bg-[#13131a] shadow-xl shadow-black/50">
          {isSignedIn && pieceCount > 0 && (
            <>
              <button
                onClick={() => { onSave(); close(); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2.5 text-left text-[12px] text-[#c8a84b] transition-colors hover:bg-[#c8a84b15]"
              >
                <Icon icon="lucide:save" width={13} height={13} />
                <div>
                  <div className="font-semibold">Save to account</div>
                  <div className="text-[12px] text-[#c8a84b70]">Saves as private blueprint</div>
                </div>
              </button>
              <div className="border-t border-white/10" />
            </>
          )}
          <button
            onClick={() => { onExport(); close(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon icon="lucide:download" width={13} height={13} />
            Export JSON
          </button>
          <button
            onClick={() => { onImport(); close(); }}
            className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[12px] text-white/70 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Icon icon="lucide:upload" width={13} height={13} />
            Import JSON
          </button>
          {pieceCount > 0 && (
            <>
              <div className="border-t border-white/10" />
              <button
                onClick={() => { onClear(); close(); }}
                className="flex w-full cursor-pointer items-center gap-2.5 px-3 py-2 text-left text-[12px] text-red-400/70 transition-colors hover:bg-red-900/20 hover:text-red-400"
              >
                <Icon icon="lucide:trash-2" width={13} height={13} />
                Clear canvas
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
