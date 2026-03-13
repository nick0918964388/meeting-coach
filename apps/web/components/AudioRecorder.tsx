'use client';

import { useEffect, useRef, useState } from 'react';

// Recording controls (⏺/⏸/⏹) have moved to the Header.
// This bar contains secondary action buttons only.

interface AudioRecorderProps {
  error: string | null;
}

interface Action {
  label: string;
  icon: string;
  onClick: () => void;
  color: string;
  bg: string;
  border: string;
}

const ACTIONS: Action[] = [
  { label: 'Files',      icon: '📎', onClick: () => {}, color: '#555', bg: '#f5f5f5', border: '#d0d0d0' },
  { label: 'Deep Coach', icon: '⚡', onClick: () => {}, color: '#fff', bg: '#f59e0b', border: '#d97706' },
  { label: 'Clone',      icon: '🔀', onClick: () => {}, color: '#fff', bg: '#8b5cf6', border: '#7c3aed' },
  { label: 'Summarize',  icon: '📋', onClick: () => {}, color: '#444', bg: '#f5f5f5', border: '#d0d0d0' },
  { label: 'Save',       icon: '💾', onClick: () => {}, color: '#444', bg: '#f5f5f5', border: '#d0d0d0' },
];

// Desktop button
function CtrlBtn({ label, icon, onClick, color, bg, border }: Action) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '7px 13px',
        borderRadius: '5px',
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontSize: '12px',
        fontWeight: 600,
        cursor: 'pointer',
        whiteSpace: 'nowrap',
        minHeight: '36px',
        display: 'flex',
        alignItems: 'center',
        gap: '5px',
      }}
    >
      <span>{icon}</span>
      <span>{label}</span>
    </button>
  );
}

// Mobile bottom sheet
function MobileSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const sheetRef = useRef<HTMLDivElement>(null);

  // Close on backdrop click
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.35)',
          zIndex: 40,
          animation: 'fadeIn 0.15s ease',
        }}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        style={{
          position: 'fixed',
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 50,
          background: '#fff',
          borderRadius: '16px 16px 0 0',
          boxShadow: '0 -4px 24px rgba(0,0,0,0.12)',
          paddingBottom: 'env(safe-area-inset-bottom)',
          animation: 'slideUp 0.2s ease',
        }}
      >
        {/* Handle */}
        <div style={{ display: 'flex', justifyContent: 'center', padding: '10px 0 4px' }}>
          <div style={{ width: '36px', height: '4px', borderRadius: '2px', background: '#d1d5db' }} />
        </div>

        {/* Title */}
        <div
          style={{
            padding: '4px 20px 12px',
            fontSize: '13px',
            fontWeight: 700,
            color: '#374151',
            borderBottom: '1px solid #f3f4f6',
          }}
        >
          操作選單
        </div>

        {/* Action list */}
        <div style={{ padding: '8px 0' }}>
          {ACTIONS.map((action) => (
            <button
              key={action.label}
              onClick={() => { action.onClick(); onClose(); }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '14px',
                width: '100%',
                padding: '14px 20px',
                border: 'none',
                background: 'transparent',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {/* Icon badge */}
              <span
                style={{
                  width: '38px',
                  height: '38px',
                  borderRadius: '10px',
                  background: action.bg,
                  border: `1px solid ${action.border}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '18px',
                  flexShrink: 0,
                }}
              >
                {action.icon}
              </span>
              <span style={{ fontSize: '15px', fontWeight: 600, color: '#111827' }}>
                {action.label}
              </span>
            </button>
          ))}
        </div>

        {/* Cancel */}
        <div style={{ padding: '0 16px 12px' }}>
          <button
            onClick={onClose}
            style={{
              width: '100%',
              padding: '13px',
              borderRadius: '10px',
              border: '1px solid #e5e7eb',
              background: '#f9fafb',
              color: '#374151',
              fontSize: '14px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            取消
          </button>
        </div>
      </div>
    </>
  );
}

export function AudioRecorder({ error }: AudioRecorderProps) {
  const [sheetOpen, setSheetOpen] = useState(false);

  return (
    <>
      <div
        style={{
          background: '#ffffff',
          borderTop: '1px solid #d8d8d0',
          padding: '7px 12px',
          paddingBottom: 'calc(7px + env(safe-area-inset-bottom))',
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          flexShrink: 0,
        }}
      >
        {/* Desktop: all buttons inline */}
        <div className="hidden md:flex items-center gap-1.5 flex-wrap">
          {ACTIONS.map((a) => <CtrlBtn key={a.label} {...a} />)}
        </div>

        {/* Mobile: ⋯ menu button */}
        <button
          className="md:hidden"
          onClick={() => setSheetOpen(true)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            padding: '8px 16px',
            borderRadius: '8px',
            border: '1px solid #d0d0d0',
            background: '#f5f5f5',
            color: '#374151',
            fontSize: '13px',
            fontWeight: 600,
            cursor: 'pointer',
            minHeight: '40px',
          }}
        >
          <span style={{ fontSize: '18px', lineHeight: 1 }}>⋯</span>
          <span>工具</span>
        </button>

        {error && (
          <span style={{ fontSize: '11px', color: '#ef4444', marginLeft: 'auto' }}>⚠️ {error}</span>
        )}
      </div>

      {/* Mobile bottom sheet */}
      <MobileSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}
