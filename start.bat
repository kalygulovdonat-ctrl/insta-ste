@echo off
chcp 65001 >nul
title JUMSHAK — сервер сайта
cd /d "%~dp0backend"

if not exist server.js (
  echo Не найден backend\server.js — проверьте, что файлы проекта на месте.
  pause
  exit /b 1
)

echo.
echo   Запускаем JUMSHAK...
echo   Сайт:    http://localhost:3000
echo   Админка: http://localhost:3000/admin
echo.
echo   Остановить сервер: Ctrl+C или закрыть это окно.
echo.

start "" powershell -NoProfile -WindowStyle Hidden -Command "Start-Sleep -Seconds 2; Start-Process 'http://localhost:3000'"

node server.js

echo.
echo Сервер остановлен.
pause
