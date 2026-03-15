#!/usr/bin/env bash
set -e

WASM_DIR="apps/web/public/wasm"
mkdir -p "$WASM_DIR"

echo "Checking for sherpa-onnx WASM release..."

# Get the latest release version
VERSION=$(curl -s "https://api.github.com/repos/k2-fsa/sherpa-onnx/releases/latest" | grep '"tag_name"' | sed -E 's/.*"([^"]+)".*/\1/')
echo "Latest version: $VERSION"

# Use small paraformer for faster download (~80MB vs 244MB for large)
TARBALL="sherpa-onnx-wasm-simd-${VERSION}-vad-asr-zh_en-paraformer_small.tar.bz2"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/${VERSION}/${TARBALL}"

echo "Downloading: $TARBALL"
echo "From: $URL"

TMPDIR=$(mktemp -d)
trap "rm -rf $TMPDIR" EXIT

curl -L "$URL" -o "$TMPDIR/$TARBALL"
echo "Extracting..."
tar -xjf "$TMPDIR/$TARBALL" -C "$TMPDIR"

# Copy JS and WASM files to public/wasm/
EXTRACTED_DIR="$TMPDIR/$(ls $TMPDIR | grep -v '\.tar' | head -1)"
echo "Copying files from $EXTRACTED_DIR..."
cp "$EXTRACTED_DIR"/*.js "$WASM_DIR/"
cp "$EXTRACTED_DIR"/*.wasm "$WASM_DIR/"
cp "$EXTRACTED_DIR"/*.data "$WASM_DIR/"

echo "Done! Files in $WASM_DIR:"
ls -lh "$WASM_DIR"
