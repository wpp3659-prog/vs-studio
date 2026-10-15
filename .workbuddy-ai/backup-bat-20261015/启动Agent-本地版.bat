@echo off
chcp 65001 >nul
title canvas-agent (local source)
cd /d "%~dp0canvas-agent"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --no-audit --no-fund
    if errorlevel 1 (
        echo Install failed
        pause
        exit /b 1
    )
)

echo Building local canvas-agent...
call npm run build
if errorlevel 1 (
    echo Build failed
    pause
    exit /b 1
)

echo Starting LOCAL canvas-agent (with MCP fix)...
set PORT=17371
REM 后台等待就绪后自动打开画布页面并带上连接信息，无需手动复制 token。
start "" /min cmd /c "node open-agent-page.mjs"
node dist/index.js --debug
pause
