#!/usr/bin/env bash
#
# OceanGram Portable Startup Script
# Automatically sets up and launches both frontend and backend
#

set -e

# Detect the script directory (works even when called from elsewhere)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🌊 OceanGram Portable Launcher"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📁 Repository root: $SCRIPT_DIR"
echo ""

# Check for Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    echo "   Visit: https://nodejs.org/"
    exit 1
fi

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is not installed. Please install Python 3.10+ first."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1,2)
echo "✅ Found Python $PYTHON_VERSION"
echo "✅ Found Node $(node --version)"
echo ""

# Frontend setup
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🎨 Frontend Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

if [ ! -d "node_modules" ]; then
    echo "📦 Installing frontend dependencies..."
    npm install
else
    echo "✅ Frontend dependencies already installed"
fi

echo "🔨 Building frontend bundle..."
npm run build

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🐍 Backend Setup"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

cd "$SCRIPT_DIR/backend"

# Create virtual environment if it doesn't exist
if [ ! -d ".venv" ]; then
    echo "🔧 Creating Python virtual environment..."
    python3 -m venv .venv
else
    echo "✅ Virtual environment already exists"
fi

# Activate virtual environment
source .venv/bin/activate

# Install/upgrade backend dependencies
echo "📦 Installing backend dependencies..."
pip install --quiet --upgrade pip
pip install -e .

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "🚀 Configuration"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Set default environment variables using relative paths
export OCEANGRAM_BACKEND_HOST="${OCEANGRAM_BACKEND_HOST:-127.0.0.1}"
export OCEANGRAM_BACKEND_PORT="${OCEANGRAM_BACKEND_PORT:-8000}"
export OCEANGRAM_DOWNLOAD_ROOT="${OCEANGRAM_DOWNLOAD_ROOT:-$SCRIPT_DIR/downloads}"

# Create downloads directory if it doesn't exist
mkdir -p "$OCEANGRAM_DOWNLOAD_ROOT"

echo "🌐 Backend Host: $OCEANGRAM_BACKEND_HOST"
echo "🔌 Backend Port: $OCEANGRAM_BACKEND_PORT"
echo "💾 Download Root: $OCEANGRAM_DOWNLOAD_ROOT"

# Check for command template configuration
if [ -z "$OCEANGRAM_COMMAND_TEMPLATE" ]; then
    echo ""
    echo "⚠️  OCEANGRAM_COMMAND_TEMPLATE is not set!"
    echo "   The backend needs this to execute commands."
    echo "   Example:"
    echo "   export OCEANGRAM_COMMAND_TEMPLATE='python3 /path/to/osintgram/main.py {target} --command {command}'"
    echo ""
    echo "   You can set this in your shell or create a config file."
    echo "   For now, the backend will start but commands will fail without this."
    echo ""
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✨ Starting Services"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🌊 Backend will be available at: http://$OCEANGRAM_BACKEND_HOST:$OCEANGRAM_BACKEND_PORT"
echo "🎨 Frontend: Open $SCRIPT_DIR/index.html in your browser"
echo ""
echo "📝 To configure the backend URL in the frontend:"
echo "   1. Open index.html in your browser"
echo "   2. Set Backend API URL to: http://$OCEANGRAM_BACKEND_HOST:$OCEANGRAM_BACKEND_PORT"
echo ""
echo "Press Ctrl+C to stop the backend server"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Start the backend
oceangram-backend
