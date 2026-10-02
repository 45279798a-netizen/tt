@echo off
chcp 65001 >nul
title Project Resonance 開發模式
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode
call npm install --no-audit --no-fund

echo.
echo  開發模式：改程式碼會自動更新畫面
echo  請用瀏覽器開 http://localhost:5173
echo.
call npm run dev
pause
exit /b

:nonode
echo  找不到 Node.js，請先到 https://nodejs.org 安裝 LTS 版本。
start "" https://nodejs.org
pause
