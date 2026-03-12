'use client';

// Recording controls (⏺/⏸/⏹) have moved to the Header.
// This bar contains secondary action buttons only.

interface AudioRecorderProps {
  error: string | null;
}

interface CtrlBtnProps {
  label: string;
  onClick: () => void;
  color: string;
  bg: string;
  border: string;
}

function CtrlBtn({ label, onClick, color, bg, border }: CtrlBtnProps) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '5px 13px',
        borderRadius: '5px',
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
      }}
    >
      {label}
    </button>
  );
}

export function AudioRecorder({ error }: AudioRecorderProps) {
  return (
    <div
      style={{
        background: '#ffffff',
        borderTop: '1px solid #d8d8d0',
        padding: '9px 16px',
        display: 'flex',
        alignItems: 'center',
        gap: '7px',
        flexShrink: 0,
        flexWrap: 'wrap',
      }}
    >
      <CtrlBtn label="📎 Files ▼" onClick={() => {}} color="#555" bg="#f5f5f5" border="#d0d0d0" />
      <CtrlBtn label="Deep Coach" onClick={() => {}} color="#fff" bg="#f59e0b" border="#d97706" />
      <CtrlBtn label="Clone"      onClick={() => {}} color="#fff" bg="#8b5cf6" border="#7c3aed" />
      <CtrlBtn label="Summarize"  onClick={() => {}} color="#444" bg="#f5f5f5" border="#d0d0d0" />
      <CtrlBtn label="Save"       onClick={() => {}} color="#444" bg="#f5f5f5" border="#d0d0d0" />

      {error && (
        <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto' }}>⚠️ {error}</span>
      )}
    </div>
  );
}
