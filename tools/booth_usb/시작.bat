@echo off
chcp 65001 > nul
rem SEEON 부스: 체험 서버를 켜고 체험 화면을 전체 화면(키오스크)으로 띄운다. 이 창은 작업 표시줄로 내려간다.
if not exist "%~dp0server\booth.ps1" goto unzip
title SEEON 부스 서버
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" %*
if errorlevel 1 pause
exit /b

rem zip 을 연 채로 누르면 Windows 가 이 파일 하나만 임시 폴더에 꺼내 돌려서 server 폴더가 없다.
:unzip
echo.
echo  server 폴더를 찾지 못했어요. zip 파일을 연 채로 누른 것 같아요.
echo  zip 을 우클릭해 [모두 압축 풀기] 를 한 뒤, 풀린 폴더에서 시작.bat 을 다시 더블클릭하세요.
echo.
pause
exit /b 1
