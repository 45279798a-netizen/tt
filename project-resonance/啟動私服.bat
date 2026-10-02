@echo off
chcp 65001 >nul
title Project Resonance 私服
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto nonode

goto install

:install
echo.
echo  [1/2] 檢查並安裝套件（第一次約 1~3 分鐘，之後幾秒鐘）...
echo.
call npm install --no-audit --no-fund
if errorlevel 1 goto fail

:run
echo.
echo  [2/2] 打包遊戲並啟動伺服器...
echo.
echo  * 這個視窗要一直開著，關掉伺服器就停了
echo  * 要關閉伺服器請按 Ctrl+C，存檔會自動儲存
echo.
call npm start
echo.
echo  伺服器已停止。
pause
exit /b

:nonode
echo.
echo  找不到 Node.js！
echo  請先到 https://nodejs.org 下載安裝 LTS 版本，裝完後再雙擊這個檔案。
echo.
start "" https://nodejs.org
pause
exit /b

:fail
echo.
echo  套件安裝失敗，請確認網路連線正常後再試一次。
pause
exit /b
