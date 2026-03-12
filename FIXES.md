# Meeting Coach 修復任務

## 🔴 Critical Fixes (必須修復)

### 1. 音訊格式轉換
**問題：** 前端送出 WebM/Opus 格式，但 Whisper 需要 WAV 格式

**修復方案：**
- 在 `whisper.ts` 中加入 ffmpeg 轉檔步驟
- 將 WebM 轉為 16kHz mono WAV 再傳給 Whisper

```typescript
// whisper.ts 修改
import { execSync } from 'child_process';

// 在 transcribeAudio 函數中，寫入 audioData 後加入：
const webmPath = join(tmpdir(), `audio_${randomUUID()}.webm`);
const wavPath = webmPath.replace('.webm', '.wav');
await writeFile(webmPath, audioData);
execSync(`ffmpeg -y -i ${webmPath} -ar 16000 -ac 1 -f wav ${wavPath}`);
// 然後用 wavPath 傳給 Python
```

### 2. 音訊片段處理
**問題：** WebM chunks 不能直接 Buffer.concat

**修復方案：**
- 每個 chunk 獨立處理（不合併）
- 或改用 ffmpeg concat demuxer

建議：每個 3 秒 chunk 獨立轉檔處理即可

---

## 🟡 Medium Fixes (建議修復)

### 3. AudioContext Memory Leak
**檔案：** `apps/web/hooks/useAudioRecorder.ts`

```typescript
// 新增 audioCtxRef
const audioCtxRef = useRef<AudioContext | null>(null);

// start() 中：
const audioCtx = new AudioContext();
audioCtxRef.current = audioCtx;

// stop() 中加入：
audioCtxRef.current?.close();
audioCtxRef.current = null;
```

### 4. WebSocket 自動重連
**檔案：** `apps/web/hooks/useWebSocket.ts`

```typescript
// 加入重連邏輯
const reconnectAttempts = useRef(0);
const MAX_RECONNECT = 5;

ws.onclose = () => {
  setStatus('disconnected');
  if (reconnectAttempts.current < MAX_RECONNECT) {
    reconnectAttempts.current++;
    setTimeout(connect, 2000 * reconnectAttempts.current);
  }
};

ws.onopen = () => {
  reconnectAttempts.current = 0;
  // ...
};
```

### 5. Claude CLI 輸出格式驗證
**檔案：** `apps/server/src/claude.ts`

- 測試實際 `claude -p --output-format json` 的輸出格式
- 確保 JSON 解析邏輯正確

---

## ✅ 驗收標準

1. 啟動前後端服務
2. 點擊錄音，說話 30 秒
3. 確認逐字稿正確顯示
4. 確認 AI 教練建議正確產生
5. 無 console 錯誤

---

## 環境需求

確保已安裝：
- `ffmpeg` (brew install ffmpeg)
- `faster-whisper` (pip install faster-whisper)
