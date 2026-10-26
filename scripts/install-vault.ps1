#Requires -Version 5.1
<#
    Vault - installeur automatique.
    Installe les prerequis (Git, Node.js, pnpm), telecharge Vault,
    le compile et l'injecte dans Discord. Un seul fichier, zero config.

    Journal complet : %TEMP%\vault-install.log
#>

param(
    [string]$InstallDir = (Join-Path $HOME "Vault"),
    [switch]$Yes  # auto-confirme (ferme Discord sans demander) - utilise par l'assistant .exe
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/mqyv/vault.git"
$LogFile = Join-Path $env:TEMP "vault-install.log"

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

# Lance une commande native et leve une erreur si elle echoue (sans ca, PowerShell continue en silence).
function Run([string]$what, [scriptblock]$cmd) {
    & $cmd *>> $LogFile
    if ($LASTEXITCODE -ne 0) { throw "$what a echoue (code $LASTEXITCODE). Details : $LogFile" }
}

function Install-With-Winget($id, $name) {
    if (-not (Have winget)) {
        throw "winget est introuvable. Installe $name a la main (git-scm.com / nodejs.org), puis relance."
    }
    Step "Installation de $name (une fenetre Windows peut demander l'autorisation)"
    winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements *>> $LogFile
    Refresh-Path
}

try {
    "=== Vault install $(Get-Date -Format s) ===" | Out-File $LogFile -Encoding utf8

    Write-Host ""
    Write-Host "  ============================" -ForegroundColor Red
    Write-Host "      V A U L T  -  installer" -ForegroundColor Red
    Write-Host "  ============================" -ForegroundColor Red

    # --- 1. Git ---
    Step "Verification de Git"
    if (-not (Have git)) { Install-With-Winget "Git.Git" "Git" }
    if (-not (Have git)) { throw "Git indisponible - ferme et rouvre le terminal, puis relance." }
    Ok "Git pret"

    # --- 2. Node.js (>= 22) ---
    Step "Verification de Node.js"
    $needNode = $true
    if (Have node) {
        $major = [int](((node -v) -replace '^v', '').Split('.')[0])
        if ($major -ge 22) { $needNode = $false } else { Warn "Node.js $(node -v) est trop ancien (22 minimum), mise a jour." }
    }
    if ($needNode) { Install-With-Winget "OpenJS.NodeJS.LTS" "Node.js" }
    if (-not (Have node)) { throw "Node.js indisponible - ferme et rouvre le terminal, puis relance." }
    Ok "Node.js pret ($(node -v))"

    # --- 3. pnpm ---
    Step "Verification de pnpm"
    if (-not (Have pnpm)) {
        Run "L'installation de pnpm" { npm install -g pnpm }
        Refresh-Path
        $npmBin = Join-Path $env:APPDATA "npm"
        if ((Test-Path $npmBin) -and ($env:Path -notlike "*$npmBin*")) { $env:Path += ";$npmBin" }
    }
    if (-not (Have pnpm)) { throw "pnpm indisponible - ferme et rouvre le terminal, puis relance." }
    Ok "pnpm pret"

    # --- 4. Telechargement / mise a jour ---
    if (Test-Path (Join-Path $InstallDir ".git")) {
        Step "Mise a jour de Vault ($InstallDir)"
        Run "La mise a jour" { git -c core.longpaths=true -C $InstallDir pull --ff-only }
    } else {
        Step "Telechargement de Vault dans $InstallDir"
        Run "Le telechargement" { git clone -c core.longpaths=true $RepoUrl $InstallDir }
    }
    if (-not (Test-Path (Join-Path $InstallDir "package.json"))) { throw "Le telechargement est incomplet." }
    Ok "Code recupere"

    # --- 5. Dependances ---
    Step "Installation des dependances (1 a 2 minutes)"
    Run "L'installation des dependances" { pnpm -C $InstallDir install }
    Ok "Dependances installees"

    # --- 6. Compilation ---
    Step "Compilation de Vault"
    Run "La compilation" { pnpm -C $InstallDir build }
    Ok "Compile"

    # --- 7. Injection dans Discord ---
    Step "Injection dans Discord"
    $discord = Get-Process -Name "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment" -ErrorAction SilentlyContinue
    if ($discord) {
        Warn "Discord doit etre ferme pour terminer l'installation."
        $close = $Yes
        if (-not $close) {
            $r = Read-Host "    Fermer Discord automatiquement maintenant ? (O/N)"
            $close = ($r -match '^(o|y)')
        }
        if (-not $close) { throw "Ferme Discord toi-meme, puis relance l'installeur." }
        $discord | Stop-Process -Force
        Start-Sleep -Seconds 2
        Ok "Discord ferme"
    }
    # injection non-interactive : --branch auto detecte Discord tout seul
    Run "L'injection dans Discord" { node "$InstallDir\scripts\runInstaller.mjs" -- --install --branch auto }

    Write-Host ""
    Write-Host "  =======================================================" -ForegroundColor Green
    Write-Host "   Installation terminee ! Rouvre Discord :" -ForegroundColor Green
    Write-Host "   Vault apparait dans Reglages (onglet 'Vault')." -ForegroundColor Green
    Write-Host "  =======================================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "   Vault se met a jour tout seul (notification 'Restart')." -ForegroundColor DarkGray
    Write-Host "   A la main :  pnpm -C `"$InstallDir`" update-vault" -ForegroundColor DarkGray
    Write-Host ""
}
catch {
    Write-Host ""
    Fail $_.Exception.Message
    Write-Host "    Journal : $LogFile" -ForegroundColor DarkGray
    # Dans l'assistant .exe, on remonte l'echec ; dans `irm | iex`, `exit` fermerait la console de l'utilisateur.
    if ($Yes) { exit 1 }
}
