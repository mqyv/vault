#!/usr/bin/env bash
# Vault - installeur macOS (acces prive).
# Verifie ta cle d'acces aupres du service de Vault, telecharge Vault deja compile dans ~/Vault, et l'ajoute a Discord.
# Ni Git, ni Node.js, ni depot public : tout passe par le service, avec la cle. Rien n'est installe avec sudo.
#
#   Installer / mettre a jour :  curl -fsSL https://zjppxtnfohjvsjfqioqh.supabase.co/storage/v1/object/public/vault-public/install-vault.sh | bash
#   Desinstaller :               curl -fsSL https://zjppxtnfohjvsjfqioqh.supabase.co/storage/v1/object/public/vault-public/install-vault.sh | bash -s -- --uninstall
#
# La cle est demandee dans le Terminal. Pour ne pas la taper : VAULT_KEY=VAULT-... bash install-vault.sh
# Journal complet : $TMPDIR/vault-install.log
# Compatible avec le bash 3.2 livre avec macOS (pas de tableaux associatifs).

set -uo pipefail

GATE_URL="https://zjppxtnfohjvsjfqioqh.supabase.co/functions/v1/vault-release"
INSTALL_DIR="${VAULT_DIR:-$HOME/Vault}"
LOG="${TMPDIR:-/tmp}/vault-install.log"
FLAVORS="Discord|Discord PTB|Discord Canary|Discord Development"
MODE="install"
YES=0

for arg in "$@"; do
    case "$arg" in
        --uninstall) MODE="uninstall" ;;
        -y|--yes) YES=1 ;;
    esac
done

# --- affichage --------------------------------------------------------------------------------

if [ -t 1 ]; then C_STEP=$'\033[35m'; C_OK=$'\033[32m'; C_WARN=$'\033[33m'; C_ERR=$'\033[31m'; C_DIM=$'\033[90m'; C_END=$'\033[0m'
else C_STEP=""; C_OK=""; C_WARN=""; C_ERR=""; C_DIM=""; C_END=""; fi

log()  { printf '%s\n' "$*" >> "$LOG"; }
step() { printf '\n%s==> %s%s\n' "$C_STEP" "$*" "$C_END"; log "==> $*"; }
ok()   { printf '    %s[ok]%s %s\n' "$C_OK" "$C_END" "$*"; log "[ok] $*"; }
warn() { printf '    %s[!]%s %s\n' "$C_WARN" "$C_END" "$*"; log "[!] $*"; }

message() {
    case "$1" in
        NOT_MAC)        echo "Ce script est pour macOS. Sur Windows, utilise VaultSetup.exe." ;;
        NO_KEY)         echo "Il faut ta cle d'acces. Relance et colle-la quand elle est demandee." ;;
        BAD_KEY)        echo "La cle ne contient que des lettres, des chiffres et des tirets. Verifie ce que tu as colle." ;;
        NETWORK)        echo "Impossible de joindre le service de Vault. Verifie ta connexion Internet, puis relance." ;;
        REFUSED)        echo "Ta cle n'est pas acceptee (inexistante, retiree, terminee, pas encore activee avec /claim, ou liee a un autre ordinateur)." ;;
        NO_RELEASE)     echo "Aucune version de Vault n'est publiee pour l'instant. Reessaie un peu plus tard." ;;
        DOWNLOAD)       echo "Le telechargement de Vault a echoue. Verifie ta connexion Internet." ;;
        HASH)           echo "Le fichier telecharge est corrompu. Relance l'installation." ;;
        EXTRACT)        echo "Les fichiers de Vault n'ont pas pu etre installes." ;;
        NO_DISCORD)     echo "Discord est introuvable dans Applications. Installe-le depuis discord.com, lance-le une fois, puis relance." ;;
        DISCORD_OPEN)   echo "Discord est encore ouvert. Quitte-le (Cmd+Q), puis relance." ;;
        APP_MANAGEMENT) echo "macOS bloque la modification de Discord. Ouvre Reglages Systeme > Confidentialite et securite > Gestion des apps, active Terminal, puis relance." ;;
        NO_PERMISSION)  echo "Ton compte n'a pas le droit de modifier Discord. Relance depuis un compte administrateur." ;;
        INJECT)         echo "Vault n'a pas pu etre ajoute a Discord." ;;
        *)              echo "Erreur inattendue." ;;
    esac
}

die() {
    printf '\n    %s[x] %s%s\n' "$C_ERR" "$(message "$1")" "$C_END"
    [ -n "${2:-}" ] && printf '        %s%s%s\n' "$C_DIM" "$2" "$C_END"
    printf '    %sJournal : %s%s\n\n' "$C_DIM" "$LOG" "$C_END"
    log "[x] $1 : ${2:-}"
    exit 1
}

# Lance une commande, garde sa sortie dans le journal, et s'arrete avec le code donne si elle echoue.
run() {
    local code="$1"; shift
    local out
    out="$("$@" 2>&1)"; local status=$?
    printf '%s\n' "$out" >> "$LOG"
    if [ $status -ne 0 ]; then
        local hint
        hint="$(printf '%s\n' "$out" | grep -iE 'error|fatal|err_|failed|denied|not found' | tail -n 1)"
        [ -z "$hint" ] && hint="$(printf '%s\n' "$out" | grep -v '^[[:space:]]*$' | tail -n 1)"
        die "$code" "$(printf '%s' "$hint" | cut -c1-180)"
    fi
}

# Le script est souvent lu depuis `curl | bash` : les questions se posent sur le terminal, pas sur stdin.
ask() {
    [ "$YES" = 1 ] && return 0
    local answer=""
    printf '    %s (o/n) ' "$1"
    read -r answer < /dev/tty || return 1
    case "$answer" in o|O|y|Y|oui|yes) return 0 ;; *) return 1 ;; esac
}

# --- cle d'acces et service -------------------------------------------------------------------

KEY=""

# La cle vient de VAULT_KEY, sinon elle est demandee sur le terminal. Elle ne contient que A-Z a-z 0-9 et "-" :
# on refuse tout le reste, car elle est ecrite telle quelle dans du JSON.
get_key() {
    KEY="${VAULT_KEY:-}"
    if [ -z "$KEY" ]; then
        printf '\n    Colle ta cle d acces (VAULT-XXXXXX-XXXXXX-XXXXXX-XXXXXX) puis Entree : '
        read -r KEY < /dev/tty || die NO_KEY
    fi
    KEY="$(printf '%s' "$KEY" | tr -d '[:space:]')"
    [ -n "$KEY" ] || die NO_KEY
    case "$KEY" in *[!A-Za-z0-9-]*) die BAD_KEY ;; esac
}

# Meme valeur que le calcul de Vault dans Discord (src/main/licence.ts) : l'empreinte de l'identifiant de l'ordinateur.
device_id() {
    local uuid
    uuid="$(ioreg -rd1 -c IOPlatformExpertDevice 2>/dev/null | awk -F'"' '/IOPlatformUUID/ { print $4 }')"
    printf 'vault-device:%s' "$uuid" | shasum -a 256 | awk '{ print $1 }'
}

# Lecture d'une valeur texte et d'un "ok":true dans la reponse du service (JSON simple, sans jq).
json_str() { printf '%s' "$1" | grep -oE "\"$2\":\"[^\"]*\"" | head -n 1 | sed -E 's/^"[^"]*":"(.*)"$/\1/'; }
json_ok()  { printf '%s' "$1" | grep -q '"ok":true'; }

# --- Vault ------------------------------------------------------------------------------------

fetch_vault() {
    step "Verification de la cle et telechargement de Vault"
    local body answer reason url sha version
    body="{\"action\":\"download\",\"licence_key\":\"$KEY\",\"device\":\"$(device_id)\"}"
    answer="$(curl -fsS --max-time 30 -X POST -H 'Content-Type: application/json' -d "$body" "$GATE_URL" 2>>"$LOG")" || die NETWORK "service injoignable"
    log "reponse du service : $(printf '%s' "$answer" | sed -E 's/"url":"[^"]*"/"url":"..."/')"

    if ! json_ok "$answer"; then
        reason="$(json_str "$answer" reason)"
        [ "$reason" = "no_release" ] && die NO_RELEASE
        die REFUSED "$reason"
    fi
    url="$(json_str "$answer" url)"; sha="$(json_str "$answer" sha256)"; version="$(json_str "$answer" version)"
    [ -n "$url" ] && [ -n "$sha" ] || die DOWNLOAD "reponse incomplete"

    local tmp zip got
    tmp="$(mktemp -d)"; zip="$tmp/vault.zip"
    run DOWNLOAD curl -fsSL --max-time 300 -o "$zip" "$url"
    got="$(shasum -a 256 "$zip" | awk '{ print $1 }')"
    [ "$got" = "$sha" ] || { rm -rf "$tmp"; die HASH; }
    ok "Vault $version telecharge et verifie"

    step "Installation des fichiers dans $INSTALL_DIR"
    mkdir -p "$INSTALL_DIR" || die EXTRACT "$INSTALL_DIR"
    run EXTRACT unzip -q -o "$zip" -d "$INSTALL_DIR"
    rm -rf "$tmp"
    [ -f "$INSTALL_DIR/dist/desktop/patcher.js" ] || die EXTRACT "dist/desktop/patcher.js absent"
    # la cle reste dans le dossier de Vault : Vault la relit pour se mettre a jour et verifier l'acces
    ( umask 077; printf '{"key":"%s","verified":true}\n' "$KEY" > "$INSTALL_DIR/licence.json" ) || die EXTRACT "licence.json"
    ok "Fichiers installes"
}

# --- Discord ----------------------------------------------------------------------------------

# Dossiers Resources des Discord installes (une ligne par variante : "Nom|chemin")
discord_targets() {
    local IFS='|' flavor base
    for flavor in $FLAVORS; do
        for base in /Applications "$HOME/Applications"; do
            [ -d "$base/$flavor.app/Contents/Resources" ] && printf '%s|%s\n' "$flavor" "$base/$flavor.app/Contents/Resources"
        done
    done
}

running_discords() {
    local IFS='|' flavor
    for flavor in $FLAVORS; do pgrep -x "$flavor" >/dev/null 2>&1 && printf '%s\n' "$flavor"; done
}

WAS_RUNNING=""
close_discord() {
    WAS_RUNNING="$(running_discords)"
    [ -z "$WAS_RUNNING" ] && return 0
    ask "Discord doit etre ferme. Le fermer maintenant ?" || die DISCORD_OPEN "fermeture refusee"
    local flavor
    while IFS= read -r flavor; do osascript -e "quit app \"$flavor\"" >/dev/null 2>&1 || true; done <<< "$WAS_RUNNING"
    local i
    for i in $(seq 1 40); do
        [ -z "$(running_discords)" ] && { ok "Discord ferme"; return 0; }
        [ "$i" = 20 ] && while IFS= read -r flavor; do pkill -x "$flavor" 2>/dev/null || true; done <<< "$WAS_RUNNING"
        sleep 0.25
    done
    die DISCORD_OPEN "processus Discord toujours actifs"
}

reopen_discord() {
    local flavor
    [ -z "$WAS_RUNNING" ] && return 0
    while IFS= read -r flavor; do open -a "$flavor" >/dev/null 2>&1 || true; done <<< "$WAS_RUNNING"
}

# Verifie qu'on peut ecrire dans l'app avant d'y toucher, pour donner la bonne explication.
check_writable() {
    local res="$1" err
    err="$( { touch "$res/.vault-write-test" && rm -f "$res/.vault-write-test"; } 2>&1 )" && return 0
    case "$err" in
        *"Operation not permitted"*)
            open "x-apple.systempreferences:com.apple.settings.PrivacySecurity.extension?Privacy_AppBundles" >/dev/null 2>&1 || true
            die APP_MANAGEMENT "$res" ;;
        *) die NO_PERMISSION "$err" ;;
    esac
}

# Meme format que sur Windows et que le patcheur de Vault :
#   Resources/_app.asar = Discord d'origine
#   Resources/app.asar/ = dossier { package.json, index.js -> require("<Vault>/dist/desktop/patcher.js") }
inject() {
    local patcher="$INSTALL_DIR/dist/desktop/patcher.js"
    local targets; targets="$(discord_targets)"
    [ -n "$targets" ] || die NO_DISCORD
    # le chemin est ecrit entre guillemets dans un fichier JavaScript : on refuse ceux qui en contiennent (jamais le cas d'un dossier normal)
    case "$patcher" in *'"'*|*'\'*) die INJECT "chemin non pris en charge : $patcher" ;; esac
    local json="\"$patcher\""
    local flavor res asar orig
    while IFS='|' read -r flavor res; do
        check_writable "$res"
        asar="$res/app.asar"; orig="$res/_app.asar"
        if [ ! -e "$orig" ]; then
            if [ ! -f "$asar" ]; then warn "$flavor : installation incomplete, ignoree"; continue; fi
            run INJECT mv "$asar" "$orig"
        elif [ -f "$asar" ]; then
            # Discord s'est mis a jour par-dessus une ancienne modification : on garde la version la plus recente.
            run INJECT rm -f "$orig"
            run INJECT mv "$asar" "$orig"
        fi
        run INJECT mkdir -p "$asar"
        printf '%s' '{"name":"discord","main":"index.js"}' > "$asar/package.json" || die INJECT "package.json"
        printf 'require(%s);' "$json" > "$asar/index.js" || die INJECT "index.js"
        grep -qF "$INSTALL_DIR" "$asar/index.js" || die INJECT "$flavor ne pointe pas vers Vault"
        log "Injection $flavor : $res -> $patcher"
        ok "Vault ajoute a $flavor"
    done <<< "$targets"
}

uninject() {
    local flavor res asar orig removed=0
    while IFS='|' read -r flavor res; do
        [ -z "$res" ] && continue
        asar="$res/app.asar"; orig="$res/_app.asar"
        if ! { [ -f "$orig" ] && [ -f "$asar/index.js" ] && grep -qF "$INSTALL_DIR" "$asar/index.js"; }; then continue; fi
        check_writable "$res"
        run INJECT rm -rf "$asar"
        run INJECT mv "$orig" "$asar"
        ok "Vault retire de $flavor"; removed=1
    done <<< "$(discord_targets)"
    [ "$removed" = 1 ] || warn "Vault n'etait ajoute a aucun Discord."
}

# --- etapes -----------------------------------------------------------------------------------

printf '=== Vault %s %s ===\n' "$MODE" "$(date '+%Y-%m-%dT%H:%M:%S')" > "$LOG"
[ "$(uname -s)" = "Darwin" ] || die NOT_MAC "$(uname -s)"

printf '\n  %s============================%s\n' "$C_WARN" "$C_END"
printf '  %s    V A U L T  -  %s%s\n' "$C_WARN" "$([ "$MODE" = install ] && echo installer || echo desinstallation)" "$C_END"
printf '  %s============================%s\n' "$C_WARN" "$C_END"

if [ "$MODE" = "uninstall" ]; then
    step "Retrait de Vault de Discord"
    close_discord
    uninject
    reopen_discord
    printf '\n    Discord est revenu a la normale. Tu peux supprimer le dossier %s si tu veux.\n\n' "$INSTALL_DIR"
    exit 0
fi

get_key
fetch_vault
step "Ajout de Vault a Discord"
close_discord
inject
reopen_discord

printf '\n  %s=======================================================%s\n' "$C_OK" "$C_END"
printf '  %s Installation terminee ! Ouvre Discord :%s\n' "$C_OK" "$C_END"
printf "  %s Vault apparait dans Reglages (onglet 'Vault').%s\n" "$C_OK" "$C_END"
printf '  %s=======================================================%s\n\n' "$C_OK" "$C_END"
printf '  %sVault se met a jour tout seul tant que ton acces est valide. Apres une grosse mise a jour de Discord, relance cette commande.%s\n\n' "$C_DIM" "$C_END"
