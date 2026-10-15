@echo off
chcp 65001 >nul
title infinite-canvas 一键停止

echo ==========================================================
echo   正在停止 infinite-canvas (8760) 与 Agent (17371)...
echo ==========================================================

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 8760, 17371 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0"

echo.
echo 服务已全部停止，端口已成功释放。
echo.
timeout /t 3 >nul 2>nul || ping 127.0.0.1 -n 4 >nul
