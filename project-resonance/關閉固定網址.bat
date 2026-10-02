@echo off
chcp 65001 >nul
title 關閉固定網址
set "TS=tailscale"
where tailscale >nul 2>nul
if errorlevel 1 if exist "%ProgramFiles%\Tailscale\tailscale.exe" set "TS=%ProgramFiles%\Tailscale\tailscale.exe"
"%TS%" funnel reset
echo.
echo  已關閉對外連線。之後想再開，雙擊「開啟固定網址.bat」即可（網址不會變）。
echo.
pause
