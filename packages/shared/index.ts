// WebSocket message types shared between frontend and backend

// Client → Server messages
export interface StartMessage {
  type: 'start';
  config: {
    language: string;
    meetingId?: string;
    mimeType?: string;
  };
}

export interface AudioMessage {
  type: 'audio';
  data: ArrayBuffer | string; // base64 encoded on wire
}

export interface StopMessage {
  type: 'stop';
}

export interface PingMessage {
  type: 'ping';
}

export type ClientMessage = StartMessage | AudioMessage | StopMessage | PingMessage;

// Server → Client messages
export interface TranscriptMessage {
  type: 'transcript';
  text: string;
  isFinal: boolean;
}

export interface CleanedTranscriptMessage {
  type: 'cleaned';
  text: string;  // LLM 修正後的完整文字
}

export interface CoachMessage {
  type: 'coach';
  keyPoints: string[];
  suggestions: string[];
  warnings: string[];
  nextSteps: string[];
}

export interface StatusMessage {
  type: 'status';
  status: 'recording' | 'processing' | 'idle' | 'error';
  message?: string;
}

export interface PongMessage {
  type: 'pong';
}

export type ServerMessage = TranscriptMessage | CleanedTranscriptMessage | CoachMessage | StatusMessage | PongMessage;
