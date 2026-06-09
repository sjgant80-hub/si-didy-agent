# ◊·κ=φ⁴ · si-didy · start your real Chrome with CDP debug port · prime 379
# Compatible with Windows PowerShell 5.1 + PowerShell 7+
# Run: npm run cdp   (or directly: powershell -ExecutionPolicy Bypass -File scripts\start-cdp-chrome.ps1)

$port = 9222
$useDebugProfile = $false

# ─── Find Chrome (5.1-safe path lookup) ────────────────────────────────
$pfDir   = [Environment]::GetEnvironmentVariable("ProgramFiles")
$pfx86   = [Environment]::GetEnvironmentVariable("ProgramFiles(x86)")
$localAppData = [Environment]::GetEnvironmentVariable("LOCALAPPDATA")

$chrome = $null
foreach ($base in @($pfDir, $pfx86)) {
    if (-not $base) { continue }
    $candidate = Join-Path $base 'Google\Chrome\Application\chrome.exe'
    if (Test-Path $candidate) { $chrome = $candidate; break }
}

if (-not $chrome) {
    Write-Host "X Chrome not found at standard paths" -ForegroundColor Red
    Write-Host "  Edit this script and set `$chrome to your chrome.exe path."
    exit 1
}

Write-Host "found Chrome at: $chrome"

# ─── Check if port is already in use ──────────────────────────────────
$inUse = $false
try {
    $tcp = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    if ($tcp) { $inUse = $true }
} catch {}

if ($inUse) {
    Write-Host ""
    Write-Host "port $port is already in use." -ForegroundColor Yellow
    Write-Host "  test if CDP Chrome is already running:"
    Write-Host "    curl http://localhost:$port/json/version"
    Write-Host "  if it answers, you're already set up."
    Write-Host "  otherwise, kill what's there before continuing:"
    Write-Host "    Get-NetTCPConnection -LocalPort $port | Stop-Process -Force"
    exit 0
}

# ─── Warn about existing Chrome instances ─────────────────────────────
$existing = Get-Process chrome -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host ""
    Write-Host "WARN $($existing.Count) chrome.exe process(es) already running." -ForegroundColor Yellow
    Write-Host "  Chrome IGNORES --remote-debugging-port when another instance"
    Write-Host "  owns the user-data-dir."
    Write-Host ""
    $ans = Read-Host "Close them all and start fresh on your main profile? [y/N]"
    if ($ans -match '^y') {
        Stop-Process -Name chrome -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "OK all chrome.exe killed"
    } else {
        Write-Host ""
        Write-Host "  Using a SEPARATE debug profile instead · your main Chrome stays alive."
        Write-Host "  You'll need to log into Fiverr/LinkedIn/Upwork once in the debug Chrome."
        $useDebugProfile = $true
    }
}

# ─── Pick user-data-dir ───────────────────────────────────────────────
if ($useDebugProfile) {
    $userDataDir = Join-Path $localAppData 'Google\Chrome\sididy-debug'
    Write-Host "using debug profile: $userDataDir"
} else {
    $userDataDir = Join-Path $localAppData 'Google\Chrome\User Data'
    Write-Host "using your real Chrome profile: $userDataDir"
}

# Ensure the dir exists
if (-not (Test-Path $userDataDir)) {
    New-Item -ItemType Directory -Path $userDataDir -Force | Out-Null
}

# ─── Start Chrome ─────────────────────────────────────────────────────
Write-Host ""
Write-Host "starting Chrome with CDP port $port ..." -ForegroundColor Cyan
$argList = @(
    "--remote-debugging-port=$port",
    "--user-data-dir=`"$userDataDir`"",
    "--restore-last-session=false",
    "--no-first-run",
    "--no-default-browser-check"
)
Start-Process -FilePath $chrome -ArgumentList $argList

Start-Sleep -Seconds 3

# ─── Verify CDP is up ─────────────────────────────────────────────────
$probed = $false
for ($i = 0; $i -lt 5; $i++) {
    try {
        $resp = Invoke-RestMethod -Uri "http://localhost:$port/json/version" -TimeoutSec 3
        Write-Host ""
        Write-Host "OK CDP live · Chrome: $($resp.Browser)" -ForegroundColor Green
        Write-Host "  webSocketDebuggerUrl: $($resp.webSocketDebuggerUrl)"
        $probed = $true
        break
    } catch {
        Start-Sleep -Seconds 2
    }
}

if (-not $probed) {
    Write-Host ""
    Write-Host "X CDP probe failed after 5 attempts." -ForegroundColor Red
    Write-Host "  Chrome may still be starting. Wait a few seconds and retry:"
    Write-Host "    curl http://localhost:$port/json/version"
    exit 1
}

# ─── Next steps ───────────────────────────────────────────────────────
Write-Host ""
Write-Host "Next: in a SEPARATE terminal (or new PS window):" -ForegroundColor Cyan
Write-Host ""
Write-Host "  cd $PWD"
Write-Host "  `$env:CHROME_CDP_URL = `"http://localhost:$port`""
Write-Host "  npm run cockpit"
Write-Host ""
Write-Host "When agent.mjs boots you should see:"
Write-Host "  T2 . CDP attach -> http://localhost:$port"
