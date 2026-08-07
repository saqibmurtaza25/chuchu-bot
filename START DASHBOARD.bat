@echo off
title CHUCHU BOT Dashboard - Starting...
color 0A

echo.
echo  ============================================
echo   CHUCHU BOT - Crypto Dashboard Launcher
echo  ============================================
echo.

:: Kill any process using port 8080 or 3000
echo [1/4] Clearing old processes...
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":8080 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":3000 " 2^>nul') do taskkill /F /PID %%a >nul 2>&1
timeout /t 1 /nobreak >nul

:: Start Backend
echo [2/4] Starting Backend Engine (Port 8080)...
start "CHUCHU Backend" /min cmd /c "cd /d "d:\Dashbord Setup\packages\backend" && npm start"

:: Wait for backend to initialize
echo [3/4] Waiting for backend to initialize (10 seconds)...
timeout /t 10 /nobreak >nul

:: Start Frontend
echo [4/4] Starting Frontend Dashboard (Port 3000)...
start "CHUCHU Frontend" /min cmd /c "cd /d "d:\Dashbord Setup\packages\frontend" && npm run dev"
timeout /t 4 /nobreak >nul

:: Open browser
echo.
echo  Dashboard is starting...
echo  Opening browser at http://127.0.0.1:3000
echo.
start "" "http://127.0.0.1:3000"

echo  ============================================
echo   Dashboard is LIVE! Enjoy trading!
echo  ============================================
echo.
echo  Close this window to STOP the dashboard.
echo  (Both backend and frontend will keep running in minimized windows)
echo.
pause
