@echo off
chcp 65001 > nul
rem SEEON 부스: 체험 서버를 켜고 체험 화면을 전체 화면(키오스크)으로 띄운다. 이 창은 작업 표시줄로 내려간다.
title SEEON 부스 서버
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" %*
if errorlevel 1 pause
