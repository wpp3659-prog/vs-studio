@echo off
chcp 65001 >nul
title VS studio 一键启动

rem ==========================================================
rem   VS studio + 本地 Canvas-Agent 一键启动脚本
rem ==========================================================

set "ROOT=%~dp0"
if exist "%ROOT%web\package.json" goto :check_root_done
if exist "%ROOT%infinite-canvas-main\web\package.json" (
    set "ROOT=%ROOT%infinite-canvas-main\"
    goto :check_root_done
)

echo.
echo ==========================================================
echo   [错误] 找不到项目目录！
echo   请确保一键启动.bat 放置在项目根目录下。
echo ==========================================================
echo.
pause
exit /b 1

:check_root_done
cd /d "%ROOT%"

echo ==========================================================
echo               VS studio 一键启动
echo ==========================================================
echo.
echo  将自动启动以下两个服务：
echo    [1] VS studio 画布网页 [端口: 8760]
echo    [2] canvas-agent 本地 Agent  [端口: 17371]
echo.
echo  启动完成后，会自动打开默认浏览器并自动连接 Agent。
echo.

rem ---- 1. Node.js 环境检查 ----
where node >nul 2>nul
if not errorlevel 1 goto :node_ok

if exist "E:\nodejs\node.exe" (
    set "PATH=E:\nodejs;%PATH%"
    goto :node_ok
)
if exist "C:\Program Files\nodejs\node.exe" (
    set "PATH=C:\Program Files\nodejs;%PATH%"
    goto :node_ok
)

echo.
echo ==========================================================
echo   [错误] 未检测到 Node.js，请先安装 Node.js [推荐 v18 或 v20+]
echo   官方下载地址: https://nodejs.org/
echo ==========================================================
echo.
pause
exit /b 1

:node_ok

rem ---- 2. 释放旧端口占用 ----
echo [1/5] 检查端口占用 [8760, 17371]...
powershell -NoProfile -ExecutionPolicy Bypass -Command "try { Get-NetTCPConnection -LocalPort 8760, 17371 -State Listen -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique | ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue } } catch {}; exit 0"
ping 127.0.0.1 -n 2 >nul

rem ---- 3. 依赖检查 ----
if exist "%ROOT%web\node_modules" goto :web_dep_ok
echo [2/5] 首次运行：安装画布网页依赖 [可能需要 1~3 分钟]...
pushd "%ROOT%web"
call npm install --legacy-peer-deps
if errorlevel 1 (
    echo [错误] 画布网页依赖安装失败
    popd
    pause
    exit /b 1
)
popd
goto :check_agent_dep

:web_dep_ok
echo [2/5] 画布网页依赖已就绪。

:check_agent_dep
if exist "%ROOT%canvas-agent\node_modules" goto :agent_dep_ok
echo [3/5] 首次运行：安装本地 Agent 依赖...
pushd "%ROOT%canvas-agent"
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [错误] 本地 Agent 依赖安装失败
    popd
    pause
    exit /b 1
)
popd
goto :build_agent

:agent_dep_ok
echo [3/5] 本地 Agent 依赖已就绪。

:build_agent
rem ---- 4. 构建本地 Agent ----
echo [4/5] 构建本地 Agent...
pushd "%ROOT%canvas-agent"
call npm run build
if errorlevel 1 (
    echo [错误] 本地 Agent 构建失败
    popd
    pause
    exit /b 1
)
rem 构建完成后必须确认产物已就绪：曾出现过构建刚返回、产物还在写盘，
rem 紧接着启动的 node 加载到旧代码，导致改动不生效（界面看起来"没更新"）。
if not exist "%ROOT%canvas-agent\dist\index.js" (
    echo [错误] 未找到构建产物 dist\index.js
    popd
    pause
    exit /b 1
)
rem 等待文件句柄彻底释放，避免启动瞬间读到写了一半的产物。
ping 127.0.0.1 -n 2 >nul
popd

rem ---- 5. 启动服务 ----
echo [5/5] 正在启动服务...

pushd "%ROOT%web"
start "VS studio 画布网页 (端口 8760)" cmd /k "npm run dev"
popd

pushd "%ROOT%canvas-agent"
start "" /min cmd /c "node open-agent-page.mjs"
start "canvas-agent 本地服务 (端口 17371)" cmd /k "set ""PORT=17371"" & node dist/index.js --debug"
popd

echo.
echo ==========================================================
echo   所有服务已成功拉起！
echo   稍等几秒后，浏览器会自动打开并连接本地 Agent。
echo.
echo   如果浏览器未能自动打开，请手动访问：
echo   网址: http://127.0.0.1:8760
echo.
echo   提示：请保持弹出的两个服务窗口运行，关闭任意一个将停止对应功能。
echo ==========================================================
echo.
echo 本引导窗口将在 8 秒后自动关闭...
timeout /t 8 >nul 2>nul || ping 127.0.0.1 -n 9 >nul
