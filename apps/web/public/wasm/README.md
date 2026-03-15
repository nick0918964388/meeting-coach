# sherpa-onnx WASM Files

This directory contains (or should contain) the pre-built sherpa-onnx WebAssembly files for browser-side speech recognition.

## Download

Run the download script from the project root:

```bash
bash scripts/download-wasm.sh
```

Or manually download from:
https://github.com/k2-fsa/sherpa-onnx/releases

Look for: `sherpa-onnx-wasm-simd-{version}-vad-asr-zh_en-paraformer_small.tar.bz2`

## Required Files

After extraction, this directory should contain:
- `sherpa-onnx-wasm-main-vad-asr.js` - Emscripten glue loader
- `sherpa-onnx-wasm-main-vad-asr.wasm` - WASM binary (~11MB)
- `sherpa-onnx-wasm-main-vad-asr.data` - Packed model data (~80-244MB depending on model size)
- `sherpa-onnx-asr.js` - ASR JavaScript API
- `sherpa-onnx-vad.js` - VAD JavaScript API

## Notes

- First load downloads the `.data` file (model weights). Browser caches it afterward.
- Without these files, the app falls back to server-side faster-whisper transcription.
- The small paraformer model (~80MB) is recommended for faster initial load.
