# Meeting Coach — 會議即時教練系統

即時語音轉文字 + AI 教練建議，幫助你在會議中保持最佳狀態。

## 功能

- 即時語音轉文字（本地 faster-whisper）
- AI 即時教練建議（Claude）
- 背景知識庫上傳（RAG）
- 會議管理（建立 / 切換 / 儲存）
- 三欄式淺色 UI

---

## 本地開發

### 前置需求

| 工具 | 版本 |
|------|------|
| Node.js | ≥ 22 |
| Python | ≥ 3.9 |
| ffmpeg | 任意版本 |
| Claude Code CLI | 已登入 |

```bash
# macOS
brew install ffmpeg node python3
pip3 install faster-whisper --break-system-packages
```

### 安裝與啟動

```bash
npm install

# 同時啟動前後端（Turborepo）
npm run dev
```

| 服務 | URL |
|------|-----|
| 前端 | http://localhost:3000 |
| 後端 | http://localhost:3001 |
| WebSocket | ws://localhost:3001/ws |

### 單獨啟動

```bash
# 後端
npx tsx apps/server/src/index.ts

# 前端（另一個終端）
cd apps/web && npx next dev
```

---

## Docker 部署

### 前置需求

- Docker ≥ 24
- Docker Compose ≥ 2.20
- 本機已登入 Claude Code CLI（`claude /login`）

### 快速啟動

```bash
docker compose up --build
```

完成後開啟 http://localhost:3000

> 首次啟動較慢：`pip install faster-whisper` 約需 2-5 分鐘，Whisper base 模型首次使用時自動下載（約 150 MB）。

### 服務說明

| 服務 | 容器 Port | Host Port |
|------|-----------|-----------|
| web (Next.js) | 3000 | 3000 |
| server (Fastify + Whisper) | 3001 | 3001 |

### AI 教練（Claude CLI）設定

`docker-compose.yml` 預設掛載本機的 Claude 設定目錄：

```yaml
volumes:
  - ${HOME}/.claude:/root/.claude:ro
```

這讓容器可使用本機已登入的 Claude 憑證。確認本機已登入：

```bash
claude --version   # 確認已安裝
claude /login      # 若尚未登入
```

若不需要 AI 分析功能，刪除 `docker-compose.yml` 中該 volume 行即可（語音轉文字仍正常運作）。

### 遠端部署

後端不在 `localhost` 時，需在 build 時指定 WebSocket URL：

```bash
# 方式一：build-arg
docker compose build \
  --build-arg NEXT_PUBLIC_WS_URL=ws://your-server.com:3001/ws

docker compose up -d

# 方式二：修改 docker-compose.yml
# web.build.args.NEXT_PUBLIC_WS_URL: ws://your-server.com:3001/ws
```

> `NEXT_PUBLIC_WS_URL` 在 build 時被打包進 JS bundle，部署到不同主機時需重新 build。

### 資料持久化

知識庫和會議記錄存放在 named volumes，重啟不會遺失：

```bash
# 查看 volumes
docker volume ls | grep meeting-coach

# 備份知識庫
docker run --rm \
  -v meeting-coach_knowledge_data:/data \
  alpine tar czf - /data > knowledge_backup.tar.gz
```

### 常用指令

```bash
# 背景執行
docker compose up -d

# 即時查看日誌
docker compose logs -f server
docker compose logs -f web

# 重建單一服務（例如修改了後端程式碼）
docker compose build server
docker compose up -d --no-deps server

# 停止所有服務
docker compose down

# 停止並清除資料 volumes（不可逆）
docker compose down -v
```

---

## 架構說明

```
apps/
  web/        — Next.js 15 前端（TypeScript + Tailwind）
  server/     — Fastify 5 後端（WebSocket + REST API）
packages/
  shared/     — 共用 TypeScript 型別定義
```

### 後端 API

| 端點 | 說明 |
|------|------|
| `WS /ws` | 音訊串流、逐字稿推送、教練建議 |
| `GET /health` | 健康檢查 |
| `GET /api/meetings` | 列出所有會議 |
| `POST /api/meetings` | 建立新會議 |
| `PATCH /api/meetings/:id` | 更新會議（逐字稿 / coaching） |
| `DELETE /api/meetings/:id` | 刪除會議 |
| `POST /api/knowledge/upload` | 上傳背景知識文件（.txt .md .pdf） |
| `GET /api/knowledge/list` | 列出已上傳文件 |
| `DELETE /api/knowledge/:id` | 刪除文件 |

### 資料流

```
麥克風 → MediaRecorder (WebM/Opus, 3s chunks)
       → WebSocket (binary frames)
       → ffmpeg (→ 16 kHz mono WAV)
       → faster-whisper (→ 中文文字)
       → 向量搜尋知識庫 (bag-of-words RAG)
       → Claude CLI (→ JSON 教練建議)
       → WebSocket → 前端更新 UI
```
