@echo off
title Restaurant POS & Admin Dashboard
echo ========================================================
echo         Starting Restaurant POS System (Offline Engine)
echo ========================================================
echo.

cd /d "%~dp0"

echo [1/2] Installing dependencies if needed...
call npm install --no-audit --no-fund

echo.
echo [2/2] Launching Local Backend Server & POS Frontend...
echo.
echo POS Terminal URL : http://localhost:3000
echo Backend API URL  : http://localhost:5000
echo ========================================================

npm run start

pause
