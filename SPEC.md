# Meeting Coach - 會議即時教練系統

## 🎯 專案目標

建立一個即時會議輔助系統，結合本地語音轉文字與 AI 戰略建議，幫助使用者在會議中獲得即時 coaching。

## 🏗️ 系統架構

```
┌─────────────────────────────────────────────────────────────────┐
│                         Frontend (Next.js)                       │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────────┐   │
│  │  錄音控制區   │  │   逐字稿區    │  │   即時教練建議區     │   │
│  │  🎙️ Start    │  │  [即時顯示]   │  │  🎯 關鍵點          │   │
│  │  ⏹️ Stop     │  │              │  │  💡 建議            │   │
│  │  ⏸️ Pause    │  │              │  │  ⚠️ 注意事項        │   │
│  └──────────────┘  └──────────────┘  └──────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
                              │ WebSocket
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Backend (Node.js/Fastify)                   │
│  ┌──────────────────┐    ┌──────────────────────────────────┐   │
│  │  Audio Processor  │───▶│  Local Whisper (faster-whisper)  │   │
│  │  (WebSocket recv) │    │  即時 STT                        │   │
│  └──────────────────┘    └──────────────────────────────────┘   │
│           │                              │                       │
│           │                              ▼                       │
│           │              ┌──────────────────────────────────┐   │
│           │              │  Claude Code CLI (spawn)          │   │
│           │              │  --dangerously-skip-permissions   │   │
│           └─────────────▶│  即時分析逐字稿，產生建議          │   │
│                          └──────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

## 📋 功能需求

### Phase 1: MVP (本次開發)

#### 1. 前端 (Next.js 14 + App Router)
- [ ] 錄音介面（使用 Web Audio API）
- [ ] 即時逐字稿顯示區
- [ ] 即時教練建議顯示區（右側 panel）
- [ ] 會議開始/暫停/結束控制
- [ ] WebSocket 連線狀態指示

#### 2. 後端 (Node.js + Fastify)
- [ ] WebSocket 接收音訊串流
- [ ] 整合 faster-whisper（透過 Python subprocess）
- [ ] 整合 Claude Code CLI（spawn 進程）
- [ ] 逐字稿累積與分段邏輯
- [ ] 即時推送建議到前端

#### 3. AI 教練邏輯
- [ ] 每累積 30 秒或 200 字觸發分析
- [ ] 產出格式：
  ```json
  {
    "keyPoints": ["重點1", "重點2"],
    "suggestions": ["建議1", "建議2"],
    "warnings": ["注意事項"],
    "nextSteps": ["下一步行動"]
  }
  ```

### Phase 2: 進階功能 (未來)
- [ ] 會議 Playbook 模板
- [ ] 說話者識別 (Speaker Diarization)
- [ ] 會議摘要與 Action Items
- [ ] 歷史會議搜尋
- [ ] 匯出功能

## 🛠️ 技術選型

| 元件 | 技術 | 原因 |
|------|------|------|
| Frontend | Next.js 14 + TypeScript | 現代 React，SSR 支援 |
| UI | Tailwind CSS + shadcn/ui | 快速開發，美觀 |
| Backend | Node.js + Fastify | 高效能，WebSocket 原生支援 |
| STT | faster-whisper (本地) | 免費、低延遲、支援中文 |
| LLM | Claude Code CLI | 省錢（Max 訂閱內）、工具能力強 |
| 即時通訊 | WebSocket (ws) | 雙向即時串流 |

## 📁 專案結構

```
meeting-coach/
├── apps/
│   ├── web/                    # Next.js 前端
│   │   ├── app/
│   │   │   ├── page.tsx        # 主頁面
│   │   │   ├── layout.tsx
│   │   │   └── api/            # API routes (如需要)
│   │   ├── components/
│   │   │   ├── AudioRecorder.tsx
│   │   │   ├── Transcript.tsx
│   │   │   ├── CoachPanel.tsx
│   │   │   └── ConnectionStatus.tsx
│   │   ├── hooks/
│   │   │   ├── useAudioRecorder.ts
│   │   │   └── useWebSocket.ts
│   │   └── lib/
│   │       └── websocket.ts
│   │
│   └── server/                 # Node.js 後端
│       ├── src/
│       │   ├── index.ts        # 入口
│       │   ├── websocket.ts    # WebSocket 處理
│       │   ├── whisper.ts      # Whisper 整合
│       │   ├── claude.ts       # Claude Code CLI 整合
│       │   └── types.ts
│       └── package.json
│
├── packages/
│   └── shared/                 # 共用型別
│       └── types.ts
│
├── scripts/
│   └── install-whisper.sh      # 安裝 faster-whisper
│
├── SPEC.md                     # 本文件
├── package.json                # Monorepo root
├── turbo.json                  # Turborepo 設定
└── README.md
```

## 🔌 API 設計

### WebSocket Events

**Client → Server:**
```typescript
// 開始錄音
{ type: 'start', config: { language: 'zh' } }

// 音訊資料
{ type: 'audio', data: ArrayBuffer }

// 停止錄音
{ type: 'stop' }
```

**Server → Client:**
```typescript
// 逐字稿更新
{ type: 'transcript', text: string, isFinal: boolean }

// 教練建議
{ 
  type: 'coach',
  keyPoints: string[],
  suggestions: string[],
  warnings: string[],
  nextSteps: string[]
}

// 狀態更新
{ type: 'status', status: 'recording' | 'processing' | 'idle' }
```

## 🚀 開發步驟

1. **初始化專案** - Turborepo monorepo 架構
2. **建立前端骨架** - Next.js + 基本 UI
3. **實作音訊錄製** - Web Audio API + WebSocket 串流
4. **整合 Whisper** - Python faster-whisper subprocess
5. **整合 Claude Code** - spawn CLI 進程
6. **串接前後端** - WebSocket 即時通訊
7. **UI 美化** - shadcn/ui 元件
8. **測試與優化** - 延遲優化、錯誤處理

## ⚙️ 環境需求

- Node.js 20+
- Python 3.10+ (for faster-whisper)
- faster-whisper (`pip install faster-whisper`)
- Claude Code CLI (已安裝)
- macOS (開發環境)

## 📝 注意事項

1. **Claude Code CLI 呼叫方式：**
   ```bash
   echo "prompt" | claude -p --dangerously-skip-permissions --output-format stream-json
   ```

2. **Whisper 模型選擇：**
   - 開發/測試：`base` 或 `small`（快）
   - 生產環境：`medium` 或 `large-v3`（準）

3. **省電考量：**
   - 使用 VAD（Voice Activity Detection）避免處理靜音
   - 批次處理音訊片段（每 3-5 秒）

---

*規格版本: v1.0 | 建立日期: 2026-03-12*
