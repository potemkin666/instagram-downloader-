# OceanGram Quick Start Guide
## Running from an External Hard Drive

This guide provides quick setup instructions for running OceanGram directly from an external hard drive or USB stick.

---

## 📋 Prerequisites

Before you begin, ensure you have:

- **Python 3.10+** installed ([Download](https://www.python.org/downloads/))
- **Node.js 16+** installed ([Download](https://nodejs.org/))
- **Osintgram** or similar Instagram scraper tool installed (optional, for backend functionality)
- An external hard drive or USB stick with at least 1GB free space

---

## 🚀 Quick Start (Recommended)

### On Linux/macOS:

1. **Clone or copy** this repository to your external drive
2. **Navigate** to the repository directory
3. **Run the startup script:**
   ```bash
   ./start.sh
   ```
   
The script will automatically:
- Detect the current drive path
- Install dependencies if needed
- Create a Python virtual environment
- Build the frontend
- Start the backend server

4. **Open your browser** and load `index.html` from the repository root

### On Windows:

1. **Clone or copy** this repository to your external drive
2. **Navigate** to the repository directory in File Explorer
3. **Double-click** `start.bat` or run it from Command Prompt:
   ```batch
   start.bat
   ```

4. **Open your browser** and load `index.html` from the repository root

---

## ⚙️ Configuration

### Setting Up Osintgram Integration

After starting the backend, you need to configure the command template:

**Linux/macOS:**
```bash
export OCEANGRAM_COMMAND_TEMPLATE='python3 /path/to/osintgram/main.py {target} --command {command}'
./start.sh
```

**Windows:**
```batch
set OCEANGRAM_COMMAND_TEMPLATE=python C:\path\to\osintgram\main.py {target} --command {command}
start.bat
```

### Portable Configuration File

Create a file named `config.env` in the repository root with your settings:

```bash
# Backend settings
OCEANGRAM_BACKEND_HOST=127.0.0.1
OCEANGRAM_BACKEND_PORT=8000

# Command integration
OCEANGRAM_COMMAND_TEMPLATE=python3 /path/to/osintgram/main.py {target} --command {command}

# Downloads (relative to repo root)
OCEANGRAM_DOWNLOAD_ROOT=./downloads
```

Then source it before running:

**Linux/macOS:**
```bash
source config.env
./start.sh
```

**Windows:**
```batch
call config.env
start.bat
```

---

## 🔧 Manual Setup (Alternative)

If you prefer manual setup:

### Frontend:
```bash
cd /path/to/external-drive/instagram-downloader-
npm install
npm run build
```

### Backend:
```bash
cd /path/to/external-drive/instagram-downloader-/backend
python3 -m venv .venv
source .venv/bin/activate  # On Windows: .venv\Scripts\activate
pip install -e .
oceangram-backend
```

---

## 💾 Data Storage

By default, all data is stored relative to the repository root:

- **Downloads:** `downloads/` folder
- **Virtual Environment:** `backend/.venv/` folder
- **Frontend State:** Browser localStorage (survives across sessions)

### Changing Download Location

You can configure the download directory in two ways:

1. **Environment Variable** (requires backend restart):
   ```bash
   export OCEANGRAM_DOWNLOAD_ROOT=/path/to/external-drive/my-downloads
   ```

2. **Frontend UI** (available after the download root configuration feature):
   - Open the frontend in your browser
   - Navigate to settings
   - Set your preferred download directory

---

## 🔍 Troubleshooting

### Issue: "Command not found" or "Module not found"

**Cause:** Dependencies not installed or virtual environment not activated

**Solution:**
- Run `./start.sh` (Linux/macOS) or `start.bat` (Windows) to reinstall
- Or manually activate the virtual environment:
  ```bash
  source backend/.venv/bin/activate  # Linux/macOS
  backend\.venv\Scripts\activate     # Windows
  ```

### Issue: External drive disconnected during operation

**Cause:** USB disconnection or drive unmounting

**Solution:**
1. Reconnect the external drive
2. Navigate back to the repository directory
3. Restart the backend with `./start.sh` or `start.bat`
4. Refresh your browser

### Issue: "Permission denied" when running start.sh

**Cause:** Script not executable

**Solution:**
```bash
chmod +x start.sh
./start.sh
```

### Issue: Different drive letters on Windows

**Cause:** Windows assigns different drive letters each time

**Solution:**
1. The startup scripts automatically detect the current path
2. Use relative paths in your `OCEANGRAM_COMMAND_TEMPLATE`:
   ```batch
   set OCEANGRAM_COMMAND_TEMPLATE=python %~dp0\..\osintgram\main.py {target} --command {command}
   ```

### Issue: Backend URL keeps changing

**Cause:** Backend not running or wrong URL configured

**Solution:**
1. Ensure backend is running (check terminal output)
2. In the frontend, set Backend API URL to: `http://127.0.0.1:8000`
3. Click "Check backend status" to verify connection

### Issue: Downloads going to wrong location

**Cause:** `OCEANGRAM_DOWNLOAD_ROOT` not set or pointing to wrong path

**Solution:**
1. Set the environment variable to a path on your external drive:
   ```bash
   export OCEANGRAM_DOWNLOAD_ROOT=/path/to/external-drive/downloads
   ```
2. Or use relative paths: `./downloads`

### Issue: npm install fails with EACCES errors

**Cause:** Permission issues on external drive

**Solution:**
- Ensure the external drive is mounted with write permissions
- On Linux: Check mount options with `mount | grep <drive-name>`
- On macOS: Grant Terminal full disk access in System Preferences

---

## 🌐 Using Across Multiple Computers

The portable setup makes it easy to use the same installation across different machines:

1. **Clone once** to your external drive
2. **Run the startup script** on each machine (dependencies are installed locally)
3. **Configure paths** using relative paths or environment variables
4. **State persists** in browser localStorage (per-browser, not synced)

**Note:** Python and Node.js must be installed on each machine you use.

---

## 🔒 Security Best Practices

1. **Never commit credentials** to the repository
2. **Use HTTPS** if exposing the backend over a network
3. **Keep the external drive encrypted** if storing sensitive data
4. **Regularly backup** your downloads and configuration files
5. **Safely eject** the external drive before disconnecting

---

## 📚 Additional Resources

- **Main README:** [README.md](README.md) - Full documentation
- **Backend README:** [backend/README.md](backend/README.md) - Backend API details
- **Osintgram:** [https://github.com/Datalux/Osintgram](https://github.com/Datalux/Osintgram)

---

## 🆘 Need Help?

If you encounter issues not covered here:

1. Check the main [README.md](README.md) for detailed documentation
2. Review backend logs in the terminal where you ran the startup script
3. Check browser console (F12) for frontend errors
4. Ensure all prerequisites are installed and up to date

---

**Last Updated:** 2026-05-10  
**Version:** 1.0.0
