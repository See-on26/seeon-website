@echo off
chcp 65001 > nul
rem SEEON 부스: 체험 화면과 서버를 끈다.
if not exist "%~dp0server\booth.ps1" goto unzip
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0server\booth.ps1" -Stop
timeout /t 2 > nul
exit /b

:unzip
echo.
echo  server 폴더를 찾지 못했어요. zip 을 우클릭해 [모두 압축 풀기] 를 한 뒤, 풀린 폴더에서 다시 누르세요.
echo.
pause
exit /b 1
