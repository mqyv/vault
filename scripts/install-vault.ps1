#Requires -Version 5.1
<#
    Vault - installeur automatique.
    Installe les prerequis (Git, Node.js, pnpm) s'ils manquent, telecharge Vault,
    le compile et l'ajoute a Discord. Un seul fichier, zero config.

    Journal complet : %TEMP%\vault-install.log

    L'assistant .exe lance les etapes une par une (-Stage) pour faire avancer sa barre de progression.
    En cas d'echec, le script ecrit "DONE|1|CODE|detail" dans -ProgressFile ; l'assistant traduit CODE en message clair.
    En ligne de commande (irm | iex), tout s'enchaine.
#>

param(
    [string]$InstallDir = (Join-Path $HOME "Vault"),
    [switch]$Yes,  # auto-confirme (ferme Discord sans demander) - utilise par l'assistant .exe
    [string]$ProgressFile = "",
    [ValidateSet("all", "prereq", "clone", "deps", "build", "inject", "uninject")][string]$Stage = "all"
)

$ErrorActionPreference = "Stop"
$RepoUrl = "https://github.com/mqyv/vault.git"
$LogFile = Join-Path $env:TEMP "vault-install.log"
$Flavors = "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"

$Messages = @{
    NO_WINGET      = "Git ou Node.js manque et winget n'est pas disponible. Installe Node.js (nodejs.org) et Git (git-scm.com), puis relance."
    NO_GIT         = "Git n'a pas pu etre installe. Installe-le depuis git-scm.com, puis relance."
    NO_NODE        = "Node.js 22 ou plus n'a pas pu etre installe. Installe-le depuis nodejs.org, puis relance."
    NO_PNPM        = "pnpm n'a pas pu etre installe."
    CLONE          = "Le telechargement de Vault a echoue. Verifie ta connexion Internet."
    DEPS           = "L'installation des dependances a echoue. Verifie ta connexion Internet."
    BUILD          = "La compilation de Vault a echoue."
    NO_DISCORD     = "Discord est introuvable. Installe-le depuis discord.com, lance-le une fois, puis relance."
    DISCORD_LOCKED = "Discord est encore ouvert. Ferme-le completement (icone pres de l'horloge), puis relance."
    INJECT         = "Vault n'a pas pu etre ajoute a Discord."
}

function Log($m) { [IO.File]::AppendAllText($LogFile, "$m`r`n") }
function Step($m) { Write-Host "`n==> $m" -ForegroundColor Magenta; Log "==> $m" }
function Ok($m)   { Write-Host "    [ok] $m" -ForegroundColor Green; Log "[ok] $m" }
function Warn($m) { Write-Host "    [!] $m"  -ForegroundColor Yellow; Log "[!] $m" }

# Arrete l'installation avec un code connu (traduit par l'assistant) et un detail technique court.
function Die([string]$code, [string]$detail = "") { throw "$code|$detail" }

function Finish([string]$line) {
    if (-not $ProgressFile) { return }
    try { [IO.File]::WriteAllText($ProgressFile, "$line`r`n") } catch { }
}

function Refresh-Path {
    $m = [Environment]::GetEnvironmentVariable("Path", "Machine")
    $u = [Environment]::GetEnvironmentVariable("Path", "User")
    $env:Path = "$m;$u"
    $npmBin = Join-Path $env:APPDATA "npm"
    if ((Test-Path $npmBin) -and ($env:Path -notlike "*$npmBin*")) { $env:Path += ";$npmBin" }
}
function Have($cmd) { [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }
function Want([string]$name) { $Stage -eq "all" -or $Stage -eq $name }

# Lance une commande native, ecrit sa sortie dans le journal, et s'arrete avec $code si elle echoue.
# Windows PowerShell 5.1 traite tout texte ecrit sur stderr comme une erreur fatale ; or Git, pnpm et npm y ecrivent
# leur progression. On repasse donc en mode "Continue" le temps de la commande et on ne juge que le code de sortie.
function Run([string]$code, [scriptblock]$cmd) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = "Continue"
    $lines = New-Object System.Collections.Generic.List[string]
    try {
        & $cmd 2>&1 | ForEach-Object { $s = "$_"; Log $s; $lines.Add($s) }
        $exit = $LASTEXITCODE
    } finally {
        $ErrorActionPreference = $old
    }
    if ($exit -ne 0) {
        # detail : la derniere ligne qui ressemble a une erreur, sinon la derniere ligne non vide
        $hint = ($lines | Where-Object { $_ -match '(?i)\b(error|fatal|err_|failed|denied|not found)\b' } | Select-Object -Last 1)
        if (-not $hint) { $hint = ($lines | Where-Object { $_.Trim() } | Select-Object -Last 1) }
        $hint = "$hint".Trim()
        if ($hint.Length -gt 180) { $hint = $hint.Substring(0, 180) + "..." }
        Die $code $hint
    }
}

function Install-With-Winget($id, $code) {
    if (-not (Have winget)) { Die "NO_WINGET" }
    Step "Installation de $id (une fenetre Windows peut demander l'autorisation)"
    Run $code { winget install --id $id -e --silent --accept-package-agreements --accept-source-agreements }
    Refresh-Path
}

# --- Discord ---------------------------------------------------------------------------------

function Get-DiscordResources {
    foreach ($flavor in $Flavors) {
        $root = Join-Path $env:LOCALAPPDATA $flavor
        $app = Get-ChildItem -Path $root -Directory -Filter "app-*" -ErrorAction SilentlyContinue |
            Sort-Object { [version]($_.Name -replace '^app-', '' -replace '[^0-9.]', '') } -Descending -ErrorAction SilentlyContinue |
            Select-Object -First 1
        if ($app -and (Test-Path (Join-Path $app.FullName "resources"))) {
            [pscustomobject]@{ Flavor = $flavor; Root = $root; Resources = (Join-Path $app.FullName "resources") }
        }
    }
}

# Ferme Discord et attend que tous ses processus soient vraiment termines. Renvoie les variantes qui etaient ouvertes.
function Close-Discord {
    $running = @(Get-Process -Name $Flavors -ErrorAction SilentlyContinue)
    if (-not $running.Count) { return @() }
    if (-not $Yes) {
        $r = Read-Host "    Discord doit etre ferme. Le fermer maintenant ? (O/N)"
        if ($r -notmatch '^(o|y)') { Die "DISCORD_LOCKED" "fermeture refusee" }
    }
    $names = @($running | Select-Object -ExpandProperty ProcessName -Unique)
    $running | Stop-Process -Force -ErrorAction SilentlyContinue
    for ($i = 0; $i -lt 40; $i++) {
        if (-not (Get-Process -Name $Flavors -ErrorAction SilentlyContinue)) { Ok "Discord ferme"; return $names }
        Start-Sleep -Milliseconds 250
    }
    Die "DISCORD_LOCKED" "processus Discord toujours actifs"
}

# Les fichiers peuvent rester verrouilles une seconde apres la fermeture (antivirus, indexation) : on reessaie.
function Retry([scriptblock]$action, [string]$what) {
    for ($i = 1; $i -le 20; $i++) {
        try { & $action; return } catch {
            if ($i -eq 20) { Die "DISCORD_LOCKED" "$what : $($_.Exception.Message)" }
            Start-Sleep -Milliseconds 500
        }
    }
}

function Write-Utf8([string]$path, [string]$text) {
    [IO.File]::WriteAllText($path, $text, (New-Object Text.UTF8Encoding $false))
}

# Meme format que le patcheur integre de Vault (src/main/applyHostPatch.ts) :
#   resources\_app.asar  = Discord d'origine
#   resources\app.asar\  = dossier { package.json, index.js -> require("<Vault>\dist\desktop\patcher.js") }
# Si Discord est deja modifie (Vault, Equicord, Vencord...), on remplace simplement la cible de index.js.
function Inject-Discord([string]$patcher) {
    $targets = @(Get-DiscordResources)
    if (-not $targets.Count) { Die "NO_DISCORD" }
    $json = $patcher | ConvertTo-Json
    foreach ($t in $targets) {
        $asar = Join-Path $t.Resources "app.asar"
        $orig = Join-Path $t.Resources "_app.asar"
        if (-not (Test-Path $orig)) {
            if (-not (Test-Path $asar -PathType Leaf)) { Warn "$($t.Flavor) : installation incomplete, ignoree"; continue }
            Retry { Rename-Item -LiteralPath $asar -NewName "_app.asar" } "renommage de app.asar"
        } elseif (Test-Path $asar -PathType Leaf) {
            # Discord s'est mis a jour par-dessus une ancienne modification : on garde la version la plus recente.
            Retry { Remove-Item -LiteralPath $orig -Force; Rename-Item -LiteralPath $asar -NewName "_app.asar" } "remplacement de _app.asar"
        }
        Retry { New-Item -ItemType Directory -Force -Path $asar | Out-Null } "creation de app.asar"
        Retry { Write-Utf8 (Join-Path $asar "package.json") '{"name":"discord","main":"index.js"}' } "ecriture de package.json"
        Retry { Write-Utf8 (Join-Path $asar "index.js") "require($json);" } "ecriture de index.js"
        Log "Injection $($t.Flavor) : $($t.Resources) -> $patcher"
        Ok "Vault ajoute a $($t.Flavor)"
    }
}

function Test-Injected([string]$installDir) {
    $target = [IO.Path]::GetFullPath($installDir).TrimEnd('\').ToLowerInvariant()
    foreach ($t in Get-DiscordResources) {
        $index = Join-Path $t.Resources "app.asar\index.js"
        if ((Test-Path $index -PathType Leaf) -and (Get-Content $index -Raw).Replace('\\', '\').ToLowerInvariant().Contains($target)) { return $true }
    }
    return $false
}

function Uninject-Discord([string]$installDir) {
    $target = [IO.Path]::GetFullPath($installDir).TrimEnd('\').ToLowerInvariant()
    foreach ($t in Get-DiscordResources) {
        $asar = Join-Path $t.Resources "app.asar"
        $orig = Join-Path $t.Resources "_app.asar"
        $index = Join-Path $asar "index.js"
        if (-not ((Test-Path $orig) -and (Test-Path $index -PathType Leaf))) { continue }
        if (-not (Get-Content $index -Raw).Replace('\\', '\').ToLowerInvariant().Contains($target)) { continue }
        Retry { Remove-Item -LiteralPath $asar -Recurse -Force; Rename-Item -LiteralPath $orig -NewName "app.asar" } "restauration de Discord"
        Ok "Vault retire de $($t.Flavor)"
    }
}

function Start-DiscordAgain([string[]]$names) {
    foreach ($n in $names) {
        $update = Join-Path (Join-Path $env:LOCALAPPDATA $n) "Update.exe"
        if (Test-Path $update) { Start-Process -FilePath $update -ArgumentList "--processStart", "$n.exe" -ErrorAction SilentlyContinue }
    }
}

# --- Etapes ----------------------------------------------------------------------------------

try {
    if ($Stage -eq "all" -or $Stage -eq "prereq") {
        "=== Vault install $(Get-Date -Format s) ===" | Out-File $LogFile -Encoding utf8
    }
    Refresh-Path

    if ($Stage -eq "all") {
        Write-Host ""
        Write-Host "  ============================" -ForegroundColor Yellow
        Write-Host "      V A U L T  -  installer" -ForegroundColor Yellow
        Write-Host "  ============================" -ForegroundColor Yellow
    }

    if (Want "prereq") {
        Step "Verification de Git"
        if (-not (Have git)) { Install-With-Winget "Git.Git" "NO_GIT" }
        if (-not (Have git)) { Die "NO_GIT" "git introuvable apres installation" }
        Ok "Git pret"

        Step "Verification de Node.js"
        $needNode = $true
        if (Have node) {
            $major = [int](((node -v) -replace '^v', '').Split('.')[0])
            if ($major -ge 22) { $needNode = $false } else { Warn "Node.js $(node -v) est trop ancien (22 minimum)." }
        }
        if ($needNode) { Install-With-Winget "OpenJS.NodeJS.LTS" "NO_NODE" }
        if (-not (Have node)) { Die "NO_NODE" "node introuvable apres installation" }
        Ok "Node.js pret ($(node -v))"

        Step "Verification de pnpm"
        $pnpmOk = $false
        if (Have pnpm) { $pnpmOk = ([int]((pnpm -v).Split('.')[0]) -ge 9) }
        if (-not $pnpmOk) {
            Run "NO_PNPM" { npm install -g pnpm@latest }
            Refresh-Path
        }
        if (-not (Have pnpm)) { Die "NO_PNPM" "pnpm introuvable apres installation" }
        Ok "pnpm pret ($(pnpm -v))"
    }

    if (Want "clone") {
        if (Test-Path (Join-Path $InstallDir ".git")) {
            Step "Mise a jour de Vault ($InstallDir)"
            Run "CLONE" { git -C $InstallDir fetch --depth 1 origin main }
            Run "CLONE" { git -C $InstallDir reset --hard FETCH_HEAD }
        } else {
            Step "Telechargement de Vault dans $InstallDir"
            # Le dossier peut deja contenir des fichiers (le desinstalleur de l'assistant .exe), ce que `git clone`
            # refuse : on initialise le depot sur place, puis on recupere seulement la derniere version
            # (--depth 1 : pas les milliers de commits d'historique, bien plus rapide).
            New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
            Run "CLONE" { git -C $InstallDir init -q -b main }
            Run "CLONE" { git -C $InstallDir config core.longpaths true }
            Run "CLONE" { git -C $InstallDir remote add origin $RepoUrl }
            Run "CLONE" { git -C $InstallDir fetch --depth 1 origin main }
            Run "CLONE" { git -C $InstallDir checkout -f -B main FETCH_HEAD }
            Run "CLONE" { git -C $InstallDir branch --set-upstream-to=origin/main main }
        }
        if (-not (Test-Path (Join-Path $InstallDir "package.json"))) { Die "CLONE" "package.json absent" }
        Ok "Code recupere"
    }

    if (Want "deps") {
        Step "Installation des dependances"
        Run "DEPS" { pnpm -C $InstallDir install --frozen-lockfile --prefer-offline }
        Ok "Dependances installees"
    }

    if (Want "build") {
        Step "Compilation de Vault"
        Run "BUILD" { pnpm -C $InstallDir build }
        if (-not (Test-Path (Join-Path $InstallDir "dist\desktop\patcher.js"))) { Die "BUILD" "dist\desktop\patcher.js absent" }
        Ok "Compile"
    }

    if (Want "inject") {
        Step "Ajout de Vault a Discord"
        $patcher = Join-Path ([IO.Path]::GetFullPath($InstallDir)) "dist\desktop\patcher.js"
        if (-not (Test-Path $patcher)) { Die "BUILD" "dist\desktop\patcher.js absent" }
        $wasRunning = Close-Discord
        Inject-Discord $patcher
        if (-not (Test-Injected $InstallDir)) { Die "INJECT" "Discord ne pointe pas vers Vault apres l'injection" }
        Ok "Discord charge bien Vault"
        Start-DiscordAgain $wasRunning

        if ($Stage -eq "all") {
            Write-Host ""
            Write-Host "  =======================================================" -ForegroundColor Green
            Write-Host "   Installation terminee ! Ouvre Discord :" -ForegroundColor Green
            Write-Host "   Vault apparait dans Reglages (onglet 'Vault')." -ForegroundColor Green
            Write-Host "  =======================================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "   Vault se met a jour tout seul (notification 'Restart')." -ForegroundColor DarkGray
            Write-Host ""
        }
    }

    if ($Stage -eq "uninject") {
        Step "Retrait de Vault de Discord"
        $wasRunning = Close-Discord
        Uninject-Discord $InstallDir
        Start-DiscordAgain $wasRunning
    }

    Finish "DONE|0"
}
catch {
    $raw = "$($_.Exception.Message)"
    if ($raw -match '^([A-Z_]+)\|(.*)$') { $code = $Matches[1]; $detail = $Matches[2] } else { $code = "UNKNOWN"; $detail = $raw }
    $text = $Messages[$code]
    if (-not $text) { $text = "Erreur inattendue." }
    Write-Host ""
    Write-Host "    [x] $text" -ForegroundColor Red
    if ($detail) { Write-Host "        $detail" -ForegroundColor DarkGray }
    Write-Host "    Journal : $LogFile" -ForegroundColor DarkGray
    Log "[x] $code : $detail"
    Finish "DONE|1|$code|$detail"
    # Dans l'assistant .exe, on remonte l'echec ; dans `irm | iex`, `exit` fermerait la console de l'utilisateur.
    if ($Yes) { exit 1 }
}
