import os
from pathlib import Path

desktop = Path(r"C:\Users\d\Desktop")

viewer_bat = """@echo off
title Codex CLI Viewer
echo ========================================================
echo   Checking Codex Viewer status...
echo ========================================================

netstat -ano | findstr :5656 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] Codex Viewer is running on port 5656.
    echo [*] Opening http://localhost:5656 in browser...
    start "" http://localhost:5656
    exit /b 0
)

netstat -ano | findstr :8989 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] Live Viewer is running on port 8989.
    echo [*] Opening http://localhost:8989 in browser...
    start "" http://localhost:8989
    exit /b 0
)

echo [*] Starting Live Viewer...
start "" http://localhost:8989
"C:\\Users\\d\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" "C:\\Users\\d\\Documents\\antigravity\\wonderful-noether\\tools\\codex_live_viewer.py"
pause
"""

codex_viewer_bat = """@echo off
title Codex Viewer Manager
echo ========================================================
echo   Codex Viewer Manager
echo ========================================================

netstat -ano | findstr :5656 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% EQU 0 (
    echo [*] Codex Viewer is already running on port 5656.
    echo [*] Opening browser...
    start "" http://localhost:5656
    exit /b 0
)

echo [*] Starting Codex Viewer...
set "PATH=C:\\Program Files\\nodejs;%APPDATA%\\npm;C:\\Users\\d\\AppData\\Local\\Programs\\nodejs\\node-v24.21.0-win-x64;C:\\Users\\d\\AppData\\Local\\Programs\\Python\\Python313;%PATH%"

start "" http://localhost:5656
cd /d "%APPDATA%\\npm"
if exist "codex-viewer.cmd" (
    call codex-viewer.cmd
) else (
    echo [!] Fallback to Python Live Viewer...
    start "" http://localhost:8989
    "C:\\Users\\d\\AppData\\Local\\Programs\\Python\\Python313\\python.exe" "C:\\Users\\d\\Documents\\antigravity\\wonderful-noether\\tools\\codex_live_viewer.py"
)
"""

open_lexicon_bat = """@echo off
title Open-Lexicon 25K Workstation
echo ========================================================
echo   Opening Open-Lexicon 25K Master Workstation...
echo ========================================================
start "" "C:\\Users\\d\\Desktop\\Open-Lexicon 验收工作台.html"
exit /b 0
"""

files = {
    desktop / "启动Codex可视化查看器.bat": viewer_bat,
    desktop / "启动CodexViewer.bat": codex_viewer_bat,
    desktop / "打开词典验收工作台.bat": open_lexicon_bat,
}

for path, code in files.items():
    with open(path, "wb") as f:
        # Write pure CRLF bytes in CP936 (GBK)
        f.write(code.replace("\r\n", "\n").replace("\n", "\r\n").encode("cp936"))
    print(f"Fixed: {path.name}")
