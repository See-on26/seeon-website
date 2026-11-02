@echo off
chcp 65001 > nul
rem SEEON 부스: 로그인할 때 시작.bat 이 저절로 돌게 한다(시작 프로그램 폴더에 바로 가기를 둔다).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" -Startup on
