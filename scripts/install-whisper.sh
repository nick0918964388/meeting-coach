#!/bin/bash
set -e

echo "🎙️  Installing faster-whisper..."

# Check Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.10+"
    exit 1
fi

PYTHON_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
echo "✓ Python $PYTHON_VERSION found"

# Install faster-whisper
pip3 install faster-whisper --break-system-packages 2>/dev/null || pip3 install faster-whisper

echo "✓ faster-whisper installed"

# Test installation
python3 -c "import faster_whisper; print(f'✓ faster-whisper {faster_whisper.__version__} OK')"

# Download base model
echo ""
echo "📦 Pre-downloading Whisper 'base' model..."
python3 -c "
from faster_whisper import WhisperModel
print('Downloading base model (this may take a moment)...')
model = WhisperModel('base', device='cpu', compute_type='int8')
print('✓ Model ready!')
"

echo ""
echo "✅ Whisper setup complete!"
