'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ServerMessage, CoachMessage, TranscriptMessage } from '@meeting-coach/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface UseWebSocketReturn {
  status: ConnectionStatus;
  transcripts: string[];
  coaching: CoachMessage | null;
  connect: () => void;
  disconnect: () => void;
  send: (data: string | ArrayBuffer | Blob) => void;
  sendJson: (msg: object) => void;
}

const MAX_RECONNECT = 5;

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [transcripts, setTranscripts] = useState<string[]>([]);
  const [coaching, setCoaching] = useState<CoachMessage | null>(null);
  const reconnectAttempts = useRef(0);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setStatus('connecting');
    const ws = new WebSocket(WS_URL);
    ws.binaryType = 'arraybuffer';
    wsRef.current = ws;

    ws.onopen = () => {
      reconnectAttempts.current = 0;
      setStatus('connected');
      console.log('[WS] Connected');
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'transcript':
            if (msg.text) {
              setTranscripts((prev) => [...prev, msg.text]);
            }
            break;
          case 'coach':
            setCoaching(msg);
            break;
          case 'status':
            console.log('[WS] Status:', msg.status, msg.message || '');
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      console.log('[WS] Disconnected');
      if (reconnectAttempts.current < MAX_RECONNECT) {
        reconnectAttempts.current++;
        setTimeout(connect, 2000 * reconnectAttempts.current);
      }
    };

    ws.onerror = (err) => {
      setStatus('error');
      console.error('[WS] Error:', err);
    };
  }, []);

  const disconnect = useCallback(() => {
    wsRef.current?.close();
    wsRef.current = null;
  }, []);

  const send = useCallback((data: string | ArrayBuffer | Blob) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(data);
    }
  }, []);

  const sendJson = useCallback((msg: object) => {
    send(JSON.stringify(msg));
  }, [send]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  return { status, transcripts, coaching, connect, disconnect, send, sendJson };
}
