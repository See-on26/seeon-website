@echo off
chcp 65001 > nul
rem SEEON 부스: 자동 시작을 끈다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" -Startup off
