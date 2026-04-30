@echo off
chcp 65001 > nul
setlocal enabledelayedexpansion

:: ================================================
::  HRMS Hikvision Relay Agent
::  Double-click -> installs + autostart + runs
:: ================================================

set TASK_NAME=HRMS Hikvision Agent
set INSTALL_DIR=C:\Hikvision

:: --- Hardcoded settings (edit if server changes) ---
set CFG_SRV=http://185.125.200.112:7272
set CFG_TOK=beebe0a45627c39f2c3b025f338e1f2f6984be97a1be20d95c6201a702e37fc1
set CFG_CID=1
:: ---------------------------------------------------

:: Auto-elevate to Administrator
net session >nul 2>&1
if %errorlevel% neq 0 (
    powershell -NoProfile -ExecutionPolicy Bypass -Command "Start-Process cmd -ArgumentList '/c \"%~f0\"' -Verb RunAs"
    exit /b
)

cls
echo.
echo  ================================================
echo   HRMS -- Hikvision Relay Agent  v1.0
echo  ================================================
echo.

:: If already installed -- show menu
if not exist "%INSTALL_DIR%\relay-agent.js" goto :do_install

echo  Agent is installed at %INSTALL_DIR%
echo.
echo    Enter  -- start / restart
echo    U      -- uninstall
echo    R      -- reinstall (update files)
echo.
set /p CHOICE="  Choice: "
if /i "!CHOICE!"=="u" goto :do_uninstall
if /i "!CHOICE!"=="r" goto :do_install
goto :do_start

:: ================================================
:do_install
cls
echo.
echo  [1/3] Checking Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ERROR: Node.js is not installed!
    echo.
    echo  Install Node.js:
    echo    1. Open browser
    echo    2. Go to https://nodejs.org
    echo    3. Click "LTS" button
    echo    4. Install with default settings
    echo    5. RESTART the computer
    echo    6. Run AGENT.bat again
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  OK  Node.js !NODE_VER!

echo.
echo  [2/3] Copying files to %INSTALL_DIR%...
if not exist "%INSTALL_DIR%" mkdir "%INSTALL_DIR%"

set SRC=%~dp0
if "!SRC:~-1!"=="\" set SRC=!SRC:~0,-1!

copy /Y "!SRC!\relay-agent.js" "%INSTALL_DIR%\relay-agent.js" >nul
copy /Y "!SRC!\package.json"   "%INSTALL_DIR%\package.json"   >nul
echo  OK  Files copied to %INSTALL_DIR%

:: Write config.json (always overwrite with latest settings)
set HRMS_SRV=%CFG_SRV%
set HRMS_TOK=%CFG_TOK%
set HRMS_CID=%CFG_CID%
set HRMS_DIR=%INSTALL_DIR%

powershell -NoProfile -ExecutionPolicy Bypass -Command "$json=[ordered]@{serverUrl=$env:HRMS_SRV;agentToken=$env:HRMS_TOK;companyId=[int]$env:HRMS_CID;pollIntervalMs=5000;deviceCheckIntervalMs=30000;hikvisionTimeoutMs=10000;logFile='agent.log';logMaxSizeMb=10}|ConvertTo-Json; [System.IO.File]::WriteAllText(\"$env:HRMS_DIR\config.json\",$json,[System.Text.UTF8Encoding]::new($false))"

if not exist "%INSTALL_DIR%\config.json" (
    echo  ERROR: Failed to create config.json
    pause
    exit /b 1
)
echo  OK  config.json written

echo.
echo  Checking server connection...
set HRMS_URL=%CFG_SRV%/api/agent/status?companyId=%CFG_CID%

powershell -NoProfile -ExecutionPolicy Bypass -Command "try { $r=Invoke-WebRequest -Uri $env:HRMS_URL -Headers @{'X-Agent-Token'=$env:HRMS_TOK} -TimeoutSec 8 -UseBasicParsing; $s=$r.Content|ConvertFrom-Json; Write-Host \"  OK  Server reachable  pending=$($s.pending)  done=$($s.done)\" } catch { Write-Host (\"  WARNING: \"+$_.Exception.Message) }"

:: ================================================
:do_register
echo.
echo  [3/3] Registering autostart...

schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /delete /tn "HRMS Relay Agent" /f >nul 2>&1

(
    echo @echo off
    echo :loop
    echo node "%INSTALL_DIR%\relay-agent.js"
    echo timeout /t 5 /nobreak ^>nul
    echo goto loop
) > "%INSTALL_DIR%\runner.bat"

powershell -NoProfile -ExecutionPolicy Bypass -Command "$a=New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c \"%INSTALL_DIR%\runner.bat\"' -WorkingDirectory '%INSTALL_DIR%'; $t=New-ScheduledTaskTrigger -AtStartup; $s=New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable; $p=New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest; Register-ScheduledTask -TaskName '%TASK_NAME%' -Action $a -Trigger $t -Settings $s -Principal $p -Force | Out-Null; Write-Host '  OK  Autostart registered'"

if %errorlevel% neq 0 (
    echo  ERROR: Failed to register scheduled task
    pause
    exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut([Environment]::GetFolderPath('CommonDesktopDirectory')+'\HRMS Agent Logs.lnk'); $lnk.TargetPath='notepad.exe'; $lnk.Arguments='%INSTALL_DIR%\agent.log'; $lnk.IconLocation='shell32.dll,168'; $lnk.Save()" >nul 2>&1
echo  OK  Desktop shortcut "HRMS Agent Logs" created

:: ================================================
:do_start
echo.
echo  Starting agent...
taskkill /f /fi "imagename eq node.exe" >nul 2>&1
timeout /t 1 /nobreak >nul
schtasks /run /tn "%TASK_NAME%" >nul 2>&1
timeout /t 4 /nobreak >nul

cls
echo.
echo  ================================================
echo   HRMS Hikvision Agent -- RUNNING
echo  ================================================
echo.
echo   Folder:    %INSTALL_DIR%
echo   Server:    %CFG_SRV%
echo   Company:   %CFG_CID%
echo   Log:       %INSTALL_DIR%\agent.log
echo.
echo   Autostart: on Windows startup (SYSTEM)
echo   On crash:  auto-restarts after 5 sec
echo.
echo  ================================================
echo.
echo  Live log output (press Ctrl+C to close window):
echo  ------------------------------------------------
timeout /t 2 /nobreak >nul

:wait_log
if exist "%INSTALL_DIR%\agent.log" (
    powershell -NoProfile -Command "Get-Content '%INSTALL_DIR%\agent.log' -Wait -Tail 30"
    goto :eof
)
timeout /t 2 /nobreak >nul
goto :wait_log

:: ================================================
:do_uninstall
echo.
echo  Removing HRMS Hikvision Agent...
taskkill /f /im node.exe >nul 2>&1
schtasks /delete /tn "%TASK_NAME%" /f >nul 2>&1
schtasks /delete /tn "HRMS Relay Agent" /f >nul 2>&1
echo  OK  Scheduled task removed
echo.
set /p DEL="  Delete files from %INSTALL_DIR%? (y/n): "
if /i "!DEL!"=="y" (
    rd /s /q "%INSTALL_DIR%" >nul 2>&1
    echo  OK  Folder deleted
)
echo.
echo  Done.
pause
exit /b 0
