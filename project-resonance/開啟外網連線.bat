@echo off
chcp 65001 >nul
title 外網 https 連線 - 給朋友 / 安裝到手機用
cd /d "%~dp0"

set "CF=cloudflared"
where cloudflared >nul 2>nul
if not errorlevel 1 goto run
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe" & goto run
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe" & goto run

echo.
echo  第一次使用，正在安裝 cloudflared（Cloudflare 免費通道工具）...
echo.
winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto fail
if exist "%ProgramFiles(x86)%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles(x86)%\cloudflared\cloudflared.exe" & goto run
if exist "%ProgramFiles%\cloudflared\cloudflared.exe" set "CF=%ProgramFiles%\cloudflared\cloudflared.exe" & goto run
echo.
echo  安裝完成！請關閉這個視窗，再雙擊一次「開啟外網連線.bat」。
pause
exit /b

:run
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3000); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 goto noserver
echo.
echo  ================================================================
echo   請先確認「啟動私服.bat」已經在另一個視窗執行中
echo.
echo   等幾秒後下面會出現一行：
echo       https://xxxx-xxxx.trycloudflare.com
echo   把這個網址傳給朋友，手機開這個網址就能玩，也能「安裝到主畫面」
echo.
echo   * 這個視窗也要一直開著，關掉外網就斷了
echo   * 每次重開網址都會變，要重新傳給朋友
echo  ================================================================
echo.
"%CF%" tunnel --url http://127.0.0.1:3000
pause
exit /b

:noserver
echo.
echo  偵測不到遊戲伺服器！
echo  請先雙擊「啟動私服.bat」，等它顯示「私服已啟動」後，再開這個檔案。
echo.
pause
exit /b

:fail
echo.
echo  自動安裝失敗。請手動下載 cloudflared：
echo  https://github.com/cloudflare/cloudflared/releases/latest
echo  下載 cloudflared-windows-amd64.exe，改名成 cloudflared.exe，放到這個資料夾裡再執行一次。
start "" https://github.com/cloudflare/cloudflared/releases/latest
pause
exit /b
