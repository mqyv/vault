; Vault - assistant d'installation Windows (Inno Setup)
; Compile avec : ISCC.exe installer\vault.iss  -> produit installer\Output\VaultSetup.exe
; Ce fichier doit rester en UTF-8 AVEC BOM (accents dans les textes).

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
DisableDirPage=yes
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={uninstallexe}
OutputDir=Output
OutputBaseFilename=VaultSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
SetupIconFile=vault.ico
WizardImageFile=wizard-large.bmp,wizard-large-2x.bmp
WizardSmallImageFile=wizard-small.bmp,wizard-small-64.bmp,wizard-small-80.bmp,wizard-small-110.bmp
PrivilegesRequired=lowest
; Inno Setup active par défaut la protection Windows "Redirection Guard", héritée par les processus lancés par Setup :
; pnpm ne peut alors plus traverser les liens de dossiers qu'il crée dans node_modules (os error 448).
RedirectionGuard=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
french.WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nIl ajoute Git et Node.js seulement s'ils manquent, télécharge Vault, le compile et l'ajoute à Discord. Une connexion Internet est requise.%n%nDiscord sera fermé pendant l'installation : enregistre ce que tu es en train d'écrire.
french.FinishedLabel=Vault est installé. Rouvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».
french.FinishedLabelNoIcons=Vault est installé et Discord le charge bien.%n%nRouvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».

[Files]
; Le script de bootstrap est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[UninstallRun]
; Retire Vault de Discord proprement avant de supprimer les fichiers (best-effort).
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""try {{ node '{app}\scripts\runInstaller.mjs' -- --uninstall --branch auto }} catch {{}}"""; \
    Flags: runhidden; RunOnceId: "VaultUninject"

[Code]
var
  InstallFailed: Boolean;
  FailMsg: String;

// L'installation est faite par scripts\install-vault.ps1, lancé en cinq étapes successives (prereq, clone, deps, build,
// inject). Setup traite ses messages pendant chaque attente de Exec : la fenêtre reste vivante et la barre avance
// après chaque étape. Si une étape échoue, le script écrit son message dans un fichier lu ici.

function NextField(var S: String): String;
var
  P: Integer;
begin
  P := Pos('|', S);
  if P = 0 then
  begin
    Result := S;
    S := '';
  end
  else
  begin
    Result := Copy(S, 1, P - 1);
    S := Copy(S, P + 1, Length(S));
  end;
end;

function StageText(Stage: String): String;
begin
  if Stage = 'prereq' then Result := 'Vérification de Git, Node.js et pnpm…'
  else if Stage = 'clone' then Result := 'Téléchargement de Vault…'
  else if Stage = 'deps' then Result := 'Installation des dépendances (environ une minute)…'
  else if Stage = 'build' then Result := 'Compilation de Vault…'
  else if Stage = 'inject' then Result := 'Fermeture de Discord et ajout de Vault…'
  else Result := 'Installation de Vault…';
end;

function RunStage(Stage, ProgFile: String; Position: Integer): Boolean;
var
  ResultCode: Integer;
  Params: String;
begin
  WizardForm.StatusLabel.Caption := StageText(Stage);
  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\install-vault.ps1') +
    '" -InstallDir "' + ExpandConstant('{app}') + '" -Yes -Stage ' + Stage + ' -ProgressFile "' + ProgFile + '"';
  if not Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    ResultCode := 1;
  Result := (ResultCode = 0);
  if Result then WizardForm.ProgressGauge.Position := Position;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ProgFile, Msg, Line: String;
  Lines: TArrayOfString;
  Stages: array of String;
  Marks: array of Integer;
  I: Integer;
  Ok: Boolean;
begin
  if CurStep <> ssPostInstall then Exit;

  ProgFile := ExpandConstant('{tmp}\vault-progress.txt');
  DeleteFile(ProgFile);

  SetArrayLength(Stages, 5);
  SetArrayLength(Marks, 5);
  Stages[0] := 'prereq'; Marks[0] := 100;
  Stages[1] := 'clone';  Marks[1] := 300;
  Stages[2] := 'deps';   Marks[2] := 700;
  Stages[3] := 'build';  Marks[3] := 880;
  Stages[4] := 'inject'; Marks[4] := 1000;

  WizardForm.ProgressGauge.Min := 0;
  WizardForm.ProgressGauge.Max := 1000;
  WizardForm.ProgressGauge.Position := 0;
  WizardForm.FilenameLabel.Caption := '';

  Ok := True;
  I := 0;
  while Ok and (I < 5) do
  begin
    Ok := RunStage(Stages[I], ProgFile, Marks[I]);
    I := I + 1;
  end;

  if Ok then
  begin
    WizardForm.StatusLabel.Caption := 'Terminé.';
  end
  else
  begin
    Msg := 'Une étape de l''installation s''est arrêtée.';
    if LoadStringsFromFile(ProgFile, Lines) and (GetArrayLength(Lines) > 0) then
    begin
      Line := Trim(Lines[0]);
      if Copy(Line, 1, 5) = 'DONE|' then
      begin
        NextField(Line);
        NextField(Line);
        if Line <> '' then Msg := Line;
      end;
    end;
    // On ne s'arrête pas avec Abort : la page de fin affiche l'échec (voir CurPageChanged), en plus de ce message.
    InstallFailed := True;
    FailMsg := Msg;
    MsgBox('L''installation de Vault a échoué.' + #13#10 + #13#10 + Msg + #13#10 + #13#10 +
      'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log') + #13#10 +
      'Tu peux aussi lancer la commande PowerShell du README pour voir les détails.', mbError, MB_OK);
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and InstallFailed then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'L''installation de Vault a échoué';
    WizardForm.FinishedLabel.Caption :=
      'Vault n''a pas été installé correctement.' + #13#10 + #13#10 +
      'Raison : ' + FailMsg + #13#10 + #13#10 +
      'Journal complet : ' + ExpandConstant('{%TEMP}\vault-install.log') + #13#10 + #13#10 +
      'Tu peux relancer l''installeur, ou envoyer ce journal pour obtenir de l''aide.';
    WizardForm.FinishedLabel.Height := WizardForm.FinishedLabel.Height * 3;
  end;
end;
