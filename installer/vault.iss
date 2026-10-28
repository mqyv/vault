; Vault - assistant d'installation Windows (Inno Setup)
; Compile avec : ISCC.exe installer\vault.iss  -> produit installer\Output\VaultSetup.exe

#define MyAppName "Vault"
#define MyAppVersion "1.15"
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
UninstallDisplayIcon={uninstallexe}
OutputDir=Output
OutputBaseFilename=VaultSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=vault.ico
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Messages]
WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nIl installe automatiquement tout le nécessaire (Git, Node.js, dépendances), télécharge Vault et l'ajoute à Discord. Une connexion Internet est requise.
FinishedLabel=Vault est installé ! Rouvre Discord : Vault apparaît dans tes Réglages (onglet « Vault »).

[Files]
; Le script de bootstrap est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[Code]
// Execute le script de bootstrap et affiche une erreur claire s'il echoue (au lieu de dire "installe" a tort).
procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode: Integer;
  Params: String;
begin
  if CurStep = ssPostInstall then
  begin
    WizardForm.StatusLabel.Caption := 'Installation de Vault (Git, Node.js, plugins, Discord)... cela peut prendre quelques minutes.';
    Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\install-vault.ps1') + '" -InstallDir "' + ExpandConstant('{app}') + '" -Yes';
    if (not Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode)) or (ResultCode <> 0) then
      MsgBox('L''installation de Vault a echoue.' + #13#10 + #13#10 +
        'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log') + #13#10 +
        'Tu peux aussi lancer la commande PowerShell du README pour voir les details.', mbError, MB_OK);
  end;
end;

[UninstallRun]
; Retire Vault de Discord proprement avant de supprimer les fichiers (best-effort).
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""try {{ node '{app}\scripts\runInstaller.mjs' -- --uninstall --branch auto }} catch {{}}"""; \
    Flags: runhidden; RunOnceId: "VaultUninject"
