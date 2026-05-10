@echo off
REM OceanGram Portable Startup Script for Windows
REM Automatically sets up and launches both frontend and backend

setlocal enabledelayedexpansion

REM Detect script directory
set "SCRIPT_DIR=%~dp0"
cd /d "%SCRIPT_DIR%"

echo ================================================================
echo  OceanGram Portable Launcher
echo ================================================================
echo  Repository root: %SCRIPT_DIR%
echo.

REM Check for Node.js
where node >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed. Please install Node.js first.
    echo         Visit: https://nodejs.org/
    pause
    exit /b 1
)

REM Check for Python
where python >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERROR] Python is not installed. Please install Python 3.10+ first.
    echo         Visit: https://www.python.org/downloads/
    pause
    exit /b 1
)

for /f "tokens=2" %%i in ('python --version 2^>^&1') do set PYTHON_VERSION=%%i
for /f "tokens=*" %%i in ('node --version 2^>^&1') do set NODE_VERSION=%%i

echo [OK] Found Python %PYTHON_VERSION%
echo [OK] Found Node %NODE_VERSION%
echo.

REM Frontend setup
echo ================================================================
echo  Frontend Setup
echo ================================================================

if not exist "node_modules" (
    echo [*] Installing frontend dependencies...
    call npm install
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to install frontend dependencies
        pause
        exit /b 1
    )
) else (
    echo [OK] Frontend dependencies already installed
)

echo [*] Building frontend bundle...
call npm run build
if %errorlevel% neq 0 (
    echo [ERROR] Failed to build frontend
    pause
    exit /b 1
)

echo.
echo ================================================================
echo  Backend Setup
echo ================================================================

cd /d "%SCRIPT_DIR%backend"

REM Create virtual environment if it doesn't exist
if not exist ".venv" (
    echo [*] Creating Python virtual environment...
    python -m venv .venv
    if %errorlevel% neq 0 (
        echo [ERROR] Failed to create virtual environment
        pause
        exit /b 1
    )
) else (
    echo [OK] Virtual environment already exists
)

REM Activate virtual environment
call .venv\Scripts\activate.bat

REM Install/upgrade backend dependencies
echo [*] Installing backend dependencies...
python -m pip install --quiet --upgrade pip
pip install -e .
if %errorlevel% neq 0 (
    echo [ERROR] Failed to install backend dependencies
    pause
    exit /b 1
)

echo.
echo ================================================================
echo  Configuration
echo ================================================================

REM Set default environment variables using relative paths
if "%OCEANGRAM_BACKEND_HOST%"=="" set "OCEANGRAM_BACKEND_HOST=127.0.0.1"
if "%OCEANGRAM_BACKEND_PORT%"=="" set "OCEANGRAM_BACKEND_PORT=8000"
if "%OCEANGRAM_DOWNLOAD_ROOT%"=="" set "OCEANGRAM_DOWNLOAD_ROOT=%SCRIPT_DIR%downloads"

REM Create downloads directory if it doesn't exist
if not exist "%OCEANGRAM_DOWNLOAD_ROOT%" mkdir "%OCEANGRAM_DOWNLOAD_ROOT%"

echo  Backend Host: %OCEANGRAM_BACKEND_HOST%
echo  Backend Port: %OCEANGRAM_BACKEND_PORT%
echo  Download Root: %OCEANGRAM_DOWNLOAD_ROOT%

REM Check for command template configuration
if "%OCEANGRAM_COMMAND_TEMPLATE%"=="" (
    echo.
    echo [WARNING] OCEANGRAM_COMMAND_TEMPLATE is not set!
    echo           The backend needs this to execute commands.
    echo           Example:
    echo           set OCEANGRAM_COMMAND_TEMPLATE=python C:\path\to\osintgram\main.py {target} --command {command}
    echo.
    echo           You can set this in your environment or create a config file.
    echo           For now, the backend will start but commands will fail without this.
    echo.
)

echo.
echo ================================================================
echo  Starting Services
echo ================================================================
echo.
echo  Backend will be available at: http://%OCEANGRAM_BACKEND_HOST%:%OCEANGRAM_BACKEND_PORT%
echo  Frontend: Open %SCRIPT_DIR%index.html in your browser
echo.
echo  To configure the backend URL in the frontend:
echo    1. Open index.html in your browser
echo    2. Set Backend API URL to: http://%OCEANGRAM_BACKEND_HOST%:%OCEANGRAM_BACKEND_PORT%
echo.
echo  Press Ctrl+C to stop the backend server
echo ================================================================
echo.

REM Start the backend
oceangram-backend
