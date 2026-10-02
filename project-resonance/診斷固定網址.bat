@echo off
chcp 65001 >nul
title 固定網址診斷
cd /d "%~dp0"
set "TS=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"

echo.
echo  ===== [1/5] 遊戲伺服器（本機 3000 埠）=====
powershell -NoProfile -Command "try { $r = Invoke-WebRequest -UseBasicParsing -TimeoutSec 5 http://127.0.0.1:3000/api/health; Write-Host '  OK 伺服器有在跑' } catch { Write-Host '  X 連不到本機伺服器 → 先開「啟動私服.bat」，等它顯示「私服已啟動」' }"

echo.
echo  ===== [2/5] Tailscale 登入狀態 =====
"%TS%" status
if errorlevel 1 echo   X Tailscale 沒有登入或沒在執行 → 點右下角 Tailscale 圖示登入

echo.
echo  ===== [3/5] Funnel 設定 =====
"%TS%" funnel status

echo.
echo  ===== [4/5] 你的固定網址與公開 DNS =====
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "try { ((& '%TS%' status --json | ConvertFrom-Json).Self.DNSName).TrimEnd('.') } catch { '' }"`) do set "HOST=%%a"
if "%HOST%"=="" (
  echo   X 抓不到網址
) else (
  echo   網址：https://%HOST%
  nslookup %HOST% 8.8.8.8 2>nul | findstr /i "Address" 
)

echo.
echo  ===== [5/5] 從外面連連看 =====
echo   （200 = 正常；000 = 這台電腦連不出去，不代表朋友連不上）
if not "%HOST%"=="" curl.exe -s -m 20 -o nul -w "  HTTP code: %%{http_code}\n" https://%HOST%/api/health

echo.
echo  把這個視窗整個截圖傳給我就能判斷問題在哪
echo.
pause
