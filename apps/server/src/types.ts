export interface SessionState {
  id: string;
  isRecording: boolean;
  language: string;
  meetingId: string;
  mimeType: string;
  transcriptBuffer: string;
  fullTranscript: string;
  lastAnalysisTime: number;
  wordCount: number;
  audioBuffer: Buffer[];
  chunkCount: number;
  lastTranscript: string; // previous transcript for Whisper prompt hint
}
