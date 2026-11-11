#Requires -Version 5.1
<#
    Vault - installeur (acces prive).
    Verifie la cle aupres du service de Vault, telecharge Vault deja compile, l'installe et l'ajoute a Discord.
    Ni Git, ni Node.js, ni depot public : tout passe par le service, avec la cle.

    Journal complet : %TEMP%ault-install.log

    L'assistant .exe lance les etapes une par une (-Stage) pour faire avancer sa barre de progression et lui passe la cle
    dans un fichier (-KeyFile). En cas d'echec, le script ecrit "DONE|1|CODE|detail" dans -ProgressFile ; l'assistant
    traduit CODE en message clair.
#>

param(
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA "Vault"),
    [switch]$Yes,  # auto-confirme (ferme Discord sans demander) - utilise par l'assistant .exe
    [string]$ProgressFile = "",
    [string]$KeyFile = "",  # fichier qui contient la cle d'acces (ecrit par l'assistant .exe)
    [ValidateSet("all", "download", "extract", "inject", "uninject")][string]$Stage = "all"
)

$ErrorActionPreference = "Stop"
$GateUrl = "https://zjppxtnfohjvsjfqioqh.supabase.co/functions/v1/vault-release"
$LogFile = Join-Path $env:TEMP "vault-install.log"
$Flavors = "Discord", "DiscordPTB", "DiscordCanary", "DiscordDevelopment"

$Messages = @{
    NETWORK        = "Impossible de joindre le service de Vault. Verifie ta connexion Internet."
    REFUSED        = "Ta cle n'est pas acceptee."
    NO_RELEASE     = "Aucune version de Vault n'est publiee pour l'instant."
    DOWNLOAD       = "Le telechargement de Vault a echoue. Verifie ta connexion Internet."
    HASH           = "Le fichier telecharge est corrompu. Relance l'installation."
    EXTRACT        = "Les fichiers de Vault n'ont pas pu etre installes."
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

function Want([string]$name) { $Stage -eq "all" -or $Stage -eq $name }

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

# Meme valeur que le calcul de Vault dans Discord (src/main/licence.ts) : empreinte de l'identifiant de l'ordinateur.
function Get-DeviceId {
    $key = [Microsoft.Win32.RegistryKey]::OpenBaseKey("LocalMachine", "Registry64").OpenSubKey("SOFTWARE\Microsoft\Cryptography")
    $guid = if ($key) { "$($key.GetValue("MachineGuid"))" } else { "" }
    $bytes = [Text.Encoding]::UTF8.GetBytes("vault-device:$guid")
    return -join ([Security.Cryptography.SHA256]::Create().ComputeHash($bytes) | ForEach-Object { $_.ToString("x2") })
}

function Read-Key {
    if (-not $KeyFile -or -not (Test-Path $KeyFile)) { Die "REFUSED" "cle absente" }
    $k = (Get-Content -LiteralPath $KeyFile -Raw).Trim()
    if (-not $k) { Die "REFUSED" "cle vide" }
    return $k
}

function Call-Gate($body) {
    try {
        return Invoke-RestMethod -Method Post -Uri $GateUrl -ContentType "application/json" -Body ($body | ConvertTo-Json -Compress) -TimeoutSec 30
    } catch {
        Die "NETWORK" $_.Exception.Message
    }
}

$ZipPath = Join-Path $env:TEMP "vault-download.zip"

try {
    if ($Stage -eq "all" -or $Stage -eq "download") {
        "=== Vault install $(Get-Date -Format s) ===" | Out-File $LogFile -Encoding utf8
    }

    if (Want "download") {
        Step "Verification de la cle et telechargement de Vault"
        $answer = Call-Gate @{ action = "download"; licence_key = (Read-Key); device = (Get-DeviceId) }
        if (-not $answer.ok) {
            if ($answer.reason -eq "no_release") { Die "NO_RELEASE" }
            Die "REFUSED" "$($answer.reason)"
        }
        try { Invoke-WebRequest -Uri $answer.url -OutFile $ZipPath -UseBasicParsing -TimeoutSec 300 } catch { Die "DOWNLOAD" $_.Exception.Message }
        $hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $ZipPath).Hash.ToLowerInvariant()
        if ($hash -ne "$($answer.sha256)".ToLowerInvariant()) { Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue; Die "HASH" }
        Ok "Vault $($answer.version) telecharge et verifie"
    }

    if (Want "extract") {
        Step "Installation des fichiers dans $InstallDir"
        if (-not (Test-Path $ZipPath)) { Die "EXTRACT" "archive absente" }
        New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
        try { Expand-Archive -LiteralPath $ZipPath -DestinationPath $InstallDir -Force } catch { Die "EXTRACT" $_.Exception.Message }
        Remove-Item $ZipPath -Force -ErrorAction SilentlyContinue
        if (-not (Test-Path (Join-Path $InstallDir "dist\desktop\patcher.js"))) { Die "EXTRACT" "patcher.js absent" }
        # la cle reste dans le dossier de Vault : Vault la relit pour se mettre a jour et verifier l'acces
        Write-Utf8 (Join-Path $InstallDir "licence.json") ((@{ key = (Read-Key); verified = $true } | ConvertTo-Json -Compress) + "`n")
        Ok "Fichiers installes"
    }

    if (Want "inject") {
        Step "Ajout de Vault a Discord"
        $patcher = Join-Path ([IO.Path]::GetFullPath($InstallDir)) "dist\desktop\patcher.js"
        if (-not (Test-Path $patcher)) { Die "EXTRACT" "dist\desktop\patcher.js absent" }
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
