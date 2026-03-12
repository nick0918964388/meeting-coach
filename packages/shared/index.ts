// WebSocket message types shared between frontend and backend

// Client → Server messages
export interface StartMessage {
  type: 'start';
  config: {
    language: string;
  };
}

export interface AudioMessage {
  type: 'audio';
  data: ArrayBuffer | string; // base64 encoded on wire
}

export interface StopMessage {
  type: 'stop';
}

export type ClientMessage = StartMessage | AudioMessage | StopMessage;

// Server → Client messages
export interface TranscriptMessage {
  type: 'transcript';
  text: string;
  isFinal: boolean;
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

export type ServerMessage = TranscriptMessage | CoachMessage | StatusMessage;
