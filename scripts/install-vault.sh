#!/usr/bin/env bash
# Vault - installeur macOS.
# Installe ce qui manque (outils Git d'Apple, Node.js dans ~/.vault/node), telecharge Vault dans ~/Vault,
# le compile et l'ajoute a Discord. Rien n'est installe avec sudo.
#
#   Installer / mettre a jour :  curl -fsSL https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.sh | bash
#   Desinstaller :               curl -fsSL https://raw.githubusercontent.com/mqyv/vault/main/scripts/install-vault.sh | bash -s -- --uninstall
#
# Journal complet : $TMPDIR/vault-install.log
# Compatible avec le bash 3.2 livre avec macOS (pas de tableaux associatifs).

set -uo pipefail

REPO_URL="https://github.com/mqyv/vault.git"
INSTALL_DIR="${VAULT_DIR:-$HOME/Vault}"
NODE_DIR="$HOME/.vault/node"
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

# Discord lance par le Finder n'a pas le PATH du Terminal : la mise a jour integree de Vault cherche aussi Node ici.
export PATH="$NODE_DIR/bin:/opt/homebrew/bin:/usr/local/bin:$PATH"

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
        NO_GIT)         echo "Les outils de developpement d'Apple (Git) manquent. Une fenetre vient de s'ouvrir : clique sur Installer, attends la fin, puis relance cette commande." ;;
        NO_NODE)        echo "Node.js n'a pas pu etre telecharge. Verifie ta connexion Internet, puis relance." ;;
        CLONE)          echo "Le telechargement de Vault a echoue. Verifie ta connexion Internet." ;;
        DEPS)           echo "L'installation des dependances a echoue. Verifie ta connexion Internet." ;;
        BUILD)          echo "La compilation de Vault a echoue." ;;
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

# --- prerequis --------------------------------------------------------------------------------

node_major() { node -v 2>/dev/null | sed -E 's/^v([0-9]+).*/\1/'; }

ensure_git() {
    step "Verification de Git"
    if ! xcode-select -p >/dev/null 2>&1 || ! git --version >/dev/null 2>&1; then
        xcode-select --install >/dev/null 2>&1 || true
        die NO_GIT "xcode-select --install"
    fi
    ok "Git pret ($(git --version | awk '{print $3}'))"
}

ensure_node() {
    step "Verification de Node.js"
    local major; major="$(node_major)"
    if [ -n "$major" ] && [ "$major" -ge 22 ]; then ok "Node.js pret ($(node -v))"; return; fi
    [ -n "$major" ] && warn "Node.js $(node -v) est trop ancien (22 minimum) : installation d'une version a part pour Vault."

    # Node.js officiel, sans sudo, dans ~/.vault/node (verifie avec la somme SHA-256 publiee par nodejs.org)
    local arch; case "$(uname -m)" in arm64) arch="arm64" ;; *) arch="x64" ;; esac
    local base="https://nodejs.org/dist/latest-v22.x"
    local sums; sums="$(curl -fsSL "$base/SHASUMS256.txt")" || die NO_NODE "SHASUMS256.txt"
    local file; file="$(printf '%s\n' "$sums" | grep -oE "node-v22\.[0-9.]+-darwin-$arch\.tar\.gz" | head -n 1)"
    [ -n "$file" ] || die NO_NODE "archive darwin-$arch introuvable"
    local tmp; tmp="$(mktemp -d)"
    run NO_NODE curl -fsSL -o "$tmp/$file" "$base/$file"
    local want; want="$(printf '%s\n' "$sums" | grep " $file\$" | awk '{print $1}')"
    local got; got="$(shasum -a 256 "$tmp/$file" | awk '{print $1}')"
    [ "$want" = "$got" ] || die NO_NODE "somme de controle differente"
    rm -rf "$NODE_DIR" && mkdir -p "$NODE_DIR"
    run NO_NODE tar -xzf "$tmp/$file" -C "$NODE_DIR" --strip-components 1
    rm -rf "$tmp"
    hash -r
    [ "$(node_major)" -ge 22 ] 2>/dev/null || die NO_NODE "node introuvable apres installation"
    ok "Node.js pret ($(node -v), dans $NODE_DIR)"
}

# pnpm : celui de l'utilisateur s'il est recent, sinon la version demandee par Vault via npx (rien d'installe globalement)
PNPM_VERSION=""
P() {
    if command -v pnpm >/dev/null 2>&1 && [ "$(pnpm -v 2>/dev/null | cut -d. -f1)" -ge 9 ] 2>/dev/null; then
        pnpm "$@"
    else
        npx --yes "pnpm@${PNPM_VERSION:-latest}" "$@"
    fi
}

# --- Vault ------------------------------------------------------------------------------------

fetch_vault() {
    if [ -d "$INSTALL_DIR/.git" ]; then
        step "Mise a jour de Vault ($INSTALL_DIR)"
        run CLONE git -C "$INSTALL_DIR" fetch --depth 1 origin main
        run CLONE git -C "$INSTALL_DIR" reset --hard FETCH_HEAD
    else
        step "Telechargement de Vault dans $INSTALL_DIR"
        mkdir -p "$INSTALL_DIR"
        run CLONE git -C "$INSTALL_DIR" init -q -b main
        run CLONE git -C "$INSTALL_DIR" remote add origin "$REPO_URL"
        run CLONE git -C "$INSTALL_DIR" fetch --depth 1 origin main
        run CLONE git -C "$INSTALL_DIR" checkout -f -B main FETCH_HEAD
        run CLONE git -C "$INSTALL_DIR" branch --set-upstream-to=origin/main main
    fi
    [ -f "$INSTALL_DIR/package.json" ] || die CLONE "package.json absent"
    PNPM_VERSION="$(sed -nE 's/.*"packageManager": *"pnpm@([^"]+)".*/\1/p' "$INSTALL_DIR/package.json")"
    ok "Code recupere"
}

build_vault() {
    step "Installation des dependances"
    run DEPS P -C "$INSTALL_DIR" install --frozen-lockfile --prefer-offline
    ok "Dependances installees"
    step "Compilation de Vault"
    run BUILD P -C "$INSTALL_DIR" build
    [ -f "$INSTALL_DIR/dist/desktop/patcher.js" ] || die BUILD "dist/desktop/patcher.js absent"
    ok "Compile"
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
    local json; json="$(node -e 'process.stdout.write(JSON.stringify(process.argv[1]))' "$patcher")"
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

ensure_git
ensure_node
fetch_vault
build_vault
step "Ajout de Vault a Discord"
close_discord
inject
reopen_discord

printf '\n  %s=======================================================%s\n' "$C_OK" "$C_END"
printf '  %s Installation terminee ! Ouvre Discord :%s\n' "$C_OK" "$C_END"
printf "  %s Vault apparait dans Reglages (onglet 'Vault').%s\n" "$C_OK" "$C_END"
printf '  %s=======================================================%s\n\n' "$C_OK" "$C_END"
printf '  %sVault se met a jour tout seul. Apres une grosse mise a jour de Discord, relance cette commande.%s\n\n' "$C_DIM" "$C_END"
