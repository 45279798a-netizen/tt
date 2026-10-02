@echo off
chcp 65001 >nul
title 固定網址（Tailscale Funnel）
cd /d "%~dp0"

set "TS=tailscale"
where tailscale >nul 2>nul
if not errorlevel 1 goto check_server
if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe" & goto check_server

echo.
echo  第一次使用，正在安裝 Tailscale（免費）...
echo.
winget install --id Tailscale.Tailscale -e --accept-source-agreements --accept-package-agreements
if errorlevel 1 goto fail_install
echo.
echo  ================================================================
echo   安裝完成！接下來：
echo   1. 右下角工作列會出現 Tailscale 圖示，點它登入
echo      （用 Google 或 Microsoft 帳號登入即可，免費）
echo   2. 登入好之後，再雙擊一次「開啟固定網址.bat」
echo  ================================================================
pause
exit /b

:check_server
powershell -NoProfile -Command "try { $c = New-Object Net.Sockets.TcpClient('127.0.0.1', 3000); $c.Close(); exit 0 } catch { exit 1 }" >nul 2>nul
if errorlevel 1 goto noserver

"%TS%" status >nul 2>nul
if errorlevel 1 goto nologin

echo.
echo  正在開啟固定網址...
echo  （第一次會出現一個 https://login.tailscale.com/... 的網址，
echo    用瀏覽器打開它、按「Enable」允許 Funnel，再回來這個視窗）
echo.
"%TS%" funnel --bg 3000
if errorlevel 1 goto fail_funnel

echo.
echo  ================================================================
echo   成功！下面那行 https://....ts.net 就是你的「固定網址」
echo   * 網址永遠不會變，傳給朋友一次就好，也能安裝成 App
echo   * 這個設定會一直保留，之後只要開「啟動私服.bat」就能連
echo   * 想關掉對外連線：雙擊「關閉固定網址.bat」
echo  ================================================================
echo.
"%TS%" funnel status
echo.
pause
exit /b

:noserver
echo.
echo  偵測不到遊戲伺服器！
echo  請先雙擊「啟動私服.bat」，等它顯示「私服已啟動」後，再開這個檔案。
echo.
pause
exit /b

:nologin
echo.
echo  Tailscale 還沒登入。
echo  請點右下角工作列的 Tailscale 圖示登入，登入後再雙擊這個檔案。
echo.
pause
exit /b

:fail_funnel
echo.
echo  開啟失敗。如果上面有出現 https://login.tailscale.com/... 的網址，
echo  請用瀏覽器打開它，按允許後再執行一次這個檔案。
echo.
pause
exit /b

:fail_install
echo.
echo  自動安裝失敗，請手動到 https://tailscale.com/download 下載安裝，
echo  登入後再執行一次這個檔案。
start "" https://tailscale.com/download
pause
exit /b
