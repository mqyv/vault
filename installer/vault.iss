; Vault - assistant d'installation Windows (Inno Setup)
; Compile avec : ISCC.exe installer\vault.iss  -> produit installer\Output\VaultSetup.exe
; Ce fichier doit rester en UTF-8 AVEC BOM (accents dans les textes).
;
; Vault est privé : l'assistant demande la clé d'accès, la fait vérifier par le service de Vault, puis télécharge Vault déjà
; compilé (aucun Git, aucun Node.js, aucun dépôt public) et l'ajoute à Discord.

#define MyAppName "Vault"
#define MyAppVersion "1.15"
#define MyAppPublisher "Vault"
#define MyAppURL "https://vaultcord.fr"
#define GateUrl "https://zjppxtnfohjvsjfqioqh.supabase.co/functions/v1/vault-release"
#define DiscordInvite "https://discord.gg/q97W6EfMV6"

[Setup]
AppId={{B9F2B6C4-VAULT-4A21-9E33-VAULTINSTALL01}}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
DefaultDirName={localappdata}\Vault
DisableProgramGroupPage=yes
DisableWelcomePage=no
DisableDirPage=yes
UninstallDisplayName={#MyAppName}
UninstallDisplayIcon={uninstallexe}
OutputDir=Output
OutputBaseFilename=VaultSetup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern dark
SetupIconFile=vault.ico
WizardImageFile=wizard-large.bmp,wizard-large-2x.bmp
WizardSmallImageFile=wizard-small.bmp,wizard-small-64.bmp,wizard-small-80.bmp,wizard-small-110.bmp
PrivilegesRequired=lowest
; Inno Setup active par défaut la protection Windows "Redirection Guard", héritée par les processus lancés par Setup.
RedirectionGuard=no
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible

[Languages]
Name: "french"; MessagesFile: "compiler:Languages\French.isl"

[Messages]
french.WelcomeLabel2=Cet assistant va installer [name] sur ton ordinateur.%n%nVault est privé : il te faut la clé personnelle que VaultBot t'a envoyée en message privé quand ta demande a été acceptée.%n%nDiscord sera fermé puis rouvert pendant l'installation : enregistre ce que tu es en train d'écrire.
french.FinishedLabel=Vault est installé et Discord le charge bien.%n%nOuvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».
french.FinishedLabelNoIcons=Vault est installé et Discord le charge bien.%n%nOuvre Discord : Vault apparaît dans les Réglages, onglet « Vault ».

[Files]
; Le script d'installation est exécuté pendant l'installation puis supprimé.
Source: "..\scripts\install-vault.ps1"; DestDir: "{tmp}"; Flags: ignoreversion deleteafterinstall

[Icons]
; Désinstallation en un clic depuis le menu Démarrer (en plus de Paramètres > Applications).
Name: "{autoprograms}\Désinstaller Vault"; Filename: "{uninstallexe}"

[UninstallRun]
; Retire Vault de Discord (restaure le Discord d'origine) avant de supprimer les fichiers.
Filename: "powershell.exe"; \
    Parameters: "-NoProfile -ExecutionPolicy Bypass -File ""{app}\scripts\install-vault.ps1"" -Stage uninject -InstallDir ""{app}"" -Yes"; \
    Flags: runhidden waituntilterminated; RunOnceId: "VaultUninject"

[UninstallDelete]
; Les fichiers de Vault sont téléchargés dans {app} par le script : Setup ne les connaît pas, on supprime tout le dossier.
Type: filesandordirs; Name: "{app}"

[Code]
// 1. Une page demande la clé et la fait vérifier par le service (bouton Suivant).
// 2. L'installation est faite par scripts\install-vault.ps1 en trois étapes (download, extract, inject) : Setup traite ses
//    messages pendant chaque attente de Exec, donc la fenêtre reste vivante et la barre avance après chaque étape.
//    En cas d'échec, le script écrit "DONE|1|CODE|détail" dans un fichier lu ici.

const
  GateUrl = '{#GateUrl}';

var
  InstallFailed: Boolean;
  FailMsg: String;
  KeyPage: TWizardPage;
  KeyEdit: TNewEdit;
  KeyStatus: TNewStaticText;
  VerifiedKey: String;

// ---- utilitaires -----------------------------------------------------------------------------------------------------

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

// Même valeur que le calcul de Vault dans Discord : l'empreinte de l'identifiant de l'ordinateur, jamais l'identifiant.
function DeviceId(): String;
var
  Guid: String;
begin
  if not RegQueryStringValue(HKLM64, 'SOFTWARE\Microsoft\Cryptography', 'MachineGuid', Guid) then Guid := '';
  Result := GetSHA256OfString('vault-device:' + Guid);
end;

function KeyIsClean(S: String): Boolean;
var
  I: Integer;
  C: Char;
begin
  Result := Length(S) > 0;
  for I := 1 to Length(S) do
  begin
    C := S[I];
    if not (((C >= 'A') and (C <= 'Z')) or ((C >= 'a') and (C <= 'z')) or ((C >= '0') and (C <= '9')) or (C = '-')) then
      Result := False;
  end;
end;

function JsonString(Json, Name: String): String;
var
  P: Integer;
  Rest: String;
begin
  Result := '';
  P := Pos('"' + Name + '":"', Json);
  if P = 0 then Exit;
  Rest := Copy(Json, P + Length(Name) + 4, Length(Json));
  P := Pos('"', Rest);
  if P > 0 then Result := Copy(Rest, 1, P - 1);
end;

function GateCheck(Key: String; var Response: String): Boolean;
var
  Http: Variant;
begin
  Result := False;
  Response := '';
  try
    Http := CreateOleObject('WinHttp.WinHttpRequest.5.1');
    Http.SetTimeouts(8000, 8000, 15000, 15000);
    Http.Open('POST', GateUrl, False);
    Http.SetRequestHeader('Content-Type', 'application/json');
    Http.Send('{"action":"check","licence_key":"' + Key + '","device":"' + DeviceId() + '"}');
    Response := Http.ResponseText;
    Result := (Http.Status = 200);
  except
    Result := False;
  end;
end;

function ReasonText(Reason: String): String;
begin
  if Reason = 'unknown' then Result := 'Cette clé n''existe pas. Vérifie que tu l''as bien copiée en entier.'
  else if Reason = 'revoked' then Result := 'Cette clé a été retirée.'
  else if Reason = 'expired' then Result := 'Cet accès est terminé.'
  else if Reason = 'other_device' then Result := 'Cette clé est déjà liée à un autre ordinateur.'
  else if Reason = 'not_claimed' then Result := 'Cette clé n''a pas encore été activée : tape /claim avec elle sur le serveur Discord d''abord.'
  else Result := 'Cette clé n''est pas acceptée.';
end;

function UntilText(Response: String): String;
var
  P: Integer;
  D: String;
begin
  P := Pos('"access_until":"', Response);
  if P = 0 then
  begin
    Result := 'Accès sans limite de durée.';
    Exit;
  end;
  D := Copy(Response, P + 16, 10);  // AAAA-MM-JJ
  Result := 'Accès valable jusqu''au ' + Copy(D, 9, 2) + '/' + Copy(D, 6, 2) + '/' + Copy(D, 1, 4) + '.';
end;

procedure SetStatus(Text: String);
begin
  KeyStatus.Caption := Text;
end;

// ---- page de la clé ------------------------------------------------------------------------------------------------------

procedure KeyChanged(Sender: TObject);
begin
  KeyStatus.Caption := '';
  WizardForm.NextButton.Enabled := Length(Trim(KeyEdit.Text)) >= 10;
end;

procedure HelpClick(Sender: TObject);
var
  ErrorCode: Integer;
begin
  ShellExec('open', '{#DiscordInvite}', '', '', SW_SHOWNORMAL, ewNoWait, ErrorCode);
end;

procedure InitializeWizard;
var
  Intro, Help: TNewStaticText;
begin
  KeyPage := CreateCustomPage(wpWelcome, 'Ta clé d''accès',
    'Colle la clé que VaultBot t''a envoyée en message privé.');

  Intro := TNewStaticText.Create(KeyPage);
  Intro.Parent := KeyPage.Surface;
  Intro.WordWrap := True;
  Intro.Left := 0;
  Intro.Top := 0;
  Intro.Width := KeyPage.SurfaceWidth;
  Intro.Caption := 'Elle ressemble à VAULT-XXXXXX-XXXXXX-XXXXXX-XXXXXX. Elle ne marche que pour toi et sur cet ordinateur : ne la partage pas.';

  KeyEdit := TNewEdit.Create(KeyPage);
  KeyEdit.Parent := KeyPage.Surface;
  KeyEdit.Left := 0;
  KeyEdit.Top := Intro.Top + Intro.Height + ScaleY(18);
  KeyEdit.Width := KeyPage.SurfaceWidth;
  KeyEdit.Font.Name := 'Consolas';
  KeyEdit.Font.Size := 12;
  KeyEdit.OnChange := @KeyChanged;

  KeyStatus := TNewStaticText.Create(KeyPage);
  KeyStatus.Parent := KeyPage.Surface;
  KeyStatus.WordWrap := True;
  KeyStatus.Left := 0;
  KeyStatus.Top := KeyEdit.Top + KeyEdit.Height + ScaleY(14);
  KeyStatus.Width := KeyPage.SurfaceWidth;
  KeyStatus.Font.Style := [fsBold];
  KeyStatus.Caption := '';

  Help := TNewStaticText.Create(KeyPage);
  Help.Parent := KeyPage.Surface;
  Help.WordWrap := True;
  Help.Left := 0;
  Help.Top := KeyPage.SurfaceHeight - ScaleY(36);
  Help.Width := KeyPage.SurfaceWidth;
  Help.Cursor := crHand;
  Help.Font.Style := [fsUnderline];
  Help.Caption := 'Pas de clé ? Demande l''accès sur le Discord de Vault.';
  Help.OnClick := @HelpClick;
end;

procedure CurPageChanged(CurPageID: Integer);
begin
  if CurPageID = KeyPage.ID then
  begin
    WizardForm.NextButton.Enabled := Length(Trim(KeyEdit.Text)) >= 10;
    WizardForm.ActiveControl := KeyEdit;
  end;

  if (CurPageID = wpFinished) and InstallFailed then
  begin
    WizardForm.FinishedHeadingLabel.Caption := 'L''installation de Vault a échoué';
    WizardForm.FinishedLabel.Caption := FailMsg + #13#10 + #13#10 +
      'Journal : ' + ExpandConstant('{%TEMP}\vault-install.log');
    WizardForm.FinishedLabel.Height := WizardForm.FinishedLabel.Height * 3;
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  Key, Response: String;
begin
  Result := True;
  if CurPageID <> KeyPage.ID then Exit;

  Key := Trim(KeyEdit.Text);
  if not KeyIsClean(Key) then
  begin
    SetStatus('✖  La clé ne contient que des lettres, des chiffres et des tirets. Vérifie ce que tu as collé.');
    Result := False;
    Exit;
  end;

  SetStatus('Vérification de ta clé…');
  WizardForm.NextButton.Enabled := False;
  WizardForm.Repaint;

  if not GateCheck(Key, Response) then
  begin
    SetStatus('✖  Impossible de joindre le service de Vault. Vérifie ta connexion Internet, puis réessaie.');
    WizardForm.NextButton.Enabled := True;
    Result := False;
    Exit;
  end;

  if Pos('"ok":true', Response) = 0 then
  begin
    SetStatus('✖  ' + ReasonText(JsonString(Response, 'reason')));
    WizardForm.NextButton.Enabled := True;
    Result := False;
    Exit;
  end;

  VerifiedKey := Key;
  SetStatus('✔  Clé valide. ' + UntilText(Response));
end;

// ---- installation ----------------------------------------------------------------------------------------------------------

function CodeText(Code: String): String;
begin
  if Code = 'NETWORK' then Result := 'Impossible de joindre le service de Vault. Vérifie ta connexion Internet, puis relance.'
  else if Code = 'REFUSED' then Result := 'Ta clé n''est plus acceptée (retirée, terminée ou liée à un autre ordinateur).'
  else if Code = 'NO_RELEASE' then Result := 'Aucune version de Vault n''est publiée pour l''instant. Réessaie un peu plus tard.'
  else if Code = 'DOWNLOAD' then Result := 'Le téléchargement de Vault a échoué. Vérifie ta connexion Internet, puis relance.'
  else if Code = 'HASH' then Result := 'Le fichier téléchargé est corrompu. Relance l''installation.'
  else if Code = 'EXTRACT' then Result := 'Les fichiers de Vault n''ont pas pu être installés.'
  else if Code = 'NO_DISCORD' then Result := 'Discord est introuvable. Installe-le depuis discord.com, lance-le une fois, puis relance.'
  else if Code = 'DISCORD_LOCKED' then Result := 'Discord est encore ouvert. Ferme-le complètement (icône près de l''horloge), puis relance.'
  else if Code = 'INJECT' then Result := 'Vault n''a pas pu être ajouté à Discord.'
  else Result := 'Erreur inattendue.';
end;

function StageText(Stage: String): String;
begin
  if Stage = 'download' then Result := 'Vérification de ta clé et téléchargement de Vault…'
  else if Stage = 'extract' then Result := 'Installation des fichiers…'
  else if Stage = 'inject' then Result := 'Ajout de Vault à Discord (Discord sera fermé puis rouvert)…'
  else Result := 'Installation de Vault…';
end;

function RunStage(Stage, ProgFile, KeyFile: String; Position: Integer): Boolean;
var
  ResultCode: Integer;
  Params: String;
begin
  WizardForm.StatusLabel.Caption := StageText(Stage);
  Params := '-NoProfile -ExecutionPolicy Bypass -File "' + ExpandConstant('{tmp}\install-vault.ps1') +
    '" -InstallDir "' + ExpandConstant('{app}') + '" -Yes -Stage ' + Stage + ' -ProgressFile "' + ProgFile +
    '" -KeyFile "' + KeyFile + '"';
  if not Exec('powershell.exe', Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
    ResultCode := 1;
  Result := (ResultCode = 0);
  if Result then WizardForm.ProgressGauge.Position := Position;
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  ProgFile, KeyFile, Msg, Line: String;
  Lines: TArrayOfString;
  Stages: array of String;
  Marks: array of Integer;
  I: Integer;
  Ok: Boolean;
begin
  if CurStep <> ssPostInstall then Exit;

  ProgFile := ExpandConstant('{tmp}\vault-progress.txt');
  KeyFile := ExpandConstant('{tmp}\vault-key.txt');
  DeleteFile(ProgFile);
  SaveStringToFile(KeyFile, VerifiedKey, False);

  SetArrayLength(Stages, 3);
  SetArrayLength(Marks, 3);
  Stages[0] := 'download'; Marks[0] := 500;
  Stages[1] := 'extract';  Marks[1] := 750;
  Stages[2] := 'inject';   Marks[2] := 1000;

  WizardForm.ProgressGauge.Min := 0;
  WizardForm.ProgressGauge.Max := 1000;
  WizardForm.ProgressGauge.Position := 0;
  WizardForm.FilenameLabel.Caption := '';

  Ok := True;
  I := 0;
  while Ok and (I < 3) do
  begin
    Ok := RunStage(Stages[I], ProgFile, KeyFile, Marks[I]);
    I := I + 1;
  end;
  DeleteFile(KeyFile);

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
