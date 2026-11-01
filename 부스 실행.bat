@echo off
chcp 65001 > nul
rem 시온 부스: 일반객 체험을 이 노트북에서 띄운다(인터넷 없이도 된다).
rem 인터넷이 되면 https://see-on26.github.io/seeon-website/experience/visitor.html 을 바로 열어도 된다.
setlocal
set "HERE=%~dp0"
set "SITE=%HERE%docs"
set "PORT=8090"

if not exist "%SITE%\experience\visitor.html" (
  echo [오류] 사이트 파일을 찾지 못했어요: %SITE%
  pause
  exit /b 1
)

echo 사이트를 http://localhost:%PORT% 에서 여는 중... (끄려면 이 창을 닫으세요)
start "" /min python "%HERE%tools\serve.py" "%SITE%" %PORT%
timeout /t 2 > nul

set "URL=http://localhost:%PORT%/experience/visitor.html"
set "CHROME=%ProgramFiles%\Google\Chrome\Application\chrome.exe"
if not exist "%CHROME%" set "CHROME=%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe"
if exist "%CHROME%" (
  start "" "%CHROME%" --kiosk --autoplay-policy=no-user-gesture-required "%URL%"
) else (
  start "" "%URL%"
)
echo.
echo 키오스크 화면을 닫으려면 Alt+F4 를 누르세요.
echo STAFF: Esc 2초 = 처음으로, S = 지금 단계 건너뛰기(점검용)
pause
