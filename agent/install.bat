@echo off
chcp 65001 > nul
title HRMS Relay Agent — Установка сервиса

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║     HRMS Relay Agent — Установка сервиса        ║
echo  ╚══════════════════════════════════════════════════╝
echo.

:: ─── Проверка прав администратора ───────────────────────────
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Нужны права администратора!
    echo     Правый клик на install.bat → Запуск от имени администратора
    pause
    exit /b 1
)

:: ─── Проверка Node.js ────────────────────────────────────────
node --version >nul 2>&1
if %errorlevel% neq 0 (
    echo  ❌ Node.js не установлен!
    echo     Скачай с https://nodejs.org  (версия 18 или выше)
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version') do set NODE_VER=%%v
echo  ✅ Node.js %NODE_VER%

:: ─── Проверка config.json ────────────────────────────────────
if not exist "%~dp0config.json" (
    echo  ❌ Файл config.json не найден!
    echo     Скопируй config.example.json → config.json и заполни значения
    pause
    exit /b 1
)
echo  ✅ config.json найден

:: ─── Путь к агенту ──────────────────────────────────────────
set AGENT_DIR=%~dp0
:: Убираем завершающий слэш
if "%AGENT_DIR:~-1%"=="\" set AGENT_DIR=%AGENT_DIR:~0,-1%
set AGENT_SCRIPT=%AGENT_DIR%\relay-agent.js

echo  📁 Папка агента: %AGENT_DIR%
echo.

:: ─── Тест подключения ───────────────────────────────────────
echo  Запуск теста подключения...
echo  ─────────────────────────────────────────────────────
node "%AGENT_DIR%\test-connection.js"
echo  ─────────────────────────────────────────────────────
echo.
set /p CONTINUE="  Продолжить установку? (y/n): "
if /i "%CONTINUE%" neq "y" (
    echo  Установка отменена.
    pause
    exit /b 0
)
echo.

:: ─── Удаляем старую задачу если была ────────────────────────
schtasks /delete /tn "HRMS Relay Agent" /f >nul 2>&1

:: ─── Создаём задачу через PowerShell ────────────────────────
echo  Регистрация задачи в планировщике Windows...

:: Путь к node.exe
for /f "tokens=*" %%p in ('where node') do set NODE_EXE=%%p

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute '%NODE_EXE%' -Argument '\"%AGENT_SCRIPT%\"' -WorkingDirectory '%AGENT_DIR%';" ^
  "$trigger = New-ScheduledTaskTrigger -AtStartup;" ^
  "$settings = New-ScheduledTaskSettingsSet -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew -StartWhenAvailable $true;" ^
  "$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -RunLevel Highest;" ^
  "Register-ScheduledTask -TaskName 'HRMS Relay Agent' -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null;" ^
  "Write-Host 'OK'"

if %errorlevel% neq 0 (
    echo  ❌ Ошибка регистрации задачи!
    pause
    exit /b 1
)
echo  ✅ Задача зарегистрирована

:: ─── Устанавливаем ВЫСОКИЙ приоритет процесса ──────────────
:: Создаём wrapper который запускает node с высоким приоритетом
echo  Настройка высокого приоритета...

set WRAPPER=%AGENT_DIR%\start-high-priority.bat
(
    echo @echo off
    echo start "" /HIGH /B node "%AGENT_SCRIPT%"
) > "%WRAPPER%"

:: Обновляем задачу чтобы использовала wrapper
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$action = New-ScheduledTaskAction -Execute '%WRAPPER%' -WorkingDirectory '%AGENT_DIR%';" ^
  "Set-ScheduledTask -TaskName 'HRMS Relay Agent' -Action $action | Out-Null;" ^
  "Write-Host 'OK'"

echo  ✅ Приоритет HIGH настроен

:: ─── Немедленный запуск ─────────────────────────────────────
echo.
echo  Запуск агента прямо сейчас...
schtasks /run /tn "HRMS Relay Agent" >nul 2>&1
timeout /t 3 /nobreak >nul

:: Проверяем запустился ли node
tasklist /fi "imagename eq node.exe" /fo csv | find "node.exe" >nul 2>&1
if %errorlevel% equ 0 (
    echo  ✅ Агент запущен (процесс node.exe найден^)
) else (
    echo  ⚠️  Процесс ещё не виден, подожди несколько секунд
)

echo.
echo  ╔══════════════════════════════════════════════════╗
echo  ║  ✅ Установка завершена!                         ║
echo  ║                                                  ║
echo  ║  Агент запускается автоматически с Windows       ║
echo  ║  как задача планировщика с правами SYSTEM        ║
echo  ║  и приоритетом HIGH.                             ║
echo  ║                                                  ║
echo  ║  Логи: %AGENT_DIR%\agent.log         ║
echo  ║                                                  ║
echo  ║  Управление:                                     ║
echo  ║    Старт:  schtasks /run /tn "HRMS Relay Agent"  ║
echo  ║    Стоп:   taskkill /im node.exe /f              ║
echo  ║    Логи:   type agent.log                        ║
echo  ║    Удалить: uninstall.bat                        ║
echo  ╚══════════════════════════════════════════════════╝
echo.
pause
