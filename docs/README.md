# GitHub Pages source

This folder is the source for GitHub Pages. The published site is:

➜ <https://nick0918964388.github.io/meeting-coach/>

## File

- `index.html` — 淨資產退休試算器（單檔 HTML + localStorage，無後端）

## 啟用方式（管理員設定一次）

1. Repo → Settings → Pages  
2. Source = **Deploy from a branch**  
3. Branch = **main**, folder = **/docs**  
4. Save → 等 1–2 分鐘後第一次部署完成

## 開發

直接編輯 `docs/index.html` 即可，commit 推到 main 後幾分鐘內 Pages 會自動重新部署。

開發/本機預覽：

```bash
python3 -m http.server 8000 -d docs
# 開 http://localhost:8000
```

## 資料保存

- 所有資料存使用者瀏覽器 localStorage（key: `retirement_planner_v1`）
- localStorage **綁網域**，從別的網域（例如 raw.githack）切過來必須先匯出 JSON 再匯入
- App 內已內建「⬇️ 匯出 / ⬆️ 匯入」按鈕
