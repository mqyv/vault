﻿; Vault - assistant d'installation Windows (Inno Setup)
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
french.WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nIl ajoute Git et Node.js seulement s'ils manquent, télécharge Vault, le compile et l'ajoute à Discord. Une connexion Internet est requise.%n%nDiscord sera fermé puis rouvert pendant l'installation : enregistre ce que tu es en train d'écrire.
french.FinishedLabel=Vault est installé et Discord le charge bien.%n%nOuvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».
french.FinishedLabelNoIcons=Vault est installé et Discord le charge bien.%n%nOuvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».

[Files]
; Le script de bootstrap est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[UninstallRun]
; Retire Vault de Discord (restaure le Discord d'origine) avant de supprimer les fichiers.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\install-vault.ps1"" -Stage uninject -InstallDir ""{app}"" -Yes"; \
    Flags: runhidden waituntilterminated; RunOnceId: "VaultUninject"

[UninstallDelete]
; Vault est téléchargé et compilé dans {app} par le script : Setup ne connaît pas ces fichiers, on supprime tout le dossier.
Type: filesandordirs; Name: "{app}"

[Code]
// L'installation est faite par scripts\install-vault.ps1, lancé en cinq étapes successives (prereq, clone, deps, build,
// inject). Setup traite ses messages pendant chaque attente de Exec : la fenêtre reste vivante et la barre avance
// après chaque étape. En cas d'échec, le script écrit "DONE|1|CODE|détail" dans un fichier lu ici.

var
  InstallFailed: Boolean;
  FailMsg: String;

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

function CodeText(Code: String): String;
begin
  if Code = 'NO_WINGET' then Result := 'Git ou Node.js manque et Windows ne permet pas de l''installer automatiquement. Installe Node.js (nodejs.org) et Git (git-scm.com), puis relance.'
  else if Code = 'NO_GIT' then Result := 'Git n''a pas pu être installé. Installe-le depuis git-scm.com, puis relance.'
  else if Code = 'NO_NODE' then Result := 'Node.js 22 ou plus n''a pas pu être installé. Installe-le depuis nodejs.org, puis relance.'
  else if Code = 'NO_PNPM' then Result := 'pnpm n''a pas pu être installé. Vérifie ta connexion Internet, puis relance.'
  else if Code = 'CLONE' then Result := 'Le téléchargement de Vault a échoué. Vérifie ta connexion Internet, puis relance.'
  else if Code = 'DEPS' then Result := 'L''installation des dépendances a échoué. Vérifie ta connexion Internet, puis relance.'
  else if Code = 'BUILD' then Result := 'La compilation de Vault a échoué.'
  else if Code = 'NO_DISCORD' then Result := 'Discord est introuvable. Installe-le depuis discord.com, lance-le une fois, puis relance.'
  else if Code = 'DISCORD_LOCKED' then Result := 'Discord est encore ouvert. Ferme-le complètement (icône près de l''horloge), puis relance.'
  else if Code = 'INJECT' then Result := 'Vault n''a pas pu être ajouté à Discord.'
  else Result := 'Erreur inattendue.';
end;

function StageText(Stage: String): String;
begin
  if Stage = 'prereq' then Result := 'Vérification de Git, Node.js et pnpm…'
  else if Stage = 'clone' then Result := 'Téléchargement de Vault…'
  else if Stage = 'deps' then Result := 'Installation des dépendances…'
  else if Stage = 'build' then Result := 'Compilation de Vault…'
  else if Stage = 'inject' then Result := 'Ajout de Vault à Discord (Discord sera fermé puis rouvert)…'
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
    Msg := CodeText('');
    if LoadStringsFromFile(ProgFile, Lines) and (GetArrayLength(Lines) > 0) then
    begin
      Line := Trim(Lines[0]);
      if Copy(Line, 1, 5) = 'DONE|' then
      begin
        NextField(Line);
        NextField(Line);
        Msg := CodeText(NextField(Line));
        if Line <> '' then Msg := Msg + #13#10 + 'Détail : ' + Line;
      end;
    end;
    // Pas d'Abort : la page de fin affiche l'échec (voir CurPageChanged), en plus de ce message.
    InstallFailed := True;
    FailMsg := Msg;
    MsgBox('L''installation de Vault a échoué.' + #13#10 + #13#10 + Msg + #13#10 + #13#10 +
      'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log'), mbError, MB_OK);
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if (CurPageID = wpFinished) and InstallFailed then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'L''installation de Vault a échoué';
    WizardForm.FinishedLabel.Caption := FailMsg + #13#10 + #13#10 +
      'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log');
    WizardForm.FinishedLabel.Height := WizardForm.FinishedLabel.Height * 3;
  end;
end;
