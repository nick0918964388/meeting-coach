'use client';

import type { CoachMessage } from '@meeting-coach/shared';

interface CoachPanelProps {
  coaching: CoachMessage | null;
  isAnalyzing?: boolean;
}

interface SectionProps {
  icon: string;
  title: string;
  items: string[];
  accentColor: string;
  bgColor: string;
  textColor: string;
}

function Section({ icon, title, items, accentColor, bgColor, textColor }: SectionProps) {
  if (items.length === 0) return null;
  return (
    <div style={{ marginBottom: '14px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginBottom: '6px' }}>
        <span style={{ fontSize: '13px' }}>{icon}</span>
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: accentColor,
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}
        >
          {title}
        </span>
      </div>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {items.map((item, idx) => (
          <li
            key={idx}
            style={{
              fontSize: '12px',
              lineHeight: 1.55,
              padding: '6px 10px',
              borderRadius: '5px',
              background: bgColor,
              color: textColor,
              borderLeft: `3px solid ${accentColor}`,
            }}
          >
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CoachPanel({ coaching, isAnalyzing }: CoachPanelProps) {
  return (
    <div
      style={{
        background: '#f5f5f0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          height: '40px',
          padding: '0 14px',
          borderBottom: '1px solid #d8d8d0',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: '#eeeee8',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Bolt Coach
        </span>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isAnalyzing && (
            <span style={{ fontSize: '10px', color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span className="animate-pulse">⟳</span> 分析中
            </span>
          )}
          <span
            style={{
              fontSize: '10px',
              fontWeight: 600,
              padding: '2px 7px',
              borderRadius: '3px',
              background: '#ede9fe',
              color: '#7c3aed',
              border: '1px solid #c4b5fd',
            }}
          >
            DEEP GOING
          </span>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px' }}>
        {!coaching ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: '100%',
              flexDirection: 'column',
              gap: '8px',
            }}
          >
            <div style={{ fontSize: '34px' }}>🤖</div>
            <p style={{ fontSize: '12px', color: '#aaa', textAlign: 'center', margin: 0 }}>
              AI 教練將在累積足夠對話後
              <br />
              自動提供建議
            </p>
            <p style={{ fontSize: '11px', color: '#bbb', margin: 0 }}>約 30 秒或 200 字觸發分析</p>
          </div>
        ) : (
          <div>
            <Section
              icon="🎯"
              title="會議關鍵"
              items={coaching.keyPoints}
              accentColor="#3b82f6"
              bgColor="#eff6ff"
              textColor="#1e3a5f"
            />
            <Section
              icon="⚡"
              title="建議觀點"
              items={coaching.suggestions}
              accentColor="#16a34a"
              bgColor="#f0fdf4"
              textColor="#14532d"
            />
            <Section
              icon="⚠️"
              title="注意"
              items={coaching.warnings}
              accentColor="#d97706"
              bgColor="#fffbeb"
              textColor="#78350f"
            />
            <Section
              icon="🔄"
              title="下一步"
              items={coaching.nextSteps}
              accentColor="#7c3aed"
              bgColor="#f5f3ff"
              textColor="#3b0764"
            />
          </div>
        )}
      </div>
    </div>
  );
}
