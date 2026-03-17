export interface SessionState {
  id: string;
  isRecording: boolean;
  language: string;
  meetingId: string;
  mimeType: string;
  topic: string;
  transcriptBuffer: string;
  fullTranscript: string;
  lastAnalysisTime: number;
  wordCount: number;
  audioBuffer: Buffer[];
  chunkCount: number;
  lastTranscript: string;
  lineIndex: number; // current line counter for correction tracking
}
