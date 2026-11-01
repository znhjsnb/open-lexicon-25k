import os
from pathlib import Path

desktop = Path(r"C:\Users\d\Desktop")

bat_code = """@echo off
title Open-Lexicon 25K
echo ========================================================
echo   Checking Open-Lexicon 25K Web Service...
echo ========================================================

netstat -ano | findstr :8765 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Starting background server on port 8765...
    start "" "C:\\Users\\d\\AppData\\Local\\Programs\\Python\\Python313\\pythonw.exe" "C:\\Users\\d\\Documents\\dict\\app\\server.py"
    timeout /t 1 >nul
)

echo [*] Opening Open-Lexicon 25K in browser...
start "" "http://127.0.0.1:8765"
exit /b 0
"""

bat_path = desktop / "启动Open-Lexicon词典工作台.bat"
with open(bat_path, "wb") as f:
    f.write(bat_code.replace("\r\n", "\n").replace("\n", "\r\n").encode("cp936"))
print(f"Created: {bat_path}")

url_code = """[InternetShortcut]
URL=http://127.0.0.1:8765
"""
url_path = desktop / "Open-Lexicon 词典工作台.url"
with open(url_path, "wb") as f:
    f.write(url_code.replace("\r\n", "\n").replace("\n", "\r\n").encode("ascii"))
print(f"Created: {url_path}")
