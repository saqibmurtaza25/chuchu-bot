@echo off
setlocal enabledelayedexpansion
title CHUCHU BOT v2 - Local Launcher
chcp 65001 >nul

echo.
echo ==============================================
echo    CHUCHU BOT v2 - INSTALL AND RUN LOCALLY
echo ==============================================
echo.

rem ---------- 1. Check Node.js ----------
where node >nul 2>nul
if errorlevel 1 (
  echo [ERROR] Node.js not found.
  echo         Install Node.js LTS from https://nodejs.org then run this file again.
  pause
  exit /b 1
)
for /f "delims=" %%v in ('node -v') do set NODE_VER=%%v
echo [OK] Node.js %NODE_VER%

rem ---------- 2. Ensure pnpm ----------
where pnpm >nul 2>nul
if errorlevel 1 (
  echo [..] Installing pnpm globally...
  call npm install -g pnpm
  if errorlevel 1 (
    echo [ERROR] Could not install pnpm.
    pause
    exit /b 1
  )
)
for /f "delims=" %%v in ('pnpm -v') do set PNPM_VER=%%v
echo [OK] pnpm %PNPM_VER%

rem ---------- 3. Install dependencies ----------
echo.
echo [..] Installing project dependencies (first run takes a few minutes)...
call pnpm install
if errorlevel 1 (
  echo [ERROR] Dependency install failed. Check internet connection and try again.
  pause
  exit /b 1
)
echo [OK] Dependencies installed

rem ---------- 4. Build engine + backend ----------
echo.
echo [..] Building engine and backend...
call pnpm --filter @chuchu/shared --filter @chuchu/engine-core --filter @chuchu/backend run build
if errorlevel 1 (
  echo [ERROR] Build failed. See messages above.
  pause
  exit /b 1
)
echo [OK] Build complete

rem ---------- 5. Start backend in its own window ----------
echo.
echo [..] Starting CHUCHU Backend on port 8080...
start "CHUCHU Backend (8080)" cmd /k "cd /d %~dp0packages\backend && set PORT=8080 && node start-server.js"

rem ---------- 6. Start frontend in its own window ----------
echo [..] Starting frontend on http://localhost:3000 ...
start "CHUCHU Frontend (3000)" cmd /k "cd /d %~dp0packages\frontend && npx vite --port 3000 --strictPort"

rem ---------- 7. Open browser ----------
echo [..] Opening browser...
timeout /t 8 /nobreak >nul
start http://localhost:3000

echo.
echo ==============================================
echo    CHUCHU BOT IS RUNNING
echo   Frontend : http://localhost:3000
echo   Backend  : http://localhost:8080
echo ----------------------------------------------
echo   Close the two CHUCHU windows to stop the bot.
echo ==============================================
echo.
pause
