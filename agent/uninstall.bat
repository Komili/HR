@echo off
chcp 65001 > nul
title HRMS Relay Agent — Удаление

net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Нужны права администратора!
    pause
    exit /b 1
)

echo Остановка и удаление HRMS Relay Agent...

taskkill /f /im node.exe >nul 2>&1
schtasks /delete /tn "HRMS Relay Agent" /f >nul 2>&1

if %errorlevel% equ 0 (
    echo ✅ Сервис удалён
) else (
    echo ⚠️  Задача не найдена (уже удалена или не была установлена)
)

echo.
echo Файлы агента остались в папке — удали вручную если нужно.
pause
