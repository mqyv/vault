#Requires -Version 5.1
<#
    Vault - installeur automatique.
    Installe les prerequis (Git, Node.js, pnpm), telecharge Vault,
    le compile et l'injecte dans Discord. Un seul fichier, zero config.
#>

param(
    [string]$InstallDir = (Join-Path $HOME "Vault"),
    [switch]$Yes  # auto-confirme (ferme Discord sans demander) - utilise par l'assistant .exe
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/mqyv/vault.git"

function Step($m) { Write-Host "`n==> $m" -ForegroundColor Magenta }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green }
function Warn($m) { Write-Host "    [!] $m"  -ForegroundColor Yellow }
function Fail($m) { Write-Host "    [x] $m"  -ForegroundColor Red }

function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Need-Winget {
    if (Have winget) { return $true }
    Fail "winget est introuvable sur ce PC."
    Write-Host "    Installe Node.js (https://nodejs.org) et Git (https://git-scm.com) a la main, puis relance." -ForegroundColor Yellow
    return $false
}
function Install-With-Winget($id, $name) {
    Step "Installation de $name (une fenetre Windows peut demander l'autorisation)"
    winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements
    Refresh-Path
}

Write-Host ""
Write-Host "  ============================" -ForegroundColor Red
Write-Host "      V A U L T  -  installer" -ForegroundColor Red
Write-Host "  ============================" -ForegroundColor Red

# --- 1. Git ---
Step "Verification de Git"
if (Have git) { Ok "Git deja present" }
else {
    if (-not (Need-Winget)) { return }
    Install-With-Winget "Git.Git" "Git"
    if (Have git) { Ok "Git installe" } else { Fail "Git indisponible - ferme et rouvre le terminal, puis relance."; return }
}

# --- 2. Node.js ---
Step "Verification de Node.js"
if (Have node) { Ok "Node.js deja present ($(node -v))" }
else {
    if (-not (Need-Winget)) { return }
    Install-With-Winget "OpenJS.NodeJS.LTS" "Node.js"
    if (Have node) { Ok "Node.js installe ($(node -v))" } else { Fail "Node.js indisponible - ferme et rouvre le terminal, puis relance."; return }
}

# --- 3. pnpm ---
Step "Verification de pnpm"
if (Have pnpm) { Ok "pnpm deja present" }
else {
    npm install -g pnpm | Out-Null
    Refresh-Path
    if (Have pnpm) { Ok "pnpm installe" } else { Fail "pnpm indisponible - ferme et rouvre le terminal, puis relance."; return }
}

# --- 4. Telechargement / mise a jour ---
if (Test-Path (Join-Path $InstallDir ".git")) {
    Step "Mise a jour de Vault ($InstallDir)"
    git -C $InstallDir pull --ff-only
} else {
    Step "Telechargement de Vault dans $InstallDir"
    git clone $RepoUrl $InstallDir
}
if (-not (Test-Path (Join-Path $InstallDir "package.json"))) { Fail "Le telechargement a echoue."; return }
Ok "Code recupere"

# --- 5. Dependances ---
Step "Installation des dependances (1 a 2 minutes)"
pnpm -C $InstallDir install
Ok "Dependances installees"

# --- 6. Compilation ---
Step "Compilation de Vault"
pnpm -C $InstallDir build
Ok "Compile"

# --- 7. Injection dans Discord ---
Step "Injection dans Discord"
$discord = Get-Process -Name "Discord", "DiscordPTB", "DiscordCanary" -ErrorAction SilentlyContinue
if ($discord) {
    Warn "Discord doit etre ferme pour terminer l'installation."
    $close = $Yes
    if (-not $close) {
        $r = Read-Host "    Fermer Discord automatiquement maintenant ? (O/N)"
        $close = ($r -match '^(o|y)')
    }
    if ($close) {
        $discord | Stop-Process -Force
        Start-Sleep -Seconds 2
        Ok "Discord ferme"
    } else {
        Fail "Ferme Discord toi-meme, puis relance l'installeur."
        return
    }
}
pnpm -C $InstallDir inject

Write-Host ""
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host "   Installation terminee ! Rouvre Discord :" -ForegroundColor Green
Write-Host "   Vault apparait dans Reglages (onglet 'Vault')." -ForegroundColor Green
Write-Host "  =======================================================" -ForegroundColor Green
Write-Host ""
Write-Host "   Mettre a jour plus tard :  pnpm -C `"$InstallDir`" update-vault" -ForegroundColor DarkGray
Write-Host ""
