@echo off
setlocal enabledelayedexpansion
title HRMS Agent Setup
cd /d "%~dp0"

set INSTALL_DIR=%~dp0

:: ── Admin check ──────────────────────────────────────────────
net session >nul 2>&1
if errorlevel 1 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
    exit /b
)

:: ── Node.js check ────────────────────────────────────────────
node --version >nul 2>&1
if errorlevel 1 (
    echo.
    echo  Node.js not found. Download from https://nodejs.org  [LTS]
    echo  Install it, reboot, then run this again.
    echo.
    pause
    exit /b
)

:: ── Main menu ─────────────────────────────────────────────────
:main_menu
cls
echo.
echo  ================================================
echo   HRMS Hikvision Relay Agent  -  Manager
echo  ================================================
echo.
echo   Running agents:
echo   ---------------

set HAS_AGENTS=0
for %%F in ("%INSTALL_DIR%config-*.json") do (
    set CFG_NAME=%%~nF
    set TASK=HRMS Agent !CFG_NAME:config-=!
    set HAS_AGENTS=1
    tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul
    echo     [!CFG_NAME:config-=!]   config: %%~nxF
)
if !HAS_AGENTS!==0 (
    echo     (none installed yet)
)
if exist "%INSTALL_DIR%config.json" (
    echo     [default]   config: config.json
)

echo.
echo    N  --  New agent (add another floor/zone)
echo    M  --  Manage existing agent
echo    Q  --  Quit
echo.
set /p CHOICE="  Choice: "
if /i "!CHOICE!"=="n" goto :new_agent
if /i "!CHOICE!"=="m" goto :manage_menu
if /i "!CHOICE!"=="q" exit /b
goto :main_menu

:: ── New agent setup ───────────────────────────────────────────
:new_agent
cls
echo.
echo  ================================================
echo   Add New Agent
echo  ================================================
echo.
echo  Each agent has a profile name (e.g. floor1, floor2, reception).
echo  It will use config-{profile}.json and run as a separate background task.
echo.
set /p PROFILE="  Profile name (e.g. floor1): "
if "!PROFILE!"=="" goto :main_menu

set CONFIG_FILE=config-!PROFILE!.json
set TASK_NAME=HRMS Agent !PROFILE!

if exist "%INSTALL_DIR%!CONFIG_FILE!" (
    echo.
    echo  Profile "!PROFILE!" already exists.
    echo  Use Manage to start/stop/reinstall it.
    pause
    goto :main_menu
)

echo.
set /p AGENT_NAME="  Display name (e.g. Floor 1 Reception): "
if "!AGENT_NAME!"=="" set AGENT_NAME=!PROFILE!

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[ordered]@{serverUrl='http://185.125.200.112:7272';agentToken='beebe0a45627c39f2c3b025f338e1f2f6984be97a1be20d95c6201a702e37fc1';agentName='!AGENT_NAME!';pollIntervalMs=5000;deviceCheckIntervalMs=30000;hikvisionTimeoutMs=10000;logFile='agent-!PROFILE!.log';logMaxSizeMb=10}; [IO.File]::WriteAllText('%INSTALL_DIR%!CONFIG_FILE!', ($c|ConvertTo-Json), [Text.UTF8Encoding]::new($false))"

echo  OK  !CONFIG_FILE! created.

schtasks /delete /tn "!TASK_NAME!" /f >nul 2>&1
schtasks /create /tn "!TASK_NAME!" /tr "node \"%INSTALL_DIR%relay-agent.js\" --config \"%INSTALL_DIR%!CONFIG_FILE!\"" /sc onstart /ru SYSTEM /rl HIGHEST /f >nul 2>&1
echo  OK  Auto-start registered as "!TASK_NAME!".

schtasks /run /tn "!TASK_NAME!" >nul 2>&1
echo  OK  Agent started in background.
echo.
echo  ================================================
echo   Agent "!PROFILE!" is running.
echo   Log: %INSTALL_DIR%agent-!PROFILE!.log
echo  ================================================
echo.
pause
goto :main_menu

:: ── Manage existing agent ─────────────────────────────────────
:manage_menu
cls
echo.
echo  ================================================
echo   Manage Agent
echo  ================================================
echo.
echo  Available profiles:
echo.
set IDX=0
for %%F in ("%INSTALL_DIR%config-*.json") do (
    set /a IDX+=1
    set CFG!IDX!=%%~nxF
    set PRF!IDX!=%%~nF
    set PRF!IDX!=!PRF%IDX%:config-=!
    echo    !IDX!.  [!PRF%IDX%!]  %%~nxF
)
if exist "%INSTALL_DIR%config.json" (
    set /a IDX+=1
    set CFG!IDX!=config.json
    set PRF!IDX!=default
    echo    !IDX!.  [default]  config.json
)
if !IDX!==0 (
    echo    (no profiles found)
    echo.
    pause
    goto :main_menu
)
echo.
set /p SEL="  Select number (or 0 to go back): "
if "!SEL!"=="0" goto :main_menu
if !SEL! GTR !IDX! goto :manage_menu

set SEL_CFG=!CFG%SEL%!
set SEL_PRF=!PRF%SEL%!
if "!SEL_PRF!"=="default" (
    set TASK_NAME=HRMS Relay Agent
) else (
    set TASK_NAME=HRMS Agent !SEL_PRF!
)

:profile_menu
cls
echo.
echo  ================================================
echo   Agent: !SEL_PRF!   (config: !SEL_CFG!)
echo  ================================================
echo.
echo    S  --  Start / Restart
echo    L  --  View log (last 30 lines)
echo    R  --  Reinstall (change name)
echo    U  --  Uninstall this agent
echo    B  --  Back
echo.
set /p CHOICE="  Choice: "
if /i "!CHOICE!"=="s" goto :start_agent
if /i "!CHOICE!"=="l" goto :view_log
if /i "!CHOICE!"=="r" goto :reinstall_agent
if /i "!CHOICE!"=="u" goto :uninstall_agent
if /i "!CHOICE!"=="b" goto :manage_menu
goto :profile_menu

:start_agent
schtasks /end /tn "!TASK_NAME!" >nul 2>&1
timeout /t 2 /nobreak >nul
schtasks /run /tn "!TASK_NAME!" >nul 2>&1
echo.
echo  Agent "!SEL_PRF!" started.
pause
goto :profile_menu

:view_log
set LOG_FILE=%INSTALL_DIR%agent-!SEL_PRF!.log
if "!SEL_PRF!"=="default" set LOG_FILE=%INSTALL_DIR%agent.log
if exist "!LOG_FILE!" (
    echo.
    powershell -NoProfile -Command "Get-Content '!LOG_FILE!' -Tail 30"
) else (
    echo  Log not found: !LOG_FILE!
)
echo.
pause
goto :profile_menu

:reinstall_agent
schtasks /end /tn "!TASK_NAME!" >nul 2>&1
del "%INSTALL_DIR%!SEL_CFG!" >nul 2>&1
echo.
set /p AGENT_NAME="  New display name for !SEL_PRF!: "
if "!AGENT_NAME!"=="" set AGENT_NAME=!SEL_PRF!

if "!SEL_PRF!"=="default" (
    set LOG_ENTRY=agent.log
) else (
    set LOG_ENTRY=agent-!SEL_PRF!.log
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$c=[ordered]@{serverUrl='http://185.125.200.112:7272';agentToken='beebe0a45627c39f2c3b025f338e1f2f6984be97a1be20d95c6201a702e37fc1';agentName='!AGENT_NAME!';pollIntervalMs=5000;deviceCheckIntervalMs=30000;hikvisionTimeoutMs=10000;logFile='!LOG_ENTRY!';logMaxSizeMb=10}; [IO.File]::WriteAllText('%INSTALL_DIR%!SEL_CFG!', ($c|ConvertTo-Json), [Text.UTF8Encoding]::new($false))"

schtasks /run /tn "!TASK_NAME!" >nul 2>&1
echo  OK  Agent "!SEL_PRF!" restarted with new name.
pause
goto :profile_menu

:uninstall_agent
schtasks /end /tn "!TASK_NAME!" >nul 2>&1
schtasks /delete /tn "!TASK_NAME!" /f >nul 2>&1
set /p DEL="  Delete config file !SEL_CFG! too? (y/n): "
if /i "!DEL!"=="y" del "%INSTALL_DIR%!SEL_CFG!" >nul 2>&1
echo.
echo  Agent "!SEL_PRF!" uninstalled.
pause
goto :main_menu
