@echo off
chcp 65001 >nul
title infinite-canvas
cd /d "%~dp0web"

if not exist "node_modules" (
    echo Installing dependencies...
    call npm install --legacy-peer-deps
    if errorlevel 1 (
        echo Install failed
        pause
        exit /b 1
    )
    echo Done
)

echo Starting infinite-canvas on port 8760...
call npm run dev
pause
