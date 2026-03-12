# Meeting Coach UI 重新設計

參考截圖設計，調整現有 UI。

## 🎨 設計規格

### 1. Header / Title Bar
```
┌─────────────────────────────────────────────────────────────────────┐
│ Meeting Transcriber          00:08:20  [RECORDING]           $0.00 │
└─────────────────────────────────────────────────────────────────────┘
```
- 左側：標題 "Meeting Transcriber" 或 "Meeting Coach"
- 中間：**大字錄音時間** (00:00:00 格式，數字時鐘風格)
- 中間右：狀態標籤 (RECORDING=紅色, WAITING=橘色, IDLE=灰色)
- 右側：可選顯示 token/成本

### 2. 配色方案
```css
/* 背景 */
--bg-main: #1a1a1a;        /* 主背景深灰 */
--bg-card: #2d2d2d;        /* 卡片背景 */
--bg-transcript: #ffffff;   /* 逐字稿區白底 */

/* 文字 */
--text-primary: #ffffff;
--text-secondary: #a0a0a0;
--text-dark: #333333;       /* 白底上的深色文字 */

/* 強調色 */
--accent-green: #4ade80;    /* Add 按鈕 */
--accent-blue: #60a5fa;     /* Resume 按鈕 */
--accent-red: #f87171;      /* End/Recording */
--accent-yellow: #fbbf24;   /* Deep Coach */
--accent-purple: #a78bfa;   /* Clone */
--accent-orange: #fb923c;   /* Waiting 狀態 */
```

### 3. 三欄佈局
```
┌──────────────┬─────────────────────┬──────────────────┐
│              │                     │                  │
│   CONTEXT    │    TRANSCRIPT       │   BOLT COACH     │
│   PLAYBOOK   │                     │                  │
│              │    (白底黑字)        │   🎯 會議關鍵    │
│  會議資訊     │                     │   ⚡ 建議觀點    │
│  - 標題      │    Meeting Summary  │   ⚠️ 注意       │
│  - 日期      │    Key Decisions    │   🔄 下一步     │
│  - 連結      │    Action Items     │                  │
│              │                     │                  │
└──────────────┴─────────────────────┴──────────────────┘
```

### 4. 中間逐字稿區
- **白色背景 + 黑色文字**（對比截圖設計）
- 上方有 "TRANSCRIPT" 標籤 + "RAW" / "CLEANED" 切換
- 下方分區顯示：
  - Meeting Summary
  - Key Decisions
  - Action Items
  - Key Discussions

### 5. 右側教練面板 (BOLT COACH)
- 標題區有 "DEEP GOING" 標籤
- 四個分區（使用 emoji icon）：
  - 🎯 會議關鍵
  - ⚡ 建議觀點  
  - ⚠️ 注意
  - 🔄 下一步

### 6. 底部控制列
```
┌─────────────────────────────────────────────────────────────────────┐
│ [📎 Files]  [🟢 Add] [🔵 Resume] [🔴 End] [🟡 Deep Coach] [🟣 Clone] [Summarize] [Save] │
└─────────────────────────────────────────────────────────────────────┘
```
- 彩色按鈕橫排
- 左側有檔案附件區

### 7. 字體
- 標題：16-18px, font-weight: 600
- 時間顯示：**32-40px**, font-family: monospace, font-weight: bold
- 內文：14px
- 標籤：12px, uppercase, letter-spacing: 0.05em

---

## 📋 修改檔案

1. `apps/web/app/page.tsx` - 主頁面佈局
2. `apps/web/app/globals.css` - 全域樣式
3. `apps/web/components/AudioRecorder.tsx` - 改為底部控制列
4. `apps/web/components/Transcript.tsx` - 白底黑字 + Summary 區塊
5. `apps/web/components/CoachPanel.tsx` - 調整 icon 和配色
6. 新增 `apps/web/components/Header.tsx` - 頂部時間顯示列
7. 新增 `apps/web/components/ContextPanel.tsx` - 左側會議資訊

---

## ✅ 驗收標準

1. 三欄式佈局（Context / Transcript / Coach）
2. 頂部有大字錄音時間顯示
3. 逐字稿區為白底黑字
4. 底部有彩色控制按鈕列
5. 整體配色符合深色主題

---

## 🧠 新功能：背景知識庫 (RAG)

### 功能說明
左側 Context 面板加入「背景知識」上傳區，讓即時教練可以參考相關資料提供更精準建議。

### UI 設計
```
┌─────────────────────┐
│   CONTEXT/PLAYBOOK  │
├─────────────────────┤
│ 📋 會議資訊         │
│ - 標題: ...         │
│ - 日期: ...         │
├─────────────────────┤
│ 📚 背景知識庫       │
│ ┌─────────────────┐ │
│ │ 📄 產品規格.pdf │ │
│ │ 📄 客戶需求.md  │ │
│ │ 📄 技術文件.txt │ │
│ └─────────────────┘ │
│ [+ 上傳文件]        │
│                     │
│ 已索引: 3 份文件    │
│ 向量數: 128         │
└─────────────────────┘
```

### 技術架構
```
上傳文件 → 文字擷取 → 分段 (chunking) → Embedding → 向量資料庫
                                                    ↓
會議逐字稿 → Embedding → 相似度搜尋 → 取回相關段落
                                        ↓
                              Claude 分析 (逐字稿 + 背景知識)
```

### 後端實作
1. **檔案處理** (`apps/server/src/knowledge.ts`)
   - 支援 PDF、TXT、MD、DOCX
   - 使用 pdf-parse 或類似套件

2. **向量儲存** (選項)
   - 簡單版：使用 `vectra` (本地向量 DB)
   - 進階版：使用 Qdrant (已有部署)

3. **Embedding**
   - 使用 OpenAI text-embedding-3-small
   - 或本地 sentence-transformers

4. **整合 Claude 分析**
   ```typescript
   // claude.ts 修改
   const relevantContext = await searchKnowledge(transcript);
   const prompt = `
   背景知識：
   ${relevantContext}
   
   會議逐字稿：
   ${transcript}
   
   請分析並提供建議...
   `;
   ```

### 前端元件
- `apps/web/components/KnowledgePanel.tsx` - 上傳 & 列表
- `apps/web/hooks/useKnowledge.ts` - 上傳/刪除 API

### API 設計
```
POST /api/knowledge/upload   - 上傳文件
GET  /api/knowledge/list     - 列出已上傳文件
DELETE /api/knowledge/:id    - 刪除文件
POST /api/knowledge/search   - 搜尋相關知識
```

