# ◊·κ=φ⁴ · si-didy · start your real Chrome with CDP debug port · prime 379
# Run: powershell -ExecutionPolicy Bypass -File scripts\start-cdp-chrome.ps1
# Then in a separate terminal: $env:CHROME_CDP_URL = "http://localhost:9222"
# Then: npm run cockpit

$port = 9222

# Find Chrome
$chrome = "${env:ProgramFiles}\Google\Chrome\Application\chrome.exe"
if (-not (Test-Path $chrome)) {
    $chrome = "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe"
}
if (-not (Test-Path $chrome)) {
    Write-Host "✗ Chrome not found at standard paths · install or edit this script" -ForegroundColor Red
    exit 1
}

# Check if anything is on port 9222 already
$inUse = $false
try {
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($tcp) { $inUse = $true }
} catch {}

if ($inUse) {
    Write-Host "◊ port $port already in use · is CDP Chrome already running?" -ForegroundColor Yellow
    Write-Host "  test it: curl http://localhost:$port/json/version"
    Write-Host "  if not Chrome, kill what's there before continuing."
    exit 0
}

# Warn about existing Chrome instances · they'll ignore the debug flag
$existing = Get-Process chrome -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "⚠  $($existing.Count) chrome.exe process(es) already running." -ForegroundColor Yellow
    Write-Host "   Chrome detects this and IGNORES --remote-debugging-port when another"
    Write-Host "   instance owns the user-data-dir."
    Write-Host ""
    $ans = Read-Host "Close them all and start fresh? [y/N]"
    if ($ans -match '^y') {
        Stop-Process -Name chrome -Force
        Start-Sleep -Seconds 2
        Write-Host "✓ all chrome.exe killed"
    } else {
        Write-Host ""
        Write-Host "alternative: I'll use a SEPARATE debug profile so your main Chrome stays alive."
        Write-Host "this means you'll need to log into Fiverr/LinkedIn/Upwork once in the debug Chrome."
        $useDebug = $true
    }
}

if ($useDebug) {
    $userDataDir = "$env:LOCALAPPDATA\Google\Chrome\sididy-debug"
    Write-Host "◊ using debug profile: $userDataDir"
} else {
    $userDataDir = "$env:LOCALAPPDATA\Google\Chrome\User Data"
    Write-Host "◊ using your real Chrome profile: $userDataDir"
}

Write-Host ""
Write-Host "◊·κ=φ⁴ · starting Chrome with CDP port $port..." -ForegroundColor Cyan
Start-Process $chrome -ArgumentList @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$userDataDir`"",
    "--restore-last-session=false",
    "--no-first-run",
    "--no-default-browser-check"
)

Start-Sleep -Seconds 3

# Verify CDP is up
try {
    $resp = Invoke-RestMethod -Uri "http://localhost:$port/json/version" -TimeoutSec 5
    Write-Host ""
    Write-Host "✓ CDP live · Chrome: $($resp.Browser)" -ForegroundColor Green
    Write-Host "  webSocketDebuggerUrl: $($resp.webSocketDebuggerUrl)"
    Write-Host ""
    Write-Host "Next steps in a SEPARATE terminal:"
    Write-Host "  cd $PWD"
    Write-Host "  `$env:CHROME_CDP_URL = `"http://localhost:$port`""
    Write-Host "  npm run cockpit"
    Write-Host ""
    Write-Host "When agent.mjs boots you should see:"
    Write-Host "  ◊ T2 · CDP attach → http://localhost:$port"
} catch {
    Write-Host "✗ CDP probe failed: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Chrome may still be starting up · retry in 5s:"
    Write-Host "  curl http://localhost:$port/json/version"
}
