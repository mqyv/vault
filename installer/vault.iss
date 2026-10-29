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
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
french.WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nIl ajoute Git et Node.js seulement s'ils manquent, télécharge Vault, le compile et l'ajoute à Discord. Une connexion Internet est requise.%n%nDiscord sera fermé pendant l'installation : enregistre ce que tu es en train d'écrire.
french.FinishedLabel=Vault est installé. Rouvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».

[Files]
; Le script de bootstrap est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[UninstallRun]
; Retire Vault de Discord proprement avant de supprimer les fichiers (best-effort).
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -Command ""try {{ node '{app}\scripts\runInstaller.mjs' -- --uninstall --branch auto }} catch {{}}"""; \
    Flags: runhidden; RunOnceId: "VaultUninject"

[Code]
// Le script PowerShell écrit son avancement dans un fichier : "RUN|pourcentage|plafond|étape" puis "DONE|code|message".
// L'assistant le lit toutes les 200 ms, affiche l'étape en français et fait avancer la barre doucement
// jusqu'au plafond de l'étape tant que la suivante n'a pas commencé.

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

function StepText(Code: String): String;
begin
  if Code = 'GIT' then Result := 'Vérification de Git…'
  else if Code = 'NODE' then Result := 'Vérification de Node.js…'
  else if Code = 'PNPM' then Result := 'Vérification de pnpm…'
  else if Code = 'CLONE' then Result := 'Téléchargement de Vault…'
  else if Code = 'DEPS' then Result := 'Installation des dépendances (environ une minute)…'
  else if Code = 'BUILD' then Result := 'Compilation de Vault…'
  else if Code = 'CLOSE' then Result := 'Fermeture de Discord…'
  else if Code = 'INJECT' then Result := 'Ajout de Vault à Discord…'
  else Result := 'Installation de Vault…';
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ResultCode, Pct, Cap, Shown, Limit, Ticks, ExitCode: Integer;
  Params, ProgFile, Line, LastLine, Kind, Code, Msg: String;
  Lines: TArrayOfString;
  Done: Boolean;
begin
  if CurStep <> ssPostInstall then Exit;

  ProgFile := ExpandConstant('{tmp}\vault-progress.txt');
  DeleteFile(ProgFile);
  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\install-vault.ps1') +
    '" -InstallDir "' + ExpandConstant('{app}') + '" -Yes -ProgressFile "' + ProgFile + '"';

  WizardForm.ProgressGauge.Min := 0;
  WizardForm.ProgressGauge.Max := 1000;
  WizardForm.ProgressGauge.Position := 0;
  WizardForm.FilenameLabel.Caption := '';
  WizardForm.StatusLabel.Caption := 'Préparation…';

  if not Exec('powershell.exe', Params, '', SW_HIDE, ewNoWait, ResultCode) then
  begin
    MsgBox('Impossible de lancer PowerShell.' + #13#10 + 'Lance plutôt la commande PowerShell indiquée dans le README.', mbError, MB_OK);
    Abort;
  end;

  Shown := 0;
  Limit := 0;
  Ticks := 0;
  LastLine := '';
  Done := False;
  ExitCode := 1;
  Msg := 'Aucune réponse du script d''installation.';

  while (not Done) and (Ticks < 9000) do // 30 minutes au maximum
  begin
    Sleep(200);
    Application.ProcessMessages;
    Ticks := Ticks + 1;

    if LoadStringsFromFile(ProgFile, Lines) and (GetArrayLength(Lines) > 0) then
    begin
      Line := Trim(Lines[0]);
      if Line <> LastLine then
      begin
        LastLine := Line;
        Kind := NextField(Line);
        if Kind = 'DONE' then
        begin
          ExitCode := StrToIntDef(NextField(Line), 1);
          if Line <> '' then Msg := Line;
          Done := True;
        end
        else if Kind = 'RUN' then
        begin
          Pct := StrToIntDef(NextField(Line), 0);
          Cap := StrToIntDef(NextField(Line), Pct);
          Code := NextField(Line);
          if Pct * 10 > Shown then Shown := Pct * 10;
          Limit := Cap * 10;
          WizardForm.StatusLabel.Caption := StepText(Code);
        end;
      end;
    end;

    if Shown < Limit then Shown := Shown + 1; // 0,5 % par seconde jusqu'au plafond de l'étape
    WizardForm.ProgressGauge.Position := Shown;
  end;

  if Done and (ExitCode = 0) then
  begin
    WizardForm.ProgressGauge.Position := 1000;
    WizardForm.StatusLabel.Caption := 'Terminé.';
  end
  else
  begin
    MsgBox('L''installation de Vault a échoué.' + #13#10 + #13#10 + Msg + #13#10 + #13#10 +
      'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log') + #13#10 +
      'Tu peux aussi lancer la commande PowerShell du README pour voir les détails.', mbError, MB_OK);
    Abort;
  end;
end;
