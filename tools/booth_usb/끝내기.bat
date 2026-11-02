@echo off
chcp 65001 > nul
rem SEEON 부스: 체험 화면과 서버를 끈다.
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" -Stop
timeout /t 2 > nul
