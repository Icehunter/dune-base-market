import { lazy, Suspense, useEffect, useState } from 'react';
import { useBuildingStore } from './stores/buildingStore';

const SceneCanvas = lazy(() =>
  import('./components/Scene').then(m => ({ default: m.SceneCanvas }))
);

function App() {
  const loadDefaultBase  = useBuildingStore((s) => s.loadDefaultBase);
  const exportBlueprint  = useBuildingStore((s) => s.exportBlueprint);
  const [locked, setLocked] = useState(false);

  const handleDownload = () => {
    const data = exportBlueprint();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'blueprint.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  useEffect(() => { loadDefaultBase(); }, [loadDefaultBase]);

  useEffect(() => {
    const onLockChange = () => setLocked(document.pointerLockElement !== null);
    document.addEventListener('pointerlockchange', onLockChange);
    return () => document.removeEventListener('pointerlockchange', onLockChange);
  }, []);

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', overflow: 'hidden', background: '#000' }}>
      <Suspense fallback={null}>
        <SceneCanvas />
      </Suspense>

      {/* Crosshair */}
      <div style={{
        position: 'absolute', top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none', color: 'rgba(255,255,255,0.7)',
        fontSize: 20, lineHeight: 1, userSelect: 'none',
      }}>+</div>

      {/* Click-to-lock prompt */}
      {!locked && (
        <div style={{
          position: 'absolute', top: '50%', left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'rgba(0,0,0,0.75)', border: '1px solid rgba(255,255,255,0.2)',
          borderRadius: 12, padding: '24px 36px', textAlign: 'center',
          color: '#fff', pointerEvents: 'none',
        }}>
          <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 12 }}>
            Click to enter the base
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.6)', lineHeight: 1.8 }}>
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>WASD</span> — fly forward/back/left/right<br />
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>Space</span> — fly up &nbsp;
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>Shift</span> — fly down<br />
            <span style={{ color: 'rgba(255,255,255,0.9)' }}>Esc</span> — release mouse
          </div>
        </div>
      )}

      {/* Download button */}
      <button
        onClick={handleDownload}
        style={{
          position: 'absolute', top: 16, right: 16,
          background: 'rgba(30,30,35,0.85)',
          border: '1px solid rgba(255,255,255,0.15)',
          borderRadius: 8, color: '#fff', padding: '6px 14px',
          fontSize: 12, cursor: 'pointer',
        }}
      >
        Download Blueprint
      </button>

      {/* Controls reminder (bottom, shown when locked) */}
      {locked && (
        <div style={{
          position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)',
          color: 'rgba(255,255,255,0.35)', fontSize: 11,
          pointerEvents: 'none', userSelect: 'none',
        }}>
          WASD fly · Space up · Shift down · Esc release
        </div>
      )}

    </div>
  );
}

export default App;
