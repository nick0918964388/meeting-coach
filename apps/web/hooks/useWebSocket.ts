'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import type { ServerMessage, CoachMessage } from '@meeting-coach/shared';

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:3001/ws';
const PING_INTERVAL = 30000; // 30 seconds - keep alive for Cloudflare

export type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

export interface TranscriptLine {
  text: string;
  speaker?: number;
  isInterim?: boolean;
}

export interface UseWebSocketReturn {
  status: ConnectionStatus;
  transcripts: TranscriptLine[];
  cleanedTranscript: string;
  coaching: CoachMessage | null;
  connect: () => void;
  disconnect: () => void;
  send: (data: string | ArrayBuffer | Blob) => void;
  sendJson: (msg: object) => void;
  clearTranscripts: () => void;
  loadTranscripts: (lines: string[]) => void;
}

const MAX_RECONNECT = 5;

export function useWebSocket(): UseWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');
  const [transcripts, setTranscripts] = useState<TranscriptLine[]>([]);
  const [cleanedTranscript, setCleanedTranscript] = useState<string>('');
  const [coaching, setCoaching] = useState<CoachMessage | null>(null);
  const reconnectAttempts = useRef(0);

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const startPingInterval = useCallback(() => {
    clearPingInterval();
    pingIntervalRef.current = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: 'ping' }));
      }
    }, PING_INTERVAL);
  }, [clearPingInterval]);

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
      startPingInterval();
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);
        switch (msg.type) {
          case 'transcript':
            if (msg.text) {
              if (msg.isFinal) {
                setTranscripts((prev) => {
                  const filtered = prev.filter((t) => !t.isInterim);
                  return [...filtered, { text: msg.text, speaker: msg.speaker }];
                });
              } else {
                // Interim result: update last interim line in-place
                setTranscripts((prev) => {
                  const copy = [...prev];
                  if (copy.length > 0 && copy[copy.length - 1].isInterim) {
                    copy[copy.length - 1] = { text: msg.text, speaker: msg.speaker, isInterim: true };
                  } else {
                    copy.push({ text: msg.text, speaker: msg.speaker, isInterim: true });
                  }
                  return copy;
                });
              }
            }
            break;
          case 'cleaned':
            if (msg.text) {
              setCleanedTranscript(msg.text);
              console.log('[WS] Received cleaned transcript');
            }
            break;
          case 'coach':
            setCoaching(msg);
            break;
          case 'status':
            console.log('[WS] Status:', msg.status, msg.message || '');
            break;
          case 'pong':
            // Keep-alive response, ignore
            break;
        }
      } catch (err) {
        console.error('[WS] Parse error:', err);
      }
    };

    ws.onclose = () => {
      setStatus('disconnected');
      wsRef.current = null;
      clearPingInterval();
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
  }, [startPingInterval, clearPingInterval]);

  const disconnect = useCallback(() => {
    clearPingInterval();
    wsRef.current?.close();
    wsRef.current = null;
  }, [clearPingInterval]);

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
      clearPingInterval();
      wsRef.current?.close();
    };
  }, [clearPingInterval]);

  const clearTranscripts = useCallback(() => {
    setTranscripts([]);
    setCleanedTranscript('');
    setCoaching(null);
  }, []);

  const loadTranscripts = useCallback((lines: string[]) => {
    setTranscripts(lines.map((text) => ({ text })));
    setCleanedTranscript('');
    setCoaching(null);
  }, []);

  return { status, transcripts, cleanedTranscript, coaching, connect, disconnect, send, sendJson, clearTranscripts, loadTranscripts };
}
