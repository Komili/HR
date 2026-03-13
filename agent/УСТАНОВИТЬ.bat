@echo off
chcp 65001 > nul
title Установка HRMS Agent

:: ══════════════════════════════════════════════════════════════
::  HRMS Hikvision Relay Agent — Мастер установки
::  Просто запусти от имени администратора — всё сделается само
:: ══════════════════════════════════════════════════════════════

:: Проверка прав
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ╔══════════════════════════════════════════════╗
    echo  ║  ⚠️  НУЖНЫ ПРАВА АДМИНИСТРАТОРА              ║
    echo  ║                                              ║
    echo  ║  Правый клик на УСТАНОВИТЬ.bat               ║
    echo  ║  → "Запуск от имени администратора"          ║
    echo  ╚══════════════════════════════════════════════╝
    echo.
    pause
    exit /b 1
)

cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║        HRMS Hikvision Agent — Установка             ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Этот мастер:
echo    1. Скопирует агент в C:\Hikvision\
echo    2. Запросит настройки (сервер, токен, компания)
echo    3. Установит автозапуск с Windows
echo    4. Запустит агент прямо сейчас
echo.
pause

:: ─── Проверка Node.js ────────────────────────────────────────
cls
echo.
echo  [1/5] Проверка Node.js...
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo  ❌ Node.js не установлен!
    echo.
    echo  Необходимо установить Node.js (бесплатно):
    echo    1. Открой браузер
    echo    2. Перейди на https://nodejs.org
    echo    3. Скачай кнопку "LTS" (большая зелёная кнопка)
    echo    4. Установи с настройками по умолчанию
    echo    5. Перезапусти компьютер
    echo    6. Снова запусти этот файл
    echo.
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  ✅ Node.js %NODE_VER% — OK

:: ─── Создание папки C:\Hikvision\ ───────────────────────────
echo.
echo  [2/5] Создание папки C:\Hikvision\...
if not exist "C:\Hikvision" mkdir "C:\Hikvision"
echo  ✅ Папка C:\Hikvision\ готова

:: ─── Копирование файлов агента ──────────────────────────────
echo.
echo  [3/5] Копирование файлов агента...
set AGENT_SRC=%~dp0
:: Убираем слэш в конце
if "%AGENT_SRC:~-1%"=="\" set AGENT_SRC=%AGENT_SRC:~0,-1%

copy /Y "%AGENT_SRC%\relay-agent.js"      "C:\Hikvision\relay-agent.js"      >nul
copy /Y "%AGENT_SRC%\test-connection.js"  "C:\Hikvision\test-connection.js"  >nul
copy /Y "%AGENT_SRC%\package.json"        "C:\Hikvision\package.json"        >nul
copy /Y "%AGENT_SRC%\config.example.json" "C:\Hikvision\config.example.json" >nul
echo  ✅ Файлы скопированы

:: ─── Запрос настроек ────────────────────────────────────────
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║  [4/5] Настройка соединения                         ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Тебе нужно знать 3 вещи (спроси у системного администратора):
echo.
echo  1) Адрес сервера HRMS (например: https://hrms.company.tj)
echo  2) Токен агента (строка из AGENT_SECRET_TOKEN в backend/.env)
echo  3) ID компании этого офиса (число, например: 3)
echo.

:: Проверяем нет ли уже config.json
if exist "C:\Hikvision\config.json" (
    echo  ℹ️  Файл config.json уже существует.
    set /p RECONFIG="  Перенастроить? (y/n): "
    if /i "%RECONFIG%" neq "y" goto :skip_config
)

echo  ─────────────────────────────────────────────────────
set /p SERVER_URL="  Адрес сервера (например https://hrms.tj): "
set /p AGENT_TOKEN="  Токен агента: "
set /p COMPANY_ID="  ID компании (число): "
echo  ─────────────────────────────────────────────────────

:: Создаём config.json через PowerShell (правильная кодировка)
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$cfg = [ordered]@{serverUrl='%SERVER_URL%';agentToken='%AGENT_TOKEN%';companyId=[int]'%COMPANY_ID%';pollIntervalMs=5000;hikvisionTimeoutMs=10000;logFile='agent.log';logMaxSizeMb=10};" ^
  "$cfg | ConvertTo-Json | Set-Content -Encoding UTF8 'C:\Hikvision\config.json'"

echo  ✅ config.json создан

:skip_config

:: ─── Тест подключения ───────────────────────────────────────
echo.
echo  Проверка соединения с сервером...
echo  ─────────────────────────────────────────────────────
cd /d "C:\Hikvision"
node test-connection.js
echo  ─────────────────────────────────────────────────────
echo.
set /p CONT="  Продолжить установку? (y/n): "
if /i "%CONT%" neq "y" (
    echo  Установка остановлена. Исправь настройки в C:\Hikvision\config.json и запусти снова.
    pause
    exit /b 0
)

:: ─── Установка автозапуска ──────────────────────────────────
cls
echo.
echo  [5/5] Установка автозапуска...

:: Удаляем старую задачу если была
schtasks /delete /tn "HRMS Hikvision Agent" /f >nul 2>&1

:: Путь к node.exe
for /f "tokens=*" %%p in ('where node') do set NODE_EXE=%%p

:: Создаём wrapper с высоким приоритетом
(
    echo @echo off
    echo :loop
    echo start "" /HIGH /WAIT /B node "C:\Hikvision\relay-agent.js"
    echo echo Agent stopped, restarting in 5 seconds...
    echo timeout /t 5 /nobreak ^>nul
    echo goto loop
) > "C:\Hikvision\agent-runner.bat"

:: Регистрируем в планировщике Windows
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute 'cmd.exe' -Argument '/c C:\Hikvision\agent-runner.bat' -WorkingDirectory 'C:\Hikvision';" ^
  "$trigger = New-ScheduledTaskTrigger -AtStartup;" ^
  "$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable $true -Hidden $true;" ^
  "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName 'HRMS Hikvision Agent' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description 'HRMS Relay Agent для Hikvision Face ID' -Force | Out-Null;" ^
  "Write-Host 'Задача зарегистрирована'"

if %errorlevel% neq 0 (
    echo  ❌ Ошибка регистрации задачи!
    pause
    exit /b 1
)
echo  ✅ Автозапуск настроен (планировщик Windows, SYSTEM, HIGH priority)

:: ─── Запуск прямо сейчас ────────────────────────────────────
echo.
echo  Запускаем агент...
schtasks /run /tn "HRMS Hikvision Agent" >nul 2>&1
timeout /t 4 /nobreak >nul

:: Проверяем
tasklist /fi "imagename eq node.exe" 2>nul | find /i "node.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo  ✅ Агент запущен!
) else (
    echo  ⚠️  Процесс запускается, подожди 10-15 секунд...
)

:: ─── Создаём ярлык на рабочем столе ─────────────────────────
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$ws = New-Object -ComObject WScript.Shell;" ^
  "$s = $ws.CreateShortcut([System.Environment]::GetFolderPath('CommonDesktopDirectory') + '\HRMS Agent — Логи.lnk');" ^
  "$s.TargetPath = 'notepad.exe';" ^
  "$s.Arguments = 'C:\Hikvision\agent.log';" ^
  "$s.IconLocation = 'shell32.dll,168';" ^
  "$s.Save()" >nul 2>&1

:: ─── Готово ─────────────────────────────────────────────────
cls
echo.
echo  ╔══════════════════════════════════════════════════════╗
echo  ║                                                      ║
echo  ║  ✅  УСТАНОВКА ЗАВЕРШЕНА УСПЕШНО!                    ║
echo  ║                                                      ║
echo  ║  Агент установлен в: C:\Hikvision\                  ║
echo  ║  Логи:               C:\Hikvision\agent.log         ║
echo  ║  На рабочем столе:   "HRMS Agent — Логи"            ║
echo  ║                                                      ║
echo  ║  Агент автоматически:                               ║
echo  ║    • Запускается при старте Windows                  ║
echo  ║    • Перезапускается при сбое                       ║
echo  ║    • Работает с приоритетом HIGH                    ║
echo  ║                                                      ║
echo  ║  Для проверки: открой "HRMS Agent — Логи"           ║
echo  ║  на рабочем столе                                   ║
echo  ║                                                      ║
echo  ╚══════════════════════════════════════════════════════╝
echo.
echo  Настройки сохранены в C:\Hikvision\config.json
echo  Если что-то изменилось — отредактируй этот файл и
echo  перезапусти: schtasks /run /tn "HRMS Hikvision Agent"
echo.
pause
