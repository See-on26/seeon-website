<#
  SEEON 부스: 일반객 체험을 이 노트북에서 인터넷 없이 띄운다. Windows PowerShell 5.1 만 쓰고 설치할 것은 없다.

  - 이 폴더의 ..\site 를 http://localhost:<포트>/ 로 내보내는 로컬 서버(HttpListener)를 켠다.
    영상 중간으로 건너뛸 수 있게 Range 요청(206)을 받고, 주소 뒤의 ?v=… 는 무시한다.
  - 체험 화면(experience/visitor.html)을 Chrome(없으면 Edge) 키오스크로 띄운다.
    브라우저 프로필은 %LOCALAPPDATA%\SeeonBooth 에 따로 둬서 평소 쓰는 브라우저와 섞이지 않는다.
  - 서버가 켜져 있는 동안 화면이 꺼지거나 절전에 들어가지 않게 붙잡아 둔다(창을 닫으면 풀린다).

    시작.bat           → booth.ps1                  서버를 켜고 화면을 띄운다. 서버가 이미 돌면 화면만 다시 띄운다.
    끝내기.bat         → booth.ps1 -Stop            화면과 서버를 끈다.
    자동 시작 켜기.bat → booth.ps1 -Startup on      로그인할 때 시작.bat 이 저절로 돌게 한다(off 로 끈다).
    점검용             → booth.ps1 -NoBrowser       서버만 켠다. -Browser chrome|edge 로 브라우저를 고른다.
#>
param(
  [int]$Port = 8090,
  [ValidateSet('auto', 'chrome', 'edge')][string]$Browser = 'auto',
  [string]$Site = '',
  [switch]$NoBrowser,
  [switch]$Stop,
  [ValidateSet('', 'on', 'off')][string]$Startup = ''
)

$ErrorActionPreference = 'Stop'
$Here = $PSScriptRoot
$Top = Split-Path -Parent $Here
if (-not $Site) { $Site = Join-Path $Top 'site' }
$Page = 'experience/visitor.html'
$State = Join-Path $env:LOCALAPPDATA 'SeeonBooth'
$StateFile = Join-Path $State 'server.json'
$Profiles = Join-Path $State 'browser'
$Title = 'SEEON 부스'

function Show-Message([string]$text, [int]$icon = 48) {
  # 16 = 오류, 48 = 주의, 64 = 안내. 창이 내려가 있어도 보이게 대화 상자로 띄운다.
  Write-Host $text
  try { [void](New-Object -ComObject WScript.Shell).Popup($text, 0, $Title, $icon) } catch { }
}

# ---------- 자동 시작 ----------
function Set-Startup([string]$mode) {
  $link = Join-Path ([Environment]::GetFolderPath('Startup')) 'SEEON 부스.lnk'
  if ($mode -eq 'off') {
    if (Test-Path -LiteralPath $link) { Remove-Item -LiteralPath $link -Force }
    Show-Message "자동 시작을 껐어요.`n다음 로그인부터는 시작.bat 을 직접 눌러 주세요." 64
    return
  }
  $bat = Join-Path $Top '시작.bat'
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut($link)
  $lnk.TargetPath = $bat
  $lnk.WorkingDirectory = $Top
  $lnk.Description = 'SEEON 부스 일반객 체험'
  $lnk.Save()
  $usb = ''
  try {
    $drive = New-Object IO.DriveInfo ([IO.Path]::GetPathRoot($Top))
    if ($drive.DriveType -eq 'Removable') { $usb = "`n`n지금 폴더가 USB 에 있어요. USB 를 빼거나 드라이브 문자가 바뀌면 자동 시작이 안 돼요. 폴더를 노트북에 복사한 뒤 거기서 다시 켜 주세요." }
  } catch { }
  Show-Message "자동 시작을 켰어요. 다음 로그인부터 체험 화면이 저절로 떠요.`n$bat$usb" 64
}

# ---------- 키오스크 브라우저 ----------
function Find-Browser([string]$want) {
  $found = @{}
  $paths = @{
    chrome = @("$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
               "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
               "$env:LOCALAPPDATA\Google\Chrome\Application\chrome.exe")
    edge   = @("${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe",
               "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe")
  }
  $exe = @{ chrome = 'chrome.exe'; edge = 'msedge.exe' }
  foreach ($kind in 'chrome', 'edge') {
    foreach ($root in 'HKLM:', 'HKCU:') {
      try {
        $p = (Get-ItemProperty -LiteralPath "$root\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\$($exe[$kind])" -ErrorAction Stop).'(default)'
        if ($p) { $paths[$kind] += $p.Trim('"') }
      } catch { }
    }
    foreach ($p in $paths[$kind]) {
      if ($p -and (Test-Path -LiteralPath $p)) { $found[$kind] = $p; break }
    }
  }
  $order = if ($want -eq 'auto') { 'chrome', 'edge' } else { , $want }
  foreach ($kind in $order) {
    if ($found[$kind]) { return @{ kind = $kind; exe = $found[$kind] } }
  }
  return $null
}

function Stop-Kiosk {
  # 이 부스 프로필로 뜬 브라우저만 끈다(평소 쓰는 Chrome·Edge 창은 건드리지 않는다).
  $procs = @(Get-CimInstance Win32_Process -Filter "Name='chrome.exe' OR Name='msedge.exe'" |
    Where-Object { $_.CommandLine -and $_.CommandLine.Contains($Profiles) })
  if (-not $procs) { return }
  foreach ($p in $procs | Where-Object { $_.CommandLine -notmatch '--type=' }) {
    try { [void](Get-Process -Id $p.ProcessId -ErrorAction Stop).CloseMainWindow() } catch { }
  }
  for ($i = 0; $i -lt 30; $i++) {
    if (-not ($procs | Where-Object { Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue })) { return }
    Start-Sleep -Milliseconds 100
  }
  foreach ($p in $procs) { try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { } }
}

function Start-Kiosk([int]$p) {
  $b = Find-Browser $Browser
  if (-not $b) {
    Show-Message "Chrome 이나 Edge 를 찾지 못했어요.`n서버는 켜져 있으니 브라우저에서 아래 주소를 열어 주세요.`nhttp://localhost:$p/$Page" 48
    return $null
  }
  $userDir = Join-Path $Profiles $b.kind
  # 전원이 갑자기 꺼졌을 때 다음 실행에서 '페이지 복원' 안내가 뜨지 않게 한다.
  $pref = Join-Path $userDir 'Default\Preferences'
  try {
    if (Test-Path -LiteralPath $pref) {
      $t = [IO.File]::ReadAllText($pref)
      $t2 = $t.Replace('"exit_type":"Crashed"', '"exit_type":"Normal"').Replace('"exited_cleanly":false', '"exited_cleanly":true')
      if ($t2 -ne $t) { [IO.File]::WriteAllText($pref, $t2) }
    }
  } catch { }
  $url = "http://localhost:$p/$Page"
  $argv = @(
    '--kiosk', "`"$url`"",
    "--user-data-dir=`"$userDir`"",
    '--no-first-run', '--no-default-browser-check',
    '--autoplay-policy=no-user-gesture-required',
    '--overscroll-history-navigation=0',  # 터치패드 두 손가락으로 쓸어도 뒤로 가지 않게
    '--disable-pinch',
    '--disable-session-crashed-bubble', '--noerrdialogs',
    '--disable-features=Translate'
  )
  if ($b.kind -eq 'edge') { $argv += '--edge-kiosk-type=fullscreen' }
  Start-Process -FilePath $b.exe -ArgumentList ($argv -join ' ')
  return $b
}

# ---------- 서버 ----------
function Test-BoothServer([int]$p) {
  try {
    $req = [Net.WebRequest]::Create("http://localhost:$p/$Page")
    $req.Method = 'HEAD'
    $req.Timeout = 1500
    $req.Proxy = $null
    $res = $req.GetResponse()
    $ok = $res.Headers['X-Seeon-Booth'] -eq '1'
    $res.Close()
    return $ok
  } catch { return $false }
}

function Read-State {
  try { return Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json } catch { return $null }
}

function Stop-Server {
  $s = Read-State
  if ($s -and $s.pid -and $s.pid -ne $PID) {
    $p = Get-CimInstance Win32_Process -Filter "ProcessId=$([int]$s.pid)"
    if ($p -and $p.CommandLine -and $p.CommandLine.Contains('booth.ps1')) {
      try { Stop-Process -Id $p.ProcessId -Force -ErrorAction Stop } catch { }
    }
  }
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
}

$Mime = @{
  '.html' = 'text/html; charset=utf-8'; '.htm' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'; '.mjs' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'; '.json' = 'application/json; charset=utf-8'
  '.txt' = 'text/plain; charset=utf-8'; '.vtt' = 'text/vtt; charset=utf-8'; '.xml' = 'application/xml'
  '.svg' = 'image/svg+xml'; '.png' = 'image/png'; '.jpg' = 'image/jpeg'; '.jpeg' = 'image/jpeg'
  '.gif' = 'image/gif'; '.webp' = 'image/webp'; '.ico' = 'image/x-icon'
  '.woff2' = 'font/woff2'; '.woff' = 'font/woff'; '.ttf' = 'font/ttf'; '.otf' = 'font/otf'
  '.mp4' = 'video/mp4'; '.webm' = 'video/webm'; '.mp3' = 'audio/mpeg'; '.m4a' = 'audio/mp4'
  '.wav' = 'audio/wav'; '.ogg' = 'audio/ogg'; '.pdf' = 'application/pdf'
  '.webmanifest' = 'application/manifest+json'
}

# 요청을 받는 일꾼. 여러 개를 함께 돌려, 영상 하나를 보내는 동안에도 다른 파일을 내준다.
$Worker = {
  param($listener, $root, $mime, $logq)
  $ErrorActionPreference = 'Stop'
  $rootFull = [IO.Path]::GetFullPath($root).TrimEnd('\') + '\'

  # 일꾼이 창에 바로 쓰면 멈출 수 있어, 줄을 쌓아 두고 본 스레드가 찍는다.
  function Log([string]$text) { $logq.Enqueue(('[{0:HH:mm:ss}] {1}' -f [DateTime]::Now, $text)) }

  function Send-Status($res, [int]$code, [string]$text) {
    $res.StatusCode = $code
    $body = [Text.Encoding]::UTF8.GetBytes($text)
    $res.ContentType = 'text/plain; charset=utf-8'
    $res.ContentLength64 = $body.Length
    $res.OutputStream.Write($body, 0, $body.Length)
  }

  function Handle($ctx) {
    $req = $ctx.Request
    $res = $ctx.Response
    $res.Headers['X-Seeon-Booth'] = '1'
    $res.Headers['Cache-Control'] = 'no-store'
    if ($req.HttpMethod -ne 'GET' -and $req.HttpMethod -ne 'HEAD') { return Send-Status $res 405 'method not allowed' }

    $urlPath = $req.Url.AbsolutePath  # ?v=… 같은 쿼리는 여기 들지 않는다
    try {
      $rel = [Uri]::UnescapeDataString($urlPath).TrimStart('/').Replace('/', '\')
      $path = [IO.Path]::GetFullPath([IO.Path]::Combine($rootFull, $rel))
    } catch { return Send-Status $res 400 'bad path' }
    if (-not ($path.TrimEnd('\') + '\').StartsWith($rootFull, [StringComparison]::OrdinalIgnoreCase)) { return Send-Status $res 403 'forbidden' }

    if ([IO.Directory]::Exists($path)) {
      if (-not $urlPath.EndsWith('/')) {
        $res.StatusCode = 301
        $res.RedirectLocation = $urlPath + '/' + $req.Url.Query
        return
      }
      $path = [IO.Path]::Combine($path, 'index.html')
    }
    if (-not [IO.File]::Exists($path)) {
      if ($urlPath -ne '/favicon.ico') { Log "404 $urlPath" }  # 브라우저가 저절로 찾는 아이콘은 적지 않는다
      return Send-Status $res 404 'not found'
    }

    $size = ([IO.FileInfo]$path).Length
    $start = [int64]0
    $end = $size - 1
    $partial = $false
    $range = $req.Headers['Range']
    if ($range -and $range -match '^\s*bytes=(\d*)-(\d*)\s*$' -and ($Matches[1] -or $Matches[2])) {
      if ($Matches[1]) {
        $start = [int64]$Matches[1]
        if ($Matches[2]) { $end = [Math]::Min([int64]$Matches[2], $size - 1) }
      } else {
        $start = [Math]::Max([int64]0, $size - [int64]$Matches[2])
      }
      if ($start -ge $size -or $start -gt $end) {
        $res.Headers['Content-Range'] = "bytes */$size"
        return Send-Status $res 416 'range not satisfiable'
      }
      $partial = $true
    }

    $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
    $res.ContentType = if ($mime.ContainsKey($ext)) { $mime[$ext] } else { 'application/octet-stream' }
    $res.Headers['Accept-Ranges'] = 'bytes'
    $left = $end - $start + 1
    if ($partial) {
      $res.StatusCode = 206
      $res.Headers['Content-Range'] = "bytes $start-$end/$size"
    }
    $res.ContentLength64 = $left
    if ($req.HttpMethod -eq 'HEAD') { return }

    $fs = [IO.File]::Open($path, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
    try {
      $fs.Position = $start
      $buf = New-Object byte[] 262144
      $out = $res.OutputStream
      while ($left -gt 0) {
        $n = $fs.Read($buf, 0, [int][Math]::Min([int64]$buf.Length, $left))
        if ($n -le 0) { break }
        $out.Write($buf, 0, $n)
        $left -= $n
      }
    } finally { $fs.Dispose() }
  }

  while ($listener.IsListening) {
    try { $ctx = $listener.GetContext() } catch { break }
    try {
      Handle $ctx
      $ctx.Response.Close()
    } catch {
      # 브라우저가 영상을 받다 말고 다른 지점을 다시 청하면 연결이 끊긴다. 흔한 일이라 적지 않는다.
      if (-not ($_.Exception -is [Net.HttpListenerException] -or $_.Exception.InnerException -is [Net.HttpListenerException] -or $_.Exception -is [IO.IOException])) {
        Log "오류 $($ctx.Request.Url.AbsolutePath): $($_.Exception.Message)"
      }
      try { $ctx.Response.Abort() } catch { }
    }
  }
}

# ---------- 시작 ----------
# 드라이브·메일로 받은 zip 을 풀면 파일마다 '인터넷에서 받은 파일' 표시가 붙어, .bat 을 누를 때마다(자동 시작 때도) 보안 경고가 뜬다.
# 처음 한 번 [실행] 을 누르면 여기서 이 폴더의 표시를 지워 다음부터는 뜨지 않게 한다.
try { Get-ChildItem -LiteralPath $Top -Recurse -File -Force | Unblock-File -ErrorAction SilentlyContinue } catch { }

if ($Startup) { Set-Startup $Startup; exit 0 }
if ($Stop) {
  Stop-Kiosk
  Stop-Server
  Write-Host '체험 화면과 서버를 껐어요.'
  exit 0
}

if (-not (Test-Path -LiteralPath (Join-Path $Site $Page))) {
  Show-Message "체험 사이트 파일을 찾지 못했어요. 폴더를 통째로 다시 복사해 주세요.`n$Site" 16
  exit 1
}
[void](New-Item -ItemType Directory -Force -Path $State)

# 이미 도는 부스 서버가 있으면 화면만 새로 띄운다.
function Reuse-Server([int]$p) {
  Write-Host "부스 서버가 이미 켜져 있어요: http://localhost:$p/$Page"
  if (-not $NoBrowser) { Stop-Kiosk; [void](Start-Kiosk $p) }
  exit 0
}
$s = Read-State
if ($s -and $s.port -and (Test-BoothServer ([int]$s.port))) { Reuse-Server ([int]$s.port) }

# 포트가 쓰이고 있으면 부스 서버인지 보고, 아니면 다음 포트로 넘어간다.
$listener = $null
foreach ($p in $Port..($Port + 9)) {
  $l = New-Object Net.HttpListener
  $l.Prefixes.Add("http://localhost:$p/")
  try { $l.Start(); $listener = $l; $Port = $p; break } catch { $l.Close() }
  if (Test-BoothServer $p) { Reuse-Server $p }
}
if (-not $listener) {
  Show-Message "서버를 켜지 못했어요. 포트 $Port~$($Port + 9) 가 모두 쓰이고 있어요.`n노트북을 다시 켠 뒤 시작.bat 을 눌러 주세요." 16
  exit 1
}

$Workers = 8
$LogQ = New-Object 'System.Collections.Concurrent.ConcurrentQueue[string]'
$pool = [RunspaceFactory]::CreateRunspacePool(1, $Workers)
$pool.Open()
$jobs = foreach ($i in 1..$Workers) {
  $ps = [PowerShell]::Create()
  $ps.RunspacePool = $pool
  [void]$ps.AddScript($Worker).AddArgument($listener).AddArgument($Site).AddArgument($Mime).AddArgument($LogQ)
  @{ ps = $ps; handle = $ps.BeginInvoke() }
}
@{ pid = $PID; port = $Port; site = $Site } | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8

try {
  Add-Type -Namespace SeeonBooth -Name Native -MemberDefinition @'
[DllImport("kernel32.dll")] static extern uint SetThreadExecutionState(uint flags);
[DllImport("kernel32.dll")] public static extern System.IntPtr GetConsoleWindow();
[DllImport("user32.dll")] public static extern bool ShowWindow(System.IntPtr hWnd, int cmd);
// ES_CONTINUOUS | ES_SYSTEM_REQUIRED | ES_DISPLAY_REQUIRED: 이 프로세스가 도는 동안 화면·절전을 막는다.
public static void KeepAwake() { SetThreadExecutionState(0x80000003); }
'@
} catch { }
try { [SeeonBooth.Native]::KeepAwake() } catch { }

$url = "http://localhost:$Port/$Page"
try { $Host.UI.RawUI.WindowTitle = 'SEEON 부스 서버 — 이 창을 닫으면 체험이 멈춰요' } catch { }
Write-Host ''
Write-Host "  SEEON 부스 서버가 켜졌어요: $url"
Write-Host "  사이트 폴더: $Site"
if (-not $NoBrowser) {
  Stop-Kiosk
  $b = Start-Kiosk $Port
  if ($b) { Write-Host "  체험 화면: $($b.kind) 키오스크 ($($b.exe))" }
  Start-Sleep -Seconds 2
  try { [void][SeeonBooth.Native]::ShowWindow([SeeonBooth.Native]::GetConsoleWindow(), 6) } catch { }  # 이 창은 작업 표시줄로 내린다
}
Write-Host ''
Write-Host '  이 창을 닫으면 체험이 멈춰요. 끝낼 때는 끝내기.bat 을 실행하거나 이 창을 닫으세요.'
Write-Host ''

try {
  $line = $null
  while ($listener.IsListening) {
    while ($LogQ.TryDequeue([ref]$line)) { Write-Host $line }
    Start-Sleep -Milliseconds 300
  }
} finally {
  try { $listener.Stop(); $listener.Close() } catch { }
  foreach ($j in $jobs) { try { $j.ps.Dispose() } catch { } }
  try { $pool.Close() } catch { }
  $s = Read-State
  if ($s -and $s.pid -eq $PID) { Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue }
}
