; Vault - assistant d'installation Windows (Inno Setup)
; Compile avec : ISCC.exe installer\vault.iss  -> produit installer\Output\VaultSetup.exe

#define MyAppName "Vault"
#define MyAppVersion "1.0"
#define MyAppPublisher "Vault"
#define MyAppURL "https://github.com/mqyv/vault"

[Setup]
AppId={{B9F2B6C4-VAULT-4A21-9E33-VAULTINSTALL01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Vault
DisableProgramGroupPage=yes
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={app}\install-vault.ps1
OutputDir=Output
OutputBaseFilename=VaultSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Messages]
WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nIl installe automatiquement tout le nécessaire (Git, Node.js, dépendances), télécharge Vault et l'ajoute à Discord. Une connexion Internet est requise.
FinishedLabel=Vault est installé ! Rouvre Discord : Vault apparaît dans tes Réglages (onglet « Vault »).

[Files]
; Le script de bootstrap est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[Run]
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{tmp}\install-vault.ps1"" -InstallDir ""{app}"" -Yes"; \
    StatusMsg: "Installation de Vault (Git, Node.js, plugins, Discord)... cela peut prendre quelques minutes."; \
    Flags: runhidden waituntilterminated

[UninstallRun]
; Retire Vault de Discord proprement avant de supprimer les fichiers (best-effort).
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""try {{ pnpm -C '{app}' uninject }} catch {{}}"""; \
    Flags: runhidden; RunOnceId: "VaultUninject"
