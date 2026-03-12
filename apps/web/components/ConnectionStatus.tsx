'use client';

import type { ConnectionStatus as Status } from '@/hooks/useWebSocket';

const statusConfig: Record<Status, { label: string; color: string; dot: string }> = {
  disconnected: { label: '未連線', color: 'text-slate-400', dot: 'bg-slate-400' },
  connecting: { label: '連線中...', color: 'text-yellow-400', dot: 'bg-yellow-400 animate-pulse' },
  connected: { label: '已連線', color: 'text-emerald-400', dot: 'bg-emerald-400' },
  error: { label: '連線錯誤', color: 'text-red-400', dot: 'bg-red-400' },
};

export function ConnectionStatus({ status }: { status: Status }) {
  const config = statusConfig[status];
  return (
    <div className="flex items-center gap-2">
      <div className={`w-2 h-2 rounded-full ${config.dot}`} />
      <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
    </div>
  );
}
