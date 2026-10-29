#Requires -Version 5.1
<#
    Vault - installeur automatique.
    Installe les prerequis (Git, Node.js, pnpm) s'ils manquent, telecharge Vault,
    le compile et l'injecte dans Discord. Un seul fichier, zero config.

    Journal complet : %TEMP%\vault-install.log
    -ProgressFile : utilise par l'assistant .exe pour afficher une barre de progression.
#>

param(
    [string]$InstallDir = (Join-Path $HOME "Vault"),
    [switch]$Yes,  # auto-confirme (ferme Discord sans demander) - utilise par l'assistant .exe
    [string]$ProgressFile = ""
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/mqyv/vault.git"
$LogFile = Join-Path $env:TEMP "vault-install.log"

function Log($m) { [IO.File]::AppendAllText($LogFile, "$m`r`n") }
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Magenta; Log "==> $m" }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green; Log "[ok] $m" }
function Warn($m) { Write-Host "    [!] $m"  -ForegroundColor Yellow; Log "[!] $m" }
function Fail($m) { Write-Host "    [x] $m"  -ForegroundColor Red; Log "[x] $m" }

# Ecrit l'avancement pour l'assistant : "pourcentage|plafond|code" (le plafond sert a faire avancer la barre doucement pendant les etapes longues).
function Progress([int]$pct, [int]$ceiling, [string]$code) {
    if (-not $ProgressFile) { return }
    try { [IO.File]::WriteAllText($ProgressFile, "RUN|$pct|$ceiling|$code`r`n") } catch { }
}
function Finish([int]$exitCode, [string]$message) {
    if (-not $ProgressFile) { return }
    try { [IO.File]::WriteAllText($ProgressFile, "DONE|$exitCode|$message`r`n") } catch { }
}

function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

# Lance une commande native, ecrit sa sortie dans le journal et leve une erreur si elle echoue.
# Windows PowerShell 5.1 traite tout texte ecrit sur stderr comme une erreur fatale ; or Git, pnpm et npm y ecrivent
# leur progression. On repasse donc en mode "Continue" le temps de la commande et on ne juge que le code de sortie.
function Run([string]$what, [scriptblock]$cmd) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    try {
        & $cmd 2>&1 | ForEach-Object { Log "$_" }
        $code = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $old
    }
    if ($code -ne 0) { throw "$what a echoue (code $code). Details : $LogFile" }
}

function Install-With-Winget($id, $name) {
    if (-not (Have winget)) {
        throw "winget est introuvable. Installe $name a la main (git-scm.com / nodejs.org), puis relance."
    }
    Step "Installation de $name (une fenetre Windows peut demander l'autorisation)"
    Run "L'installation de $name" { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements }
    Refresh-Path
}

try {
    "=== Vault install $(Get-Date -Format s) ===" | Out-File $LogFile -Encoding utf8

    Write-Host ""
    Write-Host "  ============================" -ForegroundColor Red
    Write-Host "      V A U L T  -  installer" -ForegroundColor Red
    Write-Host "  ============================" -ForegroundColor Red

    # --- 1. Git ---
    Progress 2 6 "GIT"
    Step "Verification de Git"
    if (-not (Have git)) { Install-With-Winget "Git.Git" "Git" }
    if (-not (Have git)) { throw "Git indisponible - ferme et rouvre le terminal, puis relance." }
    Ok "Git pret"

    # --- 2. Node.js (>= 22) ---
    Progress 6 9 "NODE"
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
    Progress 9 12 "PNPM"
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
    Progress 12 36 "CLONE"
    if (Test-Path (Join-Path $InstallDir ".git")) {
        Step "Mise a jour de Vault ($InstallDir)"
        Run "La mise a jour" { git -c core.longpaths=true -C $InstallDir pull --ff-only }
    } else {
        Step "Telechargement de Vault dans $InstallDir"
        # --depth 1 : seulement la derniere version, pas les 8000 commits d'historique (bien plus rapide).
        Run "Le telechargement" { git clone --depth 1 -c core.longpaths=true $RepoUrl $InstallDir }
    }
    if (-not (Test-Path (Join-Path $InstallDir "package.json"))) { throw "Le telechargement est incomplet." }
    Ok "Code recupere"

    # --- 5. Dependances ---
    Progress 36 72 "DEPS"
    Step "Installation des dependances (1 a 2 minutes)"
    Run "L'installation des dependances" { pnpm -C $InstallDir install --frozen-lockfile --prefer-offline }
    Ok "Dependances installees"

    # --- 6. Compilation ---
    Progress 72 88 "BUILD"
    Step "Compilation de Vault"
    Run "La compilation" { pnpm -C $InstallDir build }
    Ok "Compile"

    # --- 7. Injection dans Discord ---
    Progress 88 91 "CLOSE"
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
    Progress 91 99 "INJECT"
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
    Finish 0 ""
}
catch {
    Write-Host ""
    Fail $_.Exception.Message
    Write-Host "    Journal : $LogFile" -ForegroundColor DarkGray
    Finish 1 $_.Exception.Message
    # Dans l'assistant .exe, on remonte l'echec ; dans `irm | iex`, `exit` fermerait la console de l'utilisateur.
    if ($Yes) { exit 1 }
}
