export interface SessionState {
  id: string;
  isRecording: boolean;
  language: string;
  transcriptBuffer: string;
  fullTranscript: string;
  lastAnalysisTime: number;
  wordCount: number;
  audioBuffer: Buffer[];
  chunkCount: number;
}
