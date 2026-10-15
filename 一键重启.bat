@echo off
chcp 65001 >nul
title infinite-canvas 一键重启

echo ==========================================================
echo               infinite-canvas 一键重启
echo ==========================================================
echo.
echo 正在停止现有服务并释放端口...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 8760, 17371 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0"
ping 127.0.0.1 -n 2 >nul
echo 正在重新启动...
echo.

call "%~dp0一键启动.bat"
