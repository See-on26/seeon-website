@echo off
chcp 65001 > nul
rem SEEON 부스: 로그인할 때 시작.bat 이 저절로 돌게 한다(시작 프로그램 폴더에 바로 가기를 둔다).
if not exist "%~dp0server\booth.ps1" goto unzip
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" -Startup on
exit /b

:unzip
echo.
echo  server 폴더를 찾지 못했어요. zip 을 우클릭해 [모두 압축 풀기] 를 한 뒤, 풀린 폴더에서 다시 누르세요.
echo.
pause
exit /b 1
