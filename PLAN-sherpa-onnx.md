# Meeting Coach - 升級 sherpa-onnx 語音辨識

## 目標
將現有的 FunASR/SenseVoice 後端辨識，改為使用 sherpa-onnx WebAssembly 前端辨識

## 參考
- Demo: https://huggingface.co/spaces/k2-fsa/web-assembly-vad-asr-sherpa-onnx-zh-en-paraformer
- sherpa-onnx GitHub: https://github.com/k2-fsa/sherpa-onnx
- sherpa-onnx WASM: https://github.com/k2-fsa/sherpa-onnx/tree/master/wasm

## 優勢
1. **瀏覽器端辨識** - 不需要伺服器，降低延遲
2. **內建 VAD** - 自動偵測語音活動，解決 chunk 重疊問題
3. **中英文混合辨識** - paraformer 支援中英混合
4. **離線運作** - 模型載入後不需要網路

## 技術方案

### Phase 1: 研究 sherpa-onnx WASM API
- [ ] 研究 sherpa-onnx WASM 的使用方式
- [ ] 確認需要下載的模型檔案
- [ ] 測試 VAD + ASR 的整合

### Phase 2: 前端整合
- [ ] 新增 sherpa-onnx WASM 模組
- [ ] 修改 `useAudioRecorder.ts` 使用 AudioWorklet + sherpa-onnx
- [ ] 實作 VAD 偵測 + 即時辨識
- [ ] 移除對後端 `/transcribe` 的依賴

### Phase 3: 後端調整
- [ ] 保留 FunASR 作為 fallback（不支援 WASM 的瀏覽器）
- [ ] 或完全移除後端辨識

### Phase 4: 測試
- [ ] iOS Safari 測試
- [ ] Chrome/Firefox 測試
- [ ] 效能測試（CPU 使用率）

## 注意事項
- WASM 模型較大（~100MB），首次載入需要時間
- 需要考慮 Safari 的 AudioWorklet 支援
- 可能需要 SharedArrayBuffer（需要 COOP/COEP headers）

## 現有架構
```
Browser → WebSocket → meeting-coach-server → FunASR API (Thor)
```

## 新架構
```
Browser (sherpa-onnx WASM) → WebSocket → meeting-coach-server (只傳文字)
```
