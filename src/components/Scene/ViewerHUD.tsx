interface Props {
  mode: 'orbit' | 'fly';
  locked: boolean;
  pieceSelected: boolean;
  isOwner: boolean;
  isEditMode: boolean;
  rightOffset?: number; // px from the right edge — page sets this to track the sidebar
}

export function ViewerHUD({ mode, locked, pieceSelected, isOwner, isEditMode, rightOffset = 16 }: Props) {
  const tips: string[] = [];

  if (mode === 'orbit') {
    tips.push('Left drag — rotate base');
    tips.push('Right drag — pan');
    tips.push('Scroll — zoom');
    tips.push('Click — select piece');
    tips.push('Ctrl+M — enter fly mode');
  } else if (!locked) {
    tips.push('Click to enter fly mode');
  } else {
    tips.push('WASD — fly');
    tips.push('Space / Shift — up / down');
    tips.push('Click — select piece');
    tips.push('Esc — release mouse (stay in fly)');
    tips.push('Ctrl+M — return to orbit');
  }

  if (isOwner && isEditMode) {
    if (pieceSelected) {
      tips.push('R — cycle rotation fix');
      tips.push('Shift+R — reverse cycle');
      tips.push('Backspace — reset override');
    }
    tips.push('Ctrl+R — exit edit mode');
  } else if (isOwner && !isEditMode) {
    tips.push('Ctrl+R — toggle edit mode');
  }

  if (!tips.length) return null;

  return (
    <div style={{
      position: 'absolute', bottom: 16, right: rightOffset,
      transition: 'right 200ms ease-out',
      background: 'rgba(0,0,0,0.55)',
      backdropFilter: 'blur(6px)',
      border: '1px solid rgba(255,255,255,0.08)',
      borderRadius: 4,
      padding: '8px 12px',
      color: 'rgba(255,255,255,0.6)',
      fontSize: 10,
      lineHeight: 1.9,
      textAlign: 'right',
      pointerEvents: 'none',
      userSelect: 'none',
    }}>
      {tips.map(t => <div key={t}>{t}</div>)}
    </div>
  );
}
