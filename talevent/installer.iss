#define AppVersion "0.2.0"
[Setup]
AppId={{2A130FC1-8159-42D7-AD94-2A5041B10E04}
AppName=TALEVENT
AppVersion={#AppVersion}
AppPublisher=MyTalonet
DefaultDirName={localappdata}\Programs\TALEVENT
DefaultGroupName=TALEVENT
PrivilegesRequired=lowest
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=..\dist
OutputBaseFilename=TALEVENT-Setup
Compression=lzma2
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\TALEVENT.exe
CloseApplications=yes
SetupMutex=MyTalonet.TALEVENT.Setup
AppMutex=Local\MyTalonet.TALEVENT

[Languages]
Name: "italian"; MessagesFile: "compiler:Languages\Italian.isl"

[Tasks]
Name: "desktopicon"; Description: "Crea un collegamento sul desktop"; Flags: unchecked
Name: "startup"; Description: "Avvia TALEVENT all'accesso a Windows per ricevere promemoria"; Flags: unchecked

[Files]
Source: "..\dist\TALEVENT\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "LICENSE-Whisper.txt"; DestDir: "{app}"; Flags: ignoreversion
Source: "README.md"; DestDir: "{app}"; Flags: ignoreversion

[Icons]
Name: "{group}\TALEVENT"; Filename: "{app}\TALEVENT.exe"; AppUserModelID: "MyTalonet.TALEVENT"
Name: "{autodesktop}\TALEVENT"; Filename: "{app}\TALEVENT.exe"; Tasks: desktopicon; AppUserModelID: "MyTalonet.TALEVENT"
Name: "{userstartup}\TALEVENT"; Filename: "{app}\TALEVENT.exe"; Tasks: startup; AppUserModelID: "MyTalonet.TALEVENT"

[Run]
Filename: "{app}\TALEVENT.exe"; Description: "Avvia TALEVENT"; Flags: nowait postinstall skipifsilent
